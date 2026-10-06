"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProject } from "@/lib/db/queries";
import { addCheckpoint, addLedger, updateProject } from "@/lib/db/writes";
import { BlueprintSchema, clipToLimits, type Agent, type Blueprint, type Connection, type Framework, type ObjectRef, type ToolPermission } from "@/lib/blueprint/schema";
import { integrityErrors } from "@/lib/blueprint/validate";
import { estimate } from "@/lib/blueprint/estimate";
import { findBlock } from "@/lib/blueprint";
import { FRAMEWORK_LABEL, PERMISSION_LABEL } from "@/lib/blueprint/describe";
import type { LedgerKind } from "@/lib/db/types";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Apply an in-place edit, validate schema + integrity, persist, log a free
 * ledger entry and make a save point. `fn` returns the human-readable title.
 */
async function mutate(projectId: string, objectRef: ObjectRef | null, fn: (bp: Blueprint) => string, kind: LedgerKind = "tweak"): Promise<Result> {
  await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false, error: "Project not found" };
  const next = structuredClone(project.blueprint);
  let title: string;
  try {
    title = fn(next);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid change" };
  }
  const parsed = BlueprintSchema.safeParse(clipToLimits(next));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid change" };
  const errs = integrityErrors(parsed.data);
  if (errs.length) return { ok: false, error: errs[0] };
  parsed.data.estimate = estimate(parsed.data);
  await updateProject(supa, projectId, { blueprint: parsed.data });
  const cp = await addCheckpoint(supa, projectId, { label: title.slice(0, 60), kind: "tweak", blueprint: parsed.data });
  await addLedger(supa, projectId, [{ lane: "did", kind, title, credits: 0, objectRef, checkpointId: cp.id, body: "Direct edit: free, no model involved." }]);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true };
}

function agentOf(bp: Blueprint, id: string): Agent {
  const a = bp.agents.find((x) => x.id === id);
  if (!a) throw new Error("Agent not found");
  return a;
}

export async function setToolPermission(projectId: string, agentId: string, toolId: string, permission: ToolPermission) {
  return mutate(
    projectId,
    { type: "agent", id: agentId },
    (bp) => {
      const a = agentOf(bp, agentId);
      const t = a.tools.find((x) => x.id === toolId);
      if (!t) throw new Error("Tool not found");
      t.permission = permission;
      return `${a.name} · ${t.name}: ${PERMISSION_LABEL[permission].toLowerCase()}`;
    },
    "permission",
  );
}

export async function setFramework(projectId: string, agentId: string, framework: Framework) {
  return mutate(projectId, { type: "agent", id: agentId }, (bp) => {
    const a = agentOf(bp, agentId);
    a.framework = framework;
    return `${a.name} now runs on ${FRAMEWORK_LABEL[framework]}`;
  });
}

export async function updateAgentText(projectId: string, agentId: string, patch: { jobDescription?: string; rules?: string[]; name?: string; role?: string }) {
  return mutate(projectId, { type: "agent", id: agentId }, (bp) => {
    const a = agentOf(bp, agentId);
    if (patch.jobDescription !== undefined) a.jobDescription = patch.jobDescription.slice(0, 4000);
    if (patch.rules) a.rules = patch.rules.map((r) => r.trim()).filter(Boolean).slice(0, 8);
    if (patch.name) a.name = patch.name.slice(0, 40);
    if (patch.role) a.role = patch.role.slice(0, 60);
    if (!a.rules.length) throw new Error("An agent needs at least one rule");
    return `Edited ${a.name}'s ${patch.rules ? "rules" : patch.jobDescription !== undefined ? "job description" : "details"}`;
  });
}

export async function updateScreenText(projectId: string, screenId: string, patch: { title?: string; purpose?: string }) {
  return mutate(projectId, { type: "screen", id: screenId }, (bp) => {
    const s = bp.screens.find((x) => x.id === screenId);
    if (!s) throw new Error("Screen not found");
    const old = s.title;
    if (patch.title) s.title = patch.title.slice(0, 40);
    if (patch.purpose) s.purpose = patch.purpose.slice(0, 200);
    return patch.title && patch.title !== old ? `Renamed “${old}” to “${s.title}”` : `Edited ${s.title}`;
  });
}

export type BlockTweak = {
  title?: string;
  columns?: string[];
  itemLabel?: { index: number; label: string };
  buttonLabel?: { index: number; label: string };
  submitLabel?: string;
  markdown?: string;
  hidden?: boolean;
};

/** Point-and-tweak edits from the Preview (free, deterministic). */
export async function tweakBlock(projectId: string, blockId: string, patch: BlockTweak) {
  return mutate(projectId, { type: "block", id: blockId }, (bp) => {
    const found = findBlock(bp, blockId);
    if (!found) throw new Error("Block not found");
    const { screen } = found;
    const b = found.block;
    if (patch.hidden) {
      screen.regions.main = screen.regions.main.filter((x) => x.id !== blockId);
      screen.regions.side = screen.regions.side.filter((x) => x.id !== blockId);
      if (!screen.regions.main.length) throw new Error("A screen needs at least one block in its main area");
      return `Removed a block from ${screen.title}`;
    }
    if (patch.title !== undefined && b.type !== "kpis" && b.type !== "actions") {
      (b as { title?: string }).title = patch.title.slice(0, 60);
      return `Renamed a block on ${screen.title} to “${patch.title}”`;
    }
    if (patch.columns && b.type === "table") {
      b.columns = patch.columns.slice(0, 8);
      return `Reordered columns on ${screen.title}`;
    }
    if (patch.itemLabel && b.type === "kpis" && b.items[patch.itemLabel.index]) {
      b.items[patch.itemLabel.index].label = patch.itemLabel.label.slice(0, 40);
      return `Relabelled a number on ${screen.title}`;
    }
    if (patch.buttonLabel && (b.type === "actions" || b.type === "detail")) {
      const list = b.type === "actions" ? b.buttons : b.actions;
      if (!list[patch.buttonLabel.index]) throw new Error("Button not found");
      list[patch.buttonLabel.index].label = patch.buttonLabel.label.slice(0, 40);
      return `Renamed a button on ${screen.title}`;
    }
    if (patch.submitLabel && b.type === "form") {
      b.submitLabel = patch.submitLabel.slice(0, 30);
      return `Renamed the form button on ${screen.title}`;
    }
    if (patch.markdown !== undefined && b.type === "text") {
      b.markdown = patch.markdown.slice(0, 2000);
      return `Edited a note on ${screen.title}`;
    }
    throw new Error("Nothing to change");
  });
}

export async function setTheme(projectId: string, patch: { primary?: string; radius?: "sm" | "md" | "lg"; density?: "compact" | "comfortable"; mode?: "light" | "dark" }) {
  return mutate(projectId, { type: "brief", id: "meta" }, (bp) => {
    if (patch.primary && !/^#[0-9a-fA-F]{6}$/.test(patch.primary)) throw new Error("Use a 6-digit hex colour");
    Object.assign(bp.meta.theme, patch);
    return patch.primary ? `Changed the brand colour to ${patch.primary}` : "Changed the app's look";
  });
}

export async function setConnectionStatus(projectId: string, connectionId: string, status: Connection["status"]) {
  return mutate(projectId, { type: "connection", id: connectionId }, (bp) => {
    const c = bp.connections.find((x) => x.id === connectionId);
    if (!c) throw new Error("Connection not found");
    c.status = status;
    return `${c.name}: ${status === "configured" ? "sandbox key added" : "key removed"}`;
  });
}
