import { NextResponse } from "next/server";
import { ddb, AI_HISTORY_TABLE } from "@/lib/dynamo";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const USER_ID = process.env.AI_HISTORY_USER_ID || "demo";

/* return latest history for this user */
export async function GET() {
    try {
  
      /* create partition key  */
      const pk = `USER#${USER_ID}`;
  
      /* search DynamoDB for latest history entries */
      const result = await ddb.send(
        new QueryCommand({
          TableName: AI_HISTORY_TABLE,
  
          /* only get records matching this user's partition key */
          KeyConditionExpression: "pk = :pk",
  
          /* value used in the expression above */
          ExpressionAttributeValues: { ":pk": pk },
  
          /* false = descending order → newest first */
          ScanIndexForward: false,
  
          /* limit results to avoid over-fetching */
          Limit: 20
        })
      );
  
      /* return items or empty array if none exist */
      return NextResponse.json({ items: result.Items ?? [] });
  
    } catch (err) {
  
      /* log actual error for debugging on server */
      console.error("HISTORY GET ERROR:", err);
  
      /* return safe error message to client */
      return NextResponse.json(
        { error: "Failed to load history" },
        { status: 500 }
      );
    }
  }
  /* save a prompt response pair */
export async function POST(req: Request) {
    try {
  
      /* parse JSON body sent from frontend */
      const { prompt, response, latencyMs, model } = await req.json();
  
      /* basic validation to prevent empty writes */
      if (!prompt || !response) {
        return NextResponse.json(
          { error: "prompt and response are required" },
          { status: 400 }
        );
      }
  
      /* timestamp used for sorting */
      const createdAt = new Date().toISOString();
  
      /* build item exactly how Dynamo table expects it */
      const item = {
        pk: `USER#${USER_ID}`,      // partition key (groups records by user)
        sk: `TS#${createdAt}`,      // sort key (orders records by time)
        createdAt,
        prompt,
        response,
        model: model || "gpt-4o-mini",
        latencyMs: latencyMs ?? null
      };
  
      /* write item into DynamoDB table */
      await ddb.send(
        new PutCommand({
          TableName: AI_HISTORY_TABLE,
          Item: item
        })
      );
  
      /* return confirmation and saved item */
      return NextResponse.json({ ok: true, item });
  
    } catch (err) {
  
      /* log actual error for debugging */
      console.error("HISTORY POST ERROR:", err);
  
      /* return safe error response */
      return NextResponse.json(
        { error: "Failed to save history" },
        { status: 500 }
      );
    }
}

