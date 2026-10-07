"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BuildError, BuildResult } from "@/lib/code-apps/schema";
import { buildInfo, type CodeBuildInfo } from "./build-info";
import { sameError, type FixError } from "./plain-error";
import type { FrameError } from "./code-app-frame";

/**
 * A code app on the Sheet, from its files to "It's real.": the real build (POST /api/code-apps/[id]/build,
 * its steps streamed as they happen), the app starting in its sandbox (prod:ready, or an error), and the
 * repair loop (POST /api/code-apps/[id]/repair, then build again). Nothing here is timed for show: every
 * step on screen is one the server or the sandbox reported.
 */

export type StepState = "running" | "done" | "failed";
export type BuildStepView = { id: string; label: string; state: StepState; detail?: string };

/**
 * idle: written, not built. building: the server is building it. starting: built, waiting for the app's
 * first render. ready: it's real. failed: the build failed or the app didn't start. repairing: Claude is fixing it.
 */
export type RunPhase = "idle" | "building" | "starting" | "ready" | "failed" | "repairing";

export type CodeRun = {
  phase: RunPhase;
  steps: BuildStepView[];
  /** The build the frame runs (or the failed one). */
  build: CodeBuildInfo | null;
  /** What's wrong right now, from the build or the running app. */
  errors: FixError[];
  /** Where the errors came from: the build, the app starting, or the app while running. */
  source: "build" | "start" | "runtime" | null;
  /** Couldn't reach Prod AI, or the server said no, in plain words. */
  problem: string | null;
  /** Built and started in this visit: the moment it becomes real is drawn once. */
  fresh: boolean;
  /** The server said Prod AI has tried enough fixes in a row: it's the person's turn to say what they want. */
  stuck: boolean;
  /** Prod AI's last fix, in plain words, while its new version builds. */
  fixed: { summary: string; label: string } | null;
  /** Starts of the same build: trying again reloads the frame. */
  attempt: number;
};

/** Fixes in a row before Prod AI asks the person to say what they want (the server holds the line: lib/code-apps/repair.ts). */
export const MAX_REPAIRS = 3;

const fromBuild = (errors: BuildError[]): FixError[] => errors.slice(0, 12).map((e) => ({ ...e, source: "build" as const }));

function initial(b: CodeBuildInfo | null): CodeRun {
  const base = { steps: [], problem: null, fresh: false, stuck: false, fixed: null, attempt: 0 };
  if (!b) return { ...base, phase: "idle", build: null, errors: [], source: null };
  if (b.ok) return { ...base, phase: "starting", build: b, errors: [], source: null };
  return { ...base, phase: "failed", build: b, errors: fromBuild(b.errors), source: "build" };
}

/** Reads an NDJSON response line by line. */
async function* lines(res: Response): AsyncGenerator<Record<string, unknown>> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n");
    buf = parts.pop() ?? "";
    for (const p of parts) {
      if (!p.trim()) continue;
      try {
        yield JSON.parse(p) as Record<string, unknown>;
      } catch {
        // a broken line is skipped; the result line decides
      }
    }
  }
  if (buf.trim()) {
    try {
      yield JSON.parse(buf) as Record<string, unknown>;
    } catch {
      // ignore
    }
  }
}

const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;
const reachWords = () => (offline() ? "You're offline. Nothing changed: try again when you're back." : "Couldn't reach Prod AI just now. Nothing changed: try again.");

export function useCodeRun({ projectId, serverBuild, paths, onBusy }: { projectId: string; serverBuild: CodeBuildInfo | null; paths: string[]; onBusy?: (busy: boolean) => void }) {
  const router = useRouter();
  const [run, setRun] = useState<CodeRun>(() => initial(serverBuild));
  const busyRef = useRef(false);
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);
  const pathsRef = useRef(paths);
  useEffect(() => {
    pathsRef.current = paths;
  }, [paths]);

  const busy = run.phase === "building" || run.phase === "repairing" || run.phase === "starting";
  useEffect(() => {
    onBusy?.(busy);
  }, [busy, onBusy]);
  useEffect(() => () => onBusy?.(false), [onBusy]);

  /** The real build: each step as the server reports it, then the result. Free. */
  const build = useCallback(async (opts?: { keepFix?: boolean }) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRun((r) => ({ ...r, phase: "building", steps: [], errors: [], source: null, problem: null, stuck: false, fresh: true, fixed: opts?.keepFix ? r.fixed : null }));
    let result: BuildResult | null = null;
    let problem: string | null = null;
    try {
      const res = await fetch(`/api/code-apps/${projectId}/build`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        problem = j.error ?? (res.status === 404 ? "Building code apps isn't switched on here yet." : "Couldn't build it just now. Try again.");
      } else {
        for await (const e of lines(res)) {
          if (e.t === "step" && typeof e.id === "string") {
            const step: BuildStepView = {
              id: e.id,
              label: typeof e.label === "string" ? e.label : e.id,
              state: e.state === "done" || e.state === "failed" ? e.state : "running",
              detail: typeof e.detail === "string" ? e.detail : undefined,
            };
            setRun((r) => ({ ...r, steps: r.steps.some((s) => s.id === step.id) ? r.steps.map((s) => (s.id === step.id ? { ...s, ...step, detail: step.detail ?? s.detail } : s)) : [...r.steps, step] }));
          }
          if (e.t === "result" && e.build && typeof e.build === "object") result = e.build as BuildResult;
          if (e.t === "error") problem = typeof e.message === "string" ? e.message : "The build stopped. Try again.";
        }
        if (!result && !problem) problem = "The build stopped before it finished. Try again.";
      }
    } catch {
      problem = reachWords();
    } finally {
      busyRef.current = false;
    }
    const info = buildInfo(result);
    if (info?.ok) {
      // Built: now it has to start. The frame reports prod:ready (or an error) and the last step follows it.
      setRun((r) => ({ ...r, phase: "starting", build: info, errors: [], source: null, steps: [...r.steps, { id: "start", label: "Starting your app", state: "running" }] }));
    } else if (info) {
      setRun((r) => ({ ...r, phase: "failed", build: info, errors: fromBuild(info.errors), source: "build" }));
    } else {
      setRun((r) => ({ ...r, phase: r.build?.ok ? "ready" : r.build ? "failed" : "idle", problem, steps: r.steps.map((s) => (s.state === "running" ? { ...s, state: "failed" } : s)) }));
    }
    // The saved build (and the history) on the server: the rest of the workspace catches up.
    router.refresh();
  }, [projectId, router]);

  /** The app rendered for the first time: it's real. */
  const started = useCallback(() => {
    setRun((r) => (r.phase === "starting" || r.phase === "failed" ? { ...r, phase: "ready", errors: r.source === "start" ? [] : r.errors, source: r.source === "start" ? null : r.source, steps: r.steps.map((s) => (s.id === "start" ? { ...s, state: "done" } : s)) } : r));
  }, []);

  /** The app hit an error: before it started (it didn't start), or while someone was using it. */
  const crashed = useCallback((e: FrameError) => {
    const err: FixError = { message: e.message, stack: e.stack, source: e.source === "start" ? "start" : "runtime", ...fileOf(e, pathsRef.current) };
    setRun((r) => {
      if (r.phase === "building" || r.phase === "repairing" || r.phase === "idle") return r;
      const errors = r.errors.some((x) => sameError(x, err)) ? r.errors : [...r.errors, err].slice(0, 6);
      // Before its first render: it didn't start (an error while starting, or it took too long).
      if (r.phase === "starting")
        return { ...r, phase: "failed", errors, source: "start", steps: r.steps.map((s) => (s.id === "start" ? { ...s, state: "failed", detail: e.message.slice(0, 160) } : s)) };
      return { ...r, errors, source: r.source ?? "runtime" };
    });
  }, []);

  /** Claude fixes the real errors (free), saved as a new version labelled as Prod AI's fix; then it builds again. */
  const repair = useCallback(async () => {
    const r0 = runRef.current;
    if (busyRef.current || !r0.errors.length) return;
    busyRef.current = true;
    setRun((r) => ({ ...r, phase: "repairing", problem: null, fixed: null }));
    let problem: string | null = null;
    let code: string | null = null;
    let fixed: CodeRun["fixed"] = null;
    try {
      // A failed build sends its errors; a runtime error (or an app that didn't start) sends what the sandbox reported.
      const first = r0.errors[0];
      const body =
        r0.source === "build"
          ? { errors: r0.errors.slice(0, 20).map((e) => ({ file: e.file?.slice(0, 200), line: e.line, column: e.column, message: e.message.slice(0, 2000) })) }
          : { runtime: { message: first.message.slice(0, 2000), ...(first.stack ? { stack: first.stack.slice(0, 6000) } : {}), ...(first.file ? { source: `${first.file}${first.line ? `:${first.line}` : ""}`.slice(0, 200) } : {}) } };
      const res = await fetch(`/api/code-apps/${projectId}/repair`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string; summary?: string; label?: string; version?: number };
      if (!res.ok || j.ok === false) {
        problem = j.error ?? (res.status === 404 ? "Fixing code apps isn't switched on here yet." : "The fix didn't work out. Try again.");
        code = j.code ?? null;
      } else {
        fixed = { summary: j.summary ?? "Fixed what broke", label: j.version ? `version ${j.version}` : "a new version" };
      }
    } catch {
      problem = reachWords();
    } finally {
      busyRef.current = false;
    }
    // The errors were from an older build: build what's there now.
    if (code === "stale") return void build();
    if (problem) {
      setRun((r) => ({ ...r, phase: "failed", problem, stuck: code === "repair-limit" }));
      return;
    }
    // The fixed files are a new version: build them for real.
    setRun((r) => ({ ...r, fixed }));
    router.refresh();
    await build({ keepFix: true });
  }, [projectId, router, build]);

  /** Start the same build again (it didn't start in time, say). */
  const restart = useCallback(() => {
    setRun((r) => (r.build?.ok ? { ...r, phase: "starting", errors: [], source: null, problem: null, attempt: r.attempt + 1, steps: r.steps.map((s) => (s.id === "start" ? { ...s, state: "running", detail: undefined } : s)) } : r));
  }, []);

  /** Someone else's build (another tab, a teammate) or a cleared one: follow the server when nothing runs here. */
  const adopt = useCallback((b: CodeBuildInfo | null) => {
    if (busyRef.current) return;
    setRun((r) => {
      if (r.phase === "building" || r.phase === "repairing") return r;
      if ((b?.hash ?? null) === (r.build?.hash ?? null)) return r;
      return initial(b);
    });
  }, []);

  return { run, build, started, crashed, repair, restart, adopt, busy };
}

/**
 * "App.jsx:12:5" in a stack, or a source like "components/Board.jsx:12": where a runtime error happened,
 * when it says so and names one of the app's own files (never a package's).
 */
function fileOf(e: FrameError, paths: string[]): Pick<FixError, "file" | "line" | "column"> {
  if (e.file && paths.includes(e.file)) return { file: e.file, line: e.line, column: e.column };
  const src = `${e.source ?? ""}\n${e.stack ?? ""}`;
  for (const m of src.matchAll(/([A-Za-z0-9_\-/]+\.(?:jsx|tsx|js|ts))(?::(\d+))?(?::(\d+))?/g)) {
    const file = paths.find((p) => p === m[1] || m[1].endsWith(`/${p}`));
    if (file) return { file, line: m[2] ? Number(m[2]) : undefined, column: m[3] ? Number(m[3]) : undefined };
  }
  return {};
}
