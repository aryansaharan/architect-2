import "server-only";
import { cache } from "react";
import type { SessionUser } from "@/lib/auth";
import type { Blueprint } from "@/lib/blueprint/schema";
import type { ProjectSettings } from "@/lib/db/types";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";

/**
 * Who is looking at a published app. The owner and the people they invited use its team screens;
 * everyone else sees only its public pages. An invitation is matched on the verified email the
 * person signed in with (Google or an email link); guests have no email, so they are always visitors.
 */
export type AppRole = "owner" | "member" | "visitor";

export type LiveSite = {
  slug: string;
  projectId: string;
  ownerId: string;
  blueprint: Blueprint;
  publishedAt: string;
  settings: ProjectSettings;
};

export const SLUG = /^[a-z0-9-]{3,80}$/;

/** A published site with its owner, or null when it doesn't exist or has been blocked. */
export async function loadSite(slug: string): Promise<LiveSite | null> {
  if (!SLUG.test(slug) || !hasAdmin()) return null;
  const { data, error } = await adminClient()
    .from("live_sites")
    .select("slug, project_id, blueprint, published_at, blocked_at, projects!inner(owner_id, settings)")
    .eq("slug", slug)
    .maybeSingle();
  if (error) console.error("[apps] site read failed", error.message);
  if (!data || data.blocked_at) return null;
  const project = (Array.isArray(data.projects) ? data.projects[0] : data.projects) as { owner_id: string; settings: ProjectSettings };
  return { slug: data.slug, projectId: data.project_id, ownerId: project.owner_id, blueprint: data.blueprint as Blueprint, publishedAt: data.published_at, settings: project.settings };
}

/** The same read, once per request: a published app's page, its metadata and its social image share it. */
export const loadSiteOnce = cache(loadSite);

export async function roleFor(site: LiveSite, user: SessionUser | null): Promise<AppRole> {
  if (!user) return "visitor";
  // A guest who made and published the app owns it too; only invitations need a verified email.
  if (user.id === site.ownerId) return "owner";
  if (user.isAnonymous) return "visitor";
  const admin = adminClient();
  const { data: byId } = await admin.from("app_members").select("email").eq("project_id", site.projectId).eq("user_id", user.id).maybeSingle();
  if (byId) return "member";
  const email = user.email?.toLowerCase();
  if (!email) return "visitor";
  const { data: invited } = await admin.from("app_members").select("email, user_id").eq("project_id", site.projectId).eq("email", email).maybeSingle();
  if (!invited) return "visitor";
  // First visit after the invitation: remember who accepted it.
  if (!invited.user_id) await admin.from("app_members").update({ user_id: user.id, accepted_at: new Date().toISOString() }).eq("project_id", site.projectId).eq("email", email);
  return "member";
}

export const isTeam = (role: AppRole) => role === "owner" || role === "member";
