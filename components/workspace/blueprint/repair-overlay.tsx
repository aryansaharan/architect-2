"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, ShieldAlert, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/arch/badges";
import { cancelBuild } from "@/lib/actions/build";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";
import { stoppedWords } from "../use-build-runner";
import { Term } from "@/components/arch/term";
import { SimulatedChip } from "./build-console";
import { Pill } from "@/components/ui/pill";
import { DUR, EASE } from "@/lib/motion";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function RepairOverlay() {
  const ws = useWorkspace();
  const router = useRouter();
  const plan = ws.build.repair;
  const [stopping, setStopping] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Don't scroll the card to the button on small screens: the title and what went wrong come first.
    first.current?.focus({ preventScroll: true });
  }, []);
  if (!plan) return null;
  const agent = ws.blueprint.agents.find((a) => a.id === plan.objectRef.id);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DUR.panel, ease: EASE }}
      className="absolute inset-0 z-20 flex items-center justify-center bg-canvas/85 p-3 sm:p-6"
    >
      <motion.section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="repair-title"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6, transition: { duration: DUR.hover, ease: EASE } }}
        transition={{ duration: DUR.panel, ease: EASE, delay: 0.05 }}
        className="sketch flex max-h-full w-full max-w-[720px] flex-col overflow-hidden bg-raised"
      >
        {/* On short or narrow screens the card is taller than the canvas: the body scrolls, the way out stays put. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex items-start gap-3 border-b border-hairline p-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-md border border-fix/30 bg-fix/10"><ShieldAlert className="size-4 text-fix" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-meta text-muted-foreground">Caught in a <Term k="rehearsal">test run</Term></p>
                <Pill tone="fix"><Term k="our-fix" /> · free</Pill>
                <SimulatedChip />
              </div>
              <h2 id="repair-title" className="mt-1.5 font-pencil text-section">{plan.title}</h2>
            </div>
            {agent && <Avatar name={agent.name} hue={agent.avatarHue} size={34} />}
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <p className="text-meta font-medium text-muted-foreground">What it tried</p>
              <p className="mt-1.5 text-body">{plan.tried}</p>
            </div>
            <div>
              <p className="text-meta font-medium text-muted-foreground">Why it matters</p>
              <p className="mt-1.5 text-body text-muted-foreground">{plan.whyFailed}</p>
            </div>
          </div>
          <div className="grid gap-3 px-5 max-sm:pb-4 sm:grid-cols-2">
            {plan.options.map((o, i) => {
              const chosen = ws.build.repairChoice === o.id;
              return (
                <motion.div
                  key={o.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: DUR.panel, ease: EASE, delay: 0.15 + i * 0.06 }}
                  // Fix options are proposals, so they are sketches: the recommended one in a firmer line.
                  className={cn("flex flex-col bg-panel p-4", o.recommended ? "sketch" : "sketch-soft")}
                >
                  <div className="flex items-center gap-2">
                    <span className="grid size-5 place-items-center rounded-sm font-sketch text-sketch uppercase text-muted-foreground ring-1 ring-hairline-hi">{o.id}</span>
                    {o.recommended && <Pill tone="brand">Recommended</Pill>}
                    <span className="ml-auto text-meta text-fix">Free</span>
                  </div>
                  <p className="mt-2 text-body font-medium">{o.label}</p>
                  <p className="mt-1 flex-1 text-ui text-muted-foreground">{o.narration}</p>
                  <p className="mt-2 text-meta text-muted-foreground">
                    Changes: {plural(o.blastRadius.screens, "screen")} · {plural(o.blastRadius.agents, "AI helper")} · {plural(o.blastRadius.files, "file")}
                  </p>
                  <Button
                    ref={i === 0 ? first : undefined}
                    variant={o.recommended ? "default" : "outline"}
                    className="mt-3"
                    disabled={Boolean(ws.build.repairChoice)}
                    onClick={() => ws.build.choose(o.id)}
                  >
                    {chosen ? <Loader2 className="animate-spin" /> : <Check />} Use this fix
                  </Button>
                </motion.div>
              );
            })}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 p-5 pt-4 max-sm:border-t max-sm:border-hairline max-sm:pt-3">
          <p className="text-meta text-muted-foreground">Either way, it re-runs every test run before you see the app.</p>
          {ws.build.mode === "build" ? (
            <Button
              variant="ghost"
              className="text-muted-foreground"
              disabled={stopping || Boolean(ws.build.repairChoice)}
              onClick={async () => {
                setStopping(true);
                const r = await cancelBuild(ws.project.id);
                setStopping(false);
                if (!r.ok) return toast.error(r.error);
                ws.build.dismiss();
                toast.success("Build stopped", { description: stoppedWords(r.refunded, "Your plan is exactly as you left it.") });
                router.refresh();
              }}
            >
              {stopping ? <Loader2 className="animate-spin" /> : <Undo2 />} Stop and go back to the plan{ws.build.charged ? " · refunded" : ""}
            </Button>
          ) : (
            <Button variant="ghost" className="text-muted-foreground" onClick={() => ws.build.dismiss()}>
              End replay
            </Button>
          )}
        </div>
      </motion.section>
    </motion.div>
  );
}
