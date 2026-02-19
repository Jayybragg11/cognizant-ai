import { NextResponse } from "next/server";
import { ddb, AI_HISTORY_TABLE } from "@/lib/dynamo";
import {
  BatchWriteCommand,
  DeleteCommand,
  QueryCommand
} from "@aws-sdk/lib-dynamodb";

/*
  Force Node runtime because AWS SDK (DynamoDB) needs Node APIs.
*/
export const runtime = "nodejs";

/*
  Temporary user identifier.
  In production this would come from auth/session.
*/
const USER_ID = process.env.AI_HISTORY_USER_ID || "demo";

/* We only need pk + sk to delete Dynamo items */
type MsgKey = { pk: string; sk: string };

/* ======================================================
   DELETE → Remove a thread AND all messages inside it
   (Next.js 15+ fix: ctx.params is async, so we await it)
====================================================== */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ threadId: string }> }
) {
  try {
    /* Next.js 15+: params is a Promise */
    const { threadId } = await ctx.params;

    /* Messages live under this partition */
    const threadPk = `THREAD#${threadId}`;

    /* 1) Grab all message keys for this thread (pk/sk only) */
    const msgRes = await ddb.send(
      new QueryCommand({
        TableName: AI_HISTORY_TABLE,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": threadPk },

        // only return keys (faster + smaller payload)
        ProjectionExpression: "pk, sk"
      })
    );

    const keys = (msgRes.Items ?? []) as MsgKey[];

    /* 2) Batch delete messages (Dynamo max is 25 per BatchWrite) */
    for (let i = 0; i < keys.length; i += 25) {
      const chunk = keys.slice(i, i + 25);

      await ddb.send(
        new BatchWriteCommand({
          RequestItems: {
            [AI_HISTORY_TABLE]: chunk.map((k) => ({
              DeleteRequest: { Key: { pk: k.pk, sk: k.sk } }
            }))
          }
        })
      );
    }

    /* 3) Delete the thread metadata item (removes it from sidebar) */
    await ddb.send(
      new DeleteCommand({
        TableName: AI_HISTORY_TABLE,
        Key: {
          pk: `USER#${USER_ID}`,
          sk: `THREAD#${threadId}`
        }
      })
    );

    return NextResponse.json({ ok: true, deletedMessages: keys.length });
  } catch (err) {
    console.error("THREAD DELETE ERROR:", err);
    return NextResponse.json(
      { error: "Failed to delete thread" },
      { status: 500 }
    );
  }
}
