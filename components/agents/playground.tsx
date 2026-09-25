"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, Loader2, RotateCcw, Sparkles } from "lucide-react";
import type { Agent, Blueprint } from "@/lib/blueprint/schema";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/arch/badges";
import { setToolPermission } from "@/lib/actions/blueprint";
import { cn } from "@/lib/utils";
import { useAgentChat } from "./use-agent-chat";
import { ApprovalCard, isToolPart, TraceRow } from "./chat-parts";

export function Playground({ projectId, agent, bp, llm, initialPrompt }: { projectId: string; agent: Agent; bp: Blueprint; llm: "live" | "offline"; initialPrompt?: string }) {
  const router = useRouter();
  const chat = useAgentChat(projectId, agent.id);
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
      const r = await setToolPermission(projectId, agent.id, toolId, "log");
      if (r.ok) toast.success("Won't ask again for this", { description: "Changed to “Do it and tell me”. You can undo it from save points." });
      router.refresh();
    }
    void chat.addToolApprovalResponse({ id: approvalId, approved: decision !== "deny", reason: decision === "deny" ? "Denied by a person in the playground" : undefined });
  };

  const modeLabel = chat.mode === "live" || (chat.mode === null && llm === "live") ? `Live · ${agent.cost.model}` : chat.mode === "budget" ? "Paused at your spending cap" : "Scripted · offline mode";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
        <p className="text-[13px] font-medium">Playground</p>
        <span className={cn("whitespace-nowrap rounded-full border px-2 py-px text-[11px]", modeLabel.startsWith("Live") ? "border-read/30 text-read" : "border-hairline text-muted-foreground")}>{modeLabel}</span>
        <span className="text-[11px] text-faint max-md:hidden">Tools run against sandboxed sample data</span>
        <Button variant="ghost" size="sm" className="ml-auto h-7 text-muted-foreground" onClick={chat.reset} disabled={busy}>
          <RotateCcw /> New conversation
        </Button>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {chat.messages.length === 0 && (
          <div className="mx-auto max-w-md py-8 text-center">
            <Avatar name={agent.name} hue={agent.avatarHue} size={44} className="mx-auto" />
            <p className="mt-3 text-[14px] font-medium">Talk to {agent.name} like a new colleague.</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">Watch what it looks up, what it changes, and where it stops to ask you.</p>
            <div className="mt-4 flex flex-col gap-2">
              {agent.rehearsals.slice(0, 3).map((r) => (
                <button key={r.id} onClick={() => send(r.input)} className="rounded-lg border border-hairline px-3 py-2 text-left text-[12.5px] text-muted-foreground transition-colors hover:border-amber/40 hover:text-foreground">
                  <span className="micro-label mr-2">{r.name}</span>
                  {r.input}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[80%] rounded-2xl rounded-br-md bg-raised px-3.5 py-2 text-[13px]">{m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}</p>
            </div>
          ) : (
            <div key={m.id} className="flex gap-2.5">
              <Avatar name={agent.name} hue={agent.avatarHue} size={26} className="mt-0.5" />
              <div className="min-w-0 flex-1 space-y-2">
                {m.parts.map((p, i) => {
                  if (p.type === "text") return p.text ? <p key={i} className="whitespace-pre-wrap text-[13px] leading-relaxed">{p.text}</p> : null;
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
        {chat.error && <p className="rounded-lg border border-ask/30 bg-ask/10 px-3 py-2 text-[12.5px] text-ask">Something went wrong reaching the agent. Try again — nothing was charged.</p>}
      </div>
      <div className="border-t border-hairline p-3">
        <div className="panel flex items-end gap-2 rounded-xl p-2 focus-within:border-amber/50">
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
          <Button size="icon-sm" className="size-8 rounded-lg" onClick={() => send(text)} disabled={!text.trim() || busy} aria-label="Send">
            {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
        <p className="mt-1.5 flex items-center gap-1 text-[10.5px] text-faint"><Sparkles className="size-3" />Every run is saved to Replay with its tool calls, approvals and cost.</p>
      </div>
    </div>
  );
}
