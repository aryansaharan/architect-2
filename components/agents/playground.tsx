"use client";
import { useEffect, useRef, useState } from "react";
import { noEmDash } from "@/lib/text";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, Loader2, RotateCcw } from "lucide-react";
import type { Agent, Blueprint } from "@/lib/blueprint/schema";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/arch/badges";
import { allowToolAlways } from "@/lib/actions/agents";
import { PERMISSION_LABEL, supervisionView } from "@/lib/blueprint/describe";
import { cn } from "@/lib/utils";
import { useAgentChat } from "./use-agent-chat";
import { ApprovalCard, isToolPart, TraceRow } from "./chat-parts";
import { Markdown } from "@/components/markdown";

export function Playground({ projectId, agent, bp, llm, initialPrompt, onRunSaved }: { projectId: string; agent: Agent; bp: Blueprint; llm: "live" | "offline"; initialPrompt?: string; onRunSaved?: () => void }) {
  const router = useRouter();
  // Spend and permissions shown elsewhere in the studio are refreshed once the conversation is out of view,
  // never mid-chat (see use-agent-chat.ts for why a refresh here blanked the tab).
  const stale = useRef(false);
  const chat = useAgentChat(projectId, agent.id, {
    onTurnEnd: () => {
      stale.current = true;
      onRunSaved?.();
    },
  });
  const refresh = router.refresh; // the same function for the router's lifetime, so this cleanup only runs on unmount
  useEffect(() => {
    const s = stale;
    return () => {
      if (s.current) refresh();
    };
  }, [refresh]);
  const sup = supervisionView(agent);
  const [text, setText] = useState(initialPrompt ?? "");
  const scroller = useRef<HTMLDivElement>(null);
  const busy = chat.status === "submitted" || chat.status === "streaming";

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages]);

  const send = (t: string) => {
    const v = t.trim();
    if (!v || busy) return;
    void chat.sendMessage({ text: v });
    setText("");
  };

  const respond = async (approvalId: string, toolId: string, decision: "once" | "always" | "deny") => {
    if (decision === "always") {
      const r = await allowToolAlways(projectId, agent.id, toolId);
      if (r.ok) {
        stale.current = true;
        toast.success("Won't ask again for this", { description: `Changed to “${PERMISSION_LABEL.log}”. Every change is a save point, so you can go back any time.` });
      } else toast.error(r.error);
    }
    void chat.addToolApprovalResponse({ id: approvalId, approved: decision !== "deny", reason: decision === "deny" ? "Denied by a person in the playground" : undefined });
  };

  const live = chat.mode === "live" || (chat.mode === null && llm === "live");
  const modeLabel = live ? "Live AI · sample data" : chat.mode === "budget" ? "Paused at your spending cap" : "Practice script · offline";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-4 py-2 sm:px-5">
        <span title={live ? `Model: ${agent.cost.model}` : undefined} className={cn("whitespace-nowrap rounded-full border px-2 py-px text-[11px]", live ? "border-read/30 bg-read/5 text-read" : "border-hairline bg-panel text-muted-foreground")}>{modeLabel}</span>
        <Button variant="ghost" size="sm" className="ml-auto h-7 text-muted-foreground" onClick={chat.reset} disabled={busy || chat.messages.length === 0}>
          <RotateCcw /> Start over
        </Button>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3 sm:px-5" aria-live="polite">
        {chat.messages.length === 0 && (
          <div className="mx-auto max-w-md py-6 text-center">
            <Avatar name={agent.name} hue={agent.avatarHue} size={40} className="mx-auto" />
            <p className="mt-3 font-pencil text-[24px] leading-tight">Talk to {agent.name} like a new colleague.</p>
            <p className="mt-1.5 text-[12.5px] text-muted-foreground">Watch what it looks up, what it changes, and where it stops to ask you.</p>
            <p className="mt-1.5 text-[11.5px] text-faint">{sup.mode === "approve_all" ? "Every action asks you first." : sup.mode === "custom" ? "Each action follows its own setting." : "Anything that can't be undone asks you first."}</p>
            {agent.rehearsals.length > 0 && (
              <div className="mt-5 text-left">
                <p className="mb-1.5 text-center text-[11.5px] text-muted-foreground">Or start with one of these</p>
                <div className="flex flex-col gap-2">
                  {agent.rehearsals.slice(0, 3).map((r) => (
                    <button key={r.id} onClick={() => send(r.input)} className="sketch-soft bg-panel px-3 py-2 text-left text-[12.5px] text-foreground/80 transition-colors hover:border-brand hover:text-foreground">
                      <span className="mr-2 font-sketch text-[11.5px] text-muted-foreground">{r.name}</span>
                      {r.input}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {chat.messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[80%] rounded-2xl rounded-br-md border border-hairline bg-deep px-3.5 py-2 text-[13px]">{m.parts.map((p) => (p.type === "text" ? noEmDash(p.text) : "")).join("")}</p>
            </div>
          ) : (
            <div key={m.id} className="flex gap-2.5">
              <Avatar name={agent.name} hue={agent.avatarHue} size={26} className="mt-0.5" />
              <div className="min-w-0 flex-1 space-y-2">
                {m.parts.map((p, i) => {
                  if (p.type === "text") return p.text ? <Markdown key={i} text={p.text} className="text-[13px]" /> : null;
                  if (isToolPart(p)) {
                    const tool = agent.tools.find((t) => t.id === p.type.slice(5));
                    if (p.state === "approval-requested" && p.approval && !p.approval.isAutomatic)
                      return <ApprovalCard key={p.toolCallId} part={p} tool={tool} agent={agent} onRespond={(d) => respond(p.approval!.id, tool?.id ?? p.type.slice(5), d)} />;
                    return <TraceRow key={p.toolCallId} part={p} tool={tool} bp={bp} />;
                  }
                  return null;
                })}
              </div>
            </div>
          ),
        )}
        {chat.status === "submitted" && (
          <div className="flex items-center gap-2 pl-9 text-[12px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> {agent.name} is thinking…</div>
        )}
        {chat.error && <p className="rounded-md border border-hairline-hi bg-panel px-3 py-2 text-[12.5px] text-foreground/85">Something went wrong reaching {agent.name}. Try again. Nothing was charged.</p>}
      </div>
      <div className="px-4 pb-3 pt-2 sm:px-5">
        <div className="flex items-end gap-2 rounded-lg border border-hairline-hi bg-panel p-2 transition-colors focus-within:border-brand/60">
          <label htmlFor="pg-input" className="sr-only">Message {agent.name}</label>
          <textarea
            id="pg-input"
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            placeholder={`Ask ${agent.name} to do something…`}
            className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-2 text-[13px] outline-none placeholder:text-faint"
          />
          <Button size="icon-sm" className="size-8 rounded-md" onClick={() => send(text)} disabled={!text.trim() || busy} aria-label="Send">
            {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-faint">Every test is saved with what it looked up, who approved what, and what it cost.</p>
      </div>
    </div>
  );
}
