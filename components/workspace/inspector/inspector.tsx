"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ObjectRef } from "@/lib/blueprint/schema";
import Link from "next/link";
import { Bot, Database, FileCode2, LayoutDashboard, MessageSquarePlus, Plug, Square, UsersRound, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/arch/segmented";
import { resolveRef, type ResolvedObject } from "@/lib/blueprint";
import { useWorkspace } from "../context";
import { AgentPlain, AgentSpec } from "./agent-faces";
import { BlockPlain, BlockSpec, BriefPlain, BriefSpec, ConnectionPlain, ConnectionSpec, EntityPlain, EntitySpec, ScreenPlain, ScreenSpec } from "./other-faces";
import { CodeFace } from "./code-face";

export type Face = "plain" | "spec" | "code";

const TYPE_META: Record<ResolvedObject["type"], { label: string; icon: typeof Bot }> = {
  screen: { label: "Screen", icon: LayoutDashboard },
  block: { label: "Block", icon: Square },
  agent: { label: "AI helper", icon: Bot },
  entity: { label: "Data", icon: Database },
  connection: { label: "Connection", icon: Plug },
  brief: { label: "Project", icon: FileText },
};

export function Inspector() {
  const ws = useWorkspace();
  const [face, setFace] = useState<Face>("plain");
  // Keep showing the last object while the panel animates closed.
  const [shown, setShown] = useState<ObjectRef | null>(ws.selected);
  if (ws.selected && (ws.selected.type !== shown?.type || ws.selected.id !== shown?.id)) setShown(ws.selected);
  const target = ws.selected ?? shown;
  const resolved = resolveRef(ws.blueprint, target);
  if (!target || !resolved) return null;
  const meta = TYPE_META[resolved.type];
  const name =
    resolved.type === "brief"
      ? resolved.value.name
      : resolved.type === "block"
        ? ("title" in resolved.value && resolved.value.title) || resolved.value.type
        : resolved.type === "entity"
          ? resolved.value.plural
          : "title" in resolved.value
            ? resolved.value.title
            : resolved.value.name;

  return (
    <aside aria-label="Inspector" className="flex h-full w-[392px] shrink-0 flex-col border-l border-hairline bg-canvas max-2xl:w-[360px]">
      <div className="flex items-start gap-3 border-b border-hairline px-4 pb-3 pt-3.5">
        <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-md border border-hairline bg-panel">
          <meta.icon className="size-3.5 text-muted-foreground" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] text-muted-foreground">{meta.label}</p>
          <h2 className="truncate font-pencil text-[28px] leading-[1.15]">{name}</h2>
        </div>
        <Button variant="ghost" size="icon-sm" className="-mr-1" onClick={() => ws.select(null)} aria-label="Close inspector">
          <X />
        </Button>
      </div>
      <div className="flex items-center justify-between px-4 py-2.5">
        <Segmented<Face>
          ariaLabel="Depth"
          value={face}
          onChange={setFace}
          options={[
            { value: "plain", label: "Plain", title: "What it does, in plain English" },
            { value: "spec", label: "Settings", title: "The structured settings, editable" },
            { value: "code", label: <><FileCode2 className="size-3" />Code</>, title: "The generated files" },
          ]}
        />
        <span className="text-[11px] text-faint">words, settings, code</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${face}-${target.type}-${target.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ duration: 0.2 }}
          >
            {face === "plain" && <PlainFace resolved={resolved} />}
            {face === "spec" && <SpecFace resolved={resolved} />}
            {face === "code" && <CodeFace objectRef={target} />}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex gap-2 border-t border-hairline p-3">
        <Button variant="outline" size="sm" className="h-8 flex-1 bg-panel" onClick={() => ws.focusComposer(target)}>
          <MessageSquarePlus /> Ask for a change
        </Button>
        <Button variant="outline" size="sm" className="h-8 flex-1 bg-panel" onClick={() => ws.openHandoff(target)}>
          <UsersRound /> Ask a teammate
        </Button>
      </div>
      {resolved.type === "agent" && (
        <div className="border-t border-hairline px-3 pb-3 pt-2">
          <Button asChild size="sm" variant="ghost" className="h-8 w-full text-muted-foreground">
            <Link href={`/p/${ws.project.id}/agents?agent=${resolved.value.id}`}>Try it, and see its tests and replays →</Link>
          </Button>
        </div>
      )}
    </aside>
  );
}

function PlainFace({ resolved }: { resolved: ResolvedObject }) {
  switch (resolved.type) {
    case "agent":
      return <AgentPlain agent={resolved.value} />;
    case "screen":
      return <ScreenPlain screen={resolved.value} />;
    case "entity":
      return <EntityPlain entity={resolved.value} />;
    case "connection":
      return <ConnectionPlain connection={resolved.value} />;
    case "block":
      return <BlockPlain block={resolved.value} screen={resolved.screen} />;
    case "brief":
      return <BriefPlain />;
  }
}

function SpecFace({ resolved }: { resolved: ResolvedObject }) {
  switch (resolved.type) {
    case "agent":
      return <AgentSpec key={resolved.value.id} agent={resolved.value} />;
    case "screen":
      return <ScreenSpec key={resolved.value.id} screen={resolved.value} />;
    case "entity":
      return <EntitySpec entity={resolved.value} />;
    case "connection":
      return <ConnectionSpec connection={resolved.value} />;
    case "block":
      return <BlockSpec block={resolved.value} />;
    case "brief":
      return <BriefSpec />;
  }
}
