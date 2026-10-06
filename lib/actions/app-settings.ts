"use server";
import { revalidatePath } from "next/cache";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { createClient, type Supa } from "@/lib/supabase/server";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { getLiveSiteForProject, getProject } from "@/lib/db/queries";
import { addLedger, updateProject } from "@/lib/db/writes";
import type { LiveSiteRow, ProjectRow } from "@/lib/db/types";
import { clearSampleRecords, hasSampleRecords } from "@/lib/apps/records";
import { EMAIL_RE, emailConfigured, hashEmail, sendEmail } from "@/lib/email";
import { withinLimit } from "@/lib/security/rate-limit";
import { publicAccess } from "@/lib/apps/view";
import { publicSummary, type PublicSummary } from "@/lib/sim/preflight";
import { siteUrl } from "@/lib/env";

/**
 * The owner's controls for a published app (Publish tab): who may use its team screens, what its
 * public pages show, its sample data and whether visitors may talk to its AI helpers.
 * Every action first reads the project through the person's own session, so row-level security
 * confirms they own it, and then checks the owner id again. Members are written only by the server's
 * admin connection (people can read their own apps' members but never write them).
 */

export type AppMember = { email: string; invitedAt: string; acceptedAt: string | null };
export type AppControls = {
  isGuest: boolean;
  emailReady: boolean;
  members: AppMember[];
  maxMembers: number;
  hasSample: boolean;
  /** The published version: its link and what its public pages show. Null when it isn't online. */
  live: { slug: string; blocked: boolean; summary: PublicSummary } | null;
};
type Fail = { ok: false; error: string };

const MAX_MEMBERS = 50;
/** The inviter's name in an invitation, at most this long. */
const INVITER_NAME_MAX = 40;
const INVITES_PER_APP_PER_DAY = 20;
const INVITES_PER_PERSON_PER_DAY = 20;
const DAY = 86_400;
const NOT_FOUND: Fail = { ok: false, error: "Project not found" };
const NO_ADMIN: Fail = { ok: false, error: "Publishing isn't switched on for this copy of Prod AI yet." };
const NOT_LIVE: Fail = { ok: false, error: "Publish the app first. Then you can invite people to it." };
const failed = (what: string, detail: unknown): Fail => {
  console.error(`[app-settings] ${what} failed`, detail);
  return { ok: false, error: "That didn't go through. Nothing changed. Try again in a moment." };
};

type Owned = { user: SessionUser; supa: Supa; project: ProjectRow };

/** The project, if the person asking owns it (read through their session, so RLS applies). */
async function owned(projectId: unknown): Promise<Owned | null> {
  if (typeof projectId !== "string" || !/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const user = await getSessionUser();
  if (!user) return null;
  const supa = await createClient();
  const project = await getProject(supa, projectId).catch(() => null);
  if (!project || project.owner_id !== user.id) return null;
  return { user, supa, project };
}

async function liveSite(o: Owned): Promise<LiveSiteRow | null> {
  return getLiveSiteForProject(o.supa, o.project.id).catch(() => null);
}

const blocked = (site: LiveSiteRow | null) => Boolean(site?.blocked_at);

function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

async function readMembers(o: Owned): Promise<AppMember[]> {
  const { data, error } = await o.supa
    .from("app_members")
    .select("email, invited_at, accepted_at")
    .eq("project_id", o.project.id)
    .order("invited_at", { ascending: false })
    .limit(MAX_MEMBERS + 10);
  if (error) console.error("[app-settings] members read failed", error.message);
  return (data ?? []).map((m) => ({ email: m.email as string, invitedAt: m.invited_at as string, acceptedAt: (m.accepted_at as string | null) ?? null }));
}

/** Everything the owner's controls show, in one round trip. */
export async function loadAppControls(projectId: string): Promise<({ ok: true } & AppControls) | Fail> {
  const o = await owned(projectId);
  if (!o) return NOT_FOUND;
  const site = await liveSite(o);
  const [members, hasSample] = await Promise.all([readMembers(o), site && hasAdmin() ? hasSampleRecords(o.project.id) : Promise.resolve(false)]);
  return {
    ok: true,
    isGuest: o.user.isAnonymous,
    emailReady: emailConfigured(),
    members,
    maxMembers: MAX_MEMBERS,
    hasSample,
    live: site ? { slug: site.slug, blocked: blocked(site), summary: publicSummary(site.blueprint) } : null,
  };
}

/* ------------------------------------------------------------------ People */

export type InviteResult = { ok: true; member: AppMember; email: "sent" | "failed" | "not_configured" } | Fail;

export async function inviteMember(projectId: string, rawEmail: string): Promise<InviteResult> {
  const o = await owned(projectId);
  if (!o) return NOT_FOUND;
  // Invitations carry the owner's name and address, so a guest (who has neither) signs in first.
  if (o.user.isAnonymous || !o.user.email) return { ok: false, error: "Sign in to invite people." };
  const email = cleanEmail(rawEmail);
  if (!email) return { ok: false, error: "That doesn't look like an email address. Check it and try again." };
  if (email === o.user.email.toLowerCase()) return { ok: false, error: "That's your own address. You already have access as the owner." };
  if (!hasAdmin()) return NO_ADMIN;
  const site = await liveSite(o);
  if (!site) return NOT_LIVE;
  if (blocked(site)) return { ok: false, error: "This app's public link was taken down after a report, so nobody can open it." };

  const admin = adminClient();
  const members = admin.from("app_members");
  const { data: already } = await members.select("email").eq("project_id", o.project.id).eq("email", email).maybeSingle();
  if (already) return { ok: false, error: "They're already on the list." };
  const { count } = await admin.from("app_members").select("email", { count: "exact", head: true }).eq("project_id", o.project.id);
  if ((count ?? 0) >= MAX_MEMBERS) return { ok: false, error: `An app can have up to ${MAX_MEMBERS} people. Remove someone to invite another.` };
  if (!(await withinLimit(`invite:app:${o.project.id}`, INVITES_PER_APP_PER_DAY, DAY))) return { ok: false, error: `You've sent ${INVITES_PER_APP_PER_DAY} invitations for this app today. Try again tomorrow.` };
  if (!(await withinLimit(`invite:user:${o.user.id}`, INVITES_PER_PERSON_PER_DAY, DAY))) return { ok: false, error: "You've sent a lot of invitations today. Try again tomorrow." };

  const { data: row, error } = await admin
    .from("app_members")
    .insert({ project_id: o.project.id, email, invited_by: o.user.id })
    .select("email, invited_at, accepted_at")
    .single();
  if (error || !row) {
    // Two invitations for the same address at once: the other one won.
    if (error?.code === "23505") return { ok: false, error: "They're already on the list." };
    return failed("invite", error?.message);
  }

  const appName = (site.blueprint.meta?.name || o.project.name).slice(0, 80);
  const link = `${siteUrl()}/live/${site.slug}`;
  const inviter = inviterName(o.user.name, o.user.email);
  const subject = `${inviter} invited you to ${appName}`;
  const sent = await sendEmail({
    to: email,
    subject,
    fromName: inviter,
    replyTo: o.user.email,
    text: [
      "Hi,",
      "",
      `${inviter} (${o.user.email}) invited you to use ${appName}.`,
      "",
      `Open it here: ${link}`,
      "",
      `Sign in with Google or an email link, using this address (${email}). Then you'll see the screens ${inviter} shares with their team.`,
      "",
      "If you weren't expecting this, you can ignore this email. Nothing happens unless you sign in.",
      "",
      "Prod AI",
    ].join("\n"),
  });
  const { error: logError } = await admin.from("app_emails").insert({ project_id: o.project.id, kind: "invite", to_hash: hashEmail(email), subject: subject.slice(0, 200), status: sent.status, actor_id: o.user.id });
  if (logError) console.error("[app-settings] email log failed", logError.message);

  await addLedger(o.supa, o.project.id, [
    {
      lane: "did",
      kind: "ship",
      title: `Invited ${email} to the published app`,
      body: sent.status === "sent" ? "They got an email with the link. They sign in with this address to see the team screens." : sent.status === "not_configured" ? "Email isn't set up yet, so no email went out. You were shown the link to send them." : "The email didn't go through. You were shown the link to send them.",
      credits: 0,
    },
  ]).catch((e) => console.error("[app-settings] ledger failed", e));
  revalidatePath(`/p/${o.project.id}`, "layout");
  return { ok: true, member: { email: row.email as string, invitedAt: row.invited_at as string, acceptedAt: (row.accepted_at as string | null) ?? null }, email: sent.status };
}

/**
 * A display name comes from the sign-in provider and anyone can set it, so in an invitation it carries no
 * links or web addresses and is at most 40 characters. Without anything left, the start of the email address.
 */
function inviterName(name: string, email: string): string {
  const clean = name
    .replace(/\S*(?:https?:\/\/|www\.)\S*/gi, " ")
    .replace(/\S+\.[a-z]{2,}(?:\/\S*)?/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, INVITER_NAME_MAX)
    .trim();
  return clean || email.split("@")[0].slice(0, INVITER_NAME_MAX);
}

export async function removeMember(projectId: string, rawEmail: string): Promise<{ ok: true } | Fail> {
  const o = await owned(projectId);
  if (!o) return NOT_FOUND;
  const email = cleanEmail(rawEmail);
  if (!email) return { ok: false, error: "That person isn't on the list." };
  if (!hasAdmin()) return NO_ADMIN;
  const { data, error } = await adminClient().from("app_members").delete().eq("project_id", o.project.id).eq("email", email).select("email");
  if (error) return failed("remove", error.message);
  if (!data?.length) return { ok: false, error: "That person isn't on the list." };
  // Say what's still open to them: the public pages, if this app has any (the live app's own rule).
  const site = await liveSite(o);
  const hasPublic = Boolean(site && publicAccess(site.blueprint, o.project.settings.app?.hiddenEntities).screens.length);
  await addLedger(o.supa, o.project.id, [{ lane: "did", kind: "ship", title: `Removed ${email} from the published app`, body: `They can't open its team screens any more.${hasPublic ? " Its public pages stay open to anyone with the link." : ""}`, credits: 0 }]).catch((e) => console.error("[app-settings] ledger failed", e));
  revalidatePath(`/p/${o.project.id}`, "layout");
  return { ok: true };
}

/* ------------------------------------------------------------------ What's public and AI helpers for visitors */

export async function setHiddenEntity(projectId: string, entityId: string, hide: boolean): Promise<{ ok: true; hiddenEntities: string[] } | Fail> {
  const o = await owned(projectId);
  if (!o) return NOT_FOUND;
  if (typeof entityId !== "string" || typeof hide !== "boolean") return { ok: false, error: "Pick a data type." };
  // Only this app's own data types: the test version's and the published one's.
  const site = await liveSite(o);
  const entities = [...o.project.blueprint.entities, ...(site?.blueprint.entities ?? [])];
  const known = new Set(entities.map((e) => e.id));
  if (!known.has(entityId)) return { ok: false, error: "This app has no data type like that." };
  const current = new Set((o.project.settings.app?.hiddenEntities ?? []).filter((id) => known.has(id)));
  if (hide) current.add(entityId);
  else current.delete(entityId);
  const hiddenEntities = [...current];
  try {
    await updateProject(o.supa, o.project.id, { settings: { ...o.project.settings, app: { ...o.project.settings.app, hiddenEntities } } });
  } catch (e) {
    return failed("hide", e);
  }
  const plural = entities.find((e) => e.id === entityId)?.plural ?? entityId;
  await addLedger(o.supa, o.project.id, [
    hide
      ? { lane: "did", kind: "permission", title: `Hid ${plural.toLowerCase()} from public pages`, body: "Public pages no longer show them, and public forms for them stop taking new ones. The team still sees everything.", credits: 0 }
      : { lane: "did", kind: "permission", title: `Showed ${plural.toLowerCase()} on public pages again`, body: "Public pages show the fields they were built with, and their forms take new ones again.", credits: 0 },
  ]).catch((e) => console.error("[app-settings] ledger failed", e));
  revalidatePath(`/p/${o.project.id}`, "layout");
  if (site) revalidatePath(`/live/${site.slug}`);
  return { ok: true, hiddenEntities };
}

export async function setPublicHelpers(projectId: string, on: boolean): Promise<{ ok: true } | Fail> {
  const o = await owned(projectId);
  if (!o) return NOT_FOUND;
  if (typeof on !== "boolean") return { ok: false, error: "Choose on or off." };
  try {
    await updateProject(o.supa, o.project.id, { settings: { ...o.project.settings, app: { ...o.project.settings.app, publicHelpers: on } } });
  } catch (e) {
    return failed("helpers", e);
  }
  await addLedger(o.supa, o.project.id, [
    on
      ? { lane: "did", kind: "permission", title: "Let visitors talk to AI helpers on public pages", body: "Each conversation uses your credits and counts toward your spending cap. Anything that can't be undone still waits for a person.", credits: 0 }
      : { lane: "did", kind: "permission", title: "Turned off AI helpers for visitors", body: "Only you and the people you invited can talk to them now.", credits: 0 },
  ]).catch((e) => console.error("[app-settings] ledger failed", e));
  revalidatePath(`/p/${o.project.id}`, "layout");
  const site = await liveSite(o);
  if (site) revalidatePath(`/live/${site.slug}`);
  return { ok: true };
}

/* ------------------------------------------------------------------ Sample data */

export async function clearSampleData(projectId: string): Promise<{ ok: true; cleared: number } | Fail> {
  const o = await owned(projectId);
  if (!o) return NOT_FOUND;
  if (!hasAdmin()) return NO_ADMIN;
  const site = await liveSite(o);
  if (!site) return { ok: false, error: "The app isn't published, so it has no sample data to clear." };
  const cleared = await clearSampleRecords(o.project.id);
  if (cleared) {
    await addLedger(o.supa, o.project.id, [{ lane: "did", kind: "ship", title: `Cleared ${cleared} sample record${cleared === 1 ? "" : "s"} from the published app`, body: "Records people added are untouched. Your test version keeps its sample data.", credits: 0 }]).catch((e) => console.error("[app-settings] ledger failed", e));
  }
  revalidatePath(`/p/${o.project.id}`, "layout");
  revalidatePath(`/live/${site.slug}`);
  return { ok: true, cleared };
}
