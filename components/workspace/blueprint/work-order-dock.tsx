"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, ChevronDown, Clock, Coins, FileCode2, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { creditsUsd } from "@/lib/format";
import { useWorkspace } from "../context";
import { Term } from "@/components/arch/term";

export function WorkOrderDock() {
  const ws = useWorkspace();
  const bp = ws.blueprint;
  const est = bp.estimate;
  const [starting, setStarting] = useState(false);
  const gates = bp.agents.flatMap((a) => a.tools).filter((t) => t.permission === "ask").length;
  const missing = bp.connections.filter((c) => c.status === "missing");
  const remaining = Math.max(0, ws.usage.cap - ws.usage.credits);
  const over = est.credits > remaining;

  return (
    // Sits just above the composer dock, the same width, so the quote and the prompt read as one stack.
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-3 pb-3 pt-5 sm:px-5">
      <motion.section
        aria-label="Work Order"
        data-tour-avoid="hard"
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 240, damping: 24, delay: 0.55 } }}
        exit={{ opacity: 0, y: 30, scale: 0.98, transition: { duration: 0.2 } }}
        className="beam panel-raised pointer-events-auto w-full max-w-[860px] rounded-2xl p-4 shadow-[0_24px_70px_-16px_rgb(0_0_0/0.85),0_0_60px_-24px_rgb(223_255_79/0.45)]"
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="micro-label text-amber"><Term k="work-order" /> · nothing has run yet</p>
            <p className="mt-1 text-[15px] font-semibold">Build {bp.meta.name}</p>
          </div>
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px]">
            <div className="flex items-center gap-1.5"><Clock className="size-3.5 text-muted-foreground" /><dt className="sr-only">Time</dt><dd>~{est.minutes} min</dd></div>
            <div className="flex items-center gap-1.5">
              <Coins className="size-3.5 text-muted-foreground" />
              <dt className="sr-only">Price</dt>
              <dd>
                <Popover>
                  <PopoverTrigger className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-4">
                    {est.credits} credits ≈ {creditsUsd(est.credits)} <ChevronDown className="size-3" />
                  </PopoverTrigger>
                  <PopoverContent className="w-72" align="center">
                    <p className="micro-label">Where the price comes from</p>
                    <ul className="mt-2 space-y-1.5 text-[12.5px]">
                      {est.breakdown.map((b) => (
                        <li key={b.label} className="flex justify-between"><span className="text-muted-foreground">{b.label}</span><span className="font-mono">{b.credits} cr</span></li>
                      ))}
                    </ul>
                    <p className="mt-3 border-t border-hairline pt-2 text-[11.5px] text-muted-foreground">If the build hits a problem that&apos;s our fault, fixing it is free. If you stop the build, you&apos;re refunded.</p>
                  </PopoverContent>
                </Popover>
              </dd>
            </div>
            <div className="flex items-center gap-1.5"><FileCode2 className="size-3.5 text-muted-foreground" /><dt className="sr-only">Files</dt><dd>{est.files} files</dd></div>
            <div className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-ask" /><dt className="sr-only">Approval gates</dt><dd>{gates} action{gates === 1 ? "" : "s"} will ask you first</dd></div>
          </dl>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-9" onClick={() => ws.focusComposer(null)} title="Type the change in the box below">Change the plan</Button>
            <Button
              size="lg"
              className="btn-solstice sheen h-9 px-4"
              disabled={starting || over}
              onClick={async () => {
                setStarting(true);
                await ws.build.start();
                setStarting(false);
              }}
            >
              {starting ? <Loader2 className="animate-spin" /> : null} Build it <ArrowRight />
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline pt-3 text-[12px] text-muted-foreground">
          <span>Your cap: {ws.usage.cap} credits · {Math.round(remaining)} left this month</span>
          {missing.length > 0 && (
            <span className="inline-flex items-center gap-1 text-amber"><KeyRound className="size-3" />{missing.map((c) => c.name).join(", ")} will use test data until you add a key</span>
          )}
          <span>Confidence: {est.confidence}</span>
          {over && <span className="text-ask">This would pass your cap. Raise it in Settings first.</span>}
        </div>
      </motion.section>
    </div>
  );
}
