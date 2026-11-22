"use client";

import { useState } from "react";
import type { Conversation } from "@/lib/types";

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Sidebar({
  conversations,
  activeId,
  loading,
  onSelect,
  onNewChat,
  onDelete,
  onRename,
  onOpenSettings,
  open,
  onClose,
}: {
  conversations: Conversation[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onOpenSettings: () => void;
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(query.trim().toLowerCase())
  );

  const commitRename = (id: string) => {
    const t = editValue.trim();
    if (t) onRename(id, t);
    setEditingId(null);
  };

  return (
    <>
      {/* mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[290px] shrink-0 flex-col border-r border-ink-800 bg-ink-900 transition-transform duration-200 md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-ink-800 p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-purple-500 text-sm font-black text-ink-950">
            HQ
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-100">Huihui Qwen</div>
            <div className="truncate text-[10px] uppercase tracking-widest text-slate-500">
              Kaggle · OpenAI-compatible
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-ink-800 hover:text-slate-100 md:hidden"
            aria-label="Close sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* New chat */}
        <div className="p-3 pb-2">
          <button
            onClick={onNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5 text-sm font-semibold text-accent transition hover:border-accent hover:bg-accent/20"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            New Chat
          </button>
          <div className="relative mt-2">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats…"
              className="w-full rounded-lg border border-ink-700 bg-ink-850 py-2 pl-9 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-accent/60"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="slim-scroll flex-1 overflow-y-auto px-2 pb-2">
          {loading ? (
            <div className="space-y-2 p-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-ink-850" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-slate-600">
              {conversations.length === 0 ? "No saved chats yet." : "No chats match your search."}
            </p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((c) => {
                const active = c.id === activeId;
                const editing = c.id === editingId;
                return (
                  <li key={c.id}>
                    <div
                      className={`group relative rounded-lg border px-3 py-2 transition ${
                        active
                          ? "border-accent/50 bg-accent/10"
                          : "border-transparent hover:border-ink-700 hover:bg-ink-850"
                      }`}
                    >
                      {editing ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => commitRename(c.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename(c.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="w-full rounded border border-accent/50 bg-ink-900 px-2 py-1 text-xs text-slate-100 outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => onSelect(c.id)}
                          className="block w-full text-left"
                          title={c.title}
                        >
                          <span className="block truncate pr-14 text-[13px] font-medium text-slate-200">
                            {c.title}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-slate-500">
                            {timeAgo(c.updated_at)}
                          </span>
                        </button>
                      )}

                      {!editing && (
                        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                          <button
                            onClick={() => {
                              setEditingId(c.id);
                              setEditValue(c.title);
                            }}
                            className="rounded-md p-1.5 text-slate-500 hover:bg-ink-800 hover:text-slate-200"
                            aria-label="Rename chat"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 20h9" strokeLinecap="round" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4Z" strokeLinejoin="round" />
                            </svg>
                          </button>
                          <button
                            onClick={() => onDelete(c.id)}
                            className="rounded-md p-1.5 text-slate-500 hover:bg-ink-800 hover:text-red-400"
                            aria-label="Delete chat"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer / settings */}
        <div className="border-t border-ink-800 p-3">
          <button
            onClick={onOpenSettings}
            className="flex w-full items-center gap-2 rounded-xl border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:border-ink-600 hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3.2" />
              <path
                d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Settings
            <span className="ml-auto text-[10px] uppercase tracking-widest text-slate-600">
              Endpoint
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
