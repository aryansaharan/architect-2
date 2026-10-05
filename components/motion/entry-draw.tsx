"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { markSeen, seenThisSession } from "./entry-once";

/**
 * Drawing in pencil, for real: the marked parts of a drawing appear in the order they're written,
 * as one hand at a steady pace.
 *   data-stroke  a line, drawn along its length (stroke-dashoffset)
 *   data-write   a word, written left to right (clip-path)
 *   data-fade    a filled shape, such as a sheet or a sticky note, laid down (opacity)
 * Unmarked parts are simply there. Nothing is hidden until JavaScript is about to draw it, so the
 * server HTML always shows the finished drawing, and reduced motion leaves it alone.
 */

const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const SELECTOR = "[data-stroke],[data-write],[data-fade]";

type Kind = "stroke" | "write" | "fade";
type Piece = { el: SVGElement | HTMLElement; kind: Kind; len: number; weight: number };

export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const kindOf = (el: Element): Kind => (el.hasAttribute("data-stroke") ? "stroke" : el.hasAttribute("data-write") ? "write" : "fade");

/**
 * A stroke's length in the units its dashes use. A non-scaling stroke is dashed in screen pixels, and
 * its drawing may be stretched more one way than the other, so its length is measured on screen.
 * A little over the true length is fine (the dash covers it); under is not (the end would pop in).
 */
function measure(el: SVGGeometryElement): { len: number; screen: number } {
  const user = el.getTotalLength();
  const m = el.getScreenCTM();
  if (!m || user === 0) return { len: user, screen: user };
  const { a, b, c, d } = m;
  // Scaled evenly (and perhaps turned): the length scales by the same factor.
  const even = Math.abs(a * a + b * b - (c * c + d * d)) < 1e-3 * (a * a + b * b) && Math.abs(a * c + b * d) < 1e-3 * (a * a + b * b);
  let screen = user * Math.sqrt(Math.abs(a * d - b * c));
  if (!even) {
    const n = Math.max(24, Math.min(240, Math.ceil((user * Math.max(Math.hypot(a, b), Math.hypot(c, d))) / 2)));
    screen = 0;
    let px = 0;
    let py = 0;
    for (let i = 0; i <= n; i++) {
      const p = el.getPointAtLength((user * i) / n);
      const x = p.x * a + p.y * c;
      const y = p.x * b + p.y * d;
      if (i > 0) screen += Math.hypot(x - px, y - py);
      px = x;
      py = y;
    }
  }
  const nonScaling = el.getAttribute("vector-effect") === "non-scaling-stroke";
  return { len: (nonScaling ? screen : user) * 1.02 + 1, screen };
}

/** The marked parts that belong to this drawing: a nested data-drawing inside it draws on its own. */
function collect(root: Element): Piece[] {
  const own = (el: Element) => {
    const owner = el.parentElement?.closest("[data-drawing]");
    return !owner || owner === root || !root.contains(owner);
  };
  return Array.from(root.querySelectorAll<SVGElement | HTMLElement>(SELECTOR)).filter(own).map((el) => {
    const kind = kindOf(el);
    if (kind === "stroke" && "getTotalLength" in el) {
      const { len, screen } = measure(el as SVGGeometryElement);
      return { el, kind, len, weight: screen };
    }
    if (kind === "write") return { el, kind, len: 0, weight: el.getBoundingClientRect().width };
    return { el, kind, len: 0, weight: 0 };
  });
}

function strokeFrame(len: number, offset: number) {
  // The gap is longer than the line and the start sits past the round cap, so nothing shows before it's drawn.
  return { strokeDasharray: `${len} ${len + 12}`, strokeDashoffset: `${offset}` };
}

function hideOne(p: Piece) {
  const s = p.el.style;
  if (p.kind === "stroke") Object.assign(s, strokeFrame(p.len, p.len + 6));
  else if (p.kind === "write") s.clipPath = "inset(-25% 100% -35% -8%)";
  else s.opacity = "0";
}

function showOne(el: SVGElement | HTMLElement) {
  const s = el.style;
  s.strokeDasharray = "";
  s.strokeDashoffset = "";
  s.clipPath = "";
  s.opacity = "";
}

/** Hide a drawing's marked parts until it is drawn. Returns a function that puts them back. */
export function hideDrawing(root: Element): () => void {
  const parts = collect(root);
  parts.forEach(hideOne);
  return () => parts.forEach((p) => showOne(p.el));
}

/**
 * Draw the marked parts in document order. `duration` is the whole drawing; each line gets a share
 * of it by its length, so the pencil moves at one pace. Returns when the last part lands (ms).
 */
export function drawDrawing(root: Element, { delay = 0, duration = 1100 }: { delay?: number; duration?: number } = {}): number {
  const parts = collect(root);
  const total = parts.reduce((n, p) => n + p.weight, 0) || 1;
  let at = delay;
  let end = delay;
  for (const p of parts) {
    showOne(p.el);
    const share = (p.weight / total) * duration;
    // Each line takes a little longer than its share, so the next one starts as this one lands.
    const time = p.kind === "fade" ? 250 : Math.max(p.kind === "write" ? 250 : 80, share + 60);
    const frames: Keyframe[] =
      p.kind === "stroke"
        ? [strokeFrame(p.len, p.len + 6), strokeFrame(p.len, 0)]
        : p.kind === "write"
          ? [{ clipPath: "inset(-25% 100% -35% -8%)" }, { clipPath: "inset(-25% -8% -35% -8%)" }]
          : [{ opacity: 0 }, { opacity: 1 }];
    p.el.animate(frames, { duration: time, delay: at, easing: EASING, fill: "backwards" });
    end = Math.max(end, at + time);
    at += p.kind === "fade" ? 60 : share;
  }
  return end;
}

/**
 * Things that appear together take turns: each waits `gap` ms after the one before it in its lane
 * (screens, sticky notes and words each have their own), and one that appears alone starts at once.
 */
const lastStart = new Map<string, number>();
export function nextTurn(lane: string, gap: number): number {
  const now = performance.now();
  const at = Math.max(now, (lastStart.get(lane) ?? 0) + gap);
  lastStart.set(lane, at);
  return at - now;
}

/** Drawings that come into view in the same moment take their turns in reading order, whatever order the browser reports them in. */
let waiting: { el: Element; start: (delay: number) => void; gap: number }[] = [];
function queueTurn(el: Element, gap: number, start: (delay: number) => void) {
  waiting.push({ el, start, gap });
  if (waiting.length > 1) return;
  requestAnimationFrame(() => {
    const now = waiting.sort((x, y) => (x.el.compareDocumentPosition(y.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    waiting = [];
    now.forEach((w) => w.start(nextTurn("view", w.gap)));
  });
}

/**
 * A drawing that draws itself in pencil the first time it scrolls into view, once per session.
 * If it's already on screen when the page opens, it was painted whole and stays that way.
 */
export function DrawOnView({ id, className, duration = 1100, children }: { id: string; className?: string; duration?: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || seenThisSession(id)) return;
    // Mostly on screen already: it was painted whole at first sight, so it stays that way.
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight - r.height / 3 && r.bottom > r.height / 3) return;
    const restore = hideDrawing(el);
    let drawn = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        drawn = true;
        markSeen(id);
        queueTurn(el, 450, (delay) => drawDrawing(el, { delay, duration }));
      },
      { rootMargin: "0px 0px -18% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (!drawn) restore();
    };
  }, [id, duration]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/**
 * Draw the element's marked parts as soon as it appears (before its first paint, so nothing flashes).
 * Elements that appear together take turns `gap` ms apart in their lane. Runs once per mount.
 */
export function useDrawOnMount<T extends Element>(ref: React.RefObject<T | null>, { enabled = true, duration = 1100, lane = "draw", gap = 180 }: { enabled?: boolean; duration?: number; lane?: string; gap?: number } = {}) {
  const once = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled || once.current || prefersReducedMotion()) return;
    once.current = true;
    drawDrawing(el, { delay: nextTurn(lane, gap), duration });
    // Only on mount: later renders (the plan streaming in) must not redraw it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** How things arrive on the sheet. Each ends on the element's own style. */
export const ENTRANCE = {
  /** A word or title written in, left to right. */
  write: { frames: [{ clipPath: "inset(-25% 100% -35% -8%)" }, { clipPath: "inset(-25% -8% -35% -8%)" }], duration: 450 },
  /** A sticky note placed on the sheet: it comes down a few pixels and straightens. */
  place: { frames: [{ opacity: 0, transform: "translateY(-6px) rotate(-2deg)" }, { opacity: 1, transform: "none" }], duration: 250 },
} satisfies Record<string, { frames: Keyframe[]; duration: number }>;

/**
 * Play an entrance once, when the element first appears, never on a re-render. Things arriving in
 * the same moment take turns in their lane. Reduced motion: it's simply there.
 */
export function useEntrance<T extends Element>(ref: React.RefObject<T | null>, how: keyof typeof ENTRANCE, { lane = how as string, gap = 90 }: { lane?: string; gap?: number } = {}) {
  const once = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || once.current || prefersReducedMotion()) return;
    once.current = true;
    const { frames, duration } = ENTRANCE[how];
    el.animate(frames, { duration, delay: nextTurn(lane, gap), easing: EASING, fill: "backwards" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
