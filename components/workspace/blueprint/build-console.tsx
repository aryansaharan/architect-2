"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronUp, FlaskConical, Loader2, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Term } from "@/components/arch/term";
import { cn } from "@/lib/utils";
import { DUR, EASE } from "@/lib/motion";
import { useWorkspace } from "../context";

export const REAL_NOTE = "Every step really runs on Prod AI's server: the plan is checked, the code compiled, and the test runs are played by Claude and judged.";

/** Calm, always-visible label saying the build you watch is the real one. */
export function RealBuildChip({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn("inline-flex h-5 shrink-0 cursor-help items-center gap-1 rounded-full border border-hairline bg-canvas px-2 text-badge font-medium normal-case tracking-normal text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/50", className)}>
          <FlaskConical className="size-3" aria-hidden />
          Real build
          <span className="sr-only">: {REAL_NOTE}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] leading-relaxed">{REAL_NOTE}</TooltipContent>
    </Tooltip>
  );
}

export function BuildConsole() {
  const ws = useWorkspace();
  const b = ws.build;
  const [logs, setLogs] = useState(false);
  const done = b.completed.length;
  const cur = b.current?.kind === "step" ? b.current : null;
  const finishing = b.status === "finishing";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-5">
      <motion.section
        aria-label="Build progress"
        aria-live="polite"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8, transition: { duration: DUR.hover, ease: EASE } }}
        transition={{ duration: DUR.panel, ease: EASE }}
        className="panel-raised pointer-events-auto w-full max-w-[860px] overflow-hidden rounded-lg"
      >
        <div className="h-1 overflow-hidden bg-deep">
          <motion.div className="h-full bg-brand" animate={{ width: `${Math.round(b.progress * 100)}%` }} transition={{ duration: DUR.page, ease: EASE }} />
        </div>
        <div className="flex items-center gap-4 p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-md border border-hairline bg-canvas">
            <Loader2 className="size-4 animate-spin text-brand" aria-hidden />
          </span>
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-meta text-muted-foreground">{b.mode === "replay" ? "Replay · changes nothing" : finishing ? "Saving" : b.status === "repair" ? "Paused · waiting for you" : `Step ${Math.min(done + 1, b.total)} of ${b.total}`}</p>
              <RealBuildChip />
            </div>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={finishing ? "finishing" : b.status === "repair" ? "repair" : (cur?.id ?? "working")}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: DUR.panel, ease: EASE }}
              >
                <p className="mt-0.5 truncate pr-1 font-pencil text-note leading-tight">{finishing ? <>Saving the build as a new <Term k="save-point">version</Term> you can come back to…</> : b.status === "repair" ? "Prod AI caught a problem" : cur?.title ?? "Working…"}</p>
                {cur?.detail && !finishing && <p className="truncate text-meta text-muted-foreground">{cur.detail}</p>}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLogs((l) => !l)} aria-expanded={logs}>
              <Terminal /> {logs ? "Hide" : "Show"} what it&apos;s doing <ChevronUp className={cn("transition-transform duration-150 ease-paper", !logs && "rotate-180")} />
            </Button>
          </div>
        </div>
        {b.mode === "build" && b.charged ? (
          <p className="-mt-2 px-4 pb-3 text-meta text-muted-foreground">
            Test runs so far: <span className="tabular-nums text-foreground/85">{b.charged} credits</span>.
          </p>
        ) : null}
        {logs && (
          <div className="code-face max-h-48 overflow-y-auto border-t border-hairline px-4 py-3 text-code">
            {b.completed.slice(-6).map((s) => (
              <div key={s.id} className="text-foreground/70">
                <span className={s.tone === "warn" ? "text-fix" : "text-ok"}>{s.state === "skipped" ? "–" : s.tone === "warn" ? "!" : "✓"}</span> {s.title}
                {s.detail && <span className="text-faint"> · {s.detail}</span>}
              </div>
            ))}
            {cur && (
              <div className="mt-1">
                <span className="text-brand">›</span> {cur.title}
                {cur.detail && <div className="pl-4 text-muted-foreground">{cur.detail}</div>}
              </div>
            )}
            {b.runs.slice(-4).map((r) => (
              <div key={`${r.agentId}/${r.rehearsalId}/${r.again ? 1 : 0}`} className="pl-4 text-muted-foreground">
                {r.outcome === "pass" ? "pass" : r.outcome === "fail" ? "fail" : "skip"} · {r.name}: {r.reason}
              </div>
            ))}
          </div>
        )}
      </motion.section>
    </div>
  );
}
