"use client";
import { useRef, useState, type Ref } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CircleSlash, FlaskConical, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { cancelBuild } from "@/lib/actions/build";
import { PRICE } from "@/lib/prices";
import type { TestRun } from "@/lib/build/report";
import { stoppedWords } from "../use-build-runner";
import { plural, useSheet, useWidth } from "./use-sheet";

/**
 * Stops the build: cancelBuild puts the sketch back as it was, then the runner lets go. Test runs Claude
 * already played stay charged (that work happened). A replay just ends.
 */
export function useStopBuild() {
  const ws = useSheet();
  const router = useRouter();
  const [stopping, setStopping] = useState(false);
  const stop = async () => {
    if (ws.build.mode === "replay") return ws.build.dismiss();
    setStopping(true);
    const r = await cancelBuild(ws.project.id).catch(() => ({ ok: false as const, error: "Couldn't reach Prod AI. Try again." }));
    setStopping(false);
    if (!r.ok) return void toast.error(r.error);
    ws.build.dismiss();
    const kept = ws.build.charged ? ` The test runs Claude already played (${plural(ws.build.charged, "credit")}) stay on your bill.` : "";
    toast.success("Stopped", { description: stoppedWords(r.refunded, `Your sketch is exactly as you left it.${kept}`) });
    router.refresh();
  };
  return { stop, stopping };
}

/** A pencil line's gentle wobble, `w` pixels long: the same line every time for the same width. */
function wobble(w: number, y: number) {
  const seg = 48;
  const n = Math.max(1, Math.round(w / seg));
  let d = `M1 ${y}`;
  for (let i = 1; i <= n; i++) {
    const x = 1 + ((w - 2) * i) / n;
    const cx = x - (w - 2) / n / 2;
    d += ` Q${cx.toFixed(1)} ${(y + (i % 2 ? -0.9 : 0.9)).toFixed(1)} ${x.toFixed(1)} ${y}`;
  }
  return d;
}

/**
 * The build's progress as a pencil line drawn along the steps: the planned line in faint pencil with a
 * small tick where each step ends, and the line in ink drawn over it as steps finish (stroke-dashoffset,
 * 450ms per step). Nothing loops: it only moves when a step is done.
 */
function PencilLine({ progress, marks }: { progress: number; marks: number[] }) {
  const box = useRef<HTMLDivElement>(null);
  const w = useWidth(box);
  const H = 12;
  const y = H / 2;
  const d = w ? wobble(w, y) : "";
  return (
    <div ref={box} aria-hidden className="h-3 w-full">
      {w ? (
        <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} className="block overflow-visible">
          <path d={d} fill="none" stroke="var(--hairline-hi)" strokeWidth={1.25} strokeLinecap="round" />
          {marks.slice(0, -1).map((m, i) => {
            const tick = `M${(1 + (w - 2) * m).toFixed(1)} ${y - 3.5}l0.4 7`;
            // A step's tick goes over in ink as the line reaches it.
            return (
              <g key={i} strokeWidth={1.25} strokeLinecap="round">
                <path d={tick} stroke="var(--hairline-hi)" />
                <path d={tick} stroke="var(--brand)" className="transition-opacity duration-450 ease-paper" style={{ opacity: m <= progress + 1e-6 ? 1 : 0 }} />
              </g>
            );
          })}
          <path
            d={d}
            fill="none"
            stroke="var(--brand)"
            strokeWidth={2}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            className="transition-[stroke-dashoffset] duration-450 ease-paper motion-reduce:transition-none"
            style={{ strokeDashoffset: 1 - progress, opacity: progress > 0 ? 1 : 0 }}
          />
        </svg>
      ) : null}
    </div>
  );
}

/** One test run's verdict, in the build's list: the helper, the test, and what Claude's judge said. */
function RunLine({ run, name }: { run: TestRun; name: string }) {
  const Icon = run.outcome === "pass" ? Check : run.outcome === "fail" ? X : CircleSlash;
  return (
    <li className="fade-up flex items-start gap-2">
      <Icon aria-hidden className={cn("mt-[3px] size-3.5 shrink-0", run.outcome === "pass" ? "text-ok" : run.outcome === "fail" ? "text-fix" : "text-faint")} />
      <p className="min-w-0 text-meta">
        <span className="font-medium text-foreground">{name}</span>
        <span className="text-muted-foreground"> · {run.name}{run.again ? " · again, with the fix" : ""}: </span>
        <span className={cn(run.outcome === "fail" ? "text-foreground" : "text-muted-foreground")}>{run.reason}</span>
      </p>
    </li>
  );
}

/** The calm line at the top of the sheet while it's being made real: the real step, how far, and each test run as it ends. */
export function BuildProgress({ showStop, ref }: { showStop: boolean; ref?: Ref<HTMLElement> }) {
  const ws = useSheet();
  const b = ws.build;
  const { stop, stopping } = useStopBuild();
  const n = Math.min(b.completed.length + 1, b.total);
  const replay = b.mode === "replay";
  const doing = b.status === "finishing" ? "Saving it as a new version" : b.status === "repair" ? "Waiting for you: pick a fix below" : (b.current?.title ?? (b.completed.length ? "Saving it" : "Getting started"));
  const lead = replay ? "Replaying how it was made" : "Making it real";
  const pct = Math.round(b.progress * 100);
  const marks = Array.from({ length: b.total }, (_, i) => (i + 1) / b.total);
  const agentName = (id: string) => ws.blueprint.agents.find((a) => a.id === id)?.name ?? "An AI helper";
  const testing = b.current?.id === "tests" || b.current?.id === "tests-again";
  const live = b.runs.slice(-6);

  return (
    <section ref={ref} tabIndex={-1} aria-label="Build progress" className="mt-7 scroll-mt-6 rounded-md border border-hairline bg-canvas/60 px-4 py-4 outline-none sm:px-5">
      {/* The words in pencil, the count in print. */}
      <p aria-live="polite" className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-pencil text-note text-foreground">
          {lead} · <span className="text-brand">{doing}</span>
        </span>
        <span className="text-meta tabular-nums text-muted-foreground">
          Step {n} of {b.total}
        </span>
      </p>
      <div role="progressbar" aria-label={lead} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="mt-2 w-full">
        <PencilLine progress={b.progress} marks={marks} />
      </div>
      {b.current?.detail && <p className="mt-2 text-meta text-muted-foreground">{b.current.detail}</p>}
      {live.length > 0 && (testing || b.status === "repair") && (
        <ul aria-label="Test runs so far" className="mt-3 space-y-1.5 border-t border-dashed border-hairline pt-3">
          {live.map((r) => (
            <RunLine key={`${r.agentId}/${r.rehearsalId}/${r.again ? 1 : 0}`} run={r} name={agentName(r.agentId)} />
          ))}
        </ul>
      )}
      <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
        {!replay && (
          <p className="inline-flex min-w-0 items-center gap-1.5 text-meta text-muted-foreground">
            <FlaskConical className="size-3.5 shrink-0" aria-hidden />
            <span>
              {b.tests === "claude"
                ? `Every step is real: the plan is checked, the code compiled, and Claude plays each test run (${PRICE.testRun} credits each).`
                : "Every step is real: the plan is checked and the code compiled."}
            </span>
          </p>
        )}
        {showStop && (
          <Button variant="ghost" className="ml-auto text-muted-foreground" disabled={stopping || b.status === "finishing"} onClick={stop}>
            <Undo2 aria-hidden /> {replay ? "End replay" : stopping ? "Stopping…" : "Stop"}
          </Button>
        )}
      </div>
      {!replay && b.charged ? (
        <p className="mt-2 text-meta tabular-nums text-muted-foreground">Test runs so far: {plural(b.charged, "credit")}.</p>
      ) : replay ? (
        <p className="mt-2 text-meta text-muted-foreground">A replay of the saved build: it runs nothing, costs nothing and changes nothing.</p>
      ) : null}
    </section>
  );
}
