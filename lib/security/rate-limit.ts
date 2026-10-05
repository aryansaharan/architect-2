import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";

/**
 * Fixed-window rate limits kept in Postgres (public.rate_limit_hit), so they hold across
 * every serverless instance. A key is a person's id or a hashed IP address plus what they're doing.
 */
export async function withinLimit(key: string, max: number, windowSeconds: number, opts: { failOpen?: boolean } = {}): Promise<boolean> {
  if (!hasAdmin()) return Boolean(opts.failOpen);
  const { data, error } = await adminClient().rpc("rate_limit_hit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
  if (error) {
    console.error("rate limit check failed", error.message);
    return Boolean(opts.failOpen);
  }
  return data === true;
}

/**
 * New guests and demo seeds per network per hour. Guests have no model budget, so these only guard the
 * database (idle guests are removed after a week); they are generous because offices and campuses
 * share one address.
 */
export const GUEST_LIMIT = { max: 30, windowSeconds: 3600 } as const;
export const DEMO_LIMIT = { max: 20, windowSeconds: 3600 } as const;

/** The visitor's IP address as Vercel reports it, hashed so it is never stored readable. */
export async function visitorKey(): Promise<string> {
  const h = await headers();
  // Vercel sets x-vercel-forwarded-for itself, so a visitor can't pick their own address; x-forwarded-for is
  // only the fallback for running elsewhere (and locally, where anyone can set it).
  const ip = h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return "ip:" + createHash("sha256").update(`${process.env.RATE_LIMIT_SALT ?? "prodai"}:${ip}`).digest("hex").slice(0, 32);
}
