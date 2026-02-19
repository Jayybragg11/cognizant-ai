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

  /* ---------- RETRY STATE ---------- */
  const [lastPrompt, setLastPrompt] = useState<string>("");

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
    if (!res.ok) throw new Error(data?.error || "Failed to create thread");

    const t: Thread = data.thread;

    /* optimistic sidebar insert */
    setThreads((prev) => [t, ...prev]);

    /* reset UI for new chat */
    setActiveThreadId(t.threadId);
    setItems([]);
    setResponse("");
    setPendingPrompt("");
    setStopped(false);
    setError("");
    setLastPrompt("");
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

      if (!res.ok) throw new Error(data?.error || "Failed to load messages");
      setItems(Array.isArray(data.messages) ? data.messages : []);
    } catch (err: any) {
      console.error("MESSAGE LOAD ERROR:", err);
      setError(err?.message || "Failed to load messages");
    }
    setMessagesLoading(false);
  }

  /* =========================
     SELECT THREAD (CLEAN SWITCH)
  ========================= */
  async function handleSelectThread(threadId: string) {
    /* stop any in-progress stream before switching */
    controller?.abort();
    setController(null);

    setLoading(false);
    setStopped(false);
    setError("");
    setResponse("");
    setPendingPrompt("");
    setLastPrompt("");

    setActiveThreadId(threadId);
    setItems([]);
    await loadMessages(threadId);
  }

  /* load threads on first render */
  useEffect(() => {
    loadThreads();
  }, []);

  /* select first thread or create one */
  useEffect(() => {
    if (threadsLoading) return;

    if (!activeThreadId) {
      if (threads.length > 0) setActiveThreadId(threads[0].threadId);
      else createThreadAndSelect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadsLoading, threads.length]);

  /* load messages when thread changes (safety net) */
  useEffect(() => {
    if (activeThreadId) loadMessages(activeThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }, [chatMessages.length, response, pendingPrompt, loading, stopped, error]);

  /* =========================
     CORE SEND (used by Send + Retry)
  ========================= */
  async function sendPrompt(promptToSend: string) {
    if (!activeThreadId) return;

    /* remember this prompt so Retry can re-send it */
    setLastPrompt(promptToSend);

    /* show user bubble instantly */
    setPendingPrompt(promptToSend);

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
        throw new Error(msg || "AI request failed");
      }

      const reader = aiRes.body?.getReader();
      if (!reader) throw new Error("No stream returned");

      const decoder = new TextDecoder();
      let fullText = "";
      const start = Date.now();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value);
        setResponse(fullText);
      }

      /* save the completed answer into the thread */
      const saveRes = await fetch(`/api/threads/${activeThreadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptToSend,
          response: fullText,
          latencyMs: Date.now() - start,
          model: "gpt-4o-mini"
        })
      });

      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData?.error || "Failed to save message");

      /* refresh sidebar + message list */
      await loadMessages(activeThreadId);
      await loadThreads();

      /* clear temp UI once saved */
      setPendingPrompt("");
      setResponse("");
      setStopped(false);
      setError("");
    } catch (err: any) {
      if (err?.name === "AbortError") {
        /* user clicked Stop — keep bubbles visible */
        setStopped(true);
      } else {
        /* request failed — show error bubble + allow retry */
        setError(err?.message || "Something went wrong");
      }
    } finally {
      setController(null);
      setLoading(false);
    }
  }

  /* =========================
     SEND MESSAGE (button)
  ========================= */
  async function handleSubmit() {
    if (!prompt.trim()) {
      setError("Please enter a prompt.");
      return;
    }

    const promptToSend = prompt;
    setPrompt("");
    await sendPrompt(promptToSend);
  }

  /* =========================
     RETRY LAST MESSAGE
  ========================= */
  async function handleRetry() {
    if (!lastPrompt) return;

    /* clear old error before retry */
    setError("");
    setStopped(false);

    await sendPrompt(lastPrompt);
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
      if (remaining.length > 0) setActiveThreadId(remaining[0].threadId);
      else await createThreadAndSelect();
    }
  }

  const activeTitle =
    threads.find((t) => t.threadId === activeThreadId)?.title || "AI Chat";

  const canRetry = !!lastPrompt && (!!error || stopped) && !loading;

  return (
    <main className="h-screen flex bg-[var(--cog-bg)] text-[var(--cog-text)]">
      <div className="h-screen flex w-full">
        {/* Sidebar */}
        <aside className="w-80 bg-[var(--cog-surface)] border-r border-[var(--cog-border)] hidden md:flex flex-col">
          <div className="p-4 flex items-center justify-between border-b border-[var(--cog-border)]">
            <h2 className="font-semibold tracking-tight">Chats</h2>

            <button
              onClick={handleNewChat}
              className="text-sm px-3 py-1.5 rounded-lg border border-[var(--cog-border)] bg-white hover:bg-[var(--cog-bg)]"
              type="button"
            >
              + New
            </button>
          </div>

          <div className="px-2 pb-3 overflow-y-auto">
            {threadsLoading ? (
              <p className="text-sm text-[var(--cog-muted)] px-2 py-2">Loading…</p>
            ) : threads.length === 0 ? (
              <p className="text-sm text-[var(--cog-muted)] px-2 py-2">No chats yet.</p>
            ) : (
              <ul className="space-y-1">
                {threads.map((t) => {
                  const active = t.threadId === activeThreadId;

                  return (
                    <li key={`${t.pk}-${t.sk}`}>
                      <div
                        onClick={() => handleSelectThread(t.threadId)}
                        className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 cursor-pointer border ${
                          active
                            ? "bg-[var(--cog-bg)] border-[var(--cog-border)]"
                            : "bg-transparent border-transparent hover:bg-[var(--cog-bg)] hover:border-[var(--cog-border)]"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{t.title || "New chat"}</p>
                          <p className="text-xs text-[var(--cog-muted)] truncate">
                            {new Date(t.updatedAt || t.createdAt).toLocaleString()}
                          </p>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteThread(t.threadId);
                          }}
                          className="text-xs text-[var(--cog-muted)] hover:text-red-600"
                          type="button"
                          aria-label="Delete chat"
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Main Chat */}
        <section className="flex-1 flex flex-col">
          {/* Header */}
          <div className="p-4 flex items-center justify-between border-b border-[var(--cog-border)] bg-[var(--cog-surface)]">
            <h1 className="text-lg font-semibold tracking-tight">{activeTitle}</h1>

            <button
              onClick={handleNewChat}
              className="md:hidden text-sm px-3 py-1.5 rounded-lg border border-[var(--cog-border)] bg-white hover:bg-[var(--cog-bg)]"
              type="button"
            >
              + New
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 pb-28">
            {messagesLoading ? (
              <p className="text-sm text-[var(--cog-muted)] py-4">Loading chat…</p>
            ) : chatMessages.length === 0 && !loading && !pendingPrompt ? (
              <div className="mt-10 text-center text-[var(--cog-muted)]">
                <p className="text-lg font-medium text-[var(--cog-text)]">Start a conversation</p>
                <p className="text-sm">This chat is saved by thread.</p>
              </div>
            ) : (
              <div className="space-y-3 pb-10 pt-6">
                {/* saved messages */}
                {chatMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 whitespace-pre-wrap ${
                        m.role === "user"
                          ? "bg-[var(--cog-navy)] text-white shadow-sm"
                          : "bg-[var(--cog-surface)] text-[var(--cog-text)] border border-[var(--cog-border)] shadow-sm"
                      }`}
                    >
                      {m.text}
                      {m.role === "assistant" && m.latencyMs ? (
                        <div className="mt-2 text-xs text-[var(--cog-muted)]">{m.latencyMs}ms</div>
                      ) : null}
                    </div>
                  </div>
                ))}

                {/* pending user bubble */}
                {pendingPrompt && (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-[var(--cog-navy)] text-white shadow-sm whitespace-pre-wrap">
                      {pendingPrompt}
                    </div>
                  </div>
                )}

                {/* streaming assistant bubble */}
                {(loading || response) && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-[var(--cog-surface)] text-[var(--cog-text)] border border-[var(--cog-border)] shadow-sm whitespace-pre-wrap">
                      {response || "Thinking..."}
                      {stopped && (
                        <div className="mt-2 text-xs text-[var(--cog-muted)]">Stopped</div>
                      )}
                    </div>
                  </div>
                )}

                {/* error bubble + retry */}
                {error && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-red-50 text-red-700 border border-red-200">
                      <div>{error}</div>

                      {canRetry && (
                        <button
                          onClick={handleRetry}
                          className="mt-2 text-xs underline"
                          type="button"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* stopped state retry (if no error bubble is showing) */}
                {!error && canRetry && (
                  <div className="flex justify-start">
                    <button
                      onClick={handleRetry}
                      className="text-xs underline text-[var(--cog-muted)] hover:text-[var(--cog-text)]"
                      type="button"
                    >
                      Retry last message
                    </button>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Input (fixed) */}
          <div className="fixed bottom-0 left-0 right-0 bg-[var(--cog-surface)] border-t border-[var(--cog-border)]">
            <div className="mx-auto max-w-4xl p-4">
              <div className="bg-white rounded-2xl border border-[var(--cog-border)] shadow-sm p-3 flex gap-2 items-end">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Message..."
                  className="flex-1 border border-[var(--cog-border)] rounded-xl p-3 resize-none h-14 focus:outline-none focus:ring-2 focus:ring-[var(--cog-cyan)]"
                />

                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="px-4 py-3 rounded-xl text-white bg-[var(--cog-navy)] hover:opacity-95 disabled:opacity-50"
                  type="button"
                >
                  {loading ? "..." : "Send"}
                </button>

                {loading && controller && (
                  <button
                    onClick={() => controller.abort()}
                    className="px-4 py-3 rounded-xl border border-[var(--cog-border)] text-[var(--cog-muted)] hover:text-red-600"
                    type="button"
                  >
                    Stop
                  </button>
                )}
              </div>

              <p className="mt-2 text-xs text-[var(--cog-muted)]">
                Tip: Chats are saved per thread in DynamoDB.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}