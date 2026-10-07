"use client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { CodeFile, Manifest } from "@/lib/code-apps/schema";
import type { CodeBuildInfo } from "@/components/code-apps/build-info";
import { useWorkspace } from "@/components/workspace/context";

/**
 * What the studio's surroundings (top bar, Code tab, Publish) know about a code app, in the browser:
 * which kind of app a project is, its files, manifest and latest build (from the project page's data),
 * and how its latest build last ran in the studio's sandbox. Hints for the page only; the server decides
 * everything that matters.
 */

export type ProjectKind = "business" | "code";

/** Which kind of app this project is. */
export function useProjectKind(): ProjectKind {
  return useWorkspace().project.kind === "code" ? "code" : "business";
}

export type CodeAppView = { manifest: Manifest | null; build: CodeBuildInfo | null; files: CodeFile[] };

/** A code app's files, manifest and latest build (without its bundle), as the project page has them now. */
export function useCodeApp(): CodeAppView {
  const ws = useWorkspace();
  return useMemo(() => ({ manifest: ws.code?.manifest ?? null, build: ws.codeBuild ?? null, files: ws.code?.files ?? [] }), [ws.code, ws.codeBuild]);
}

/* ------------------------------------------------------------------ The studio's last run */

/** How the latest build last ran in the studio's sandbox: it started (prod:ready) or stopped with an error (prod:error). */
export type LastRun = { hash: string; state: "started" | "failed"; message?: string; at: number };

const RUN_EVENT = "prodai:code-run";
const runKey = (id: string) => `prodai:run:${id}`;
/** Runs heard this session, for browsers that refuse localStorage. */
const runMemory = new Map<string, string>();

function readRunRaw(id: string): string | null {
  try {
    return window.localStorage.getItem(runKey(id)) ?? runMemory.get(id) ?? null;
  } catch {
    return runMemory.get(id) ?? null;
  }
}

function subscribeRun(cb: () => void) {
  window.addEventListener(RUN_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(RUN_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** The studio's last run of this exact build, or null when it hasn't run in this browser. */
export function useLastRun(projectId: string, hash: string | null | undefined): LastRun | null {
  const raw = useSyncExternalStore(subscribeRun, () => readRunRaw(projectId), () => null);
  return useMemo(() => {
    if (!raw || !hash) return null;
    try {
      const run = JSON.parse(raw) as LastRun;
      return run && run.hash === hash && (run.state === "started" || run.state === "failed") ? run : null;
    } catch {
      return null;
    }
  }, [raw, hash]);
}

/**
 * Listens for the studio's sandbox saying it started or stopped with an error, and remembers it for
 * that build. Only a frame on this page showing this project's build counts (`/run/p/<id>?b=<hash>`,
 * the address CodeAppFrame gives it). Mounted once, in the top bar, so it hears every run on any page.
 */
export function useRunWatcher(projectId: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: unknown; message?: unknown } | null;
      if (!d || typeof d !== "object" || (d.type !== "prod:ready" && d.type !== "prod:error")) return;
      const frame = Array.from(document.querySelectorAll("iframe")).find((f) => f.contentWindow === e.source);
      if (!frame) return;
      let url: URL;
      try {
        url = new URL(frame.getAttribute("src") ?? "", window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin || url.pathname !== `/run/p/${projectId}`) return;
      const hash = url.searchParams.get("b");
      if (!hash || hash.length > 128) return;
      const run: LastRun = {
        hash,
        state: d.type === "prod:ready" ? "started" : "failed",
        message: d.type === "prod:error" && typeof d.message === "string" ? d.message.slice(0, 300) : undefined,
        at: Date.now(),
      };
      // An error and then the first render in the same moment still count as the error; a later fresh start clears it.
      const before = readRunRaw(projectId);
      if (run.state === "started" && before) {
        try {
          const prev = JSON.parse(before) as LastRun;
          if (prev.hash === hash && prev.state === "failed" && Date.now() - prev.at < 1500) return;
        } catch {
          // Overwrite whatever was there.
        }
      }
      const raw = JSON.stringify(run);
      runMemory.set(projectId, raw);
      try {
        window.localStorage.setItem(runKey(projectId), raw);
      } catch {
        // Memory is enough for this session.
      }
      window.dispatchEvent(new Event(RUN_EVENT));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [projectId, enabled]);
}

/**
 * Where a code app is, in the top bar's words: Sketch (written, not built, or it stops with an error),
 * Real (built, and it started in its last run here, or hasn't run here yet), Published (online).
 */
export function codeStage(build: CodeBuildInfo | null, run: LastRun | null, live: boolean): "sketch" | "real" | "published" {
  if (live) return "published";
  return build?.ok && run?.state !== "failed" ? "real" : "sketch";
}
