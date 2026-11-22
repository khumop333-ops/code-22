import { getLlmConfig, getSupabaseAdmin } from "@/lib/server";
import type { ChatRole } from "@/lib/types";

export const runtime = "nodejs";
// Kaggle/Ollama cold starts can be slow — allow long streams.
export const maxDuration = 300;

interface IncomingMessage {
  role: ChatRole;
  content: string;
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function friendlyFetchError(baseUrl: string, err: unknown): string {
  const cause =
    err instanceof Error
      ? ((err as Error & { cause?: { code?: string; message?: string } }).cause ?? null)
      : null;
  const code = cause?.code ?? "";
  const detail = err instanceof Error ? err.message : String(err);

  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(detail)) {
    return `Could not resolve the host for ${baseUrl}. The tunnel URL has likely changed (Kaggle restarts get a new *.trycloudflare.com URL). Update it in Settings → Base URL.`;
  }
  if (code === "ECONNREFUSED" || code === "ECONNRESET") {
    return `Connection to ${baseUrl} was refused/reset. The Kaggle session may have stopped or Ollama may not be running. Check the notebook and update Settings if the tunnel URL changed.`;
  }
  if (code === "ETIMEDOUT" || /timeout|timed out|abort/i.test(detail)) {
    return `Timed out talking to ${baseUrl}. The model may still be loading (cold start) — try again in a minute.`;
  }
  if (/certificate|self.signed|UNABLE_TO_VERIFY/i.test(detail)) {
    return `TLS/certificate error from ${baseUrl}: ${detail}`;
  }
  return `Could not reach the LLM endpoint at ${baseUrl} (${detail}). The Kaggle tunnel may be offline or the URL may have changed — update it in Settings.`;
}

export async function POST(req: Request) {
  let body: {
    conversationId?: string | null;
    message?: string;
    systemPrompt?: string;
    temperature?: number;
    baseUrl?: string | null;
    modelId?: string | null;
    apiKey?: string | null;
  };

  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const message = (body.message ?? "").trim();
  if (!message) return jsonError("Message must not be empty.", 400);

  const systemPrompt = (body.systemPrompt ?? "You are a helpful assistant.").trim();
  const temperature =
    typeof body.temperature === "number" && Number.isFinite(body.temperature)
      ? Math.min(2, Math.max(0, body.temperature))
      : 0.7;

  const { baseUrl, modelId, apiKey } = getLlmConfig({
    baseUrl: body.baseUrl,
    modelId: body.modelId,
    apiKey: body.apiKey,
  });

  if (!baseUrl) {
    return jsonError("No LLM Base URL configured. Set LLM_BASE_URL or enter one in Settings.", 400);
  }
  if (!modelId) {
    return jsonError("No Model ID configured. Set LLM_MODEL_ID or enter one in Settings.", 400);
  }

  // ---- Supabase: ensure conversation, persist the user message ----
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Supabase is not configured.", 500);
  }

  let conversationId = body.conversationId ?? null;

  try {
    if (conversationId) {
      const { data, error } = await supabase
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        // Stale id from the client — start a fresh conversation instead of failing.
        conversationId = null;
      }
    }

    if (!conversationId) {
      const title = message.replace(/\s+/g, " ").slice(0, 64) || "New Chat";
      const { data, error } = await supabase
        .from("conversations")
        .insert({ title, system_prompt: systemPrompt })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      conversationId = data.id as string;
    } else if (systemPrompt) {
      // Keep the conversation's stored system prompt in sync with what the UI sent.
      await supabase.from("conversations").update({ system_prompt: systemPrompt }).eq("id", conversationId);
    }
  } catch (err) {
    return jsonError(
      `Database error while preparing the conversation: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }

  // Load prior history (excluding the message we're about to insert).
  let history: IncomingMessage[] = [];
  try {
    const { data, error } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    history = (data ?? []) as IncomingMessage[];
  } catch (err) {
    return jsonError(
      `Database error while loading history: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }

  // Persist the user message.
  try {
    const { error } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, role: "user", content: message });
    if (error) throw new Error(error.message);
  } catch (err) {
    return jsonError(
      `Database error while saving your message: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }

  const openAiMessages = [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    ...history,
    { role: "user" as const, content: message },
  ];

  // ---- Call the OpenAI-compatible endpoint (streaming) ----
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 240_000);

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: modelId,
        messages: openAiMessages,
        temperature,
        stream: true,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    clearTimeout(timeout);
    return jsonError(friendlyFetchError(baseUrl, err), 502);
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timeout);
    const raw = await upstream.text().catch(() => "");
    let detail = raw.trim().slice(0, 500);
    try {
      const parsed = JSON.parse(raw);
      detail = parsed?.error?.message ?? parsed?.message ?? parsed?.error ?? detail;
    } catch {
      /* not JSON — keep raw detail */
    }
    const hint =
      upstream.status === 404
        ? " — check the Base URL path (it should end with /v1) and that the model ID exists on this endpoint."
        : upstream.status === 401 || upstream.status === 403
          ? " — the API key was rejected. Check LLM_API_KEY / Settings → API Key."
          : "";
    return jsonError(
      `LLM endpoint returned HTTP ${upstream.status} from ${baseUrl}/chat/completions${hint}${detail ? ` — ${detail}` : ""}`,
      502
    );
  }

  // ---- Pipe the upstream SSE stream through as plain text, capturing the assistant reply ----
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let assistantText = "";
  let buffer = "";
  let saved = false;

  const persistAssistant = async () => {
    if (saved) return;
    saved = true;
    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: assistantText,
      });
      if (error) console.error("Failed to persist assistant message:", error.message);
    } catch (err) {
      console.error("Failed to persist assistant message:", err);
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      const reader = upstream.body!.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;

            try {
              const json = JSON.parse(payload);
              const delta: string =
                json?.choices?.[0]?.delta?.content ??
                json?.choices?.[0]?.message?.content ??
                "";
              if (delta) {
                assistantText += delta;
                streamController.enqueue(encoder.encode(delta));
              }
            } catch {
              // Unparseable SSE payload (e.g. keep-alive) — skip it.
              console.warn("Skipping unparseable SSE line:", payload.slice(0, 120));
            }
          }
        }
        await persistAssistant();
        streamController.close();
      } catch (err) {
        // Upstream broke mid-stream — keep whatever we have.
        await persistAssistant();
        streamController.error(
          new Error(
            `Stream from the LLM endpoint was interrupted: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      } finally {
        clearTimeout(timeout);
      }
    },
    async cancel() {
      // Client disconnected / aborted — still persist the partial reply.
      clearTimeout(timeout);
      await persistAssistant();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Conversation-Id": conversationId,
    },
  });
}
