import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Huihui Qwen — Kaggle Chat",
  description:
    "Dark-mode chat client for an OpenAI-compatible Huihui Qwen endpoint served from Kaggle (Ollama + Cloudflare tunnel), with persistent conversations in Supabase.",
};

export const viewport: Viewport = {
  themeColor: "#0b0e14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-ink-950 text-slate-200 antialiased">{children}</body>
    </html>
  );
}
