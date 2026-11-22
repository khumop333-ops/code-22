import { getLlmConfig } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/test-connection — ping {baseUrl}/models to verify the endpoint is reachable
export async function POST(req: Request) {
  let body: { baseUrl?: string | null; modelId?: string | null; apiKey?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body — use server env */
  }

  const { baseUrl, modelId, apiKey } = getLlmConfig(body);
  if (!baseUrl) {
    return Response.json({ ok: false, message: "No Base URL configured." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      return Response.json(
        { ok: false, message: `Endpoint reachable but returned HTTP ${res.status}. ${text.slice(0, 200)}` },
        { status: 200 }
      );
    }
    let modelFound: boolean | null = null;
    try {
      const parsed = JSON.parse(text);
      const ids: string[] = Array.isArray(parsed?.data)
        ? parsed.data.map((m: { id?: string }) => m?.id ?? "")
        : [];
      if (ids.length > 0 && modelId) modelFound = ids.includes(modelId);
    } catch {
      /* non-JSON body — still counts as reachable */
    }
    return Response.json({
      ok: true,
      message:
        modelFound === false
          ? `Connected, but the configured Model ID was not listed by the endpoint. Double-check Model ID.`
          : "Connected — the endpoint responded successfully.",
      modelFound,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json(
      {
        ok: false,
        message: `Cannot reach ${baseUrl} (${detail}). The tunnel may be offline or the URL changed.`,
      },
      { status: 200 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
