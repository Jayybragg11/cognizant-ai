import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

/* create base Dynamo client */
const client = new DynamoDBClient({
  region: process.env.AWS_REGION
});

/* doc client lets us work with normal JS objects */
export const ddb = DynamoDBDocumentClient.from(client);

/* grab table name from env */
export const AI_HISTORY_TABLE = process.env.DDB_TABLE_AI_HISTORY!;
