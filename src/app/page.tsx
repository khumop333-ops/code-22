"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import SettingsModal, { type EndpointSettings } from "@/components/SettingsModal";
import Markdown from "@/components/Markdown";
import type { Conversation, Message } from "@/lib/types";

const DEFAULT_ENDPOINT: EndpointSettings = {
  baseUrl: "https://distributed-guide-monitors-reached.trycloudflare.com/v1",
  modelId: "hf.co/huihui-ai/Huihui-Qwen3.8-27B-abliterated-GGUF:Q4_K_M",
  apiKey: "ollama",
};
const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";
const DEFAULT_TEMPERATURE = 0.7;

const SUGGESTIONS = [
  "Explain how GGUF quantization works in simple terms.",
  "Write a Python script to parse a CSV and plot the results.",
  "What are the trade-offs of running LLMs on Kaggle vs. a local GPU?",
  "Draft a concise README for my new open-source project.",
];

function tempId() {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [endpoint, setEndpoint] = useState<EndpointSettings>(DEFAULT_ENDPOINT);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // ---- hydrate settings from localStorage ----
  useEffect(() => {
    try {
      const raw = localStorage.getItem("hqkw.endpoint");
      if (raw) setEndpoint({ ...DEFAULT_ENDPOINT, ...JSON.parse(raw) });
      const params = localStorage.getItem("hqkw.params");
      if (params) {
        const p = JSON.parse(params);
        if (typeof p.systemPrompt === "string") setSystemPrompt(p.systemPrompt);
        if (typeof p.temperature === "number") setTemperature(p.temperature);
      }
    } catch {
      /* ignore corrupt localStorage */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("hqkw.endpoint", JSON.stringify(endpoint));
  }, [endpoint]);

  useEffect(() => {
    localStorage.setItem("hqkw.params", JSON.stringify({ systemPrompt, temperature }));
  }, [systemPrompt, temperature]);

  // ---- data loading ----
  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setConversations(data.conversations ?? []);
      else setError(data.error ?? "Failed to load conversations.");
    } catch (err) {
      setError(`Failed to load conversations: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  const loadConversation = useCallback(async (id: string) => {
    setLoadingMessages(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load conversation.");
      setMessages(data.messages ?? []);
      if (data.conversation?.system_prompt) setSystemPrompt(data.conversation.system_prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const selectConversation = (id: string) => {
    setActiveId(id);
    setSidebarOpen(false);
    loadConversation(id);
  };

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setError(null);
    setSidebarOpen(false);
    inputRef.current?.focus();
  };

  const deleteConversation = async (id: string) => {
    const target = conversations.find((c) => c.id === id);
    if (!window.confirm(`Delete "${target?.title ?? "this chat"}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete.");
      if (activeId === id) newChat();
      refreshConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const renameConversation = async (id: string, title: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Rename failed.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      refreshConversations();
    }
  };

  // ---- auto-scroll ----
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  };

  // ---- send / stream ----
  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setError(null);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    const userTemp: Message = {
      id: tempId(),
      conversation_id: activeId ?? "pending",
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    const assistantTemp: Message = {
      id: tempId(),
      conversation_id: activeId ?? "pending",
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userTemp, assistantTemp]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeId,
          message: text,
          systemPrompt,
          temperature,
          baseUrl: endpoint.baseUrl || null,
          modelId: endpoint.modelId || null,
          apiKey: endpoint.apiKey || null,
        }),
        signal: controller.signal,
      });

      const returnedConversationId = res.headers.get("X-Conversation-Id");

      if (!res.ok || !res.body) {
        let msg = `Request failed with HTTP ${res.status}.`;
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {
          /* keep default */
        }
        throw new Error(msg);
      }

      if (returnedConversationId && returnedConversationId !== activeId) {
        setActiveId(returnedConversationId);
        setMessages((prev) =>
          prev.map((m) =>
            m.conversation_id === "pending" ? { ...m, conversation_id: returnedConversationId } : m
          )
        );
      }

      // Stream plain-text deltas from the server.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const snapshot = acc;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantTemp.id ? { ...m, content: snapshot } : m))
        );
      }

      // Canonical sync from the server (gets real ids + ordering).
      const finalId = returnedConversationId ?? activeId;
      if (finalId) {
        const sync = await fetch(`/api/conversations/${finalId}`, { cache: "no-store" });
        if (sync.ok) {
          const data = await sync.json();
          setMessages(data.messages ?? []);
        }
      }
      refreshConversations();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User stopped generation — keep whatever streamed in.
        const finalId = activeId;
        if (finalId) {
          const sync = await fetch(`/api/conversations/${finalId}`, { cache: "no-store" }).catch(
            () => null
          );
          if (sync?.ok) {
            const data = await sync.json();
            setMessages(data.messages ?? []);
          }
        }
      } else {
        setError(err instanceof Error ? err.message : String(err));
        // Drop the empty assistant placeholder on hard failure; keep the user turn visible.
        setMessages((prev) =>
          prev.filter((m) => !(m.id === assistantTemp.id && m.content === ""))
        );
        const finalId = activeId;
        if (finalId) {
          const sync = await fetch(`/api/conversations/${finalId}`, { cache: "no-store" }).catch(
            () => null
          );
          if (sync?.ok) {
            const data = await sync.json();
            setMessages(data.messages ?? []);
          }
        }
        refreshConversations();
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  const copyMessage = async (m: Message) => {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopiedId(m.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const activeTitle = activeId
    ? conversations.find((c) => c.id === activeId)?.title ?? "Chat"
    : "New Chat";

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-ink-950">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        loading={loadingConvs}
        onSelect={selectConversation}
        onNewChat={newChat}
        onDelete={deleteConversation}
        onRename={renameConversation}
        onOpenSettings={() => setSettingsOpen(true)}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main column */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex items-center gap-2 border-b border-ink-800 bg-ink-900/60 px-3 py-2.5 backdrop-blur sm:px-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-slate-400 hover:bg-ink-800 hover:text-slate-100 md:hidden"
            aria-label="Open sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          </button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">
            {activeTitle}
          </h1>
          <button
            onClick={() => setPromptOpen((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
              promptOpen
                ? "border-accent/50 bg-accent/10 text-accent"
                : "border-ink-700 text-slate-400 hover:text-slate-100"
            }`}
            aria-pressed={promptOpen}
            title="System prompt & temperature"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 8h10M18 8h2M4 16h4M12 16h8" strokeLinecap="round" />
              <circle cx="16" cy="8" r="2" />
              <circle cx="10" cy="16" r="2" />
            </svg>
            <span className="hidden sm:inline">Prompt &amp; Temp</span>
          </button>
          <div
            className="hidden max-w-[220px] items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1.5 lg:flex"
            title={endpoint.modelId}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="truncate font-mono text-[10px] text-slate-400">
              {endpoint.modelId.split("/").pop()}
            </span>
          </div>
        </header>

        {/* Collapsible system prompt + temperature panel */}
        {promptOpen && (
          <div className="border-b border-ink-800 bg-ink-900/80 px-4 py-3">
            <div className="mx-auto grid w-full max-w-4xl gap-3 md:grid-cols-[1fr_220px]">
              <div>
                <label htmlFor="system-prompt" className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  System prompt
                </label>
                <textarea
                  id="system-prompt"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={2}
                  className="slim-scroll w-full resize-y rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-xs leading-relaxed text-slate-200 outline-none placeholder:text-slate-600 focus:border-accent/60"
                  placeholder="You are a helpful assistant."
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor="temperature" className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    Temperature
                  </label>
                  <span className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] text-accent">
                    {temperature.toFixed(1)}
                  </span>
                </div>
                <input
                  id="temperature"
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  className="mt-2 w-full accent-[#7c9cff]"
                />
                <div className="mt-1 flex justify-between text-[9px] uppercase tracking-wider text-slate-600">
                  <span>Precise</span>
                  <span>Creative</span>
                </div>
                <button
                  onClick={() => {
                    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
                    setTemperature(DEFAULT_TEMPERATURE);
                  }}
                  className="mt-2 text-[10px] font-medium text-slate-600 transition hover:text-slate-300"
                >
                  Reset prompt &amp; temperature
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-2">
            <div className="mx-auto flex max-w-4xl items-start gap-2 text-xs text-red-300">
              <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
                <circle cx="12" cy="12" r="9" />
              </svg>
              <span className="flex-1 leading-relaxed">{error}</span>
              <button
                onClick={() => setSettingsOpen(true)}
                className="shrink-0 rounded border border-red-500/40 px-2 py-1 text-[10px] font-semibold uppercase text-red-200 hover:bg-red-500/10"
              >
                Settings
              </button>
              <button
                onClick={() => setError(null)}
                className="shrink-0 rounded p-1 text-red-400 hover:text-red-200"
                aria-label="Dismiss error"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="slim-scroll flex-1 overflow-y-auto">
          {loadingMessages ? (
            <div className="mx-auto max-w-4xl space-y-4 p-6">
              {[0, 1].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-ink-850" />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-6 px-6 py-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent via-indigo-400 to-purple-500 text-2xl font-black text-ink-950 shadow-lg shadow-accent/20">
                HQ
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-100">Chat with Huihui Qwen 3.8</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                  Served from a Kaggle notebook via Ollama + Cloudflare quick tunnel.
                  <br />
                  If the tunnel went down, update it in Settings — no redeploy needed.
                </p>
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setInput(s);
                      inputRef.current?.focus();
                    }}
                    className="rounded-xl border border-ink-700 bg-ink-900 px-3 py-2.5 text-left text-[11px] leading-snug text-slate-400 transition hover:border-accent/40 hover:text-slate-100"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
              {messages.map((m) => {
                const isUser = m.role === "user";
                const isPendingAssistant = m.role === "assistant" && m.content === "" && streaming;
                return (
                  <div key={m.id} className={`group flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
                    <div
                      className={`flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg text-[11px] font-black ${
                        isUser
                          ? "bg-ink-700 text-slate-200"
                          : "bg-gradient-to-br from-accent to-purple-500 text-ink-950"
                      }`}
                      aria-hidden="true"
                    >
                      {isUser ? "YOU" : "HQ"}
                    </div>
                    <div className={`min-w-0 max-w-[85%] sm:max-w-[75%] ${isUser ? "flex flex-col items-end" : ""}`}>
                      <div
                        className={
                          isUser
                            ? "rounded-2xl rounded-tr-md bg-accent/15 px-4 py-2.5 text-[0.925rem] leading-relaxed text-slate-100"
                            : "rounded-2xl rounded-tl-md border border-ink-800 bg-ink-900 px-4 py-2.5"
                        }
                      >
                        {isPendingAssistant ? (
                          <span className="flex items-center gap-1.5 py-1" aria-label="Model is thinking">
                            {[0, 1, 2].map((i) => (
                              <span
                                key={i}
                                className="h-2 w-2 animate-bounce rounded-full bg-slate-500"
                                style={{ animationDelay: `${i * 140}ms` }}
                              />
                            ))}
                          </span>
                        ) : isUser ? (
                          <span className="whitespace-pre-wrap">{m.content}</span>
                        ) : (
                          <Markdown content={m.content} />
                        )}
                      </div>
                      <button
                        onClick={() => copyMessage(m)}
                        className="mt-1 flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium text-slate-600 opacity-0 transition hover:text-slate-200 focus:opacity-100 group-hover:opacity-100"
                        aria-label="Copy message"
                      >
                        {copiedId === m.id ? (
                          "Copied!"
                        ) : (
                          <>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="9" y="9" width="11" height="11" rx="2" />
                              <path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" />
                            </svg>
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-ink-800 bg-ink-900/60 p-3 backdrop-blur sm:p-4">
          <div className="mx-auto max-w-4xl">
            <div className="flex items-end gap-2 rounded-2xl border border-ink-700 bg-ink-850 p-2 shadow-lg shadow-black/30 focus-within:border-accent/50">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autoGrow(e.target);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder="Message Huihui Qwen…  (Enter to send, Shift+Enter for newline)"
                className="slim-scroll max-h-[220px] flex-1 resize-none bg-transparent px-2 py-2 text-[0.925rem] leading-relaxed text-slate-100 outline-none placeholder:text-slate-600"
                aria-label="Chat message input"
              />
              {streaming ? (
                <button
                  onClick={stop}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-500/50 bg-red-500/15 text-red-300 transition hover:bg-red-500/25"
                  aria-label="Stop generating"
                  title="Stop generating"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={send}
                  disabled={!input.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-ink-950 transition hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Send message"
                  title="Send"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>
            <p className="mt-1.5 text-center text-[9px] uppercase tracking-widest text-slate-700">
              Huihui Qwen · abliterated GGUF on Kaggle · conversations stored in Supabase
            </p>
          </div>
        </div>
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={endpoint}
        onSave={setEndpoint}
        onResetDefaults={() => setEndpoint(DEFAULT_ENDPOINT)}
      />
    </div>
  );
}
