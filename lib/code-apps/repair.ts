import "server-only";
import { z } from "zod";
import type { SessionUser } from "@/lib/auth";
import type { Supa } from "@/lib/supabase/server";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { getProject } from "@/lib/db/queries";
import type { ProjectRow } from "@/lib/db/types";
import { addCheckpoint, addLedger, logUsage, updateProject } from "@/lib/db/writes";
import { holdModelBudget, promptHoldUsd } from "@/lib/llm/guard";
import { getModel } from "@/lib/llm/provider";
import type { ModelSpend } from "@/lib/llm/pricing";
import { withinLimit } from "@/lib/security/rate-limit";
import { withKnownFrameworks, type Blueprint } from "@/lib/blueprint/schema";
import { FIX_INSTRUCTIONS, fixPrompt, type ProblemReport } from "./prompts";
import { EDIT_MAX_OUTPUT, applyEdit, checkApp, editWithClaude, fileChanges, sameManifest, type FileChange } from "./generate";
import { CodeAppSchema, type CodeApp } from "./schema";

/**
 * "Fix it": Claude fixes a code app from a real error (a failed build, or a runtime error from the sandbox),
 * with whole-file replacements that are checked before they're saved as a new version labelled as Prod AI's
 * fix. Never charged (the real cost is metered at 0 credits). At most REPAIR_LIMIT fixes in a row: after
 * that the person is asked to describe what they want in a note (which, like any new version, starts the
 * count again). The owner or the app's team may ask.
 */
export const REPAIR_LIMIT = 3;
/** Per person, and per project: fixes are free, so they're held to a pace a person needs. */
const PER_PERSON = { max: 12, windowSeconds: 600 };
const PER_PROJECT = { max: 6, windowSeconds: 600 };

const BuildErrorSchema = z.object({
  file: z.string().max(200).optional(),
  line: z.number().int().min(0).max(1_000_000).optional(),
  column: z.number().int().min(0).max(1_000_000).optional(),
  message: z.string().min(1).max(2000),
});
const RuntimeSchema = z.object({ message: z.string().min(1).max(2000), stack: z.string().max(6000).optional(), source: z.string().max(200).optional() });

/** What the studio sends: { errors: BuildError[] } after a failed build, or { runtime: { message, stack } } after a runtime error. */
export function parseProblem(body: unknown): ProblemReport | null {
  const b = (body ?? {}) as { errors?: unknown; runtime?: unknown };
  const build = z.array(BuildErrorSchema).min(1).max(20).safeParse(b.errors);
  if (build.success) return { build: build.data };
  // A runtime error sent as `errors` (one object, not a list) is read as what it is.
  const runtime = RuntimeSchema.safeParse(b.runtime ?? b.errors);
  if (runtime.success) return { runtime: { message: runtime.data.message, stack: runtime.data.stack } };
  return null;
}

/** Who may fix this app: its owner (their own session) or someone on its team (invited from Publish, checked by the server). */
export type CodeAppAccess = { project: ProjectRow; db: Supa; role: "owner" | "member" };

export async function codeAppAccess(user: SessionUser, supa: Supa, projectId: string): Promise<CodeAppAccess | null> {
  const own = await getProject(supa, projectId);
  if (own) return { project: own, db: supa, role: "owner" };
  if (user.isAnonymous || !hasAdmin() || !/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const admin = adminClient();
  const email = user.email?.toLowerCase();
  const { data: byId } = await admin.from("app_members").select("project_id").eq("project_id", projectId).eq("user_id", user.id).maybeSingle();
  const member = byId ?? (email ? (await admin.from("app_members").select("project_id").eq("project_id", projectId).eq("email", email).maybeSingle()).data : null);
  if (!member) return null;
  const { data } = await admin.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!data) return null;
  const project = data as ProjectRow;
  return { project: { ...project, blueprint: withKnownFrameworks(project.blueprint as Blueprint) }, db: admin as unknown as Supa, role: "member" };
}

export type RepairResult =
  | { ok: true; version: number; checkpointId: string; label: string; summary: string; reply: string; files: FileChange[]; code: CodeApp; left: number }
  | { ok: false; status: number; error: string; code?: "repair-limit" | "rate" | "unavailable" | "failed" | "stale" };

/** Fixes in a row: the latest versions that are Prod AI's fixes, until anything else (a change, a restore, a new app). */
async function fixesInARow(db: Supa, project: ProjectRow): Promise<{ count: number; latestAt: string | null }> {
  const { data } = await db.from("checkpoints").select("kind, created_at").eq("project_id", project.id).order("seq", { ascending: false }).limit(REPAIR_LIMIT);
  const rows = (data ?? []) as { kind: string; created_at: string }[];
  let count = 0;
  for (const r of rows) {
    if (r.kind !== "repair") break;
    count++;
  }
  return { count, latestAt: rows[0]?.kind === "repair" ? rows[0].created_at : null };
}

export async function repairCodeApp(user: SessionUser, access: CodeAppAccess, problem: ProblemReport): Promise<RepairResult> {
  const { project, db } = access;
  const current = CodeAppSchema.safeParse(project.code);
  if (project.kind !== "code" || !current.success) return { ok: false, status: 400, error: "This isn't an app written as code, so there's nothing to fix here.", code: "failed" };
  const app = current.data;

  // A build error is about a build that failed: if the latest build worked after the latest fix, the errors are old.
  const streak = await fixesInARow(db, project);
  const build = project.build;
  const builtSince = Boolean(build?.ok && (!streak.latestAt || Date.parse(build.at) > Date.parse(streak.latestAt)));
  if (problem.build && builtSince) return { ok: false, status: 409, error: "The latest build worked, so these errors are from an older one. Build it again to see where it stands.", code: "stale" };
  // A runtime error means the app didn't start, so a build that only compiled doesn't count as working: the count goes on.
  if (streak.count >= REPAIR_LIMIT)
    return {
      ok: false,
      status: 429,
      error: `Prod AI has tried to fix this ${REPAIR_LIMIT} times in a row and it still isn't right. Describe what you want in a note, or go back to an earlier version.`,
      code: "repair-limit",
    };

  if (!(await withinLimit(`code-repair:user:${user.id}`, PER_PERSON.max, PER_PERSON.windowSeconds)) || !(await withinLimit(`code-repair:project:${project.id}`, PER_PROJECT.max, PER_PROJECT.windowSeconds)))
    return { ok: false, status: 429, error: "That's a lot of fixes in a few minutes. Wait a little, then try again.", code: "rate" };

  const m = getModel();
  if (!m) return { ok: false, status: 503, error: "Fixing the code needs Claude, which isn't set up here.", code: "unavailable" };
  const prompt = fixPrompt(app, problem);
  const hold = await holdModelBudget(user, "change", promptHoldUsd(FIX_INSTRUCTIONS.length + prompt.length, EDIT_MAX_OUTPUT));
  if (!hold.ok)
    return hold.reason === "rate"
      ? { ok: false, status: 429, error: "That's a lot of work for Claude in a few minutes. Wait a little, then try again.", code: "rate" }
      : { ok: false, status: 503, error: "Claude has done a lot for this account today, so it can't fix the code right now. It comes back within 24 hours.", code: "unavailable" };

  // Free: every attempt's real cost is metered at 0 credits, failures included.
  const meter = (spent: ModelSpend) =>
    logUsage({ userId: user.id, projectId: project.id, kind: "llm", provider: "anthropic", model: spent.model, inputTokens: spent.inputTokens, outputTokens: spent.outputTokens, costUsd: spent.costUsd, credits: 0, meta: { op: "code-repair", free: true, modelCredits: spent.credits, failed: spent.failed, estimated: spent.estimated } });
  let next: CodeApp | null = null;
  let summary = "";
  let reply = "";
  try {
    const fix = await editWithClaude(m, { instructions: FIX_INSTRUCTIONS, prompt, userId: user.id });
    await meter(fix.spent);
    if (!fix.edit) return { ok: false, status: 502, error: "Claude couldn't work out a fix this time. Try again, or describe what you want in a note.", code: "failed" };
    summary = fix.edit.summary;
    reply = fix.edit.reply;
    let checked = await checkApp(applyEdit(app, fix.edit));
    if (!checked.ok) {
      // Once more, with what the checks found, under the same hold (it covers one attempt at a time).
      console.warn("[code-apps] a fix didn't pass the checks, retrying once:", checked.errors.slice(0, 5));
      const again = await editWithClaude(m, { instructions: FIX_INSTRUCTIONS, prompt: fixPrompt(checked.draft as CodeApp, { ...problem, checks: checked.errors }), userId: user.id });
      await meter(again.spent);
      if (again.edit) {
        checked = await checkApp(applyEdit(checked.draft, again.edit));
        if (again.edit.summary) summary = again.edit.summary;
      }
    }
    if (!checked.ok) return { ok: false, status: 502, error: "Claude's fix didn't pass Prod AI's checks, so it wasn't saved. Try again, or describe what you want in a note.", code: "failed" };
    next = checked.app;
  } finally {
    await hold.release();
  }

  const files = fileChanges(app, next);
  if (!files.length && sameManifest(app.manifest, next.manifest))
    return { ok: false, status: 422, error: "Claude didn't find anything to change for that error. Describe what you want in a note.", code: "failed" };

  const words = summary || "Fixed what broke";
  // The build is cleared, so the studio builds the fixed files.
  await updateProject(db, project.id, { code: next, build: null });
  const cp = await addCheckpoint(db, project.id, { label: `Prod AI's fix: ${words}`.slice(0, 60), kind: "repair", blueprint: project.blueprint, code: next, summary: reply || words });
  const problemWords = problem.build?.[0]?.message ?? problem.runtime?.message ?? "";
  try {
    await addLedger(db, project.id, [
      {
        lane: "did",
        kind: "repair",
        blame: "system_fix",
        title: `Prod AI's fix: ${words}`,
        body: `${reply ? `${reply} ` : ""}Free: you're never charged for Prod AI's fixes.`,
        credits: 0,
        checkpointId: cp.id,
        meta: { code: true, files, error: problemWords.slice(0, 300), fixInARow: streak.count + 1 },
      },
    ]);
  } catch (e) {
    console.error("[code-apps] could not add the fix to the history:", e instanceof Error ? e.message : e);
  }
  return { ok: true, version: cp.seq, checkpointId: cp.id, label: cp.label, summary: words, reply, files, code: next, left: Math.max(0, REPAIR_LIMIT - streak.count - 1) };
}
