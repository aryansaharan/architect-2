import "server-only";
import type { SessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";

/**
 * Who may build, preview, ask the AI of and download a code app in the studio: its owner (read through
 * their own session, so row-level security decides) or someone the owner invited to the app (matched
 * on the account they accepted with, or the verified email they were invited at; guests never match).
 * Read-only: accepting an invitation is lib/apps/access.ts's job.
 */
export type CodeProjectRole = "owner" | "member";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function codeProjectFor<T extends Record<string, unknown>>(projectId: string, user: SessionUser, columns: string): Promise<{ row: T; role: CodeProjectRole } | null> {
  if (typeof projectId !== "string" || !UUID.test(projectId)) return null;
  const supa = await createClient();
  const { data, error } = await supa.from("projects").select(columns).eq("id", projectId).maybeSingle();
  if (error) console.error("[code-apps] project read failed", error.message);
  if (data) return { row: data as unknown as T, role: "owner" };
  if (user.isAnonymous || !hasAdmin()) return null;
  const admin = adminClient();
  const email = user.email?.toLowerCase();
  const { data: byId } = await admin.from("app_members").select("email").eq("project_id", projectId).eq("user_id", user.id).maybeSingle();
  const invited = byId ?? (email ? (await admin.from("app_members").select("email").eq("project_id", projectId).eq("email", email).maybeSingle()).data : null);
  if (!invited) return null;
  const { data: row } = await admin.from("projects").select(columns).eq("id", projectId).maybeSingle();
  return row ? { row: row as unknown as T, role: "member" } : null;
}
