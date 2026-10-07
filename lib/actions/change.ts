"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient, type Supa } from "@/lib/supabase/server";
import { getProject } from "@/lib/db/queries";
import { addCheckpoint, addLedger, logUsage, updateProject } from "@/lib/db/writes";
import { applyOps } from "@/lib/blueprint/apply";
import type { ObjectRef } from "@/lib/blueprint/schema";
import type { ChangeProposal, ProjectRow, WorkOrderRow } from "@/lib/db/types";
import { CHANGE_MAX_OUTPUT, changePromptChars, proposeChange } from "@/lib/change/propose";
import { usageSummary } from "@/lib/db/queries";
import { holdModelBudget, planFitsModel, promptHoldUsd, type ModelHold } from "@/lib/llm/guard";
import { PRICE, canAfford, creditsThisMonth, outOfCreditsNote, resetWords } from "@/lib/pricing";
import { monthStartIso } from "@/lib/prices";
import type { SessionUser } from "@/lib/auth";
import { getModel } from "@/lib/llm/provider";
import { applyCodeChange, codeChangeHoldUsd, isCodeProposal, proposeCodeChange } from "@/lib/code-apps/change";

export type RequestChangeResult =
  | { ok: true; workOrder: WorkOrderRow; overBudget: boolean; note?: string }
  | { ok: false; error: string };

export async function requestChange(projectId: string, request: string, scope: ObjectRef | null): Promise<RequestChangeResult> {
  const user = await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false, error: "Project not found" };
  const text = request.trim().slice(0, 1000);
  if (!text) return { ok: false, error: "Describe the change first" };
  // A code app: Claude changes its files (lib/code-apps/change.ts). Business apps carry on below, exactly as before.
  if (project.kind === "code") return requestCodeChange(user, supa, project, text, scope);

  // Past the project's spending cap only Claude's work is paused, exactly like agent runs (app/api/chat/route.ts).
  // Free, rule-based changes still come back, with a short note saying why Claude didn't write it.
  const spent = await usageSummary(supa, { projectId, sinceIso: monthStartIso() });
  const cap = project.settings.budgetCapCredits;
  const capped = spent.credits >= cap;

  // A plan that fails the schema, or is huge, never goes to the model: the free, rule-based change is offered.
  // Otherwise the hold is sized from what this quote can send: a first attempt and a retry, each at its output cap.
  const fits = planFitsModel(project.blueprint);
  const sends = fits ? changePromptChars(project.blueprint, text) : null;
  const hold: ModelHold = sends
    ? await holdModelBudget(user, "change", promptHoldUsd(sends.first, CHANGE_MAX_OUTPUT) + promptHoldUsd(sends.retry, CHANGE_MAX_OUTPUT))
    : { ok: false, reason: "budget" };
  if (!hold.ok && hold.reason === "rate") return { ok: false, error: "That's a lot of changes in a few minutes. Wait a little, then try again. Nothing was charged." };
  // Claude writes the change only for someone who could pay to apply it; otherwise the free, rule-based
  // change is offered (or it goes to a person), so quotes can't run up model costs.
  const afford = hold.ok && !capped ? await canAfford(user.id, user.isAnonymous, "change") : null;
  const useModel = hold.ok && !capped && Boolean(afford?.ok);
  const creditsNote = afford && !afford.ok && afford.credits.allowance ? outOfCreditsNote(afford.credits, "this change was worked out without Claude") : undefined;
  try {
    const { proposal, usage } = await proposeChange(project.blueprint, text, scope, { allowModel: useModel });
    const capWords = `Claude is paused: this project has reached its ${cap}-credit spending cap this month`;
    const note = capped ? (proposal.operations.length ? `${capWords}, so the free built-in rules worked this out.` : `${capWords}, and the free built-in rules can't make this one.`) : creditsNote;
    if (usage) {
      // The quote is free: 0 credits. Its real cost is metered, failed attempts included, for the daily model budget.
      await logUsage({ userId: user.id, projectId, kind: "llm", provider: "anthropic", model: usage.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd, credits: 0, meta: { op: "change-quote", free: true, modelCredits: usage.credits } });
    }
    // Applying a change Claude wrote costs one price; a rule-based change, or an answer, is free.
    const priced = { ...proposal, credits: proposal.mode === "live" && proposal.operations.length ? PRICE.change : 0 };
    const saved = await saveQuote(supa, projectId, text, scope, priced, spent.credits, cap);
    return saved.ok && note ? { ...saved, note } : saved;
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
  // Only a priced change (Claude's) can go past the cap; a free one never does.
  return { ok: true, workOrder, overBudget: proposal.credits > 0 && spentCredits + proposal.credits > cap };
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
            meta: { workOrderId, estimate: { credits: p.credits, minutes: p.minutes }, needsPerson, mode: p.mode, ...(isCodeProposal(p) ? { code: true, files: p.files } : {}) },
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
  if (project.kind === "code") return approveCodeChange(user, supa, project, order);
  const applied = applyOps(project.blueprint, order.proposal.operations);
  if (!applied.ok) {
    console.warn("[change] quote no longer applies:", applied.error);
    return { ok: false, error: "The project changed since this quote, so it no longer fits. Nothing was charged. Ask again for a fresh quote." };
  }
  // A change Claude wrote is paid from this month's credits: check before anything is applied.
  if (order.proposal.credits > 0) {
    const c = await creditsThisMonth(user.id, user.isAnonymous);
    if (c.left < order.proposal.credits) {
      return { ok: false, error: `This change costs ${order.proposal.credits} credits and you have ${Math.floor(c.left)} left this month. ${resetWords(c.resetsOn)} Nothing was charged.` };
    }
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

/**
 * A note on a code app. Claude reads the current files and proposes whole-file replacements (checked before
 * it's quoted); applying it costs PRICE.codeChange, a question answered is free. There's no rule-based way
 * to change code, so without Claude (no model, no credits, past the project's cap) the note gets a plain no.
 */
async function requestCodeChange(user: SessionUser, supa: Supa, project: ProjectRow, text: string, scope: ObjectRef | null): Promise<RequestChangeResult> {
  const projectId = project.id;
  if (!project.code) return { ok: false, error: "This app has no files yet, so there's nothing to change." };
  const spent = await usageSummary(supa, { projectId, sinceIso: monthStartIso() });
  const cap = project.settings.budgetCapCredits;
  if (spent.credits >= cap) return { ok: false, error: `Claude is paused: this project has reached its ${cap}-credit spending cap this month, and changing an app's code needs Claude. You can raise the cap in Settings. Nothing was charged.` };
  const m = getModel();
  if (!m) return { ok: false, error: "Changing an app's code needs Claude, which isn't set up here. Nothing was charged." };
  // Claude writes the change only for someone who could pay to apply it, so quotes can't run up model costs.
  const hold = await holdModelBudget(user, "change", codeChangeHoldUsd(project.code, text));
  if (!hold.ok && hold.reason === "rate") return { ok: false, error: "That's a lot of changes in a few minutes. Wait a little, then try again. Nothing was charged." };
  if (!hold.ok) return { ok: false, error: "Claude has done a lot for this account today, so it can't change the code right now. It comes back within 24 hours. Nothing was charged." };
  try {
    const afford = await canAfford(user.id, user.isAnonymous, "codeChange");
    if (!afford.ok) {
      return {
        ok: false,
        error: afford.credits.allowance
          ? `A change to the code costs ${PRICE.codeChange} credits. ${outOfCreditsNote(afford.credits, "Claude can't change it right now")}`
          : `A change to the code costs ${PRICE.codeChange} credits. Sign in to get free credits every month.`,
      };
    }
    const quote = await proposeCodeChange(m, project.code, text, { userId: user.id, holdRetry: (usd) => holdModelBudget(user, "change", usd) });
    // The quote is free: 0 credits. Its real cost is metered, failed attempts included, for the daily model budget.
    for (const u of quote.spent) {
      await logUsage({ userId: user.id, projectId, kind: "llm", provider: "anthropic", model: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens, costUsd: u.costUsd, credits: 0, meta: { op: "code-change-quote", free: true, modelCredits: u.credits, failed: u.failed, estimated: u.estimated } });
    }
    if (!quote.proposal) return { ok: false, error: quote.error };
    return await saveQuote(supa, projectId, text, scope, quote.proposal, spent.credits, cap);
  } finally {
    await hold.release();
  }
}

/** Apply a code change: a new version with the new files, the build cleared so the studio builds it again, charged once. */
async function approveCodeChange(user: SessionUser, supa: Supa, project: ProjectRow, order: WorkOrderRow): Promise<{ ok: boolean; error?: string; label?: string }> {
  const projectId = project.id;
  const workOrderId = order.id;
  const proposal = order.proposal;
  if (!isCodeProposal(proposal) || !project.code) return { ok: false, error: "This change doesn't fit this app. Nothing was charged. Ask again for a fresh quote." };
  if (proposal.answer) return { ok: false, error: "That was an answer, so there's nothing to apply." };
  const applied = await applyCodeChange(project.code, proposal.code);
  if (!applied.ok) return { ok: false, error: applied.error };
  if (!applied.changed) return { ok: false, error: "The app already has this change. Nothing was charged." };
  // The price is the code change's, whatever the stored quote says: prices are never read from a row people can write.
  const credits = PRICE.codeChange;
  const c = await creditsThisMonth(user.id, user.isAnonymous);
  if (c.left < credits) return { ok: false, error: `This change costs ${credits} credits and you have ${Math.floor(c.left)} left this month. ${resetWords(c.resetsOn)} Nothing was charged.` };
  // Claim the Work Order before touching anything: a double click or a second tab applies (and charges) it once.
  const { data: claimed, error: claimError } = await supa.from("work_orders").update({ status: "approved" }).eq("id", workOrderId).eq("project_id", projectId).eq("status", "proposed").select("id");
  if (claimError) return { ok: false, error: "Couldn't approve it just now. Nothing was charged. Try again." };
  if (!claimed?.length) return { ok: false, error: "This change was already handled" };

  const renamed = applied.app.manifest.title !== project.code.manifest.title && project.name === project.code.manifest.title;
  try {
    // The build is cleared, so the studio knows to build the new files.
    await updateProject(supa, projectId, { code: applied.app, build: null, ...(renamed ? { name: applied.app.manifest.title } : {}) });
  } catch (e) {
    console.error("[change] could not apply the code change:", e instanceof Error ? e.message : e);
    await supa.from("work_orders").update({ status: "proposed" }).eq("id", workOrderId);
    return { ok: false, error: "Couldn't apply the change just now. Nothing was charged. Try again." };
  }
  const cp = await addCheckpoint(supa, projectId, { label: proposal.summary.slice(0, 60), kind: "change", blueprint: project.blueprint, code: applied.app, summary: order.request });
  await addLedger(supa, projectId, [
    {
      lane: "did",
      kind: "change",
      title: proposal.summary,
      body: proposal.rationale,
      credits,
      checkpointId: cp.id,
      objectRef: (proposal as ChangeProposal & { scope?: ObjectRef | null }).scope ?? null,
      meta: { workOrderId, mode: proposal.mode, code: true, files: applied.files },
    },
  ]);
  await logUsage({ userId: user.id, projectId, kind: "change", credits, meta: { workOrderId, op: "code-change" } });
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
