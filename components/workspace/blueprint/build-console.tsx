"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronUp, FastForward, FlaskConical, Loader2, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Segmented } from "@/components/arch/segmented";
import { Term } from "@/components/arch/term";
import { cn } from "@/lib/utils";
import { DUR, EASE } from "@/lib/motion";
import { useWorkspace } from "../context";

export const SIMULATED_NOTE = "The plan, code and data are real. Build steps and test runs are scripted in this prototype.";

/** Calm, always-visible label for the parts of the build that are a scripted playback. */
export function SimulatedChip({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn("inline-flex h-5 shrink-0 cursor-help items-center gap-1 rounded-full border border-hairline bg-canvas px-2 text-badge font-medium normal-case tracking-normal text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/50", className)}>
          <FlaskConical className="size-3" aria-hidden />
          Simulated build
          <span className="sr-only">: {SIMULATED_NOTE}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] leading-relaxed">{SIMULATED_NOTE}</TooltipContent>
    </Tooltip>
  );
}

export function BuildConsole() {
  const ws = useWorkspace();
  const b = ws.build;
  const [logs, setLogs] = useState(false);
  const steps = b.steps.filter((s) => s.kind === "step");
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
              <p className="text-meta text-muted-foreground">{b.mode === "replay" ? "Replay · changes nothing" : finishing ? "Saving" : b.status === "repair" ? "Paused · waiting for you" : `Step ${Math.min(done + 1, steps.length)} of ${steps.length}`}</p>
              <SimulatedChip />
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
            {/* The build is a scripted playback over the real plan, so the controls say so: speed, not a faster build. */}
            <span className="text-meta text-muted-foreground max-sm:sr-only">Speed</span>
            <Segmented<string>
              ariaLabel="Playback speed"
              size="xs"
              value={String(b.speed)}
              onChange={(v) => b.setSpeed(Number(v))}
              options={[
                { value: "1", label: "Normal" },
                { value: "4", label: "Fast" },
                { value: "50", label: <><FastForward className="size-3" />Skip to end</>, title: "Plays the rest in a moment. It still stops if a test run needs your decision." },
              ]}
            />
            <Button variant="ghost" size="sm" onClick={() => setLogs((l) => !l)} aria-expanded={logs}>
              <Terminal /> {logs ? "Hide" : "Show"} what it&apos;s doing <ChevronUp className={cn("transition-transform duration-150 ease-paper", !logs && "rotate-180")} />
            </Button>
          </div>
        </div>
        {b.mode === "build" && b.charged ? (
          <p className="-mt-2 px-4 pb-3 text-meta text-muted-foreground">
            This build took <span className="tabular-nums text-foreground/85">{b.charged} credits</span> under the earlier pricing. If you stop it, they come back.
          </p>
        ) : null}
        {logs && (
          <div className="code-face max-h-48 overflow-y-auto border-t border-hairline px-4 py-3 text-code">
            {b.completed.slice(-6).map((s) => (
              <div key={s.id} className="text-foreground/70">
                <span className="text-ok">✓</span> {s.title}
                {s.file && <span className="text-faint"> · {s.file}</span>}
              </div>
            ))}
            {cur && (
              <div className="mt-1">
                <span className="text-brand">›</span> {cur.title}
                {cur.file && <span className="text-faint"> · {cur.file}</span>}
                {cur.logs?.map((l, i) => (
                  <div key={i} className="pl-4 text-muted-foreground">{l}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </motion.section>
    </div>
  );
}
