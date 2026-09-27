"use client";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type ReactNode, type Ref } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ArrowUp, Check, CornerDownLeft, Loader2, Target, UsersRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Term } from "@/components/arch/term";
import { cn } from "@/lib/utils";
import { creditsUsd, formatCredits } from "@/lib/format";
import { objectLabel } from "@/lib/blueprint";
import type { WorkOrderRow } from "@/lib/db/types";
import type { Blueprint, ObjectRef } from "@/lib/blueprint/schema";
import { approveChange, rejectChange, requestChange } from "@/lib/actions/change";
import { useWorkspace } from "./context";
import { undoTo } from "./undo";

type Order = { wo: WorkOrderRow; overBudget: boolean };
type DockState = { order: Order | null; setOrder: (o: Order | null) => void };

const DockContext = createContext<DockState | null>(null);

/** Holds the change Work Order the composer is showing, so other views can make room for it. */
export function ComposerDockProvider({ children }: { children: ReactNode }) {
  const [order, setOrder] = useState<Order | null>(null);
  const value = useMemo(() => ({ order, setOrder }), [order]);
  return <DockContext.Provider value={value}>{children}</DockContext.Provider>;
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
 * Tabs where the dock stays a single quiet line until you reach for it: Agents has its own
 * chat with the agent (two big prompts would compete), Ship and Handoffs are about other work.
 */
const QUIET_TABS = /\/(agents|ship|handoffs)(\/|$)/;

/**
 * The prompt: a full-width dock under the main view. Asking gets a free quote
 * (a Work Order) that opens above the input, so the two never overlap.
 */
export function ComposerDock({ ref: dockRef }: { ref?: Ref<HTMLElement> }) {
  const ws = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const { order, setOrder } = useDock();
  const [text, setText] = useState("");
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
  // One quiet line while a build runs (the build console has the stage), and on the quiet tabs until focused.
  const compact = building || (QUIET_TABS.test(pathname) && !focused && !text && !order && !pending);

  useEffect(() => {
    if (ws.composerFocusKey) ref.current?.focus();
  }, [ws.composerFocusKey]);

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
    start(async () => {
      const r = await requestChange(ws.project.id, request, effectiveScope);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setOrder({ wo: r.workOrder, overBudget: r.overBudget });
      setText("");
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
    : effectiveScope
      ? `Change ${objectLabel(ws.blueprint, effectiveScope)}…`
      : ws.project.buildState === "draft"
        ? "Change the plan before building…"
        : "Ask for a change or a question…";

  return (
    <section
      ref={dockRef}
      aria-label="Ask Prod AI"
      className="relative shrink-0 border-t border-hairline bg-panel/40 px-3 pb-3 pt-2.5 sm:px-5 sm:pb-3.5"
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {/* A soft lume under the input, so the prompt reads as the place to start. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-full bg-[radial-gradient(50%_90%_at_50%_100%,rgb(223_255_79/0.06),rgb(63_224_197/0.025)_45%,transparent_75%)]" />
      <p className="sr-only" aria-live="polite">
        {pending ? "Writing a free quote…" : order && p ? `Work Order ready: ${p.summary}` : ""}
      </p>
      <div className="relative mx-auto w-full max-w-[860px]">
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
                          <span className="shrink-0 text-[11px] text-muted-foreground">≈ {creditsUsd(p.credits)} · ~{p.minutes} min</span>
                        </div>
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

        {!order && !text && !compact && (
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
            "panel-raised relative rounded-2xl transition-[border-color,box-shadow] duration-300 focus-within:border-amber/50 focus-within:shadow-[0_0_0_3px_rgb(223_255_79/0.08),0_12px_40px_-16px_rgb(141_255_158/0.45)]",
            building && "opacity-60",
          )}
        >
          <label htmlFor="composer" className="sr-only">Ask for a change</label>
          <textarea
            id="composer"
            ref={ref}
            rows={1}
            value={text}
            disabled={building}
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
              compact ? "py-2.5 pl-3.5 pr-12" : "min-h-[52px] px-3.5 pb-1 pt-3",
            )}
          />
          {compact ? (
            <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center text-faint">
              {building ? <Loader2 className="size-3.5 animate-spin text-amber" aria-hidden /> : <Kbd aria-hidden>/</Kbd>}
            </span>
          ) : (
            <div className="flex items-center gap-2 px-2.5 pb-2.5">
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
