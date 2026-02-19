import { NextResponse } from "next/server";
import { ddb, AI_HISTORY_TABLE } from "@/lib/dynamo";
import { PutCommand, QueryCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

const USER_ID = process.env.AI_HISTORY_USER_ID || "demo";

type HistoryKey = { pk: string; sk: string };

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

/* clears this user's saved prompt history */
export async function DELETE() {
    try {
      /* build partition key for this user */
      const pk = `USER#${USER_ID}`;
  
      /* Query DynamoDB to get the items we want to delete */
      const result = await ddb.send(
        new QueryCommand({
          TableName: AI_HISTORY_TABLE,
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: { ":pk": pk },
          ProjectionExpression: "pk, sk", // only grab keys
          ScanIndexForward: false,
          Limit: 50 // limit how many we clear at once
        })
      );
  
      /* cast items into our typed key format */
      const items = (result.Items ?? []) as HistoryKey[];
  
      /* if nothing exists, return early */
      if (items.length === 0) {
        return NextResponse.json({ ok: true, deleted: 0 });
      }
  
      /*
        Set dynamo batch write limit  to 25 items per request.
        So we split results into chunks of 25.
      */
      const chunks: HistoryKey[][] = [];
      for (let i = 0; i < items.length; i += 25) {
        chunks.push(items.slice(i, i + 25));
      }
  
      let deleted = 0;
  
      /*
        Send delete requests in batches.
        Each batch deletes up to 25 items.
      */
      for (const chunk of chunks) {
        await ddb.send(
          new BatchWriteCommand({
            RequestItems: {
              [AI_HISTORY_TABLE]: chunk.map((k: HistoryKey) => ({
                DeleteRequest: {
                  Key: { pk: k.pk, sk: k.sk }
                }
              }))
            }
          })
        );
  
        /* keep track of how many were deleted */
        deleted += chunk.length;
      }
  
      /* return success and count */
      return NextResponse.json({ ok: true, deleted });
  
    } catch (err) {
  
      /* log full error  */
      console.error("HISTORY DELETE ERROR:", err);
  
      /* return safe message */
      return NextResponse.json(
        { error: "Failed to clear history" },
        { status: 500 }
      );
    }
  }