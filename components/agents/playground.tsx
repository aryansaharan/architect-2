"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { noEmDash } from "@/lib/text";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, CircleAlert, Loader2, RotateCcw } from "lucide-react";
import type { Agent, Blueprint, ToolPermission } from "@/lib/blueprint/schema";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Avatar } from "@/components/arch/badges";
import { allowToolAlways } from "@/lib/actions/agents";
import { PERMISSION_LABEL, supervisionView } from "@/lib/blueprint/describe";
import { PRICE } from "@/lib/prices";
import { useAgentChat } from "./use-agent-chat";
import { ApprovalCard, isToolPart, TraceRow } from "./chat-parts";
import { Markdown } from "@/components/markdown";

/**
 * Who answers in Try it, known before the first message from the same rules the chat route uses:
 * Claude when it's configured and the person can pay for a message, otherwise the free practice script.
 */
export type PlaygroundMode = "live" | "offline" | "guest" | "credits" | "budget";

const SCRIPT_LABEL: Record<Exclude<PlaygroundMode, "live" | "budget">, { label: string; why: string }> = {
  offline: { label: "Practice script · offline", why: "Claude isn't set up here, so a free practice script answers." },
  guest: { label: "Practice script · sign in for live AI", why: `Guests get a free practice script. Signed in, Claude answers for ${PRICE.helperMessage} credits a message.` },
  credits: { label: "Practice script · not enough credits", why: `Claude answers for ${PRICE.helperMessage} credits a message. Until your credits come back, a free practice script answers.` },
};

export function Playground({ projectId, agent, bp, startMode, initialPrompt, onRunSaved, onPermissionChange }: { projectId: string; agent: Agent; bp: Blueprint; startMode: PlaygroundMode; initialPrompt?: string; onRunSaved?: () => void; onPermissionChange?: (toolId: string, permission: ToolPermission) => void }) {
  const router = useRouter();
  // Spend shown elsewhere in the studio is refreshed once the conversation is out of view, never mid-turn
  // (see use-agent-chat.ts for why a refresh during a turn blanked the tab).
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
  // A permission changed from an approval card: the panel beside this shows it at once (onPermissionChange),
  // and the rest of the studio catches up as soon as the conversation is idle: no turn running and no card waiting.
  // Sending waits while that refresh loads, so no chat update can land mid-refresh.
  const permissionsChanged = useRef(false);
  const [refreshing, startRefresh] = useTransition();
  const awaitingYou = chat.messages.some((m) => m.role === "assistant" && m.parts.some((p) => isToolPart(p) && p.state === "approval-requested"));
  useEffect(() => {
    if (!permissionsChanged.current || chat.status !== "ready" || awaitingYou) return;
    permissionsChanged.current = false;
    stale.current = false;
    startRefresh(() => refresh());
  }, [chat.status, awaitingYou, refresh]);
  const sup = supervisionView(agent);
  const [text, setText] = useState(initialPrompt ?? "");
  const scroller = useRef<HTMLDivElement>(null);
  const busy = chat.status === "submitted" || chat.status === "streaming";

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages]);

  const send = (t: string) => {
    const v = t.trim();
    if (!v || busy || refreshing) return;
    void chat.sendMessage({ text: v });
    setText("");
  };

  const respond = async (approvalId: string, toolId: string, decision: "once" | "always" | "deny") => {
    if (decision === "always") {
      const r = await allowToolAlways(projectId, agent.id, toolId);
      if (r.ok) {
        onPermissionChange?.(toolId, "log");
        permissionsChanged.current = true;
        stale.current = true; // still refreshed on the way out if the conversation never goes idle
        toast.success("Won't ask again for this", { description: `Changed to “${PERMISSION_LABEL.log}”. Every change is a new version, so you can go back any time.` });
      } else toast.error(r.error);
    }
    void chat.addToolApprovalResponse({ id: approvalId, approved: decision !== "deny", reason: decision === "deny" ? "Denied by a person in the playground" : undefined });
  };

  // The server's answer is the final word once there is one; before that, the same rules it uses.
  const mode = chat.mode === "live" ? "live" : chat.mode === "budget" ? "budget" : chat.mode === "scripted" ? (startMode === "live" || startMode === "budget" ? "script" : startMode) : startMode;
  const live = mode === "live";
  const modeLabel = live ? "Live AI · sample data" : mode === "budget" ? "Paused at your spending cap" : mode === "script" ? "Practice script · free" : SCRIPT_LABEL[mode].label;
  const modeTitle = live ? `Model: ${agent.cost.model}` : mode === "budget" ? "This project reached its spending cap. Raise it in Settings." : mode === "script" ? "A free practice script answered." : SCRIPT_LABEL[mode].why;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-4 py-2 sm:px-5">
        <span title={modeTitle}><Pill tone={live ? "ok" : "neutral"} dot={live}>{modeLabel}</Pill></span>
        <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={chat.reset} disabled={busy || refreshing || chat.messages.length === 0}>
          <RotateCcw /> Start over
        </Button>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3 sm:px-5" aria-live="polite">
        {chat.messages.length === 0 && (
          <div className="mx-auto max-w-md py-6 text-center">
            <Avatar name={agent.name} hue={agent.avatarHue} size={40} className="mx-auto" />
            <p className="mt-3 font-pencil text-note leading-tight">Talk to {agent.name} like a new colleague.</p>
            <p className="mt-1.5 text-ui text-muted-foreground">Watch what it looks up, what it changes, and where it stops to ask you.</p>
            <p className="mt-1.5 text-meta text-faint">{sup.mode === "approve_all" ? "Every action asks you first." : sup.mode === "custom" ? "Each action follows its own setting." : "Anything that can't be undone asks you first."}</p>
            {agent.rehearsals.length > 0 && (
              <div className="mt-5 text-left">
                <p className="mb-1.5 text-center text-meta text-muted-foreground">Or start with one of these</p>
                <div className="flex flex-col gap-2">
                  {agent.rehearsals.slice(0, 3).map((r) => (
                    <button key={r.id} onClick={() => send(r.input)} className="sketch-soft bg-panel px-3 py-2 text-left text-ui text-foreground/80 transition-colors duration-150 ease-paper hover:border-brand hover:text-foreground">
                      <span className="mr-2 font-sketch text-sketch text-muted-foreground">{r.name}</span>
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
              <p className="max-w-[80%] rounded-lg rounded-br-sm border border-hairline bg-deep px-3.5 py-2 text-body">{m.parts.map((p) => (p.type === "text" ? noEmDash(p.text) : "")).join("")}</p>
            </div>
          ) : (
            <div key={m.id} className="flex gap-2.5">
              <Avatar name={agent.name} hue={agent.avatarHue} size={26} className="mt-0.5" />
              <div className="min-w-0 flex-1 space-y-2">
                {m.parts.map((p, i) => {
                  if (p.type === "text") return p.text ? <Markdown key={i} text={p.text} className="text-body" /> : null;
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
          <div className="flex items-center gap-2 pl-9 text-meta text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> {agent.name} is thinking…</div>
        )}
        {chat.error && <p className="flex items-start gap-2 rounded-md border border-hairline-hi bg-panel px-3 py-2 text-ui text-foreground"><CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />Something went wrong reaching {agent.name}. Try again. Nothing was charged.</p>}
      </div>
      <div className="px-4 pb-3 pt-2 sm:px-5">
        <div className="flex items-end gap-2 rounded-md border border-hairline-hi bg-panel p-2 transition-colors duration-150 focus-within:border-brand/60">
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
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-body outline-none placeholder:text-faint"
          />
          <Button size="icon" onClick={() => send(text)} disabled={!text.trim() || busy || refreshing} aria-label="Send">
            {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
        <p className="mt-1.5 text-badge text-faint">Every test is saved with what it looked up, who approved what, and what it cost.</p>
      </div>
    </div>
  );
}
