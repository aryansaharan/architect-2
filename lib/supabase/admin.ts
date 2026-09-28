import "server-only";
import { createClient as createPlainClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";

/**
 * The server's trusted connection. It skips row-level security, so it is used only for rows
 * people must never write themselves: the spend meter, rate limits, model budget holds,
 * published sites and abuse reports. Every caller checks who is asking first.
 */
let admin: SupabaseClient | null = null;

export function hasAdmin(): boolean {
  return Boolean(SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

export function adminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !key) throw new Error("SUPABASE_SECRET_KEY is not set");
  admin ??= createPlainClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
