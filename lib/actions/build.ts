"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProject } from "@/lib/db/queries";
import { addCheckpoint, addLedger, logUsage, updateProject } from "@/lib/db/writes";
import { applyOps, markBuilt } from "@/lib/blueprint/apply";
import { planRepair } from "@/lib/sim/repair";
import { rehearsalOutcome } from "@/lib/sim/rehearse";

type Result = { ok: true } | { ok: false; error: string };

async function load(projectId: string) {
  const user = await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) throw new Error("Project not found");
  return { user, supa, project };
}

export async function startBuild(projectId: string): Promise<Result & { credits?: number }> {
  try {
    const { user, supa, project } = await load(projectId);
    if (project.build_state === "built") return { ok: true, credits: 0 };
    const credits = project.blueprint.estimate.credits;
    await updateProject(supa, projectId, { build_state: "building" });
    await supa.from("work_orders").update({ status: "running" }).eq("project_id", projectId).eq("kind", "build").eq("status", "proposed");
    await addLedger(supa, projectId, [
      {
        lane: "thought",
        kind: "work_order",
        title: "You approved the Work Order",
        body: `Build ${project.blueprint.screens.length} screens and ${project.blueprint.agents.length} agents · est. ${project.blueprint.estimate.minutes} min.`,
        credits,
      },
    ]);
    await logUsage(supa, { userId: user.id, projectId, kind: "build", credits, meta: { note: "Work Order estimate", scripted: true } });
    revalidatePath(`/p/${projectId}`, "layout");
    return { ok: true, credits };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not start the build" };
  }
}

export async function resolveRepair(projectId: string, planId: string, optionId: "a" | "b"): Promise<Result> {
  try {
    const { supa, project } = await load(projectId);
    if (project.build_state !== "building") return { ok: true }; // replay or already resolved
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
        title: `Caught: ${plan.title.replace(/^Rehearsal caught /, "")}`,
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
    await updateProject(supa, projectId, { blueprint: built, build_state: "built" });
    const cp = await addCheckpoint(supa, projectId, {
      label: "Build complete",
      kind: "build",
      blueprint: built,
      summary: `${built.screens.length} screens · ${built.agents.length} agents · ${passed} of ${rehearsals} rehearsals passed`,
    });
    await addLedger(supa, projectId, [
      {
        lane: "did",
        kind: "build_step",
        title: `Built ${built.screens.length} screens and put ${built.agents.length} agents on duty`,
        body: built.screens.map((s) => s.title).join(", ") + ".",
        checkpointId: cp.id,
      },
      { lane: "checked", kind: "rehearsal", title: `Rehearsed ${rehearsals} conversations · ${passed} passed`, ...(passed < rehearsals ? { body: "Open Agents › Rehearsals to see what failed and fix it." } : {}), checkpointId: cp.id },
    ]);
    await supa.from("work_orders").update({ status: "done", resolved_at: now }).eq("project_id", projectId).eq("kind", "build").eq("status", "running");
    revalidatePath(`/p/${projectId}`, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not finish the build" };
  }
}

/** Stop mid-build (from the repair card). Nothing is charged: the Work Order estimate is refunded. */
export async function cancelBuild(projectId: string): Promise<Result> {
  try {
    const { user, supa, project } = await load(projectId);
    if (project.build_state !== "building") return { ok: true };
    const credits = project.blueprint.estimate.credits;
    await updateProject(supa, projectId, { build_state: "draft" });
    await supa.from("work_orders").update({ status: "proposed" }).eq("project_id", projectId).eq("kind", "build").eq("status", "running");
    await logUsage(supa, { userId: user.id, projectId, kind: "refund", credits: -credits, meta: { note: "Build stopped at repair, refunded" } });
    await addLedger(supa, projectId, [
      { lane: "did", kind: "restore", blame: "system_fix", title: "You stopped the build. Nothing was charged", body: `The ${credits}-credit estimate was refunded. The plan is exactly as you left it.`, credits: 0 },
    ]);
    revalidatePath(`/p/${projectId}`, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not stop the build" };
  }
}
