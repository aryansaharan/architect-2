"use client";
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { Chat, useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from "ai";
import { ArrowUp, Check, Hand, Loader2, Lock, Mail, Pencil, RotateCcw, Search, ShieldAlert, Sparkles, X } from "lucide-react";
import { noEmDash } from "@/lib/text";
import type { Agent, AgentTool, Block, Blueprint, Screen } from "@/lib/blueprint/schema";
import { lowerFirst } from "@/lib/blueprint/describe";
import { publicAccess } from "@/lib/apps/view";
import { scriptBlueprint, toolKind, type HelperToolKind } from "@/lib/apps/helper-shared";
import { cn } from "@/lib/utils";
import { useApp, type AppCtx } from "./app-context";
import { RECORDS_CHANGED_EVENT, useHelperAccess } from "./helper-context";
import { useAgentChat } from "@/components/agents/use-agent-chat";
import { ApprovalCard, isToolPart, TraceRow, type ToolPart } from "@/components/agents/chat-parts";
import { Markdown } from "@/components/markdown";
import { demoReply, type DemoChatContext } from "@/lib/sim/demo-chat";

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
        <input value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSend()} placeholder={placeholder} maxLength={4000} className="h-9 flex-1 bg-transparent text-[13px] text-slate-900 outline-none placeholder:text-slate-400" aria-label="Message" />
        <button onClick={onSend} disabled={busy || !value.trim()} className="grid size-7 place-items-center rounded-md text-white disabled:opacity-40" style={{ background: "var(--app-primary)" }} aria-label="Send">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

function Starters({ block, onPick }: { block: ChatBlock; onPick: (s: string) => void }) {
  return block.starters.map((s) => (
    <button key={s} onClick={() => onPick(s)} className="block w-full rounded-[var(--app-radius)] border border-slate-200 px-3 py-2 text-left text-[12.5px] text-slate-700 hover:bg-slate-50">{s}</button>
  ));
}

function UserBubble({ text }: { text: string }) {
  return <p className="ml-auto w-fit max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md px-3 py-2 text-[13px] text-white" style={{ background: "var(--app-primary)" }}>{noEmDash(text)}</p>;
}

/** "Ask <agent>" buttons elsewhere on the screen route here. */
function useAskAgent(agentId: string, send: (prompt: string) => void) {
  const onAsk = useEffectEvent((prompt: string) => send(prompt));
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ agentId: string; prompt: string }>).detail;
      if (d.agentId === agentId) onAsk(d.prompt);
    };
    window.addEventListener("prodai:ask-agent", handler);
    return () => window.removeEventListener("prodai:ask-agent", handler);
  }, [agentId]);
}

const blocksOf = (s: Screen) => [...s.regions.main, ...(s.regions.side ?? [])];

/** The screen a chat block sits on, and the data type (and detail view) its "this one" questions refer to. */
function placeOf(bp: Blueprint, blockId: string) {
  const screen = bp.screens.find((s) => blocksOf(s).some((b) => b.id === blockId));
  const blocks = screen ? blocksOf(screen) : [];
  const detail = blocks.find((b) => b.type === "detail");
  const withEntity = detail ?? blocks.find((b) => "entityId" in b && Boolean(b.entityId));
  const entityId = withEntity && "entityId" in withEntity ? withEntity.entityId : undefined;
  return { screen, entityId, detail: Boolean(detail) };
}

export function ChatBlockView({ block }: { block: ChatBlock }) {
  const app = useApp();
  const agent = app.bp.agents.find((a) => a.id === block.agentId);
  if (app.mode === "preview" && app.projectId && agent) return <LiveAgentChat block={block} agent={agent} bp={app.bp} projectId={app.projectId} />;
  if (app.mode === "live" && app.data && agent) return <PublishedHelper block={block} agent={agent} />;
  return <DemoChat block={block} agent={agent} />;
}

/** The studio preview: the playground's sandboxed run (app/api/chat) on the plan's sample data. */
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
    window.addEventListener("prodai:ask-agent", handler);
    return () => window.removeEventListener("prodai:ask-agent", handler);
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
            <Starters block={block} onPick={send} />
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
                if (p.type === "text") return p.text ? <div key={i} className="max-w-[92%] rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2 text-[13px]"><Markdown text={p.text} theme="app" /></div> : null;
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

// ---------------------------------------------------------------- a published app's real AI helper

type Probe = { allowed: boolean; team: boolean };
const probes = new Map<string, Promise<Probe>>();

/** The app's slug from its /live/<slug> address (only read in the browser, after hydration). */
function usePathSlug(): string | null {
  return useSyncExternalStore(
    () => () => undefined,
    () => window.location.pathname.match(/^\/live\/([a-z0-9-]{3,80})/)?.[1] ?? null,
    () => null,
  );
}

/** Without the live app telling us who this is, ask the server once whether this helper is open to them. */
function useProbe(slug: string | null, agentId: string, blockId: string, skip: boolean): Probe | null {
  const [result, setResult] = useState<Probe | null>(null);
  useEffect(() => {
    if (skip || !slug) return;
    const key = `${slug}/${agentId}/${blockId}`;
    let p = probes.get(key);
    if (!p) {
      p = fetch(`/api/apps/${slug}/chat?agentId=${encodeURIComponent(agentId)}&blockId=${encodeURIComponent(blockId)}`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<Probe>) : { allowed: false, team: false }))
        .catch(() => {
          probes.delete(key);
          return { allowed: false, team: false };
        });
      probes.set(key, p);
    }
    let current = true;
    void p.then((r) => current && setResult(r));
    return () => {
      current = false;
    };
  }, [slug, agentId, blockId, skip]);
  return result;
}

/**
 * The team talks to the real helper (on the app's records) from any chat block; a visitor only on a
 * public page, when the owner allows it. Everyone else keeps the scripted chat.
 */
function PublishedHelper({ block, agent }: { block: ChatBlock; agent: Agent }) {
  const app = useApp();
  const access = useHelperAccess();
  const pathSlug = usePathSlug();
  const slug = access?.slug ?? pathSlug;
  const { screen } = placeOf(app.bp, block.id);
  const known = access ? { allowed: access.role !== "visitor" || (access.publicHelpers && screen?.audience === "customer"), team: access.role !== "visitor" } : null;
  const probed = useProbe(slug, agent.id, block.id, Boolean(known));
  const decided = known ?? probed;
  if (!decided || !slug)
    return (
      <Shell block={block} agent={agent} footer={<Composer value="" onChange={() => undefined} onSend={() => undefined} busy placeholder={block.placeholder} />}>
        <div className="min-h-0 flex-1 p-3" />
      </Shell>
    );
  if (!decided.allowed) return <DemoChat block={block} agent={agent} />;
  return <HelperChat slug={slug} block={block} agent={agent} team={decided.team} onRecordsChanged={access?.onRecordsChanged} />;
}

/** Conversations by app and chat block, so switching phone and desktop view (which remounts the block) keeps them. Only kept in the browser. */
const helperChats = new Map<string, Chat<UIMessage>>();
/** Per conversation: the record open on screen (sent with each message) and how the last answer was made. */
const openRecord = new Map<string, string | undefined>();
const answerMode = new Map<string, string>();
/** Changes already announced to the app (so its tables reload once), and changes undone from the chat. */
const announced = new Set<string>();
const undone = new Set<string>();

function helperChat(key: string, slug: string, agentId: string, blockId: string): Chat<UIMessage> {
  const kept = typeof window !== "undefined" ? helperChats.get(key) : undefined;
  if (kept) return kept;
  const runId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
  const chat = new Chat<UIMessage>({
    id: key,
    transport: new DefaultChatTransport({
      api: `/api/apps/${slug}/chat`,
      body: () => ({ agentId, blockId, runId, recordId: openRecord.get(key) }),
      fetch: async (input, init) => {
        const res = await fetch(input, init);
        const mode = res.headers.get("x-prodai-mode");
        if (mode) answerMode.set(key, mode);
        return res;
      },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
  if (typeof window !== "undefined") helperChats.set(key, chat);
  return chat;
}

type Output = {
  ok?: boolean;
  error?: string;
  note?: string;
  status?: string;
  found?: number;
  record?: string;
  changed?: { field: string; from: unknown; to: unknown }[];
  changeId?: string;
};
type Input = { query?: string; type?: string; recordId?: string; changes?: Record<string, unknown>; to?: string; subject?: string; body?: string; request?: string };

const shown = (v: unknown) => (v === null || v === undefined || v === "" ? "empty" : String(v));

/** The record a change is about, by its title in the app's own rows. */
function recordTitle(app: AppCtx, recordId: string | undefined): string | null {
  if (!recordId || !app.data) return null;
  for (const e of app.bp.entities) {
    const i = app.data.indexOf(e.id, recordId);
    const title = e.fields[0]?.name;
    if (i >= 0 && title) return `${e.name} ${String(e.sample[i]?.[title] ?? "")}`.trim();
  }
  return null;
}

function HelperChat({ slug, block, agent, team, onRecordsChanged }: { slug: string; block: ChatBlock; agent: Agent; team: boolean; onRecordsChanged?: () => void }) {
  const app = useApp();
  const key = `${slug}/${block.id}`;
  const [kept] = useState(() => helperChat(key, slug, agent.id, block.id));
  const chat = useChat({ chat: kept });
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const busy = chat.status === "submitted" || chat.status === "streaming";
  const place = placeOf(app.bp, block.id);
  const recordId = place.detail && place.entityId ? app.data?.recordId(place.entityId, app.selectedRow[place.entityId] ?? 0) : undefined;

  useEffect(() => {
    openRecord.set(key, recordId);
  }, [key, recordId]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [chat.messages, chat.status]);

  const recordsChanged = () => {
    onRecordsChanged?.();
    window.dispatchEvent(new CustomEvent(RECORDS_CHANGED_EVENT, { detail: { slug } }));
  };
  const announce = useEffectEvent(recordsChanged);
  // A change the helper made shows up in the app's tables right away.
  useEffect(() => {
    let fresh = false;
    for (const m of chat.messages)
      for (const p of m.parts)
        if (isToolPart(p) && p.state === "output-available") {
          const id = (p.output as Output | undefined)?.changeId;
          if (id && !announced.has(id)) {
            announced.add(id);
            fresh = true;
          }
        }
    if (fresh) announce();
  }, [chat.messages]);

  const send = (t: string) => {
    const v = t.trim();
    if (!v || busy) return;
    void chat.sendMessage({ text: v });
    setText("");
  };
  useAskAgent(agent.id, send);

  const mode = answerMode.get(key) ?? null;
  return (
    <Shell block={block} agent={agent} footer={<Composer value={text} onChange={setText} onSend={() => send(text)} busy={busy} placeholder={block.placeholder} />}>
      <div ref={scroller} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        <p className="text-[11.5px] text-slate-400">
          {mode === "budget"
            ? "This app's AI budget is used up, so answers come from a script over its records."
            : mode === "scripted"
              ? "The AI model isn't available right now, so answers come from a script over the app's records."
              : team
                ? "Works on this app's records. Changes can be undone, and anything that can't be undone asks you first."
                : "Answers from what this page shows."}
        </p>
        {chat.messages.length === 0 && <Starters block={block} onPick={send} />}
        {chat.messages.map((m) =>
          m.role === "user" ? (
            <UserBubble key={m.id} text={m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")} />
          ) : (
            <div key={m.id} className="space-y-2">
              {m.parts.map((p, i) => {
                if (p.type === "text") return p.text ? <div key={i} className="w-fit max-w-[92%] rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2 text-[13px] text-slate-800"><Markdown text={p.text} theme="app" /></div> : null;
                if (!isToolPart(p)) return null;
                const tool = agent.tools.find((t) => t.id === p.type.slice(5));
                const kind: HelperToolKind = tool ? toolKind(app.bp, tool) : "unavailable";
                if (p.state === "approval-requested" && p.approval && !p.approval.isAutomatic)
                  return <HelperApproval key={p.toolCallId} part={p} tool={tool} kind={kind} agent={agent} onRespond={(approved) => void chat.addToolApprovalResponse({ id: p.approval!.id, approved })} />;
                return <HelperStep key={p.toolCallId} part={p} tool={tool} kind={kind} slug={slug} team={team} onUndone={recordsChanged} />;
              })}
            </div>
          ),
        )}
        {chat.status === "submitted" && <p className="flex items-center gap-2 text-[12px] text-slate-400"><Loader2 className="size-3 animate-spin" />Thinking…</p>}
        {chat.error && (
          <p role="alert" className="rounded-[var(--app-radius)] border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
            {/^(This AI helper|That conversation)/.test(chat.error.message) ? chat.error.message : "That didn't go through. Try again in a moment."}
          </p>
        )}
      </div>
    </Shell>
  );
}

const KIND_ICON = { search: Search, change: Pencil, email: Mail, unavailable: Lock } as const;

/** One thing the helper did, in plain words: what it looked up, what it changed (with Undo), what it sent. */
function HelperStep({ part, tool, kind, slug, team, onUndone }: { part: ToolPart; tool: AgentTool | undefined; kind: HelperToolKind; slug: string; team: boolean; onUndone: () => void }) {
  const input = (part.input ?? {}) as Input;
  const out = part.output as Output | undefined;
  const app = useApp();
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [, rerender] = useState(0);
  const Icon = KIND_ICON[kind];
  const running = part.state === "input-streaming" || part.state === "input-available" || part.state === "approval-responded";
  const denied = part.state === "output-denied" || (part.state === "approval-responded" && part.approval?.approved === false);
  const failed = part.state === "output-error" || out?.ok === false || ["refused", "limit", "failed"].includes(out?.status ?? "");

  const title =
    kind === "search" ? `Looked up ${input.type ? lowerFirst(input.type) : "records"}${input.query ? ` for “${input.query}”` : ""}`
    : kind === "change" ? `${tool?.name ?? "Change a record"}${recordTitle(app, input.recordId) ? `: ${recordTitle(app, input.recordId)}` : out?.record ? `: ${out.record}` : ""}`
    : kind === "email" ? `Email to ${input.to ?? "someone"}${input.subject ? `: ${input.subject}` : ""}`
    : (tool?.name ?? part.type.slice(5));
  const status = denied ? "not allowed" : running ? "working" : part.state === "output-error" ? "failed" : kind === "search" && typeof out?.found === "number" ? `${out.found} found` : out?.status === "sent" ? "sent" : failed ? "not done" : "done";

  const undo = async () => {
    if (!out?.changeId) return;
    setUndoing(true);
    setUndoError(null);
    try {
      const res = await fetch(`/api/apps/${slug}/undo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ changeId: out.changeId }) });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "Couldn't undo that. Try again.");
      undone.add(out.changeId);
      rerender((n) => n + 1);
      onUndone();
    } catch (e) {
      setUndoError(e instanceof Error ? e.message : "Couldn't undo that. Try again.");
    } finally {
      setUndoing(false);
    }
  };

  return (
    <div className="rounded-[var(--app-radius)] border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px]">
      <p className="flex items-center gap-2">
        <Icon className={cn("size-3.5 shrink-0", kind === "search" ? "text-emerald-600" : kind === "change" ? "text-blue-600" : "text-rose-600")} />
        <span className="min-w-0 truncate font-medium text-slate-800">{title}</span>
        <span className={cn("ml-auto shrink-0 whitespace-nowrap", denied || failed ? "text-rose-600" : "text-slate-400")}>
          {running && <Loader2 className="mr-1 inline size-3 animate-spin" />}
          {status}
        </span>
      </p>
      {kind === "change" && out?.changed && out.changed.length > 0 && (
        <ul className="mt-1 space-y-0.5 pl-5 text-slate-600">
          {out.changed.map((c) => (
            <li key={c.field}>
              {c.field}: <span className="text-slate-400 line-through">{shown(c.from)}</span> → <span className="font-medium text-slate-800">{shown(c.to)}</span>
            </li>
          ))}
        </ul>
      )}
      {kind === "change" && out?.changeId && team && (
        <p className="mt-1 flex items-center gap-2 pl-5">
          {undone.has(out.changeId) ? (
            <span className="inline-flex items-center gap-1 text-slate-500"><Check className="size-3" />Undone</span>
          ) : (
            <button type="button" onClick={() => void undo()} disabled={undoing} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60">
              {undoing ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
              Undo
            </button>
          )}
          {undoError && <span role="alert" className="text-rose-600">{undoError}</span>}
        </p>
      )}
      {denied && <p className="mt-1 pl-5 text-slate-500">You said no, so nothing happened.</p>}
      {!denied && (out?.error || (out?.note && kind !== "search")) && <p className={cn("mt-1 pl-5", failed ? "text-rose-700" : "text-slate-600")}>{out.error ?? out.note}</p>}
      {part.state === "output-error" && part.errorText && <p className="mt-1 pl-5 text-rose-700">That step failed, so nothing happened.</p>}
    </div>
  );
}

/**
 * A person's OK before the helper acts. Rose means "can't be undone", as everywhere in the product;
 * an undoable change or a look-up set to ask first gets a calm amber note. The details shown are
 * exactly what will run: who an email goes to and what it says, which record changes and how.
 */
function HelperApproval({ part, tool, kind, agent, onRespond }: { part: ToolPart; tool: AgentTool | undefined; kind: HelperToolKind; agent: Agent; onRespond: (approved: boolean) => void }) {
  const app = useApp();
  const input = (part.input ?? {}) as Input;
  const irreversible = (tool?.access ?? "irreversible") === "irreversible";
  const Icon = irreversible ? ShieldAlert : Hand;
  const body =
    kind === "email" ? "Sending an email can't be undone, so it waits for your OK."
    : irreversible ? "This can't be undone, so it waits for your OK."
    : kind === "change" ? "This changes a record. It waits for your OK, and you can undo it afterwards."
    : "This only looks something up. It's set to ask first.";
  return (
    <div role="group" aria-label="Approval needed" data-gate={irreversible ? "irreversible" : "ask"} className={cn("rounded-[var(--app-radius)] border p-3 text-[12.5px] animate-in fade-in slide-in-from-bottom-1", irreversible ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50/70")}>
      <p className="flex items-center gap-2 font-semibold text-slate-900">
        <Icon className={cn("size-4 shrink-0", irreversible ? "text-rose-600" : "text-amber-600")} />
        <span className="min-w-0">{agent.name} wants to {lowerFirst(tool?.name ?? part.type.slice(5))}</span>
        <span className={cn("ml-auto shrink-0 whitespace-nowrap rounded-full border bg-white px-2 py-px text-[11px] font-medium", irreversible ? "border-rose-200 text-rose-700" : "border-amber-200 text-amber-700")}>{irreversible ? "Can't be undone" : "Asks first"}</span>
      </p>
      <div className="mt-2 space-y-1 rounded-md bg-white px-2.5 py-2 text-slate-700">
        {kind === "email" ? (
          <>
            <p><span className="text-slate-400">To </span>{input.to}</p>
            <p><span className="text-slate-400">Subject </span>{input.subject}</p>
            <p className="max-h-32 overflow-y-auto whitespace-pre-wrap border-t border-slate-100 pt-1">{input.body}</p>
          </>
        ) : kind === "change" ? (
          <>
            <p className="font-medium text-slate-900">{recordTitle(app, input.recordId) ?? "A record"}</p>
            {Object.entries(input.changes ?? {}).map(([k, v]) => <p key={k}>{k.replace(/_/g, " ")} → <span className="font-medium">{shown(v)}</span></p>)}
          </>
        ) : (
          <p>{input.query ?? input.request ?? ""}</p>
        )}
      </div>
      <p className="mt-2 text-slate-600">{body}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => onRespond(true)} className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-800">
          <Check className="size-3.5" /> Allow
        </button>
        <button type="button" onClick={() => onRespond(false)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50">
          <X className="size-3.5" /> Deny
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the scripted chat

type DemoLog = { role: "user" | "agent"; text: string }[];
/** Conversations by app and chat block, so switching phone and desktop view (which remounts the block) keeps them. Only written in the browser. */
const demoLogs = new Map<string, DemoLog>();

/**
 * No model call: replies are matched to the question's intent and built from the rows the app shows
 * (lib/sim/demo-chat.ts), so they answer what was asked. In a published app those rows are its real
 * records (a visitor's, only the fields public pages show); elsewhere, the plan's sample data.
 */
function DemoChat({ block, agent }: { block: ChatBlock; agent: Agent | undefined }) {
  const app = useApp();
  const logKey = `${app.bp.meta.name}/${block.id}`;
  const [log, setLogState] = useState<DemoLog>(() => demoLogs.get(logKey) ?? []);
  const setLog = (next: (l: DemoLog) => DemoLog) => setLogState((l) => {
    const v = next(l);
    demoLogs.set(logKey, v);
    return v;
  });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [log, busy]);

  const live = app.mode === "live" && Boolean(app.data);
  // The screen this chat sits on decides which records "today", "this claim" and so on refer to.
  const place = placeOf(app.bp, block.id);
  const ctx: DemoChatContext = { screenId: place.screen?.id, entityId: place.entityId, selected: place.detail && place.entityId ? (app.selectedRow[place.entityId] ?? 0) : undefined, live };

  const send = (t: string) => {
    const v = t.trim();
    if (!v || busy) return;
    setLog((l) => [...l, { role: "user", text: v }]);
    setText("");
    setBusy(true);
    // A visitor's rows carry only the public pages' fields, so the script knows only those.
    const bp = live && !app.data?.canEdit ? scriptBlueprint(app.bp, Object.fromEntries(app.bp.entities.map((e) => [e.id, e.sample])), publicAccess(app.bp).read) : app.bp;
    const reply = demoReply(bp, agent, v, ctx);
    setTimeout(() => {
      setLog((l) => [...l, { role: "agent", text: reply }]);
      setBusy(false);
    }, 700);
  };
  useAskAgent(block.agentId, send);

  return (
    <Shell block={block} agent={agent} footer={<Composer value={text} onChange={setText} onSend={() => send(text)} busy={busy} placeholder={block.placeholder} />}>
      <div ref={scroller} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        <p className="text-[11.5px] text-slate-400">{live ? "This AI helper answers from what this page shows." : "This AI helper answers from the app's sample data."}</p>
        {log.length === 0 && <Starters block={block} onPick={send} />}
        {log.map((m, i) =>
          m.role === "user" ? (
            <UserBubble key={i} text={m.text} />
          ) : (
            <div key={i} className="w-fit max-w-[92%] rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2 text-[13px] text-slate-800">
              <Markdown text={m.text} theme="app" />
            </div>
          ),
        )}
        {busy && <p className="flex items-center gap-2 text-[12px] text-slate-400"><Loader2 className="size-3 animate-spin" />Typing…</p>}
      </div>
    </Shell>
  );
}
