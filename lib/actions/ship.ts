"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getSessionUser, requireUser } from "@/lib/auth";
import { createClient, type Supa } from "@/lib/supabase/server";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { getCheckpoint, getLiveSiteForProject, getProject } from "@/lib/db/queries";
import { addCheckpoint, addLedger, updateProject } from "@/lib/db/writes";
import { accessLine, canGoLive, codeAccessLine, preflight, type PreflightFix } from "@/lib/sim/preflight";
import { shortId } from "@/lib/sim/hash";
import { estimate } from "@/lib/blueprint/estimate";
import { runRehearsals } from "@/lib/actions/agents";
import type { Blueprint } from "@/lib/blueprint/schema";
import type { CheckpointRow, DeploymentRow, LiveSiteRow, ProjectRow } from "@/lib/db/types";
import { siteUrl } from "@/lib/env";
import { seedSampleRecords } from "@/lib/apps/records";
import { buildCodeApp, hashFiles } from "@/lib/code-apps/build";
import { CodeAppSchema, type CodeApp, type PublishedBuild } from "@/lib/code-apps/schema";

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
    // Claude plays every helper's test runs (PRICE.testRun each); each helper's results are saved as they come.
    let passed = 0;
    let played = 0;
    let credits = 0;
    for (const agent of project.blueprint.agents.filter((a) => a.rehearsals.length)) {
      const r = await runRehearsals(projectId, agent.id);
      if (!r.ok) return played ? { ok: true, message: `Played ${played}, ${passed} passed, then stopped: ${r.error}` } : r;
      passed += r.passed ?? 0;
      played += r.total ?? 0;
      credits += r.credits ?? 0;
    }
    return { ok: true, message: `Claude played ${played} test run${played === 1 ? "" : "s"}: ${passed} passed${credits ? ` · ${credits} credits` : ""}.` };
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

/** The same plan, whatever order its keys come back from the database in. */
const canonical = (v: unknown) =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x,
  );
const sameBlueprint = (a: Blueprint, b: Blueprint) => canonical(a) === canonical(b);
/** A code app's versions compare by their files and manifest (its blueprint is a placeholder). */
const sameCode = (a: CodeApp | null | undefined, b: CodeApp | null | undefined) => Boolean(a && b) && canonical(a) === canonical(b);
const isCodeApp = (project: Pick<ProjectRow, "kind">) => project.kind === "code";

/**
 * The version publishing puts live: the project's current version when it is exactly the project as it
 * is now, otherwise the next number (some edits, like test-run results, change the project without
 * saving a version, so publishing saves one first).
 */
async function versionToPublish(supa: Supa, project: ProjectRow): Promise<{ current: CheckpointRow | null; upToDate: boolean; seq: number }> {
  const [current, { data: last }] = await Promise.all([
    project.current_checkpoint_id ? getCheckpoint(supa, project.current_checkpoint_id) : Promise.resolve(null),
    supa.from("checkpoints").select("seq").eq("project_id", project.id).order("seq", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const own = current && current.project_id === project.id ? current : null;
  if (own && (isCodeApp(project) ? sameCode(own.code, project.code) : sameBlueprint(own.blueprint, project.blueprint))) return { current: own, upToDate: true, seq: own.seq };
  return { current: own, upToDate: false, seq: ((last?.seq as number | undefined) ?? 0) + 1 };
}

/** The version to publish, saving the project as a new version first only when it has edits its current version doesn't. */
async function checkpointToPublish(supa: Supa, project: ProjectRow): Promise<CheckpointRow> {
  const v = await versionToPublish(supa, project);
  if (v.upToDate && v.current) return v.current;
  return addCheckpoint(supa, project.id, {
    label: v.current ? `Changes since version ${v.current.seq}` : "First version",
    kind: "ship",
    blueprint: project.blueprint,
    summary: "Saved when you published, so the live app is a version you can come back to.",
    ...(isCodeApp(project) ? { code: project.code } : {}),
  });
}

export type PublishState = {
  /** What's live is exactly the project as it is now, so there is nothing to publish. */
  unchanged: boolean;
  /** The version publishing puts live. */
  version: number;
  /** Publishing first saves the project's latest edits as that version. */
  savesEdits: boolean;
  /** Who can use what's live now, in one sentence (null when nothing is live). */
  access: string | null;
};

/** What publishing would do right now, for the Publish page: whether anything changed and which version goes live. */
export async function publishState(projectId: string): Promise<PublishState | null> {
  if (!(await getSessionUser())) return null;
  const supa = await createClient();
  const project = await getProject(supa, projectId).catch(() => null);
  if (!project) return null;
  const [live, next] = await Promise.all([getLiveSiteForProject(supa, projectId).catch(() => null), versionToPublish(supa, project)]);
  if (isCodeApp(project)) {
    const build = project.build?.ok ? project.build : null;
    const code = CodeAppSchema.safeParse(project.code);
    return { unchanged: Boolean(live && build && code.success && sameLiveBuild(live, build.hash, code.data)), version: next.seq, savesEdits: !next.upToDate, access: live ? codeAccessLine : null };
  }
  return {
    unchanged: Boolean(live && sameBlueprint(live.blueprint, project.blueprint)),
    version: next.seq,
    savesEdits: !next.upToDate,
    access: live ? accessLine(live.blueprint, project.settings.app?.hiddenEntities) : null,
  };
}

export async function goLive(projectId: string, target: DeploymentRow["target"], domain?: string): Promise<R> {
  await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false, error: "Project not found" };
  if (isCodeApp(project)) return goLiveCode(supa, project, target, domain);
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
    const cp = await checkpointToPublish(supa, project);
    await supa.from("deployments").insert({ project_id: projectId, env: "live", target, checkpoint_id: cp.id, status: "sandbox", preflight: summary, url: null });
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
  // Publishing what's already live would only add a duplicate row to the history.
  if (existing && sameBlueprint(existing.blueprint, project.blueprint)) return { ok: false, error: "No changes since you published." };
  // Published again after going offline: the same link comes back (the offline note promises it), even if the project was renamed.
  // The history is the owner's to write, so an earlier link is reused only if this project made it (it ends in the project's own
  // id): nobody can claim a link another app used, or a hand-picked one.
  const { data: last } = existing ? { data: null } : await supa.from("deployments").select("url").eq("project_id", projectId).eq("target", "architect_cloud").not("url", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const before = /^\/live\/([a-z0-9][a-z0-9-]{2,79})$/.exec((last?.url as string | null | undefined) ?? "")?.[1];
  const ours = before?.endsWith(`-${shortId(projectId)}`) ? before : undefined;
  const slug = existing?.slug ?? ours ?? slugFor(project.name, projectId);
  const link = `${await requestOrigin()}/live/${slug}`;
  // The project's current version goes live; the live row points at it rather than at a copy of it.
  const cp = await checkpointToPublish(supa, project);
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
    {
      lane: "did",
      kind: "ship",
      title: existing ? `Published version ${cp.seq}` : `Published version ${cp.seq} on Prod Cloud`,
      body: `Live at ${link}. ${accessLine(project.blueprint, project.settings.app?.hiddenEntities)}${domain ? ` ${domain} will point here once DNS checks pass.` : ""}${samples}${testData}`,
      checkpointId: cp.id,
    },
  ]);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true, slug };
}

/** What's live is this exact build of these files and manifest. */
function sameLiveBuild(live: LiveSiteRow, hash: string, code: CodeApp | null): boolean {
  return live.kind === "code" && live.build?.hash === hash && Boolean(code) && canonical(live.build.manifest) === canonical(code?.manifest);
}

/**
 * Publishing a code app: its latest real build goes live (copied into live_sites.build with its manifest,
 * never its source files), only when that build is of the current files and compiled without errors.
 * The live row keeps the project's placeholder plan (the column needs one). No sample data: a code app's
 * records start empty. Versions, deployments and the history work as for every app.
 */
async function goLiveCode(supa: Supa, project: ProjectRow, target: DeploymentRow["target"], domain?: string): Promise<R> {
  if (target !== "architect_cloud") return { ok: false, error: "A code app goes live on Prod Cloud. To host it yourself, download its code from the Code tab." };
  if (!hasAdmin()) return NO_ADMIN;
  const code = CodeAppSchema.safeParse(project.code);
  const build = project.build;
  if (!code.success || !build || !build.ok || typeof build.js !== "string" || build.hash !== hashFiles(code.data.files)) return { ok: false, error: "Build it first: the latest version has to build without errors before it can go live." };
  const projectId = project.id;
  const existing = await getLiveSiteForProject(supa, projectId);
  if (isBlocked(existing)) return BLOCKED;
  if (existing && sameLiveBuild(existing, build.hash, code.data)) return { ok: false, error: "No changes since you published." };
  // The same link as before when it comes back after going offline, and only a link this project made (as for business apps).
  const { data: last } = existing ? { data: null } : await supa.from("deployments").select("url").eq("project_id", projectId).eq("target", "architect_cloud").not("url", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const before = /^\/live\/([a-z0-9][a-z0-9-]{2,79})$/.exec((last?.url as string | null | undefined) ?? "")?.[1];
  const ours = before?.endsWith(`-${shortId(projectId)}`) ? before : undefined;
  const slug = existing?.slug ?? ours ?? slugFor(code.data.manifest.title || project.name, projectId);
  const link = `${await requestOrigin()}/live/${slug}`;
  const cp = await checkpointToPublish(supa, project);
  const published: PublishedBuild = { hash: build.hash, js: build.js, css: build.css, manifest: code.data.manifest };
  const row = { checkpoint_id: cp.id, blueprint: project.blueprint, kind: "code", build: published };
  const { error } = existing
    ? await liveSites().update({ ...row, published_at: new Date().toISOString() }).eq("project_id", projectId)
    : await liveSites().insert({ slug, project_id: projectId, ...row });
  if (error) return failed("publish", error.message);
  const summary = [
    { id: "builds", label: "It builds", pass: true },
    { id: "starts", label: "It starts", pass: true },
  ];
  await supa.from("deployments").update({ status: "rolled_back" }).eq("project_id", projectId).eq("status", "live");
  await supa.from("deployments").insert({ project_id: projectId, env: "live", target, checkpoint_id: cp.id, status: "live", preflight: summary, url: `/live/${slug}` });
  await addLedger(supa, projectId, [
    {
      lane: "did",
      kind: "ship",
      title: existing ? `Published version ${cp.seq}` : `Published version ${cp.seq} on Prod Cloud`,
      body: `Live at ${link}. ${codeAccessLine}${domain ? ` ${domain} will point here once DNS checks pass.` : ""}`,
      checkpointId: cp.id,
    },
  ]);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true, slug };
}

export async function rollbackTo(projectId: string, deploymentId: string): Promise<R> {
  await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false, error: "Project not found" };
  if (!hasAdmin()) return NO_ADMIN;
  const { data: dep } = await supa.from("deployments").select("*").eq("id", deploymentId).eq("project_id", projectId).maybeSingle();
  const live = await getLiveSiteForProject(supa, projectId);
  if (!dep || !dep.checkpoint_id || !live) return { ok: false, error: "Nothing to roll back to" };
  if (isBlocked(live)) return BLOCKED;
  const cp = await getCheckpoint(supa, dep.checkpoint_id);
  if (!cp || cp.project_id !== projectId) return { ok: false, error: "That version is gone" };
  if (live.checkpoint_id === cp.id) return { ok: false, error: `Version ${cp.seq} is already live.` };
  let codeBuild: PublishedBuild | null = null;
  if (isCodeApp(project)) {
    // A code app's version keeps its files, not a build: it is built again here, on the server, before it goes back online.
    const code = CodeAppSchema.safeParse(cp.code);
    if (!code.success) return { ok: false, error: `Version ${cp.seq} has no code to put back online.` };
    const built = await buildCodeApp(code.data);
    if (!built.ok) return { ok: false, error: `Version ${cp.seq} doesn't build any more, so it can't go back online: ${built.errors[0]?.message ?? "the build failed"}` };
    codeBuild = { hash: built.hash, js: built.js, css: built.css, manifest: code.data.manifest };
  }
  const { error } = await liveSites()
    .update({ blueprint: cp.blueprint, checkpoint_id: cp.id, published_at: new Date().toISOString(), ...(codeBuild ? { kind: "code", build: codeBuild } : {}) })
    .eq("project_id", projectId);
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
  await addLedger(supa, projectId, [{ lane: "did", kind: "ship", title: "Took the live version offline", body: "The link now shows “not found”. Your project and its versions are untouched." }]);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true };
}
