import type { Blueprint, ObjectRef } from "@/lib/blueprint/schema";
import { allBlocks, BLOCK_LABELS } from "@/lib/blueprint";
import { list } from "@/lib/blueprint/describe";
import { between } from "./hash";
import { planRepair, type RepairPlan } from "./repair";
import { rehearsalOutcome } from "./rehearse";
import { applyOps } from "@/lib/blueprint/apply";

export type Lane = "thought" | "did" | "checked";

export type TimelineStep =
  | {
      kind: "step";
      id: string;
      lane: Lane;
      title: string;
      detail?: string;
      objectRef?: ObjectRef;
      durationMs: number;
      logs?: string[];
      file?: string;
      tone?: "ok" | "warn";
    }
  | { kind: "repair"; id: string; plan: RepairPlan }
  | { kind: "checkpoint"; id: string; label: string }
  | { kind: "done"; id: string; summary: string };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/**
 * Deterministic, plain-English build script for a blueprint. ~25–35 s at normal speed.
 * The steps are a scripted playback over the real plan (labelled "Simulated build" in the console).
 */
export function buildTimeline(bp: Blueprint): TimelineStep[] {
  const steps: TimelineStep[] = [];
  const s = (x: Omit<Extract<TimelineStep, { kind: "step" }>, "kind" | "durationMs"> & { durationMs?: number }) =>
    steps.push({ kind: "step", durationMs: x.durationMs ?? between(x.id, 900, 2000), ...x });

  s({
    id: "read-brief",
    lane: "thought",
    title: "Reading the plan",
    detail: `${bp.screens.length} screens, ${bp.agents.length} agents, ${bp.entities.length} kinds of data, ${bp.connections.length} connections.`,
    objectRef: { type: "brief", id: "meta" },
    durationMs: 1400,
    logs: ["resolve blueprint v1", "order: data → connections → agents → screens → rehearsals"],
  });

  for (const e of bp.entities) {
    s({
      id: `entity-${e.id}`,
      lane: "did",
      title: `Set up ${e.plural}`,
      detail: `${e.fields.length} details · ${e.sample.length} sample records to test with`,
      objectRef: { type: "entity", id: e.id },
      file: "supabase/schema.sql",
      logs: [
        `create table ${slug(e.plural)} (`,
        ...e.fields.slice(0, 5).map((f) => `  ${f.name} ${f.type === "money" || f.type === "number" ? "numeric" : f.type === "date" ? "date" : f.type === "boolean" ? "boolean" : "text"},`),
        e.fields.length > 5 ? `  … ${e.fields.length - 5} more` : ")",
        `insert ${e.sample.length} sample rows`,
        "enable row level security",
      ],
    });
  }

  for (const c of bp.connections) {
    const missing = c.status === "missing";
    s({
      id: `conn-${c.id}`,
      lane: missing ? "checked" : "did",
      tone: missing ? "warn" : "ok",
      title: missing ? `${c.name} needs a key, using test data for now` : `Connected ${c.name} (sandbox)`,
      detail: missing ? "You can add it later in Keys & passwords. Going live will remind you." : c.plain,
      objectRef: { type: "connection", id: c.id },
      durationMs: between(c.id, 700, 1300),
      logs: missing ? [`${c.name}: no credentials`, "fallback → fixture responses"] : [`${c.name}: handshake ok`, "mode: sandbox"],
    });
  }

  for (const a of bp.agents) {
    const asks = a.tools.filter((t) => t.permission === "ask").length;
    s({
      id: `agent-${a.id}`,
      lane: "did",
      title: `Put ${a.name} on duty`,
      detail: `${a.tools.length} tools · ${asks ? `${asks} ask${asks === 1 ? "s" : ""} you first` : "none need approval"} · ${a.rules.length} rules`,
      objectRef: { type: "agent", id: a.id },
      file: `agents/${a.id}/agent.yaml`,
      logs: [`write agents/${a.id}/SOUL.md`, `write agents/${a.id}/RULES.md`, `register tools: ${a.tools.map((t) => t.id).join(", ")}`],
    });
  }

  for (const sc of bp.screens) {
    const blocks = allBlocks(sc);
    s({
      id: `screen-${sc.id}`,
      lane: "did",
      title: `Built ${sc.title}`,
      detail: list(blocks.map((b) => BLOCK_LABELS[b.type].toLowerCase())),
      objectRef: { type: "screen", id: sc.id },
      file: `app/(app)/${sc.slug}/page.tsx`,
      logs: blocks.map((b) => `render <${b.type[0].toUpperCase() + b.type.slice(1)}Block id="${b.id}" />`),
    });
  }

  const rehearsals = bp.agents.reduce((n, a) => n + a.rehearsals.length, 0);
  s({
    id: "rehearse",
    lane: "checked",
    title: `Rehearsing ${rehearsals} conversations`,
    detail: "Rehearsals are practice conversations: every agent plays through its test cases before anyone sees it.",
    durationMs: 2200,
    logs: bp.agents.flatMap((a) => a.rehearsals.map((r) => `${a.name} · ${r.name}`)),
  });

  const plan = planRepair(bp);
  steps.push({ kind: "repair", id: "repair", plan });

  // Judge the re-run on the repaired plan with the same rules the build records (lib/actions/build.ts).
  const fixed = applyOps(bp, plan.options[0].ops);
  const after = fixed.ok ? fixed.blueprint : bp;
  const passed = after.agents.reduce((n, a) => n + a.rehearsals.filter((r) => rehearsalOutcome(a, r).pass).length, 0);
  s({
    id: "rehearse-again",
    lane: "checked",
    title: `Re-ran rehearsals · ${passed} of ${rehearsals} passed`,
    detail: passed === rehearsals ? "The fix held. Nothing else changed." : "Some still fail. Open Agents › Rehearsals after the build to see why.",
    tone: passed === rehearsals ? "ok" : "warn",
    durationMs: 1600,
  });
  s({
    id: "final-checks",
    lane: "checked",
    title: "Checked sign-in, data access and permissions",
    detail: "Each person only sees their own team's records. Keys are stored encrypted.",
    tone: "ok",
    durationMs: 1300,
  });
  steps.push({ kind: "checkpoint", id: "checkpoint", label: "Build complete" });
  steps.push({
    kind: "done",
    id: "done",
    summary: `${bp.meta.name} is ready to try: ${bp.screens.length} screens, ${bp.agents.length} agents on duty.`,
  });
  return steps;
}

export function totalDuration(steps: TimelineStep[]): number {
  return steps.reduce((ms, st) => ms + (st.kind === "step" ? st.durationMs : 0), 0);
}
