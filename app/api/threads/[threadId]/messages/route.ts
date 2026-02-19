import { NextResponse } from "next/server";
import { ddb, AI_HISTORY_TABLE } from "@/lib/dynamo";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const runtime = "nodejs";

/*Temporary user identifier.*/
const USER_ID = process.env.AI_HISTORY_USER_ID || "demo";

/*Load all messages for a specific thread */
export async function GET(
  _req: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    /*Messages are stored under a thread partition key */
    const pk = `THREAD#${params.threadId}`;

    const result = await ddb.send(
      new QueryCommand({
        TableName: AI_HISTORY_TABLE,

        /*
          Fetch all items belonging to this thread
        */
        KeyConditionExpression: "pk = :pk",

        ExpressionAttributeValues: { ":pk": pk },

        /*
          true = chronological order
          (oldest messages first for chat UI)
        */
        ScanIndexForward: true
      })
    );

    /* Return messages list to frontend */
    return NextResponse.json({ messages: result.Items ?? [] });

  } catch (err) {
    console.error("MESSAGES GET ERROR:", err);

    return NextResponse.json(
      { error: "Failed to load messages" },
      { status: 500 }
    );
  }
}

/* Save one prompt + response pair to thread called after AI finishes generating response*/
export async function POST(
  req: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    /*
      Extract message data from request body
    */
    const { prompt, response, latencyMs, model } = await req.json();

    /* Basic validation */
    if (!prompt || !response) {
      return NextResponse.json(
        { error: "prompt and response are required" },
        { status: 400 }
      );
    }

    /* timestamp used for sorting + unique message key */
    const now = new Date().toISOString();

    /*Message item structure*/
    const msgItem = {
      pk: `THREAD#${params.threadId}`, // thread partition
      sk: `MSG#${now}`,                 // unique message key
      createdAt: now,
      prompt,
      response,
      latencyMs: latencyMs ?? null,
      model: model || "gpt-4o-mini"
    };

    /* Save message to DynamoDB */
    await ddb.send(
      new PutCommand({
        TableName: AI_HISTORY_TABLE,
        Item: msgItem
      })
    );

    /*Update thread metadata so sidebar reflects activity*/
    await ddb.send(
      new UpdateCommand({
        TableName: AI_HISTORY_TABLE,
        Key: {
          pk: `USER#${USER_ID}`,
          sk: `THREAD#${params.threadId}`
        },
        UpdateExpression:
          "SET updatedAt = :u, title = if_not_exists(title, :t)",

        ExpressionAttributeValues: {
          ":u": now,
          ":t": (prompt || "New chat").slice(0, 32) // short preview title
        }
      })
    );

    /* Send saved message back to frontend */
    return NextResponse.json({ ok: true, message: msgItem });

  } catch (err) {
    console.error("MESSAGES POST ERROR:", err);

    return NextResponse.json(
      { error: "Failed to save message" },
      { status: 500 }
    );
  }
}
