import "server-only";
import type { Supa } from "@/lib/supabase/server";
import type { Blueprint, ObjectRef } from "@/lib/blueprint/schema";
import type {
  Blame,
  BuildState,
  CheckpointKind,
  CheckpointRow,
  ImportReport,
  Lane,
  LedgerKind,
  ProjectRow,
  ProjectSettings,
} from "./types";

export const DEFAULT_SETTINGS: ProjectSettings = {
  budgetCapCredits: 500,
  houseRules: [],
  region: "us",
};

export async function createProject(
  supa: Supa,
  p: {
    ownerId: string;
    name: string;
    vertical: string;
    source?: "describe" | "import";
    brief: string;
    blueprint: Blueprint;
    settings?: Partial<ProjectSettings>;
    importReport?: ImportReport | null;
    isDemo?: boolean;
    buildState?: BuildState;
  },
): Promise<ProjectRow> {
  const { data, error } = await supa
    .from("projects")
    .insert({
      owner_id: p.ownerId,
      name: p.name,
      vertical: p.vertical,
      source: p.source ?? "describe",
      brief: p.brief,
      blueprint: p.blueprint,
      settings: { ...DEFAULT_SETTINGS, region: p.blueprint.meta.region, ...p.settings },
      import_report: p.importReport ?? null,
      is_demo: p.isDemo ?? false,
      build_state: p.buildState ?? "draft",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ProjectRow;
}

export async function updateProject(
  supa: Supa,
  projectId: string,
  patch: Partial<Pick<ProjectRow, "name" | "blueprint" | "settings" | "build_state" | "current_checkpoint_id" | "brief">>,
) {
  const { error } = await supa.from("projects").update(patch).eq("id", projectId);
  if (error) throw error;
}

export async function addCheckpoint(
  supa: Supa,
  projectId: string,
  c: { label: string; kind: CheckpointKind; blueprint: Blueprint; summary?: string },
): Promise<CheckpointRow> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: last } = await supa
      .from("checkpoints")
      .select("seq")
      .eq("project_id", projectId)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle();
    const seq = (last?.seq ?? 0) + 1;
    const { data, error } = await supa
      .from("checkpoints")
      .insert({ project_id: projectId, seq, label: c.label, kind: c.kind, blueprint: c.blueprint, summary: c.summary ?? null })
      .select("*")
      .single();
    if (!error && data) {
      await supa.from("projects").update({ current_checkpoint_id: data.id }).eq("id", projectId);
      return data as CheckpointRow;
    }
    if (error && error.code !== "23505") throw error; // retry only on unique(seq) races
  }
  throw new Error("Could not create save point");
}

/**
 * The chat thread's own entries, written by the composer (lib/actions/change.ts):
 * what you asked ("question", "request") and what Prod AI said back ("answer", "quote": a change Work Order).
 */
export type ChatLedgerKind = "question" | "answer" | "request" | "quote";

export type LedgerInput = {
  lane: Lane;
  kind: LedgerKind | ChatLedgerKind;
  title: string;
  body?: string | null;
  blame?: Blame;
  credits?: number;
  objectRef?: ObjectRef | null;
  meta?: Record<string, unknown> | null;
  checkpointId?: string | null;
  createdAt?: string;
};

export async function addLedger(supa: Supa, projectId: string, events: LedgerInput[]) {
  if (!events.length) return;
  // Rows written together would share one now() and sort randomly; give each its own millisecond, in order.
  const base = Date.now();
  const rows = events.map((e, i) => ({
    project_id: projectId,
    lane: e.lane,
    kind: e.kind,
    title: e.title,
    body: e.body ?? null,
    blame: e.blame ?? "user",
    credits: e.credits ?? 0,
    object_ref: e.objectRef ?? null,
    meta: e.meta ?? null,
    checkpoint_id: e.checkpointId ?? null,
    created_at: e.createdAt ?? new Date(base + i).toISOString(),
  }));
  const { error } = await supa.from("ledger_events").insert(rows);
  if (error) throw error;
}

export async function logUsage(
  supa: Supa,
  u: {
    userId: string;
    projectId?: string | null;
    kind: string;
    provider?: string | null;
    model?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    credits: number;
    meta?: Record<string, unknown>;
  },
) {
  const { error } = await supa.from("usage_events").insert({
    user_id: u.userId,
    project_id: u.projectId ?? null,
    kind: u.kind,
    provider: u.provider ?? null,
    model: u.model ?? null,
    input_tokens: u.inputTokens ?? 0,
    output_tokens: u.outputTokens ?? 0,
    cost_usd: u.costUsd ?? 0,
    credits: u.credits,
    meta: u.meta ?? null,
  });
  if (error) console.error("usage log failed", error.message);
}
