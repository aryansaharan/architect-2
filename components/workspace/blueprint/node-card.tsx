"use client";
import { forwardRef } from "react";
import { motion } from "motion/react";
import { Check, Database, KeyRound, Loader2 } from "lucide-react";
import type { Agent, Connection, Entity, Screen } from "@/lib/blueprint/schema";
import { Avatar } from "@/components/arch/badges";
import { ConnectionIcon, DynamicIcon } from "@/components/icon";
import { FRAMEWORK_LABEL } from "@/lib/blueprint/describe";
import { cn } from "@/lib/utils";
import type { NodeState } from "../use-build-runner";
import { ScreenThumb } from "../screen-thumb";

type Common = {
  selected: boolean;
  dimmed: boolean;
  buildState: NodeState | null;
  onSelect: () => void;
  onHover: (h: boolean) => void;
};

const shell = (c: Common) =>
  cn(
    "@container group relative block w-full rounded-xl border text-left outline-none transition-[opacity,border-color,box-shadow,transform,filter] duration-300 ease-out",
    "bg-[linear-gradient(180deg,rgb(255_255_255/0.03),rgb(255_255_255/0)_45%)] bg-panel",
    "hover:-translate-y-0.5 hover:border-hairline-hi hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),0_12px_30px_-10px_rgb(0_0_0/0.7)] focus-visible:ring-2 focus-visible:ring-amber/60",
    c.selected
      ? "border-amber/70 shadow-[0_0_0_1px_rgb(223_255_79/0.45),0_0_44px_-8px_rgb(223_255_79/0.55),0_14px_34px_-12px_rgb(0_0_0/0.8)]"
      : "border-hairline shadow-[inset_0_1px_0_rgb(255_255_255/0.035),0_1px_2px_rgb(0_0_0/0.45)]",
    c.dimmed && "opacity-30 saturate-50",
    c.buildState === "pending" && "opacity-40 saturate-50",
    c.buildState === "active" && "beam border-amber/40 shadow-[0_0_50px_-10px_rgb(223_255_79/0.6)]",
  );

/** Card titles wrap to two lines instead of cutting names like "Dispatch Coordinator" short. */
const TITLE = "line-clamp-2 min-w-0 break-words text-[13px] font-medium leading-snug";

function Scan({ s }: { s: NodeState | null }) {
  return s === "active" ? <span className="scanline" aria-hidden /> : null;
}

function BuildMark({ s }: { s: NodeState | null }) {
  if (!s || s === "pending") return null;
  return (
    <motion.span
      key={s}
      initial={{ scale: 0, rotate: -45 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 520, damping: 18 }}
      className={cn("absolute -right-1.5 -top-1.5 z-[3] grid size-5 place-items-center rounded-full border", s === "done" ? "border-read/40 bg-[#10231a] text-read shadow-[0_0_12px_rgb(61_214_140/0.5)]" : "border-amber/50 bg-[#241a08] text-amber")}
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
        <span className={cn("mt-px shrink-0 rounded px-1.5 py-px text-[10px]", screen.audience === "customer" ? "bg-change/10 text-change" : "bg-raised text-muted-foreground")}>{screen.audience === "customer" ? "customers" : screen.audience}</span>
      </div>
      <div className="px-3 pb-3 pt-2">
        <div className="rounded-md border border-white/[0.06] bg-white/[0.015] p-1.5">
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
            <span className="mt-px hidden shrink-0 rounded bg-deep px-1.5 py-px font-mono text-[10px] text-faint @[230px]:inline-block" title={FRAMEWORK_LABEL[agent.framework]}>{SHORT_FW[agent.framework]}</span>
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground" title={agent.role}>{agent.role}</p>
        </div>
      </div>
      <div className="flex items-center gap-2.5 overflow-hidden border-t border-hairline px-3 py-2">
        {n.read > 0 && <Dot cls="bg-read" n={n.read} label="read" title={`${plural(n.read, "tool reads", "tools read")} without asking`} />}
        {n.change > 0 && <Dot cls="bg-change" n={n.change} label="change" title={`${plural(n.change, "tool changes", "tools change")} things you can undo, without asking`} />}
        {n.ask > 0 && <Dot cls="bg-ask" n={n.ask} label={<>ask<span className="hidden @[230px]:inline"> first</span></>} title={`${plural(n.ask, "tool asks", "tools ask")} a person first, every time`} />}
        {n.ungated > 0 && <Dot cls="bg-ask" n={n.ungated} label="ungated" title={`${plural(n.ungated, "tool", "tools")} can't be undone and ${n.ungated === 1 ? "doesn't" : "don't"} ask first`} warn />}
        {agent.tools.length === 0 && <span className="text-[10.5px] text-faint">No tools yet</span>}
      </div>
    </button>
  );
});

const SHORT_FW: Record<Agent["framework"], string> = { lyzr: "Lyzr", langgraph: "LangGraph", crewai: "CrewAI", openai_agents: "OpenAI", google_adk: "ADK", mastra: "Mastra" };

function Dot({ cls, n, label, title, warn }: { cls: string; n: number; label: React.ReactNode; title: string; warn?: boolean }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[10.5px]", warn ? "text-ask" : "text-muted-foreground")} title={title}>
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
        <span className="grid size-7 place-items-center rounded-lg border border-hairline bg-raised"><Database className="size-3.5 text-muted-foreground" /></span>
        <div className="min-w-0">
          <p className={TITLE} title={entity.plural}>{entity.plural}</p>
          <p className="truncate text-[11.5px] text-muted-foreground">{entity.fields.length} details · {entity.sample.length} sample records</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 px-3 pb-3">
        {entity.fields.slice(0, 4).map((f) => (
          <span key={f.name} className="rounded bg-deep px-1.5 py-px font-mono text-[10px] text-faint">{f.name}</span>
        ))}
        {entity.fields.length > 4 && <span className="px-1 font-mono text-[10px] text-faint">+{entity.fields.length - 4}</span>}
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
        <span className="grid size-7 place-items-center rounded-lg border border-hairline bg-raised"><ConnectionIcon kind={connection.kind} className="size-3.5 text-muted-foreground" /></span>
        <div className="min-w-0 flex-1">
          <p className={TITLE} title={connection.name}>{connection.name}</p>
          <p className={cn("flex items-center gap-1 truncate text-[11.5px]", missing ? "text-amber" : "text-muted-foreground")}>
            {missing ? <><KeyRound className="size-3" />Not connected · test data</> : <><span className="size-1.5 rounded-full bg-read" />Connected</>}
          </p>
        </div>
      </div>
    </button>
  );
});
