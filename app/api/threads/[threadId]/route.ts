import { NextResponse } from "next/server";
import { ddb, AI_HISTORY_TABLE } from "@/lib/dynamo";
import { BatchWriteCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

export const runtime = "nodejs";

const USER_ID = process.env.AI_HISTORY_USER_ID || "demo";

/*Type representing Dynamo message keys.*/
type MsgKey = { pk: string; sk: string };

/*Remove a thread and all its messages*/
export async function DELETE(
  _req: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    /*Messages are stored under a thread partition key.*/
    const threadPk = `THREAD#${params.threadId}`;

    /* Query Dynamo for all message keys */
    const msgRes = await ddb.send(
      new QueryCommand({
        TableName: AI_HISTORY_TABLE,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": threadPk },

        /*
          ProjectionExpression limits returned attributes.
          This reduces payload size and improves performance.
        */
        ProjectionExpression: "pk, sk"
      })
    );

    /* Normalize result */
    const keys = (msgRes.Items ?? []) as MsgKey[];

    /* DynamoDB BatchWrite can only delete 25 items at once.*/
    for (let i = 0; i < keys.length; i += 25) {
      const chunk = keys.slice(i, i + 25);

      await ddb.send(
        new BatchWriteCommand({
          RequestItems: {
            [AI_HISTORY_TABLE]: chunk.map((k) => ({
              DeleteRequest: {
                Key: { pk: k.pk, sk: k.sk }
              }
            }))
          }
        })
      );
    }

    /* Delete thread metadata item */
    await ddb.send(
      new DeleteCommand({
        TableName: AI_HISTORY_TABLE,
        Key: {
          pk: `USER#${USER_ID}`,
          sk: `THREAD#${params.threadId}`
        }
      })
    );

    /* Return success response */
    return NextResponse.json({
      ok: true,
      deletedMessages: keys.length
    });

  } catch (err) {
    console.error("THREAD DELETE ERROR:", err);

    return NextResponse.json(
      { error: "Failed to delete thread" },
      { status: 500 }
    );
  }
}
