"use client";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { motion, useReducedMotion } from "motion/react";
import { DUR, EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Pencil motion for the project page (docs/DESIGN.md, Motion): lines that draw themselves once,
 * when the thing they outline first appears or changes. Only SVG stroke-dashoffset moves (via
 * motion's pathLength), so nothing shifts the layout.
 */

const noop = () => () => {};

/**
 * True when this component first rendered in the browser (it arrived by a client-side navigation),
 * false when it was hydrated from the server's HTML (it's already on screen, so it shouldn't redraw).
 */
export function useMountedInBrowser(): boolean {
  const browser = useSyncExternalStore(noop, () => true, () => false);
  const [first] = useState(browser);
  return first;
}

const SEEN = "prodai:drawn:";
function seen(key: string) {
  try {
    return window.sessionStorage.getItem(SEEN + key) === "1";
  } catch {
    return true; // storage unavailable: show it drawn
  }
}
function markSeen(key: string) {
  try {
    window.sessionStorage.setItem(SEEN + key, "1");
  } catch {
    // storage unavailable: nothing to remember
  }
}

/**
 * True only the first time `key` is shown in this browser session, so it can draw itself; every later
 * visit shows it drawn. Never on a page that arrived as server HTML, and never with reduced motion.
 * `when` false (say, the sketch is already being built): don't draw, and don't count it as shown.
 */
export function useFirstShowing(key: string, when = true): boolean {
  const browser = useMountedInBrowser();
  const reduce = useReducedMotion();
  const [fresh] = useState(() => browser && when && !seen(key));
  useEffect(() => {
    if (when) markSeen(key);
  }, [key, when]);
  return fresh && when && !reduce;
}

/**
 * Draws several things in turn as they come into view: things that appear together draw one after
 * another, `stagger` seconds apart, in page order; things below the fold wait until they're scrolled to.
 */
export type DrawSequence = { observe: (el: Element, order: number, onTurn: (delay: number) => void) => () => void };

/** One sequence (one IntersectionObserver) for a group of things that draw in turn. See useDrawTurn. */
export function useDrawSequence(stagger: number): DrawSequence {
  const [sequence] = useState<DrawSequence>(() => {
    const waiting = new Map<Element, { order: number; onTurn: (delay: number) => void }>();
    let io: IntersectionObserver | null = null;
    let next = 0;
    const seen = (entries: IntersectionObserverEntry[]) => {
      const now = performance.now() / 1000;
      const turns = entries
        .filter((e) => e.isIntersecting && waiting.has(e.target))
        .map((e) => ({ el: e.target, ...waiting.get(e.target)! }))
        .sort((a, b) => a.order - b.order);
      for (const t of turns) {
        const at = Math.max(now, next);
        next = at + stagger;
        waiting.delete(t.el);
        io?.unobserve(t.el);
        t.onTurn(at - now);
      }
    };
    return {
      observe(el, order, onTurn) {
        io ??= new IntersectionObserver(seen, { threshold: 0.3 });
        waiting.set(el, { order, onTurn });
        io.observe(el);
        return () => {
          waiting.delete(el);
          io?.unobserve(el);
        };
      },
    };
  });
  return sequence;
}

/** When `ref` first comes into view, its turn in `sequence`: the delay (seconds) before it starts drawing. Null until then. */
export function useDrawTurn(ref: RefObject<Element | null>, sequence: DrawSequence | null, order: number): number | null {
  const [delay, setDelay] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !sequence) return;
    return sequence.observe(el, order, setDelay);
  }, [ref, sequence, order]);
  return sequence ? delay : null;
}

/**
 * The outline of a `.sketch` box, with the same uneven corners (14px 6px 12px 5px / 6px 12px 5px 14px),
 * as one path in the box's own pixels, so a drawn line lands exactly where the CSS border sits.
 */
function sketchPath(w: number, h: number, s: number) {
  const r = (x: number) => Math.max(0, x - s);
  return [
    `M${14} ${s}`,
    `H${w - 6}`,
    `A${r(6)} ${r(12)} 0 0 1 ${w - s} ${12}`,
    `V${h - 5}`,
    `A${r(12)} ${r(5)} 0 0 1 ${w - 12} ${h - s}`,
    `H${5}`,
    `A${r(5)} ${r(14)} 0 0 1 ${s} ${h - 14}`,
    `V${6}`,
    `A${r(14)} ${r(6)} 0 0 1 ${14} ${s}`,
  ].join(" ");
}

/**
 * A pencil line drawing the outline of the `.sketch` box it sits in, once. Put it inside a positioned
 * `.sketch` element; it covers the element's border exactly. `onDone` fires when the line is complete.
 */
export function DrawnOutline({
  delay = 0,
  duration = DUR.page,
  width = 1.5,
  color = "var(--graphite)",
  className,
  onDone,
}: {
  delay?: number;
  duration?: number;
  /** The border's width, so the line sits on it. */
  width?: number;
  /** The line's colour: graphite for a sketch, brand for ink going on. */
  color?: string;
  className?: string;
  onDone?: () => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const reduce = useReducedMotion();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <svg
      ref={ref}
      aria-hidden
      focusable="false"
      className={cn("pointer-events-none absolute overflow-visible", className)}
      style={{ left: -width, top: -width, width: size?.w ?? 0, height: size?.h ?? 0, color }}
    >
      {size && (
        <motion.path
          d={sketchPath(size.w, size.h, width / 2)}
          fill="none"
          stroke="currentColor"
          strokeWidth={width}
          strokeLinecap="round"
          // Hidden until its turn, so a waiting line doesn't leave a dot where the pencil will land.
          initial={reduce ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration, delay, ease: EASE, opacity: { duration: 0, delay } }}
          onAnimationComplete={onDone}
        />
      )}
    </svg>
  );
}

/**
 * A hand-drawn check mark that draws itself once, when it first appears (250ms). `draw` false shows it
 * already drawn; `undraw` takes it back off the paper (an undo), the same stroke in reverse.
 */
export function DrawnCheck({ className, delay = 0, draw = true, undraw = false, strokeWidth = 1.8 }: { className?: string; delay?: number; draw?: boolean; undraw?: boolean; strokeWidth?: number }) {
  const reduce = useReducedMotion();
  const on = undraw ? 0 : 1;
  return (
    <svg viewBox="0 0 16 16" aria-hidden focusable="false" className={className}>
      <motion.path
        d="M2.5 8.6c1.3.9 2.4 2.1 3.4 3.6C7.6 8.4 10 5.4 13.6 2.9"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={draw && !reduce ? { pathLength: 0, opacity: 0 } : false}
        animate={{ pathLength: on, opacity: on }}
        transition={{ duration: reduce ? 0 : DUR.panel, delay, ease: EASE, opacity: { duration: 0, delay: undraw && !reduce ? DUR.panel : delay } }}
      />
    </svg>
  );
}
