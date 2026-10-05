"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCheckpointsFull, getProject, listCheckpoints, listLedger } from "@/lib/db/queries";
import { addCheckpoint, addLedger, updateProject } from "@/lib/db/writes";
import { objectLabel, resolveRef } from "@/lib/blueprint";
import type { ObjectRef } from "@/lib/blueprint/schema";
import type { HandoffRow } from "@/lib/db/types";
import { generateFiles } from "@/lib/codegen/files";
import { diffFiles, diffToText } from "@/lib/codegen/diff";
import { applyOps } from "@/lib/blueprint/apply";

const TEAMMATES = [
  { id: "priya", name: "Priya Raman", role: "Platform engineer" },
  { id: "dev", name: "Dev Mehta", role: "Frontend engineer" },
  { id: "maya", name: "Maya Singh", role: "Claims lead" },
] as const;

export async function createHandoff(projectId: string, objectRef: ObjectRef, prompt: string, assigneeId: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false, error: "Project not found" };
  const mate = TEAMMATES.find((t) => t.id === assigneeId) ?? TEAMMATES[0];
  const text = prompt.trim().slice(0, 1200);
  if (!text) return { ok: false, error: "Tell them what you need" };

  // Context: the object, the last few requests, and the latest change as a diff.
  const [ledger, cps] = await Promise.all([listLedger(supa, projectId, 40), listCheckpoints(supa, projectId)]);
  const promptHistory = [project.brief, ...ledger.filter((l) => l.kind === "change" || l.kind === "tweak" || l.kind === "permission").slice(0, 3).map((l) => l.title)].filter(Boolean);
  let lastDiff = "";
  if (cps.length >= 2) {
    const full = await getCheckpointsFull(supa, [cps[1].id, cps[0].id]);
    const before = full.find((c) => c.id === cps[1].id);
    const after = full.find((c) => c.id === cps[0].id);
    if (before && after) lastDiff = diffToText(diffFiles(generateFiles(before.blueprint), generateFiles(after.blueprint)).slice(0, 3)).slice(0, 4000);
  }
  const label = objectLabel(project.blueprint, objectRef);
  const { data, error } = await supa
    .from("handoffs")
    .insert({ project_id: projectId, object_ref: objectRef, prompt: text, context: { objectLabel: label, promptHistory, lastDiff }, assignee: `${mate.name} · ${mate.role}`, status: "open" })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  await addLedger(supa, projectId, [
    { lane: "thought", kind: "handoff", title: `You asked ${mate.name.split(" ")[0]} about ${label}`, body: `“${text.slice(0, 140)}${text.length > 140 ? "…" : ""}”`, objectRef },
  ]);
  revalidatePath(`/p/${projectId}`, "layout");
  revalidatePath("/home");
  return { ok: true, id: data.id };
}

/**
 * Simulated teammate: resolves the handoff with a small, real change where one applies. The answer only says
 * something changed (and a version was saved) when it did; otherwise it says what they found and that nothing changed.
 * `version` is the saved version's number, or null when nothing changed.
 */
export async function resolveHandoff(projectId: string, handoffId: string, note?: string): Promise<{ ok: boolean; changelog?: string; version?: number | null; error?: string }> {
  await requireUser();
  const supa = await createClient();
  const [project, { data: row }] = await Promise.all([getProject(supa, projectId), supa.from("handoffs").select("*").eq("id", handoffId).maybeSingle()]);
  if (!project || !row) return { ok: false, error: "Not found" };
  const h = row as HandoffRow;
  if (h.status === "resolved") return { ok: true, changelog: h.resolution ?? "", version: savedVersionOf(h) };
  const who = h.assignee.split(" · ")[0];
  const first = who.split(" ")[0];
  const bp = project.blueprint;
  const target = resolveRef(bp, h.object_ref);
  const label = objectLabel(bp, h.object_ref);
  let ops: { op: "set" | "add" | "remove"; path: string; value?: unknown }[] = [];
  // What the teammate says if their change goes in, and if there was nothing for them to change.
  let changed = "";
  let unchanged = "";

  if (target?.type === "connection") {
    const i = bp.connections.findIndex((c) => c.id === target.value.id);
    if (target.value.status === "missing") ops = [{ op: "set", path: `/connections/${i}/status`, value: "configured" }];
    changed = `${target.value.name} is connected to the sandbox. Agents that use it now get real answers instead of test data.`;
    unchanged = `${target.value.name} was already connected to the sandbox, so there was nothing to change.`;
  } else if (target?.type === "agent") {
    const i = bp.agents.findIndex((a) => a.id === target.value.id);
    const rule = "When unsure, hand the case to a person and say why.";
    if (!target.value.rules.includes(rule) && target.value.rules.length < 8) ops = [{ op: "set", path: `/agents/${i}/rules`, value: [...target.value.rules, rule] }];
    changed = `${target.value.name} now hands anything it's unsure about to a person, with a reason. Its test runs still pass.`;
    unchanged = target.value.rules.includes(rule)
      ? `${target.value.name} already hands anything it's unsure about to a person, so there was nothing to change.`
      : `I looked over ${target.value.name}. It already has as many rules as it can take, so I didn't add another.`;
  } else if (target?.type === "screen" || target?.type === "block") {
    // A teammate can't redraw a screen from here: they answer, and the change itself is asked for on the Sheet.
    unchanged = `I looked at ${label}. It needs a change to the screen itself, so ask for it in a note on the Sheet and I'll review it before it goes out.`;
  } else {
    unchanged = "I had a look. Nothing needed changing.";
  }

  let checkpointId: string | null = null;
  let version: number | null = null;
  if (ops.length) {
    const applied = applyOps(bp, ops);
    if (applied.ok) {
      await updateProject(supa, projectId, { blueprint: applied.blueprint });
      const cp = await addCheckpoint(supa, projectId, { label: `${first}: ${label}`.slice(0, 60), kind: "teammate", blueprint: applied.blueprint, summary: note?.trim() || changed });
      checkpointId = cp.id;
      version = cp.seq;
    }
  }
  // Their own words when they wrote some; otherwise the summary of what happened.
  const changelog = note?.trim() || (version !== null ? changed : unchanged || "I had a look. Nothing needed changing.");
  await supa
    .from("handoffs")
    .update({ status: "resolved", resolution: changelog, resolved_at: new Date().toISOString(), context: { ...h.context, savedVersion: version } })
    .eq("id", handoffId);
  await addLedger(supa, projectId, [
    {
      lane: "did",
      kind: "handoff",
      blame: "teammate",
      title: version !== null ? `${first} resolved your request` : `${first} answered your request · nothing changed`,
      body: changelog,
      objectRef: h.object_ref,
      checkpointId,
      meta: { handoffId, savedVersion: version },
    },
  ]);
  revalidatePath(`/p/${projectId}`, "layout");
  revalidatePath("/home");
  return { ok: true, changelog, version };
}

/** The version a resolved handoff saved: a number, null when it changed nothing, undefined if it was resolved before this was recorded. */
function savedVersionOf(h: HandoffRow): number | null | undefined {
  const v = (h.context as { savedVersion?: unknown }).savedVersion;
  return typeof v === "number" ? v : v === null ? null : undefined;
}
