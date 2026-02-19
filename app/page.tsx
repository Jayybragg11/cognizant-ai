"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* =========================
   TYPES
========================= */

type Thread = {
  pk: string;
  sk: string;
  threadId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type ThreadMessageItem = {
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

/* =========================
   COMPONENT
========================= */

export default function Home() {
  /* ---------- THREAD SIDEBAR STATE ---------- */

  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState("");

  /* ---------- MESSAGES ---------- */

  const [items, setItems] = useState<ThreadMessageItem[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  /* ---------- INPUT / STREAM ---------- */

  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [pendingPrompt, setPendingPrompt] = useState("");

  /* ---------- UI STATES ---------- */

  const [loading, setLoading] = useState(false);
  const [controller, setController] = useState<AbortController | null>(null);
  const [error, setError] = useState("");
  const [stopped, setStopped] = useState(false);

  /* scroll anchor */
  const bottomRef = useRef<HTMLDivElement | null>(null);

  /* =========================
     LOAD THREAD LIST
  ========================= */
  async function loadThreads() {
    setThreadsLoading(true);
    try {
      const res = await fetch("/api/threads");
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "Failed to load threads");

      setThreads(Array.isArray(data.threads) ? data.threads : []);
    } catch (err) {
      console.error("THREAD LOAD ERROR:", err);
    }
    setThreadsLoading(false);
  }

  /* =========================
     CREATE NEW THREAD
  ========================= */
  async function createThreadAndSelect() {
    const res = await fetch("/api/threads", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error);

    const t: Thread = data.thread;

    /* optimistic UI update */
    setThreads((prev) => [t, ...prev]);

    setActiveThreadId(t.threadId);
    setItems([]);
    setResponse("");
    setPendingPrompt("");
    setStopped(false);
  }

  /* =========================
     LOAD THREAD MESSAGES
  ========================= */
  async function loadMessages(threadId: string) {
    if (!threadId) return;

    setMessagesLoading(true);

    try {
      const res = await fetch(`/api/threads/${threadId}/messages`);
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error);

      setItems(Array.isArray(data.messages) ? data.messages : []);
    } catch (err) {
      console.error("MESSAGE LOAD ERROR:", err);
    }

    setMessagesLoading(false);
  }

  /* load threads on first render */
  useEffect(() => {
    loadThreads();
  }, []);

  /* select first thread or create one */
  useEffect(() => {
    if (threadsLoading) return;

    if (!activeThreadId) {
      if (threads.length > 0) {
        setActiveThreadId(threads[0].threadId);
      } else {
        createThreadAndSelect();
      }
    }
  }, [threadsLoading, threads.length]);

  /* load messages when thread changes */
  useEffect(() => {
    if (activeThreadId) loadMessages(activeThreadId);
  }, [activeThreadId]);

  /* =========================
     BUILD CHAT BUBBLES
  ========================= */
  const chatMessages: ChatMsg[] = useMemo(() => {
    const msgs: ChatMsg[] = [];

    for (const m of items) {
      msgs.push({
        id: `${m.sk}-user`,
        role: "user",
        text: m.prompt,
        createdAt: m.createdAt
      });

      msgs.push({
        id: `${m.sk}-assistant`,
        role: "assistant",
        text: m.response,
        createdAt: m.createdAt,
        latencyMs: m.latencyMs ?? null
      });
    }

    return msgs;
  }, [items]);

  /* auto-scroll */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length, response, pendingPrompt, loading]);

  /* =========================
     SEND MESSAGE
  ========================= */
  async function handleSubmit() {
    if (!activeThreadId) return;

    if (!prompt.trim()) {
      setError("Please enter a prompt.");
      return;
    }

    const promptToSend = prompt;

    /* show user bubble immediately */
    setPendingPrompt(promptToSend);

    setPrompt("");
    setLoading(true);
    setError("");
    setResponse("");
    setStopped(false);

    const ctrl = new AbortController();
    setController(ctrl);

    try {
      const aiRes = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptToSend }),
        signal: ctrl.signal
      });

      if (!aiRes.ok) {
        const msg = await aiRes.text();
        throw new Error(msg);
      }

      const reader = aiRes.body?.getReader();
      if (!reader) throw new Error("No stream returned");

      const decoder = new TextDecoder();
      let fullText = "";
      const start = Date.now();

      /* stream response */
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        fullText += decoder.decode(value);
        setResponse(fullText);
      }

      /* save message */
      await fetch(`/api/threads/${activeThreadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptToSend,
          response: fullText,
          latencyMs: Date.now() - start,
          model: "gpt-4o-mini"
        })
      });

      /* refresh UI */
      await loadMessages(activeThreadId);
      await loadThreads();

      setPendingPrompt("");
      setResponse("");

    } catch (err: any) {
      if (err?.name === "AbortError") {
        setStopped(true);
      } else {
        setError(err?.message || "Something went wrong");
      }
    }

    setController(null);
    setLoading(false);
  }

  /* =========================
     NEW CHAT
  ========================= */
  async function handleNewChat() {
    await createThreadAndSelect();
    await loadThreads();
  }

  /* =========================
     DELETE THREAD
  ========================= */
  async function handleDeleteThread(threadId: string) {
    await fetch(`/api/threads/${threadId}`, { method: "DELETE" });
    await loadThreads();

    if (threadId === activeThreadId) {
      const remaining = threads.filter((t) => t.threadId !== threadId);
      if (remaining.length > 0)
        setActiveThreadId(remaining[0].threadId);
      else
        await createThreadAndSelect();
    }
  }

  const activeTitle =
    threads.find((t) => t.threadId === activeThreadId)?.title || "AI Chat";

  /* =========================
     UI
  ========================= */

  return (
    <main className="h-screen flex bg-gray-100">

      {/* Sidebar */}
      <aside className="w-72 bg-white border-r hidden md:flex flex-col">

        <div className="p-4 flex justify-between">
          <h2 className="font-bold">Chats</h2>
          <button onClick={handleNewChat} className="border px-3 py-1 rounded">
            + New
          </button>
        </div>

        <div className="px-2">
        {threads.map((t) => {
          const active = t.threadId === activeThreadId;

          return (
            <div
              key={`${t.pk}-${t.sk}`} // guaranteed unique key
              onClick={() => setActiveThreadId(t.threadId)}
              className={`p-2 rounded-lg cursor-pointer flex justify-between ${
                active ? "bg-gray-100" : "hover:bg-gray-50"
              }`}
            >
                <div className="truncate text-sm">{t.title}</div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteThread(t.threadId);
                  }}
                  className="text-red-500 text-xs"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Main Chat */}
      <section className="flex-1 flex flex-col">

        {/* Header */}
        <div className="p-4 border-b bg-white font-bold">
          {activeTitle}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-3">

          {chatMessages.map((m) => (
            <div
              key={m.id}
              className={`flex ${
                m.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`px-4 py-3 rounded-2xl max-w-[80%] whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-black text-white"
                    : "bg-white shadow"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}

          {/* pending user bubble */}
          {pendingPrompt && (
            <div className="flex justify-end">
              <div className="bg-black text-white px-4 py-3 rounded-2xl">
                {pendingPrompt}
              </div>
            </div>
          )}

          {/* streaming bubble */}
          {(loading || response) && (
            <div className="flex justify-start">
              <div className="bg-white shadow px-4 py-3 rounded-2xl">
                {response || "Thinking..."}
                {stopped && (
                  <div className="text-xs text-gray-400 mt-2">
                    Stopped
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t p-4 bg-white flex gap-2">

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="flex-1 border rounded-lg p-2"
            placeholder="Message..."
          />

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-black text-white px-4 rounded"
          >
            Send
          </button>

          {loading && controller && (
            <button
              onClick={() => controller.abort()}
              className="border border-red-500 text-red-500 px-4 rounded"
            >
              Stop
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
