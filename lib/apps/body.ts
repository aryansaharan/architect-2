import "server-only";

/** The most a published app's write request may carry. A record holds at most 20 KB of data. */
export const MAX_BODY_BYTES = 64 * 1024;

export type JsonBody = { ok: true; value: unknown } | { ok: false; response: Response };

/**
 * A request's JSON, read only when it's small enough: the declared length is checked before reading
 * and the read length after (a client can leave the header out or get it wrong). Too big is 413,
 * anything that isn't JSON is 400, both with a plain sentence.
 */
export async function readJsonBody(req: Request, limit = MAX_BODY_BYTES): Promise<JsonBody> {
  const tooBig = () => ({ ok: false as const, response: Response.json({ error: "That's too much to send at once. Keep it under 64 KB." }, { status: 413 }) });
  const invalid = () => ({ ok: false as const, response: Response.json({ error: "That request wasn't valid." }, { status: 400 }) });
  if (Number(req.headers.get("content-length") ?? 0) > limit) return tooBig();
  const raw = await req.text().catch(() => null);
  if (raw === null) return invalid();
  if (new TextEncoder().encode(raw).length > limit) return tooBig();
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
    return { ok: true, value };
  } catch {
    return invalid();
  }
}
