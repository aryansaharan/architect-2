"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Blocks, Bot, Clock, Coins, Database, Plug, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type HeroExample = {
  label: string;
  prompt: string;
  screens: string[];
  agents: { name: string; gated: number }[];
  data: string[];
  connections: string[];
  minutes: number;
  credits: number;
};

/** Typing prompt that turns into a plan: the thesis shown, not told. */
export function HeroDemo({ examples }: { examples: HeroExample[] }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState(0);
  const [custom, setCustom] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const ex = examples[i];
  const full = ex.prompt;
  const doneTyping = typed >= full.length;

  useEffect(() => {
    if (custom !== null) return;
    if (!doneTyping) {
      const t = setTimeout(() => setTyped((n) => Math.min(full.length, n + 2 + Math.floor(Math.random() * 3))), 22);
      return () => clearTimeout(t);
    }
    if (paused) return; // hovering holds the finished plan on screen; it never freezes mid-sentence
    const t = setTimeout(() => {
      setI((x) => (x + 1) % examples.length);
      setTyped(0);
    }, 5200);
    return () => clearTimeout(t);
  }, [typed, doneTyping, full.length, custom, paused, examples.length]);

  const progress = custom !== null ? 1 : typed / full.length;
  // reveal plan nodes as the sentence completes
  const reveal = (n: number, start: number) => Math.max(0, Math.min(n, Math.floor(((progress - start) / (1 - start)) * n * 1.3)));
  const cols = useMemo(
    () => [
      { title: "Screens", icon: Blocks, items: ex.screens.slice(0, reveal(ex.screens.length, 0.45)) },
      { title: "Agents", icon: Bot, items: ex.agents.slice(0, reveal(ex.agents.length, 0.3)).map((a) => a.name) },
      { title: "Data", icon: Database, items: ex.data.slice(0, reveal(ex.data.length, 0.2)) },
      { title: "Connections", icon: Plug, items: ex.connections.slice(0, reveal(ex.connections.length, 0.35)) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ex, progress],
  );
  const gates = ex.agents.reduce((n, a) => n + a.gated, 0);

  // The backdrop swarm falls into one rhythm as the plan comes together.
  useEffect(() => {
    const harmony = custom !== null ? Math.min(1, 0.2 + custom.trim().length / 90) : progress > 0.95 ? 1 : progress * 0.6;
    window.dispatchEvent(new CustomEvent("ww:harmony", { detail: harmony }));
  }, [progress, custom]);

  function submit() {
    const text = (custom ?? "").trim();
    if (text.length < 12) {
      input.current?.focus();
      return;
    }
    const r = card.current?.getBoundingClientRect();
    if (r) window.dispatchEvent(new CustomEvent("ww:gather", { detail: { x: r.left + r.width / 2, y: r.top + r.height / 2 } }));
    router.push(`/demo?prompt=${encodeURIComponent(text)}`);
  }

  return (
    <div ref={card} className={cn("panel-raised relative rounded-2xl transition-shadow duration-700", custom === null && !doneTyping ? "aurora" : "shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8),0_0_0_1px_rgb(223_255_79/0.12)]")} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="flex items-center gap-1.5 border-b border-hairline px-3 py-2">
        {examples.map((e, k) => (
          <button
            key={e.label}
            onClick={() => {
              setCustom(null);
              setI(k);
              setTyped(0);
            }}
            className={cn("rounded-md px-2 py-1 text-[11.5px] transition-colors", k === i && custom === null ? "bg-raised text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {e.label}
          </button>
        ))}
        <span className="ml-auto hidden text-[11px] text-faint sm:inline">or write your own ↓</span>
      </div>
      <div className="p-4">
        <label htmlFor="hero-prompt" className="sr-only">Describe the app you want</label>
        <div className="rounded-xl border border-hairline bg-deep p-3 focus-within:border-amber/50">
          <textarea
            id="hero-prompt"
            ref={input}
            rows={3}
            value={custom ?? full.slice(0, typed)}
            onFocus={() => custom === null && setCustom("")}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Describe the job, not the tech…"
            className="block w-full resize-none bg-transparent text-[14px] leading-relaxed outline-none placeholder:text-faint"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-faint">{custom !== null ? "Enter to plan it, no account needed" : !doneTyping ? <span className="caret">▍</span> : "Plan ready in the preview below"}</span>
            <button onClick={submit} className="inline-flex h-7 items-center gap-1 rounded-md bg-amber px-2.5 text-[12px] font-medium text-primary-foreground">
              Plan it <ArrowRight className="size-3.5" />
            </button>
          </div>
        </div>

        <div className="dot-grid mt-3 grid min-h-[224px] grid-cols-4 content-start gap-2.5 rounded-xl border border-hairline p-3" aria-hidden>
          {cols.map((c) => (
            <div key={c.title} className="min-w-0">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><c.icon className="size-3" />{c.title}</p>
              <ul className="mt-2 space-y-1.5">
                <AnimatePresence mode="popLayout" initial={false}>
                  {c.items.map((it) => (
                    <motion.li
                      key={`${ex.label}-${it}`}
                      layout
                      initial={{ opacity: 0, y: 8, scale: 0.94, filter: "blur(4px)" }}
                      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                      transition={{ type: "spring", stiffness: 420, damping: 30 }}
                      className="truncate rounded-md border border-hairline bg-panel px-2 py-1.5 text-[11px] shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]"
                    >
                      {it}
                    </motion.li>
                  ))}
                </AnimatePresence>
                {c.items.length === 0 && <li className="shimmer h-6 rounded-md" />}
              </ul>
            </div>
          ))}
        </div>

        <motion.div
          initial={false}
          animate={progress > 0.95 ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 10, filter: "blur(4px)" }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-amber/30 bg-amber-soft px-3 py-2.5 text-[12px] shadow-[0_0_30px_-10px_rgb(223_255_79/0.5)]"
          aria-hidden={progress <= 0.95}
        >
          <span className="font-mono text-[10px] uppercase tracking-wider text-amber">Work Order</span>
          <span className="inline-flex items-center gap-1"><Clock className="size-3 text-muted-foreground" />~{ex.minutes} min for a real build</span>
          <span className="inline-flex items-center gap-1"><Coins className="size-3 text-muted-foreground" />{ex.credits} credits ≈ ${(ex.credits / 100).toFixed(2)}</span>
          <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3 text-ask" />{gates} action{gates === 1 ? "" : "s"} ask{gates === 1 ? "s" : ""} first</span>
          <span className="ml-auto text-muted-foreground">Nothing runs until you approve</span>
        </motion.div>
      </div>
    </div>
  );
}
