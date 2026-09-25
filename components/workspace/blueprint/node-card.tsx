"use client";
import { forwardRef } from "react";
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
    "group relative block w-full rounded-xl border bg-panel text-left transition-[opacity,border-color,box-shadow,transform] duration-200 outline-none",
    "hover:border-[#343947] focus-visible:ring-2 focus-visible:ring-amber/60",
    c.selected ? "border-amber/70 shadow-[0_0_0_1px_rgb(245_165_36/0.35),0_8px_30px_rgb(0_0_0/0.45)]" : "border-hairline shadow-[inset_0_1px_0_rgb(255_255_255/0.03),0_1px_2px_rgb(0_0_0/0.4)]",
    c.dimmed && "opacity-35",
    c.buildState === "pending" && "opacity-45",
    c.buildState === "active" && "border-amber/70 pulse-ring",
  );

function BuildMark({ s }: { s: NodeState | null }) {
  if (!s || s === "pending") return null;
  return (
    <span className={cn("absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border", s === "done" ? "border-read/40 bg-[#10231a] text-read" : "border-amber/50 bg-[#241a08] text-amber")}>
      {s === "done" ? <Check className="size-3" /> : <Loader2 className="size-3 animate-spin" />}
    </span>
  );
}

export const ScreenNode = forwardRef<HTMLButtonElement, Common & { screen: Screen; primary: string }>(function ScreenNode({ screen, primary, ...c }, ref) {
  return (
    <button ref={ref} className={shell(c)} onClick={c.onSelect} onMouseEnter={() => c.onHover(true)} onMouseLeave={() => c.onHover(false)} onFocus={() => c.onHover(true)} onBlur={() => c.onHover(false)} aria-pressed={c.selected}>
      <BuildMark s={c.buildState} />
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <DynamicIcon name={screen.icon} className="size-3.5 text-muted-foreground" />
        <span className="truncate text-[13px] font-medium">{screen.title}</span>
        <span className={cn("ml-auto rounded px-1.5 py-px text-[10px]", screen.audience === "customer" ? "bg-change/10 text-change" : "bg-raised text-muted-foreground")}>{screen.audience === "customer" ? "customers" : screen.audience}</span>
      </div>
      <div className="px-3 pb-3 pt-2">
        <div className="rounded-md border border-white/[0.06] bg-white/[0.015] p-1.5">
          <ScreenThumb screen={screen} primary={primary} />
        </div>
      </div>
    </button>
  );
});

export const AgentNode = forwardRef<HTMLButtonElement, Common & { agent: Agent }>(function AgentNode({ agent, ...c }, ref) {
  const counts = { read: 0, write: 0, irreversible: 0 };
  agent.tools.forEach((t) => counts[t.access]++);
  const ungated = agent.tools.some((t) => t.access === "irreversible" && t.permission !== "ask");
  return (
    <button ref={ref} className={shell(c)} onClick={c.onSelect} onMouseEnter={() => c.onHover(true)} onMouseLeave={() => c.onHover(false)} onFocus={() => c.onHover(true)} onBlur={() => c.onHover(false)} aria-pressed={c.selected}>
      <BuildMark s={c.buildState} />
      <div className="flex items-start gap-2.5 p-3">
        <Avatar name={agent.name} hue={agent.avatarHue} size={30} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium">{agent.name}</span>
            <span className="ml-auto shrink-0 rounded bg-deep px-1.5 py-px font-mono text-[10px] text-faint" title={FRAMEWORK_LABEL[agent.framework]}>{SHORT_FW[agent.framework]}</span>
          </p>
          <p className="truncate text-[11.5px] text-muted-foreground">{agent.role}</p>
        </div>
      </div>
      <div className="flex items-center gap-2.5 overflow-hidden border-t border-hairline px-3 py-2">
        {counts.read > 0 && <Dot cls="bg-read" n={counts.read} label="read" />}
        {counts.write > 0 && <Dot cls="bg-change" n={counts.write} label="change" />}
        {counts.irreversible > 0 && <Dot cls="bg-ask" n={counts.irreversible} label={ungated ? "ungated" : "ask"} warn={ungated} />}
      </div>
    </button>
  );
});

const SHORT_FW: Record<Agent["framework"], string> = { lyzr: "Lyzr", langgraph: "LangGraph", crewai: "CrewAI", openai_agents: "OpenAI", google_adk: "ADK", mastra: "Mastra" };

function Dot({ cls, n, label, warn }: { cls: string; n: number; label: string; warn?: boolean }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[10.5px]", warn ? "text-ask" : "text-muted-foreground")} title={`${n} ${label}`}>
      <span className={cn("size-1.5 rounded-full", cls)} />
      {n} {label}
    </span>
  );
}

export const EntityNode = forwardRef<HTMLButtonElement, Common & { entity: Entity }>(function EntityNode({ entity, ...c }, ref) {
  return (
    <button ref={ref} className={shell(c)} onClick={c.onSelect} onMouseEnter={() => c.onHover(true)} onMouseLeave={() => c.onHover(false)} onFocus={() => c.onHover(true)} onBlur={() => c.onHover(false)} aria-pressed={c.selected}>
      <BuildMark s={c.buildState} />
      <div className="flex items-center gap-2.5 p-3">
        <span className="grid size-7 place-items-center rounded-lg border border-hairline bg-raised"><Database className="size-3.5 text-muted-foreground" /></span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{entity.plural}</p>
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
      <div className="flex items-center gap-2.5 p-3">
        <span className="grid size-7 place-items-center rounded-lg border border-hairline bg-raised"><ConnectionIcon kind={connection.kind} className="size-3.5 text-muted-foreground" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{connection.name}</p>
          <p className={cn("flex items-center gap-1 truncate text-[11.5px]", missing ? "text-amber" : "text-muted-foreground")}>
            {missing ? <><KeyRound className="size-3" />Needs a key · test data</> : <><span className="size-1.5 rounded-full bg-read" />Connected</>}
          </p>
        </div>
      </div>
    </button>
  );
});
