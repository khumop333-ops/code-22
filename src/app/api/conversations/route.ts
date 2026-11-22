import { getSupabaseAdmin } from "@/lib/server";

export const runtime = "nodejs";

// GET /api/conversations — list all conversations, newest first
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("conversations")
      .select("id, title, system_prompt, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return Response.json({ conversations: data ?? [] });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to list conversations." },
      { status: 500 }
    );
  }
}

// POST /api/conversations — create an empty conversation
export async function POST(req: Request) {
  let body: { title?: string; systemPrompt?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("conversations")
      .insert({
        title: (body.title ?? "New Chat").trim().slice(0, 120) || "New Chat",
        system_prompt: (body.systemPrompt ?? "You are a helpful assistant.").trim(),
      })
      .select("id, title, system_prompt, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return Response.json({ conversation: data }, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to create conversation." },
      { status: 500 }
    );
  }
}
