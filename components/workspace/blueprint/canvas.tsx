"use client";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Blocks, Bot, Database, Play, Plug } from "lucide-react";
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

type Edge = { from: string; to: string; kind: "screen-agent" | "agent-entity" | "agent-connection" };
type Path = Edge & { d: string };
const key = (type: ObjectType, id: string) => `${type}:${id}`;

export function BlueprintCanvas({ tour }: { tour: boolean }) {
  const ws = useWorkspace();
  const bp = ws.blueprint;
  const container = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const [paths, setPaths] = useState<Path[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<string | null>(null);

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

  const measure = useCallback(() => {
    const root = container.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    setSize({ w: root.scrollWidth, h: root.scrollHeight });
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
  }, [edges]);

  useLayoutEffect(() => {
    measure();
    const root = container.current;
    if (!root) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const focusKey = hover ?? (ws.selected ? key(ws.selected.type, ws.selected.id) : null);
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
      <div className="flex items-center gap-3 border-b border-hairline px-5 py-2.5">
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

      <div className="dot-grid relative min-h-0 flex-1 overflow-auto" onClick={(e) => e.target === e.currentTarget && ws.select(null)}>
        <div ref={container} className={cn("relative grid min-w-[980px] grid-cols-4 gap-x-14 px-8 pt-6", running || ws.project.buildState === "draft" ? "pb-56" : "pb-16")}>
          <svg className="pointer-events-none absolute left-0 top-0" width={size.w} height={size.h} aria-hidden>
            {paths.map((p, i) => {
              const hot = related && related.has(p.from) && related.has(p.to);
              return (
                <path
                  key={i}
                  d={p.d}
                  fill="none"
                  stroke={hot ? "rgb(245 165 36 / 0.7)" : p.kind === "agent-connection" ? "rgb(255 255 255 / 0.06)" : "rgb(255 255 255 / 0.11)"}
                  strokeWidth={hot ? 1.6 : 1.2}
                  strokeDasharray={p.kind === "agent-connection" ? "3 4" : undefined}
                  style={{ transition: "stroke 150ms" }}
                />
              );
            })}
          </svg>
          {columns.map((c) => (
            <div key={c.title} className="relative z-[1] mb-3 flex items-baseline gap-2">
              <c.icon className="size-3.5 translate-y-0.5 text-muted-foreground" aria-hidden />
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-foreground/80">{c.title}</h3>
              <span className="font-mono text-[11px] text-faint">{c.count}</span>
              <span className="text-[11px] text-faint">· {c.hint}</span>
            </div>
          ))}
          <div className="relative z-[1] space-y-3">
            {bp.screens.map((s) => <ScreenNode key={s.id} ref={reg(key("screen", s.id))} screen={s} primary={bp.meta.theme.primary} {...common("screen", s.id)} />)}
          </div>
          <div className="relative z-[1] space-y-3 pt-8">
            {bp.agents.map((a) => <AgentNode key={a.id} ref={reg(key("agent", a.id))} agent={a} {...common("agent", a.id)} />)}
          </div>
          <div className="relative z-[1] space-y-3 pt-4">
            {bp.entities.map((e) => <EntityNode key={e.id} ref={reg(key("entity", e.id))} entity={e} {...common("entity", e.id)} />)}
          </div>
          <div className="relative z-[1] space-y-3 pt-12">
            {bp.connections.map((c) => <ConnectionNode key={c.id} ref={reg(key("connection", c.id))} connection={c} {...common("connection", c.id)} />)}
          </div>
        </div>
      </div>

      {ws.project.buildState === "draft" && !running && <WorkOrderDock />}
      {running && <BuildConsole />}
      {ws.build.status === "repair" && <RepairOverlay />}
      {tour && !running && <Tour />}
    </div>
  );
}
