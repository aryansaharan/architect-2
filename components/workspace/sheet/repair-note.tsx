"use client";
import { useEffect, useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DUR, EASE } from "@/lib/motion";
import { DrawnCheck } from "@/components/motion/sheet-draw";
import { useStopBuild } from "./build-progress";
import { plainWords, plural, reducedMotion, useSheet } from "./use-sheet";

/**
 * The build paused for a decision, written on the sheet as a pencil note: the test run that really
 * failed (what was asked, what should have happened, what the helper did, and why Claude's judge
 * failed it), the fixes in plain words, and two ways out: finish without a fix, or stop.
 * Fixing is free, and the failed test runs are played again with the fix, also free.
 */
export function RepairNote() {
  const ws = useSheet();
  // Kept while the note leaves (the Sheet fades it out), so the fix you picked stays ticked until it's gone.
  const live = ws.build.repair;
  const [last, setLast] = useState(live);
  if (live && live !== last) setLast(live);
  const plan = live ?? last;
  const { stop, stopping } = useStopBuild();
  const id = useId();
  const box = useRef<HTMLElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const planId = plan?.id;

  // Bring the note into view and put the keyboard on the recommended fix, once per decision.
  useEffect(() => {
    if (!planId) return;
    box.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "nearest" });
    first.current?.focus({ preventScroll: true });
  }, [planId]);

  if (!plan) return null;
  const choice = ws.build.repairChoice;
  const replay = ws.build.mode === "replay";
  const options = [...plan.options].sort((a, b) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)));

  return (
    // Written in from the margin's side: a short slide and settle, once.
    <motion.section
      ref={box}
      role="alertdialog"
      aria-modal="false"
      aria-labelledby={`${id}-t`}
      aria-describedby={`${id}-d`}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      // Once a fix is picked: a beat for its tick to finish, then a quick fade as the build carries on.
      exit={{ opacity: 0, transition: { duration: DUR.hover, delay: DUR.hover, ease: EASE } }}
      transition={{ duration: DUR.panel, ease: EASE }}
      className="sketch mt-6 scroll-mt-6 border-fix/70 bg-panel p-5 sm:p-6"
    >
      <p className="font-sketch text-sketch text-fix">Caught in a real test run · fixing it is free</p>
      <h2 id={`${id}-t`} className="mt-1 font-pencil text-section text-foreground">{plainWords(plan.title)}</h2>
      <div id={`${id}-d`} className="mt-3 space-y-3">
        {plan.failures.slice(0, 3).map((f) => (
          <div key={`${f.agentId}/${f.rehearsalId}`} className="max-w-[72ch] border-l-2 border-fix/50 pl-3">
            <p className="text-meta text-muted-foreground">
              <span className="font-medium text-foreground">{f.agentName}</span> · {f.rehearsalName}
            </p>
            <p className="mt-1 text-body text-foreground/85">
              Asked: <span className="text-muted-foreground">“{f.input}”</span>
            </p>
            <p className="text-body text-foreground/85">
              Should: <span className="text-muted-foreground">{f.expect}</span>
            </p>
            {f.reply && (
              <p className="mt-1 line-clamp-3 font-mono text-meta text-muted-foreground" title={f.reply}>
                {f.agentName}: {f.reply}
              </p>
            )}
            {f.calls.length > 0 && (
              <p className="text-meta text-muted-foreground">
                Used: {f.calls.map((c) => `${c.name}${c.asked ? " (asked first)" : ""}`).join(", ")}
              </p>
            )}
            <p className="mt-1 text-body text-foreground">{plainWords(f.reason)}</p>
          </div>
        ))}
        {plan.failures.length > 3 && <p className="text-meta text-muted-foreground">And {plural(plan.failures.length - 3, "more")}. They&apos;re all in AI helpers › Tests & reliability.</p>}
      </div>

      <p className="mt-5 font-pencil text-note text-foreground">Pick one:</p>
      <div className={cn("mt-2 grid gap-3", options.length > 1 && "sm:grid-cols-2")}>
        {options.map((o, i) => {
          const chosen = choice === o.id;
          return (
            <div key={o.id} className={cn("relative flex flex-col p-4", o.recommended ? "sketch border-brand/70 bg-brand-soft" : "sketch-soft bg-panel")}>
              {/* The pick, ticked in pencil on its corner. */}
              {chosen && <DrawnCheck className="pointer-events-none absolute -left-2.5 -top-3.5 size-7 text-brand" />}
              <div className="flex items-center gap-2">
                {o.recommended ? <span className="font-sketch text-sketch text-brand">what we&apos;d pick</span> : <span className="font-sketch text-sketch text-muted-foreground">or</span>}
                <span className="ml-auto text-meta font-medium tabular-nums text-fix">Free</span>
              </div>
              <p className="mt-1.5 text-body font-medium text-foreground">{plainWords(o.label)}</p>
              <p className="mt-1 flex-1 text-body text-muted-foreground">{plainWords(o.narration)}</p>
              <Button
                ref={i === 0 ? first : undefined}
                variant={o.recommended ? "default" : "outline"}
                className="mt-3"
                disabled={Boolean(choice) || stopping || replay}
                onClick={() => ws.build.choose(o.id)}
              >
                <Check aria-hidden /> {chosen ? (replay ? "Picked" : "Using this fix…") : "Use this fix"}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-hairline pt-3">
        <p className="text-meta text-muted-foreground">With a fix, Claude plays the failed test runs again before you see the app, free.</p>
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="ghost" className="text-muted-foreground" disabled={stopping || Boolean(choice) || replay} onClick={() => ws.build.choose("none")}>
            {choice === "none" ? (replay ? "Left as it was" : "Finishing…") : "Leave it and finish"}
          </Button>
          <Button variant="ghost" className="text-muted-foreground" disabled={stopping || Boolean(choice)} onClick={stop}>
            <Undo2 aria-hidden /> {replay ? "End replay" : stopping ? "Stopping…" : "Stop and go back to the sketch"}
          </Button>
        </div>
      </div>
    </motion.section>
  );
}
