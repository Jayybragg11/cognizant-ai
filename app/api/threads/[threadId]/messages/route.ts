import { NextResponse } from "next/server";
import { ddb, AI_HISTORY_TABLE } from "@/lib/dynamo";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const runtime = "nodejs";
const USER_ID = process.env.AI_HISTORY_USER_ID || "demo";

/*Load all messages for a specific thread */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ threadId: string }> }
) {
  try {
    /* Next.js 15+: params is async */
    const { threadId } = await ctx.params;

    const pk = `THREAD#${threadId}`;

    const result = await ddb.send(
      new QueryCommand({
        TableName: AI_HISTORY_TABLE,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ScanIndexForward: true // oldest -> newest
      })
    );

    return NextResponse.json({ messages: result.Items ?? [] });
  } catch (err) {
    console.error("MESSAGES GET ERROR:", err);
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }
}

/* POST: save one prompt/response pair to the thread */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ threadId: string }> }
) {
  try {
    /* Next.js 15+: params is async */
    const { threadId } = await ctx.params;

    const { prompt, response, latencyMs, model } = await req.json();

    if (!prompt || !response) {
      return NextResponse.json(
        { error: "prompt and response are required" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const msgItem = {
      pk: `THREAD#${threadId}`,
      sk: `MSG#${now}`,
      createdAt: now,
      prompt,
      response,
      latencyMs: latencyMs ?? null,
      model: model || "gpt-4o-mini"
    };

    /* write message */
    await ddb.send(
      new PutCommand({
        TableName: AI_HISTORY_TABLE,
        Item: msgItem
      })
    );

    /* update sidebar thread metadata */
    await ddb.send(
      new UpdateCommand({
        TableName: AI_HISTORY_TABLE,
        Key: {
          pk: `USER#${USER_ID}`,
          sk: `THREAD#${threadId}`
        },
        UpdateExpression: "SET updatedAt = :u, title = if_not_exists(title, :t)",
        ExpressionAttributeValues: {
          ":u": now,
          ":t": (prompt || "New chat").slice(0, 32)
        }
      })
    );

    return NextResponse.json({ ok: true, message: msgItem });
  } catch (err) {
    console.error("MESSAGES POST ERROR:", err);
    return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
  }
}
