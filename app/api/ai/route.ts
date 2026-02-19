import OpenAI from "openai";
import { NextResponse } from "next/server";

/*Create openai client*/ 
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/*Post handler to interact with backend*/ 
export async function POST(req: Request) {
  try {

    /* parse through the incoming question prompt */
    const { prompt } = await req.json();

    /* check if the prompt is valid if so throw 400 error */
    if (!prompt || prompt.trim() === "") {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }
    /* set time to check for how long request took */
    const start = Date.now();

    /* Call openai and send the chat */
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
    });

    /* pull back the response from openai */
    const responseText =
      completion.choices[0]?.message?.content || "No response";

    /* send response from openai to frontend */
    return NextResponse.json({
      response: responseText,
      latencyMs: Date.now() - start
    });

    /* catch and failures or errors from openai */
  } catch (err) {
    console.error("AI ERROR:", err);

    return NextResponse.json(
      { error: "AI request failed" },
      { status: 500 }
    );
  }
}


