"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { getCheckpoint, getLiveSiteForProject, getProject } from "@/lib/db/queries";
import { addCheckpoint, addLedger, updateProject } from "@/lib/db/writes";
import { canGoLive, preflight, type PreflightFix } from "@/lib/sim/preflight";
import { shortId } from "@/lib/sim/hash";
import { estimate } from "@/lib/blueprint/estimate";
import { rehearsalOutcome } from "@/lib/sim/rehearse";
import type { DeploymentRow } from "@/lib/db/types";
import { siteUrl } from "@/lib/env";
import { seedSampleRecords } from "@/lib/apps/records";

type R = { ok: true; slug?: string; message?: string } | { ok: false; error: string };

export async function fixPreflight(projectId: string, action: PreflightFix): Promise<R> {
  await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false, error: "Project not found" };
  const bp = structuredClone(project.blueprint);
  let title = "";
  if (action === "enable_auth") {
    bp.meta.auth = { enabled: true, providers: bp.meta.auth.providers.length ? bp.meta.auth.providers : ["google", "email"] };
    title = "Turned on sign-in";
  } else if (action === "gate_irreversible") {
    let n = 0;
    bp.agents.forEach((a) => a.tools.forEach((t) => {
      if (t.access === "irreversible" && t.permission !== "ask") {
        t.permission = "ask";
        n++;
      }
    }));
    title = `Added ${n} approval gate${n === 1 ? "" : "s"}`;
  } else if (action === "sandbox_keys") {
    const names = bp.connections.filter((c) => c.status === "missing").map((c) => c.name);
    if (!names.length) return { ok: true, message: "Every connection already has a key." };
    bp.connections.forEach((c) => (c.status = "configured"));
    title = `Added sandbox keys for ${names.join(", ")}`;
  } else if (action === "run_rehearsals") {
    const now = new Date().toISOString();
    let passed = 0;
    let total = 0;
    for (const agent of bp.agents) {
      for (const r of agent.rehearsals) {
        const out = rehearsalOutcome(agent, r);
        total++;
        if (out.pass) passed++;
        r.history = [...r.history, { at: now, pass: out.pass, note: out.note }].slice(-10);
      }
    }
    title = `Ran ${total} rehearsal${total === 1 ? "" : "s"}, ${passed} passed`;
  } else if (action === "set_budget") {
    await updateProject(supa, projectId, { settings: { ...project.settings, budgetCapCredits: 500 } });
    await addLedger(supa, projectId, [{ lane: "did", kind: "budget", title: "Set a 500-credit monthly cap", credits: 0 }]);
    revalidatePath(`/p/${projectId}`, "layout");
    return { ok: true };
  } else {
    return { ok: false, error: "Build the project first" };
  }
  bp.estimate = estimate(bp);
  await updateProject(supa, projectId, { blueprint: bp });
  const cp = await addCheckpoint(supa, projectId, { label: title.slice(0, 60), kind: "change", blueprint: bp, summary: "Fixed from Preflight" });
  await addLedger(supa, projectId, [{ lane: "did", kind: "ship", title: `Preflight: ${title.toLowerCase()}`, credits: 0, checkpointId: cp.id, body: "One-click fix from the Publish tab, free." }]);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true };
}

const kebab = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32).replace(/^-+|-+$/g, "");

/** A public link: lowercase letters, digits and dashes, 3 to 80 long, starting with a letter or digit (the live_sites slug check). */
const slugFor = (name: string, projectId: string) => `${kebab(name) || "app"}-${shortId(projectId)}`;

/**
 * Published sites are written only by the server's admin connection: people can read their own
 * live_sites rows but never write them. Every caller first reads the project through the person's
 * session, so row-level security has already confirmed they own it.
 */
const liveSites = () => adminClient().from("live_sites");
const NO_ADMIN: R = { ok: false, error: "Publishing isn't switched on for this copy of Prod AI yet." };
/** Taken down after an abuse report. The row stays (unpublishing never deletes it), so the block can't be undone by publishing again. */
const isBlocked = (site: object | null) => Boolean(site && "blocked_at" in site && site.blocked_at);
const BLOCKED: R = { ok: false, error: "This app's public link was taken down after a report, so it can't be published again. If you think that's a mistake, the Terms page says how to reach us." };
const failed = (what: string, detail: unknown): R => {
  console.error(`[ship] ${what} failed`, detail);
  return { ok: false, error: "That didn't go through. Nothing changed on the live link. Try again in a moment." };
};

/** The origin people reach this app on (the one the request came from), so shared links are full URLs. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin && /^https?:\/\/[^/]+$/.test(origin)) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  return siteUrl();
}

export async function goLive(projectId: string, target: DeploymentRow["target"], domain?: string): Promise<R> {
  await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false, error: "Project not found" };
  const checks = preflight(project.blueprint, {
    budgetCapCredits: project.settings.budgetCapCredits,
    built: project.build_state === "built" || project.source === "import",
    region: project.settings.region,
    hiddenEntities: project.settings.app?.hiddenEntities,
    publicHelpers: project.settings.app?.publicHelpers,
  });
  if (!canGoLive(checks)) return { ok: false, error: "Preflight has blocking issues. Fix them first." };
  const summary = checks.map((c) => ({ id: c.id, label: c.label, pass: c.status !== "fail" }));
  // Going live with connections on test data is allowed (a warning, not a blocker), but the history says so.
  const keys = checks.find((c) => c.id === "keys");
  const testData = keys?.status === "warn" ? ` Heads up: ${keys.detail}` : "";

  if (target !== "architect_cloud") {
    await supa.from("deployments").insert({ project_id: projectId, env: "live", target, checkpoint_id: project.current_checkpoint_id, status: "sandbox", preflight: summary, url: null });
    await addLedger(supa, projectId, [
      {
        lane: "did",
        kind: "ship",
        title: target === "vercel" ? "Prepared a Vercel deployment (sandbox)" : "Packaged the app for your own cloud (sandbox)",
        body: target === "vercel" ? "In production this pushes to your Vercel team and opens a deploy preview." : `docker-compose.yml and agent runtime images are ready${domain ? ` for ${domain}` : ""}. Nothing leaves your network.`,
      },
    ]);
    revalidatePath(`/p/${projectId}`, "layout");
    return { ok: true, message: "sandbox" };
  }

  if (!hasAdmin()) return NO_ADMIN;
  const existing = await getLiveSiteForProject(supa, projectId);
  if (isBlocked(existing)) return BLOCKED;
  const slug = existing?.slug ?? slugFor(project.name, projectId);
  const link = `${await requestOrigin()}/live/${slug}`;
  const cp = await addCheckpoint(supa, projectId, { label: "Published", kind: "ship", blueprint: project.blueprint, summary: `Live at ${link}` });
  const { error } = existing
    ? await liveSites().update({ blueprint: project.blueprint, checkpoint_id: cp.id, published_at: new Date().toISOString() }).eq("project_id", projectId)
    : await liveSites().insert({ slug, project_id: projectId, checkpoint_id: cp.id, blueprint: project.blueprint });
  if (error) return failed("publish", error.message);
  // A newly published app starts with its plan's sample data, marked as such (only when it holds no records yet).
  // Publishing changes never brings back samples the owner cleared.
  const seeded = existing ? 0 : await seedSampleRecords(projectId, project.blueprint);
  const samples = seeded ? ` It starts with ${seeded} sample record${seeded === 1 ? "" : "s"} from the plan, marked as samples. Clear them from Publish when real people start using it.` : "";
  await supa.from("deployments").update({ status: "rolled_back" }).eq("project_id", projectId).eq("status", "live");
  await supa.from("deployments").insert({ project_id: projectId, env: "live", target, checkpoint_id: cp.id, status: "live", preflight: summary, url: `/live/${slug}` });
  await addLedger(supa, projectId, [
    { lane: "did", kind: "ship", title: existing ? "Published the changes" : "Published on Prod Cloud", body: `Anyone with the link can open ${link}.${domain ? ` ${domain} will point here once DNS checks pass.` : ""}${samples}${testData}`, checkpointId: cp.id },
  ]);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true, slug };
}

export async function rollbackTo(projectId: string, deploymentId: string): Promise<R> {
  await requireUser();
  const supa = await createClient();
  if (!(await getProject(supa, projectId))) return { ok: false, error: "Project not found" };
  if (!hasAdmin()) return NO_ADMIN;
  const { data: dep } = await supa.from("deployments").select("*").eq("id", deploymentId).eq("project_id", projectId).maybeSingle();
  const live = await getLiveSiteForProject(supa, projectId);
  if (!dep || !dep.checkpoint_id || !live) return { ok: false, error: "Nothing to roll back to" };
  if (isBlocked(live)) return BLOCKED;
  const cp = await getCheckpoint(supa, dep.checkpoint_id);
  if (!cp || cp.project_id !== projectId) return { ok: false, error: "That version is gone" };
  const { error } = await liveSites().update({ blueprint: cp.blueprint, checkpoint_id: cp.id, published_at: new Date().toISOString() }).eq("project_id", projectId);
  if (error) return failed("rollback", error.message);
  await supa.from("deployments").update({ status: "rolled_back" }).eq("project_id", projectId).eq("status", "live");
  await supa.from("deployments").insert({ project_id: projectId, env: "live", target: "architect_cloud", checkpoint_id: cp.id, status: "live", preflight: dep.preflight, url: `/live/${live.slug}` });
  await addLedger(supa, projectId, [{ lane: "did", kind: "restore", title: `Rolled the published app back to version ${cp.seq}`, body: "Rollbacks are instant and free. The test version is unchanged.", credits: 0 }]);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true };
}

export async function takeOffline(projectId: string): Promise<R> {
  await requireUser();
  const supa = await createClient();
  if (!(await getProject(supa, projectId))) return { ok: false, error: "Project not found" };
  if (!hasAdmin()) return NO_ADMIN;
  const { error } = await liveSites().delete().eq("project_id", projectId).is("blocked_at", null);
  if (error) return failed("unpublish", error.message);
  await supa.from("deployments").update({ status: "rolled_back" }).eq("project_id", projectId).eq("status", "live");
  await addLedger(supa, projectId, [{ lane: "did", kind: "ship", title: "Took the live version offline", body: "The link now shows “not found”. Your project and save points are untouched." }]);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true };
}
