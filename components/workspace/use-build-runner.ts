"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Blueprint, ObjectRef } from "@/lib/blueprint/schema";
import type { BuildState, LedgerRow } from "@/lib/db/types";
import { buildTimeline, type TimelineStep } from "@/lib/sim/buildTimeline";
import { planRepair, type RepairPlan } from "@/lib/sim/repair";
import { completeBuild, resolveRepair, startBuild } from "@/lib/actions/build";

export type BuildStatus = "idle" | "running" | "repair" | "finishing" | "done";
export type NodeState = "pending" | "active" | "done";

export type BuildRunner = {
  status: BuildStatus;
  mode: "build" | "replay";
  steps: TimelineStep[];
  index: number;
  current: TimelineStep | null;
  completed: Extract<TimelineStep, { kind: "step" }>[];
  repair: RepairPlan | null;
  repairChoice: "a" | "b" | null;
  speed: number;
  progress: number;
  nodeState: (ref: ObjectRef) => NodeState | null;
  start: (opts?: { replay?: boolean }) => Promise<void>;
  choose: (option: "a" | "b") => Promise<void>;
  setSpeed: (s: number) => void;
  dismiss: () => void;
};

const refKey = (r: ObjectRef) => `${r.type}:${r.id}`;

/**
 * The fix the real build recorded (its "Our fix" history entry), provided by the shell.
 * A replay runs on today's blueprint, where that fix is already in, so left alone the
 * rehearsal would catch something else and the replay would tell a different story.
 */
export const RecordedRepairContext = createContext<LedgerRow | null>(null);

/** Undo a recorded approval gate so the replay's rehearsal catches what the build caught. */
function beforeRecordedFix(bp: Blueprint, fix: LedgerRow | null): Blueprint {
  const agentId = fix?.object_ref?.type === "agent" ? fix.object_ref.id : null;
  if (!agentId || planRepair(bp).objectRef.id === agentId) return bp;
  // Builds record the plan id ("gate-<agent>-<tool>"); the seeded demo only records the agent.
  const planId = typeof fix?.meta?.planId === "string" ? fix.meta.planId : "";
  if (planId.startsWith("promise-")) return bp;
  const toolId = planId.startsWith(`gate-${agentId}-`) ? planId.slice(`gate-${agentId}-`.length) : null;
  const ai = bp.agents.findIndex((a) => a.id === agentId);
  const ti = ai === -1 ? -1 : bp.agents[ai].tools.findIndex((t) => t.access === "irreversible" && t.permission === "ask" && (!toolId || t.id === toolId));
  if (ti === -1) return bp;
  const before = structuredClone(bp);
  before.agents[ai].tools[ti].permission = "log"; // "Do it and tell me": what the gate replaced
  return planRepair(before).objectRef.id === agentId ? before : bp;
}

export function useBuildRunner({ projectId, blueprint, buildState }: { projectId: string; blueprint: Blueprint; buildState: BuildState }): BuildRunner {
  const router = useRouter();
  const recordedFix = useContext(RecordedRepairContext);
  const [status, setStatus] = useState<BuildStatus>("idle");
  const [mode, setMode] = useState<"build" | "replay">("build");
  const [steps, setSteps] = useState<TimelineStep[]>([]);
  const [index, setIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [repairChoice, setRepairChoice] = useState<"a" | "b" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef = useRef<"build" | "replay">("build");

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const finish = useCallback(async () => {
    setStatus("finishing");
    if (modeRef.current === "build") {
      const r = await completeBuild(projectId);
      if (!r.ok) toast.error(r.error);
    }
    setStatus("done");
    router.refresh();
  }, [projectId, router]);

  // Advance through the script. Steps take durationMs / speed; a repair step pauses
  // (status is derived below); the checkpoint step persists the build.
  useEffect(() => {
    if (status !== "running") return;
    const step = steps[index];
    if (!step || step.kind === "repair" || step.kind === "done") return;
    clear();
    if (step.kind === "checkpoint") {
      timer.current = setTimeout(() => void finish().then(() => setIndex((i) => i + 1)), 0);
      return clear;
    }
    timer.current = setTimeout(() => setIndex((i) => i + 1), Math.max(60, step.durationMs / speed));
    return clear;
  }, [status, steps, index, finish, speed]);

  const start = useCallback(
    async (opts?: { replay?: boolean }) => {
      const replay = Boolean(opts?.replay);
      setMode(replay ? "replay" : "build");
      modeRef.current = replay ? "replay" : "build";
      setSteps(buildTimeline(replay ? beforeRecordedFix(blueprint, recordedFix) : blueprint));
      setIndex(0);
      setRepairChoice(null);
      setSpeed(buildState === "building" && !replay ? 4 : 1);
      if (!replay) {
        const r = await startBuild(projectId);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
      }
      setStatus("running");
    },
    [blueprint, buildState, projectId, recordedFix],
  );

  const choose = useCallback(
    async (option: "a" | "b") => {
      const step = steps[index];
      if (step?.kind !== "repair") return;
      setRepairChoice(option);
      if (modeRef.current === "build") {
        const r = await resolveRepair(projectId, step.plan.id, option);
        if (!r.ok) {
          toast.error(r.error);
          setRepairChoice(null);
          return;
        }
      }
      setIndex((i) => i + 1);
    },
    [steps, index, projectId],
  );

  const effectiveStatus: BuildStatus = status === "running" && steps[index]?.kind === "repair" ? "repair" : status;

  const derived = useMemo(() => {
    const completed = steps.slice(0, index).filter((s): s is Extract<TimelineStep, { kind: "step" }> => s.kind === "step");
    const current = steps[index] ?? null;
    const doneKeys = new Set(completed.filter((s) => s.objectRef).map((s) => refKey(s.objectRef!)));
    const activeKey = current?.kind === "step" && current.objectRef ? refKey(current.objectRef) : current?.kind === "repair" ? refKey(current.plan.objectRef) : null;
    const repair = current?.kind === "repair" ? current.plan : null;
    const total = steps.filter((s) => s.kind === "step").reduce((n, s) => n + (s.kind === "step" ? s.durationMs : 0), 0) || 1;
    const elapsed = completed.reduce((n, s) => n + s.durationMs, 0);
    return { completed, current, doneKeys, activeKey, repair, progress: status === "done" ? 1 : elapsed / total };
  }, [steps, index, status]);

  const nodeState = useCallback(
    (ref: ObjectRef): NodeState | null => {
      if (effectiveStatus === "idle" || effectiveStatus === "done") return null;
      const k = refKey(ref);
      if (derived.activeKey === k) return "active";
      if (derived.doneKeys.has(k)) return "done";
      return "pending";
    },
    [effectiveStatus, derived],
  );

  return {
    status: effectiveStatus,
    mode,
    steps,
    index,
    current: derived.current,
    completed: derived.completed,
    repair: derived.repair,
    repairChoice,
    speed,
    progress: derived.progress,
    nodeState,
    start,
    choose,
    setSpeed,
    dismiss: () => {
      clear();
      setStatus("idle");
    },
  };
}
