import OpenAI from "openai";

/* make sure this route runs on Node (better for OpenAI + AWS) */
export const runtime = "nodejs";

/* Create openai client */
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* POST handler (streams text back as it is generated) */
export async function POST(req: Request) {
  try {
    /* parse incoming prompt */
    const { prompt } = await req.json();

    /* basic validation */
    if (!prompt || prompt.trim() === "") {
      return new Response("Prompt is required", { status: 400 });
    }

    /* start OpenAI streaming response */
    const stream = await client.chat.completions.create({
      model: "gpt-4o-mini",
      stream: true,
      messages: [{ role: "user", content: prompt }]
    });

    /* convert OpenAI chunks into a plain text stream for the browser */
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            /* each chunk may contain a small piece of text (token) */
            const token = chunk.choices[0]?.delta?.content || "";
            controller.enqueue(encoder.encode(token));
          }
        } finally {
          /* close stream when OpenAI finishes */
          controller.close();
        }
      }
    });

    /* return the text stream (frontend will read it live) */
    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache"
      }
    });
  } catch (err) {
    console.error("AI STREAM ERROR:", err);
    return new Response("AI request failed", { status: 500 });
  }
}
