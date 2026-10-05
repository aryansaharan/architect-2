"use client";
import { useRef } from "react";
import { useDrawOnMount } from "@/components/motion/entry-draw";

/** One quick loop of the pencil, overshooting where it started, the way you circle an answer on paper. */
const LOOP = "M86 6C64 0 22 1 7 12C-3 20 6 34 34 37.5C62 40.5 95 36 98 22C100 11 84 4 60 4.5";

/**
 * The answer you picked, circled in pencil, drawn as it appears (about 300ms). It only appears when
 * someone picks an answer, so it's always drawn. Sits around its button without taking any space.
 */
export function PencilCircle() {
  const ref = useRef<SVGSVGElement>(null);
  useDrawOnMount(ref, { duration: 240, lane: "circle", gap: 0 });
  return (
    <svg ref={ref} aria-hidden viewBox="0 0 100 40" preserveAspectRatio="none" className="pointer-events-none absolute -left-2.5 top-0.5 h-[calc(100%-4px)] w-[calc(100%+20px)] overflow-visible">
      <path data-stroke="" d={LOOP} fill="none" stroke="var(--brand)" strokeOpacity={0.6} strokeWidth={1.4} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
