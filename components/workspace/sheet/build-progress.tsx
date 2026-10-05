"use client";
import { useMemo, useRef, useState, type Ref } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FastForward, FlaskConical, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelBuild } from "@/lib/actions/build";
import { stoppedWords } from "../use-build-runner";
import { PencilRadio } from "./pencil-radio";
import { stepLine, useSheet, useWidth } from "./use-sheet";

/** The one honest line about the build, said where it happens: the steps are a visual, the result is not. */
export const SIMULATED_LINE = "This building step is a visual; the plan, code and data are real.";

/** Holds the playback still while a stop is on its way, so the build can't finish under it. */
const HOLD = 1e-4; // a 2 s step now takes hours; small enough to stay inside setTimeout's range

/**
 * Stops the build: cancelBuild (which refunds a build charged under the earlier pricing), then the
 * runner is dismissed. A replay just ends.
 */
export function useStopBuild() {
  const ws = useSheet();
  const router = useRouter();
  const [stopping, setStopping] = useState(false);
  const stop = async () => {
    if (ws.build.mode === "replay") return ws.build.dismiss();
    setStopping(true);
    const speed = ws.build.speed;
    if (ws.build.status === "running") ws.build.setSpeed(HOLD);
    const r = await cancelBuild(ws.project.id).catch(() => ({ ok: false as const, error: "Couldn't reach Prod AI. Try again." }));
    setStopping(false);
    if (!r.ok) {
      ws.build.setSpeed(speed);
      return void toast.error(r.error);
    }
    ws.build.dismiss();
    toast.success("Stopped", { description: stoppedWords(r.refunded, "Your sketch is exactly as you left it.") });
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

/** The calm line at the top of the sheet while it's being made real. */
export function BuildProgress({ showStop, ref }: { showStop: boolean; ref?: Ref<HTMLElement> }) {
  const ws = useSheet();
  const b = ws.build;
  const { stop, stopping } = useStopBuild();
  const total = b.steps.filter((s) => s.kind === "step").length;
  const n = Math.min(b.completed.length + 1, Math.max(total, 1));
  const replay = b.mode === "replay";
  const cur = b.current?.kind === "step" ? b.current : null;
  const doing =
    b.status === "finishing" ? "Saving it as a new version" : b.status === "repair" ? "Waiting for you: pick a fix below" : cur ? stepLine(ws, cur) : "Getting started";
  const lead = replay ? "Replaying how it was made" : "Making it real";
  const pct = Math.round(b.progress * 100);
  // Where each step ends along the line, by how long it takes: the same measure as the progress.
  const marks = useMemo(() => {
    const steps = b.steps.flatMap((st) => (st.kind === "step" ? [st.durationMs] : []));
    const all = steps.reduce((t, d) => t + d, 0) || 1;
    return steps.map((_, i) => steps.slice(0, i + 1).reduce((t, d) => t + d, 0) / all);
  }, [b.steps]);

  return (
    <section ref={ref} tabIndex={-1} aria-label="Build progress" className="mt-7 scroll-mt-6 rounded-md border border-hairline bg-canvas/60 px-4 py-4 outline-none sm:px-5">
      {/* The words in pencil, the count in print. */}
      <p aria-live="polite" className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-pencil text-note text-foreground">
          {lead} · <span className="text-brand">{doing}</span>
        </span>
        <span className="text-meta tabular-nums text-muted-foreground">
          Step {n} of {total}
        </span>
      </p>
      <div role="progressbar" aria-label={lead} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="mt-2 w-full">
        <PencilLine progress={b.progress} marks={marks} />
      </div>
      <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
        {/* Said once, here where the build happens. A replay says what it is below. */}
        {!replay && (
          <p className="inline-flex min-w-0 items-center gap-1.5 text-meta text-muted-foreground">
            <FlaskConical className="size-3.5 shrink-0" aria-hidden />
            <span>{SIMULATED_LINE}</span>
          </p>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-meta text-muted-foreground max-sm:sr-only">Speed</span>
          {/* The build is a scripted playback over the real plan, so this sets playback speed, not a faster build. */}
          <PencilRadio<string>
            label="Playback speed"
            value={String(b.speed >= 50 ? 50 : b.speed >= 4 ? 4 : 1)}
            onChange={(v) => b.setSpeed(Number(v))}
            options={[
              { value: "1", label: "Normal" },
              { value: "4", label: "Fast" },
              { value: "50", label: <><FastForward className="size-3" aria-hidden />Skip to end</>, title: "Plays the rest in a moment. It still stops if you need to pick a fix." },
            ]}
          />
          {showStop && (
            <Button variant="ghost" className="text-muted-foreground" disabled={stopping || b.status === "finishing"} onClick={stop}>
              <Undo2 aria-hidden /> {replay ? "End replay" : stopping ? "Stopping…" : b.charged ? "Stop · refunded" : "Stop"}
            </Button>
          )}
        </div>
      </div>
      {!replay && b.charged ? (
        <p className="mt-2 text-meta tabular-nums text-muted-foreground">
          This build took {b.charged} credits under the earlier pricing. Stop and they come back.
        </p>
      ) : replay ? (
        <p className="mt-2 text-meta text-muted-foreground">Replays are free and change nothing.</p>
      ) : null}
    </section>
  );
}
