"use client";
import { createContext, useContext, useLayoutEffect, useState, type RefObject } from "react";
import type { useWorkspace } from "../context";
import type { TimelineStep } from "@/lib/sim/buildTimeline";

/** Everything the Sheet reads: the workspace (project, plan, build runner, composer focus). */
export type SheetWorkspace = ReturnType<typeof useWorkspace>;

/**
 * The Sheet reads the workspace through its own context, so `<SheetView ws={…}>` can be handed
 * any workspace value (the real one from useWorkspace, or a fixture in a visual test).
 */
export const SheetContext = createContext<SheetWorkspace | null>(null);

export function useSheet(): SheetWorkspace {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error("useSheet must be used inside <SheetView>");
  return ctx;
}

export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The width of an element, kept current as it resizes. Null until it has been measured. */
export function useWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

type Step = Extract<TimelineStep, { kind: "step" }>;

/** What a build step is doing, in the Sheet's words ("Inking Claim Detail", "Teaching Intake Triage"). */
export function stepLine(ws: SheetWorkspace, step: Step): string {
  const bp = ws.blueprint;
  const ref = step.objectRef;
  if (step.id === "read-brief") return "Reading your sketch";
  if (step.id === "rehearse") return "Trying every AI helper on its test runs";
  if (step.id === "rehearse-again") return "Running the test runs again";
  if (step.id === "final-checks") return "Checking sign-in and who can see what";
  if (ref?.type === "screen") return `Inking ${bp.screens.find((s) => s.id === ref.id)?.title ?? "a screen"}`;
  if (ref?.type === "agent") return `Teaching ${bp.agents.find((a) => a.id === ref.id)?.name ?? "an AI helper"} its job`;
  if (ref?.type === "entity") return `Setting up ${bp.entities.find((e) => e.id === ref.id)?.plural.toLowerCase() ?? "the data"}`;
  if (ref?.type === "connection") {
    const c = bp.connections.find((x) => x.id === ref.id);
    if (!c) return "Connecting";
    return c.status === "missing" ? `${c.name} isn't connected yet, so it uses test data` : `Connecting ${c.name}`;
  }
  return step.title;
}

/** Old words out, the Sheet's words in: a "rehearsal" is a test run here, an "approval gate" is asking first. */
export function plainWords(s: string): string {
  return s
    .replace(/^Rehearsal caught /, "A test run caught ")
    .replace(/\brehearsals\b/gi, "test runs")
    .replace(/\brehearsal\b/gi, "test run")
    .replace(/\ban approval gate\b/gi, "an ask-first step")
    .replace(/\bapproval gates?\b/gi, "ask-first steps")
    .replace(/\bagents\b/g, "AI helpers")
    .replace(/\bagent\b/g, "AI helper");
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
