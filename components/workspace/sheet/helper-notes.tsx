"use client";
import { Fragment } from "react";
import { Check, PenLine } from "lucide-react";
import type { Agent, Blueprint, Connection } from "@/lib/blueprint/schema";
import { lowerFirst } from "@/lib/blueprint/describe";
import { cn } from "@/lib/utils";
import type { NodeState } from "../use-build-runner";

/** Sticky notes sit a little askew, the way they land on paper. Fixed per position: nothing moves. */
const TILT = ["-1.2deg", "0.9deg", "-0.5deg", "1.3deg", "-0.9deg", "0.4deg"];

/** One AI helper as a sticky note: its name, its job in a line, and what it asks you before doing. */
function HelperNote({ agent, i, state, waiting }: { agent: Agent; i: number; state: NodeState | null; waiting: boolean }) {
  const asks = agent.tools.filter((t) => t.permission === "ask");
  return (
    <li className="sticky-note flex w-full flex-col rounded-[3px] p-4 sm:w-[236px]" style={{ rotate: TILT[i % TILT.length] }}>
      <p className="font-pencil text-[27px] leading-none text-foreground">{agent.name}</p>
      <p className="mt-2 font-sketch text-[13px] leading-snug text-foreground/80">{agent.role}</p>
      {asks.length > 0 && (
        <p className="mt-2.5 font-sketch text-[12.5px] leading-snug text-foreground/70">
          asks you before:{" "}
          {asks.map((t, k) => (
            <Fragment key={t.id}>
              {k > 0 && (k === asks.length - 1 ? " and " : ", ")}
              {/* Rose only for what can't be undone. */}
              <span className={cn(t.access === "irreversible" && "text-ask")}>{lowerFirst(t.name)}</span>
            </Fragment>
          ))}
        </p>
      )}
      {waiting ? (
        <p className="mt-auto pt-3 font-sketch text-[12px] text-fix">a fix to pick, above</p>
      ) : state ? (
        <p className={cn("mt-auto inline-flex items-center gap-1 pt-3 font-sketch text-[12px]", state === "done" ? "text-read" : state === "active" ? "text-brand" : "text-foreground/45")}>
          {state === "done" ? <><Check className="size-3" aria-hidden />ready</> : state === "active" ? <><PenLine className="size-3" aria-hidden />learning its job</> : "waiting"}
        </p>
      ) : null}
    </li>
  );
}

export function HelperNotes({ bp, stateOf, waitingOn = null }: { bp: Blueprint; stateOf: (id: string) => NodeState | null; waitingOn?: string | null }) {
  if (!bp.agents.length) return null;
  return (
    <ul aria-label="AI helpers" className="flex flex-wrap gap-5 px-1 sm:gap-6">
      {bp.agents.map((a, i) => <HelperNote key={a.id} agent={a} i={i} state={stateOf(a.id)} waiting={waitingOn === a.id} />)}
    </ul>
  );
}

/** What the app touches, as small pencil labels. Anything without a key yet says it runs on test data. */
export function ConnectionLabels({ connections, stateOf }: { connections: Connection[]; stateOf: (id: string) => NodeState | null }) {
  if (!connections.length) return null;
  return (
    <ul aria-label="Connections" className="flex flex-wrap gap-2">
      {connections.map((c) => {
        const state = stateOf(c.id);
        return (
          <li key={c.id} className={cn("sketch-soft max-w-full bg-panel px-2.5 py-1 font-sketch text-[12.5px] leading-snug text-foreground/85 transition-colors duration-500", state === "done" && "border-solid border-read/50")}>
            {state === "done" && <Check className="mr-1.5 inline size-3 align-[-1px] text-read" aria-hidden />}
            {c.name}
            {c.status === "missing" && <span className="text-muted-foreground"> · not connected yet · test data</span>}
            {state === "done" && <span className="sr-only">, ready</span>}
          </li>
        );
      })}
    </ul>
  );
}
