import { GET, POST } from "@/app/api/threads/[threadId]/messages/route";
import { ddb } from "@/lib/dynamo";

jest.mock("@/lib/dynamo");

describe("/api/threads/[threadId]/messages", () => {
  beforeEach(() => {
    (ddb.send as jest.Mock).mockReset();
    process.env.AI_HISTORY_USER_ID = "demo";
  });

  test("GET loads messages for a thread", async () => {
    (ddb.send as jest.Mock).mockResolvedValueOnce({
      Items: [
        {
          pk: "THREAD#abc",
          sk: "MSG#2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          prompt: "Hi",
          response: "Hello"
        }
      ]
    });

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ threadId: "abc" })
    });

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.messages[0].pk).toBe("THREAD#abc");

    const cmd: any = (ddb.send as jest.Mock).mock.calls[0][0];
    expect(cmd?.input?.ExpressionAttributeValues?.[":pk"]).toBe("THREAD#abc");
  });

  test("POST saves message and updates thread metadata", async () => {
    // PutCommand + UpdateCommand calls
    (ddb.send as jest.Mock)
      .mockResolvedValueOnce({}) // Put
      .mockResolvedValueOnce({}); // Update

    const req = new Request("http://localhost/api/threads/abc/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "How are you?",
        response: "Good.",
        latencyMs: 123,
        model: "gpt-4o-mini"
      })
    });

    const res = await POST(req, {
      params: Promise.resolve({ threadId: "abc" })
    });

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);

    expect(ddb.send).toHaveBeenCalledTimes(2);

    const putCmd: any = (ddb.send as jest.Mock).mock.calls[0][0];
    expect(putCmd?.input?.Item?.pk).toBe("THREAD#abc");
    expect(String(putCmd?.input?.Item?.sk)).toMatch(/^MSG#/);

    const updateCmd: any = (ddb.send as jest.Mock).mock.calls[1][0];
    expect(updateCmd?.input?.Key?.pk).toBe("USER#demo");
    expect(updateCmd?.input?.Key?.sk).toBe("THREAD#abc");
  });

  test("POST returns 400 when prompt/response missing", async () => {
    const req = new Request("http://localhost/api/threads/abc/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "", response: "" })
    });

    const res = await POST(req, {
      params: Promise.resolve({ threadId: "abc" })
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/required/i);
  });
});
