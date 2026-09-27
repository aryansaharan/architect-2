"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Blocks, Bot, ChevronLeft, ChevronRight, Database, Play, Plug } from "lucide-react";
import type { ObjectRef, ObjectType } from "@/lib/blueprint/schema";
import { relations } from "@/lib/blueprint";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";
import { AgentNode, ConnectionNode, EntityNode, ScreenNode } from "./node-card";
import { WorkOrderDock } from "./work-order-dock";
import { BuildConsole } from "./build-console";
import { RepairOverlay } from "./repair-overlay";
import { Tour } from "./tour";
import { BuildComplete } from "./build-complete";
import { useChangeOrderOpen } from "../composer-dock";

type Edge = { from: string; to: string; kind: "screen-agent" | "agent-entity" | "agent-connection" };
type Path = Edge & { d: string };
const key = (type: ObjectType, id: string) => `${type}:${id}`;
const CANVAS_TYPES: ObjectType[] = ["screen", "agent", "entity", "connection"];
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function BlueprintCanvas({ tour }: { tour: boolean }) {
  const ws = useWorkspace();
  const bp = ws.blueprint;
  const container = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const [paths, setPaths] = useState<Path[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  // Which sides have more plan to scroll to: those edges fade and get a nudge button.
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
  const columns = [
    { title: "Screens", hint: "what people see", icon: Blocks, count: bp.screens.length },
    { title: "Agents", hint: "who does the work", icon: Bot, count: bp.agents.length },
    { title: "Data", hint: "what's stored", icon: Database, count: bp.entities.length },
    { title: "Connections", hint: "what it touches", icon: Plug, count: bp.connections.length },
  ];

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className={cn("flex items-center gap-3 border-b border-hairline px-5 py-2.5", ws.selected && "lg:max-xl:pr-[376px]")}>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{bp.meta.tagline}</p>
          <p className="truncate text-[11.5px] text-muted-foreground">
            The plan is the product: click anything to read it in plain English, change it, or see its code.
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {ws.project.buildState === "built" && !running && (
            <Button variant="outline" size="sm" className="h-8" onClick={() => ws.build.start({ replay: true })}>
              <Play /> Replay how it was built
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
          {/* Columns and gaps tighten with the space available; below 860px the plan scrolls sideways. */}
          <div
            ref={container}
            className={cn(
              "relative grid min-w-[860px] grid-cols-4 gap-x-8 px-5 pt-6 @min-[1060px]/canvas:gap-x-12 @min-[1060px]/canvas:px-7 @min-[1240px]/canvas:gap-x-14 @min-[1240px]/canvas:px-8",
              running || ws.project.buildState === "draft" ? "pb-56" : "pb-16",
            )}
          >
            {/* Sized by the grid, not by a measured width: a stale wider SVG would hold the canvas open and push lines under the inspector. */}
            <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
              <defs>
                <linearGradient id="edge-hot" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#dfff4f" stopOpacity="0.35" />
                  <stop offset="50%" stopColor="#efff94" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#dfff4f" stopOpacity="0.35" />
                </linearGradient>
                <filter id="edge-glow" x="-20%" y="-50%" width="140%" height="200%">
                  <feGaussianBlur stdDeviation="3" />
                </filter>
              </defs>
              {paths.map((p, i) => {
                const hot = Boolean(related && related.has(p.from) && related.has(p.to));
                const dashed = p.kind === "agent-connection";
                return (
                  <g key={`${p.from}-${p.to}`}>
                    {dashed ? (
                      <motion.path d={p.d} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth={1.2} strokeDasharray="3 4" initial={{ opacity: 0 }} animate={{ opacity: hot ? 0 : 1 }} transition={{ duration: 0.6, delay: 0.5 + i * 0.015 }} />
                    ) : (
                      <motion.path d={p.d} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth={1.2} initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: hot ? 0.25 : 1 }} transition={{ pathLength: { duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.45 + i * 0.02 }, opacity: { duration: 0.3 } }} />
                    )}
                    {hot && (
                      <>
                        <path d={p.d} fill="none" stroke="#dfff4f" strokeOpacity={0.45} strokeWidth={4} filter="url(#edge-glow)" />
                        <path d={p.d} fill="none" stroke="url(#edge-hot)" strokeWidth={1.6} />
                        <path d={p.d} fill="none" stroke="#fff4dc" strokeOpacity={0.9} strokeWidth={1.4} strokeLinecap="round" className="flow" />
                      </>
                    )}
                  </g>
                );
              })}
            </svg>
            {columns.map((c) => (
              <div key={c.title} data-tour-avoid className="relative z-[1] mb-3 flex min-w-0 items-baseline gap-2">
                <c.icon className="size-3.5 shrink-0 translate-y-0.5 text-muted-foreground" aria-hidden />
                <h3 className="text-[12px] font-semibold uppercase tracking-wider text-foreground/80">{c.title}</h3>
                <span className="font-mono text-[11px] text-faint">{c.count}</span>
                <span className="truncate text-[11px] text-faint">· {c.hint}</span>
              </div>
            ))}
            <div className="relative z-[1] space-y-3">
              {bp.screens.map((s, i) => <Land key={s.id} col={0} i={i}><ScreenNode ref={reg(key("screen", s.id))} screen={s} primary={bp.meta.theme.primary} {...common("screen", s.id)} /></Land>)}
            </div>
            <div className="relative z-[1] space-y-3 pt-8">
              {bp.agents.map((a, i) => <Land key={a.id} col={1} i={i}><AgentNode ref={reg(key("agent", a.id))} agent={a} {...common("agent", a.id)} /></Land>)}
            </div>
            <div className="relative z-[1] space-y-3 pt-4">
              {bp.entities.map((e, i) => <Land key={e.id} col={2} i={i}><EntityNode ref={reg(key("entity", e.id))} entity={e} {...common("entity", e.id)} /></Land>)}
            </div>
            <div className="relative z-[1] space-y-3 pt-12">
              {bp.connections.map((c, i) => <Land key={c.id} col={3} i={i}><ConnectionNode ref={reg(key("connection", c.id))} connection={c} {...common("connection", c.id)} /></Land>)}
            </div>
          </div>
        </div>
        <EdgeFade side="left" show={more.left} onNudge={() => nudge(-1)} />
        <EdgeFade side="right" show={more.right} onNudge={() => nudge(1)} />
      </div>

      {running && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 top-[52px] z-[5] shadow-[inset_0_0_160px_rgb(223_255_79/0.09)] transition-opacity" />}
      {/* While a change Work Order waits in the composer, the build quote steps aside: one decision at a time. */}
      <AnimatePresence>{ws.project.buildState === "draft" && !running && ws.build.status !== "done" && !changeOrderOpen && <WorkOrderDock key="dock" />}</AnimatePresence>
      <AnimatePresence>{running && <BuildConsole key="console" />}</AnimatePresence>
      <AnimatePresence>{ws.build.status === "repair" && <RepairOverlay key="repair" />}</AnimatePresence>
      <AnimatePresence>{ws.build.status === "done" && <BuildComplete key="complete" />}</AnimatePresence>
      {tour && !running && <Tour nodes={nodes} scroller={scroller} />}
    </div>
  );
}

/**
 * A soft fade where the plan continues off-screen, with a small button to scroll a column's worth.
 * Keyboard users reach every card with Tab (the browser scrolls it into view), so the button stays out of the tab order.
 */
function EdgeFade({ side, show, onNudge }: { side: "left" | "right"; show: boolean; onNudge: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 z-[4] flex w-16 items-center transition-opacity duration-300",
        side === "left" ? "left-0 justify-start bg-gradient-to-r from-canvas via-canvas/75 to-transparent pl-2" : "right-0 justify-end bg-gradient-to-l from-canvas via-canvas/75 to-transparent pr-3",
        show ? "opacity-100" : "opacity-0",
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={onNudge}
        className={cn(
          "grid size-7 place-items-center rounded-full border border-hairline bg-raised/90 text-muted-foreground shadow-[0_6px_20px_-6px_rgb(0_0_0/0.8)] backdrop-blur transition-colors hover:border-amber/40 hover:text-foreground",
          show ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <Icon className="size-4" />
      </button>
    </div>
  );
}

/** Cards cascade in column by column on first paint. */
function Land({ col, i, children }: { col: number; i: number; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 28, delay: col * 0.07 + i * 0.045 }}>
      {children}
    </motion.div>
  );
}
