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

/** Simulated teammate: resolves the handoff with a small, real change where one applies. */
export async function resolveHandoff(projectId: string, handoffId: string, note?: string): Promise<{ ok: boolean; changelog?: string; error?: string }> {
  await requireUser();
  const supa = await createClient();
  const [project, { data: row }] = await Promise.all([getProject(supa, projectId), supa.from("handoffs").select("*").eq("id", handoffId).maybeSingle()]);
  if (!project || !row) return { ok: false, error: "Not found" };
  const h = row as HandoffRow;
  if (h.status === "resolved") return { ok: true, changelog: h.resolution ?? "" };
  const who = h.assignee.split(" · ")[0];
  const first = who.split(" ")[0];
  const bp = project.blueprint;
  const target = resolveRef(bp, h.object_ref);
  let changelog = note?.trim() || "";
  let ops: { op: "set" | "add" | "remove"; path: string; value?: unknown }[] = [];

  if (target?.type === "connection") {
    const i = bp.connections.findIndex((c) => c.id === target.value.id);
    if (target.value.status === "missing") ops = [{ op: "set", path: `/connections/${i}/status`, value: "configured" }];
    changelog ||= `${target.value.name} is connected to the sandbox. Agents that use it now get real answers instead of test data.`;
  } else if (target?.type === "agent") {
    const i = bp.agents.findIndex((a) => a.id === target.value.id);
    const rule = "When unsure, hand the case to a person and say why.";
    if (!target.value.rules.includes(rule) && target.value.rules.length < 8) ops = [{ op: "set", path: `/agents/${i}/rules`, value: [...target.value.rules, rule] }];
    changelog ||= `${target.value.name} now hands anything it's unsure about to a person, with a reason. Its rehearsals still pass.`;
  } else if (target?.type === "screen" || target?.type === "block") {
    changelog ||= `Updated ${objectLabel(bp, h.object_ref)} as you asked. It's live in the Test version. Have a look before it goes out.`;
  } else {
    changelog ||= "Done. The change is in the Test version for you to check.";
  }

  let checkpointId: string | null = null;
  if (ops.length) {
    const applied = applyOps(bp, ops);
    if (applied.ok) {
      await updateProject(supa, projectId, { blueprint: applied.blueprint });
      const cp = await addCheckpoint(supa, projectId, { label: `${first}: ${objectLabel(bp, h.object_ref)}`.slice(0, 60), kind: "teammate", blueprint: applied.blueprint, summary: changelog });
      checkpointId = cp.id;
    }
  }
  await supa.from("handoffs").update({ status: "resolved", resolution: changelog, resolved_at: new Date().toISOString() }).eq("id", handoffId);
  await addLedger(supa, projectId, [
    { lane: "did", kind: "handoff", blame: "teammate", title: `${first} resolved your request`, body: changelog, objectRef: h.object_ref, checkpointId, meta: { handoffId } },
  ]);
  revalidatePath(`/p/${projectId}`, "layout");
  revalidatePath("/home");
  return { ok: true, changelog };
}
