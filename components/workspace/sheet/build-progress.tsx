"use client";
import { useState, type Ref } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FastForward, FlaskConical, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelBuild } from "@/lib/actions/build";
import { creditsUsd } from "@/lib/format";
import { PencilRadio } from "./pencil-radio";
import { stepLine, useSheet } from "./use-sheet";

/** The one honest line about the build, said where it happens: the steps are a visual, the result is not. */
export const SIMULATED_LINE = "This building step is a visual; the plan, code and data are real.";

/** Holds the playback still while a stop is on its way, so the build can't finish under it. */
const HOLD = 1e-4; // a 2 s step now takes hours; small enough to stay inside setTimeout's range

/**
 * Stops the build and refunds it: cancelBuild, then the runner is dismissed. A replay just
 * ends: nothing was charged.
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
    toast.success("Stopped. Nothing was charged", { description: "The credits went back on your demo balance. Your sketch is exactly as you left it." });
    router.refresh();
  };
  return { stop, stopping };
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
      <div role="progressbar" aria-label={lead} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="relative mt-3 h-[3px] w-full">
        <div aria-hidden className="absolute inset-0 bg-[repeating-linear-gradient(90deg,var(--hairline-hi)_0_7px,transparent_7px_11px)]" />
        <div aria-hidden className="absolute inset-y-0 left-0 rounded-full bg-brand transition-[width] duration-250 ease-paper motion-reduce:transition-none" style={{ width: `${pct}%` }} />
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
              <Undo2 aria-hidden /> {replay ? "End replay" : stopping ? "Stopping…" : "Stop · refunded"}
            </Button>
          )}
        </div>
      </div>
      {!replay && b.charged ? (
        <p className="mt-2 text-meta tabular-nums text-muted-foreground">
          {b.charged} credits (≈ {creditsUsd(b.charged)}) came off your demo balance for this. Stop and they come back.
        </p>
      ) : replay ? (
        <p className="mt-2 text-meta text-muted-foreground">Replays are free and change nothing.</p>
      ) : null}
    </section>
  );
}
