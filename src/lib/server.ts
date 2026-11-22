import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Server-side Supabase client using the service role key.
 * Bypasses RLS — never import this from client components.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server."
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Resolve the LLM endpoint configuration, with optional per-request overrides from the browser. */
export function getLlmConfig(overrides?: {
  baseUrl?: string | null;
  modelId?: string | null;
  apiKey?: string | null;
}) {
  const baseUrl = (overrides?.baseUrl?.trim() || process.env.LLM_BASE_URL || "").replace(/\/+$/, "");
  const modelId = overrides?.modelId?.trim() || process.env.LLM_MODEL_ID || "";
  const apiKey = overrides?.apiKey?.trim() || process.env.LLM_API_KEY || "ollama";

  return { baseUrl, modelId, apiKey };
}
