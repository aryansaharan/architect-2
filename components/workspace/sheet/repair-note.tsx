"use client";
import { useEffect, useId, useRef } from "react";
import { Check, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useStopBuild } from "./build-progress";
import { plainWords, plural, reducedMotion, useSheet } from "./use-sheet";

/** What a fix touches, in plain words, leaving out what it doesn't: "Changes 1 AI helper and 2 files". */
function touches(r: { screens: number; agents: number; files: number }): string {
  const parts = [r.screens ? plural(r.screens, "screen") : "", r.agents ? plural(r.agents, "AI helper") : "", r.files ? plural(r.files, "file") : ""].filter(Boolean);
  if (!parts.length) return "A small change";
  return `Changes ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0]}`;
}

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
      <p className="font-sketch text-sketch text-fix">Caught before you saw it · fixing it is free</p>
      <h2 id={`${id}-t`} className="mt-1 font-pencil text-section text-foreground">{plainWords(plan.title)}</h2>
      <p id={`${id}-d`} className="mt-2.5 max-w-[68ch] text-body text-foreground/85">
        {plainWords(plan.tried)} <span className="text-muted-foreground">{plainWords(plan.whyFailed)}</span>
      </p>

      <p className="mt-5 font-pencil text-note text-foreground">Pick one:</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {options.map((o, i) => {
          const chosen = choice === o.id;
          return (
            <div key={o.id} className={cn("flex flex-col p-4", o.recommended ? "sketch border-brand/70 bg-brand-soft" : "sketch-soft bg-panel")}>
              <div className="flex items-center gap-2">
                {o.recommended ? <span className="font-sketch text-sketch text-brand">what we&apos;d pick</span> : <span className="font-sketch text-sketch text-muted-foreground">or</span>}
                <span className="ml-auto text-meta font-medium tabular-nums text-fix">{o.credits > 0 ? plural(o.credits, "credit") : "Free"}</span>
              </div>
              <p className="mt-1.5 text-body font-medium text-foreground">{plainWords(o.label)}</p>
              <p className="mt-1 flex-1 text-body text-muted-foreground">{plainWords(o.narration)}</p>
              <p className="mt-2 text-meta tabular-nums text-faint">{touches(o.blastRadius)}</p>
              <Button
                ref={i === 0 ? first : undefined}
                variant={o.recommended ? "default" : "outline"}
                className="mt-3"
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
        <p className="text-meta text-muted-foreground">Either way, every AI helper does its test runs again before you see the app.</p>
        <Button variant="ghost" className="text-muted-foreground" disabled={stopping || Boolean(choice)} onClick={stop}>
          <Undo2 aria-hidden /> {replay ? "End replay" : stopping ? "Stopping…" : "Stop and go back to the sketch · refunded"}
        </Button>
      </div>
    </section>
  );
}
