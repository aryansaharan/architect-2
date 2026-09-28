"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "../context";
import { DUR, EASE } from "@/lib/motion";

/** The moment a build lands: no fireworks, just a calm card floating on the plan that says it's real now. */
export function BuildComplete() {
  const ws = useWorkspace();
  const replay = ws.build.mode === "replay";
  const bp = ws.blueprint;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-5">
      <motion.section
        role="status"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0, transition: { duration: DUR.panel, ease: EASE, delay: 0.2 } }}
        exit={{ opacity: 0, y: 8, transition: { duration: DUR.hover, ease: EASE } }}
        className="panel-raised pointer-events-auto flex w-full max-w-[720px] flex-wrap items-center gap-x-5 gap-y-3 rounded-lg px-5 py-4"
      >
        <div className="min-w-0 flex-1">
          <p className="font-pencil text-section">{replay ? "That's how it was built." : "It's real."}</p>
          <p className="mt-1.5 text-ui text-muted-foreground">
            {replay
              ? "Replays are free. Nothing was changed."
              : `${bp.meta.name} is built and tested: ${bp.screens.length} screens and ${bp.agents.length} AI helper${bp.agents.length === 1 ? "" : "s"}. Saved as a new version you can always return to.`}
          </p>
        </div>
        {!replay && (
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="outline"><Link href={`/p/${ws.project.id}/ship`}>Publish</Link></Button>
            <Button asChild><Link href={`/p/${ws.project.id}/preview`}>Open it <ArrowRight /></Link></Button>
          </div>
        )}
        <Button variant="ghost" size="icon-sm" onClick={() => ws.build.dismiss()} aria-label="Dismiss" className="-mr-2 -mt-1 self-start text-muted-foreground"><X /></Button>
      </motion.section>
    </div>
  );
}
