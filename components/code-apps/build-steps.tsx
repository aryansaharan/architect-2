"use client";
import type { Ref } from "react";
import { CircleAlert } from "lucide-react";
import { DrawnCheck } from "@/components/motion/sheet-draw";
import { cn } from "@/lib/utils";
import type { BuildStepView, RunPhase } from "./use-code-run";

/** A short pencil dash: a step under way. */
function PencilDash({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className}>
      <path d="M2.8 8.6c2.9-.6 6.6-.5 10.4.1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The real build, step by step, as the server reports it: each step written in pencil while it runs, then
 * inked with a tick when it's done (or marked when it fails), with the detail the server gave. The last
 * step, starting the app, follows the sandbox: it's done when the app has really drawn itself.
 */
export function BuildSteps({ steps, phase, fixed, ref }: { steps: BuildStepView[]; phase: RunPhase; fixed?: { summary: string; label: string } | null; ref?: Ref<HTMLElement> }) {
  const current = [...steps].reverse().find((s) => s.state === "running");
  const didntStart = steps.some((s) => s.id === "start" && s.state === "failed");
  const lead = phase === "repairing" ? "Fixing it" : phase === "failed" ? (didntStart ? "It built, but it didn't start" : "The build stopped here") : "Making it real";
  const doing = phase === "repairing" ? "Claude is reading the error and your files" : current ? current.label : phase === "building" ? "Getting started" : null;
  return (
    <section ref={ref} tabIndex={-1} aria-label="Build progress" className="mt-7 scroll-mt-6 rounded-md border border-hairline bg-canvas/60 px-4 py-4 outline-none sm:px-5">
      <p aria-live="polite" className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-pencil text-note text-foreground">
          {lead}
          {doing && (
            <>
              {" "}
              · <span className="text-brand">{doing}</span>
            </>
          )}
        </span>
        {steps.length > 0 && (
          <span className="text-meta tabular-nums text-muted-foreground">
            {steps.filter((s) => s.state === "done").length} of {steps.length} done
          </span>
        )}
      </p>
      {/* Prod AI's fix, said once, in its own colour: what it changed and the version it saved. */}
      {fixed && (
        <p className="mt-2 text-meta text-fix">
          Our fix · free: {fixed.summary} <span className="text-muted-foreground">· saved as {fixed.label}</span>
        </p>
      )}
      {steps.length > 0 ? (
        <ol className="mt-3 space-y-2">
          {steps.map((s) => (
            <li key={s.id} className="flex gap-2.5">
              <span className="mt-[3px] grid size-4 shrink-0 place-items-center">
                {s.state === "done" ? (
                  <DrawnCheck strokeWidth={1.7} className="size-4 text-ok" />
                ) : s.state === "failed" ? (
                  <CircleAlert className="size-3.5 text-foreground" aria-hidden />
                ) : (
                  <PencilDash className="size-4 text-brand" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                {/* Pencil while it runs, ink once it's done. */}
                <p className={cn("text-body transition-colors duration-450 ease-paper", s.state === "running" ? "text-muted-foreground" : "text-foreground")}>
                  <span className="sr-only">{s.state === "done" ? "Done: " : s.state === "failed" ? "Failed: " : "Now: "}</span>
                  {s.label}
                </p>
                {s.detail && <p className="break-words text-meta text-muted-foreground">{s.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-meta text-muted-foreground">{phase === "repairing" ? "When the fix is saved as a new version, it builds again." : "Asking the builder to start…"}</p>
      )}
    </section>
  );
}
