"use client";
import { useEffect, useId, useRef } from "react";
import { Check, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useStopBuild } from "./build-progress";
import { plainWords, plural, reducedMotion, useSheet } from "./use-sheet";

/**
 * The build paused for a decision, written on the sheet as a pencil note: what went wrong,
 * two fixes in plain words with their price, and a way out. It calls the same runner the old
 * repair card did (ws.build.choose), so the choice is recorded and applied exactly as before.
 */
export function RepairNote() {
  const ws = useSheet();
  const plan = ws.build.repair;
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
    <section
      ref={box}
      role="alertdialog"
      aria-modal="false"
      aria-labelledby={`${id}-t`}
      aria-describedby={`${id}-d`}
      className="sketch fade-up mt-6 scroll-mt-6 border-fix/70 bg-panel p-5 sm:p-6"
    >
      <p className="font-sketch text-[12.5px] text-fix">Caught before you saw it · fixing it is free</p>
      <h2 id={`${id}-t`} className="mt-1 font-display text-[29px] leading-[1.1] text-foreground sm:text-[32px]">{plainWords(plan.title)}</h2>
      <p id={`${id}-d`} className="mt-2.5 max-w-[68ch] text-[14px] leading-relaxed text-foreground/85">
        {plainWords(plan.tried)} <span className="text-muted-foreground">{plainWords(plan.whyFailed)}</span>
      </p>

      <p className="mt-5 font-pencil text-[23px] text-foreground">Pick one:</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {options.map((o, i) => {
          const chosen = choice === o.id;
          return (
            <div key={o.id} className={cn("flex flex-col p-4", o.recommended ? "sketch border-brand/70 bg-brand-soft" : "sketch-soft bg-panel")}>
              <div className="flex items-center gap-2 font-sketch text-[12px]">
                {o.recommended ? <span className="text-brand">what we&apos;d pick</span> : <span className="text-muted-foreground">or</span>}
                <span className="ml-auto text-fix">{o.credits > 0 ? plural(o.credits, "credit") : "free"}</span>
              </div>
              <p className="mt-1.5 text-[14.5px] font-medium leading-snug text-foreground">{plainWords(o.label)}</p>
              <p className="mt-1 flex-1 text-[13px] leading-relaxed text-muted-foreground">{plainWords(o.narration)}</p>
              <p className="mt-2 font-sketch text-[11.5px] text-faint">
                Changes {plural(o.blastRadius.screens, "screen")} · {plural(o.blastRadius.agents, "AI helper")} · {plural(o.blastRadius.files, "file")}
              </p>
              <Button
                ref={i === 0 ? first : undefined}
                size="sm"
                variant={o.recommended ? "default" : "outline"}
                className="mt-3 h-9 text-[13px]"
                disabled={Boolean(choice) || stopping}
                onClick={() => ws.build.choose(o.id)}
              >
                <Check aria-hidden /> {chosen ? "Using this fix…" : "Use this fix"}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-hairline pt-3">
        <p className="text-[12.5px] text-muted-foreground">Either way, every AI helper does its test runs again before you see the app.</p>
        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" disabled={stopping || Boolean(choice)} onClick={stop}>
          <Undo2 aria-hidden /> {replay ? "End replay" : stopping ? "Stopping…" : "Stop and go back to the sketch · refunded"}
        </Button>
      </div>
    </section>
  );
}
