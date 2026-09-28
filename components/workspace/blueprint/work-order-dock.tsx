"use client";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, ChevronDown, Clock, Coins, FileCode2, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { creditsUsd } from "@/lib/format";
import { buildTimeLabel } from "@/lib/blueprint/estimate";
import { buildTimeline, totalDuration } from "@/lib/sim/buildTimeline";
import { useWorkspace } from "../context";
import { Term } from "@/components/arch/term";
import { DUR, EASE } from "@/lib/motion";

export function WorkOrderDock() {
  const ws = useWorkspace();
  const bp = ws.blueprint;
  const est = bp.estimate;
  const [starting, setStarting] = useState(false);
  const gates = bp.agents.flatMap((a) => a.tools).filter((t) => t.permission === "ask").length;
  const missing = bp.connections.filter((c) => c.status === "missing");
  const remaining = Math.max(0, ws.usage.cap - ws.usage.credits);
  const over = est.credits > remaining;
  // Production estimate and this demo's simulated playback, each labelled, so the quote never promises a time it doesn't keep.
  const time = useMemo(() => buildTimeLabel(est.minutes, totalDuration(buildTimeline(bp))), [bp, est.minutes]);

  return (
    // Floats at the bottom of its container; the plan map places it in flow, in its own row under the plan.
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-3 pb-3 pt-5 sm:px-5">
      <motion.section
        aria-label="Work Order"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0, transition: { duration: DUR.panel, ease: EASE, delay: 0.4 } }}
        exit={{ opacity: 0, y: 8, transition: { duration: DUR.hover, ease: EASE } }}
        className="sketch pointer-events-auto w-full max-w-[860px] bg-raised p-4"
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="font-sketch text-sketch text-muted-foreground">The <Term k="work-order">price</Term> first · nothing has run yet</p>
            <p className="mt-1 font-pencil text-section">Build {bp.meta.name}</p>
          </div>
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-ui">
            <div className="flex items-center gap-1.5"><Clock className="size-3.5 shrink-0 text-muted-foreground" /><dt className="sr-only">Time</dt><dd>{time.real} <span className="text-muted-foreground">· {time.here}</span></dd></div>
            <div className="flex items-center gap-1.5">
              <Coins className="size-3.5 text-muted-foreground" />
              <dt className="sr-only">Price</dt>
              <dd>
                <Popover>
                  <PopoverTrigger className="inline-flex items-center gap-1 tabular-nums underline decoration-dotted underline-offset-4">
                    {est.credits} credits ≈ {creditsUsd(est.credits)} <ChevronDown className="size-3" />
                  </PopoverTrigger>
                  <PopoverContent className="w-72" align="center">
                    <p className="text-meta font-medium text-muted-foreground">Where the price comes from</p>
                    <ul className="mt-2 space-y-1.5 text-ui">
                      {est.breakdown.map((b) => (
                        <li key={b.label} className="flex justify-between gap-3"><span className="text-muted-foreground">{b.label}</span><span className="tabular-nums">{b.credits} credits</span></li>
                      ))}
                    </ul>
                    <p className="mt-3 border-t border-hairline pt-2 text-meta text-muted-foreground">If the build hits a problem that&apos;s our fault, fixing it is free. If you stop the build, you&apos;re refunded.</p>
                  </PopoverContent>
                </Popover>
              </dd>
            </div>
            <div className="flex items-center gap-1.5"><FileCode2 className="size-3.5 text-muted-foreground" /><dt className="sr-only">Files</dt><dd>{est.files} files</dd></div>
            <div className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-brand" /><dt className="sr-only">Approval gates</dt><dd>{gates} action{gates === 1 ? "" : "s"} will ask you first</dd></div>
          </dl>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="lg" onClick={() => ws.focusComposer(null)} title="Type the change in the box below">Change the plan</Button>
            <Button
              size="lg"
              disabled={starting || over}
              onClick={async () => {
                setStarting(true);
                await ws.build.start();
                setStarting(false);
              }}
            >
              {starting ? <Loader2 className="animate-spin" /> : null} Make it real <ArrowRight />
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-dashed border-hairline-hi pt-3 text-meta text-muted-foreground">
          <span className="tabular-nums">Your cap: {ws.usage.cap} credits · {Math.round(remaining)} left this month</span>
          {missing.length > 0 && (
            <span className="inline-flex items-center gap-1 text-foreground/80"><KeyRound className="size-3" />{missing.map((c) => c.name).join(", ")} will use test data until you add a key</span>
          )}
          <span>Confidence: {est.confidence}</span>
          {over && <span className="font-medium text-foreground">This would go past your cap. Raise it in Settings first.</span>}
        </div>
      </motion.section>
    </div>
  );
}
