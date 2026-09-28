"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient, type Supa } from "@/lib/supabase/server";
import { getProject } from "@/lib/db/queries";
import { addCheckpoint, addLedger, logUsage, updateProject } from "@/lib/db/writes";
import { applyOps } from "@/lib/blueprint/apply";
import type { ObjectRef } from "@/lib/blueprint/schema";
import type { ChangeProposal, WorkOrderRow } from "@/lib/db/types";
import { proposeChange } from "@/lib/change/propose";
import { usageSummary } from "@/lib/db/queries";
import { holdModelBudget } from "@/lib/llm/guard";

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

  const hold = await holdModelBudget(user, "change");
  if (!hold.ok && hold.reason === "rate") return { ok: false, error: "That's a lot of changes in a few minutes. Wait a little, then try again. Nothing was charged." };
  try {
    const { proposal, usage } = await proposeChange(project.blueprint, text, scope, { allowModel: hold.ok });
    if (usage) {
      // Free to you: 0 credits on your meter. Tokens and real cost are still metered, failed attempts included, for the daily model budget.
      await logUsage({ userId: user.id, projectId, kind: "llm", provider: "anthropic", model: usage.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd, credits: 0, meta: { op: "change-quote", free: true, modelCredits: usage.credits } });
    }
    return await saveQuote(supa, projectId, text, scope, proposal, spent.credits, cap);
  } finally {
    if (hold.ok) await hold.release();
  }
}

async function saveQuote(supa: Supa, projectId: string, text: string, scope: ObjectRef | null, proposal: Awaited<ReturnType<typeof proposeChange>>["proposal"], spentCredits: number, cap: number): Promise<RequestChangeResult> {
  const { data, error } = await supa
    .from("work_orders")
    .insert({ project_id: projectId, request: text, kind: "change", estimate: { credits: proposal.credits, minutes: proposal.minutes }, proposal: { ...proposal, scope } as ChangeProposal, status: "proposed" })
    .select("*")
    .single();
  if (error) {
    console.error("[change] could not save the quote:", error.message);
    return { ok: false, error: "Couldn't save the quote. Nothing was charged. Try again." };
  }
  const workOrder = data as WorkOrderRow;
  await logChat(supa, projectId, text, scope, workOrder.id, proposal);
  return { ok: true, workOrder, overBudget: spentCredits + proposal.credits > cap };
}

/**
 * The notes thread in the margin: what you asked and what came back, both in the history so they survive a reload.
 * Free (0 credits). The applied change and its save point are logged by approveChange, linked by `workOrderId`.
 * Best effort: the quote is already saved, so a failed write here never costs you the answer.
 */
async function logChat(supa: Supa, projectId: string, text: string, scope: ObjectRef | null, workOrderId: string, p: ChangeProposal) {
  const needsPerson = !p.answer && p.operations.length === 0;
  try {
    await addLedger(supa, projectId, [
      { lane: "thought", kind: p.answer ? "question" : "request", blame: "user", title: text, credits: 0, objectRef: scope, meta: { workOrderId } },
      p.answer
        ? { lane: "thought", kind: "answer", title: "Answered your question · no change made", body: p.rationale, credits: 0, objectRef: scope, meta: { workOrderId, suggestion: p.summary, mode: p.mode } }
        : {
            lane: "thought",
            kind: "quote",
            title: p.summary,
            body: p.rationale,
            credits: 0,
            objectRef: scope,
            meta: { workOrderId, estimate: { credits: p.credits, minutes: p.minutes }, needsPerson, mode: p.mode },
          },
    ]);
  } catch (e) {
    console.error("[change] could not add the chat to the history:", e instanceof Error ? e.message : e);
  }
}

export async function approveChange(projectId: string, workOrderId: string): Promise<{ ok: boolean; error?: string; label?: string }> {
  const user = await requireUser();
  const supa = await createClient();
  const [project, { data: wo }] = await Promise.all([
    getProject(supa, projectId),
    supa.from("work_orders").select("*").eq("id", workOrderId).eq("project_id", projectId).maybeSingle(),
  ]);
  if (!project || !wo) return { ok: false, error: "That change is gone. Ask for it again." };
  const order = wo as WorkOrderRow;
  if (order.status !== "proposed" || !order.proposal) return { ok: false, error: "This change was already handled" };
  const applied = applyOps(project.blueprint, order.proposal.operations);
  if (!applied.ok) {
    console.warn("[change] quote no longer applies:", applied.error);
    return { ok: false, error: "The project changed since this quote, so it no longer fits. Nothing was charged. Ask again for a fresh quote." };
  }
  // Claim the Work Order before touching anything: a double click or a second tab applies (and charges) it once.
  const { data: claimed, error: claimError } = await supa.from("work_orders").update({ status: "approved" }).eq("id", workOrderId).eq("project_id", projectId).eq("status", "proposed").select("id");
  if (claimError) return { ok: false, error: "Couldn't approve it just now. Nothing was charged. Try again." };
  if (!claimed?.length) return { ok: false, error: "This change was already handled" };

  try {
    await updateProject(supa, projectId, { blueprint: applied.blueprint });
  } catch (e) {
    console.error("[change] could not apply:", e instanceof Error ? e.message : e);
    await supa.from("work_orders").update({ status: "proposed" }).eq("id", workOrderId);
    return { ok: false, error: "Couldn't apply the change just now. Nothing was charged. Try again." };
  }
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
  await logUsage({ userId: user.id, projectId, kind: "change", credits: order.proposal.credits, meta: { workOrderId, scripted: true } });
  await supa.from("work_orders").update({ status: "done", resolved_at: new Date().toISOString() }).eq("id", workOrderId);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true, label: `version ${cp.seq}` };
}

export async function rejectChange(projectId: string, workOrderId: string) {
  await requireUser();
  const supa = await createClient();
  await supa.from("work_orders").update({ status: "rejected", resolved_at: new Date().toISOString() }).eq("id", workOrderId).eq("project_id", projectId);
  return { ok: true };
}
