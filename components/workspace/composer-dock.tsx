"use client";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type Dispatch, type ReactNode, type SetStateAction } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ArrowUp, Check, CircleAlert, Crosshair, UsersRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DUR, EASE } from "@/lib/motion";
import { creditsUsd } from "@/lib/format";
import { objectLabel } from "@/lib/blueprint";
import type { ChangeProposal, LedgerRow, WorkOrderRow } from "@/lib/db/types";
import type { Blueprint, ObjectRef } from "@/lib/blueprint/schema";
import { approveChange, rejectChange, requestChange } from "@/lib/actions/change";
import { useWorkspace } from "./context";
import { undoTo } from "./undo";

type Order = { wo: WorkOrderRow; overBudget: boolean };

/** A note sent from the margin. The thread shows it at once, then swaps in the history's own copy when it arrives. */
export type SentMessage = { key: string; text: string; at: string; scope: ObjectRef | null; wo: WorkOrderRow | null };

/**
 * What became of a proposed change in this session, before the server's copy catches up.
 * `undo` is the version from just before it was applied, so the margin can offer Undo at once.
 */
export type LocalOutcome = { status: "dismissed" } | { status: "applied"; label: string; undo?: string | null };

type DockState = {
  order: Order | null;
  setOrder: (o: Order | null) => void;
  sent: SentMessage[];
  setSent: Dispatch<SetStateAction<SentMessage[]>>;
  outcomes: Record<string, LocalOutcome>;
  setOutcome: (workOrderId: string, o: LocalOutcome) => void;
  /** Recent proposed changes from the server, by id: their status, and the full quote to reopen one. */
  orders: Map<string, WorkOrderRow>;
  /** True while the notes thread is on screen: then answers land there instead of in a card over the writing area. */
  threadVisible: boolean;
  setThreadVisible: (v: boolean) => void;
  /** Put text in the writing area (the writer registers how). */
  fill: (text: string) => void;
  registerFill: (fn: ((text: string) => void) | null) => void;
  /** Open a proposed change that is still waiting (after a reload, say) back above the writing area. */
  review: (workOrderId: string) => void;
};

const DockContext = createContext<DockState | null>(null);

/** The proposed change (server: Work Order) a history entry belongs to, if any. */
export function workOrderIdOf(r: Pick<LedgerRow, "meta">): string | null {
  const id = r.meta?.workOrderId;
  return typeof id === "string" ? id : null;
}

/** "12 credits", "1 credit", "0.5 credits": prices in plain words. */
export function creditWords(n: number): string {
  const v = Math.round(n * 10) / 10;
  return `${Number.isInteger(v) ? v : v.toFixed(1)} ${v === 1 ? "credit" : "credits"}`;
}

/** A new version is labelled "version 7" (older ones said "Save point #7"): the margin always says "version 7". */
export function versionWords(label: string): string {
  const m = /#(\d+)/.exec(label);
  return m ? `version ${m[1]}` : label;
}

/** What a change touches, in plain words: "Changes 2 screens and 1 AI helper". */
export function touchWords(b: ChangeProposal["blastRadius"]): string {
  const parts = [
    b.screens.length ? `${b.screens.length} ${b.screens.length === 1 ? "screen" : "screens"}` : "",
    b.agents.length ? `${b.agents.length} ${b.agents.length === 1 ? "AI helper" : "AI helpers"}` : "",
  ].filter(Boolean);
  if (!parts.length) return b.files ? `A small change to ${b.files} ${b.files === 1 ? "file" : "files"}` : "A small change";
  return `Changes ${parts.join(" and ")}`;
}

/**
 * The notes' shared state: the change waiting for Apply or Not now (so other views can make room for it),
 * the notes just sent (shown in the margin before the server answers), and what became of each change.
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

/** The notes' shared state, for the thread in the margin. */
export function useChatState(): DockState {
  return useDock();
}

/** True while a proposed change is waiting for Apply or Not now. */
export function useChangeOrderOpen() {
  return Boolean(useContext(DockContext)?.order);
}

function useDock(): DockState {
  const dock = useContext(DockContext);
  if (!dock) throw new Error("NoteWriter must be used inside <ComposerDockProvider>");
  return dock;
}

/**
 * The bottom of the margin: a ruled slip to write a note on. Sending a note gets a free,
 * priced proposal (the server's Work Order) that opens as a margin card just above it,
 * with Apply and Not now. Questions are answered in the notes and change nothing.
 * `suggest` shows a few starter notes (on the Sheet, where people start).
 * `onSent` lets the margin stay open until the reply is read.
 */
export function NoteWriter({ suggest = false, onSent, className }: { suggest?: boolean; onSent?: () => void; className?: string }) {
  const ws = useWorkspace();
  const router = useRouter();
  const { order, setOrder, sent, setSent, setOutcome, threadVisible, registerFill } = useDock();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  // Said once to screen readers when an answer lands in the notes above.
  const [announce, setAnnounce] = useState("");
  const [pending, start] = useTransition();
  const [approving, setApproving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const scope = ws.scope === null && ws.selected ? ws.selected : ws.scope;
  // The ✕ on the "About" tag clears it for the current scope + focus request only.
  const scopeKey = `${scope ? `${scope.type}:${scope.id}` : "none"}#${ws.composerFocusKey}`;
  const [clearedFor, setClearedFor] = useState<string | null>(null);
  const effectiveScope = clearedFor === scopeKey ? null : scope;
  const building = ws.build.status === "running" || ws.build.status === "repair" || ws.build.status === "finishing";
  // Starter notes: until you've written one, and after that while you're at the writing area.
  const fresh = sent.length === 0 && !ws.ledger.some((r) => (r.kind as string) === "request" || (r.kind as string) === "question");
  const showChips = suggest && !building && !order && !text && (fresh || focused);

  useEffect(() => {
    // No scroll: a folded margin keeps this box in a zero-width strip, and focusing it opens the margin.
    if (ws.composerFocusKey) ref.current?.focus({ preventScroll: true });
  }, [ws.composerFocusKey]);

  // "Ask for it" under an answer puts its suggestion here.
  useEffect(() => {
    registerFill(setText);
    return () => registerFill(null);
  }, [registerFill]);

  // Grow with the text one ruled line at a time, up to five lines, then scroll.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(64, Math.ceil(el.scrollHeight / 32) * 32), 160)}px`;
  }, [text]);

  function submit() {
    const request = text.trim();
    if (!request || pending) return;
    const scopeAtSend = effectiveScope;
    const key = `sent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    // Your note shows in the margin right away. Notes the history already has are dropped.
    const logged = new Set(ws.ledger.map(workOrderIdOf));
    setSent((s) => [...s.filter((m) => !m.wo || !logged.has(m.wo.id)), { key, text: request, at: new Date().toISOString(), scope: scopeAtSend, wo: null }]);
    setText("");
    setAnnounce("");
    onSent?.();
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
      // An answer lands in the notes right above. Only when they're out of sight does it get a card.
      if (p?.answer && threadVisible) setAnnounce(`Prod AI answered: ${p.rationale}`);
      else setOrder({ wo: r.workOrder, overBudget: r.overBudget });
      router.refresh();
    });
  }

  /** `viaKeyboard`: put focus back in the writing area, since the button that had it goes away. */
  async function apply(viaKeyboard: boolean) {
    if (!order) return;
    setApproving(true);
    const prev = ws.project.currentCheckpointId;
    const r = await approveChange(ws.project.id, order.wo.id);
    setApproving(false);
    if (!r.ok) {
      toast.error(r.error ?? "Couldn't apply the change");
      return;
    }
    setOutcome(order.wo.id, { status: "applied", label: r.label ?? "Applied", undo: prev });
    toast.success(order.wo.proposal?.summary ?? "Change applied", {
      description: `${r.label ? `Applied · ${versionWords(r.label)}` : "Applied"}. Going back is always free.`,
      duration: 9000,
      action: prev ? { label: "Undo", onClick: () => void undoTo(ws.project.id, prev, () => router.refresh()) } : undefined,
    });
    setOrder(null);
    if (viaKeyboard) ref.current?.focus();
    router.refresh();
  }

  function dismiss(viaKeyboard: boolean) {
    if (!order) return;
    void rejectChange(ws.project.id, order.wo.id);
    if (!order.wo.proposal?.answer) setOutcome(order.wo.id, { status: "dismissed" });
    setOrder(null);
    if (viaKeyboard) ref.current?.focus();
  }

  const p = order?.wo.proposal;
  const label = effectiveScope ? objectLabel(ws.blueprint, effectiveScope) : "";
  const placeholder = building
    ? ws.build.mode === "replay"
      ? "Replaying… you can write notes when it ends."
      : "Making it real… you can write notes when it's done."
    : effectiveScope
      ? `Write a note about ${label}…`
      : "Write a note… e.g. make the table sortable by priority";

  return (
    <div
      className={cn("shrink-0", className)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <p className="sr-only" aria-live="polite">
        {pending
          ? "Prod AI is reading your note…"
          : announce
            ? announce
            : order && p
              ? p.answer
                ? `Answer: ${p.rationale}`
                : p.operations.length === 0
                  ? `Needs a person: ${p.summary}`
                  : `Proposed change: ${p.summary}. ${creditWords(p.credits)}. Apply or not now.`
              : ""}
      </p>

      <AnimatePresence initial={false}>
        {order && p && (
          <motion.div
            key={order.wo.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6, transition: { duration: DUR.hover } }}
            transition={{ duration: DUR.panel, ease: EASE }}
            className="pb-2.5"
          >
            <ChangeCard
              order={order}
              approving={approving}
              onApply={(k) => void apply(k)}
              onDismiss={dismiss}
              onRephrase={() => {
                setText(p.summary);
                setOrder(null);
                ref.current?.focus();
              }}
              onTeammate={() => {
                ws.openHandoff(effectiveScope);
                setOrder(null);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {showChips && (
        <div role="group" aria-label="Suggestions" className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="font-sketch text-sketch text-faint">Try</span>
          {suggestionsFor(ws.blueprint, effectiveScope).map((sg) => (
            <button
              key={sg}
              type="button"
              // Keep focus in the writing area so a folded margin doesn't fold away mid-click.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setText(sg);
                ref.current?.focus();
              }}
              // Starter notes are whole sentences, so they're in print, on a dashed chip.
              className="max-w-full truncate rounded-full border border-dashed border-hairline-hi bg-panel/70 px-2.5 py-0.5 text-meta text-muted-foreground transition-colors duration-150 ease-paper hover:border-line-strong hover:text-foreground"
            >
              {sg}
            </button>
          ))}
        </div>
      )}

      <div className={cn("rounded-sm border border-hairline-hi bg-panel shadow-hair transition-colors duration-150 ease-paper focus-within:border-brand/50", building && "opacity-70")}>
        {effectiveScope && (
          <div className="flex px-2.5 pt-2">
            <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-sm border border-brand/30 bg-brand-soft px-1.5 py-0.5 text-badge text-brand">
              <Crosshair className="size-3 shrink-0" aria-hidden />
              <span className="truncate">About: {label}</span>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setClearedFor(scopeKey)}
                aria-label={`Clear what this note is about (${label})`}
                className="ml-0.5 shrink-0 rounded-sm hover:text-foreground"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          </div>
        )}
        <label htmlFor="composer" className="sr-only">
          Write a note (Ask for a change)
        </label>
        <textarea
          id="composer"
          ref={ref}
          rows={2}
          value={text}
          disabled={building}
          aria-keyshortcuts="/"
          aria-describedby="composer-hint"
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
          className="paper-lines font-pencil block min-h-16 w-full resize-none bg-transparent px-3 text-note leading-8 text-foreground outline-none placeholder:text-faint disabled:cursor-not-allowed"
        />
        <div className="flex items-center gap-2 border-t border-dashed border-hairline px-2.5 py-1.5">
          <span id="composer-hint" className="min-w-0 flex-1 truncate text-badge text-faint">
            {pending ? (
              "Prod AI is reading your note…"
            ) : (
              <>
                Enter to send<span className="hidden min-[1400px]:inline max-lg:inline"> · you see the price first</span>
              </>
            )}
          </span>
          <Button type="button" size="icon-sm" onClick={submit} disabled={!text.trim() || pending || building} aria-label="Send note">
            <ArrowUp aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The proposed change as a margin card: what will change in plain words, the price, Apply and Not now.
 * An answer (when the notes are out of sight) and "needs a person" use the same card. It is the one place
 * the change is spelled out: while it waits here, its note in the thread above only points down to it.
 * The region keeps its "Work Order" name for tests and assistive tech that already know it.
 */
function ChangeCard({
  order,
  approving,
  onApply,
  onDismiss,
  onRephrase,
  onTeammate,
}: {
  order: Order;
  approving: boolean;
  onApply: (viaKeyboard: boolean) => void;
  onDismiss: (viaKeyboard: boolean) => void;
  onRephrase: () => void;
  onTeammate: () => void;
}) {
  const p = order.wo.proposal!;
  const isAnswer = Boolean(p.answer);
  const needsPerson = p.operations.length === 0 && !isAnswer;
  return (
    // A proposal is not real yet: a sketch on the paper, with no shadow.
    <div role="region" aria-label="Work Order" className="sketch bg-panel">
      <div className="max-h-[min(24rem,48dvh)] overflow-y-auto overscroll-contain p-3">
        <p className="font-sketch text-sketch text-muted-foreground">{isAnswer ? "Answer · nothing changed" : needsPerson ? "Needs a person" : "Proposed change"}</p>
        {isAnswer ? (
          <>
            <p className="mt-1 whitespace-pre-wrap break-words text-body">{p.rationale}</p>
            <button
              type="button"
              onClick={onRephrase}
              className="mt-2 w-full rounded-md border border-dashed border-hairline-hi px-2.5 py-1.5 text-left text-meta text-muted-foreground transition-colors duration-150 ease-paper hover:border-line-strong hover:text-foreground"
            >
              <span className="block text-faint">Want to change it?</span>“{p.summary}”
            </button>
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="ghost" onClick={(e) => onDismiss(e.detail === 0)}>
                Got it
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-body font-medium">{p.summary}</p>
            {p.rationale && <p className="mt-1 text-meta text-muted-foreground">{p.rationale}</p>}
            {needsPerson ? (
              <div className="mt-2.5 flex items-center gap-2">
                <Button className="flex-1" onClick={onTeammate}>
                  <UsersRound /> Ask a teammate
                </Button>
                <Button variant="ghost" onClick={(e) => onDismiss(e.detail === 0)}>
                  Not now
                </Button>
              </div>
            ) : (
              <>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-2 border-t border-dashed border-hairline pt-2 tabular-nums">
                  <span className="text-body font-medium">{creditWords(p.credits)}</span>
                  <span className="text-meta text-muted-foreground">≈ {creditsUsd(p.credits)}</span>
                  <span className="text-meta text-muted-foreground">· {touchWords(p.blastRadius)}</span>
                </div>
                {order.overBudget && (
                  <p className="mt-2 flex items-start gap-1.5 text-meta text-foreground">
                    <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                    <span>
                      This would go past your spending cap, so it can&apos;t be applied yet.{" "}
                      <Link href="/settings#usage" className="text-brand underline decoration-dotted underline-offset-4 hover:text-brand-hi">
                        Change the cap
                      </Link>
                    </span>
                  </p>
                )}
                <div className="mt-2.5 flex items-center gap-2">
                  {/* A click from the keyboard has detail 0: only then pull focus back to the writing area. */}
                  <Button className="flex-1" onClick={(e) => onApply(e.detail === 0)} disabled={approving || order.overBudget}>
                    {approving ? (
                      "Applying…"
                    ) : (
                      <>
                        <Check /> Apply · {creditWords(p.credits)}
                      </>
                    )}
                  </Button>
                  <Button variant="ghost" onClick={(e) => onDismiss(e.detail === 0)} disabled={approving}>
                    Not now
                  </Button>
                </div>
                <p className="mt-1.5 text-meta text-faint">Nothing changes until you apply. Going back is always free.</p>
              </>
            )}
            {p.mode === "rules" && !needsPerson && <p className="mt-1 text-meta text-faint">Worked out by built-in rules, not by Claude.</p>}
          </>
        )}
      </div>
    </div>
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

/** Starter notes for whatever is in scope. Each one works offline too (lib/change/rules.ts). */
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
