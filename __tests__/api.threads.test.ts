import { GET, POST } from "@/app/api/threads/route";
import { ddb, AI_HISTORY_TABLE } from "@/lib/dynamo";

jest.mock("@/lib/dynamo");

describe("/api/threads", () => {
  beforeEach(() => {
    (ddb.send as jest.Mock).mockReset();
    process.env.AI_HISTORY_USER_ID = "demo";
  });

  test("GET lists threads", async () => {
    (ddb.send as jest.Mock).mockResolvedValue({
      Items: [
        {
          pk: "USER#demo",
          sk: "THREAD#t1",
          threadId: "t1",
          title: "First chat",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z"
        }
      ]
    });

    const res = await GET();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data.threads)).toBe(true);
    expect(data.threads[0].threadId).toBe("t1");

    expect(AI_HISTORY_TABLE).toBe("AI_HISTORY_TABLE_TEST");
    expect(ddb.send).toHaveBeenCalledTimes(1);
  });

  test("POST creates a new thread", async () => {
    (ddb.send as jest.Mock).mockResolvedValueOnce({}); // PutCommand result can be empty

    const res = await POST();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.thread.threadId).toBeTruthy();
    expect(data.thread.title).toBe("New chat");

    const cmd: any = (ddb.send as jest.Mock).mock.calls[0][0];
    expect(cmd?.input?.TableName).toBe("AI_HISTORY_TABLE_TEST");
    expect(cmd?.input?.Item?.pk).toBe("USER#demo");
    expect(String(cmd?.input?.Item?.sk)).toMatch(/^THREAD#/);
  });
});
