"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type HistoryItem = {
  pk: string;
  sk: string;
  createdAt: string;
  prompt: string;
  response: string;
  model?: string;
  latencyMs?: number | null;
};

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  latencyMs?: number | null;
};

export default function Home() {
  /* prompt input */
  const [prompt, setPrompt] = useState("");

  /* current streaming response text (not yet saved until finished) */
  const [response, setResponse] = useState("");

  /* loading state */
  const [loading, setLoading] = useState(false);

  /* error state */
  const [error, setError] = useState("");

  /* history items from Dynamo (prompt/response pairs) */
  const [history, setHistory] = useState<HistoryItem[]>([]);

  /* loading state for history */
  const [historyLoading, setHistoryLoading] = useState(false);

  /* AbortController for Stop button */
  const [controller, setController] = useState<AbortController | null>(null);

  /* NEW: shows the user bubble immediately while we stream + save */
  const [pendingPrompt, setPendingPrompt] = useState<string>("");

  /* used to auto-scroll to the newest message */
  const bottomRef = useRef<HTMLDivElement | null>(null);

  /* load history from Dynamo */
  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/history", { method: "GET" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load history");
      setHistory(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      console.error("LOAD HISTORY ERROR:", err);
    }
    setHistoryLoading(false);
  }

  useEffect(() => {
    loadHistory();
  }, []);

  /* build chat messages from history so we can render ChatGPT-style bubbles */
  const chatMessages: ChatMsg[] = useMemo(() => {
    // history from API is newest first (ScanIndexForward: false),
    // but chat UI should be oldest -> newest
    const ordered = [...history].reverse();

    const msgs: ChatMsg[] = [];

    for (const h of ordered) {
      msgs.push({
        id: `${h.sk}-user`,
        role: "user",
        text: h.prompt,
        createdAt: h.createdAt
      });

      msgs.push({
        id: `${h.sk}-assistant`,
        role: "assistant",
        text: h.response,
        createdAt: h.createdAt,
        latencyMs: h.latencyMs ?? null
      });
    }

    return msgs;
  }, [history]);

  /* auto-scroll when messages change or streaming text updates */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length, response, loading, pendingPrompt]);

  /* submit -> show user bubble -> stream -> save -> refresh */
  async function handleSubmit() {
    if (!prompt.trim()) {
      setError("Please enter a prompt.");
      return;
    }

    const promptToSend = prompt; // keep a stable copy

    /* show user's message immediately (ChatGPT behavior) */
    setPendingPrompt(promptToSend);

    setLoading(true);
    setError("");
    setResponse("");
    setPrompt(""); // clears input immediately

    const ctrl = new AbortController();
    setController(ctrl);

    try {
      /* call AI route (streaming) */
      const aiRes = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptToSend }),
        signal: ctrl.signal
      });

      if (!aiRes.ok) {
        const msg = await aiRes.text();
        throw new Error(msg || "AI request failed");
      }

      const reader = aiRes.body?.getReader();
      if (!reader) throw new Error("No stream returned");

      const decoder = new TextDecoder();

      let fullText = "";
      const start = Date.now();

      /* stream tokens into UI */
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        fullText += chunk;
        setResponse(fullText);
      }

      /* save full prompt + response after stream completes */
      const historyRes = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptToSend,
          response: fullText,
          latencyMs: Date.now() - start,
          model: "gpt-4o-mini"
        })
      });

      const historyData = await historyRes.json();

      if (!historyRes.ok) {
        console.error("HISTORY SAVE ERROR:", historyData);
      } else {
        await loadHistory();
      }

      /* clear streaming + temp user bubble once history is updated */
      setResponse("");
      setPendingPrompt("");
    } catch (err: any) {
      if (err?.name === "AbortError") {
        console.log("Streaming canceled by user");

        /* if user stops, remove the temp user bubble (optional) */
        setPendingPrompt("");
      } else {
        setError(err?.message || "Something went wrong");

        /* if it failed, also clear the temp bubble so it doesn't hang */
        setPendingPrompt("");
      }
    }

    setController(null);
    setLoading(false);
  }

  /* clear Dynamo history (chat) */
  async function handleClearHistory() {
    try {
      await fetch("/api/history", { method: "DELETE" });
      await loadHistory();
      setResponse("");
      setPendingPrompt("");
      setError("");
    } catch (err) {
      console.error("CLEAR HISTORY ERROR:", err);
    }
  }

  return (
    <main className="min-h-screen bg-gray-100">
      {/* Chat container */}
      <div className="mx-auto max-w-3xl h-screen flex flex-col">
        {/* Header */}
        <div className="p-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">AI Chat</h1>

          <button
            onClick={handleClearHistory}
            className="text-sm underline"
            type="button"
          >
            Clear chat
          </button>
        </div>

        {/* Messages area (scrollable) */}
        <div className="flex-1 overflow-y-auto px-4 pb-28 mask-gradient">
          {historyLoading ? (
            <p className="text-sm text-gray-500">Loading chat...</p>
          ) : chatMessages.length === 0 && !loading && !pendingPrompt ? (
            <div className="mt-10 text-center text-gray-500">
              <p className="text-lg font-medium">Start a conversation</p>
              <p className="text-sm">Ask anything and your chat will be saved.</p>
            </div>
          ) : (
            <div className="space-y-3 pb-10 pt-10">
              {/* saved chat bubbles from Dynamo */}
              {chatMessages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${
                    m.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-black text-white"
                        : "bg-white text-gray-900"
                    }`}
                  >
                    {m.text}
                    {m.role === "assistant" && m.latencyMs ? (
                      <div className="mt-2 text-xs opacity-60">
                        {m.latencyMs}ms
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}

              {/* NEW: show user's message immediately (before Dynamo refresh) */}
              {pendingPrompt && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl px-4 py-3 shadow-sm bg-black text-white whitespace-pre-wrap">
                    {pendingPrompt}
                  </div>
                </div>
              )}

              {/* Live streaming message bubble (assistant) */}
              {loading && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl px-4 py-3 shadow-sm bg-white text-gray-900 whitespace-pre-wrap">
                    {response || "Thinking..."}
                  </div>
                </div>
              )}

              {/* any error */}
              {error && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-red-50 text-red-700 border border-red-200">
                    {error}
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input area (fixed at bottom) */}
        <div className="fixed bottom-0 left-0 right-0 bg-gray-100 border-t">
          <div className="mx-auto max-w-3xl p-4">
            <div className="bg-white rounded-2xl shadow-md p-3 flex gap-2 items-end">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Message..."
                className="flex-1 border rounded-xl p-3 resize-none h-14 focus:outline-none"
              />

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="bg-black text-white px-4 py-3 rounded-xl disabled:opacity-50"
                type="button"
              >
                {loading ? "..." : "Send"}
              </button>

              {loading && controller && (
                <button
                  onClick={() => controller.abort()}
                  className="border border-red-500 text-red-500 px-4 py-3 rounded-xl"
                  type="button"
                >
                  Stop
                </button>
              )}
            </div>

            <p className="mt-2 text-xs text-gray-500">
              Tip: Your chats are saved to DynamoDB automatically.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
