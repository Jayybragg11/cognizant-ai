import { NextResponse } from "next/server";
import { ddb, AI_HISTORY_TABLE } from "@/lib/dynamo";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const USER_ID = process.env.AI_HISTORY_USER_ID || "demo";

/* GET: return latest history for this user */
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
