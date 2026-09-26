"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Check, Rocket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "../context";

/** The moment a build lands: a sweep of light across the canvas, then a quiet "it's ready". */
export function BuildComplete() {
  const ws = useWorkspace();
  const replay = ws.build.mode === "replay";
  const bp = ws.blueprint;
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 top-[52px] z-[6] overflow-hidden">
        <motion.div
          initial={{ x: "-60%", opacity: 0 }}
          animate={{ x: "160%", opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.6, ease: [0.45, 0, 0.2, 1] }}
          className="absolute inset-y-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgb(255_199_107/0.10),rgb(255_199_107/0.22),rgb(255_199_107/0.10),transparent)] blur-md"
        />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-5">
        <motion.section
          role="status"
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 24, delay: 0.5 } }}
          exit={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}
          className="panel-raised pointer-events-auto flex w-full max-w-[760px] items-center gap-4 rounded-2xl p-4 shadow-[0_0_0_1px_rgb(61_214_140/0.25),0_20px_60px_-12px_rgb(0_0_0/0.8),0_0_60px_-20px_rgb(61_214_140/0.5)]"
        >
          <motion.span
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0, transition: { type: "spring", stiffness: 420, damping: 16, delay: 0.75 } }}
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-read/15 text-read ring-1 ring-read/30"
          >
            <Check className="size-5" strokeWidth={2.5} />
          </motion.span>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-semibold">{replay ? "That's how it was built." : `${bp.meta.name} is built and rehearsed.`}</p>
            <p className="text-[12.5px] text-muted-foreground">
              {replay ? "Replays are free. Nothing was changed." : `${bp.screens.length} screens, ${bp.agents.length} agents on duty. Saved as a save point you can always return to.`}
            </p>
          </div>
          {!replay && (
            <div className="flex shrink-0 items-center gap-2">
              <Button asChild size="sm" variant="outline" className="h-8"><Link href={`/p/${ws.project.id}/ship`}><Rocket /> Go live</Link></Button>
              <Button asChild size="sm" className="sheen h-8"><Link href={`/p/${ws.project.id}/preview`}>Open preview <ArrowRight /></Link></Button>
            </div>
          )}
          <button onClick={() => ws.build.dismiss()} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </motion.section>
      </div>
    </>
  );
}
