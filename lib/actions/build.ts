"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient, type Supa } from "@/lib/supabase/server";
import { getProject } from "@/lib/db/queries";
import { addCheckpoint, addLedger, logUsage, updateProject } from "@/lib/db/writes";
import { applyOps, markBuilt } from "@/lib/blueprint/apply";
import type { ObjectRef } from "@/lib/blueprint/schema";
import type { BuildState } from "@/lib/db/types";
import { planRepair, repairLedgerTitle } from "@/lib/sim/repair";
import { rehearsalOutcome } from "@/lib/sim/rehearse";

type Result = { ok: true } | { ok: false; error: string };

/** "1 AI helper", "2 AI helpers": counts in plain words. */
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The fix already chosen during the current build, read back from its history entry. */
export type DecidedRepair = { planId: string; optionId: "a" | "b"; objectRef: ObjectRef | null };

export type StartBuildResult =
  | { ok: true; state: "built" }
  | {
      ok: true;
      state: "building";
      /** Credits taken by this call: the estimate on a fresh start, 0 when the build was already paid for. */
      credits: number;
      /** Credits taken for this build and not refunded yet (refunded in full if it's stopped). */
      charged: number;
      /** True when the build was already under way (a reload, a closed tab, a second tab): pick it up, don't restart it. */
      resumed: boolean;
      /** Set when the repair decision was already made before the interruption, so it isn't asked (or applied) twice. */
      repair: DecidedRepair | null;
    }
  | { ok: false; error: string };

async function load(projectId: string) {
  const user = await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) throw new Error("Project not found");
  return { user, supa, project };
}

/**
 * Move the project from one build state to another only if it is still in the expected one.
 * Returns false when something else (a second tab, a double click, a retry) got there first.
 */
async function claimState(supa: Supa, projectId: string, from: BuildState, patch: Parameters<typeof updateProject>[2]): Promise<boolean> {
  const { data, error } = await supa.from("projects").update(patch).eq("id", projectId).eq("build_state", from).select("id");
  if (error) throw error;
  return Boolean(data?.length);
}

async function buildStateOf(supa: Supa, projectId: string): Promise<BuildState | null> {
  const { data } = await supa.from("projects").select("build_state").eq("id", projectId).maybeSingle();
  return (data?.build_state as BuildState | undefined) ?? null;
}

/** Credits taken for this project's build and not refunded: Work Order charges minus build refunds. */
async function outstandingCharge(supa: Supa, projectId: string): Promise<number> {
  const { data, error } = await supa.from("usage_events").select("credits").eq("project_id", projectId).in("kind", ["build", "refund"]);
  if (error) throw error;
  const net = (data ?? []).reduce((sum, r) => sum + (Number(r.credits) || 0), 0);
  return Math.max(0, Math.round(net * 100) / 100);
}

/** The repair already decided in the current build: a repair entry newer than the latest Work Order approval. */
async function decidedRepair(supa: Supa, projectId: string): Promise<DecidedRepair | null> {
  const { data, error } = await supa
    .from("ledger_events")
    .select("kind, object_ref, meta")
    .eq("project_id", projectId)
    .in("kind", ["work_order", "repair"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  for (const r of data ?? []) {
    if (r.kind === "work_order") break;
    const meta = r.meta as { planId?: unknown; optionId?: unknown } | null;
    if (typeof meta?.planId === "string") return { planId: meta.planId, optionId: meta.optionId === "b" ? "b" : "a", objectRef: (r.object_ref as ObjectRef | null) ?? null };
  }
  return null;
}

/**
 * Approve the build Work Order. Idempotent: if this project's build is already paid for or under
 * way (a closed tab, a reload, a second tab, a double click), nothing more is charged and the
 * caller is told to resume it where it stopped.
 */
export async function startBuild(projectId: string): Promise<StartBuildResult> {
  try {
    const { user, supa, project } = await load(projectId);
    if (project.build_state === "built") return { ok: true, state: "built" };

    if (project.build_state !== "building" && (await claimState(supa, projectId, project.build_state, { build_state: "building" }))) {
      // A build stopped without a refund (for example by restoring a save point mid-build) is still paid for.
      const already = await outstandingCharge(supa, projectId);
      const estimate = project.blueprint.estimate.credits;
      const credits = already > 0 ? 0 : estimate;
      await supa.from("work_orders").update({ status: "running" }).eq("project_id", projectId).eq("kind", "build").eq("status", "proposed");
      await addLedger(supa, projectId, [
        credits
          ? {
              lane: "thought",
              kind: "work_order",
              title: "You pressed Make it real",
              body: `Build ${count(project.blueprint.screens.length, "screen")} and ${count(project.blueprint.agents.length, "AI helper")} · about ${project.blueprint.estimate.minutes} min for a real build, about 30 s here (simulated). ${credits} credits is the estimated price, taken from your demo balance and refunded if you stop.`,
              credits,
            }
          : {
              lane: "thought",
              kind: "work_order",
              title: "Started the build again · nothing more charged",
              body: `The ${already} credits taken earlier still cover this build, and they're refunded if you stop.`,
              credits: 0,
            },
      ]);
      if (credits) await logUsage(supa, { userId: user.id, projectId, kind: "build", credits, meta: { note: "Work Order estimate", scripted: true } });
      revalidatePath(`/p/${projectId}`, "layout");
      return { ok: true, state: "building", credits, charged: credits || already, resumed: false, repair: null };
    }

    // Already under way here or elsewhere: charge nothing, and hand back what the client needs to pick it up.
    const state = project.build_state === "building" ? "building" : await buildStateOf(supa, projectId);
    if (state === "built") return { ok: true, state: "built" };
    if (state !== "building") return { ok: false, error: "The build was stopped a moment ago. Nothing was charged. Try again." };
    const [charged, repair] = await Promise.all([outstandingCharge(supa, projectId), decidedRepair(supa, projectId)]);
    revalidatePath(`/p/${projectId}`, "layout");
    return { ok: true, state: "building", credits: 0, charged, resumed: true, repair };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not start the build" };
  }
}

export async function resolveRepair(projectId: string, planId: string, optionId: "a" | "b"): Promise<Result> {
  try {
    const { supa, project } = await load(projectId);
    if (project.build_state !== "building") return { ok: true }; // replay or already resolved
    // Decided already in this build (a second tab, or a retry after a dropped response): never apply a fix twice.
    if (await decidedRepair(supa, projectId)) return { ok: true };
    const plan = planRepair(project.blueprint);
    if (plan.id !== planId) return { ok: true }; // already applied on an earlier attempt
    const option = plan.options.find((o) => o.id === optionId)!;
    const applied = applyOps(project.blueprint, option.ops);
    if (!applied.ok) return { ok: false, error: applied.error };
    await updateProject(supa, projectId, { blueprint: applied.blueprint });
    await addLedger(supa, projectId, [
      {
        lane: "checked",
        kind: "repair",
        blame: "system_fix",
        title: repairLedgerTitle(plan),
        body: option.narration,
        objectRef: plan.objectRef,
        credits: 0,
        meta: { planId, optionId, changelog: option.changelog },
      },
    ]);
    revalidatePath(`/p/${projectId}`, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not apply the fix" };
  }
}

export async function completeBuild(projectId: string): Promise<Result> {
  try {
    const { supa, project } = await load(projectId);
    if (project.build_state === "built") return { ok: true };
    if (project.build_state !== "building") return { ok: false, error: "This build was stopped, so nothing was saved and nothing was charged." };
    const now = new Date().toISOString();
    const built = markBuilt(project.blueprint);
    // The build's final rehearsal run, judged the same way as Agents › Rehearsals, so every screen reads the same results.
    let rehearsals = 0;
    let passed = 0;
    for (const a of built.agents)
      for (const r of a.rehearsals) {
        const out = rehearsalOutcome(a, r);
        r.history = [...r.history, { at: now, pass: out.pass, note: out.pass ? "Passed during build" : out.note }].slice(-10);
        rehearsals++;
        if (out.pass) passed++;
      }
    // Finish once: a second tab finishing at the same moment (or a stop that just landed) wins cleanly.
    if (!(await claimState(supa, projectId, "building", { blueprint: built, build_state: "built" }))) {
      return (await buildStateOf(supa, projectId)) === "built" ? { ok: true } : { ok: false, error: "This build was stopped, so nothing was saved and nothing was charged." };
    }
    const cp = await addCheckpoint(supa, projectId, {
      label: "Build complete",
      kind: "build",
      blueprint: built,
      summary: `${count(built.screens.length, "screen")} · ${count(built.agents.length, "AI helper")} · ${passed} of ${count(rehearsals, "test run")} passed`,
    });
    await addLedger(supa, projectId, [
      {
        lane: "did",
        kind: "build_step",
        title: `Built ${count(built.screens.length, "screen")} and ${count(built.agents.length, "AI helper")}`,
        body: built.screens.map((s) => s.title).join(", ") + ".",
        checkpointId: cp.id,
      },
      { lane: "checked", kind: "rehearsal", title: `Test runs: ${passed} of ${rehearsals} passed`, ...(passed < rehearsals ? { body: "Open AI helpers › Tests & reliability to see what failed and fix it." } : {}), checkpointId: cp.id },
    ]);
    await supa.from("work_orders").update({ status: "done", resolved_at: now }).eq("project_id", projectId).eq("kind", "build").eq("status", "running");
    revalidatePath(`/p/${projectId}`, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not finish the build" };
  }
}

/**
 * Stop mid-build (from the repair card, or an interrupted build's dock). Nothing is charged:
 * exactly what was taken for this build goes back on the balance, once.
 */
export async function cancelBuild(projectId: string): Promise<Result & { refunded?: number }> {
  try {
    const { user, supa, project } = await load(projectId);
    if (project.build_state !== "building") return { ok: true, refunded: 0 };
    if (!(await claimState(supa, projectId, "building", { build_state: "draft" }))) return { ok: true, refunded: 0 }; // stopped or finished elsewhere
    const [refund, fix] = await Promise.all([outstandingCharge(supa, projectId), decidedRepair(supa, projectId)]);
    await supa.from("work_orders").update({ status: "proposed" }).eq("project_id", projectId).eq("kind", "build").eq("status", "running");
    if (refund > 0) await logUsage(supa, { userId: user.id, projectId, kind: "refund", credits: -refund, meta: { note: "Build stopped, refunded" } });
    const plan = fix ? "The plan keeps the free fix Prod AI made during the build. Everything else is exactly as you left it." : "The plan is exactly as you left it.";
    // Stopping is the person's choice, not a fix Prod AI made: log it as theirs (no "Our fix" badge, not counted as a fix).
    await addLedger(supa, projectId, [
      {
        lane: "did",
        kind: "restore",
        blame: "user",
        title: refund > 0 ? "Stopped the build · refunded" : "Stopped the build",
        body: `${refund > 0 ? `The ${refund}-credit estimated price went back on your demo balance, so nothing was charged.` : "Nothing was charged."} ${plan}`,
        credits: 0,
      },
    ]);
    revalidatePath(`/p/${projectId}`, "layout");
    return { ok: true, refunded: refund };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not stop the build" };
  }
}
