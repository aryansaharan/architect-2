"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Blueprint, ObjectRef } from "@/lib/blueprint/schema";
import type { BuildState } from "@/lib/db/types";
import { plannedSteps, runKey, type BuildEvent, type BuildReport, type BuildStep, type FixPlan, type StepState, type TestRun, type TestsMode } from "@/lib/build/report";

export type BuildStatus = "idle" | "running" | "repair" | "finishing" | "done";
export type NodeState = "pending" | "active" | "done";

/** A build the server says is under way but that nothing in this tab is following (the tab was closed or reloaded). */
export type InterruptedBuild = {
  /** The step it had reached ("step N of total"), from the build's saved report. */
  step: number | null;
  total: number;
  /** It stopped while waiting for the person to pick a fix. */
  atRepair: boolean;
};

/**
 * A real build step as the Sheet, the margin and the plan map show it. The work happened on the server
 * (lib/build/run.ts); `title` and `detail` are what it reported, `durationMs` how long it really took.
 */
export type LiveStep = {
  kind: "step";
  id: string;
  lane: "thought" | "did" | "checked";
  title: string;
  detail?: string;
  objectRef?: ObjectRef;
  durationMs: number;
  tone?: "ok" | "warn";
  state: StepState;
  file?: string;
  logs?: string[];
};

export type BuildRunner = {
  status: BuildStatus;
  /** "replay" shows a finished build's saved report again, step by step. It runs nothing and changes nothing. */
  mode: "build" | "replay";
  /** Every step so far, in order, as the server reported it. */
  steps: LiveStep[];
  /** The test runs Claude played in this build (and again after a fix). */
  runs: TestRun[];
  current: LiveStep | null;
  completed: LiveStep[];
  /** Steps the build will take in all (it grows by two when a fix is applied). */
  total: number;
  repair: FixPlan | null;
  repairChoice: "a" | "b" | "none" | null;
  /** Credits this build's test runs have taken (null when none). They were real Claude work, so stopping doesn't refund them. */
  charged: number | null;
  /** Whether Claude plays the test runs in this build, and if not, why. */
  tests: TestsMode | null;
  progress: number;
  /** The server's last word when it finished ("Support Desk is real: ..."). */
  summary: string | null;
  /** Set when the project is mid-build on the server but nothing here is following it: offer to resume or stop. */
  interrupted: InterruptedBuild | null;
  /** A finished build with a saved report can be replayed. */
  canReplay: boolean;
  nodeState: (ref: ObjectRef) => NodeState | null;
  /** Starts the build (or picks up the one under way). `tests: false` skips the test runs. Resolves false if it couldn't start. */
  start: (opts?: { replay?: boolean; tests?: boolean }) => Promise<boolean>;
  choose: (option: "a" | "b" | "none") => Promise<void>;
  dismiss: () => void;
};

const refKey = (r: ObjectRef) => `${r.type}:${r.id}`;

/** What stopping a build says: only a build charged under the earliest pricing has anything to refund. */
export function stoppedWords(refunded: number | undefined, rest: string): string {
  return refunded ? `The ${refunded} credits it took under the earlier pricing went back on your balance. ${rest}` : rest;
}

const CHECKED = new Set(["read", "tests", "tests-again", "checks"]);

function live(s: BuildStep): LiveStep {
  return {
    kind: "step",
    id: s.id,
    lane: CHECKED.has(s.id) || s.id.startsWith("conn-") ? "checked" : "did",
    title: s.label,
    detail: s.detail,
    objectRef: s.objectRef,
    durationMs: s.ms ?? 0,
    tone: s.state === "warn" || s.state === "failed" ? "warn" : "ok",
    state: s.state,
  };
}

/** How fast a replay shows each recorded step. */
const REPLAY_STEP_MS = 320;

export function useBuildRunner({ projectId, blueprint, buildState, report }: { projectId: string; blueprint: Blueprint; buildState: BuildState; report?: BuildReport | null }): BuildRunner {
  const router = useRouter();
  const [status, setStatus] = useState<BuildStatus>("idle");
  const [mode, setMode] = useState<"build" | "replay">("build");
  const [steps, setSteps] = useState<BuildStep[]>([]);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [repair, setRepair] = useState<FixPlan | null>(null);
  const [repairChoice, setRepairChoice] = useState<"a" | "b" | "none" | null>(null);
  const [charged, setCharged] = useState(0);
  const [tests, setTests] = useState<TestsMode | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  // While a request is out the server may already say "building": don't offer to resume a build that's starting.
  const [busy, setBusy] = useState(false);
  // The person stopped (or finished) the build here; until the server catches up, don't offer to resume it.
  const [settled, setSettled] = useState(false);
  const busyRef = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (replayTimer.current) clearTimeout(replayTimer.current);
    },
    [],
  );

  const upsertStep = (s: BuildStep) =>
    setSteps((all) => {
      const at = all.findIndex((x) => x.id === s.id);
      if (at === -1) return [...all, s];
      const next = all.slice();
      next[at] = s;
      return next;
    });
  const addRun = (r: TestRun) =>
    setRuns((all) => {
      const k = `${runKey(r)}:${r.again ? 1 : 0}`;
      return all.some((x) => `${runKey(x)}:${x.again ? 1 : 0}` === k) ? all : [...all, r];
    });

  /** Reads one build request's stream to the end. Returns how it ended. */
  const follow = useCallback(
    async (body: Record<string, unknown>): Promise<"done" | "fix" | "error" | "dropped"> => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      let ended: "done" | "fix" | "error" | "dropped" = "dropped";
      try {
        const res = await fetch(`/api/build/${projectId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
        if (!res.ok || !res.body) {
          const msg = await res.json().then((j: { error?: string }) => j.error, () => null);
          toast.error(msg ?? "Couldn't reach Prod AI. Try again.");
          return "error";
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        const handle = (e: BuildEvent) => {
          if (e.t === "report") {
            setSteps(e.report.steps);
            setRuns(e.report.runs);
            setCharged(e.report.credits);
            setTests(e.report.tests);
            if (e.report.phase === "fix" && e.report.fix) {
              setRepair(e.report.fix);
              setRepairChoice(e.report.fix.chosen ?? null);
            }
          } else if (e.t === "step") upsertStep(e.step);
          else if (e.t === "run") {
            addRun(e.run);
            if (e.run.credits) setCharged((c) => c + e.run.credits);
          } else if (e.t === "fix") {
            setRepair(e.fix);
            setRepairChoice(null);
            setStatus("repair");
            ended = "fix";
          } else if (e.t === "done") {
            setSummary(e.summary);
            ended = "done";
          } else if (e.t === "error") {
            toast.error(e.message);
            ended = "error";
          }
        };
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (line) handle(JSON.parse(line) as BuildEvent);
          }
        }
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return "dropped";
      }
      return ended;
    },
    [projectId],
  );

  const settle = useCallback(
    (ended: "done" | "fix" | "error" | "dropped") => {
      if (ended === "fix") return; // the fix note is up: waiting for the person
      if (ended === "done") {
        setRepair(null);
        setStatus("done");
        setSettled(true);
      } else {
        // An error, or the connection dropped: the server keeps what it did, and the Sheet offers to resume.
        if (ended === "dropped") toast.message("Lost the connection to the build. It's saved: resume it from the Sheet.");
        setStatus("idle");
      }
      router.refresh();
    },
    [router],
  );

  const replay = useCallback(() => {
    if (!report || report.phase !== "done") return false;
    if (replayTimer.current) clearTimeout(replayTimer.current);
    setMode("replay");
    setSteps([]);
    setRuns([]);
    setRepair(null);
    setRepairChoice(null);
    setCharged(0);
    setTests(report.tests);
    setSummary(null);
    setStatus("running");
    // The saved report, shown again in the order it happened: each step, the test runs as their step ends, the fix note.
    const frames: (() => void)[] = [];
    for (const s of report.steps) {
      frames.push(() => upsertStep({ ...s, state: "running" }));
      if (s.id === "tests" || s.id === "tests-again") for (const r of report.runs.filter((x) => Boolean(x.again) === (s.id === "tests-again"))) frames.push(() => addRun(r));
      frames.push(() => upsertStep(s));
      if (s.id === "tests" && report.fix) {
        const fix = report.fix;
        frames.push(() => {
          setRepair(fix);
          setRepairChoice(fix.chosen ?? null);
          setStatus("repair");
        });
        frames.push(() => {}, () => {}, () => {}, () => {}, () => {}, () => {});
        frames.push(() => {
          setRepair(null);
          setStatus("running");
        });
      }
    }
    let i = 0;
    const tick = () => {
      frames[i++]?.();
      if (i < frames.length) replayTimer.current = setTimeout(tick, REPLAY_STEP_MS);
      else replayTimer.current = setTimeout(() => setStatus("done"), REPLAY_STEP_MS);
    };
    tick();
    return true;
  }, [report]);

  const start = useCallback(
    async (opts?: { replay?: boolean; tests?: boolean }): Promise<boolean> => {
      if (opts?.replay) return replay();
      if (busyRef.current) return false; // a double click: the first one is on its way
      busyRef.current = true;
      setBusy(true);
      setMode("build");
      setSteps([]);
      setRuns([]);
      setRepair(null);
      setRepairChoice(null);
      setCharged(0);
      setSummary(null);
      setSettled(false);
      setStatus("running");
      const ended = await follow(opts?.tests === undefined ? {} : { tests: opts.tests });
      busyRef.current = false;
      setBusy(false);
      settle(ended);
      return ended !== "error";
    },
    [follow, replay, settle],
  );

  const choose = useCallback(
    async (option: "a" | "b" | "none") => {
      if (!repair || repairChoice) return;
      if (mode === "replay") return;
      setRepairChoice(option);
      busyRef.current = true;
      setBusy(true);
      // A beat for the tick on the chosen fix, then the note goes and the build carries on.
      const ended = await follow({ fix: option });
      busyRef.current = false;
      setBusy(false);
      if (ended !== "fix") setRepair(null);
      if (ended === "error") setRepairChoice(null);
      setStatus(ended === "fix" ? "repair" : "running");
      settle(ended);
    },
    [repair, repairChoice, mode, follow, settle],
  );

  // The note leaves as soon as a fix is picked: the build runs on while the request is out.
  useEffect(() => {
    if (repairChoice && status === "repair" && busy) {
      const t = setTimeout(() => setStatus("running"), 600);
      return () => clearTimeout(t);
    }
  }, [repairChoice, status, busy]);

  const planned = useMemo(() => plannedSteps(blueprint), [blueprint]);
  const derived = useMemo(() => {
    const all = steps.map(live);
    const completed = all.filter((s) => s.state !== "running");
    const current = [...all].reverse().find((s) => s.state === "running") ?? null;
    const total = Math.max(planned.length + (steps.some((s) => s.id === "fix") ? 1 : 0) + (steps.some((s) => s.id === "tests-again") ? 1 : 0), all.length, 1);
    const state = new Map<string, NodeState>();
    for (const s of all) if (s.objectRef) state.set(refKey(s.objectRef), s.state === "running" ? "active" : "done");
    return { all, completed, current, total, state, progress: status === "done" ? 1 : Math.min(1, completed.length / total) };
  }, [steps, planned, status]);

  const nodeState = useCallback(
    (ref: ObjectRef): NodeState | null => {
      if (status === "idle" || status === "done") return null;
      if (status === "repair" && repair?.objectRef && refKey(repair.objectRef) === refKey(ref)) return "active";
      return derived.state.get(refKey(ref)) ?? "pending";
    },
    [status, repair, derived],
  );

  const isInterrupted = buildState === "building" && status === "idle" && !busy && !settled;
  const interrupted = useMemo<InterruptedBuild | null>(() => {
    if (!isInterrupted) return null;
    const done = report?.steps.filter((s) => s.state !== "running").length ?? 0;
    return { step: report ? Math.min(done + 1, planned.length) : null, total: planned.length, atRepair: report?.phase === "fix" };
  }, [isInterrupted, report, planned.length]);

  return {
    status,
    mode,
    steps: derived.all,
    runs,
    current: derived.current,
    completed: derived.completed,
    total: derived.total,
    repair,
    repairChoice,
    charged: charged > 0 ? charged : null,
    tests,
    progress: derived.progress,
    summary,
    interrupted,
    canReplay: report?.phase === "done",
    nodeState,
    start,
    choose,
    dismiss: () => {
      abort.current?.abort();
      if (replayTimer.current) clearTimeout(replayTimer.current);
      if (mode === "build") setSettled(true);
      setRepair(null);
      setStatus("idle");
    },
  };
}
