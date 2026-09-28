import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signs what the server produced (an import analysis) so a later request can prove it wasn't edited
 * in the browser. The key comes from the environment; without one, nothing can be signed or trusted.
 */
function key(): string | null {
  return process.env.SIGNING_SECRET || process.env.SUPABASE_SECRET_KEY || null;
}

export function sign(value: unknown): string | null {
  const k = key();
  return k ? createHmac("sha256", k).update(JSON.stringify(value)).digest("base64url") : null;
}

export function verify(value: unknown, signature: unknown): boolean {
  const expected = sign(value);
  if (!expected || typeof signature !== "string" || signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
