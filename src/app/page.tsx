/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState, useCallback } from "react";
import Navigation from "./components/Navigation";
import { DefaultChatTransport } from "ai";

interface HistoryItem {
  id: string;
  conversation_id: string | null;
  query: string;
  answer: string;
  sources: any[];
  searched_at: string;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 px-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

function newConversationId() {
  return crypto.randomUUID();
}

export default function Home() {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const conversationIdRef = useRef<string>(newConversationId());

  // History panel state
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { messages, status, error, setMessages, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Auto-scroll to the bottom as new tokens arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/search");
      const data = await res.json();
      if (!data.error) setHistory(data.history || []);
    } catch {
      // non-critical
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    sendMessage(
      { text },
      { body: { conversationId: conversationIdRef.current } },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const loadFromHistory = async (item: HistoryItem) => {
    // Restore the conversation ID so subsequent messages continue the same thread
    const convId = item.conversation_id ?? item.id;
    conversationIdRef.current = convId;

    // Fetch all messages for this conversation from the API
    try {
      const res = await fetch(`/api/search?conversationId=${convId}`);
      const data = await res.json();
      const msgs: any[] = [];
      for (const row of data.messages || []) {
        msgs.push({
          id: `h-user-${row.id}-${msgs.length}`,
          role: "user",
          parts: [{ type: "text", text: row.query }],
          metadata: { createdAt: new Date(row.searched_at) },
        });
        msgs.push({
          id: `h-asst-${row.id}-${msgs.length}`,
          role: "assistant",
          parts: [{ type: "text", text: row.answer }],
          metadata: { createdAt: new Date(row.searched_at) },
        });
      }
      // Fallback to the single summary row if no detailed messages returned
      if (msgs.length === 0) {
        msgs.push(
          {
            id: `h-user-${item.id}`,
            role: "user",
            parts: [{ type: "text", text: item.query }],
            metadata: { createdAt: new Date(item.searched_at) },
          },
          {
            id: `h-asst-${item.id}`,
            role: "assistant",
            parts: [{ type: "text", text: item.answer }],
            metadata: { createdAt: new Date(item.searched_at) },
          },
        );
      }
      setMessages(msgs);
    } catch {
      // On error, fall back to showing just the summary row
      setMessages([
        {
          id: `h-user-${item.id}`,
          role: "user",
          parts: [{ type: "text", text: item.query }],
          metadata: { createdAt: new Date(item.searched_at) },
        },
        {
          id: `h-asst-${item.id}`,
          role: "assistant",
          parts: [{ type: "text", text: item.answer }],
          metadata: { createdAt: new Date(item.searched_at) },
        },
      ]);
    }
    setShowHistory(false);
    setTimeout(
      () => bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
      50,
    );
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      <Navigation />

      {/* ── Top bar ── */}
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-3 sm:px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
            Your Buddy
          </h1>
          {messages.length > 0 && (
            <button
              onClick={() => {
                setMessages([]);
                conversationIdRef.current = newConversationId();
              }}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700 rounded px-2 py-0.5 transition-colors"
            >
              New chat
            </button>
          )}
        </div>
        <button
          onClick={() => {
            const next = !showHistory;
            setShowHistory(next);
            if (next) fetchHistory();
          }}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="hidden sm:inline">Conversations</span>
          {history.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              {history.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Main content ── */}
      <div className="flex flex-1 min-h-0 max-w-4xl w-full mx-auto w-full">
        {/* ── History panel — slides in on mobile (overlay), sidebar on desktop ── */}
        {showHistory && (
          <>
            {/* Mobile backdrop */}
            <div
              className="fixed inset-0 z-20 bg-black/40 sm:hidden"
              onClick={() => setShowHistory(false)}
            />
            {/* Panel */}
            <aside
              className="
              fixed bottom-0 left-0 right-0 z-30 max-h-[70vh]
              sm:static sm:max-h-none sm:z-auto
              sm:w-72 sm:shrink-0
              flex flex-col
              bg-white dark:bg-gray-900
              border-t sm:border-t-0 sm:border-r border-gray-200 dark:border-gray-800
              rounded-t-2xl sm:rounded-none
              shadow-xl sm:shadow-none
              overflow-hidden
            "
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Conversations
                </span>
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              {historyLoading ? (
                <div className="px-4 py-6 text-center text-xs text-gray-400">
                  Loading…
                </div>
              ) : history.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-gray-400">
                  No history yet.
                </div>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800 overflow-y-auto flex-1">
                  {history.map((item) => {
                    const key = item.conversation_id ?? item.id;
                    return (
                      <li key={key}>
                        <div
                          className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                          onClick={() =>
                            setExpandedId(expandedId === key ? null : key)
                          }
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-medium text-gray-800 dark:text-gray-200 line-clamp-2 flex-1">
                              {item.query}
                            </p>
                            <span className="text-[10px] text-gray-400 shrink-0 mt-0.5">
                              {formatRelativeTime(item.searched_at)}
                            </span>
                          </div>
                          {expandedId === key && (
                            <div
                              className="mt-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-4 mb-2">
                                {item.answer}
                              </p>
                              <button
                                onClick={() => loadFromHistory(item)}
                                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                Load conversation ↑
                              </button>
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>
          </>
        )}

        {/* ── Chat area ── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Scrollable message area */}
          <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-5">
            {/* Empty state */}
            {messages.length === 0 && !isLoading && (
              <div className="h-full flex flex-col items-center justify-center text-center py-12 gap-3 min-h-[40vh]">
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-blue-600 dark:text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                    />
                  </svg>
                </div>
                <p className="text-base font-medium text-gray-700 dark:text-gray-300">
                  Ask anything about your documents
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs">
                  Your uploaded PDFs, Word docs, and presentations are all
                  searchable. Start a conversation below.
                </p>
              </div>
            )}

            {/* Message thread */}
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              const textContent =
                msg.parts
                  ?.filter((p: any) => p.type === "text")
                  ?.map((p: any) => p.text)
                  ?.join("") ?? "";

              return (
                <div
                  key={msg.id}
                  className={`flex gap-2 sm:gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {/* AI Avatar */}
                  {!isUser && (
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 mt-1">
                      <svg
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                      </svg>
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] sm:max-w-[75%] flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? "bg-blue-600 text-white rounded-br-sm"
                          : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-sm shadow-sm"
                      }`}
                    >
                      {textContent}
                    </div>
                  </div>

                  {/* User Avatar */}
                  {isUser && (
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center shrink-0 mt-1">
                      <svg
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 dark:text-gray-300"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Streaming / thinking indicator */}
            {isLoading && (
              <div className="flex gap-2 sm:gap-3 justify-start">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 mt-1">
                  <svg
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                  </svg>
                </div>
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                  <TypingDots />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="text-center">
                <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2 inline-block">
                  {error.message || "Something went wrong. Please try again."}
                </p>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── Input bar ── */}
          <div className="shrink-0 px-3 sm:px-5 py-3 bg-gray-50 dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm px-3 sm:px-4 py-2.5 sm:py-3 flex items-end gap-2 sm:gap-3">
              <textarea
                ref={textareaRef}
                className="flex-1 bg-transparent resize-none outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 max-h-36 leading-relaxed"
                placeholder="Ask a question about your documents…"
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
                aria-label="Send"
              >
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 12h14M12 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
            <p className="text-center text-[10px] text-gray-400 dark:text-gray-600 mt-1.5 hidden sm:block">
              Cmd/Ctrl + Enter to send
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
