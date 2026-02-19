import { NextResponse } from "next/server";
import { ddb, AI_HISTORY_TABLE } from "@/lib/dynamo";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const runtime = "nodejs";

/* fallback demo user */
const USER_ID = process.env.AI_HISTORY_USER_ID || "demo";

/* =========================================================
   GET → load all messages for a thread
========================================================= */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    /* unwrap params (Next.js 15+ requirement) */
    const { threadId } = await params;

    /* messages stored under thread partition */
    const pk = `THREAD#${threadId}`;

    const result = await ddb.send(
      new QueryCommand({
        TableName: AI_HISTORY_TABLE,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ScanIndexForward: true // oldest → newest
      })
    );

    return NextResponse.json({
      messages: result.Items ?? []
    });

  } catch (err) {
    console.error("MESSAGES GET ERROR:", err);
    return NextResponse.json(
      { error: "Failed to load messages" },
      { status: 500 }
    );
  }
}

/* =========================================================
   POST → save prompt + response to thread
========================================================= */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    /* unwrap dynamic route params */
    const { threadId } = await params;

    /* parse request body */
    const { prompt, response, latencyMs, model } = await req.json();

    /* basic validation */
    if (!prompt || !response) {
      return NextResponse.json(
        { error: "prompt and response are required" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    /* ========================================
       1) Save message item
    ======================================== */

    const msgItem = {
      pk: `THREAD#${threadId}`,
      sk: `MSG#${now}`,
      createdAt: now,
      prompt,
      response,
      latencyMs: latencyMs ?? null,
      model: model || "gpt-4o-mini"
    };

    await ddb.send(
      new PutCommand({
        TableName: AI_HISTORY_TABLE,
        Item: msgItem
      })
    );

    /* ========================================
       2) Update thread metadata
       - updatedAt pushes thread to top
       - title = first prompt if not set
    ======================================== */

    await ddb.send(
      new UpdateCommand({
        TableName: AI_HISTORY_TABLE,
        Key: {
          pk: `USER#${USER_ID}`,
          sk: `THREAD#${threadId}`
        },
        UpdateExpression:
          "SET updatedAt = :u, title = if_not_exists(title, :t)",
        ExpressionAttributeValues: {
          ":u": now,
          ":t": (prompt || "New chat").slice(0, 32)
        }
      })
    );

    /* success */
    return NextResponse.json({
      ok: true,
      message: msgItem
    });

  } catch (err) {
    console.error("MESSAGES POST ERROR:", err);

    return NextResponse.json(
      { error: "Failed to save message" },
      { status: 500 }
    );
  }
}
