"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Blueprint, ObjectRef } from "@/lib/blueprint/schema";
import type { BuildState, LedgerRow } from "@/lib/db/types";
import { buildTimeline, resumeTimeline, type TimelineStep } from "@/lib/sim/buildTimeline";
import { planRepair, type RepairPlan } from "@/lib/sim/repair";
import { completeBuild, resolveRepair, startBuild, type StartBuildResult } from "@/lib/actions/build";

export type BuildStatus = "idle" | "running" | "repair" | "finishing" | "done";
export type NodeState = "pending" | "active" | "done";

/** A build the server says is under way but that nothing in this tab is running (the tab was closed or reloaded). */
export type InterruptedBuild = {
  /** The step it had reached ("step N of total"), when this browser remembers it. */
  step: number | null;
  total: number;
  /** It stopped while waiting for the person to pick a fix. */
  atRepair: boolean;
};

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
  /** Credits a build started under the earlier pricing took and hasn't refunded (null otherwise: making it real is free). Refunded if it's stopped. */
  charged: number | null;
  progress: number;
  /** Set when the project is mid-build on the server but no runner is active here: offer to resume it or stop it. */
  interrupted: InterruptedBuild | null;
  nodeState: (ref: ObjectRef) => NodeState | null;
  /** Starts the build (free), or resumes one already under way. Resolves false if it couldn't. */
  start: (opts?: { replay?: boolean }) => Promise<boolean>;
  choose: (option: "a" | "b") => Promise<void>;
  setSpeed: (s: number) => void;
  dismiss: () => void;
};

const refKey = (r: ObjectRef) => `${r.type}:${r.id}`;

/**
 * What stopping a build says. Making it real is free, so there's only a refund to mention for a build
 * that was charged under the earlier pricing (cancelBuild's `refunded`).
 */
export function stoppedWords(refunded: number | undefined, rest: string): string {
  return refunded ? `The ${refunded} credits it took under the earlier pricing went back on your balance. ${rest}` : rest;
}
const FAST = 4;
/** Per-step delay while a resumed build replays quickly to where it stopped. */
const CATCH_UP_MS = 45;

/**
 * The fix the real build recorded (its "Our fix" history entry), provided by the shell.
 * A replay runs on today's blueprint, where that fix is already in, so left alone the
 * rehearsal would catch something else and the replay would tell a different story.
 */
export const RecordedRepairContext = createContext<LedgerRow | null>(null);

/** Undo a recorded approval gate so the replay's rehearsal catches what the build caught. */
function beforeRecordedFix(bp: Blueprint, fix: Pick<LedgerRow, "object_ref" | "meta"> | null): Blueprint {
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
  before.agents[ai].tools[ti].permission = "log"; // "Tell me": what the gate replaced
  return planRepair(before).objectRef.id === agentId ? before : bp;
}

/*
 * Where a build had got to, remembered in this browser so a reload or a closed tab can pick it
 * up at the same step. The server stays the source of truth for money and for the repair decision.
 */
type SavedProgress = { stepId: string; step: number; total: number; atRepair: boolean };
const PROGRESS_EVENT = "prodai:build-progress";
const progressKey = (projectId: string) => `prodai:build:${projectId}`;

function readProgressRaw(projectId: string): string | null {
  try {
    return window.localStorage.getItem(progressKey(projectId));
  } catch {
    return null;
  }
}

function parseProgress(raw: string | null): SavedProgress | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<SavedProgress>;
    return typeof p.stepId === "string" && Number.isFinite(p.step) && Number.isFinite(p.total) ? { stepId: p.stepId, step: p.step!, total: p.total!, atRepair: Boolean(p.atRepair) } : null;
  } catch {
    return null;
  }
}

function writeProgress(projectId: string, p: SavedProgress | null) {
  try {
    const key = progressKey(projectId);
    const next = p ? JSON.stringify(p) : null;
    if (window.localStorage.getItem(key) === next) return;
    if (next) window.localStorage.setItem(key, next);
    else window.localStorage.removeItem(key);
  } catch {
    return; // storage unavailable (private mode): resuming still works, from the start at Fast speed
  }
  window.dispatchEvent(new Event(PROGRESS_EVENT));
}

function subscribeProgress(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(PROGRESS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PROGRESS_EVENT, onChange);
  };
}

const countSteps = (steps: TimelineStep[]) => steps.filter((s) => s.kind === "step").length;

export function useBuildRunner({ projectId, blueprint, buildState }: { projectId: string; blueprint: Blueprint; buildState: BuildState }): BuildRunner {
  const router = useRouter();
  const recordedFix = useContext(RecordedRepairContext);
  const [status, setStatus] = useState<BuildStatus>("idle");
  const [mode, setMode] = useState<"build" | "replay">("build");
  const [steps, setSteps] = useState<TimelineStep[]>([]);
  const [index, setIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [repairChoice, setRepairChoice] = useState<"a" | "b" | null>(null);
  const [charged, setCharged] = useState<number | null>(null);
  // While startBuild is in flight the server may already say "building": don't offer to resume a build that is starting.
  const [starting, setStarting] = useState(false);
  // The person stopped (or finished) the build here; until the server catches up, don't offer to resume it.
  const [settled, setSettled] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef = useRef<"build" | "replay">("build");
  const startingRef = useRef(false);
  /** A resumed build replays quickly up to this index (where it stopped), then plays on. */
  const catchUpTo = useRef<number | null>(null);

  const savedRaw = useSyncExternalStore(subscribeProgress, () => readProgressRaw(projectId), () => null);
  const saved = useMemo(() => parseProgress(savedRaw), [savedRaw]);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  // Forget a remembered position once no build is under way (finished, stopped, or restored elsewhere).
  useEffect(() => {
    if (buildState !== "building" && status === "idle") writeProgress(projectId, null);
  }, [buildState, status, projectId]);

  const finish = useCallback(async (): Promise<boolean> => {
    setStatus("finishing");
    if (modeRef.current === "build") {
      const r = await completeBuild(projectId).catch(() => ({ ok: false as const, error: "Couldn't save the build. Your progress is safe: resume it from the plan." }));
      if (!r.ok) {
        // Nothing is lost: the plan offers to resume it or stop it.
        toast.error(r.error);
        setStatus("idle");
        router.refresh();
        return false;
      }
      writeProgress(projectId, null);
    }
    setStatus("done");
    router.refresh();
    return true;
  }, [projectId, router]);

  // Advance through the script. Steps take durationMs / speed; a repair step pauses
  // (status is derived below); the checkpoint step persists the build.
  useEffect(() => {
    if (status !== "running") return;
    const step = steps[index];
    if (!step || step.kind === "repair" || step.kind === "done") return;
    clear();
    if (step.kind === "checkpoint") {
      timer.current = setTimeout(() => void finish().then((ok) => ok && setIndex((i) => i + 1)), 0);
      return clear;
    }
    const catchingUp = catchUpTo.current !== null && index < catchUpTo.current;
    timer.current = setTimeout(
      () => {
        if (catchUpTo.current !== null && index + 1 >= catchUpTo.current) catchUpTo.current = null;
        setIndex((i) => i + 1);
      },
      catchingUp ? CATCH_UP_MS : Math.max(60, step.durationMs / speed),
    );
    return clear;
  }, [status, steps, index, finish, speed]);

  // Remember where a real build is, so a reload or a closed tab can resume at the same step.
  useEffect(() => {
    if (mode !== "build" || status !== "running") return;
    if (catchUpTo.current !== null && index < catchUpTo.current) return; // replaying to where it stopped: keep the real stop point
    const step = steps[index];
    if (!step || step.kind === "done") return;
    const total = countSteps(steps);
    writeProgress(projectId, { stepId: step.id, step: Math.min(countSteps(steps.slice(0, index)) + 1, total), total, atRepair: step.kind === "repair" });
  }, [mode, status, steps, index, projectId]);

  const start = useCallback(
    async (opts?: { replay?: boolean }): Promise<boolean> => {
      if (opts?.replay) {
        clear();
        catchUpTo.current = null;
        modeRef.current = "replay";
        setMode("replay");
        setSteps(buildTimeline(beforeRecordedFix(blueprint, recordedFix)));
        setIndex(0);
        setRepairChoice(null);
        setCharged(null);
        setSpeed(1);
        setStatus("running");
        return true;
      }
      if (startingRef.current) return false; // a double click: the first one is already on its way
      startingRef.current = true;
      setStarting(true);
      const remembered = parseProgress(readProgressRaw(projectId));
      const r: StartBuildResult = await startBuild(projectId).catch(() => ({ ok: false as const, error: "Couldn't reach Prod AI. Try again." }));
      startingRef.current = false;
      if (!r.ok) {
        setStarting(false);
        toast.error(r.error);
        return false;
      }
      if (r.state === "built") {
        setStarting(false);
        writeProgress(projectId, null);
        router.refresh();
        return true;
      }
      clear();
      // Resuming: a fix chosen before the interruption is already in the plan, so the build replays as it was, minus
      // the question, and picks up where this browser saw it stop (or from the start at Fast speed).
      const { steps: timeline, startAt } = r.resumed
        ? resumeTimeline(r.repair ? beforeRecordedFix(blueprint, { object_ref: r.repair.objectRef, meta: { planId: r.repair.planId } }) : blueprint, { repairDecided: Boolean(r.repair), stoppedAt: remembered?.stepId })
        : { steps: buildTimeline(blueprint), startAt: 0 };
      catchUpTo.current = startAt > 0 ? startAt : null;
      modeRef.current = "build";
      setMode("build");
      setSteps(timeline);
      setIndex(0);
      setRepairChoice(null);
      setCharged(r.charged > 0 ? r.charged : null);
      // A resumed build plays on at Fast (after replaying quickly to where it stopped); a new one at Normal.
      setSpeed(r.resumed ? FAST : 1);
      setSettled(false);
      setStarting(false);
      setStatus("running");
      return true;
    },
    [blueprint, projectId, recordedFix, router],
  );

  const choose = useCallback(
    async (option: "a" | "b") => {
      const step = steps[index];
      if (step?.kind !== "repair") return;
      setRepairChoice(option);
      if (modeRef.current === "build") {
        const r = await resolveRepair(projectId, step.plan.id, option).catch(() => ({ ok: false as const, error: "Couldn't reach Prod AI. Pick the fix again." }));
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

  const isInterrupted = buildState === "building" && status === "idle" && !starting && !settled;
  // Only worked out when it's needed: how many steps this build has, for "step N of total".
  const plannedSteps = useMemo(() => (isInterrupted ? countSteps(buildTimeline(blueprint)) : 0), [isInterrupted, blueprint]);
  const interrupted = useMemo<InterruptedBuild | null>(
    () => (isInterrupted ? { step: saved ? Math.min(saved.step, saved.total) : null, total: saved?.total ?? plannedSteps, atRepair: Boolean(saved?.atRepair) } : null),
    [isInterrupted, saved, plannedSteps],
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
    charged,
    progress: derived.progress,
    interrupted,
    nodeState,
    start,
    choose,
    setSpeed,
    dismiss: () => {
      clear();
      catchUpTo.current = null;
      if (modeRef.current === "build") {
        // Stopped or finished: either way there's nothing to resume.
        writeProgress(projectId, null);
        setSettled(true);
      }
      setStatus("idle");
    },
  };
}
