/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState, useCallback } from "react";
import Navigation from "./components/Navigation";
import { DefaultChatTransport } from "ai";
import Image from "next/image";

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
          className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
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

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  const { messages, status, error, setMessages, sendMessage } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  // Load conversations on mount so the sidebar is populated immediately
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

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
    const convId = item.conversation_id ?? item.id;
    conversationIdRef.current = convId;
    setActiveConvId(convId);

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

  const startNewChat = () => {
    setMessages([]);
    setActiveConvId(null);
    conversationIdRef.current = newConversationId();
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      <Navigation />

      {/* ── Desktop: two-column layout / Mobile: stacked ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ════════════════════════════════
            LEFT SIDEBAR — desktop only
            ════════════════════════════════ */}
        <aside className="hidden lg:flex flex-col w-72 xl:w-80 shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
          {/* Sidebar header */}
          <div className="px-5 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <Image
                  src="/jaanu-icon.svg"
                  alt="Jaanu"
                  width={32}
                  height={32}
                  className="rounded-lg"
                />
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-none">Jaanu</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">your buddy search</p>
                </div>
              </div>
            </div>
            <button
              onClick={startNewChat}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New conversation
            </button>
          </div>

          {/* Conversations list */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Conversations
            </span>
            <button
              onClick={fetchHistory}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Refresh"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-4">
            {historyLoading ? (
              <div className="flex flex-col gap-2 mt-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <div className="mt-8 flex flex-col items-center gap-2 text-center px-4">
                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500">No conversations yet.<br />Start a new one below.</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-1 mt-1">
                {history.map((item) => {
                  const key = item.conversation_id ?? item.id;
                  const isActive = activeConvId === key;
                  return (
                    <li key={key}>
                      <button
                        onClick={() => loadFromHistory(item)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl transition-all group ${
                          isActive
                            ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                            : "hover:bg-gray-50 dark:hover:bg-gray-800/60 border border-transparent"
                        }`}
                      >
                        <p className={`text-xs font-medium line-clamp-2 leading-relaxed ${
                          isActive
                            ? "text-blue-700 dark:text-blue-300"
                            : "text-gray-700 dark:text-gray-300"
                        }`}>
                          {item.query}
                        </p>
                        <span className="text-[10px] text-gray-400 mt-1 block">
                          {formatRelativeTime(item.searched_at)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* ════════════════════════════════
            MAIN CHAT AREA
            ════════════════════════════════ */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">

          {/* ── Mobile / tablet top bar ── */}
          <div className="lg:hidden shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-3 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Image src="/jaanu-icon.svg" alt="Jaanu" width={30} height={30} className="rounded-lg" />
              <div>
                <h1 className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-none">Jaanu</h1>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">your buddy search</p>
              </div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={startNewChat}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700 rounded px-2 py-0.5 transition-colors"
              >
                New chat
              </button>
            )}
            <button
              onClick={() => {
                const next = !showHistory;
                setShowHistory(next);
                if (next) fetchHistory();
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>History</span>
              {history.length > 0 && (
                <span className="px-1.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                  {history.length}
                </span>
              )}
            </button>
          </div>

          {/* ── Mobile history overlay ── */}
          {showHistory && (
            <>
              <div
                className="lg:hidden fixed inset-0 z-20 bg-black/40"
                onClick={() => setShowHistory(false)}
              />
              <aside className="lg:hidden fixed bottom-0 left-0 right-0 z-30 max-h-[70vh] flex flex-col bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 rounded-t-2xl shadow-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Conversations</span>
                  <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {historyLoading ? (
                  <div className="px-4 py-6 text-center text-xs text-gray-400">Loading…</div>
                ) : history.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-gray-400">No history yet.</div>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800 overflow-y-auto flex-1">
                    {history.map((item) => {
                      const key = item.conversation_id ?? item.id;
                      return (
                        <li key={key}>
                          <div
                            className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                            onClick={() => setExpandedId(expandedId === key ? null : key)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-medium text-gray-800 dark:text-gray-200 line-clamp-2 flex-1">{item.query}</p>
                              <span className="text-[10px] text-gray-400 shrink-0 mt-0.5">{formatRelativeTime(item.searched_at)}</span>
                            </div>
                            {expandedId === key && (
                              <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-4 mb-2">{item.answer}</p>
                                <button onClick={() => loadFromHistory(item)} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
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

          {/* ── Desktop chat header ── */}
          <div className="hidden lg:flex shrink-0 items-center justify-between px-8 py-4 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {activeConvId
                    ? (history.find(h => (h.conversation_id ?? h.id) === activeConvId)?.query ?? "Conversation")
                    : "New conversation"}
                </p>
                <p className="text-xs text-gray-400">
                  {messages.length > 0
                    ? `${Math.ceil(messages.length / 2)} message${Math.ceil(messages.length / 2) !== 1 ? "s" : ""}`
                    : "Ask anything about your documents"}
                </p>
              </div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={startNewChat}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-lg px-3 py-1.5 transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New chat
              </button>
            )}
          </div>

          {/* ── Scrollable message area ── */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

              {/* Empty state */}
              {messages.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center text-center py-16 gap-5 min-h-[50vh]">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200 dark:shadow-blue-900/40">
                      <Image src="/jaanu-icon.svg" alt="Jaanu" width={40} height={40} className="rounded-xl" />
                    </div>
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-400 rounded-full border-2 border-white dark:border-gray-950" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                      Hi, I&apos;m Jaanu 👋
                    </p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 max-w-sm">
                      Your buddy search — ask me anything about your uploaded documents.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg mt-2">
                    {[
                      "Summarise my documents",
                      "What are the key topics?",
                      "Find specific information",
                      "Compare documents",
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}
                        className="text-left text-xs px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all"
                      >
                        {prompt} →
                      </button>
                    ))}
                  </div>
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
                    className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    {/* AI Avatar */}
                    {!isUser && (
                      <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                        <Image src="/jaanu-icon.svg" alt="Jaanu" width={20} height={20} className="rounded-lg" />
                      </div>
                    )}

                    <div className={`max-w-[78%] flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
                      <div
                        className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                          isUser
                            ? "bg-blue-600 text-white rounded-br-sm shadow-sm shadow-blue-200 dark:shadow-blue-900/30"
                            : "bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-sm shadow-sm"
                        }`}
                      >
                        {textContent}
                      </div>
                    </div>

                    {/* User Avatar */}
                    {isUser && (
                      <div className="w-8 h-8 rounded-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0 mt-0.5">
                        <svg className="w-4 h-4 text-gray-500 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Streaming indicator */}
              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Image src="/jaanu-icon.svg" alt="Jaanu" width={20} height={20} className="rounded-lg" />
                  </div>
                  <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
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
          </div>

          {/* ── Input bar ── */}
          <div className="shrink-0 px-4 sm:px-6 lg:px-8 py-4 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-end gap-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 focus-within:border-blue-400 dark:focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-900/30 transition-all">
                <textarea
                  ref={textareaRef}
                  className="flex-1 bg-transparent resize-none outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 max-h-36 leading-relaxed"
                  placeholder="Ask anything about your documents…"
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors shadow-sm"
                  aria-label="Send"
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              <p className="text-center text-[10px] text-gray-300 dark:text-gray-600 mt-2 hidden sm:block">
                ⌘ + Enter to send
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
