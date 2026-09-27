"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "../context";

/** The moment a build lands: no fireworks, just a calm note on the plan that it's real now. */
export function BuildComplete() {
  const ws = useWorkspace();
  const replay = ws.build.mode === "replay";
  const bp = ws.blueprint;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-5">
      <motion.section
        role="status"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.2 } }}
        exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
        className="sticky-note pointer-events-auto flex w-full max-w-[720px] flex-wrap items-center gap-x-5 gap-y-3 rounded-sm px-5 py-4"
      >
        <div className="min-w-0 flex-1">
          <p className="font-pencil text-[34px] leading-none">{replay ? "That's how it was built." : "It's real."}</p>
          <p className="mt-1.5 text-[12.5px] text-foreground/75">
            {replay
              ? "Replays are free. Nothing was changed."
              : `${bp.meta.name} is built and rehearsed: ${bp.screens.length} screens and ${bp.agents.length} AI helper${bp.agents.length === 1 ? "" : "s"}. Saved as a save point you can always return to.`}
          </p>
        </div>
        {!replay && (
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild size="sm" variant="outline" className="h-8 bg-panel"><Link href={`/p/${ws.project.id}/ship`}>Publish</Link></Button>
            <Button asChild size="sm" className="h-8"><Link href={`/p/${ws.project.id}/preview`}>Open it <ArrowRight /></Link></Button>
          </div>
        )}
        <button onClick={() => ws.build.dismiss()} aria-label="Dismiss" className="-mr-1 self-start text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
      </motion.section>
    </div>
  );
}
