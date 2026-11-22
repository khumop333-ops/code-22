import { getSupabaseAdmin } from "@/lib/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/conversations/[id] — conversation + messages
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const supabase = getSupabaseAdmin();

    const { data: conversation, error: convErr } = await supabase
      .from("conversations")
      .select("id, title, system_prompt, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!conversation) return Response.json({ error: "Conversation not found." }, { status: 404 });

    const { data: messages, error: msgErr } = await supabase
      .from("messages")
      .select("id, conversation_id, role, content, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    if (msgErr) throw new Error(msgErr.message);

    return Response.json({ conversation, messages: messages ?? [] });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load conversation." },
      { status: 500 }
    );
  }
}

// PATCH /api/conversations/[id] — rename and/or update system prompt
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: { title?: string; systemPrompt?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const patch: Record<string, string> = {};
  if (typeof body.title === "string") {
    const t = body.title.trim().slice(0, 120);
    if (t) patch.title = t;
  }
  if (typeof body.systemPrompt === "string") {
    patch.system_prompt = body.systemPrompt.trim();
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("conversations")
      .update(patch)
      .eq("id", id)
      .select("id, title, system_prompt, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return Response.json({ error: "Conversation not found." }, { status: 404 });
    return Response.json({ conversation: data });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to update conversation." },
      { status: 500 }
    );
  }
}

// DELETE /api/conversations/[id] — delete conversation (messages cascade)
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("conversations").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to delete conversation." },
      { status: 500 }
    );
  }
}
