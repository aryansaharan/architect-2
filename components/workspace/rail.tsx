"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ChevronUp, Crosshair, NotebookPen, PanelRightClose, Undo2, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TimeAgo } from "@/components/time-ago";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { DUR, EASE } from "@/lib/motion";
import { DrawnCheck } from "@/components/motion/sheet-draw";
import { objectLabel } from "@/lib/blueprint";
import type { ObjectRef } from "@/lib/blueprint/schema";
import type { CheckpointMeta, Lane, LedgerKind, LedgerRow } from "@/lib/db/types";
import type { ChatLedgerKind } from "@/lib/db/writes";
import { useWorkspace } from "./context";
import { NoteWriter, creditWords, useChatState, versionWords, workOrderIdOf, type SentMessage } from "./composer-dock";
import { marginModeFor, projectSection, readRail, subscribeRail, writeRail, type RailPref } from "./rail-pref";
import { undoTo } from "./undo";
import { codeChangesOf, codeTouchWords } from "@/components/code-apps/change-files";

/** A history entry, or a note just sent that the history doesn't have yet (same shape, so both render the same). */
type ThreadRow = Omit<LedgerRow, "kind"> & { kind: LedgerKind | ChatLedgerKind; sending?: boolean };

/** The open margin: narrower on smaller laptops, 340px from 1400px wide. Below 1024px it is a bottom sheet. */
const MARGIN_W = "lg:w-[288px] xl:w-[304px] min-[1400px]:w-[340px]";

/** A pencil rule down the page edge: a slightly wobbly graphite line that tiles seamlessly. */
const RULE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='180' viewBox='0 0 8 180'%3E%3Cpath d='M4 0C3.2 22 4.9 41 4.1 63S3.3 104 4.4 126 3.6 161 4 180' fill='none' stroke='%233f3d38' stroke-opacity='.42' stroke-width='1.3' stroke-linecap='round'/%3E%3C/svg%3E")`;

/**
 * True for a note that arrived while the margin was on the page, false for history that was already there.
 * A fresh note enters from below and its marks draw themselves; history just sits on the paper.
 */
const FreshNote = createContext(false);

/** How a note enters the margin: from just below with a fade (250ms), once, and only if it's new. */
function enterProps(fresh: boolean) {
  return { initial: fresh ? { opacity: 0, y: 8 } : false, animate: { opacity: 1, y: 0 }, transition: { duration: DUR.panel, ease: EASE } } as const;
}
function useEnter() {
  return enterProps(useContext(FreshNote));
}

/** True below 1024px, where the margin becomes a bottom sheet. Matches Tailwind's `lg`. */
function usePhone() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(width < 64rem)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(width < 64rem)").matches,
    () => false,
  );
}

/** Notes the history already has, by proposed change: the rest are still on their way and show from local state. */
function useUnlogged(): { unlogged: SentMessage[]; thinking: boolean } {
  const ws = useWorkspace();
  const { sent } = useChatState();
  return useMemo(() => {
    const logged = new Set(ws.ledger.map(workOrderIdOf));
    return { unlogged: sent.filter((m) => !m.wo || !logged.has(m.wo.id)), thinking: sent.some((m) => !m.wo) };
  }, [ws.ledger, sent]);
}

/** How many notes there are, and the latest one, for the folded tab and the phone button. */
function useNotesSummary() {
  const ws = useWorkspace();
  const { unlogged, thinking } = useUnlogged();
  const b = ws.build;
  const building = b.status !== "idle" && b.status !== "done";
  const step = building && b.current?.kind === "step" ? b.current : null;
  const waiting = b.status === "repair";
  const count = ws.ledger.length + (building ? b.completed.length : 0) + unlogged.length;
  const title = waiting ? "Waiting for you: pick a fix" : thinking ? "Prod AI is reading your note…" : (step?.title ?? ws.ledger[0]?.title ?? "Nothing yet");
  return { count, waiting, title };
}

/**
 * The margin: notes written beside the page, like marking up a printout. Your notes in pencil,
 * Prod AI's replies as small typed notes, proposed changes as margin cards, build progress as ticks,
 * and a ruled slip at the bottom to write on.
 *
 * - On the Sheet (/p/[id]) it is open on the right, unless you fold it (remembered).
 * - Elsewhere it is folded to a slim "Notes" tab that opens it. On AI helpers it stays folded
 *   until you open it yourself, so the playground's box is the only one to type in.
 * - Focusing the writing area (the "/" key, "Ask for a change" buttons, a scoped note) opens it,
 *   and it stays open after you send a note until you fold it, so the reply is seen.
 * - Below 1024px the same panel is a bottom sheet, opened by a slim "Notes" bar along the bottom of the
 *   screen. The bar sits in the page's flow (the shell stacks it under the page), so it never covers content.
 */
export function Margin({ initialPref = "auto" }: { initialPref?: RailPref }) {
  const ws = useWorkspace();
  const pathname = usePathname();
  const mode = marginModeFor(projectSection(pathname, ws.project.id));
  const pref = useSyncExternalStore(subscribeRail, readRail, () => initialPref);
  const phone = usePhone();
  const { count, waiting, title } = useNotesSummary();
  // Opened from the tab on a page other than the Sheet (not remembered).
  const [offOpen, setOffOpen] = useState(false);
  // A note was just sent: stay open until it's folded, so the reply is read.
  const [held, setHeld] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  // Arriving on AI helpers folds the margin away, even if it was open on the page before.
  const [lastMode, setLastMode] = useState(mode);
  if (lastMode !== mode) {
    setLastMode(mode);
    if (mode === "quiet") {
      setOffOpen(false);
      setHeld(false);
    }
  }
  const engaged = focusIn || held;
  const desktopOpen = (mode === "sheet" ? pref !== "collapsed" : offOpen) || engaged;
  const phoneShown = phoneOpen || engaged;
  const shown = phone ? phoneShown : desktopOpen;

  const panelRef = useRef<HTMLElement>(null);
  const tabRef = useRef<HTMLButtonElement>(null);
  const foldRef = useRef<HTMLButtonElement>(null);
  const phoneBtnRef = useRef<HTMLButtonElement>(null);

  const openMargin = (viaKeyboard: boolean) => {
    if (phone) {
      setPhoneOpen(true);
      // Focus the sheet, not the writing area: reading shouldn't pop up the phone keyboard.
      requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));
      return;
    }
    if (mode === "sheet") writeRail("open");
    else setOffOpen(true);
    // From the keyboard, the tab that was pressed is gone now: hand focus to its counterpart.
    if (viaKeyboard) requestAnimationFrame(() => foldRef.current?.focus({ preventScroll: true }));
  };

  const fold = (viaKeyboard: boolean) => {
    setHeld(false);
    setFocusIn(false);
    if (phone) {
      setPhoneOpen(false);
      requestAnimationFrame(() => phoneBtnRef.current?.focus({ preventScroll: true }));
      return;
    }
    if (mode === "sheet") writeRail("collapsed");
    else setOffOpen(false);
    requestAnimationFrame(() => {
      if (viaKeyboard) tabRef.current?.focus({ preventScroll: true });
      else if (panelRef.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    });
  };

  // On a phone, Escape closes the open notes wherever focus is (after Undo it can fall back to the page),
  // and focus goes back to the Notes bar. Menus and dialogs on top handle their own Escape first.
  useEffect(() => {
    if (!phone || !phoneShown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
      e.preventDefault();
      fold(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <>
      {/* On a phone, tapping the page behind the sheet closes it. */}
      {phoneShown && <div aria-hidden onClick={() => fold(false)} className="fixed inset-0 z-40 bg-foreground/10 lg:hidden" />}
      <div
        data-margin={shown ? "open" : "folded"}
        className={cn(
          "relative shrink-0 bg-canvas",
          // Desktop: a column on the right of the page.
          "lg:flex lg:h-full lg:overflow-clip lg:transition-[width] lg:duration-250 lg:ease-paper",
          desktopOpen ? MARGIN_W : "lg:w-11",
          // Phone: a bottom sheet.
          "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-50 max-lg:flex max-lg:h-[min(86dvh,680px)] max-lg:flex-col max-lg:rounded-t-lg max-lg:border-t max-lg:border-hairline-hi max-lg:shadow-float max-lg:transition-transform max-lg:duration-250 max-lg:ease-paper",
          phoneShown ? "max-lg:translate-y-0" : "max-lg:pointer-events-none max-lg:translate-y-[calc(100%+24px)]",
        )}
      >
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-2 max-lg:hidden" style={{ backgroundImage: RULE, backgroundRepeat: "repeat-y" }} />
        {!desktopOpen && <SlimTab buttonRef={tabRef} onOpen={openMargin} count={count} waiting={waiting} title={title} />}
        {/* Always in the page, so the writing area can be focused (and the margin opened) from anywhere. Folded, it sits clipped past the tab. */}
        <aside
          id="notes"
          ref={panelRef}
          tabIndex={-1}
          aria-label="Notes"
          onFocus={() => setFocusIn(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusIn(false);
          }}
          className={cn("flex h-full min-h-0 flex-col outline-none focus-visible:outline-none max-lg:w-full lg:shrink-0", MARGIN_W)}
        >
          {shown && <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-hairline-hi lg:hidden" />}
          <header className={cn("mx-3 flex shrink-0 items-center gap-2 border-b border-dashed border-hairline-hi pb-2 pl-2 pt-3 max-lg:pl-1", !shown && "hidden")}>
            <h2 className="font-pencil text-note text-foreground">Notes</h2>
            <span className="mt-1 truncate text-meta text-faint">in the margin</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  ref={foldRef}
                  type="button"
                  onClick={(e) => fold(e.detail === 0)}
                  aria-expanded
                  aria-label={phone ? "Close notes" : "Fold the notes away"}
                  className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-150 ease-paper hover:bg-deep hover:text-foreground"
                >
                  {phone ? <X className="size-4" aria-hidden /> : <PanelRightClose className="size-4" aria-hidden />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">{phone ? "Close" : "Fold to a slim tab"}</TooltipContent>
            </Tooltip>
          </header>
          <NotesThread shown={shown} onAsk={() => ws.focusComposer()} />
          <NoteWriter suggest={mode === "sheet"} onSent={() => setHeld(true)} className="px-3 pb-3 pt-2 lg:pl-4" />
        </aside>
      </div>
      {/* Below 1024px: a slim bar along the bottom, in the page's flow, with the latest note. The open sheet covers it. */}
      <button
        ref={phoneBtnRef}
        type="button"
        onClick={() => openMargin(false)}
        inert={phoneShown}
        aria-controls="notes"
        aria-expanded={phoneShown}
        aria-label={`Notes: ${count} ${count === 1 ? "note" : "notes"}. Latest: ${title}`}
        className="flex h-11 w-full shrink-0 items-center gap-2.5 border-t border-hairline-hi bg-canvas pl-4 pr-3 text-left transition-colors duration-150 ease-paper hover:bg-deep lg:hidden"
      >
        <NotebookPen className="size-4 shrink-0 text-brand" aria-hidden />
        <span className="shrink-0 font-pencil text-note text-foreground">Notes</span>
        <span className="shrink-0 rounded-full border border-hairline-hi bg-panel px-1.5 text-badge font-medium tabular-nums leading-4 text-muted-foreground">{count > 99 ? "99+" : count}</span>
        <span className={cn("min-w-0 flex-1 truncate text-meta", waiting ? "text-fix" : "text-muted-foreground")}>{title}</span>
        <ChevronUp className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </>
  );
}

/** Folded: a slim tab down the page edge that says "Notes", with how many there are. */
function SlimTab({ buttonRef, onOpen, count, waiting, title }: { buttonRef: Ref<HTMLButtonElement>; onOpen: (viaKeyboard: boolean) => void; count: number; waiting: boolean; title: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={buttonRef}
          type="button"
          // A keyboard "click" has detail 0.
          onClick={(e) => onOpen(e.detail === 0)}
          aria-controls="notes"
          aria-expanded={false}
          aria-label={`Open notes. ${count} ${count === 1 ? "note" : "notes"}. Latest: ${title}`}
          className="group flex h-full w-11 shrink-0 flex-col items-center gap-2.5 pt-4 text-muted-foreground transition-colors duration-150 ease-paper hover:bg-panel/70 hover:text-foreground focus-visible:outline-offset-[-3px] max-lg:hidden"
        >
          <NotebookPen className="size-4 text-brand" aria-hidden />
          <span className="font-pencil text-note leading-none text-foreground [writing-mode:vertical-rl]">Notes</span>
          <span className="text-badge font-medium tabular-nums">{count > 99 ? "99+" : count}</span>
          {waiting && <span aria-hidden className="size-1.5 rounded-full bg-fix" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-64">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-badge font-semibold uppercase tracking-wide opacity-70">Notes · latest</span>
          <span className="line-clamp-3">{title}</span>
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

/** A note just sent, as thread rows: yours, and Prod AI's reply once it's back. */
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

/** The notes, oldest first, with the build's progress as ticks at the end. `shown` false keeps it in the page but out of sight. */
function NotesThread({ shown, onAsk }: { shown: boolean; onAsk: () => void }) {
  const ws = useWorkspace();
  const { sent, setThreadVisible } = useChatState();
  const { unlogged, thinking } = useUnlogged();
  const scroller = useRef<HTMLDivElement>(null);

  const thread = useMemo(() => {
    const all: ThreadRow[] = [...ws.ledger].reverse();
    // An applied change, by the proposal it came from: shown as that proposal's outcome, not as a second note.
    const applied = new Map<string, ThreadRow>();
    const quoted = new Set<string>();
    for (const r of all) {
      const id = workOrderIdOf(r);
      if (id && r.kind === "change") applied.set(id, r);
      if (id && r.kind === "quote") quoted.add(id);
    }
    const rows: ThreadRow[] = [...all.filter((r) => !(r.kind === "change" && quoted.has(workOrderIdOf(r) ?? ""))), ...unlogged.flatMap(sentRows)];
    // A sent note keeps its key when the history's copy replaces it, so it doesn't animate in twice.
    const keyByOrder = new Map<string, string>();
    for (const m of sent) if (m.wo) keyByOrder.set(m.wo.id, m.key);
    const keyed = rows.map((r) => {
      const id = workOrderIdOf(r);
      const k = id ? keyByOrder.get(id) : undefined;
      const side = r.kind === "question" || r.kind === "request" ? "you" : r.kind === "answer" || r.kind === "quote" ? "reply" : null;
      return { row: r, key: k && side ? `${k}:${side}` : r.id };
    });
    return { rows: keyed, applied };
  }, [ws.ledger, sent, unlogged]);

  const b = ws.build;
  const live = b.status !== "idle" && b.status !== "done" ? b.completed : [];
  const current = b.current?.kind === "step" && b.status === "running" ? b.current : null;
  const waiting = b.status === "repair";
  const itemCount = thread.rows.length + live.length + (thinking ? 1 : 0) + (current ? 1 : 0) + (waiting ? 1 : 0);
  // What was already here when the margin first drew: it doesn't animate in. Everything after does.
  const [born] = useState(() => new Set([...thread.rows.map((r) => r.key), ...live.map((s) => `live-${s.id}`)]));
  // What's at the bottom right now: changes when a reply replaces "reading", even though the count doesn't.
  const newest = `${thread.rows.at(-1)?.key ?? ""}|${thinking}|${live.length}|${current?.title ?? ""}|${waiting}`;

  // The newest note is always in view: after you send, when the reply lands, as the build moves.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [itemCount, newest]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // Opening a folded margin shows the thread for the first time: start at the latest note.
    let hidden = el.clientHeight === 0;
    const ro = new ResizeObserver(() => {
      if (hidden && el.clientHeight > 0) el.scrollTop = el.scrollHeight;
      hidden = el.clientHeight === 0;
      // The writer puts answers here instead of in a card while this is on screen.
      setThreadVisible(!hidden);
    });
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      ro.disconnect();
      setThreadVisible(false);
    };
  }, [setThreadVisible]);

  return (
    <div ref={scroller} className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3 pl-5 pr-3 pt-3 max-lg:pl-4", !shown && "hidden")}>
      {itemCount === 0 ? (
        <div className="px-1 py-6">
          <p className="font-pencil text-note text-muted-foreground">No notes yet.</p>
          <p className="mt-1.5 text-meta text-muted-foreground">
            Write in the margin like you would on a printout: “make the header green”, “add a priority column”. Questions get an answer here. Changes come back with a price first.
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-3" aria-label="Notes, oldest first">
          {thread.rows.map(({ row, key }) => (
            <FreshNote.Provider key={key} value={!born.has(key)}>
              <ThreadItem row={row} applied={thread.applied} onAsk={onAsk} />
            </FreshNote.Provider>
          ))}
          {thinking && (
            <li className="flex items-center gap-2 text-meta text-muted-foreground">
              <ProdMark />
              Prod AI is reading your note…
            </li>
          )}
          {live.map((s) => (
            <motion.li key={`live-${s.id}`} {...enterProps(!born.has(`live-${s.id}`))} className="flex gap-2 pl-0.5">
              <PencilTick className={cn("mt-[3px] size-3.5 shrink-0", LANE[s.lane].tone)} />
              <div className="min-w-0 flex-1">
                <p className="text-meta text-foreground/85">
                  <span className="sr-only">Done: </span>
                  {s.title}
                </p>
                {s.detail && <p className="line-clamp-2 text-meta text-muted-foreground">{s.detail}</p>}
              </div>
            </motion.li>
          ))}
          {current && (
            <li className="flex gap-2 pl-0.5" aria-live="polite">
              <PencilDash className="mt-[3px] size-3.5 shrink-0 text-brand" />
              <p className="text-meta text-foreground">Now: {current.title}…</p>
            </li>
          )}
          {waiting && (
            <li className="flex gap-2 pl-0.5 text-fix">
              <PencilDash className="mt-[3px] size-3.5 shrink-0" />
              <p className="text-meta">Waiting for you: pick a fix</p>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

/* ------------------------------------------------ the notes */

function ThreadItem({ row, applied, onAsk }: { row: ThreadRow; applied: Map<string, ThreadRow>; onAsk: () => void }) {
  switch (row.kind) {
    case "brief":
      return <YouNote row={row} text={row.body || row.title} caption="Your first note" />;
    case "question":
    case "request":
      return <YouNote row={row} text={row.title} />;
    case "answer":
      return <AnswerNote row={row} onAsk={onAsk} />;
    case "quote":
      return <ChangeNote row={row} applied={applied} />;
    // The plan Prod AI proposed (it carries the plan's version). "You approved…" rows stay ticks.
    case "work_order":
      return row.checkpoint_id ? <PlanNote row={row} /> : <TickRow row={row} />;
    case "repair":
      return row.blame === "system_fix" ? <FixNote row={row} /> : <TickRow row={row} />;
    // A change whose proposal isn't in view (older history): still Prod AI's reply.
    case "change":
      return workOrderIdOf(row) ? <AppliedNote row={row} /> : <TickRow row={row} />;
    default:
      return <TickRow row={row} />;
  }
}

/** Yours: written in pencil, straight on the paper. */
function YouNote({ row, text, caption = "You" }: { row: ThreadRow; text: string; caption?: string }) {
  const [open, setOpen] = useState(false);
  const enter = useEnter();
  const long = text.length > 220;
  return (
    <motion.li {...enter} className={cn("pl-0.5", row.sending && "opacity-70")}>
      {row.object_ref && (
        <div className="mb-0.5">
          <AboutTag objectRef={row.object_ref} />
        </div>
      )}
      <p className={cn("font-pencil whitespace-pre-wrap break-words text-note leading-tight text-foreground", long && !open && "line-clamp-5")}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-0.5 text-meta text-muted-foreground hover:text-foreground">
          {open ? "Show less" : "Show more"}
        </button>
      )}
      <p className="mt-0.5 text-meta text-faint">
        {caption} · {row.sending ? "sending…" : <TimeAgo iso={row.created_at} />}
      </p>
    </motion.li>
  );
}

/** Prod AI's mark, small, beside its typed notes. */
function ProdMark() {
  return (
    <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-hairline-hi bg-panel">
      <LogoMark className="size-3.5" />
    </span>
  );
}

/** Prod AI's side: a small typed note pinned in the margin, under its name and what kind of reply it is. */
function AiNote({ row, label, tone = "default", children }: { row: ThreadRow; label: string; tone?: "default" | "fix"; children: ReactNode }) {
  const enter = useEnter();
  return (
    <motion.li {...enter} className="flex gap-2">
      <ProdMark />
      {/* Typed, so in print: the title in body text, the rest in meta. */}
      <div className={cn("panel min-w-0 flex-1 rounded-sm px-2.5 py-2 text-body", tone === "fix" && "border-fix/30")}>
        <p className="mb-0.5 flex items-baseline gap-1.5 text-meta">
          <span className="shrink-0 font-medium text-foreground">Prod AI</span>
          <span className={cn("truncate", tone === "fix" ? "text-fix" : "text-faint")}>{label}</span>
          <TimeAgo iso={row.created_at} className="ml-auto shrink-0 text-faint" />
        </p>
        {children}
      </div>
    </motion.li>
  );
}

function AnswerNote({ row, onAsk }: { row: ThreadRow; onAsk: () => void }) {
  const chat = useChatState();
  const suggestion = typeof row.meta?.suggestion === "string" ? row.meta.suggestion : "";
  return (
    <AiNote row={row} label="answered · nothing changed">
      <p className="whitespace-pre-wrap break-words text-meta">{row.body || row.title}</p>
      {suggestion && (
        <button
          type="button"
          onClick={() => {
            chat.fill(suggestion);
            onAsk();
          }}
          className="mt-2 flex w-full items-start gap-1.5 rounded-sm border border-dashed border-hairline-hi px-2 py-1.5 text-left text-meta text-muted-foreground transition-colors duration-150 ease-paper hover:border-line-strong hover:text-foreground"
        >
          <span>
            <span className="text-faint">Ask for it: </span>“{suggestion}”
          </span>
        </button>
      )}
    </AiNote>
  );
}

type Outcome =
  | { kind: "applied"; version: string; undo: string | null; credits?: number }
  | { kind: "approved" }
  | { kind: "dismissed" }
  | { kind: "waiting" }
  | { kind: "open" };

/** An applied change: its version, and Undo while it is still the current version (going back further would drop what came after). */
function appliedOutcome(change: ThreadRow, checkpoints: CheckpointMeta[], currentId: string | null): Outcome {
  const cp = checkpoints.find((c) => c.id === change.checkpoint_id);
  const prev = cp && cp.id === currentId ? checkpoints.filter((c) => c.seq < cp.seq).sort((a, b) => b.seq - a.seq)[0] : undefined;
  return { kind: "applied", version: cp ? `version ${cp.seq}` : "", undo: prev?.id ?? null, credits: Number(change.credits) };
}

/** What became of a proposed change: applied (with its version), not now, or still waiting for you. */
function changeOutcome(id: string, applied: Map<string, ThreadRow>, chat: ReturnType<typeof useChatState>, ws: ReturnType<typeof useWorkspace>): Outcome | null {
  const change = applied.get(id);
  if (change) return appliedOutcome(change, ws.checkpoints, ws.project.currentCheckpointId);
  const local = chat.outcomes[id];
  if (local?.status === "applied") return { kind: "applied", version: versionWords(local.label), undo: local.undo ?? null };
  if (local?.status === "dismissed") return { kind: "dismissed" };
  if (chat.order?.wo.id === id) return { kind: "waiting" };
  const status = chat.orders.get(id)?.status;
  if (status === "rejected") return { kind: "dismissed" };
  if (status === "approved" || status === "running" || status === "done") return { kind: "approved" };
  if (status === "proposed") return { kind: "open" };
  return null;
}

function OutcomeLine({ outcome, onReview }: { outcome: Outcome; onReview?: () => void }) {
  const ws = useWorkspace();
  const router = useRouter();
  const fresh = useContext(FreshNote);
  const [undoing, setUndoing] = useState(false);
  // Undone from here: the tick comes back off the paper and the line says where you are now.
  const [undoneTo, setUndoneTo] = useState<string | null>(null);
  switch (outcome.kind) {
    case "applied": {
      const undo = outcome.undo;
      if (undoneTo)
        return (
          <span className="inline-flex items-center gap-1 text-meta font-medium tabular-nums text-muted-foreground">
            <span className="relative size-3.5 shrink-0">
              <DrawnCheck undraw draw={false} strokeWidth={1.7} className="absolute inset-0 size-3.5 text-ok" />
              <motion.span aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: DUR.hover, delay: DUR.panel, ease: EASE }} className="absolute inset-0 grid place-items-center">
                <Undo2 className="size-3" />
              </motion.span>
            </span>
            Undone · back to {undoneTo}
          </span>
        );
      return (
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="inline-flex items-center gap-1 text-meta font-medium tabular-nums text-ok">
            {/* Drawn when it happens here; history is already ticked. */}
            <DrawnCheck draw={fresh} strokeWidth={1.7} className="size-3.5 shrink-0" />
            Applied{outcome.version ? ` · ${outcome.version}` : ""}
            {outcome.credits ? <span className="font-normal text-muted-foreground"> · {creditWords(outcome.credits)}</span> : null}
          </span>
          {undo && (
            <button
              type="button"
              disabled={undoing}
              onClick={async (e) => {
                setUndoing(true);
                const back = ws.checkpoints.find((c) => c.id === undo)?.seq;
                const notes = e.currentTarget.closest<HTMLElement>("#notes");
                // undoTo only refreshes when going back worked.
                await undoTo(ws.project.id, undo, () => {
                  setUndoneTo(back ? `version ${back}` : "the version before");
                  router.refresh();
                  // This button goes away: keep focus in the notes rather than letting it fall back to the page.
                  requestAnimationFrame(() => {
                    if (!document.activeElement || document.activeElement === document.body) notes?.focus({ preventScroll: true });
                  });
                });
                setUndoing(false);
              }}
              className="inline-flex items-center gap-1 rounded-sm text-meta font-medium text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors duration-150 ease-paper hover:text-foreground disabled:opacity-50"
            >
              <Undo2 className="size-3" aria-hidden />
              {undoing ? "Undoing…" : "Undo"}
            </button>
          )}
        </span>
      );
    }
    case "approved":
      return (
        <span className="inline-flex items-center gap-1 text-meta font-medium text-ok">
          <DrawnCheck draw={fresh} strokeWidth={1.7} className="size-3.5 shrink-0" /> Applied
        </span>
      );
    case "dismissed":
      return <span className="text-meta text-muted-foreground">Not now · nothing charged</span>;
    case "waiting":
      return <span className="text-meta font-medium text-brand">Waiting for you below</span>;
    case "open":
      return (
        <button type="button" onClick={onReview} className="text-meta font-medium text-brand underline decoration-dotted underline-offset-4 hover:text-brand-hi">
          Not decided · review it
        </button>
      );
  }
}

function ChangeNote({ row, applied }: { row: ThreadRow; applied: Map<string, ThreadRow> }) {
  const ws = useWorkspace();
  const chat = useChatState();
  const id = workOrderIdOf(row);
  const needsPerson = row.meta?.needsPerson === true;
  const est = row.meta?.estimate as { credits?: unknown } | undefined;
  const credits = typeof est?.credits === "number" ? est.credits : null;
  const outcome = id && !needsPerson ? changeOutcome(id, applied, chat, ws) : null;
  const decided = outcome?.kind === "applied" || outcome?.kind === "dismissed" || outcome?.kind === "approved";
  // A code app's change: the files it touches (from the history, or the proposal itself).
  const codeFiles = ws.project.kind === "code" ? (codeChangesOf(row.meta) ?? codeChangesOf(id ? chat.orders.get(id)?.proposal : null)) : null;
  const enter = useEnter();
  // While it waits in the card below, the card is the one place the change is spelled out: here, only a pointer to it.
  if (outcome?.kind === "waiting")
    return (
      <motion.li {...enter} className="flex items-start gap-2">
        <ProdMark />
        <p className="pt-0.5 text-meta text-muted-foreground">
          <span className="font-medium text-foreground">Prod AI</span> proposed a change. <span className="font-medium text-brand">It&apos;s waiting for you below.</span>
        </p>
      </motion.li>
    );
  return (
    <AiNote row={row} label={needsPerson ? "needs a person" : "proposed a change"}>
      <p className="font-medium">{row.title}</p>
      {row.body && <ClampText text={row.body} className="mt-0.5 text-meta text-muted-foreground" />}
      {(outcome || (credits !== null && !needsPerson)) && (
        <div className="mt-2 flex flex-col gap-1 border-t border-dashed border-hairline pt-1.5">
          {credits !== null && !needsPerson && !decided && (
            <span className="text-meta tabular-nums text-muted-foreground">
              {credits > 0 ? creditWords(credits) : "Free"}
              {codeFiles?.length ? ` · ${codeTouchWords(codeFiles)}` : ""}
            </span>
          )}
          {outcome && <OutcomeLine outcome={outcome} onReview={() => id && chat.review(id)} />}
        </div>
      )}
    </AiNote>
  );
}

function PlanNote({ row }: { row: ThreadRow }) {
  const ws = useWorkspace();
  const approved = ws.project.buildState !== "draft";
  return (
    <AiNote row={row} label={ws.project.kind === "code" ? "wrote the app" : "drew up the plan"}>
      <p className="font-medium">{row.title}</p>
      {row.body && <ClampText text={row.body} className="mt-0.5 text-meta text-muted-foreground" />}
      {(approved || ws.pendingWorkOrder) && (
        <div className="mt-2 border-t border-dashed border-hairline pt-1.5">
          {approved ? (
            <span className="inline-flex items-center gap-1 text-meta font-medium text-ok">
              <PencilTick className="size-3.5 shrink-0" /> Approved
            </span>
          ) : (
            <span className="text-meta font-medium text-brand">Waiting for you on the Sheet</span>
          )}
        </div>
      )}
    </AiNote>
  );
}

function FixNote({ row }: { row: ThreadRow }) {
  return (
    <AiNote row={row} label="our fix · free" tone="fix">
      <p className="font-medium">{row.title}</p>
      {row.body && <ClampText text={row.body} className="mt-0.5 text-meta text-muted-foreground" />}
      {row.object_ref && (
        <div className="mt-1.5">
          <AboutTag objectRef={row.object_ref} />
        </div>
      )}
    </AiNote>
  );
}

function AppliedNote({ row }: { row: ThreadRow }) {
  const ws = useWorkspace();
  return (
    <AiNote row={row} label="applied a change">
      <p className="font-medium">{row.title}</p>
      {row.body && <ClampText text={row.body} className="mt-0.5 text-meta text-muted-foreground" />}
      {ws.project.kind === "code" && codeChangesOf(row.meta)?.length ? <p className="mt-0.5 text-meta text-muted-foreground">{codeTouchWords(codeChangesOf(row.meta)!)}</p> : null}
      <div className="mt-2 border-t border-dashed border-hairline pt-1.5">
        <OutcomeLine outcome={appliedOutcome(row, ws.checkpoints, ws.project.currentCheckpointId)} />
      </div>
    </AiNote>
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
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-0.5 text-meta text-faint hover:text-foreground">
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

/** What a note is about (a screen, a block, an AI helper): a small tag that shows it. */
function AboutTag({ objectRef }: { objectRef: ObjectRef }) {
  const ws = useWorkspace();
  const label = objectLabel(ws.blueprint, objectRef);
  return (
    <button
      type="button"
      onClick={() => ws.select(objectRef)}
      className="inline-flex h-5 min-w-0 max-w-[180px] items-center gap-1 rounded-sm border border-dashed border-hairline-hi px-1.5 font-sketch text-sketch text-muted-foreground transition-colors duration-150 ease-paper hover:border-line-strong hover:text-foreground"
    >
      <Crosshair className="size-3 shrink-0" aria-hidden />
      <span className="sr-only">About: </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

const LANE: Record<Lane, { label: string; tone: string }> = {
  thought: { label: "Thought", tone: "text-faint" },
  did: { label: "Did", tone: "text-foreground/70" },
  checked: { label: "Checked", tone: "text-ok" },
};

/** A hand-drawn tick. */
function PencilTick({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className}>
      <path d="M2.5 8.6c1.3.9 2.4 2.1 3.4 3.6C7.6 8.4 10 5.4 13.6 2.9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A short pencil dash: something under way, or waiting. */
function PencilDash({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className}>
      <path d="M2.8 8.6c2.9-.6 6.6-.5 10.4.1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/** Build steps and other events: a compact pencil tick in the flow, in the history's plain English. */
function TickRow({ row }: { row: ThreadRow }) {
  const [open, setOpen] = useState(false);
  const enter = useEnter();
  const credits = Number(row.credits);
  // Credits have no cash value: older spending-cap entries began "≈ $5.00." and that part isn't shown.
  const body = row.kind === "budget" ? row.body?.replace(/^≈\s*\$[\d.,]+\.?\s*/, "") || null : row.body;
  const who =
    row.blame === "system_fix"
      ? { text: "Our fix · free", cls: "text-fix" }
      : row.blame === "teammate"
        ? { text: "Teammate", cls: "text-muted-foreground" }
        : row.blame === "agent"
          ? { text: credits > 0 ? `AI helper · ${creditWords(credits)}` : "AI helper", cls: "text-muted-foreground" }
          : credits > 0
            ? { text: creditWords(credits), cls: "text-muted-foreground" }
            : null;
  return (
    <motion.li {...enter} className="flex gap-2 pl-0.5">
      <PencilTick className={cn("mt-[3px] size-3.5 shrink-0", row.blame === "system_fix" ? "text-fix" : LANE[row.lane].tone)} />
      <div className="min-w-0 flex-1">
        {body ? (
          <button type="button" className="block w-full text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <span className="block text-meta text-foreground/85">
              <span className="sr-only">{LANE[row.lane].label}: </span>
              {row.title}
            </span>
            <span className={cn("block whitespace-pre-line text-meta text-muted-foreground", !open && "line-clamp-1")}>{body}</span>
          </button>
        ) : (
          <p className="text-meta text-foreground/85">
            <span className="sr-only">{LANE[row.lane].label}: </span>
            {row.title}
          </p>
        )}
        {(who || row.object_ref) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-meta tabular-nums">
            {who && <span className={who.cls}>{who.text}</span>}
            {row.object_ref && <AboutTag objectRef={row.object_ref} />}
          </div>
        )}
      </div>
      <TimeAgo iso={row.created_at} className="shrink-0 text-meta text-faint" />
    </motion.li>
  );
}
