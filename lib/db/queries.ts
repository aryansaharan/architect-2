import "server-only";
import type { Supa } from "@/lib/supabase/server";
import type {
  AgentRunRow,
  CheckpointMeta,
  CheckpointRow,
  CommentRow,
  DeploymentRow,
  HandoffRow,
  LedgerRow,
  LiveSiteRow,
  ProfileRow,
  ProjectRow,
  WorkOrderRow,
} from "./types";

const PROJECT_LIST_COLUMNS =
  "id, owner_id, name, vertical, source, brief, blueprint, current_checkpoint_id, settings, build_state, is_demo, created_at, updated_at";

export async function listProjects(supa: Supa): Promise<ProjectRow[]> {
  const { data, error } = await supa.from("projects").select(PROJECT_LIST_COLUMNS).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ProjectRow[];
}

export async function getProject(supa: Supa, id: string): Promise<ProjectRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supa.from("projects").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as ProjectRow | null) ?? null;
}

export async function listCheckpoints(supa: Supa, projectId: string): Promise<CheckpointMeta[]> {
  const { data, error } = await supa
    .from("checkpoints")
    .select("id, project_id, seq, label, kind, summary, created_at")
    .eq("project_id", projectId)
    .order("seq", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CheckpointMeta[];
}

export async function getCheckpoint(supa: Supa, id: string): Promise<CheckpointRow | null> {
  const { data, error } = await supa.from("checkpoints").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as CheckpointRow | null) ?? null;
}

export async function getCheckpointsFull(supa: Supa, ids: string[]): Promise<CheckpointRow[]> {
  if (!ids.length) return [];
  const { data, error } = await supa.from("checkpoints").select("*").in("id", ids);
  if (error) throw error;
  return (data ?? []) as CheckpointRow[];
}

export async function listLedger(supa: Supa, projectId: string, limit = 80): Promise<LedgerRow[]> {
  const { data, error } = await supa
    .from("ledger_events")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as LedgerRow[];
}

export async function listWorkOrders(supa: Supa, projectId: string): Promise<WorkOrderRow[]> {
  const { data, error } = await supa
    .from("work_orders")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as WorkOrderRow[];
}

export async function listHandoffs(supa: Supa, projectId?: string): Promise<HandoffRow[]> {
  let q = supa.from("handoffs").select("*").order("created_at", { ascending: false }).limit(30);
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as HandoffRow[];
}

export async function listComments(supa: Supa, projectId: string): Promise<CommentRow[]> {
  const { data, error } = await supa.from("comments").select("*").eq("project_id", projectId).order("created_at");
  if (error) throw error;
  return (data ?? []) as CommentRow[];
}

export async function listDeployments(supa: Supa, projectId: string): Promise<DeploymentRow[]> {
  const { data, error } = await supa
    .from("deployments")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as DeploymentRow[];
}

export async function getLiveSiteForProject(supa: Supa, projectId: string): Promise<LiveSiteRow | null> {
  const { data, error } = await supa.from("live_sites").select("*").eq("project_id", projectId).maybeSingle();
  if (error) throw error;
  return (data as LiveSiteRow | null) ?? null;
}

/** Which of these projects (the person's own) are published. Row-level security also limits it to their own. A failed read shows none as live. */
export async function liveProjectIds(supa: Supa, projectIds: string[]): Promise<Set<string>> {
  if (!projectIds.length) return new Set();
  const { data, error } = await supa.from("live_sites").select("project_id").in("project_id", projectIds);
  if (error) console.error("[queries] live sites read failed", error.message);
  return new Set((data ?? []).map((l) => l.project_id as string));
}

export async function listAgentRuns(supa: Supa, projectId: string, agentId?: string): Promise<AgentRunRow[]> {
  // The studio's Replay shows the owner's own test runs; runs inside the published app are the app's own history.
  let q = supa.from("agent_runs").select("*").eq("project_id", projectId).eq("surface", "studio").order("created_at", { ascending: false }).limit(25);
  if (agentId) q = q.eq("agent_id", agentId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AgentRunRow[];
}

export type UsageSummary = {
  credits: number;
  costUsd: number;
  byKind: Record<string, number>;
  byAgent: Record<string, number>;
  events: number;
};

export async function usageSummary(supa: Supa, opts: { projectId?: string; sinceIso?: string }): Promise<UsageSummary> {
  let q = supa.from("usage_events").select("kind, credits, cost_usd, meta");
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  if (opts.sinceIso) q = q.gte("created_at", opts.sinceIso);
  const { data, error } = await q.limit(2000);
  if (error) throw error;
  const summary: UsageSummary = { credits: 0, costUsd: 0, byKind: {}, byAgent: {}, events: 0 };
  for (const r of data ?? []) {
    const c = Number(r.credits) || 0;
    summary.credits += c;
    summary.costUsd += Number(r.cost_usd) || 0;
    summary.byKind[r.kind] = (summary.byKind[r.kind] ?? 0) + c;
    const agent = (r.meta as { agentId?: string } | null)?.agentId;
    if (agent) summary.byAgent[agent] = (summary.byAgent[agent] ?? 0) + c;
    summary.events++;
  }
  summary.credits = Math.round(summary.credits * 100) / 100;
  return summary;
}

export async function getProfile(supa: Supa, userId: string): Promise<ProfileRow | null> {
  const { data } = await supa.from("profiles").select("*").eq("id", userId).maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

export async function listIntegrations(supa: Supa): Promise<{ provider: string; status: string; meta: Record<string, unknown> | null }[]> {
  const { data } = await supa.from("integrations").select("provider, status, meta");
  return (data ?? []) as { provider: string; status: string; meta: Record<string, unknown> | null }[];
}
