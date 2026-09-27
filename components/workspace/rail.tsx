"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from "react";
import { motion } from "motion/react";
import { Brain, Check, ChevronDown, Hammer, Loader2, MessageSquarePlus, MessagesSquare, PanelLeftClose, PanelLeftOpen, ShieldCheck, Target, X } from "lucide-react";
import { BlameBadge } from "@/components/arch/badges";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TimeAgo } from "@/components/time-ago";
import { cn } from "@/lib/utils";
import { creditsUsd, formatCredits } from "@/lib/format";
import { objectLabel } from "@/lib/blueprint";
import { changeTimeLabel } from "@/lib/blueprint/estimate";
import type { ObjectRef } from "@/lib/blueprint/schema";
import type { CheckpointMeta, Lane, LedgerKind, LedgerRow } from "@/lib/db/types";
import type { ChatLedgerKind } from "@/lib/db/writes";
import { useWorkspace } from "./context";
import { useChatState, workOrderIdOf, type SentMessage } from "./composer-dock";
import { readRail, subscribeRail, writeRail, type RailPref } from "./rail-pref";

const LANE: Record<Lane, { icon: typeof Brain; label: string; cls: string }> = {
  thought: { icon: Brain, label: "Thought", cls: "text-muted-foreground bg-raised" },
  did: { icon: Hammer, label: "Did", cls: "text-amber bg-amber-soft" },
  checked: { icon: ShieldCheck, label: "Checked", cls: "text-read bg-read/10" },
};

type Filter = "all" | "fixes" | "team";

/** A history entry, or a message just sent that the history doesn't have yet (same shape, so both render the same). */
type ThreadRow = Omit<LedgerRow, "kind"> & { kind: LedgerKind | ChatLedgerKind; sending?: boolean };

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The chat rail: your requests and Prod AI's answers, Work Orders and fixes as a conversation, with
 * build steps and other events as compact rows in the flow. `collapsible` (desktop) adds the slim
 * strip and the toggle; the phone sheet shows the full panel only.
 * `onAsk` hands focus to the composer under the canvas (the one place to type).
 */
export function Rail({ collapsible = false, initialPref = "auto", onAsk }: { collapsible?: boolean; initialPref?: RailPref; onAsk?: () => void }) {
  const pref = useSyncExternalStore(subscribeRail, readRail, () => initialPref);
  const collapseBtn = useRef<HTMLButtonElement>(null);
  const expandBtn = useRef<HTMLButtonElement>(null);

  if (!collapsible) return <RailPanel className="flex w-full bg-panel/40" onAsk={onAsk} footer />;

  const setOpen = (open: boolean, viaKeyboard: boolean) => {
    writeRail(open ? "open" : "collapsed");
    // From the keyboard, the button that was pressed is gone now: hand focus to its counterpart.
    if (viaKeyboard) requestAnimationFrame(() => (open ? collapseBtn : expandBtn).current?.focus({ preventScroll: true }));
  };

  // "auto" opens from 1280px wide (xl), and stays a slim strip below that.
  return (
    <div
      className={cn(
        "flex h-full shrink-0 overflow-hidden border-r border-hairline bg-panel/40 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        pref === "open" ? "w-[312px]" : pref === "collapsed" ? "w-14" : "w-14 xl:w-[312px]",
      )}
    >
      <RailPanel
        className={cn("w-[312px]", pref === "open" ? "flex" : pref === "collapsed" ? "hidden" : "hidden xl:flex")}
        reportVisibility
        collapseRef={collapseBtn}
        onCollapse={(viaKeyboard) => setOpen(false, viaKeyboard)}
        onAsk={onAsk}
      />
      <SlimRail
        className={pref === "open" ? "hidden" : pref === "collapsed" ? "flex" : "flex xl:hidden"}
        buttonRef={expandBtn}
        onOpen={(viaKeyboard) => setOpen(true, viaKeyboard)}
      />
    </div>
  );
}

/** Messages the history already has, by Work Order: the rest are still on their way and show from local state. */
function useUnlogged(): { unlogged: SentMessage[]; thinking: boolean } {
  const ws = useWorkspace();
  const { sent } = useChatState();
  return useMemo(() => {
    const logged = new Set(ws.ledger.map(workOrderIdOf));
    return { unlogged: sent.filter((m) => !m.wo || !logged.has(m.wo.id)), thinking: sent.some((m) => !m.wo) };
  }, [ws.ledger, sent]);
}

/**
 * Collapsed: a slim strip labelled "Chat" with how many items the thread holds, and a live mark while
 * Prod AI is working or waiting for you. The whole strip opens the chat.
 */
function SlimRail({ className, buttonRef, onOpen }: { className: string; buttonRef: Ref<HTMLButtonElement>; onOpen: (viaKeyboard: boolean) => void }) {
  const ws = useWorkspace();
  const { unlogged, thinking } = useUnlogged();
  const b = ws.build;
  const building = b.status !== "idle" && b.status !== "done";
  const step = building && b.current?.kind === "step" ? b.current : null;
  const latest = ws.ledger[0] ?? null;
  const count = ws.ledger.length + (building ? b.completed.length : 0) + unlogged.length;
  const waiting = b.status === "repair";
  const working = thinking || (Boolean(step) && b.status === "running");
  const title = waiting ? "Waiting for you: pick a fix" : thinking ? "Prod AI is thinking…" : (step?.title ?? latest?.title ?? "Nothing yet");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={buttonRef}
          type="button"
          // A keyboard "click" has detail 0.
          onClick={(e) => onOpen(e.detail === 0)}
          aria-expanded={false}
          aria-label={`Open chat and history. ${count} ${count === 1 ? "item" : "items"}. Latest: ${title}`}
          className={cn("group h-full w-14 shrink-0 flex-col items-center gap-3 py-3 text-muted-foreground transition-colors hover:bg-raised/40 hover:text-foreground focus-visible:outline-offset-[-3px]", className)}
        >
          <span className="grid size-8 place-items-center rounded-lg border border-hairline bg-deep transition-colors group-hover:border-amber/40 group-hover:text-amber">
            <PanelLeftOpen className="size-4" aria-hidden />
          </span>
          <span aria-hidden className="h-px w-6 bg-hairline" />
          <span className="flex flex-col items-center gap-1.5">
            <span className="relative grid size-9 place-items-center rounded-xl border border-amber/25 bg-amber-soft text-amber transition-[border-color,transform] duration-200 group-hover:scale-105 group-hover:border-amber/50">
              {working ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MessagesSquare className="size-4" aria-hidden />}
              <span aria-hidden className="absolute -right-2 -top-2 min-w-[20px] rounded-full bg-raised px-1 text-center font-mono text-[10.5px] leading-[18px] tabular-nums text-foreground ring-2 ring-panel">
                {count > 99 ? "99+" : count}
              </span>
              {waiting && <span aria-hidden className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-fix ring-2 ring-panel" />}
            </span>
            <span className="text-[11px] font-medium leading-none text-foreground">Chat</span>
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" align="start" alignOffset={52} className="max-w-64">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-[0.12em] opacity-60">Chat &amp; history · latest</span>
          <span className="line-clamp-3">{title}</span>
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

/** A message just sent, as thread rows: yours, and Prod AI's reply once it's back. */
function sentRows(m: SentMessage): ThreadRow[] {
  const p = m.wo?.proposal ?? null;
  const meta = m.wo ? { workOrderId: m.wo.id } : null;
  const base = { project_id: m.wo?.project_id ?? "", checkpoint_id: null, lane: "thought" as const, blame: "user" as const, credits: 0, object_ref: m.scope, created_at: m.at };
  const you: ThreadRow = { ...base, id: `${m.key}:you`, kind: p?.answer ? "question" : "request", title: m.text, body: null, meta, sending: !m.wo };
  if (!p) return [you];
  const reply: ThreadRow = p.answer
    ? { ...base, id: `${m.key}:reply`, kind: "answer", title: "Answered your question · no change made", body: p.rationale, meta: { ...meta, suggestion: p.summary } }
    : { ...base, id: `${m.key}:reply`, kind: "quote", title: p.summary, body: p.rationale, meta: { ...meta, estimate: { credits: p.credits, minutes: p.minutes }, needsPerson: p.operations.length === 0 } };
  return [you, reply];
}

/** `className` sets the width and the display (flex or hidden). */
function RailPanel({
  className,
  reportVisibility = false,
  footer = false,
  collapseRef,
  onCollapse,
  onAsk,
}: {
  className: string;
  reportVisibility?: boolean;
  footer?: boolean;
  collapseRef?: Ref<HTMLButtonElement>;
  onCollapse?: (viaKeyboard: boolean) => void;
  onAsk?: () => void;
}) {
  const ws = useWorkspace();
  const { sent, setThreadVisible } = useChatState();
  const { unlogged, thinking: sending } = useUnlogged();
  // Sending a message brings the whole thread back ("All"), so your message and its reply are in view.
  const lastSent = sent.at(-1)?.key ?? null;
  const [picked, setPicked] = useState<{ filter: Filter; lastSent: string | null }>({ filter: "all", lastSent: null });
  const filter: Filter = picked.lastSent === lastSent ? picked.filter : "all";
  const setFilter = (f: Filter) => setPicked({ filter: f, lastSent });
  const [briefOpen, setBriefOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  // Fade an edge of the thread only when there is more to scroll to on that side.
  const [fade, setFade] = useState<"none" | "top" | "bottom" | "both">("none");

  const thread = useMemo(() => {
    const all: ThreadRow[] = [...ws.ledger].reverse();
    // An applied change, by the Work Order it came from: shown as that Work Order's outcome, not as a second message.
    const applied = new Map<string, ThreadRow>();
    const quoted = new Set<string>();
    for (const r of all) {
      const id = workOrderIdOf(r);
      if (id && r.kind === "change") applied.set(id, r);
      if (id && r.kind === "quote") quoted.add(id);
    }
    let rows: ThreadRow[];
    if (filter === "fixes") rows = all.filter((r) => r.blame === "system_fix");
    else if (filter === "team") rows = all.filter((r) => r.blame === "teammate" || r.kind === "handoff" || r.kind === "comment");
    else rows = [...all.filter((r) => !(r.kind === "change" && quoted.has(workOrderIdOf(r) ?? ""))), ...unlogged.flatMap(sentRows)];
    // A sent message keeps its key when the history's copy replaces it, so it doesn't animate in twice.
    const keyByOrder = new Map<string, string>();
    for (const m of sent) if (m.wo) keyByOrder.set(m.wo.id, m.key);
    const keyed = rows.map((r) => {
      const id = workOrderIdOf(r);
      const k = id ? keyByOrder.get(id) : undefined;
      const side = r.kind === "question" || r.kind === "request" ? "you" : r.kind === "answer" || r.kind === "quote" ? "reply" : null;
      return { row: r, key: k && side ? `${k}:${side}` : r.id };
    });
    return { rows: keyed, applied };
  }, [ws.ledger, filter, sent, unlogged]);

  const b = ws.build;
  const live = b.status !== "idle" && b.status !== "done" ? b.completed : [];
  const current = b.current?.kind === "step" && b.status === "running" ? b.current : null;
  const waiting = b.status === "repair";
  const thinking = filter === "all" && sending;
  const total = thread.rows.length + live.length;
  const itemCount = total + (thinking ? 1 : 0) + (current ? 1 : 0) + (waiting ? 1 : 0);
  // What's at the bottom right now: changes when a reply replaces "thinking", even though the count doesn't.
  const newest = `${thread.rows.at(-1)?.key ?? ""}|${thinking}|${live.length}|${current?.title ?? ""}|${waiting}`;

  const updateFade = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const top = el.scrollTop > 2;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setFade(top && bottom ? "both" : top ? "top" : bottom ? "bottom" : "none");
  }, []);

  // The newest message is always in view: after you send, when the reply lands, as the build moves.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [itemCount, newest, filter]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // Opening from the slim strip shows the panel for the first time: start at the latest item, like it always does.
    let hidden = el.clientHeight === 0;
    const ro = new ResizeObserver(() => {
      if (hidden && el.clientHeight > 0) el.scrollTop = el.scrollHeight;
      hidden = el.clientHeight === 0;
      // The composer puts answers here instead of in a card while this is on screen.
      if (reportVisibility) setThreadVisible(!hidden);
      updateFade();
    });
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      ro.disconnect();
      if (reportVisibility) setThreadVisible(false);
    };
  }, [updateFade, reportVisibility, setThreadVisible]);

  const fixes = ws.ledger.filter((r) => r.blame === "system_fix").length;

  return (
    <aside aria-label="Chat and history" className={cn("h-full shrink-0 flex-col", className)}>
      <div className="flex h-10 items-center justify-between gap-2 px-3 pt-1.5">
        <h2 className="flex items-center gap-2 text-[13px] font-medium tracking-tight">
          <MessagesSquare className="size-3.5 text-amber" aria-hidden />
          Chat &amp; history
        </h2>
        {onCollapse && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                ref={collapseRef}
                type="button"
                onClick={(e) => onCollapse(e.detail === 0)}
                aria-expanded
                aria-label="Collapse chat and history"
                className="-mr-1 grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
              >
                <PanelLeftClose className="size-4" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Collapse to a slim strip</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="px-3 pt-1">
        <button onClick={() => setBriefOpen((o) => !o)} className="panel w-full rounded-lg px-2.5 py-2 text-left" aria-expanded={briefOpen}>
          <span className="flex items-center justify-between gap-2">
            <span className="micro-label">The brief</span>
            <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", briefOpen && "rotate-180")} />
          </span>
          <span className={cn("mt-0.5 block text-[12px] leading-relaxed text-muted-foreground", !briefOpen && "line-clamp-1")}>{ws.project.brief || ws.blueprint.meta.plain}</span>
        </button>
      </div>

      {/* The filters get their own row, so the thread scrolls under a clean edge, not under the brief. */}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-b border-hairline px-3 pb-2">
        <div className="flex items-center gap-0.5 rounded-md border border-hairline bg-deep p-0.5" role="radiogroup" aria-label="Filter the chat">
          {(
            [
              ["all", "All"],
              ["fixes", `Fixes${fixes ? ` ${fixes}` : ""}`],
              ["team", "Team"],
            ] as [Filter, string][]
          ).map(([v, l]) => (
            <button key={v} role="radio" aria-checked={filter === v} onClick={() => setFilter(v)} className={cn("h-5 rounded px-1.5 text-[11px]", filter === v ? "bg-raised text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {l}
            </button>
          ))}
        </div>
        <span className="font-mono text-[10.5px] tabular-nums text-faint">
          {total} {total === 1 ? "item" : "items"}
        </span>
      </div>

      <div
        ref={scroller}
        onScroll={updateFade}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-2.5",
          fade === "both" && "[mask-image:linear-gradient(to_bottom,transparent,black_24px,black_calc(100%-20px),transparent)]",
          fade === "top" && "[mask-image:linear-gradient(to_bottom,transparent,black_24px)]",
          fade === "bottom" && "[mask-image:linear-gradient(to_bottom,black_calc(100%-20px),transparent)]",
        )}
      >
        <div>
          {itemCount === 0 ? (
            <p className="px-1 py-6 text-center text-[12.5px] leading-relaxed text-muted-foreground">
              {filter === "all"
                ? "Nothing here yet. Ask Prod AI anything in the box under the canvas: questions get an answer here, changes get a free quote."
                : "Nothing here yet for this filter."}
            </p>
          ) : (
            <ol className="flex flex-col gap-1.5" aria-label="Messages and events, oldest first">
              {thread.rows.map(({ row, key }) => (
                <ThreadItem key={key} row={row} applied={thread.applied} onAsk={onAsk} />
              ))}
              {thinking && <Thinking />}
              {live.map((s) => (
                <motion.li key={`live-${s.id}`} initial={{ opacity: 0, x: -8, filter: "blur(3px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)" }} transition={{ duration: 0.3, ease: EASE }} className="flex gap-2 rounded-lg px-1 py-1">
                  <LaneIcon lane={s.lane} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] leading-snug">{s.title}</p>
                    {s.detail && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{s.detail}</p>}
                  </div>
                  <Check className="mt-0.5 size-3.5 shrink-0 text-read" aria-label="done" />
                </motion.li>
              ))}
              {current && (
                <li className="flex gap-2 rounded-lg bg-amber-soft px-1 py-1" aria-live="polite">
                  <LaneIcon lane={current.lane} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] leading-snug text-foreground">{current.title}</p>
                    <p className="shimmer mt-1 h-1.5 w-2/3 rounded-full" />
                  </div>
                  <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-amber" aria-label="in progress" />
                </li>
              )}
              {waiting && (
                <li className="flex gap-2 rounded-lg border border-fix/30 bg-fix/10 px-1 py-1">
                  <LaneIcon lane="checked" />
                  <p className="text-[12px] leading-snug text-fix">Waiting for you: pick a fix</p>
                </li>
              )}
            </ol>
          )}
        </div>
      </div>

      {/* On a phone the chat is a sheet over the page: this closes it and puts you in the composer. */}
      {footer && onAsk && (
        <div className="border-t border-hairline p-2.5">
          <button
            type="button"
            onClick={onAsk}
            className="flex h-10 w-full items-center gap-2 rounded-full border border-hairline-hi bg-deep px-3.5 text-left text-[13px] text-muted-foreground transition-colors hover:border-amber/40 hover:text-foreground"
          >
            <MessageSquarePlus className="size-4 shrink-0 text-amber" aria-hidden />
            <span className="min-w-0 flex-1 truncate">Ask Prod AI or request a change</span>
            <Kbd aria-hidden className="max-sm:hidden">/</Kbd>
          </button>
        </div>
      )}
    </aside>
  );
}

/* ------------------------------------------------ the thread */

function ThreadItem({ row, applied, onAsk }: { row: ThreadRow; applied: Map<string, ThreadRow>; onAsk?: () => void }) {
  switch (row.kind) {
    case "brief":
      return <YouBubble row={row} text={row.body || row.title} caption="You described the project" />;
    case "question":
    case "request":
      return <YouBubble row={row} text={row.title} />;
    case "answer":
      return <AnswerMessage row={row} onAsk={onAsk} />;
    case "quote":
      return <QuoteMessage row={row} applied={applied} onAsk={onAsk} />;
    // The plan Prod AI proposed (it carries the plan's save point). "You approved…" rows stay compact.
    case "work_order":
      return row.checkpoint_id ? <PlanMessage row={row} /> : <CompactRow row={row} />;
    case "repair":
      return row.blame === "system_fix" ? <FixMessage row={row} /> : <CompactRow row={row} />;
    // A change from a Work Order whose quote isn't in view (older history): still Prod AI's reply.
    case "change":
      return workOrderIdOf(row) ? <AppliedMessage row={row} /> : <CompactRow row={row} />;
    default:
      return <CompactRow row={row} />;
  }
}

/** Yours: right-aligned, in the lume gradient. */
function YouBubble({ row, text, caption = "You" }: { row: ThreadRow; text: string; caption?: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 240;
  return (
    <motion.li
      initial={{ opacity: 0, x: 10, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="flex flex-col items-end py-1"
    >
      <div
        className={cn(
          "max-w-[88%] rounded-2xl rounded-br-md border border-amber/20 bg-[linear-gradient(135deg,rgb(223_255_79/0.13),rgb(141_255_158/0.07)_55%,rgb(63_224_197/0.08))] px-3 py-2 text-[12.5px] leading-relaxed text-foreground shadow-[0_10px_28px_-18px_rgb(141_255_158/0.6)]",
          row.sending && "opacity-85",
        )}
      >
        <p className={cn("whitespace-pre-wrap break-words", long && !open && "line-clamp-5")}>{text}</p>
        {long && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-1 text-[11px] text-muted-foreground hover:text-foreground">
            {open ? "Show less" : "Show more"}
          </button>
        )}
      </div>
      <div className="mt-1 flex max-w-[88%] items-center gap-1.5 text-[10.5px] text-faint">
        {row.object_ref && <ObjectChip objectRef={row.object_ref} />}
        <span className="shrink-0">{caption}</span>
        <span aria-hidden>·</span>
        {row.sending ? <span className="text-shimmer shrink-0">Sending</span> : <TimeAgo iso={row.created_at} className="shrink-0" />}
      </div>
    </motion.li>
  );
}

/** Prod AI's avatar: its mark on a ring of the lume gradient. The ring turns while it's thinking. */
function ProdAvatar({ thinking = false }: { thinking?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full p-px",
        thinking ? "solstice-ring" : "bg-[conic-gradient(from_210deg,var(--sol-flare),var(--sol-ember),var(--sol-amber),var(--sol-gold),var(--sol-dusk),var(--sol-flare))]",
      )}
    >
      <span className="grid size-full place-items-center rounded-full bg-deep text-amber">
        <svg viewBox="0 0 24 24" className="size-3.5">
          <path d="M7.5 20.4V6.4c0-1.6 1.2-2.8 2.8-2.8H13c2.9 0 5.2 2.2 5.2 5s-2.3 5-5.2 5h-2.2" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="10.8" cy="13.6" r="1.9" fill="#fffbe0" />
        </svg>
      </span>
    </span>
  );
}

/** Prod AI's side: left-aligned, under its name and what kind of reply it is. */
function AiMessage({ row, label, tone = "default", children }: { row: ThreadRow; label: string; tone?: "default" | "fix"; children: ReactNode }) {
  return (
    <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="flex gap-2 py-1 pr-1">
      <ProdAvatar />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1.5 text-[11px] leading-5">
          <span className="shrink-0 font-medium text-foreground">Prod AI</span>
          <span className={cn("truncate", tone === "fix" ? "text-fix" : "text-faint")}>{label}</span>
          <TimeAgo iso={row.created_at} className="ml-auto shrink-0 text-[10.5px] text-faint" />
        </p>
        <div className={cn("mt-0.5 rounded-2xl rounded-tl-md border px-3 py-2 text-[12.5px] leading-relaxed", tone === "fix" ? "border-fix/25 bg-fix/[0.07]" : "border-hairline bg-panel")}>{children}</div>
      </div>
    </motion.li>
  );
}

function Thinking() {
  return (
    <motion.li initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }} className="flex items-center gap-2 py-1">
      <ProdAvatar thinking />
      <span className="text-shimmer text-[12px]">Prod AI is thinking…</span>
    </motion.li>
  );
}

function AnswerMessage({ row, onAsk }: { row: ThreadRow; onAsk?: () => void }) {
  const chat = useChatState();
  const suggestion = typeof row.meta?.suggestion === "string" ? row.meta.suggestion : "";
  return (
    <AiMessage row={row} label="Answer · no change made">
      <p className="whitespace-pre-wrap break-words">{row.body || row.title}</p>
      {suggestion && (
        <button
          type="button"
          onClick={() => {
            chat.fill(suggestion);
            onAsk?.();
          }}
          className="mt-2 flex w-full items-start gap-1.5 rounded-lg border border-hairline bg-deep px-2 py-1.5 text-left text-[11.5px] leading-snug text-muted-foreground transition-colors hover:border-amber/40 hover:text-foreground"
        >
          <MessageSquarePlus className="mt-px size-3 shrink-0 text-amber" aria-hidden />
          <span>
            <span className="text-faint">Ask for it: </span>“{suggestion}”
          </span>
        </button>
      )}
    </AiMessage>
  );
}

type Outcome = { kind: "applied"; label: string; credits?: number } | { kind: "approved" } | { kind: "dismissed" } | { kind: "waiting"; where: string } | { kind: "open" };

/** What became of a change Work Order: applied (with its save point), dismissed, or still waiting for you. */
function quoteOutcome(id: string, applied: Map<string, ThreadRow>, chat: ReturnType<typeof useChatState>, checkpoints: CheckpointMeta[]): Outcome | null {
  const change = applied.get(id);
  if (change) {
    const seq = checkpoints.find((c) => c.id === change.checkpoint_id)?.seq;
    return { kind: "applied", label: seq ? `save point #${seq}` : "", credits: Number(change.credits) };
  }
  const local = chat.outcomes[id];
  if (local?.status === "applied") return { kind: "applied", label: local.label.replace(/^Save point/, "save point") };
  if (local?.status === "dismissed") return { kind: "dismissed" };
  if (chat.order?.wo.id === id) return { kind: "waiting", where: "below the canvas" };
  const status = chat.orders.get(id)?.status;
  if (status === "rejected") return { kind: "dismissed" };
  if (status === "approved" || status === "running" || status === "done") return { kind: "approved" };
  if (status === "proposed") return { kind: "open" };
  return null;
}

function OutcomeChip({ outcome, onReview }: { outcome: Outcome; onReview?: () => void }) {
  const chip = "inline-flex h-5 max-w-full items-center gap-1 rounded-full border px-2 text-[11px] font-medium";
  switch (outcome.kind) {
    case "applied":
      return (
        <span className={cn(chip, "border-read/30 bg-read/10 text-read")}>
          <Check className="size-3 shrink-0" aria-hidden />
          <span className="truncate">
            {outcome.label ? `Applied as ${outcome.label}` : "Applied"}
            {outcome.credits ? ` · ${formatCredits(outcome.credits)}` : ""}
          </span>
        </span>
      );
    case "approved":
      return (
        <span className={cn(chip, "border-read/30 bg-read/10 text-read")}>
          <Check className="size-3 shrink-0" aria-hidden /> Approved
        </span>
      );
    case "dismissed":
      return (
        <span className={cn(chip, "border-hairline text-muted-foreground")}>
          <X className="size-3 shrink-0" aria-hidden /> Dismissed · nothing charged
        </span>
      );
    case "waiting":
      return (
        <span className={cn(chip, "border-amber/35 bg-amber-soft text-amber")}>
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-amber pulse-ring" />
          <span className="truncate">Waiting for your OK {outcome.where}</span>
        </span>
      );
    case "open":
      return (
        <button type="button" onClick={onReview} className={cn(chip, "border-amber/35 text-amber transition-colors hover:bg-amber-soft")}>
          Not decided · review it
        </button>
      );
  }
}

function QuoteMessage({ row, applied, onAsk }: { row: ThreadRow; applied: Map<string, ThreadRow>; onAsk?: () => void }) {
  const ws = useWorkspace();
  const chat = useChatState();
  const id = workOrderIdOf(row);
  const needsPerson = row.meta?.needsPerson === true;
  const est = row.meta?.estimate as { credits?: unknown; minutes?: unknown } | undefined;
  const credits = typeof est?.credits === "number" ? est.credits : null;
  const minutes = typeof est?.minutes === "number" ? est.minutes : null;
  const outcome = id && !needsPerson ? quoteOutcome(id, applied, chat, ws.checkpoints) : null;
  return (
    <AiMessage row={row} label={needsPerson ? "Needs a person" : "Work Order · free quote"}>
      <p className="font-medium leading-snug">{row.title}</p>
      {row.body && <ClampText text={row.body} className="mt-0.5 text-[12px] text-muted-foreground" />}
      {(outcome || (credits !== null && !needsPerson)) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {outcome && (
            <OutcomeChip
              outcome={outcome}
              onReview={() => {
                if (!id) return;
                chat.review(id);
                onAsk?.();
              }}
            />
          )}
          {credits !== null && outcome?.kind !== "applied" && outcome?.kind !== "dismissed" && (
            <span className="text-[11px] leading-snug text-faint">
              {formatCredits(credits)} ≈ {creditsUsd(credits)}
              {minutes !== null ? ` · ${changeTimeLabel(minutes).label}` : ""}
            </span>
          )}
        </div>
      )}
    </AiMessage>
  );
}

function PlanMessage({ row }: { row: ThreadRow }) {
  const ws = useWorkspace();
  const outcome: Outcome | null = ws.project.buildState !== "draft" ? { kind: "approved" } : ws.pendingWorkOrder ? { kind: "waiting", where: "on the plan" } : null;
  return (
    <AiMessage row={row} label="Work Order · the plan">
      <p className="font-medium leading-snug">{row.title}</p>
      {row.body && <ClampText text={row.body} className="mt-0.5 text-[12px] text-muted-foreground" />}
      {outcome && (
        <div className="mt-2">
          <OutcomeChip outcome={outcome} />
        </div>
      )}
    </AiMessage>
  );
}

function FixMessage({ row }: { row: ThreadRow }) {
  return (
    <AiMessage row={row} label="Our fix · free" tone="fix">
      <p className="font-medium leading-snug">{row.title}</p>
      {row.body && <ClampText text={row.body} className="mt-0.5 text-[12px] text-muted-foreground" />}
      {row.object_ref && (
        <div className="mt-2">
          <ObjectChip objectRef={row.object_ref} />
        </div>
      )}
    </AiMessage>
  );
}

function AppliedMessage({ row }: { row: ThreadRow }) {
  const ws = useWorkspace();
  const seq = ws.checkpoints.find((c) => c.id === row.checkpoint_id)?.seq;
  return (
    <AiMessage row={row} label="Change applied">
      <p className="font-medium leading-snug">{row.title}</p>
      {row.body && <ClampText text={row.body} className="mt-0.5 text-[12px] text-muted-foreground" />}
      <div className="mt-2">
        <OutcomeChip outcome={{ kind: "applied", label: seq ? `save point #${seq}` : "", credits: Number(row.credits) }} />
      </div>
    </AiMessage>
  );
}

/** Long text folds to a few lines, with a toggle. */
function ClampText({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 150;
  return (
    <div className={className}>
      <p className={cn("whitespace-pre-wrap break-words", long && !open && "line-clamp-3")}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-0.5 text-[11px] text-faint hover:text-foreground">
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function ObjectChip({ objectRef }: { objectRef: ObjectRef }) {
  const ws = useWorkspace();
  return (
    <button
      type="button"
      onClick={() => ws.select(objectRef)}
      className="inline-flex h-5 min-w-0 max-w-[160px] items-center gap-1 rounded-full border border-hairline px-2 text-[11px] text-muted-foreground transition-colors hover:border-amber/40 hover:text-foreground"
    >
      <Target className="size-2.5 shrink-0" aria-hidden />
      <span className="truncate">{objectLabel(ws.blueprint, objectRef)}</span>
    </button>
  );
}

function LaneIcon({ lane }: { lane: Lane }) {
  const L = LANE[lane];
  return (
    <span className={cn("mt-px grid size-5 shrink-0 place-items-center rounded-md", L.cls)} title={L.label}>
      <L.icon className="size-3" aria-hidden />
      <span className="sr-only">{L.label}</span>
    </span>
  );
}

/** Build steps and other events: a compact row in the flow, in the history's plain English. */
function CompactRow({ row }: { row: ThreadRow }) {
  const [open, setOpen] = useState(false);
  const isFix = row.blame === "system_fix";
  const credits = Number(row.credits);
  const badge = credits > 0 || row.blame !== "user";
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className={cn("group rounded-lg px-1 py-1 transition-colors hover:bg-raised/50", isFix && "bg-fix/[0.06] shadow-[inset_2px_0_0_rgb(180_140_255/0.5)]")}
    >
      <div className="flex gap-2">
        <LaneIcon lane={row.lane} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            {row.body ? (
              <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                <span className="block text-[12px] leading-snug text-foreground/90">{row.title}</span>
                <span className={cn("mt-0.5 block whitespace-pre-line text-[11px] leading-relaxed text-muted-foreground", !open && "line-clamp-1")}>{row.body}</span>
              </button>
            ) : (
              <p className="min-w-0 flex-1 text-[12px] leading-snug text-foreground/90">{row.title}</p>
            )}
            <TimeAgo iso={row.created_at} className="shrink-0 text-[10px] text-faint" />
          </div>
          {(badge || row.object_ref) && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {badge && <BlameBadge blame={row.blame} credits={credits} />}
              {row.object_ref && <ObjectChip objectRef={row.object_ref} />}
            </div>
          )}
        </div>
      </div>
    </motion.li>
  );
}
