"use client";

import { useEffect, useState } from "react";

type HistoryItem = {
  pk: string;
  sk: string;
  createdAt: string;
  prompt: string;
  response: string;
  model?: string;
  latencyMs?: number | null;
};

export default function Home() {
  /* store prompt input */
  const [prompt, setPrompt] = useState("");

  /* store AI response */
  const [response, setResponse] = useState("");

  /* loading state */
  const [loading, setLoading] = useState(false);

  /* error state */
  const [error, setError] = useState("");

  /* store prompt history list */
  const [history, setHistory] = useState<HistoryItem[]>([]);

  /* loading state for history panel */
  const [historyLoading, setHistoryLoading] = useState(false);

  /* load prompt history from DynamoDB (via /api/history) */
  async function loadHistory() {
    setHistoryLoading(true);

    try {
      const res = await fetch("/api/history", { method: "GET" });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "Failed to load history");

      setHistory(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      // keep this quiet so UI still works even if history fails
      console.error("LOAD HISTORY ERROR:", err);
    }

    setHistoryLoading(false);
  }

  /* run once on page load */
  useEffect(() => {
    loadHistory();
  }, []);

  /* submit prompt -> get AI response -> save history -> refresh history */
async function handleSubmit() {
  /* basic frontend validation */
  if (!prompt.trim()) {
    setError("Please enter a prompt.");
    return;
  }

  setLoading(true);
  setError("");
  setResponse("");

  try {
    /* call AI route (streaming) */
    const aiRes = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    /* if the request failed, read text error and throw */
    if (!aiRes.ok) {
      const msg = await aiRes.text();
      throw new Error(msg || "AI request failed");
    }

    /* get stream reader */
    const reader = aiRes.body?.getReader();
    if (!reader) throw new Error("No stream returned");

    const decoder = new TextDecoder();

    let fullText = "";
    const start = Date.now(); // used to approximate latency since streaming returns plain text

    /* read chunks and update UI live */
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      fullText += chunk;

      /* show response as it comes in */
      setResponse(fullText);
    }

    /* after streaming finishes, save to DynamoDB */
    const historyRes = await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        response: fullText,
        latencyMs: Date.now() - start,
        model: "gpt-4o-mini"
      })
    });

    const historyData = await historyRes.json();

    /* if history save fails, we still keep response visible */
    if (!historyRes.ok) {
      console.error("HISTORY SAVE ERROR:", historyData);
    } else {
      /* refresh history list so new item appears */
      await loadHistory();
    }
  } catch (err: any) {
    setError(err?.message || "Something went wrong");
  }

  setLoading(false);
}


  /* clear UI input + response + error (does not clear DynamoDB history) */
  function handleClearUI() {
    setPrompt("");
    setResponse("");
    setError("");
  }

  /* clear DynamoDB history */
  async function handleClearHistory() {
    try {
      await fetch("/api/history", { method: "DELETE" });
      await loadHistory();
    } catch (err) {
      console.error("CLEAR HISTORY ERROR:", err);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="bg-white shadow-lg rounded-2xl p-6 w-full max-w-xl space-y-4">
        <h1 className="text-2xl font-bold text-center">AI Prompt Tester</h1>

        {/* prompt input */}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask anything..."
          className="w-full border rounded-lg p-3 resize-none h-32"
        />

        {/* action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-black text-white py-2 rounded-lg disabled:opacity-50"
          >
            {loading ? "Generating..." : "Submit"}
          </button>

          <button
            onClick={handleClearUI}
            className="px-4 border rounded-lg"
          >
            Clear
          </button>
        </div>

        {/* error */}
        {error && <p className="text-red-500 text-sm">{error}</p>}

        {/* response */}
        {response && (
          <div className="border rounded-lg p-3 bg-gray-50 whitespace-pre-wrap">
            {response}
          </div>
        )}

        {/* history section */}
        <div className="pt-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">History</h2>

            <button
              onClick={handleClearHistory}
              className="text-sm underline"
              type="button"
            >
              Clear history
            </button>
          </div>

          {historyLoading ? (
            <p className="text-sm text-gray-500">Loading history...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-gray-500">No history yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {history.map((h) => (
                <li key={h.sk} className="border rounded-lg p-3 bg-gray-50">
                  <p className="text-xs text-gray-500">
                    {new Date(h.createdAt).toLocaleString()}
                    {h.latencyMs ? ` • ${h.latencyMs}ms` : ""}
                  </p>

                  <p className="text-sm font-medium mt-2">Prompt:</p>
                  <p className="text-sm text-gray-700">{h.prompt}</p>

                  <p className="text-sm font-medium mt-2">Response:</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {h.response}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
