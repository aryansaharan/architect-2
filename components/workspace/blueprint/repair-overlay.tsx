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
      initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
      animate={{ opacity: 1, backdropFilter: "blur(4px)" }}
      exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 z-20 flex items-center justify-center bg-canvas/70 p-3 sm:p-6"
    >
      <motion.section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="repair-title"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.18 } }}
        transition={{ type: "spring", stiffness: 300, damping: 26, delay: 0.05 }}
        className="panel-raised flex max-h-full w-full max-w-[720px] flex-col overflow-hidden rounded-2xl shadow-[0_0_0_1px_rgb(180_140_255/0.18),0_30px_90px_-20px_rgb(0_0_0/0.9),0_0_80px_-30px_rgb(180_140_255/0.45)]"
      >
        {/* On short or narrow screens the card is taller than the canvas: the body scrolls, the way out stays put. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex items-start gap-3 border-b border-hairline p-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-fix/30 bg-fix/10"><ShieldAlert className="size-4 text-fix" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="micro-label">Checked · rehearsal</p>
                <span className="rounded-full border border-fix/30 bg-fix/10 px-2 py-px text-[11px] font-medium text-fix"><Term k="our-fix" /> · free</span>
              </div>
              <h2 id="repair-title" className="mt-1 text-[17px] font-semibold leading-snug">{plan.title}</h2>
            </div>
            {agent && <Avatar name={agent.name} hue={agent.avatarHue} size={34} />}
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <p className="micro-label">What it tried</p>
              <p className="mt-1.5 text-[13px] leading-relaxed">{plan.tried}</p>
            </div>
            <div>
              <p className="micro-label">Why it matters</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{plan.whyFailed}</p>
            </div>
          </div>
          <div className="grid gap-3 px-5 max-sm:pb-4 sm:grid-cols-2">
            {plan.options.map((o, i) => {
              const chosen = ws.build.repairChoice === o.id;
              return (
                <motion.div
                  key={o.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 320, damping: 26, delay: 0.2 + i * 0.08 }}
                  className={cn("flex flex-col rounded-xl border p-4 transition-transform duration-300 hover:-translate-y-0.5", o.recommended ? "beam border-amber/40 bg-amber-soft" : "border-hairline bg-deep/60")}
                >
                  <div className="flex items-center gap-2">
                    <span className="grid size-5 place-items-center rounded font-mono text-[11px] uppercase text-muted-foreground ring-1 ring-hairline">{o.id}</span>
                    {o.recommended && <span className="text-[11px] font-medium text-amber">Recommended</span>}
                    <span className="ml-auto text-[11px] text-fix">Free</span>
                  </div>
                  <p className="mt-2 text-[13.5px] font-medium leading-snug">{o.label}</p>
                  <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-muted-foreground">{o.narration}</p>
                  <p className="mt-2 font-mono text-[11px] text-faint">
                    Changes {o.blastRadius.screens} screen{o.blastRadius.screens === 1 ? "" : "s"} · {o.blastRadius.agents} agent · {o.blastRadius.files} files
                  </p>
                  <Button
                    ref={i === 0 ? first : undefined}
                    size="sm"
                    variant={o.recommended ? "default" : "outline"}
                    className="mt-3 h-8"
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
          <p className="text-[12px] text-muted-foreground">Either way, it re-runs every rehearsal before you see the app.</p>
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
                toast.success("Build stopped. Nothing was charged", { description: "Your plan is exactly as you left it." });
                router.refresh();
              }}
            >
              {stopping ? <Loader2 className="animate-spin" /> : <Undo2 />} Stop and go back to the plan · refunded
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
