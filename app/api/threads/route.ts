import { NextResponse } from "next/server";
import { ddb, AI_HISTORY_TABLE } from "@/lib/dynamo";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

/* Force this route to run in Node runtime */
export const runtime = "nodejs";

/*Temporary user identifier.*/
const USER_ID = process.env.AI_HISTORY_USER_ID || "demo";

/* Load all chat threads*/
export async function GET() {
  try {
    /* Partition key for this user’s threads */
    const pk = `USER#${USER_ID}`;

    /*Query DynamoDB for items belonging to this user*/
    const result = await ddb.send(
      new QueryCommand({
        TableName: AI_HISTORY_TABLE,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :t)",
        ExpressionAttributeValues: {
          ":pk": pk,
          ":t": "THREAD#"
        },

        /*descending order by SK*/
        ScanIndexForward: false
      })
    );

    /* Dynamo returns undefined if no results */
    const threads = result.Items ?? [];

    /*
      Dynamo sorts by sort key (sk), not by updatedAt,
      so we manually sort here so most recently used
      threads show first in sidebar.
    */
    threads.sort((a: any, b: any) =>
      (b.updatedAt || "").localeCompare(a.updatedAt || "")
    );

    /* Return thread list to frontend */
    return NextResponse.json({ threads });

  } catch (err) {
    console.error("THREADS GET ERROR:", err);

    /* Standard API error response */
    return NextResponse.json(
      { error: "Failed to load threads" },
      { status: 500 }
    );
  }
}

/*Create new thread */
export async function POST() {
  try {
    /* Generate unique thread id*/
    const threadId = crypto.randomUUID();

    /* timestamp for creation + sorting */
    const now = new Date().toISOString();

    /*Thread metadata item stored under USER partition*/
    const item = {
      pk: `USER#${USER_ID}`,        // user partition
      sk: `THREAD#${threadId}`,     // thread identifier
      threadId,                     // easier access for frontend
      title: "New chat",            // default name
      createdAt: now,
      updatedAt: now                // used for sorting sidebar
    };

    /* Save thread metadata */
    await ddb.send(
      new PutCommand({
        TableName: AI_HISTORY_TABLE,
        Item: item
      })
    );

    /* Return newly created thread to UI */
    return NextResponse.json({ ok: true, thread: item });

  } catch (err) {
    console.error("THREADS POST ERROR:", err);

    return NextResponse.json(
      { error: "Failed to create thread" },
      { status: 500 }
    );
  }
}
