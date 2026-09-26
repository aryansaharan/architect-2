"use client";
import { useEffect, useRef, useState } from "react";
import { noEmDash } from "@/lib/text";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import type { Agent, Block, Blueprint } from "@/lib/blueprint/schema";
import { cn } from "@/lib/utils";
import { useApp } from "./app-context";
import { useAgentChat } from "@/components/agents/use-agent-chat";
import { ApprovalCard, isToolPart, TraceRow } from "@/components/agents/chat-parts";

type ChatBlock = Extract<Block, { type: "chat" }>;

function Shell({ block, agent, children, footer }: { block: ChatBlock; agent: Agent | undefined; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <section className="flex h-[420px] flex-col rounded-[calc(var(--app-radius)+4px)] border border-slate-200 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
      <header className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
        <span className="grid size-7 place-items-center rounded-full text-white" style={{ background: "var(--app-primary)" }}><Sparkles className="size-3.5" /></span>
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold text-slate-900">{block.title ?? agent?.name}</span>
          <span className="block truncate text-[11.5px] text-slate-500">{agent?.role}</span>
        </span>
      </header>
      {children}
      {footer}
    </section>
  );
}

function Composer({ value, onChange, onSend, busy, placeholder }: { value: string; onChange: (v: string) => void; onSend: () => void; busy: boolean; placeholder: string }) {
  return (
    <div className="border-t border-slate-100 p-2.5">
      <div className="flex items-center gap-2 rounded-[var(--app-radius)] border border-slate-200 px-2.5">
        <input value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSend()} placeholder={placeholder} className="h-9 flex-1 bg-transparent text-[13px] text-slate-900 outline-none placeholder:text-slate-400" aria-label="Message" />
        <button onClick={onSend} disabled={busy || !value.trim()} className="grid size-7 place-items-center rounded-md text-white disabled:opacity-40" style={{ background: "var(--app-primary)" }} aria-label="Send">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

export function ChatBlockView({ block }: { block: ChatBlock }) {
  const app = useApp();
  const agent = app.bp.agents.find((a) => a.id === block.agentId);
  if (app.mode === "preview" && app.projectId && agent) return <LiveAgentChat block={block} agent={agent} bp={app.bp} projectId={app.projectId} />;
  return <DemoChat block={block} agent={agent} />;
}

function LiveAgentChat({ block, agent, bp, projectId }: { block: ChatBlock; agent: Agent; bp: Blueprint; projectId: string }) {
  const app = useApp();
  const chat = useAgentChat(projectId, agent.id);
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const busy = chat.status === "submitted" || chat.status === "streaming";
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [chat.messages]);
  // "Ask <agent>" buttons elsewhere on the screen route here
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ agentId: string; prompt: string }>).detail;
      if (d.agentId === agent.id) void chat.sendMessage({ text: d.prompt });
    };
    window.addEventListener("architect:ask-agent", handler);
    return () => window.removeEventListener("architect:ask-agent", handler);
  }, [agent.id, chat]);
  const send = (t: string) => {
    if (!t.trim() || busy) return;
    void chat.sendMessage({ text: t.trim() });
    setText("");
  };
  return (
    <Shell block={block} agent={agent} footer={<Composer value={text} onChange={setText} onSend={() => send(text)} busy={busy} placeholder={block.placeholder} />}>
      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {chat.messages.length === 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-[12.5px] text-slate-500">Try:</p>
            {block.starters.map((s) => (
              <button key={s} onClick={() => send(s)} className="block w-full rounded-[var(--app-radius)] border border-slate-200 px-3 py-2 text-left text-[12.5px] text-slate-700 hover:bg-slate-50">{s}</button>
            ))}
          </div>
        )}
        {chat.messages.map((m) =>
          m.role === "user" ? (
            <p key={m.id} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 text-[13px] text-white" style={{ background: "var(--app-primary)" }}>
              {m.parts.map((p) => (p.type === "text" ? noEmDash(p.text) : "")).join("")}
            </p>
          ) : (
            <div key={m.id} className="space-y-2">
              {m.parts.map((p, i) => {
                if (p.type === "text") return p.text ? <p key={i} className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2 text-[13px] text-slate-800">{noEmDash(p.text)}</p> : null;
                if (isToolPart(p)) {
                  const tool = agent.tools.find((t) => t.id === p.type.slice(5));
                  if (p.state === "approval-requested" && p.approval && !p.approval.isAutomatic)
                    return <ApprovalCard key={p.toolCallId} theme="app" part={p} tool={tool} agent={agent} onRespond={(d) => void chat.addToolApprovalResponse({ id: p.approval!.id, approved: d !== "deny" })} />;
                  return <TraceRow key={p.toolCallId} theme="app" part={p} tool={tool} bp={bp} />;
                }
                return null;
              })}
            </div>
          ),
        )}
        {chat.status === "submitted" && <p className="flex items-center gap-2 text-[12px] text-slate-400"><Loader2 className="size-3 animate-spin" />Thinking…</p>}
      </div>
      {app.device !== "phone" && <p className="sr-only">Chat with {agent.name}</p>}
    </Shell>
  );
}

/** Public live version: no model calls from anonymous visitors: answers come from the agent's rehearsals. */
function DemoChat({ block, agent }: { block: ChatBlock; agent: Agent | undefined }) {
  const [log, setLog] = useState<{ role: "user" | "agent"; text: string }[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = (t: string) => {
    const v = t.trim();
    if (!v || busy) return;
    setLog((l) => [...l, { role: "user", text: v }]);
    setText("");
    setBusy(true);
    const r = agent?.rehearsals[log.length % Math.max(1, agent.rehearsals.length)];
    setTimeout(() => {
      setLog((l) => [...l, { role: "agent", text: r ? `Here's how I'd handle that: ${r.expect} (This public demo answers from rehearsed examples. Sign in to talk to the real agent.)` : "Thanks, a colleague will follow up shortly." }]);
      setBusy(false);
    }, 700);
  };
  return (
    <Shell block={block} agent={agent} footer={<Composer value={text} onChange={setText} onSend={() => send(text)} busy={busy} placeholder={block.placeholder} />}>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {log.length === 0 &&
          block.starters.map((s) => (
            <button key={s} onClick={() => send(s)} className="block w-full rounded-[var(--app-radius)] border border-slate-200 px-3 py-2 text-left text-[12.5px] text-slate-700 hover:bg-slate-50">{s}</button>
          ))}
        {log.map((m, i) => (
          <p key={i} className={cn("w-fit max-w-[88%] rounded-2xl px-3 py-2 text-[13px]", m.role === "user" ? "ml-auto rounded-br-md text-white" : "rounded-bl-md bg-slate-100 text-slate-800")} style={m.role === "user" ? { background: "var(--app-primary)" } : undefined}>
            {m.text}
          </p>
        ))}
        {busy && <p className="flex items-center gap-2 text-[12px] text-slate-400"><Loader2 className="size-3 animate-spin" />Typing…</p>}
      </div>
    </Shell>
  );
}
