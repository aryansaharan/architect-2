"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Wireframe } from "@/components/landing/sketches";
import { drawDrawing, nextTurn, prefersReducedMotion, useEntrance } from "@/components/motion/entry-draw";
import { cn } from "@/lib/utils";
import { CapNote } from "./cap-note";

export type PartialDraft = {
  name?: string;
  tagline?: string;
  entities?: { name?: string; plural?: string }[];
  connections?: { name?: string; kind?: string }[];
  agents?: { name?: string; role?: string; tools?: { name?: string; access?: string }[] }[];
  screens?: { title?: string; kind?: string }[];
};

/** A code app's file as Claude writes it: it may arrive in growing parts, always under the same path. */
export type WrittenFile = { path: string; content: string; done: boolean };
/** The code app's manifest as it arrives (docs/CODE-APPS.md): what it is and what it keeps. */
export type PartialManifest = { title?: string; tagline?: string; kind?: string; collections?: { name?: string; label?: string; read?: string; write?: string }[]; usesAI?: boolean };

export function usePlanStream(initialMode: "live" | "offline") {
  const router = useRouter();
  const [draft, setDraft] = useState<PartialDraft>({});
  // A code app: its files and manifest, as they're written.
  const [files, setFiles] = useState<WrittenFile[]>([]);
  const [manifest, setManifest] = useState<PartialManifest | null>(null);
  // What the server says it's doing, when it says (a code app's writing steps).
  const [status, setStatus] = useState<string | null>(null);
  const [mode, setMode] = useState<"live" | "offline">(initialMode);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "cap": the person can't keep another project. Trying again won't help, so the page offers the ways on instead.
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const [running, setRunning] = useState(false);
  const started = useRef(0);

  useEffect(() => {
    if (!running || done) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started.current) / 1000)), 500);
    return () => clearInterval(t);
  }, [running, done]);

  async function start(url: string, body: unknown, redirect: (projectId: string) => string) {
    setRunning(true);
    setError(null);
    setErrorCode(null);
    setNote(null);
    setDraft({});
    setFiles([]);
    setManifest(null);
    setStatus(null);
    setDone(false);
    started.current = Date.now();
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        if (typeof j.code === "string") setErrorCode(j.code);
        throw new Error(j.error ?? "Planning failed");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let finished = false;
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.t === "status") {
            if (e.mode === "live" || e.mode === "offline") setMode(e.mode);
            const said = e.text ?? e.message ?? e.label;
            if (typeof said === "string") setStatus(said.slice(0, 160));
          }
          if (e.t === "partial") setDraft(e.draft ?? {});
          if (e.t === "file" && typeof e.path === "string" && typeof e.content === "string") {
            const f: WrittenFile = { path: e.path.slice(0, 120), content: e.content, done: e.done === true };
            setFiles((all) => (all.some((x) => x.path === f.path) ? all.map((x) => (x.path === f.path ? f : x)) : [...all, f]));
          }
          if (e.t === "manifest" && e.manifest && typeof e.manifest === "object") setManifest(e.manifest);
          if (e.t === "note") {
            setNote(e.text);
            setMode("offline");
          }
          if (e.t === "error") {
            if (typeof e.code === "string") setErrorCode(e.code);
            throw new Error(e.message);
          }
          if (e.t === "done") {
            finished = true;
            setDone(true);
            setTimeout(() => router.push(redirect(e.projectId)), 900);
          }
        }
      }
      // The connection closed before the server said it was done (a dropped network, say): say so, plainly.
      if (!finished) throw new Error("The connection dropped before it finished. If it was saved, it's in your projects; otherwise try again.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Planning failed");
    }
  }

  return { draft, files, manifest, status, mode, note, error, errorCode, elapsed, done, running, start };
}


/** The screen kinds the planner uses, drawn as the nearest wireframe. Offline plans have no kind, so they vary by position. */
const LAYOUT: Record<string, string> = { queue: "single", dashboard: "dashboard", report: "dashboard", detail: "split", assistant: "split", form: "form" };
const byPosition = (i: number) => ["dashboard", "split", "single", "form"][i % 4];

const TILT = ["-rotate-[1.2deg]", "rotate-[0.8deg]", "-rotate-[0.4deg]"];

/** A sketch card's outline, the same uneven corners as .sketch, stretched to the card. Starts top left, like a hand would. */
const OUTLINE = "M4.2 0.75H98Q99.25 0.75 99.25 5.6V97.6Q99.25 99.25 96 99.25H2.1Q0.75 99.25 0.75 93.5V3.4Q0.75 0.75 4.2 0.75Z";

/**
 * One planned screen, drawn as it's decided: its outline in pencil, then its name written in, then
 * its wireframe. While Claude is still choosing what kind of screen it is, the wireframe's space
 * waits empty (no jump when it arrives), then it's drawn. Re-renders as the plan streams never redraw it.
 */
function ScreenSketch({ title, layout, seed }: { title: string; layout: string | null; seed: number }) {
  const card = useRef<HTMLLIElement>(null);
  const wire = useRef<HTMLDivElement>(null);
  const wireDrawn = useRef(false);
  const started = useRef(false);
  useLayoutEffect(() => {
    if (started.current || !card.current) return;
    started.current = true;
    wireDrawn.current = Boolean(layout);
    if (prefersReducedMotion()) return;
    drawDrawing(card.current, { delay: nextTurn("screen", 220), duration: layout ? 1300 : 500 });
    // Only when the card first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    if (!layout || wireDrawn.current || !wire.current) return;
    wireDrawn.current = true;
    if (!prefersReducedMotion()) drawDrawing(wire.current, { duration: 900 });
  }, [layout]);
  return (
    <li ref={card} className="relative min-w-0 border-[1.25px] border-transparent px-3 pb-2.5 pt-2.5 sm:px-4 sm:pb-3 sm:pt-3">
      <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute -left-[1.25px] -top-[1.25px] h-[calc(100%+2.5px)] w-[calc(100%+2.5px)] overflow-visible">
        <path data-fade="" d={OUTLINE} fill="var(--panel)" fillOpacity={0.7} />
        <path data-stroke="" d={OUTLINE} fill="none" stroke="var(--graphite)" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <p data-write="" className="relative truncate font-sketch text-sketch text-foreground">
        {title}
      </p>
      <div ref={wire} className="relative mt-2 aspect-[8/5]">
        {layout && <Wireframe layout={layout} seed={seed} className="block h-auto w-full" />}
      </div>
    </li>
  );
}

/** An AI helper's sticky note, placed on the sheet with a small settle when it's decided. */
function HelperNote({ name, role, risky, tilt }: { name: string; role?: string; risky: number; tilt: string }) {
  const ref = useRef<HTMLLIElement>(null);
  useEntrance(ref, "place", { gap: 120 });
  return (
    <li ref={ref} className={cn("sticky-note px-3.5 pb-2.5 pt-1.5", tilt)}>
      <p className="font-pencil text-note leading-tight text-foreground">{name}</p>
      {role && <p className="mt-0.5 line-clamp-2 text-meta text-muted-foreground">{role}</p>}
      {risky > 0 && <p className="fade-up mt-1 text-meta text-ask">Asks first before {risky} {risky === 1 ? "thing" : "things"} it can&apos;t undo</p>}
    </li>
  );
}

/** Words in pencil, written in when they arrive. Things arriving together are written one after another. */
function Written({ as: Tag = "span", className, lane, children }: { as?: "span" | "li"; className?: string; lane: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEntrance(ref, "write", { lane, gap: 90 });
  return (
    <Tag ref={ref as React.RefObject<HTMLLIElement & HTMLSpanElement>} className={className}>
      {children}
    </Tag>
  );
}

/** The plan as a sketch forming: screens drawn in pencil, AI helpers on sticky notes, a pencil line saying what's happening. */
export function PlanningView({
  s,
  eyebrow,
  onRetry,
  expectedNote,
  signInNext,
}: {
  s: ReturnType<typeof usePlanStream>;
  eyebrow: React.ReactNode;
  onRetry: () => void;
  expectedNote?: string;
  /** Where a guest comes back to after signing in, if they hit the project cap. Null for members. */
  signInNext?: string | null;
}) {
  const { draft, mode, note, error, errorCode, elapsed, done } = s;
  const screens = (draft.screens ?? []).filter((x) => x?.title);
  const helpers = (draft.agents ?? []).filter((a) => a?.name).map((a) => ({ name: a.name!, role: a.role, risky: (a.tools ?? []).filter((t) => t?.access === "irreversible").length }));
  const remembers = (draft.entities ?? []).map((e) => e?.plural ?? e?.name).filter((x): x is string => Boolean(x));
  const connects = (draft.connections ?? []).map((c) => c?.name).filter((x): x is string => Boolean(x));
  const risky = helpers.reduce((n, h) => n + h.risky, 0);
  const working = !done && !error;
  const phase = error
    ? "The pencil slipped."
    : done
      ? "Sketch ready. Opening your sheet…"
      : !draft.name
        ? "Reading your note…"
        : !draft.entities?.length
          ? "Working out what it needs to remember…"
          : !draft.agents?.length
            ? "Choosing what it connects to…"
            : !draft.screens?.length
              ? "Adding AI helpers, and what each may do…"
              : "Drawing the screens people will use…";

  // Full up: nothing was sketched and trying again can't help. Say so, with the ways on (sign in, or delete one).
  if (error && errorCode === "cap")
    return (
      <div className="mx-auto max-w-2xl">
        {typeof eyebrow === "string" ? <p className="font-sketch text-sketch text-muted-foreground">{eyebrow}</p> : eyebrow}
        <h1 className="mt-4 font-pencil text-title">No room for another project</h1>
        <CapNote alert className="mt-6" message={error} signInNext={signInNext} />
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {typeof eyebrow === "string" ? <p className="font-sketch text-sketch text-muted-foreground">{eyebrow}</p> : eyebrow}
        <p className="text-meta text-faint sm:ml-auto">{mode === "live" ? "Sketching with Claude" : "Starting from a ready-made sketch"}</p>
      </div>
      <h1 className="mt-4 font-pencil text-title">
        {draft.name ? (
          <Written key="name" lane="name" className="inline-block">
            {draft.name}
          </Written>
        ) : (
          <span className="text-faint">Sketching…</span>
        )}
      </h1>
      <p className="mt-3 min-h-[1.55em] text-lead text-muted-foreground">{draft.tagline ? <span className="fade-up">{draft.tagline}</span> : ""}</p>

      {/* A note we already know is coming (a guest's starter plan) shows from the start, so nothing jumps when the server says it. */}
      {(note ?? expectedNote) && (
        <p className="mt-4 flex max-w-2xl gap-2 rounded-md border border-hairline bg-panel px-3 py-2.5 text-body text-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          {note ?? expectedNote}
        </p>
      )}
      {error && (
        <div role="alert" className="mt-4 flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-hairline-hi bg-panel px-3 py-2 text-body text-foreground">
          <p className="flex min-w-0 flex-1 gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}

      <div className="dot-grid mt-6 grid gap-8 rounded-md border border-hairline p-5 sm:p-7 lg:grid-cols-[1fr_250px]">
        <section aria-label="Screens">
          <Label title="Screens" count={screens.length} />
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:gap-4">
            {/* Keyed by place, not by title: a title still being written must not redraw its card. */}
            {screens.map((x, i) => (
              <ScreenSketch key={`screen-${i}`} title={x.title!} layout={mode === "offline" ? byPosition(i) : (x.kind && LAYOUT[x.kind]) || (done ? byPosition(i) : null)} seed={i + 3} />
            ))}
            {/* Empty places, the same size as a drawn card, so the sheet doesn't jump when the screens arrive (or as it opens). */}
            {(working || done) &&
              Array.from({ length: Math.max(1, 4 - screens.length) }).map((_, i) => (
                <li key={`empty-${i}`} className={cn("sketch-soft px-3 pb-2.5 pt-2.5 sm:px-4 sm:pb-3 sm:pt-3", done && "invisible")} aria-hidden>
                  <p className="invisible font-sketch text-sketch">&nbsp;</p>
                  <div className="mt-2 grid aspect-[8/5] place-items-center text-center">
                    {i === 0 && <span className="font-pencil text-note leading-tight text-faint">{screens.length ? "and…" : "screens go here"}</span>}
                  </div>
                </li>
              ))}
          </ul>
        </section>

        <aside aria-label="AI helpers and data" className="space-y-7">
          <section>
            <Label title="AI helpers" count={helpers.length} />
            <ul className="mt-3 space-y-3">
              {helpers.map((h, i) => (
                <HelperNote key={`helper-${i}`} name={h.name} role={h.role} risky={h.risky} tilt={TILT[i % TILT.length]} />
              ))}
              {working && helpers.length === 0 && <li className="sketch-soft h-16" aria-hidden />}
            </ul>
          </section>
          <PencilList title="Remembers" items={remembers} working={working} />
          <PencilList title="Connects to" items={connects} working={working} />
        </aside>
      </div>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <p className={cn("font-pencil text-note leading-tight", done ? "text-brand" : "text-foreground")} aria-live="polite">
          {phase}
        </p>
        <span className="text-meta tabular-nums text-faint">{elapsed}s</span>
        {done && <span className="text-meta text-muted-foreground">Saved as version 1.</span>}
      </div>
      <div className="mt-1.5 space-y-1 text-body text-muted-foreground">
        {risky > 0 && (
          <p>
            {risky} {risky === 1 ? "action" : "actions"} can&apos;t be undone, so {risky === 1 ? "it asks" : "they ask"} a person first.
          </p>
        )}
        {mode === "live" && working && elapsed > 25 && <p>Careful sketching takes about a minute. Everything appears here as it&apos;s decided.</p>}
      </div>
    </div>
  );
}

/** A sketch label with its count beside it: the label in lettering, the figure in print. */
function Label({ title, count }: { title: string; count: number }) {
  return (
    <h2 className="flex items-baseline gap-1.5 font-sketch text-sketch text-muted-foreground">
      {title}
      {count > 0 && <span className="font-sans text-meta tabular-nums text-faint">{count}</span>}
    </h2>
  );
}

function PencilList({ title, items, working }: { title: string; items: string[]; working: boolean }) {
  return (
    <section>
      <Label title={title} count={0} />
      {items.length ? (
        <ul className="mt-1.5 space-y-0.5">
          {items.map((x, i) => (
            <Written key={`${title}-${i}`} as="li" lane={title} className="w-fit font-pencil text-note leading-tight text-foreground">
              {x}
            </Written>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 font-pencil text-note leading-tight text-faint">{working ? "…" : "Nothing"}</p>
      )}
    </section>
  );
}
