"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { AnimatePresence } from "motion/react";
import type { ObjectRef, ObjectType } from "@/lib/blueprint/schema";
import { buildTimeline } from "@/lib/sim/buildTimeline";
import { cn } from "@/lib/utils";
import { useDrawSequence, useFirstShowing } from "@/components/motion/sheet-draw";
import { useWorkspace } from "../context";
import type { NodeState } from "../use-build-runner";
import { BuildProgress } from "./build-progress";
import { ConnectionLabels, HelperNotes } from "./helper-notes";
import { BriefNote, MappedNote, ReadyNote } from "./plan-notes";
import { RealApp } from "./real-app";
import { RepairNote } from "./repair-note";
import { ResumeNote } from "./resume-note";
import { GraphiteFilter, ScreenSketch, type InkState } from "./screen-sketch";
import { EmptySheet } from "./sheet-states";
import { plural, reducedMotion, SheetContext, useSheet, type SheetWorkspace } from "./use-sheet";

/**
 * The Sheet: the project page. One sheet of paper that goes from sketch, to being made real, to the real app.
 * Reads the workspace (project, plan, build runner) and renders only the sheet itself; the top navigation
 * and the notes margin are drawn around it by the shell.
 */
export function Sheet() {
  const ws = useWorkspace();
  return <SheetView ws={ws} />;
}

/** The Sheet for any workspace value. `Sheet` passes the live one; a visual test can pass a fixture. */
export function SheetView({ ws }: { ws: SheetWorkspace }) {
  return (
    <SheetContext.Provider value={ws}>
      <SheetBody />
    </SheetContext.Provider>
  );
}

type Phase = "sketch" | "building" | "real";

const refKey = (type: ObjectType, id: string) => `${type}:${id}`;

/**
 * Where an imported project's map came from, in plain words. Claude reading the code finds the screens there;
 * a starter plan (a guest, or no credits) supplies the screens and only the agents, if any, come from the code.
 * Saved with the project at import (settings.mappedBy); older imports are read from their first plan note.
 */
function mapLine(ws: SheetWorkspace): string {
  const bp = ws.blueprint;
  const saved = ws.project.settings.mappedBy;
  const planNote = ws.ledger.find((l) => l.kind === "work_order" && /^(Mapped by Claude|Offline mode|The screens and data come from)/.test(l.body ?? ""));
  const by = saved ?? (planNote ? (planNote.body!.startsWith("Mapped by Claude") ? "claude" : "starter") : null);
  const all = `${plural(bp.screens.length, "screen")} and ${plural(bp.agents.length, "AI helper")}`;
  if (by === "claude") return `What Prod AI found in your code: ${all}.`;
  if (by === null) return `The map of your repo: ${all}.`;
  const fromCode = bp.agents.filter((a) => a.origin === "imported").length;
  if (!fromCode) return `${all}, from the closest starter plan rather than your code.`;
  const helpers = fromCode === bp.agents.length ? (fromCode === 1 ? "The AI helper" : `All ${fromCode} AI helpers`) : `${fromCode} of the ${bp.agents.length} AI helpers`;
  const screens = bp.screens.length === 1 ? "The screen comes" : `The ${bp.screens.length} screens come`;
  return `${screens} from the closest starter plan, not your code. ${helpers} ${fromCode === 1 ? "was" : "were"} read from your code.`;
}

/** Seconds between one sketch card's outline starting and the next: drawn in sequence, overlapping a little. */
const DRAW_STAGGER = 0.15;

function SheetBody() {
  const ws = useSheet();
  const b = ws.build;
  const building = b.status === "running" || b.status === "repair" || b.status === "finishing";
  const phase: Phase = building ? "building" : b.status === "done" || ws.project.buildState === "built" ? "real" : "sketch";
  const empty = ws.blueprint.screens.length === 0;

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-canvas">
      <GraphiteFilter />
      <div className={cn("mx-auto w-full px-2.5 py-5 sm:px-6 sm:py-9", phase === "real" ? "max-w-[1240px]" : "max-w-[980px]")}>
        <article
          aria-label={`${ws.project.name}: ${phase === "real" ? "the real app" : phase === "building" ? "being made real" : "the sketch"}`}
          className={cn("@container/sheet panel relative rounded-md py-7 sm:py-10", phase === "real" ? "px-3 sm:px-8" : "px-4 sm:px-10")}
        >
          {empty ? <EmptySheet /> : phase === "real" ? <RealApp key="real" justBuilt={b.status === "done"} /> : <SketchSheet building={phase === "building"} />}
        </article>
      </div>
    </div>
  );
}

/**
 * Before and during the build: the sketch. Screens as hand-drawn cards, AI helpers as sticky notes,
 * connections as pencil labels and, before the build, the ready note and Make it real (free).
 * During the build each card inks in as its step completes.
 */
function SketchSheet({ building }: { building: boolean }) {
  const ws = useSheet();
  const bp = ws.blueprint;
  const b = ws.build;
  const interrupted = b.interrupted;
  const imported = ws.project.source === "import";
  const progress = useRef<HTMLElement>(null);
  const atRepair = b.status === "repair";
  const arrived = useRef(false);
  // The first time this sketch is shown in this browser session, each card's outline draws itself in turn
  // as it comes into view. Later visits (and a build) show it drawn.
  const firstShowing = useFirstShowing(`sketch:${ws.project.id}`, !building);
  const drawSequence = useDrawSequence(DRAW_STAGGER);

  // The button that started the build is gone: bring the progress line into view and hand it the keyboard,
  // once per build. If it opens on a decision, the fix note takes the keyboard instead.
  useEffect(() => {
    if (!building) {
      arrived.current = false;
      return;
    }
    if (arrived.current) return;
    arrived.current = true;
    progress.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "nearest" });
    if (!atRepair) progress.current?.focus({ preventScroll: true });
  }, [building, atRepair]);

  // An interrupted build remembers which step it reached: everything before it stays inked.
  const stoppedAt = interrupted?.step ?? null;
  const doneBefore = useMemo(() => {
    if (!stoppedAt) return null;
    const steps = buildTimeline(bp).filter((s) => s.kind === "step");
    return new Set(steps.slice(0, stoppedAt - 1).flatMap((s) => (s.kind === "step" && s.objectRef ? [refKey(s.objectRef.type, s.objectRef.id)] : [])));
  }, [stoppedAt, bp]);

  const stateOf = useCallback(
    (type: ObjectType, id: string): NodeState | null => {
      if (building) return b.nodeState({ type, id } as ObjectRef);
      if (doneBefore) return doneBefore.has(refKey(type, id)) ? "done" : "pending";
      return null;
    },
    [building, b, doneBefore],
  );
  const ink = (id: string): InkState => {
    const s = stateOf("screen", id);
    return s === "done" ? "inked" : s === "active" ? "inking" : "sketch";
  };
  const showStates = building || Boolean(doneBefore);

  return (
    <>
      <header>
        {/* Counts live in the progress line and on each card, in print: the eyebrow is only words. */}
        <p className="font-sketch text-sketch text-muted-foreground">
          {building
            ? b.mode === "replay"
              ? "A replay"
              : "Being made real"
            : interrupted
              ? "Paused part-way"
              : imported
                ? "Mapped from your repo"
                : "A sketch · nothing is built yet"}
        </p>
        <h1 className="mt-1 break-words font-pencil text-title text-foreground sm:text-hero">{ws.project.name}</h1>
        {bp.meta.tagline && <p className="mt-2.5 max-w-[62ch] text-lead text-muted-foreground">{bp.meta.tagline}</p>}
      </header>

      {building ? (
        <>
          <BuildProgress ref={progress} showStop={b.status !== "repair"} />
          <AnimatePresence>{b.status === "repair" && <RepairNote key="repair" />}</AnimatePresence>
        </>
      ) : (
        <>
          {interrupted && <ResumeNote build={interrupted} />}
          <BriefNote brief={ws.project.brief} label={imported ? "Where it came from" : "What you asked for"} />
        </>
      )}

      <section aria-labelledby="sheet-screens" className="mt-10">
        <h2 id="sheet-screens" className="font-pencil text-section text-foreground">
          {building ? (
            "Inking each screen"
          ) : (
            <>
              Here&apos;s the <span className="pencil-underline">{imported ? "map" : "sketch"}</span>
            </>
          )}
        </h2>
        <p className="mt-2 text-body text-muted-foreground">
          {building
            ? "Each screen turns from pencil into the real thing as it's built."
            : imported
              ? `${mapLine(ws)} Change anything by writing a note in the margin.`
              : `${plural(bp.screens.length, "screen")} and ${plural(bp.agents.length, "AI helper")}. Rough on purpose: change anything by writing a note in the margin.`}
        </p>
        <ul className="mt-5 grid grid-cols-1 gap-4 @min-[520px]/sheet:grid-cols-2 @min-[820px]/sheet:grid-cols-3">
          {bp.screens.map((s, i) => (
            <ScreenSketch key={s.id} bp={bp} screen={s} n={i + 1} state={ink(s.id)} building={showStates} draw={firstShowing ? drawSequence : null} />
          ))}
        </ul>
      </section>

      {bp.agents.length > 0 && (
        <section aria-labelledby="sheet-helpers" className="mt-11">
          <h2 id="sheet-helpers" className="font-pencil text-section text-foreground">AI helpers</h2>
          <p className="mb-5 mt-2 text-body text-muted-foreground">They do the work behind the screens. Anything that can&apos;t be undone waits for a person.</p>
          <HelperNotes bp={bp} stateOf={(id) => (showStates ? stateOf("agent", id) : null)} waitingOn={b.status === "repair" ? (b.repair?.objectRef.id ?? null) : null} />
        </section>
      )}

      {bp.connections.length > 0 && (
        <section aria-labelledby="sheet-connections" className="mt-11">
          <h2 id="sheet-connections" className="font-pencil text-section text-foreground">It connects to</h2>
          <div className="mt-3">
            <ConnectionLabels connections={bp.connections} stateOf={(id) => (showStates ? stateOf("connection", id) : null)} />
          </div>
        </section>
      )}

      {/* Also while a start is on its way (the server may already say "building"), so the button never vanishes early. */}
      {!building && !interrupted && ws.project.buildState !== "built" && (imported ? <MappedNote /> : <ReadyNote />)}
    </>
  );
}
