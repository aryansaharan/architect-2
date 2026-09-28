"use client";
import { forwardRef } from "react";
import { motion } from "motion/react";
import { Check, Database, KeyRound, Loader2 } from "lucide-react";
import type { Agent, Connection, Entity, Screen } from "@/lib/blueprint/schema";
import { Avatar } from "@/components/arch/badges";
import { ConnectionIcon, DynamicIcon } from "@/components/icon";
import { FRAMEWORK_LABEL } from "@/lib/blueprint/describe";
import { cn } from "@/lib/utils";
import { DUR, EASE } from "@/lib/motion";
import type { NodeState } from "../use-build-runner";
import { ScreenThumb } from "../screen-thumb";

type Common = {
  selected: boolean;
  dimmed: boolean;
  buildState: NodeState | null;
  onSelect: () => void;
  onHover: (h: boolean) => void;
};

/**
 * A card on the plan, drawn like a box on paper: a soft graphite line with uneven corners, no shadow.
 * Hover darkens the line (nothing lifts); selected is a brand line; building is a quiet ink line moving down.
 */
const shell = (c: Common) =>
  cn(
    "@container group relative block w-full text-left outline-none transition-[opacity,border-color] duration-150 ease-paper",
    "sketch border-foreground/40 bg-panel",
    "hover:border-foreground/70 focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    c.selected && "border-brand hover:border-brand",
    c.dimmed && "opacity-35",
    c.buildState === "pending" && "pencil-state",
    c.buildState === "active" && "border-brand",
    c.buildState === "done" && "ink-in",
  );

/** Card titles, in the UI's own type: they wrap to two lines instead of cutting names like "Dispatch Coordinator" short. */
const TITLE = "line-clamp-2 min-w-0 break-words text-ui font-medium";

function Scan({ s }: { s: NodeState | null }) {
  return s === "active" ? <span className="scanline" aria-hidden /> : null;
}

function BuildMark({ s }: { s: NodeState | null }) {
  if (!s || s === "pending") return null;
  return (
    <motion.span
      key={s}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: DUR.hover, ease: EASE }}
      className={cn("absolute -right-1.5 -top-1.5 z-[3] grid size-5 place-items-center rounded-full border bg-panel", s === "done" ? "border-ok/50 text-ok" : "border-brand/50 text-brand")}
    >
      {s === "done" ? <Check className="size-3" strokeWidth={3} /> : <Loader2 className="size-3 animate-spin" />}
    </motion.span>
  );
}

export const ScreenNode = forwardRef<HTMLButtonElement, Common & { screen: Screen; primary: string }>(function ScreenNode({ screen, primary, ...c }, ref) {
  return (
    <button ref={ref} className={shell(c)} onClick={c.onSelect} onMouseEnter={() => c.onHover(true)} onMouseLeave={() => c.onHover(false)} onFocus={() => c.onHover(true)} onBlur={() => c.onHover(false)} aria-pressed={c.selected}>
      <BuildMark s={c.buildState} />
      <Scan s={c.buildState} />
      <div className="flex items-start gap-2 px-3 pt-2.5">
        <DynamicIcon name={screen.icon} className="mt-[3px] size-3.5 shrink-0 text-muted-foreground" />
        <span className={cn(TITLE, "flex-1")} title={screen.title}>{screen.title}</span>
        <span className={cn("mt-px shrink-0 rounded-sm px-1.5 py-px text-badge", screen.audience === "customer" ? "border border-hairline-hi text-foreground/80" : "bg-deep text-muted-foreground")}>{screen.audience === "customer" ? "customers" : screen.audience}</span>
      </div>
      <div className="px-3 pb-3 pt-2">
        <div className="rounded-md border border-hairline bg-canvas p-1.5">
          <ScreenThumb screen={screen} primary={primary} />
        </div>
      </div>
    </button>
  );
});

/**
 * Each tool counted once, by what happens when the agent uses it, so the card reads like the
 * inspector's tool list: anything on "Ask first" (set per tool, or by a supervision preset) is
 * an ask, whatever it touches. The rest run on their own: reads, undoable changes, and
 * "ungated" for a tool that can't be undone and doesn't ask.
 */
export function toolCounts(agent: Agent) {
  const n = { read: 0, change: 0, ask: 0, ungated: 0 };
  for (const t of agent.tools) {
    if (t.permission === "ask") n.ask++;
    else if (t.access === "irreversible") n.ungated++;
    else if (t.access === "write") n.change++;
    else n.read++;
  }
  return n;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const AgentNode = forwardRef<HTMLButtonElement, Common & { agent: Agent }>(function AgentNode({ agent, ...c }, ref) {
  const n = toolCounts(agent);
  return (
    <button ref={ref} className={shell(c)} onClick={c.onSelect} onMouseEnter={() => c.onHover(true)} onMouseLeave={() => c.onHover(false)} onFocus={() => c.onHover(true)} onBlur={() => c.onHover(false)} aria-pressed={c.selected}>
      <BuildMark s={c.buildState} />
      <Scan s={c.buildState} />
      <div className="flex items-start gap-2.5 p-3">
        <Avatar name={agent.name} hue={agent.avatarHue} size={30} />
        <div className="min-w-0 flex-1">
          <p className="flex items-start gap-2">
            <span className={cn(TITLE, "flex-1")} title={agent.name}>{agent.name}</span>
            <span className="mt-px hidden shrink-0 rounded-sm bg-deep px-1.5 py-px text-badge text-muted-foreground @[230px]:inline-block" title={FRAMEWORK_LABEL[agent.framework]}>{SHORT_FW[agent.framework]}</span>
          </p>
          <p className="mt-0.5 truncate text-meta text-muted-foreground" title={agent.role}>{agent.role}</p>
        </div>
      </div>
      <div className="flex items-center gap-2.5 overflow-hidden border-t border-dashed border-hairline-hi px-3 py-2">
        {n.read > 0 && <Dot cls="bg-read" n={n.read} label="read" title={`${plural(n.read, "tool reads", "tools read")} without asking`} />}
        {n.change > 0 && <Dot cls="bg-change" n={n.change} label="change" title={`${plural(n.change, "tool changes", "tools change")} things you can undo, without asking`} />}
        {n.ask > 0 && <Dot cls="bg-brand" n={n.ask} label={<>ask<span className="hidden @[230px]:inline"> first</span></>} title={`${plural(n.ask, "tool asks", "tools ask")} a person first, every time`} />}
        {n.ungated > 0 && <Dot cls="bg-ask" n={n.ungated} label="ungated" title={`${plural(n.ungated, "tool", "tools")} can't be undone and ${n.ungated === 1 ? "doesn't" : "don't"} ask first`} warn />}
        {agent.tools.length === 0 && <span className="text-badge text-faint">No tools yet</span>}
      </div>
    </button>
  );
});

const SHORT_FW: Record<Agent["framework"], string> = { lyzr: "Lyzr", langgraph: "LangGraph", crewai: "CrewAI", openai_agents: "OpenAI", google_adk: "ADK", mastra: "Mastra" };

function Dot({ cls, n, label, title, warn }: { cls: string; n: number; label: React.ReactNode; title: string; warn?: boolean }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-badge", warn ? "text-ask" : "text-muted-foreground")} title={title}>
      <span className={cn("size-1.5 rounded-full", cls, warn && "ring-2 ring-ask/25")} />
      {n} {label}
    </span>
  );
}

export const EntityNode = forwardRef<HTMLButtonElement, Common & { entity: Entity }>(function EntityNode({ entity, ...c }, ref) {
  return (
    <button ref={ref} className={shell(c)} onClick={c.onSelect} onMouseEnter={() => c.onHover(true)} onMouseLeave={() => c.onHover(false)} onFocus={() => c.onHover(true)} onBlur={() => c.onHover(false)} aria-pressed={c.selected}>
      <BuildMark s={c.buildState} />
      <Scan s={c.buildState} />
      <div className="flex items-center gap-2.5 p-3">
        <span className="grid size-7 place-items-center rounded-md border border-hairline bg-canvas"><Database className="size-3.5 text-muted-foreground" /></span>
        <div className="min-w-0">
          <p className={TITLE} title={entity.plural}>{entity.plural}</p>
          <p className="truncate text-meta text-muted-foreground">{entity.fields.length} details · {entity.sample.length} sample records</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 px-3 pb-3">
        {entity.fields.slice(0, 4).map((f) => (
          <span key={f.name} className="rounded-sm bg-deep px-1.5 py-px font-mono text-badge text-muted-foreground">{f.name}</span>
        ))}
        {entity.fields.length > 4 && <span className="px-1 text-badge tabular-nums text-faint">+{entity.fields.length - 4}</span>}
      </div>
    </button>
  );
});

export const ConnectionNode = forwardRef<HTMLButtonElement, Common & { connection: Connection }>(function ConnectionNode({ connection, ...c }, ref) {
  const missing = connection.status === "missing";
  return (
    <button ref={ref} className={shell(c)} onClick={c.onSelect} onMouseEnter={() => c.onHover(true)} onMouseLeave={() => c.onHover(false)} onFocus={() => c.onHover(true)} onBlur={() => c.onHover(false)} aria-pressed={c.selected}>
      <BuildMark s={c.buildState} />
      <Scan s={c.buildState} />
      <div className="flex items-center gap-2.5 p-3">
        <span className="grid size-7 place-items-center rounded-md border border-hairline bg-canvas"><ConnectionIcon kind={connection.kind} className="size-3.5 text-muted-foreground" /></span>
        <div className="min-w-0 flex-1">
          <p className={TITLE} title={connection.name}>{connection.name}</p>
          <p className={cn("flex items-center gap-1 truncate text-meta", missing ? "text-foreground/80" : "text-muted-foreground")}>
            {missing ? <><KeyRound className="size-3" />Not connected · test data</> : <><span className="size-1.5 rounded-full bg-ok" />Connected</>}
          </p>
        </div>
      </div>
    </button>
  );
});
