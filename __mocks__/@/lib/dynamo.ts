export const AI_HISTORY_TABLE = "AI_HISTORY_TABLE_TEST";

/*
  Your routes call: ddb.send(new QueryCommand(...))
  We'll mock send() and inspect the command input.
*/
export const ddb = {
  send: jest.fn()
};
