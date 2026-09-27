"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "../context";

type Box = { l: number; t: number; r: number; b: number };
type Pos = { x: number; y: number; settled: boolean };

export function Tour({ nodes, scroller }: { nodes: RefObject<Map<string, HTMLElement>>; scroller: RefObject<HTMLDivElement | null> }) {
  const ws = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  const card = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const visible = open && params.get("tour") === "1";
  const gated = ws.blueprint.agents.find((a) => a.tools.some((t) => t.access === "irreversible")) ?? ws.blueprint.agents[0];
  // Step 2 explains the dots on this agent's card, so that card must stay in sight.
  const targetKey = step === 1 && gated ? `agent:${gated.id}` : null;

  // Keep the card in free space on the canvas: never over the card it talks about, and over as few others as possible.
  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = card.current;
        const s = scroller.current;
        const root = el?.offsetParent;
        if (!el || !s || !(root instanceof HTMLElement)) return;
        const next = placeTour(el, root, s, nodes.current, targetKey, step);
        setPos((p) => (p && Math.abs(p.x - next.x) < 1 && Math.abs(p.y - next.y) < 1 ? p : { ...next, settled: p !== null }));
      });
    };
    // Re-place once scrolling settles, not on every frame of it.
    const onScroll = () => {
      clearTimeout(idle);
      idle = setTimeout(run, 160);
    };
    run();
    // Cards land with a short spring and the inspector slides in: place again once both have settled.
    const timers = [450, 1100].map((ms) => setTimeout(run, ms));
    const ro = new ResizeObserver(run);
    const s = scroller.current;
    const root = card.current?.offsetParent;
    if (s) ro.observe(s);
    if (root) ro.observe(root);
    s?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", run);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(idle);
      timers.forEach(clearTimeout);
      ro.disconnect();
      s?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", run);
    };
  }, [visible, step, targetKey, nodes, scroller]);

  if (!visible) return null;
  // Closing or finishing drops ?tour=1, so a reload (or Back) doesn't bring the tour back.
  const withoutTour = () => {
    const sp = new URLSearchParams(params.toString());
    sp.delete("tour");
    const q = sp.toString();
    return q ? `${pathname}?${q}` : pathname;
  };
  const close = () => {
    setOpen(false);
    router.replace(withoutTour(), { scroll: false });
  };
  const base = `/p/${ws.project.id}`;
  const steps = [
    {
      title: "This is the plan, and the product",
      body: "Every screen, agent, kind of data and connection in one view. Click any card to read it in plain English, as a spec, or as code. No developer mode: depth is per object.",
      cta: null as null | { href: string; label: string },
    },
    {
      title: "Agents ask before they act",
      body: `Coloured dots are permissions: green reads, blue changes things you can undo, rose can't be undone, and asks a person first. That's ${gated.name}, open on the right.`,
      cta: null,
    },
    {
      title: "Now try it for real",
      body: "Preview is the live app, rendered from this plan. Point at anything to tweak it for free, or talk to an agent in the Agents tab and watch it ask for approval.",
      cta: { href: `${base}/preview`, label: "Open Preview" },
    },
  ];
  const s = steps[step];
  return (
    <motion.div
      ref={card}
      role="dialog"
      aria-label="Quick tour"
      className="absolute left-0 top-0 z-10 w-[320px] max-w-[calc(100%-1.5rem)]"
      style={{ pointerEvents: pos ? "auto" : "none" }}
      initial={false}
      animate={pos ? { x: pos.x, y: pos.y, opacity: 1 } : { opacity: 0 }}
      transition={pos?.settled ? { type: "spring", stiffness: 260, damping: 30 } : { x: { duration: 0 }, y: { duration: 0 }, opacity: { duration: 0.25 } }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="panel-raised rounded-xl p-4 shadow-[0_24px_60px_-18px_rgb(0_0_0/0.9)]">
        <div className="flex items-center justify-between">
          <span className="micro-label text-amber">Quick tour · {step + 1} of {steps.length}</span>
          <button onClick={close} aria-label="Close tour" className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
        </div>
        <p className="mt-2 text-[14px] font-semibold">{s.title}</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{s.body}</p>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-1">{steps.map((_, i) => <span key={i} className={`h-1 w-5 rounded-full ${i <= step ? "bg-amber" : "bg-raised"}`} />)}</div>
          {s.cta ? (
            <Button asChild size="sm" className="h-7">
              <Link href={s.cta.href} onClick={() => window.history.replaceState(null, "", withoutTour())}>{s.cta.label} <ArrowRight /></Link>
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-7"
              onClick={() => {
                if (step === 0) ws.select({ type: "agent", id: gated.id });
                setStep((x) => x + 1);
              }}
            >
              Next <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------- placement */

const GAP = 12;

const area = (a: Box, b: Box) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
const grow = (a: Box, by: number): Box => ({ l: a.l - by, t: a.t - by, r: a.r + by, b: a.b + by });

/**
 * Picks where the tour card goes, in its offset parent's coordinates. Candidates line up with
 * the edges of the visible canvas and of every card; the winner covers no card if it can
 * (and never the target), then sits closest to where the step's attention is.
 */
function placeTour(el: HTMLElement, root: HTMLElement, scroller: HTMLElement, nodes: Map<string, HTMLElement>, targetKey: string | null, step: number): { x: number; y: number } {
  const R = root.getBoundingClientRect();
  const rel = (r: DOMRect): Box => ({ l: r.left - R.left, t: r.top - R.top, r: r.right - R.left, b: r.bottom - R.top });
  const S = scroller.getBoundingClientRect();
  const view: Box = { l: S.left - R.left, t: S.top - R.top, r: S.left - R.left + scroller.clientWidth, b: S.top - R.top + scroller.clientHeight };
  const w = el.offsetWidth;
  const h = el.offsetHeight;

  // Soft: cards and column headings (cover as little as possible). Hard: never cover the build quote and
  // its Build button, the "built" banner, the inspector when it floats over the canvas, or the step's target.
  const soft: Box[] = [];
  const hard: Box[] = [];
  const add = (list: Box[], node: Element | null | undefined, by: number) => {
    const r = node?.getBoundingClientRect();
    if (r?.width && r.height) list.push(grow(rel(r), by));
  };
  nodes.forEach((n) => add(soft, n, 6));
  root.querySelectorAll("[data-tour-avoid]:not([data-tour-avoid='hard'])").forEach((n) => add(soft, n, 6));
  root.querySelectorAll("[data-tour-avoid='hard'], [role='status']").forEach((n) => n !== el && !el.contains(n) && add(hard, n, 8));
  add(hard, document.querySelector('aside[aria-label="Inspector"]'), 8);
  const targetEl = targetKey ? nodes.get(targetKey) : null;
  const target = targetEl ? grow(rel(targetEl.getBoundingClientRect()), 8) : null;
  if (target) hard.push(target);
  // Where the step's attention is: the target card, else the top right (first step) or the top left (toward the tabs).
  const home = target ? { x: (target.l + target.r) / 2, y: (target.t + target.b) / 2 } : step === 0 ? { x: view.r, y: view.t } : { x: view.l, y: view.t };

  const minX = view.l + GAP;
  const maxX = Math.max(minX, view.r - w - GAP);
  const minY = view.t + GAP;
  const maxY = Math.max(minY, view.b - h - GAP);
  const clampX = (x: number) => Math.min(maxX, Math.max(minX, x));
  const clampY = (y: number) => Math.min(maxY, Math.max(minY, y));

  const xs = new Set([minX, maxX]);
  const ys = new Set([minY, maxY]);
  for (const o of [...soft, ...hard]) {
    [o.l, o.r - w, o.r + GAP, o.l - w - GAP].forEach((x) => xs.add(Math.round(clampX(x))));
    [o.t, o.b + GAP, o.t - h - GAP].forEach((y) => ys.add(Math.round(clampY(y))));
  }

  let best = { x: minX, y: minY, score: Infinity };
  for (const x of xs) {
    for (const y of ys) {
      const box = { l: x, t: y, r: x + w, b: y + h };
      let blocked = 0;
      for (const o of hard) blocked += area(box, o);
      let covered = 0;
      for (const o of soft) covered += area(box, o);
      const dist = Math.hypot(x + w / 2 - home.x, y + h / 2 - home.y);
      // Anything hard covered loses to everything else; then covering no card beats any distance; then less cover, then closeness.
      const score = (blocked > 0 ? 1e12 + blocked * 1e3 : 0) + (covered > 0 ? 1e7 + covered * 10 : 0) + dist;
      if (score < best.score) best = { x, y, score };
    }
  }
  return { x: best.x, y: best.y };
}
