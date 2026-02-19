import { POST } from "@/app/api/ai/route";
import { __openaiCreateMock } from "@/__mocks__/openai";


jest.mock("openai"); // uses __mocks__/openai.ts

/* helper: read a Response body stream into a string */
async function readResponseText(res: Response) {
  const reader = res.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let out = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }

  return out;
}

/* helper: build a fake OpenAI stream (async iterable) */
function fakeOpenAIStream(tokens: string[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const t of tokens) {
        yield { choices: [{ delta: { content: t } }] };
      }
    }
  };
}

describe("/api/ai (streaming)", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    (__openaiCreateMock as jest.Mock).mockReset();
  });

  test("streams text back on success", async () => {
    (__openaiCreateMock as jest.Mock).mockResolvedValue(
      fakeOpenAIStream(["Hello", " ", "world", "!"])
    );

    const req = new Request("http://localhost/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Say hi" })
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/plain/i);

    const text = await readResponseText(res);
    expect(text).toBe("Hello world!");
  });

  test("returns 400 if prompt is missing", async () => {
    const req = new Request("http://localhost/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "" })
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const text = await res.text();
    expect(text).toMatch(/prompt is required/i);
  });

  test("returns 500 if OpenAI throws", async () => {
    (__openaiCreateMock as jest.Mock).mockRejectedValue(new Error("OpenAI down"));

    const req = new Request("http://localhost/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Hello" })
    });

    const res = await POST(req);
    expect(res.status).toBe(500);

    const text = await res.text();
    expect(text).toMatch(/ai request failed/i);
  });
});
