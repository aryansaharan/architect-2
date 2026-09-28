"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { Check, ChevronRight, Hand, Loader2, Lock, Pencil, Search, ShieldAlert, X } from "lucide-react";
import type { UIMessage } from "ai";
import type { Agent, AgentTool, Blueprint } from "@/lib/blueprint/schema";
import { connectionName, lowerFirst } from "@/lib/blueprint/describe";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { DUR, EASE } from "@/lib/motion";

export type ToolPart = {
  type: string;
  toolCallId: string;
  state: "input-streaming" | "input-available" | "approval-requested" | "approval-responded" | "output-available" | "output-error" | "output-denied";
  input?: { query?: string };
  output?: unknown;
  errorText?: string;
  approval?: { id: string; approved?: boolean; isAutomatic?: boolean; reason?: string };
};

export function isToolPart(p: UIMessage["parts"][number]): p is UIMessage["parts"][number] & ToolPart {
  return typeof p.type === "string" && p.type.startsWith("tool-") && "toolCallId" in p;
}

const ACCESS_ICON = { read: Search, write: Pencil, irreversible: Lock } as const;

export function TraceRow({ part, tool, bp, theme = "studio" }: { part: ToolPart; tool: AgentTool | undefined; bp: Blueprint; theme?: "studio" | "app" }) {
  const [open, setOpen] = useState(false);
  const access = tool?.access ?? "read";
  const I = ACCESS_ICON[access];
  const status =
    part.state === "output-available" ? (part.approval && !part.approval.isAutomatic ? "approved · done" : access === "write" ? "done · logged" : "done")
    : part.state === "output-denied" ? "denied"
    : part.state === "output-error" ? "failed"
    : part.state === "approval-responded" ? (part.approval?.approved ? "approved · running" : "denied")
    : part.state === "approval-requested" ? "waiting for you"
    : "running";
  const studio = theme === "studio";
  return (
    <div className={cn("rounded-md border text-meta", studio ? "border-hairline bg-panel" : "border-slate-200 bg-slate-50")}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left" aria-expanded={open}>
        <I className={cn("size-3.5 shrink-0", access === "read" ? "text-read" : access === "write" ? "text-change" : "text-ask", !studio && (access === "read" ? "text-emerald-600" : access === "write" ? "text-blue-600" : "text-rose-600"))} />
        <span className={cn("shrink-0 whitespace-nowrap font-medium", studio ? "text-foreground" : "text-slate-800")}>{tool?.name ?? part.type.slice(5)}</span>
        <span className={cn("truncate", studio ? "text-muted-foreground" : "text-slate-500")}>{part.input?.query ? `“${part.input.query}”` : ""}</span>
        <span className={cn("ml-auto shrink-0", part.state === "output-denied" ? (studio ? "text-foreground/80" : "text-rose-600") : studio ? "text-faint" : "text-slate-400")}>
          {status === "running" || status === "approved · running" ? <Loader2 className="inline size-3 animate-spin" /> : null} {status}
        </span>
        <ChevronRight className={cn("size-3 shrink-0 transition-transform duration-150 ease-paper", open && "rotate-90", studio ? "text-faint" : "text-slate-400")} />
      </button>
      {open && (
        <div className={cn("border-t px-2.5 py-2 font-mono text-badge", studio ? "border-hairline text-muted-foreground" : "border-slate-200 text-slate-600")}>
          <p>tool: {part.type.slice(5)} · {tool ? connectionName(bp, tool.connectionId) : ""} · access: {access}</p>
          {part.output !== undefined && <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap">{JSON.stringify(part.output, null, 2)}</pre>}
          {part.errorText && <p className={cn("mt-1", studio ? "text-foreground/85" : "text-rose-600")}>{part.errorText}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Rose means "can't be undone" everywhere in the product, so only those actions get the rose card.
 * Anything else that waits (a look-up or an undoable change set to "Ask first") gets a calm paper note,
 * so the danger colour keeps its meaning and people don't learn to click through it.
 */
const GATE_COPY = {
  irreversible: { tag: "Can't be undone", body: "This can't be undone, so it always asks a person first." },
  write: { tag: "Ask first", body: "This changes a record, and you can undo it later. The tool is set to “Ask first”, so it waits for you." },
  read: { tag: "Ask first", body: "This only looks something up and changes nothing. The tool is set to “Ask first”, so it waits for you." },
} as const;

export function ApprovalCard({
  part,
  tool,
  agent,
  onRespond,
  theme = "studio",
}: {
  part: ToolPart;
  tool: AgentTool | undefined;
  agent: Agent;
  onRespond: (decision: "once" | "always" | "deny") => void;
  theme?: "studio" | "app";
}) {
  const access = tool?.access ?? "irreversible"; // an unknown tool is treated as the riskiest kind
  const irreversible = access === "irreversible";
  const copy = GATE_COPY[access];
  const studio = theme === "studio";
  const Icon = irreversible ? ShieldAlert : Hand;
  return (
    <motion.div
      role="group"
      aria-label="Approval needed"
      data-gate={irreversible ? "irreversible" : "ask"}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.panel, ease: EASE }}
      className={cn(
        "rounded-md border p-3",
        irreversible
          ? studio ? "border-ask/40 bg-ask/[0.06]" : "border-rose-200 bg-rose-50"
          : studio ? "border-hairline-hi bg-panel shadow-hair" : "border-amber-200 bg-amber-50/70",
      )}
    >
      <p className={cn("flex items-center gap-2 text-ui font-semibold", studio ? "text-foreground" : "text-slate-900")}>
        <Icon className={cn("size-4 shrink-0", irreversible ? (studio ? "text-ask" : "text-rose-600") : studio ? "text-brand" : "text-amber-600")} />
        <span className="min-w-0">{agent.name} wants to {lowerFirst(tool?.name ?? part.type.slice(5))}</span>
        {studio ? (
          <Pill tone={irreversible ? "ask" : "brand"} className="ml-auto">{copy.tag}</Pill>
        ) : (
          <span className={cn("ml-auto shrink-0 whitespace-nowrap rounded-full border px-2 py-px text-badge font-medium", irreversible ? "border-rose-200 bg-white text-rose-700" : "border-amber-200 bg-white text-amber-700")}>{copy.tag}</span>
        )}
      </p>
      {part.input?.query && <p className={cn("mt-1.5 rounded-md px-2 py-1.5 font-mono text-badge", studio ? "border border-hairline bg-panel text-foreground/85" : "bg-white text-slate-700")}>{part.input.query}</p>}
      <p className={cn("mt-2 text-meta", studio ? "text-muted-foreground" : "text-slate-600")}>
        {copy.body} Sandbox: nothing leaves the building in the test version.
      </p>
      {/* The app theme keeps the generated app's own slate look; the studio uses the one Button. */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => onRespond("once")} className={cn(!studio && "rounded-md bg-slate-900 text-white hover:bg-slate-800")}>
          <Check /> Allow once
        </Button>
        {!irreversible && (
          <Button variant="outline" onClick={() => onRespond("always")} title="Sets this tool to “Tell me”: it runs straight away and tells you what it did." className={cn(!studio && "rounded-md border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50")}>
            Always allow
          </Button>
        )}
        <Button variant={studio ? "ghost" : "outline"} onClick={() => onRespond("deny")} className={cn(studio ? "text-muted-foreground" : "rounded-md border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50")}>
          <X /> Deny
        </Button>
      </div>
      {irreversible && <p className={cn("mt-2 text-badge", studio ? "text-faint" : "text-slate-400")}>“Always allow” isn&apos;t offered for actions that can&apos;t be undone.</p>}
    </motion.div>
  );
}
