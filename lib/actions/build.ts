"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient, type Supa } from "@/lib/supabase/server";
import { getProject } from "@/lib/db/queries";
import { addLedger, logUsage, updateProject } from "@/lib/db/writes";
import type { BuildState } from "@/lib/db/types";

/*
 * Making a business app real runs on the server, streamed: app/api/build/[projectId] (lib/build/run.ts).
 * What's left here is stopping one.
 */

type Result = { ok: true } | { ok: false; error: string };

async function load(projectId: string) {
  const user = await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) throw new Error("Project not found");
  return { user, supa, project };
}

/** The person gets a plain message; the detail (often a database error) goes to the server log. */
function failure(e: unknown, plain: string): { ok: false; error: string } {
  if (e instanceof Error && e.message === "Project not found") return { ok: false, error: e.message };
  console.error(`[build] ${plain}:`, e);
  return { ok: false, error: plain };
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

/** Credits taken for this project's build and not refunded: Work Order charges minus build refunds. */
async function outstandingCharge(supa: Supa, projectId: string): Promise<number> {
  const { data, error } = await supa.from("usage_events").select("credits").eq("project_id", projectId).in("kind", ["build", "refund"]);
  if (error) throw error;
  const net = (data ?? []).reduce((sum, r) => sum + (Number(r.credits) || 0), 0);
  return Math.max(0, Math.round(net * 100) / 100);
}

/**
 * Stop mid-build (from the fix note, the progress line, or an interrupted build's note). The sketch goes back
 * to how it was, keeping a fix the person already picked. Test runs Claude already played stay charged (that
 * work happened); a build charged under the earliest pricing gets its charge back, once.
 */
export async function cancelBuild(projectId: string): Promise<Result & { refunded?: number }> {
  try {
    const { user, supa, project } = await load(projectId);
    if (project.build_state !== "building") return { ok: true, refunded: 0 };
    if (!(await claimState(supa, projectId, "building", { build_state: "draft" }))) return { ok: true, refunded: 0 }; // stopped or finished elsewhere
    const refund = await outstandingCharge(supa, projectId);
    const report = project.build_report;
    if (report) await supa.from("projects").update({ build_report: { ...report, phase: "stopped", lease: undefined } }).eq("id", projectId);
    const fixed = report?.fix?.chosen === "a" || report?.fix?.chosen === "b";
    await supa.from("work_orders").update({ status: "proposed" }).eq("project_id", projectId).eq("kind", "build").eq("status", "running");
    if (refund > 0) await logUsage({ userId: user.id, projectId, kind: "refund", credits: -refund, meta: { note: "Build stopped, refunded" } });
    const plan = fixed ? "The plan keeps the free fix you picked during the build. Everything else is exactly as you left it." : "The plan is exactly as you left it.";
    const tests = report?.credits ? ` The ${report.credits} credits of test runs Claude already played stay charged.` : "";
    // Stopping is the person's choice, not a fix Prod AI made: log it as theirs (no "Our fix" badge, not counted as a fix).
    await addLedger(supa, projectId, [
      {
        lane: "did",
        kind: "restore",
        blame: "user",
        title: refund > 0 ? "Stopped the build · refunded" : "Stopped the build",
        body: `${refund > 0 ? `The ${refund}-credit price it took under the earlier pricing went back on your balance.` : "Nothing more was charged."}${tests} ${plan}`,
        credits: 0,
      },
    ]);
    revalidatePath(`/p/${projectId}`, "layout");
    return { ok: true, refunded: refund };
  } catch (e) {
    return failure(e, "Could not stop the build");
  }
}
