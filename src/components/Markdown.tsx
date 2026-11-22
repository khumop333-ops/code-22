"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyText(text);
        setState(ok ? "copied" : "failed");
        window.setTimeout(() => setState("idle"), 1600);
      }}
      className="rounded-md border border-ink-700 bg-ink-800/80 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-slate-300 transition hover:border-ink-600 hover:text-white"
      aria-label="Copy code to clipboard"
    >
      {state === "copied" ? "Copied!" : state === "failed" ? "Failed" : "Copy"}
    </button>
  );
}

export default function Markdown({ content }: { content: string }) {
  return (
    <div className="md-body text-[0.925rem] text-slate-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const raw = String(children ?? "");
            const langMatch = /language-([\w+-]+)/.exec(className ?? "");
            const isBlock = Boolean(langMatch) || raw.includes("\n");

            if (!isBlock) {
              return (
                <code
                  className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[0.82em] text-accent"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            const code = raw.replace(/\n$/, "");
            const lang = langMatch?.[1] ?? "text";
            return (
              <span className="my-3 block overflow-hidden rounded-xl border border-ink-700 bg-[#0d1017]">
                <span className="flex items-center justify-between border-b border-ink-700 bg-ink-900 px-3 py-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    {lang}
                  </span>
                  <CopyButton text={code} />
                </span>
                <pre className="slim-scroll overflow-x-auto p-3 text-[0.82rem] leading-relaxed">
                  <code className="font-mono text-slate-100">{code}</code>
                </pre>
              </span>
            );
          },
          pre({ children }) {
            // The custom `code` block above renders its own <pre>; unwrap the default one.
            return <>{children}</>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
