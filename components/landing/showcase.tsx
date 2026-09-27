"use client";
import { useRef } from "react";
import Image from "next/image";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { Check, Lock, ShieldAlert, Sparkles } from "lucide-react";

/** The studio in a frame that tilts upright as you scroll, with real product moments floating at different depths. */
export function Showcase() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.4 });
  const rotateX = useTransform(p, [0, 1], [22, 0]);
  const scale = useTransform(p, [0, 1], [0.86, 1]);
  const y = useTransform(p, [0, 1], [60, 0]);
  const glow = useTransform(p, [0, 1], [0.15, 0.6]);
  const floatA = useTransform(p, [0, 1], [90, 0]);
  const floatB = useTransform(p, [0, 1], [140, 0]);
  const floatC = useTransform(p, [0, 1], [60, 0]);
  const fade = useTransform(p, [0.35, 1], [0, 1]);

  return (
    <div ref={ref} className="relative mx-auto max-w-6xl px-6 [perspective:1600px]">
      <motion.div aria-hidden style={{ opacity: glow }} className="absolute inset-x-16 top-24 -z-10 h-[70%] rounded-[40px] bg-[radial-gradient(ellipse_at_center,rgb(223_255_79/0.35),transparent_65%)] blur-3xl" />
      <motion.div style={{ rotateX, scale, y, transformOrigin: "50% 0%" }} className="relative overflow-hidden rounded-2xl border border-hairline-hi bg-panel shadow-[0_40px_120px_-20px_rgb(0_0_0/0.8),0_0_0_1px_rgb(255_255_255/0.03)]">
        <div className="flex items-center gap-2 border-b border-hairline bg-deep px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]/80" />
          <span className="size-2.5 rounded-full bg-[#febc2e]/80" />
          <span className="size-2.5 rounded-full bg-[#28c840]/80" />
          <span className="mx-auto rounded-md bg-raised px-3 py-0.5 font-mono text-[11px] text-muted-foreground">prod-ai-studio.vercel.app/p/claims-triage-desk/blueprint</span>
        </div>
        <Image src="/showcase/studio.png" alt="The Prod AI studio: a blueprint canvas with screens, agents, data and connections, and an inspector showing the Settlement agent's permissions" width={1440} height={900} className="block h-auto w-full" priority={false} />
      </motion.div>

      <motion.div style={{ y: floatA, opacity: fade }} className="absolute -left-2 top-[18%] hidden w-[300px] lg:block">
        <div className="panel-raised rounded-xl p-3.5 shadow-2xl">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-fix" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Checked · rehearsal</span>
            <span className="ml-auto rounded-full border border-fix/30 bg-fix/10 px-2 py-px text-[10.5px] text-fix">Our fix · free</span>
          </div>
          <p className="mt-2 text-[13px] font-medium leading-snug">Caught Settlement trying to issue a payment without asking</p>
        </div>
      </motion.div>

      <motion.div style={{ y: floatB, opacity: fade }} className="absolute -right-3 bottom-[12%] hidden w-[320px] lg:block">
        <div className="rounded-xl border border-ask/35 bg-[#1a1216] p-3.5 shadow-2xl">
          <p className="flex items-center gap-2 text-[13px] font-semibold"><Lock className="size-3.5 text-ask" />Settlement wants to issue a payment</p>
          <p className="mt-1 text-[12px] text-muted-foreground">$1,640 to Grace Liu · ACH · CLM-20935</p>
          <div className="mt-2.5 flex gap-2 text-[12px]">
            <span className="inline-flex h-7 items-center gap-1 rounded-md bg-amber px-2.5 font-medium text-primary-foreground"><Check className="size-3.5" />Allow once</span>
            <span className="inline-flex h-7 items-center rounded-md border border-hairline px-2.5 text-muted-foreground">Deny</span>
          </div>
        </div>
      </motion.div>

      <motion.div style={{ y: floatC, opacity: fade }} className="absolute -right-6 top-[10%] hidden xl:block">
        <div className="panel-raised flex items-center gap-2.5 rounded-full px-3.5 py-2 shadow-2xl">
          <Sparkles className="size-3.5 text-amber" />
          <span className="text-[12.5px]">Work Order · Add an SLA risk column</span>
          <span className="rounded-full bg-amber px-2 py-px text-[11px] font-semibold text-primary-foreground">5 cr</span>
        </div>
      </motion.div>
    </div>
  );
}
