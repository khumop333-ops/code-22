# Huihui Qwen — Kaggle Chat Web App

Dark-mode, OpenAI-compatible chat web app pre-configured for an Huihui Qwen GGUF model
served from a Kaggle notebook (Ollama + Cloudflare quick tunnel), with conversations
persisted in Supabase.

- **Endpoint Base URL:** `https://distributed-guide-monitors-reached.trycloudflare.com/v1`
- **Model ID:** `hf.co/huihui-ai/Huihui-Qwen3.8-27B-abliterated-GGUF:Q4_K_M`
- **Default API key:** `ollama` (read from `LLM_API_KEY` on the server)

> ⚠️ Cloudflare quick-tunnel URLs **change every time the Kaggle kernel restarts**.
> When that happens, either update `LLM_BASE_URL`, or just open **Settings** in the app
> and paste the new URL — overrides are stored in your browser and take effect
> immediately, no redeploy needed.

## Features

- 🗨️ Streaming responses (server-sent events from the endpoint, re-streamed as plain text)
- 📝 Markdown + GFM rendering with syntax styling and per-code-block **copy buttons**
- 💾 Conversations & messages persisted in Supabase (survives reloads, per conversation)
- 🎛️ System prompt editor and temperature slider (0–2)
- ⚙️ Settings modal: live override of **Base URL**, **Model ID**, and **API Key**
  (browser-local, sent per request; blank field = fall back to server env vars)
- 🔌 **Test connection** button in Settings (pings `{baseUrl}/models`)
- 🔍 Sidebar: search, rename, delete, and switch between saved chats
- 🛑 Stop button to abort generation mid-stream (partial reply is still saved)
- 🧹 Clean, actionable error messages when the tunnel is offline or the URL changed

**No model weights are in this repo** — `.gguf`/`.safetensors` files are git-ignored.

## Tech stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS 3 · `react-markdown` · Supabase (server-side, service role)

## Environment variables

Server-side only — never exposed to the browser bundle.

| Variable | Description |
| --- | --- |
| `LLM_BASE_URL` | OpenAI-compatible base URL, including `/v1` |
| `LLM_MODEL_ID` | Model ID as exposed by the endpoint |
| `LLM_API_KEY` | Bearer token sent to the endpoint (`ollama` for Ollama) |
| `SUPABASE_URL` | e.g. `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (server-only, bypasses RLS) |

Copy `.env.example` to `.env.local` for local development.

## Supabase schema

Two tables, `RLS enabled with no public policies` — all access goes through the
server API routes using the service role key.

```sql
conversations(id uuid PK, title text, system_prompt text, created_at, updated_at)
messages(id uuid PK, conversation_id uuid FK → conversations ON DELETE CASCADE,
         role text CHECK (user|assistant|system), content text, created_at)
```

`updated_at` on `conversations` is bumped automatically by a trigger on message insert,
which keeps the sidebar ordering fresh.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in SUPABASE_SERVICE_ROLE_KEY (and LLM_* if different)
npm run dev                  # http://localhost:3000
```

## API routes

| Route | Purpose |
| --- | --- |
| `POST /api/chat` | Streaming chat completion; creates/loads conversation, persists both turns |
| `GET /api/conversations` | List conversations (newest first) |
| `POST /api/conversations` | Create an empty conversation |
| `GET /api/conversations/[id]` | Conversation + messages |
| `PATCH /api/conversations/[id]` | Rename / update system prompt |
| `DELETE /api/conversations/[id]` | Delete (messages cascade) |
| `POST /api/test-connection` | Ping the endpoint's `/models` for Settings → Test connection |

## Deployment (Vercel)

1. Push this repo to GitHub.
2. Import it as a Vercel project (framework preset: Next.js).
3. Set the environment variables listed above (Production + Preview).
4. Deploy. The Vercel runtime can reach both Supabase and the Cloudflare tunnel,
   so the app works fully there even if the tunnel is unreachable from your network.
