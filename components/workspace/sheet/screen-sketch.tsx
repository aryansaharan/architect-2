"use client";
import { useRef } from "react";
import { Check, PenLine } from "lucide-react";
import type { Blueprint, Screen } from "@/lib/blueprint/schema";
import { ScreenThumb } from "../screen-thumb";
import { SpecApp } from "@/components/renderer/spec-app";
import { cn } from "@/lib/utils";
import { useWidth } from "./use-sheet";

/** Where a screen is on its way from sketch to ink. */
export type InkState = "sketch" | "inking" | "inked";

/** The id of the SVG filter that turns the wireframe into graphite lines (rendered once by the Sheet). */
export const GRAPHITE_FILTER = "sheet-graphite";

/**
 * Turns any wireframe into graphite on paper, whatever colours it was drawn in: every shape keeps its
 * outline and takes the pencil's colour, with its faint marks darkened so they read on white.
 */
export function GraphiteFilter() {
  return (
    <svg aria-hidden focusable="false" className="pointer-events-none absolute size-0 overflow-hidden">
      <filter id={GRAPHITE_FILTER} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values="0 0 0 0 0.247  0 0 0 0 0.239  0 0 0 0 0.22  0 0 0 2.6 0" />
      </filter>
    </svg>
  );
}

/** The app is drawn at this size, then scaled down to fit the card: a real screen, just small. */
const DRAW_W = 1280;
const DRAW_H = 800;

/** The real screen, scaled down into a sketch card. Look only: it can't be clicked or tabbed into. */
function InkedScreen({ bp, screen }: { bp: Blueprint; screen: Screen }) {
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const scale = width ? width / DRAW_W : 0;
  return (
    <div ref={box} className="absolute inset-0 overflow-hidden" aria-hidden>
      {width ? (
        <div inert className="ink-in pointer-events-none absolute left-0 top-0 origin-top-left select-none motion-reduce:animate-none!" style={{ width: DRAW_W, height: DRAW_H, transform: `scale(${scale})` }}>
          <SpecApp bp={bp} mode="preview" device="desktop" screenId={screen.id} />
        </div>
      ) : null}
    </div>
  );
}

const STATE_LABEL: Record<InkState, string> = { sketch: "sketch", inking: "inking", inked: "inked" };

/**
 * One planned screen as a hand-drawn card: its name in architect's lettering, a pencil wireframe,
 * and one plain line on what it's for. During the build it inks in: the wireframe gives way to the real screen.
 */
export function ScreenSketch({ bp, screen, n, state, building }: { bp: Blueprint; screen: Screen; n: number; state: InkState; building: boolean }) {
  const inked = state === "inked";
  return (
    <li
      className={cn("sketch flex min-w-0 flex-col bg-panel p-3.5 transition-colors duration-250 ease-paper", state === "inking" && "border-brand")}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span aria-hidden className="font-sketch text-sketch text-faint">{n}</span>
        <h3 className="min-w-0 flex-1 truncate font-pencil text-note text-foreground">{screen.title}</h3>
        {building && (
          <span className={cn("inline-flex shrink-0 items-center gap-1 font-sketch text-sketch", state === "inked" ? "text-ok" : state === "inking" ? "text-brand" : "text-faint")}>
            {state === "inked" ? <Check className="size-3" aria-hidden /> : state === "inking" ? <PenLine className="size-3" aria-hidden /> : null}
            <span className="sr-only">, </span>
            {STATE_LABEL[state]}
          </span>
        )}
        {!building && screen.audience === "customer" && <span className="shrink-0 font-sketch text-sketch text-muted-foreground">for customers</span>}
      </div>
      <div className={cn("relative mt-2.5 aspect-[16/10] overflow-hidden rounded-sm border", inked ? "border-hairline-hi bg-raised" : "border-dashed border-hairline-hi bg-canvas/50")}>
        {inked ? (
          <InkedScreen bp={bp} screen={screen} />
        ) : (
          <div aria-hidden className="pencil-state absolute inset-0 p-3">
            <div style={{ filter: `url(#${GRAPHITE_FILTER})` }}>
              <ScreenThumb screen={screen} large primary="var(--graphite)" />
            </div>
          </div>
        )}
      </div>
      <p className="mt-2.5 text-body text-muted-foreground">{screen.purpose}</p>
    </li>
  );
}
