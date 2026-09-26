"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProject } from "@/lib/db/queries";
import { addCheckpoint, addLedger, logUsage, updateProject } from "@/lib/db/writes";
import { applyOps } from "@/lib/blueprint/apply";
import type { ObjectRef } from "@/lib/blueprint/schema";
import type { ChangeProposal, WorkOrderRow } from "@/lib/db/types";
import { proposeChange } from "@/lib/change/propose";
import { usageSummary } from "@/lib/db/queries";
import { modelBudgetOk } from "@/lib/llm/guard";

export type RequestChangeResult =
  | { ok: true; workOrder: WorkOrderRow; overBudget: boolean }
  | { ok: false; error: string };

export async function requestChange(projectId: string, request: string, scope: ObjectRef | null): Promise<RequestChangeResult> {
  const user = await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false, error: "Project not found" };
  const text = request.trim().slice(0, 1000);
  if (!text) return { ok: false, error: "Describe the change first" };

  // Quotes are free, but a project past its cap stays paused, exactly like agent runs (app/api/chat/route.ts).
  const spent = await usageSummary(supa, { projectId });
  const cap = project.settings.budgetCapCredits;
  if (spent.credits >= cap) {
    return { ok: false, error: `Paused: this project has used ${Math.round(spent.credits)} of its ${cap}-credit cap. Raise the cap in Settings to ask for more changes. Nothing was charged.` };
  }

  const { proposal, usage } = await proposeChange(project.blueprint, text, scope, { allowModel: await modelBudgetOk(supa, user) });
  if (usage) {
    // Free to you: 0 credits on your meter. Tokens and real cost are still recorded for our own metrics and the daily model budget.
    await logUsage(supa, { userId: user.id, projectId, kind: "llm", provider: "anthropic", model: usage.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd, credits: 0, meta: { op: "change-quote", free: true, modelCredits: usage.credits } });
  }
  const { data, error } = await supa
    .from("work_orders")
    .insert({ project_id: projectId, request: text, kind: "change", estimate: { credits: proposal.credits, minutes: proposal.minutes }, proposal: { ...proposal, scope } as ChangeProposal, status: "proposed" })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, workOrder: data as WorkOrderRow, overBudget: spent.credits + proposal.credits > cap };
}

export async function approveChange(projectId: string, workOrderId: string): Promise<{ ok: boolean; error?: string; label?: string }> {
  const user = await requireUser();
  const supa = await createClient();
  const [project, { data: wo }] = await Promise.all([
    getProject(supa, projectId),
    supa.from("work_orders").select("*").eq("id", workOrderId).eq("project_id", projectId).maybeSingle(),
  ]);
  if (!project || !wo) return { ok: false, error: "Work Order not found" };
  const order = wo as WorkOrderRow;
  if (order.status !== "proposed" || !order.proposal) return { ok: false, error: "This Work Order was already handled" };
  const applied = applyOps(project.blueprint, order.proposal.operations);
  if (!applied.ok) return { ok: false, error: `The change no longer fits the project (${applied.error}). Ask again.` };

  await updateProject(supa, projectId, { blueprint: applied.blueprint });
  const cp = await addCheckpoint(supa, projectId, { label: order.proposal.summary.slice(0, 60), kind: "change", blueprint: applied.blueprint, summary: order.request });
  await addLedger(supa, projectId, [
    {
      lane: "did",
      kind: "change",
      title: order.proposal.summary,
      body: order.proposal.rationale,
      credits: order.proposal.credits,
      checkpointId: cp.id,
      objectRef: (order.proposal as ChangeProposal & { scope?: ObjectRef | null }).scope ?? null,
      meta: { workOrderId, mode: order.proposal.mode },
    },
  ]);
  await logUsage(supa, { userId: user.id, projectId, kind: "change", credits: order.proposal.credits, meta: { workOrderId, scripted: true } });
  await supa.from("work_orders").update({ status: "done", resolved_at: new Date().toISOString() }).eq("id", workOrderId);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true, label: `Save point #${cp.seq}` };
}

export async function rejectChange(projectId: string, workOrderId: string) {
  await requireUser();
  const supa = await createClient();
  await supa.from("work_orders").update({ status: "rejected", resolved_at: new Date().toISOString() }).eq("id", workOrderId).eq("project_id", projectId);
  return { ok: true };
}
