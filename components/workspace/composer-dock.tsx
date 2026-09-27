"use client";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type Dispatch, type ReactNode, type Ref, type SetStateAction } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, ArrowUp, Check, CornerDownLeft, Loader2, MessageSquarePlus, MessagesSquare, Target, UsersRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Term } from "@/components/arch/term";
import { cn } from "@/lib/utils";
import { creditsUsd, formatCredits } from "@/lib/format";
import { objectLabel } from "@/lib/blueprint";
import { changeTimeLabel } from "@/lib/blueprint/estimate";
import type { LedgerRow, WorkOrderRow } from "@/lib/db/types";
import type { Blueprint, ObjectRef } from "@/lib/blueprint/schema";
import { approveChange, rejectChange, requestChange } from "@/lib/actions/change";
import { useWorkspace } from "./context";
import { undoTo } from "./undo";
import { openChat } from "./rail-pref";

type Order = { wo: WorkOrderRow; overBudget: boolean };

/** A message sent from the composer. The chat shows it at once, then swaps in the history's own copy when it arrives. */
export type SentMessage = { key: string; text: string; at: string; scope: ObjectRef | null; wo: WorkOrderRow | null };

/** What became of a change Work Order in this session, before the server's copy catches up. */
export type LocalOutcome = { status: "dismissed" } | { status: "applied"; label: string };

type DockState = {
  order: Order | null;
  setOrder: (o: Order | null) => void;
  sent: SentMessage[];
  setSent: Dispatch<SetStateAction<SentMessage[]>>;
  outcomes: Record<string, LocalOutcome>;
  setOutcome: (workOrderId: string, o: LocalOutcome) => void;
  /** Recent change Work Orders from the server, by id: their status, and the full quote to reopen one. */
  orders: Map<string, WorkOrderRow>;
  /** True while the desktop chat rail is on screen: then answers land there instead of in a card over the composer. */
  threadVisible: boolean;
  setThreadVisible: (v: boolean) => void;
  /** Put text in the composer (the composer registers how). */
  fill: (text: string) => void;
  registerFill: (fn: ((text: string) => void) | null) => void;
  /** Open a quote that is still waiting (after a reload, say) back in the composer. */
  review: (workOrderId: string) => void;
};

const DockContext = createContext<DockState | null>(null);

/** The Work Order a history entry belongs to, if any. */
export function workOrderIdOf(r: Pick<LedgerRow, "meta">): string | null {
  const id = r.meta?.workOrderId;
  return typeof id === "string" ? id : null;
}

/**
 * The chat's shared state: the change Work Order the composer is showing (so other views can make room for it),
 * the messages just sent (shown in the chat before the server answers), and what became of each quote.
 */
export function ComposerDockProvider({ changeOrders = [], children }: { changeOrders?: WorkOrderRow[]; children: ReactNode }) {
  const ws = useWorkspace();
  const [order, setOrder] = useState<Order | null>(null);
  const [sent, setSent] = useState<SentMessage[]>([]);
  const [outcomes, setOutcomes] = useState<Record<string, LocalOutcome>>({});
  const [threadVisible, setThreadVisible] = useState(false);
  const fillRef = useRef<((text: string) => void) | null>(null);
  const orders = useMemo(() => new Map(changeOrders.map((w) => [w.id, w])), [changeOrders]);
  const { credits: spent, cap } = ws.usage;

  const setOutcome = useCallback((id: string, o: LocalOutcome) => setOutcomes((m) => ({ ...m, [id]: o })), []);
  const registerFill = useCallback((fn: ((text: string) => void) | null) => {
    fillRef.current = fn;
  }, []);
  const fill = useCallback((text: string) => fillRef.current?.(text), []);
  const review = useCallback(
    (id: string) => {
      const wo = orders.get(id);
      if (wo?.status === "proposed" && wo.proposal) setOrder({ wo, overBudget: spent + wo.proposal.credits > cap });
    },
    [orders, spent, cap],
  );

  const value = useMemo(
    () => ({ order, setOrder, sent, setSent, outcomes, setOutcome, orders, threadVisible, setThreadVisible, fill, registerFill, review }),
    [order, sent, outcomes, setOutcome, orders, threadVisible, fill, registerFill, review],
  );
  return <DockContext.Provider value={value}>{children}</DockContext.Provider>;
}

/** The chat's shared state, for the thread in the rail. */
export function useChatState(): DockState {
  return useDock();
}

/** True while a change Work Order is waiting to be approved or dismissed. */
export function useChangeOrderOpen() {
  return Boolean(useContext(DockContext)?.order);
}

function useDock(): DockState {
  const dock = useContext(DockContext);
  if (!dock) throw new Error("ComposerDock must be used inside <ComposerDockProvider>");
  return dock;
}

/**
 * How much room the dock takes on each tab:
 * - "full" on Blueprint: the input with its hint and suggestion chips, the place to start.
 * - "hidden" on Agents: the Playground there is the chat, and two prompts on one screen get mixed up.
 *   It still opens (and stays open while in use) from "/", ⌘K, the top bar or a "Fix this" button.
 * - "pill" everywhere else (Preview, Code, Ship, Handoffs): one short line until you focus it or press "/".
 */
export type DockMode = "full" | "pill" | "hidden";

export function dockModeFor(pathname: string): DockMode {
  if (/\/agents(\/|$)/.test(pathname)) return "hidden";
  if (/\/blueprint(\/|$)/.test(pathname)) return "full";
  return "pill";
}

/**
 * The prompt: a full-width dock under the main view. Asking gets a free quote
 * (a Work Order) that opens above the input, so the two never overlap.
 */
export function ComposerDock({ ref: dockRef }: { ref?: Ref<HTMLElement> }) {
  const ws = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const { order, setOrder, setSent, setOutcome, threadVisible, registerFill } = useDock();
  const [text, setText] = useState("");
  // A short line in the hint row after an answer lands in the chat beside the composer.
  const [notice, setNotice] = useState<{ key: string; answer: string } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, start] = useTransition();
  const [approving, setApproving] = useState(false);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const scope = ws.scope === null && ws.selected ? ws.selected : ws.scope;
  // The ✕ on the scope chip clears it for the current scope + focus request only.
  const scopeKey = `${scope ? `${scope.type}:${scope.id}` : "none"}#${ws.composerFocusKey}`;
  const [clearedFor, setClearedFor] = useState<string | null>(null);
  const effectiveScope = clearedFor === scopeKey ? null : scope;
  const building = ws.build.status === "running" || ws.build.status === "repair" || ws.build.status === "finishing";
  const mode = dockModeFor(pathname);
  // In use: focused, typed into, or holding a quote. Then it opens fully on every tab.
  const engaged = focused || Boolean(text) || Boolean(order) || pending || Boolean(notice);
  // Folded to nothing, but still in the page: focusing it (from "/" or the top bar) opens it, like a skip link.
  const folded = mode === "hidden" && !engaged;
  // One quiet line while a build runs (the build console has the stage), and off Blueprint until it's in use.
  const compact = building || (mode !== "full" && !engaged);
  const showChips = mode === "full" && !building && !order && !text;

  useEffect(() => {
    // No scroll: while folded the input sits in a zero-height box, and a scroll would shift the page under it.
    if (ws.composerFocusKey) ref.current?.focus({ preventScroll: true });
  }, [ws.composerFocusKey]);

  // The chat's "Ask for it" (under an answer) puts its suggestion here.
  useEffect(() => {
    registerFill(setText);
    return () => registerFill(null);
  }, [registerFill]);

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  // Grow with the text, up to a few lines, then scroll.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 176)}px`;
  }, [text, compact]);

  function submit() {
    const request = text.trim();
    if (!request || pending) return;
    const scopeAtSend = effectiveScope;
    const key = `sent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    // Your message shows in the chat right away, like any chat. Messages the history already has are dropped.
    const logged = new Set(ws.ledger.map(workOrderIdOf));
    setSent((s) => [...s.filter((m) => !m.wo || !logged.has(m.wo.id)), { key, text: request, at: new Date().toISOString(), scope: scopeAtSend, wo: null }]);
    setText("");
    setNotice(null);
    start(async () => {
      const r = await requestChange(ws.project.id, request, scopeAtSend);
      if (!r.ok) {
        setSent((s) => s.filter((m) => m.key !== key));
        setText((t) => t || request);
        toast.error(r.error);
        return;
      }
      setSent((s) => s.map((m) => (m.key === key ? { ...m, wo: r.workOrder } : m)));
      const p = r.workOrder.proposal;
      if (p?.answer && threadVisible) {
        // The answer lands in the chat beside you: the composer just says where, for a moment.
        setNotice({ key, answer: p.rationale });
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice((n) => (n?.key === key ? null : n)), 7000);
      } else {
        setOrder({ wo: r.workOrder, overBudget: r.overBudget });
      }
      router.refresh();
    });
  }

  /** `viaKeyboard`: put focus back in the input, since the button that had it goes away. */
  async function approve(viaKeyboard: boolean) {
    if (!order) return;
    setApproving(true);
    const prev = ws.project.currentCheckpointId;
    const r = await approveChange(ws.project.id, order.wo.id);
    setApproving(false);
    if (!r.ok) {
      toast.error(r.error ?? "Couldn't apply the change");
      return;
    }
    setOutcome(order.wo.id, { status: "applied", label: r.label ?? "Applied" });
    toast.success(order.wo.proposal?.summary ?? "Change applied", {
      description: `${r.label}. Going back is always free.`,
      duration: 9000,
      action: prev ? { label: "Undo", onClick: () => void undoTo(ws.project.id, prev, () => router.refresh()) } : undefined,
    });
    setOrder(null);
    // The button is gone; without a keyboard, let a quiet dock fold back.
    if (viaKeyboard) ref.current?.focus();
    else setFocused(false);
    router.refresh();
  }

  function dismiss(viaKeyboard: boolean) {
    if (!order) return;
    void rejectChange(ws.project.id, order.wo.id);
    if (!order.wo.proposal?.answer) setOutcome(order.wo.id, { status: "dismissed" });
    setOrder(null);
    if (viaKeyboard) ref.current?.focus();
    else setFocused(false);
  }

  const p = order?.wo.proposal;
  const isAnswer = Boolean(p?.answer);
  const needsPerson = p && p.operations.length === 0 && !isAnswer;
  const placeholder = building
    ? ws.build.mode === "replay"
      ? "Replaying… you can ask for changes when it ends."
      : "Building… you can ask for changes when it's done."
    : compact
      ? "Ask for a change…"
      : effectiveScope
        ? `Change ${objectLabel(ws.blueprint, effectiveScope)}…`
        : ws.project.buildState === "draft"
          ? "Change the plan before building…"
          : mode === "hidden"
            ? "Ask for a change to the app…"
            : "Ask for a change or a question…";

  return (
    <section
      ref={dockRef}
      aria-label="Ask Prod AI"
      data-dock={folded ? "folded" : compact ? "pill" : "full"}
      className={cn(
        "relative shrink-0",
        folded
          ? "h-0 overflow-hidden"
          : cn("border-t border-hairline bg-panel/40 px-3 sm:px-5", compact ? "py-2" : "pb-3 pt-2.5 sm:pb-3.5"),
      )}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {/* A soft lume under the input, so the prompt reads as the place to start. Only where it is the place to start. */}
      {!compact && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-full bg-[radial-gradient(50%_90%_at_50%_100%,rgb(223_255_79/0.06),rgb(63_224_197/0.025)_45%,transparent_75%)]" />}
      <p className="sr-only" aria-live="polite">
        {pending ? "Writing a free quote…" : notice ? `Answered in the chat: ${notice.answer}` : order && p ? (isAnswer ? `Answer: ${p.rationale}` : `Work Order ready: ${p.summary}`) : ""}
      </p>
      <div className={cn("relative mx-auto w-full transition-[max-width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", compact ? "max-w-[560px]" : "max-w-[860px]")}>
        <AnimatePresence initial={false}>
          {order && p && (
            <motion.div
              key={order.wo.id}
              initial={{ opacity: 0, y: 14, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, transition: { duration: 0.16 } }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="pb-2.5"
            >
              <div className="beam panel-raised rounded-xl shadow-[0_18px_50px_-18px_rgb(0_0_0/0.85),0_0_50px_-26px_rgb(223_255_79/0.45)]" role="region" aria-label="Work Order">
              <div className="max-h-[min(24rem,48dvh)] overflow-y-auto overscroll-contain p-3 sm:p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="micro-label text-amber">{isAnswer ? "Answer · no change made" : needsPerson ? "Needs a person" : <Term k="work-order" />}</span>
                  {/* A click from the keyboard has detail 0: only then pull focus back to the input (no phone keyboard pop-up on tap). */}
                  <button type="button" onClick={(e) => dismiss(e.detail === 0)} aria-label="Dismiss" className="-mr-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-raised hover:text-foreground">
                    <X className="size-3.5" />
                  </button>
                </div>
                {isAnswer ? (
                  <>
                    <p className="mt-1.5 text-[13px] leading-relaxed">{p.rationale}</p>
                    <button
                      type="button"
                      onClick={() => { setText(p.summary); setOrder(null); ref.current?.focus(); }}
                      className="mt-2.5 w-full rounded-lg border border-hairline bg-deep px-2.5 py-2 text-left text-[12px] text-muted-foreground transition-colors hover:border-amber/40 hover:text-foreground"
                    >
                      <span className="micro-label mb-0.5 block">Want to change it?</span>
                      “{p.summary}”
                    </button>
                    {/* The chat keeps it: this card is only the quick look while the chat is out of sight. */}
                    <button
                      type="button"
                      onClick={() => { openChat(); setOrder(null); }}
                      className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <MessagesSquare className="size-3.5" aria-hidden /> Saved in the chat · open it
                    </button>
                  </>
                ) : (
                  <div className="sm:flex sm:items-start sm:gap-5">
                    <div className="min-w-0 flex-1">
                      <p className="mt-1.5 text-[13.5px] font-medium leading-snug">{p.summary}</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{p.rationale}</p>
                    </div>
                    {!needsPerson && (
                      <div className="shrink-0 sm:mt-1.5 sm:w-[272px]">
                        <dl className="mt-2.5 grid grid-cols-3 gap-1.5 text-center sm:mt-0">
                          <div className="rounded-md bg-deep px-1 py-1.5"><dt className="text-[10px] text-muted-foreground">Screens</dt><dd className="font-mono text-[12px]">{p.blastRadius.screens.length}</dd></div>
                          <div className="rounded-md bg-deep px-1 py-1.5"><dt className="text-[10px] text-muted-foreground">Agents</dt><dd className="font-mono text-[12px]">{p.blastRadius.agents.length}</dd></div>
                          <div className="rounded-md bg-deep px-1 py-1.5"><dt className="text-[10px] text-muted-foreground">Files</dt><dd className="font-mono text-[12px]">{p.blastRadius.files}</dd></div>
                        </dl>
                        {order.overBudget && <p className="mt-2 text-[11.5px] text-ask">This would pass your spending cap. Approving raises nothing. You&apos;ll be asked first.</p>}
                        <div className="mt-2.5 flex items-center gap-2">
                          <Button size="sm" className="h-8 flex-1" onClick={(e) => void approve(e.detail === 0)} disabled={approving || order.overBudget}>
                            {approving ? <Loader2 className="animate-spin" /> : <Check />} Approve · {formatCredits(p.credits)}
                          </Button>
                          <span className="shrink-0 text-[11px] text-muted-foreground">≈ {creditsUsd(p.credits)}</span>
                        </div>
                        {/* The production estimate and what happens in this demo, each labelled (lib/blueprint/estimate.ts). */}
                        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                          {changeTimeLabel(p.minutes).real} <span className="text-faint">· {changeTimeLabel(p.minutes).here}</span>
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {needsPerson && (
                  <Button size="sm" variant="outline" className="mt-2.5 h-8 w-full sm:w-auto" onClick={() => { ws.openHandoff(effectiveScope); setOrder(null); }}>
                    <UsersRound /> Ask a teammate
                  </Button>
                )}
                {p.mode === "rules" && !needsPerson && <p className="mt-2 text-[10.5px] text-faint">Offline mode: handled by built-in rules.</p>}
              </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {showChips && (
          <div role="group" aria-label="Suggestions" className="-mx-3 mb-2 flex items-center gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
            <span className="micro-label shrink-0 pr-0.5 max-sm:hidden">Try</span>
            {suggestionsFor(ws.blueprint, effectiveScope).map((sg) => (
              <button
                key={sg}
                type="button"
                // Keep focus in the input so a quiet dock doesn't fold away mid-click.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setText(sg); ref.current?.focus(); }}
                className="max-w-full shrink-0 truncate rounded-full border border-hairline bg-panel px-2.5 py-1 text-[11.5px] text-muted-foreground transition-all duration-200 hover:-translate-y-px hover:border-amber/40 hover:text-foreground"
              >
                {sg}
              </button>
            ))}
          </div>
        )}

        <div
          className={cn(
            "panel-raised relative transition-[border-color,box-shadow,border-radius] duration-300 focus-within:border-amber/50 focus-within:shadow-[0_0_0_3px_rgb(223_255_79/0.08),0_12px_40px_-16px_rgb(141_255_158/0.45)]",
            compact ? "rounded-full hover:border-hairline-hi" : "rounded-2xl",
            building && "opacity-60",
          )}
        >
          {compact && !building && <MessageSquarePlus className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" aria-hidden />}
          <label htmlFor="composer" className="sr-only">Ask for a change</label>
          <textarea
            id="composer"
            ref={ref}
            rows={1}
            value={text}
            disabled={building}
            aria-keyshortcuts="/"
            aria-describedby={compact ? undefined : "composer-hint"}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape" && !text) {
                e.currentTarget.blur();
              }
            }}
            placeholder={placeholder}
            className={cn(
              "block w-full resize-none bg-transparent text-[14px] leading-relaxed outline-none placeholder:text-faint",
              compact ? cn("py-2 pr-12 text-[13px]", building ? "pl-4" : "pl-9") : "min-h-[52px] px-3.5 pb-1 pt-3",
            )}
          />
          {compact ? (
            <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center text-faint">
              {building ? <Loader2 className="size-3.5 animate-spin text-amber" aria-hidden /> : <Kbd aria-hidden>/</Kbd>}
            </span>
          ) : (
            <div className="flex items-center gap-2 px-2.5 pb-2.5">
              {/* On a phone the chat lives in a sheet: open it from here, where you type. */}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={openChat}
                title="Open the chat and history"
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-hairline px-2 text-[11.5px] text-muted-foreground transition-colors hover:border-amber/40 hover:text-foreground lg:hidden"
              >
                <MessagesSquare className="size-3.5" aria-hidden /> Chat
              </button>
              {effectiveScope && (
                <span className="inline-flex min-w-0 max-w-[55%] shrink-0 items-center gap-1 rounded-md border border-amber/30 bg-amber-soft px-1.5 py-0.5 text-[11px] text-amber sm:max-w-[45%]">
                  <Target className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">Scoped to {objectLabel(ws.blueprint, effectiveScope)}</span>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setClearedFor(scopeKey)} aria-label="Remove scope" className="ml-0.5 shrink-0 rounded-sm hover:text-foreground">
                    <X className="size-3" />
                  </button>
                </span>
              )}
              <span id="composer-hint" className="flex min-w-0 flex-1 items-center gap-1 truncate text-[11px] text-faint">
                {pending ? (
                  <span className="text-shimmer truncate">Writing a free quote…</span>
                ) : notice ? (
                  <span className="flex min-w-0 items-center gap-1 text-read">
                    <ArrowLeft className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">Answered in the chat</span>
                  </span>
                ) : (
                  <>
                    <CornerDownLeft className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">
                      <span className="sr-only">Enter </span>for a free quote<span className="max-sm:hidden"> · nothing changes until you approve</span>
                    </span>
                  </>
                )}
              </span>
              <Button size="icon-sm" className="size-8 shrink-0 rounded-xl" onClick={submit} disabled={!text.trim() || pending || building} aria-label="Get a Work Order">
                {pending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * A tool name used mid-sentence: only the leading verb is lowercased, so proper
 * names keep their casing ("Post in Slack" → "post in Slack", "HubSpot sync" stays).
 */
function midSentence(bp: Blueprint, name: string): string {
  const first = name.split(/\s+/)[0] ?? "";
  const proper = bp.connections.some((c) => c.name.split(/[^A-Za-z0-9]+/).includes(first)) || bp.agents.some((a) => a.name.split(/\s+/).includes(first));
  return !proper && /^[A-Z][a-z]/.test(first) ? name[0].toLowerCase() + name.slice(1) : name;
}

/** Starter requests for whatever is in scope. Each one works offline too (lib/change/rules.ts). */
function suggestionsFor(bp: Blueprint, scope: ObjectRef | null): string[] {
  const out: string[] = [];
  const gateable = (a: Blueprint["agents"][number]) => a.tools.find((t) => t.access !== "read" && t.permission !== "ask");
  if (scope?.type === "agent") {
    const a = bp.agents.find((x) => x.id === scope.id);
    const t = a && gateable(a);
    if (a && t) out.push(`Make ${a.name} ask before it can ${midSentence(bp, t.name)}`);
  } else if (scope?.type === "screen" || scope?.type === "block") {
    const screen = scope.type === "screen" ? bp.screens.find((x) => x.id === scope.id) : bp.screens.find((x) => [...x.regions.main, ...x.regions.side].some((b) => b.id === scope.id));
    if (screen?.regions.main.some((b) => b.type === "table")) out.push("Add a column for priority", "Sort it by amount");
  } else {
    if (bp.screens[0]?.regions.main.some((b) => b.type === "table")) out.push("Add a column for priority");
    const a = bp.agents.find((x) => gateable(x));
    const t = a && gateable(a);
    if (a && t) out.push(`Make ${a.name} ask before it can ${midSentence(bp, t.name)}`);
  }
  out.push(bp.meta.theme.primary.toLowerCase() === "#0f766e" ? "Make it indigo" : "Make it teal");
  return out.slice(0, 3);
}
