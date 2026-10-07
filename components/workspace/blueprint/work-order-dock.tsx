"use client";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Clock, Coins, FileCode2, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildTimeLabel } from "@/lib/blueprint/estimate";
import { plannedRuns } from "@/lib/build/report";
import { PRICE } from "@/lib/prices";
import { useWorkspace } from "../context";
import { DUR, EASE } from "@/lib/motion";

/** The build, before it runs, on the plan map: how long, what it touches, and that making it real is free. */
export function WorkOrderDock() {
  const ws = useWorkspace();
  const bp = ws.blueprint;
  const est = bp.estimate;
  const [starting, setStarting] = useState(false);
  const gates = bp.agents.flatMap((a) => a.tools).filter((t) => t.permission === "ask").length;
  const missing = bp.connections.filter((c) => c.status === "missing");
  // How long the real build takes: seconds for the checks and compiling, plus the test runs Claude plays.
  const runs = plannedRuns(bp.agents).length;
  const time = useMemo(() => buildTimeLabel(runs), [runs]);

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
            <p className="font-sketch text-sketch text-muted-foreground">Nothing has run yet</p>
            <p className="mt-1 font-pencil text-section">Build {bp.meta.name}</p>
          </div>
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-ui">
            <div className="flex items-center gap-1.5"><Clock className="size-3.5 shrink-0 text-muted-foreground" /><dt className="sr-only">Time</dt><dd>{time.real} <span className="text-muted-foreground">· {time.here}</span></dd></div>
            <div className="flex items-center gap-1.5"><Coins className="size-3.5 shrink-0 text-muted-foreground" /><dt className="sr-only">Price</dt><dd>{runs ? `Free, plus ${runs * PRICE.testRun} credits for the test runs` : "Free"}</dd></div>
            <div className="flex items-center gap-1.5"><FileCode2 className="size-3.5 text-muted-foreground" /><dt className="sr-only">Files</dt><dd>{est.files} files</dd></div>
            <div className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-brand" /><dt className="sr-only">Approval gates</dt><dd>{gates} action{gates === 1 ? "" : "s"} will ask you first</dd></div>
          </dl>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="lg" onClick={() => ws.focusComposer(null)} title="Type the change in the box below">Change the plan</Button>
            <Button
              size="lg"
              disabled={starting}
              onClick={async () => {
                setStarting(true);
                await ws.build.start({ tests: true });
                setStarting(false);
              }}
            >
              {starting ? <Loader2 className="animate-spin" /> : null} Make it real <ArrowRight />
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-dashed border-hairline-hi pt-3 text-meta text-muted-foreground">
          <span>Stop at any time. If the build hits a problem that&apos;s our fault, fixing it is free.</span>
          {missing.length > 0 && (
            <span className="inline-flex items-center gap-1 text-foreground/80"><KeyRound className="size-3" />{missing.map((c) => c.name).join(", ")} will use test data until you add a key</span>
          )}
          <span>Confidence: {est.confidence}</span>
        </div>
      </motion.section>
    </div>
  );
}
