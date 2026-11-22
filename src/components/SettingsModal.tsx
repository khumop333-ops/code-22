"use client";

import { useEffect, useState } from "react";

export interface EndpointSettings {
  baseUrl: string;
  modelId: string;
  apiKey: string;
}

export default function SettingsModal({
  open,
  onClose,
  settings,
  onSave,
  onResetDefaults,
}: {
  open: boolean;
  onClose: () => void;
  settings: EndpointSettings;
  onSave: (s: EndpointSettings) => void;
  onResetDefaults: () => void;
}) {
  const [draft, setDraft] = useState<EndpointSettings>(settings);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setTestResult(null);
      setShowKey(false);
    }
  }, [open, settings]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: draft.baseUrl || null,
          modelId: draft.modelId || null,
          apiKey: draft.apiKey || null,
        }),
      });
      const data = await res.json();
      setTestResult({ ok: Boolean(data.ok), message: String(data.message ?? "Unknown response.") });
    } catch (err) {
      setTestResult({
        ok: false,
        message: `Test failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const field =
    "w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 font-mono text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-accent/60";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Endpoint settings"
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl shadow-black/60"
      >
        <div className="flex items-center justify-between border-b border-ink-800 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Settings — LLM Endpoint</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Overrides apply in this browser only and are sent per request. Leave a field blank to
              fall back to the server environment variable.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-ink-800 hover:text-slate-100"
            aria-label="Close settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label htmlFor="baseUrl" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Base URL <span className="normal-case text-slate-600">(LLM_BASE_URL)</span>
            </label>
            <input
              id="baseUrl"
              value={draft.baseUrl}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
              placeholder="https://…trycloudflare.com/v1"
              className={field}
              spellCheck={false}
              autoComplete="off"
            />
            <p className="mt-1 text-[10px] text-slate-600">
              Cloudflare tunnel URLs change every time the Kaggle kernel restarts.
            </p>
          </div>

          <div>
            <label htmlFor="modelId" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Model ID <span className="normal-case text-slate-600">(LLM_MODEL_ID)</span>
            </label>
            <input
              id="modelId"
              value={draft.modelId}
              onChange={(e) => setDraft({ ...draft, modelId: e.target.value })}
              placeholder="hf.co/huihui-ai/Huihui-Qwen3.8-27B-abliterated-GGUF:Q4_K_M"
              className={field}
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="apiKey" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              API Key <span className="normal-case text-slate-600">(LLM_API_KEY)</span>
            </label>
            <div className="relative">
              <input
                id="apiKey"
                type={showKey ? "text" : "password"}
                value={draft.apiKey}
                onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                placeholder="ollama"
                className={`${field} pr-16`}
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[10px] font-semibold uppercase text-slate-500 hover:text-slate-200"
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-slate-600">
              Stored only in this browser&rsquo;s localStorage and sent over HTTPS to this app&rsquo;s
              API route. Never committed to the repo.
            </p>
          </div>

          {testResult && (
            <div
              role="status"
              className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${
                testResult.ok
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-red-500/40 bg-red-500/10 text-red-300"
              }`}
            >
              {testResult.message}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-800 px-5 py-4">
          <button
            onClick={onResetDefaults}
            className="rounded-lg px-3 py-2 text-xs font-medium text-slate-500 transition hover:text-slate-200"
          >
            Reset to defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={testConnection}
              disabled={testing}
              className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-ink-600 disabled:opacity-50"
            >
              {testing ? "Testing…" : "Test connection"}
            </button>
            <button
              onClick={() => {
                onSave({
                  baseUrl: draft.baseUrl.trim(),
                  modelId: draft.modelId.trim(),
                  apiKey: draft.apiKey.trim(),
                });
                onClose();
              }}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-ink-950 transition hover:bg-accent-dim"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
