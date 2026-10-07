"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Blocks, Bot, ChevronLeft, ChevronRight, Database, FolderGit2, GitPullRequest, Loader2, Play, Plug, RotateCw, Undo2 } from "lucide-react";
import type { ObjectRef, ObjectType } from "@/lib/blueprint/schema";
import { relations } from "@/lib/blueprint";
import { cancelBuild } from "@/lib/actions/build";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DUR, EASE } from "@/lib/motion";
import { useWorkspace } from "../context";
import { stoppedWords, type InterruptedBuild } from "../use-build-runner";
import { AgentNode, ConnectionNode, EntityNode, ScreenNode } from "./node-card";
import { WorkOrderDock } from "./work-order-dock";
import { BuildConsole } from "./build-console";
import { RepairOverlay } from "./repair-overlay";
import { BuildComplete } from "./build-complete";
import { useChangeOrderOpen } from "../composer-dock";

type Edge = { from: string; to: string; kind: "screen-agent" | "agent-entity" | "agent-connection" };
type Path = Edge & { d: string };
const key = (type: ObjectType, id: string) => `${type}:${id}`;
const CANVAS_TYPES: ObjectType[] = ["screen", "agent", "entity", "connection"];
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function BlueprintCanvas() {
  const ws = useWorkspace();
  const bp = ws.blueprint;
  const container = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const [paths, setPaths] = useState<Path[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  // Which sides have more plan to scroll to: those edges get a nudge button.
  const [more, setMore] = useState({ left: false, right: false });
  const changeOrderOpen = useChangeOrderOpen();

  const rel = useMemo(() => relations(bp), [bp]);
  const edges = useMemo<Edge[]>(() => {
    const out: Edge[] = [];
    rel.screenAgents.forEach((agents, s) => agents.forEach((a) => out.push({ from: key("screen", s), to: key("agent", a), kind: "screen-agent" })));
    rel.agentEntities.forEach((ents, a) => ents.forEach((e) => out.push({ from: key("agent", a), to: key("entity", e), kind: "agent-entity" })));
    rel.agentConnections.forEach((conns, a) =>
      conns.forEach((c) => {
        const conn = bp.connections.find((x) => x.id === c);
        if (conn && conn.kind !== "database") out.push({ from: key("agent", a), to: key("connection", c), kind: "agent-connection" });
      }),
    );
    return out;
  }, [rel, bp.connections]);

  const updateEdges = useCallback(() => {
    const s = scroller.current;
    if (!s) return;
    const left = s.scrollLeft > 4;
    const right = s.scrollLeft + s.clientWidth < s.scrollWidth - 4;
    setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
  }, []);

  const measure = useCallback(() => {
    updateEdges();
    const root = container.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    const next: Path[] = [];
    for (const e of edges) {
      const a = nodes.current.get(e.from)?.getBoundingClientRect();
      const b = nodes.current.get(e.to)?.getBoundingClientRect();
      if (!a || !b) continue;
      const sx = a.right - box.left;
      const sy = a.top + a.height / 2 - box.top;
      const ex = b.left - box.left;
      const ey = b.top + b.height / 2 - box.top;
      const dx = Math.max(40, (ex - sx) * 0.45);
      next.push({ ...e, d: `M ${sx} ${sy} C ${sx + dx} ${sy}, ${ex - dx} ${ey}, ${ex} ${ey}` });
    }
    setPaths(next);
  }, [edges, updateEdges]);

  useEffect(() => {
    const t = setTimeout(measure, 950); // after the cards finish landing
    return () => clearTimeout(t);
  }, [measure]);

  useLayoutEffect(() => {
    measure();
    const root = container.current;
    if (!root) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    // The viewport can shrink (inspector opens, rail expands) while the grid stays at its minimum width.
    if (scroller.current) ro.observe(scroller.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // The planner hands over with the brief selected (?sel=brief:meta), which opened the inspector over the new plan.
  // Let the plan land unobstructed: close it once, on arrival. The inspector opens again as soon as someone clicks.
  const arrival = useRef(ws.selected?.type === "brief" && ws.project.buildState === "draft");
  const { select } = ws;
  useEffect(() => {
    if (!arrival.current) return;
    arrival.current = false;
    select(null);
  }, [select]);

  const selectedKey = ws.selected && CANVAS_TYPES.includes(ws.selected.type) ? key(ws.selected.type, ws.selected.id) : null;
  const focusKey = hover ?? selectedKey;

  // Once the inspector has opened (and the canvas narrowed), bring the selected card fully into view.
  useEffect(() => {
    if (!selectedKey) return;
    const t = setTimeout(() => {
      nodes.current.get(selectedKey)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "nearest", inline: "nearest" });
    }, 420);
    return () => clearTimeout(t);
  }, [selectedKey]);

  const nudge = (dir: -1 | 1) => {
    const s = scroller.current;
    if (!s) return;
    s.scrollBy({ left: dir * Math.max(220, s.clientWidth * 0.5), behavior: reducedMotion() ? "auto" : "smooth" });
  };
  const related = useMemo(() => {
    if (!focusKey) return null;
    const set = new Set([focusKey]);
    for (const e of edges) {
      if (e.from === focusKey) set.add(e.to);
      if (e.to === focusKey) set.add(e.from);
    }
    // screens ↔ entities are related through the data they show
    if (focusKey.startsWith("screen:")) rel.screenEntities.get(focusKey.slice(7))?.forEach((e) => set.add(key("entity", e)));
    if (focusKey.startsWith("entity:"))
      rel.screenEntities.forEach((ents, s) => ents.has(focusKey.slice(7)) && set.add(key("screen", s)));
    return set;
  }, [focusKey, edges, rel]);

  const reg = (k: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(k, el);
    else nodes.current.delete(k);
  };
  const common = (type: ObjectType, id: string) => {
    const k = key(type, id);
    const ref: ObjectRef = { type, id };
    return {
      selected: ws.selected?.type === type && ws.selected.id === id,
      dimmed: Boolean(related && !related.has(k)),
      buildState: ws.build.nodeState(ref),
      onSelect: () => ws.select(ws.selected?.type === type && ws.selected.id === id ? null : ref),
      onHover: (h: boolean) => setHover(h ? k : null),
    };
  };

  const running = ws.build.status !== "idle" && ws.build.status !== "done";
  // One dock at a time, in its own row under the plan so it never covers a card. While a change Work Order
  // waits in the notes margin, the dock steps aside: one decision at a time.
  const interrupted = ws.build.interrupted;
  const quiet = !running && ws.build.status !== "done" && !changeOrderOpen;
  const dock = !quiet ? null : interrupted ? "resume" : ws.project.buildState === "draft" ? (ws.project.source === "import" ? "mapped" : "quote") : null;
  const columns = [
    { title: "Screens", hint: "what people see", icon: Blocks, count: bp.screens.length },
    { title: "AI helpers", hint: "who does the work", icon: Bot, count: bp.agents.length },
    { title: "Data", hint: "what's stored", icon: Database, count: bp.entities.length },
    { title: "Connections", hint: "what it touches", icon: Plug, count: bp.connections.length },
  ];

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className={cn("flex items-center gap-3 border-b border-hairline px-5 py-2.5", ws.selected && "lg:max-xl:pr-[376px]")}>
        <div className="min-w-0">
          <h2 className="truncate pr-1 font-pencil text-note leading-tight">{bp.meta.tagline}</h2>
          <p className="truncate text-meta text-muted-foreground">
            The plan map: click anything to read it in plain English, change it, or see its code.
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {ws.project.buildState === "built" && ws.build.canReplay && !running && (
            <Button variant="outline" onClick={() => ws.build.start({ replay: true })} aria-label="Replay how it was built">
              <Play /> <span className="max-sm:hidden">Replay how it was built</span><span className="sm:hidden">Replay</span>
            </Button>
          )}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scroller}
          onScroll={updateEdges}
          onClick={(e) => e.target === e.currentTarget && ws.select(null)}
          className={cn(
            "dot-grid @container/canvas relative min-h-0 flex-1 overflow-auto",
            // Between lg and xl the inspector floats over the right of the canvas: leave room to scroll past it.
            ws.selected && "lg:max-xl:scroll-pr-[376px] lg:max-xl:pr-[376px]",
          )}
        >
          {/* Columns and gaps tighten with the space available; from 640 to 860px the plan scrolls sideways.
              On a phone the four columns stack, one under the other, and the connecting lines step aside. */}
          <div
            ref={container}
            className={cn(
              "relative grid grid-cols-1 gap-y-8 px-4 pt-5 @min-[640px]/canvas:min-w-[860px] @min-[640px]/canvas:grid-cols-4 @min-[640px]/canvas:gap-x-8 @min-[640px]/canvas:gap-y-0 @min-[640px]/canvas:px-5 @min-[640px]/canvas:pt-6 @min-[1060px]/canvas:gap-x-12 @min-[1060px]/canvas:px-7 @min-[1240px]/canvas:gap-x-14 @min-[1240px]/canvas:px-8",
              // The build console floats over the bottom of the plan: leave room to scroll every card past it.
              running ? "pb-56" : "pb-16",
            )}
          >
            {/* Sized by the grid, not by a measured width: a stale wider SVG would hold the canvas open and push lines under the inspector. */}
            <svg className="pointer-events-none absolute inset-0 hidden size-full overflow-visible @min-[640px]/canvas:block" aria-hidden>
              {paths.map((p, i) => {
                const hot = Boolean(related && related.has(p.from) && related.has(p.to));
                const dashed = p.kind === "agent-connection";
                return (
                  <g key={`${p.from}-${p.to}`}>
                    {/* Pencil lines: graphite, dashed where an agent reaches outside the app. */}
                    {dashed ? (
                      <motion.path d={p.d} fill="none" stroke="var(--graphite)" strokeOpacity={0.28} strokeWidth={1.25} strokeDasharray="4 5" strokeLinecap="round" initial={{ opacity: 0 }} animate={{ opacity: hot ? 0 : 1 }} transition={{ duration: DUR.page, ease: EASE, delay: 0.5 + i * 0.015 }} />
                    ) : (
                      <motion.path d={p.d} fill="none" stroke="var(--graphite)" strokeOpacity={0.3} strokeWidth={1.25} strokeLinecap="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: hot ? 0 : 1 }} transition={{ pathLength: { duration: 1.1, ease: EASE, delay: 0.45 + i * 0.02 }, opacity: { duration: DUR.panel, ease: EASE } }} />
                    )}
                    {/* The lines around what you point at, inked in the accent. Data only moves along them while a build runs. */}
                    {hot && <path d={p.d} fill="none" stroke="var(--brand)" strokeOpacity={0.85} strokeWidth={1.6} strokeLinecap="round" strokeDasharray={dashed ? "4 5" : undefined} className={running ? "flow" : undefined} />}
                  </g>
                );
              })}
            </svg>
            {columns.map((c, col) => (
              // Each column is its heading and its cards. The staggered offsets only apply side by side.
              <section key={c.title} aria-label={c.title} className="relative z-[1] min-w-0">
                <div className="mb-3 flex min-w-0 items-baseline gap-2">
                  <c.icon className="size-3.5 shrink-0 translate-y-px text-muted-foreground" aria-hidden />
                  <h3 className="shrink-0 whitespace-nowrap font-pencil text-note leading-tight text-foreground">{c.title}</h3>
                  <span className="shrink-0 text-meta tabular-nums text-muted-foreground">{c.count}</span>
                  <span className="min-w-0 truncate text-meta text-muted-foreground">· {c.hint}</span>
                </div>
                <div className={cn("space-y-3", OFFSET[col])}>
                  {col === 0 && bp.screens.map((s, i) => <Land key={s.id} col={0} i={i}><ScreenNode ref={reg(key("screen", s.id))} screen={s} primary={bp.meta.theme.primary} {...common("screen", s.id)} /></Land>)}
                  {col === 1 && bp.agents.map((a, i) => <Land key={a.id} col={1} i={i}><AgentNode ref={reg(key("agent", a.id))} agent={a} {...common("agent", a.id)} /></Land>)}
                  {col === 2 && bp.entities.map((e, i) => <Land key={e.id} col={2} i={i}><EntityNode ref={reg(key("entity", e.id))} entity={e} {...common("entity", e.id)} /></Land>)}
                  {col === 3 && bp.connections.map((cn2, i) => <Land key={cn2.id} col={3} i={i}><ConnectionNode ref={reg(key("connection", cn2.id))} connection={cn2} {...common("connection", cn2.id)} /></Land>)}
                </div>
              </section>
            ))}
          </div>
        </div>
        <EdgeFade side="left" show={more.left} onNudge={() => nudge(-1)} />
        <EdgeFade side="right" show={more.right} onNudge={() => nudge(1)} />
      </div>

      <AnimatePresence>
        {dock === "quote" && (
          // The Work Order renders as a floating overlay; here it sits in flow, in its own row under the plan.
          <div key="quote" className="relative z-10 shrink-0 [&>div]:static [&>div]:pt-2">
            <WorkOrderDock />
          </div>
        )}
        {dock === "mapped" && <MappedDock key="mapped" />}
        {dock === "resume" && interrupted && <ResumeDock key="resume" build={interrupted} />}
      </AnimatePresence>

      <AnimatePresence>{running && <BuildConsole key="console" />}</AnimatePresence>
      <AnimatePresence>{ws.build.status === "repair" && <RepairOverlay key="repair" />}</AnimatePresence>
      <AnimatePresence>{ws.build.status === "done" && <BuildComplete key="complete" />}</AnimatePresence>
    </div>
  );
}

const dockMotion = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.panel, ease: EASE, delay: 0.3 } },
  exit: { opacity: 0, y: 8, transition: { duration: DUR.hover, ease: EASE } },
};
/** A dock is a proposal on the plan: a pencil sketch on paper, never a shadow. */
const dockPanel = "sketch pointer-events-auto w-full max-w-[860px] bg-raised p-4";
/** Side by side, the columns start a little lower each, like notes placed by hand. Stacked, they don't. */
const OFFSET = ["", "@min-[640px]/canvas:pt-8", "@min-[640px]/canvas:pt-4", "@min-[640px]/canvas:pt-12"];

/**
 * The server says this project is mid-build, but nothing is running here: the tab was closed or
 * reloaded. Making it real is free, so resuming and stopping are too (a build charged under the
 * earlier pricing is refunded when stopped).
 */
function ResumeDock({ build }: { build: InterruptedBuild }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [busy, setBusy] = useState<"resume" | "stop" | null>(null);
  const where = build.step ? `at step ${build.step} of ${build.total}` : "before it finished";
  return (
    <div className="relative z-10 flex shrink-0 justify-center px-3 pb-3 pt-2 sm:px-5">
      <motion.section aria-label="Interrupted build" {...dockMotion} className={dockPanel}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="font-sketch text-sketch text-muted-foreground">Build paused</p>
            <p className="mt-1 font-pencil text-note leading-tight">Your build was interrupted {where}.</p>
            <p className="mt-0.5 text-ui text-muted-foreground">
              {build.atRepair ? "It was waiting for you to pick a fix. " : ""}
              Resume picks up where it stopped, or stop it and keep the plan as it was.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="lg"
              className="text-muted-foreground"
              disabled={busy !== null}
              onClick={async () => {
                setBusy("stop");
                const r = await cancelBuild(ws.project.id).catch(() => ({ ok: false as const, error: "Couldn't reach Prod AI. Try again." }));
                setBusy(null);
                if (!r.ok) return void toast.error(r.error);
                ws.build.dismiss();
                toast.success("Build stopped", { description: stoppedWords(r.refunded, "Your plan is exactly as you left it.") });
                router.refresh();
              }}
            >
              {busy === "stop" ? <Loader2 className="animate-spin" /> : <Undo2 />} Stop
            </Button>
            <Button
              size="lg"
              disabled={busy !== null}
              onClick={async () => {
                setBusy("resume");
                await ws.build.start();
                setBusy(null);
              }}
            >
              {busy === "resume" ? <Loader2 className="animate-spin" /> : <RotateCw />} Resume
            </Button>
          </div>
        </div>
      </motion.section>
    </div>
  );
}

/**
 * An imported repo isn't rebuilt: Prod AI adopts it as it is. So there's no build quote, only the
 * way in to the first change, which lands as a pull request.
 */
function MappedDock() {
  const ws = useWorkspace();
  return (
    <div className="relative z-10 flex shrink-0 justify-center px-3 pb-3 pt-2 sm:px-5">
      <motion.section aria-label="Imported project" {...dockMotion} className={dockPanel}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md border border-hairline bg-canvas"><FolderGit2 className="size-4 text-brand" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-sketch text-sketch text-muted-foreground">Adopted · nothing was built</p>
            <p className="mt-1 font-pencil text-note leading-tight">Mapped. Your repo is untouched.</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-ui text-muted-foreground"><GitPullRequest className="size-3.5 shrink-0" />Your first change opens as a pull request.</p>
          </div>
          <Button size="lg" className="ml-auto" onClick={() => ws.focusComposer(null)} title="Type the change in the box below">
            Describe your first change <ArrowRight />
          </Button>
        </div>
      </motion.section>
    </div>
  );
}

/**
 * Where the plan continues off-screen: a small button to scroll a column's worth.
 * Keyboard users reach every card with Tab (the browser scrolls it into view), so the button stays out of the tab order.
 */
function EdgeFade({ side, show, onNudge }: { side: "left" | "right"; show: boolean; onNudge: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 z-[4] flex w-16 items-center transition-opacity duration-250 ease-paper",
        side === "left" ? "left-0 justify-start pl-2" : "right-0 justify-end pr-3",
        show ? "opacity-100" : "opacity-0",
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={onNudge}
        className={cn(
          "grid size-7 place-items-center rounded-full border border-hairline-hi bg-raised text-muted-foreground shadow-float transition-colors duration-150 hover:border-line-strong hover:text-foreground",
          show ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <Icon className="size-4" />
      </button>
    </div>
  );
}

/** Cards settle onto the page column by column on first paint: a short fade, nothing bouncing. */
function Land({ col, i, children }: { col: number; i: number; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR.panel, ease: EASE, delay: col * 0.06 + i * 0.04 }}>
      {children}
    </motion.div>
  );
}
