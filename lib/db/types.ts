import type { Blueprint, Estimate, ObjectRef } from "@/lib/blueprint/schema";
import type { BuildResult, CodeApp, PublishedBuild } from "@/lib/code-apps/schema";
import type { BuildReport } from "@/lib/build/report";

export type BuildState = "draft" | "building" | "built";

export type ProjectSettings = {
  budgetCapCredits: number;
  houseRules: string[];
  region: "us" | "eu" | "in";
  github?: { connected: boolean; repo?: string; account?: string };
  /** The published app: data types kept off its public pages, and whether visitors may talk to its AI helpers. */
  app?: { hiddenEntities?: string[]; publicHelpers?: boolean };
  /** An imported project: whether Claude mapped its screens from the code, or they came from a starter plan. */
  mappedBy?: "claude" | "starter";
};

export type ImportReport = {
  repo: { owner: string; name: string; url: string; description: string | null; defaultBranch: string; stars: number; language: string | null; license: string | null; pushedAt: string | null };
  stack: { label: string; evidence: string }[];
  frameworks: { id: string; label: string; evidence: string }[];
  tests: string[];
  conventions: string[];
  coverage: { understood: string[]; unsure: string[]; ignored: string[] };
  fileCount: number;
  truncated: boolean;
  cached: boolean;
  readmeExcerpt: string;
};

export type ProjectRow = {
  id: string;
  owner_id: string;
  name: string;
  vertical: string;
  source: "describe" | "import";
  brief: string;
  blueprint: Blueprint;
  current_checkpoint_id: string | null;
  settings: ProjectSettings;
  import_report: ImportReport | null;
  build_state: BuildState;
  is_demo: boolean;
  /** A business app (Blueprint and renderer) or a code app (real files Claude writes). */
  kind: "business" | "code";
  /** A code app's files and manifest; null for a business app. */
  code: CodeApp | null;
  /** A code app's latest real build. */
  build: BuildResult | null;
  /** A business app's last real build: its steps, compiled code and the test runs Claude played (lib/build). */
  build_report: BuildReport | null;
  created_at: string;
  updated_at: string;
};

export type CheckpointKind = "blueprint" | "build" | "repair" | "restore" | "ship" | "teammate" | "tweak" | "change" | "import";
export type CheckpointRow = {
  id: string;
  project_id: string;
  seq: number;
  label: string;
  kind: CheckpointKind;
  blueprint: Blueprint;
  /** A code app's files at this version. */
  code: CodeApp | null;
  summary: string | null;
  created_at: string;
};
export type CheckpointMeta = Omit<CheckpointRow, "blueprint" | "code">;

export type Lane = "thought" | "did" | "checked";
export type Blame = "user" | "system_fix" | "teammate" | "agent";
export type LedgerKind =
  | "brief"
  | "work_order"
  | "build_step"
  | "repair"
  | "tweak"
  | "change"
  | "handoff"
  | "comment"
  | "ship"
  | "restore"
  | "rehearsal"
  | "budget"
  | "import"
  | "agent_run"
  | "permission";
export type LedgerRow = {
  id: string;
  project_id: string;
  checkpoint_id: string | null;
  lane: Lane;
  kind: LedgerKind;
  blame: Blame;
  title: string;
  body: string | null;
  object_ref: ObjectRef | null;
  meta: Record<string, unknown> | null;
  credits: number;
  created_at: string;
};

export type ChangeOperation = { op: "set" | "add" | "remove"; path: string; value?: unknown };
export type ChangeProposal = {
  summary: string;
  rationale: string;
  operations: ChangeOperation[];
  blastRadius: { screens: string[]; agents: string[]; files: number };
  credits: number;
  minutes: number;
  mode: "live" | "rules";
  /** The message was a question, answered in `rationale`; nothing to apply. */
  answer?: boolean;
};

export type WorkOrderRow = {
  id: string;
  project_id: string;
  request: string;
  kind: "build" | "change";
  estimate: Estimate | { credits: number; minutes: number };
  proposal: ChangeProposal | null;
  status: "proposed" | "approved" | "running" | "done" | "rejected";
  created_at: string;
  resolved_at: string | null;
};

export type HandoffRow = {
  id: string;
  project_id: string;
  object_ref: ObjectRef;
  prompt: string;
  context: { objectLabel?: string; promptHistory?: string[]; lastDiff?: string; screenshot?: string };
  assignee: string;
  status: "open" | "in_progress" | "resolved";
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type CommentRow = {
  id: string;
  project_id: string;
  screen_id: string;
  block_id: string | null;
  x: number;
  y: number;
  body: string;
  author_id: string | null;
  author_name: string | null;
  resolved: boolean;
  created_at: string;
};

export type DeploymentRow = {
  id: string;
  project_id: string;
  env: "test" | "live";
  target: "architect_cloud" | "vercel" | "vpc";
  checkpoint_id: string | null;
  status: "live" | "rolled_back" | "sandbox";
  preflight: { id: string; label: string; pass: boolean }[] | null;
  url: string | null;
  created_at: string;
};

export type LiveSiteRow = {
  slug: string;
  project_id: string;
  checkpoint_id: string | null;
  blueprint: Blueprint;
  published_at: string;
  blocked_at?: string | null;
  blocked_reason?: string | null;
  kind?: "business" | "code";
  build?: PublishedBuild | null;
};

export type ToolCallRecord = {
  toolCallId: string;
  toolId: string;
  access: "read" | "write" | "irreversible";
  input: unknown;
  output?: unknown;
  state: "done" | "denied" | "error";
  approval?: "auto" | "logged" | "approved" | "denied";
};
export type AgentRunRow = {
  id: string;
  project_id: string;
  agent_id: string;
  checkpoint_id: string | null;
  transcript: { role: "user" | "assistant"; text: string }[];
  tool_calls: ToolCallRecord[];
  approvals: { toolId: string; decision: "approved" | "denied" | "always"; at: string }[];
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  mode: "live" | "scripted";
  status: string;
  created_at: string;
};

export { type Estimate };
