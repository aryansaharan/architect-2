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
import { Term } from "@/components/arch/term";
import { SimulatedChip } from "./build-console";

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
      transition={{ duration: 0.25 }}
      className="absolute inset-0 z-20 flex items-center justify-center bg-canvas/85 p-3 sm:p-6"
    >
      <motion.section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="repair-title"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6, transition: { duration: 0.15 } }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
        className="sketch flex max-h-full w-full max-w-[720px] flex-col overflow-hidden bg-raised shadow-[0_16px_40px_-20px_rgb(26_26_23/0.35)]"
      >
        {/* On short or narrow screens the card is taller than the canvas: the body scrolls, the way out stays put. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex items-start gap-3 border-b border-hairline p-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-md border border-fix/30 bg-fix/10"><ShieldAlert className="size-4 text-fix" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[12px] text-muted-foreground">Caught in a <Term k="rehearsal">practice run</Term></p>
                <span className="rounded-full border border-fix/30 bg-fix/10 px-2 py-px text-[11px] font-medium text-fix"><Term k="our-fix" /> · free</span>
                <SimulatedChip />
              </div>
              <h2 id="repair-title" className="mt-1 font-pencil text-[28px] leading-tight">{plan.title}</h2>
            </div>
            {agent && <Avatar name={agent.name} hue={agent.avatarHue} size={34} />}
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <p className="text-[12px] font-medium text-muted-foreground">What it tried</p>
              <p className="mt-1.5 text-[13px] leading-relaxed">{plan.tried}</p>
            </div>
            <div>
              <p className="text-[12px] font-medium text-muted-foreground">Why it matters</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{plan.whyFailed}</p>
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
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: 0.15 + i * 0.06 }}
                  className={cn("flex flex-col rounded-md border p-4", o.recommended ? "border-brand/50 bg-brand-soft" : "border-hairline bg-panel")}
                >
                  <div className="flex items-center gap-2">
                    <span className="grid size-5 place-items-center rounded font-sketch text-[12px] uppercase text-muted-foreground ring-1 ring-hairline-hi">{o.id}</span>
                    {o.recommended && <span className="text-[11px] font-medium text-brand">Recommended</span>}
                    <span className="ml-auto text-[11px] text-fix">Free</span>
                  </div>
                  <p className="mt-2 text-[13.5px] font-medium leading-snug">{o.label}</p>
                  <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-muted-foreground">{o.narration}</p>
                  <p className="mt-2 text-[11.5px] text-muted-foreground">
                    Changes: {plural(o.blastRadius.screens, "screen")} · {plural(o.blastRadius.agents, "agent")} · {plural(o.blastRadius.files, "file")}
                  </p>
                  <Button
                    ref={i === 0 ? first : undefined}
                    size="sm"
                    variant={o.recommended ? "default" : "outline"}
                    className={cn("mt-3 h-8", !o.recommended && "bg-panel")}
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
          <p className="text-[12px] text-muted-foreground">Either way, it re-runs every practice conversation before you see the app.</p>
          {ws.build.mode === "build" ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground"
              disabled={stopping || Boolean(ws.build.repairChoice)}
              onClick={async () => {
                setStopping(true);
                const r = await cancelBuild(ws.project.id);
                setStopping(false);
                if (!r.ok) return toast.error(r.error);
                ws.build.dismiss();
                toast.success("Build stopped. Nothing was charged", { description: "The estimated price went back on your demo balance. Your plan is exactly as you left it." });
                router.refresh();
              }}
            >
              {stopping ? <Loader2 className="animate-spin" /> : <Undo2 />} Stop and go back to the plan · estimate refunded
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => ws.build.dismiss()}>
              End replay
            </Button>
          )}
        </div>
      </motion.section>
    </motion.div>
  );
}
