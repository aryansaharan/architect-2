"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowUp, Brain, Check, ChevronDown, CornerDownLeft, Hammer, Loader2, ShieldCheck, Target, UsersRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlameBadge } from "@/components/arch/badges";
import { TimeAgo } from "@/components/time-ago";
import { cn } from "@/lib/utils";
import { creditsUsd, formatCredits } from "@/lib/format";
import { objectLabel } from "@/lib/blueprint";
import type { Lane, LedgerRow, WorkOrderRow } from "@/lib/db/types";
import { approveChange, rejectChange, requestChange } from "@/lib/actions/change";
import { useWorkspace } from "./context";

const LANE: Record<Lane, { icon: typeof Brain; label: string; cls: string }> = {
  thought: { icon: Brain, label: "Thought", cls: "text-muted-foreground bg-raised" },
  did: { icon: Hammer, label: "Did", cls: "text-amber bg-amber-soft" },
  checked: { icon: ShieldCheck, label: "Checked", cls: "text-read bg-read/10" },
};

type Filter = "all" | "fixes" | "team";

export function Rail() {
  const ws = useWorkspace();
  const [filter, setFilter] = useState<Filter>("all");
  const [briefOpen, setBriefOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const entries = useMemo(() => {
    const rows = [...ws.ledger].reverse();
    if (filter === "fixes") return rows.filter((r) => r.blame === "system_fix");
    if (filter === "team") return rows.filter((r) => r.blame === "teammate" || r.kind === "handoff" || r.kind === "comment");
    return rows;
  }, [ws.ledger, filter]);

  const live = ws.build.status !== "idle" && ws.build.status !== "done" ? ws.build.completed : [];
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [entries.length, live.length, ws.build.status]);

  const fixes = ws.ledger.filter((r) => r.blame === "system_fix").length;

  return (
    <aside aria-label="Brief and activity" className="flex h-full w-[312px] shrink-0 flex-col border-r border-hairline bg-panel/40">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <h2 className="micro-label">Brief &amp; activity</h2>
        <div className="flex items-center gap-0.5 rounded-md border border-hairline bg-deep p-0.5" role="radiogroup" aria-label="Filter activity">
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
      </div>

      <div className="px-3 pt-2.5">
        <button onClick={() => setBriefOpen((o) => !o)} className="panel w-full rounded-lg p-2.5 text-left" aria-expanded={briefOpen}>
          <span className="flex items-center justify-between">
            <span className="text-[12px] font-medium">The brief</span>
            <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", briefOpen && "rotate-180")} />
          </span>
          <span className={cn("mt-1 block text-[12.5px] leading-relaxed text-muted-foreground", !briefOpen && "line-clamp-2")}>{ws.project.brief || ws.blueprint.meta.plain}</span>
        </button>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [mask-image:linear-gradient(to_bottom,transparent,black_18px,black_calc(100%-12px),transparent)]">
        {entries.length === 0 && live.length === 0 ? (
          <p className="px-1 py-6 text-center text-[12.5px] text-muted-foreground">Nothing here yet. Everything Architect thinks, does and checks will show up here — with its price.</p>
        ) : (
          <ol className="space-y-1">
            {entries.map((e) => (
              <LedgerItem key={e.id} entry={e} />
            ))}
            {live.map((s) => (
              <motion.li key={`live-${s.id}`} initial={{ opacity: 0, x: -8, filter: "blur(3px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)" }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="flex gap-2.5 rounded-lg px-1.5 py-1.5">
                <LaneIcon lane={s.lane} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] leading-snug">{s.title}</p>
                  {s.detail && <p className="mt-0.5 line-clamp-2 text-[11.5px] text-muted-foreground">{s.detail}</p>}
                </div>
                <Check className="mt-0.5 size-3.5 shrink-0 text-read" aria-label="done" />
              </motion.li>
            ))}
            {ws.build.current?.kind === "step" && ws.build.status === "running" && (
              <li className="flex gap-2.5 rounded-lg bg-amber-soft px-1.5 py-1.5" aria-live="polite">
                <LaneIcon lane={ws.build.current.lane} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] leading-snug text-foreground">{ws.build.current.title}</p>
                  <p className="shimmer mt-1 h-1.5 w-2/3 rounded-full" />
                </div>
                <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-amber" aria-label="in progress" />
              </li>
            )}
            {ws.build.status === "repair" && (
              <li className="flex gap-2.5 rounded-lg border border-fix/30 bg-fix/10 px-1.5 py-1.5">
                <LaneIcon lane="checked" />
                <p className="text-[12.5px] leading-snug text-fix">Waiting for you: pick a fix</p>
              </li>
            )}
          </ol>
        )}
      </div>

      <Composer />
    </aside>
  );
}

function LaneIcon({ lane }: { lane: Lane }) {
  const L = LANE[lane];
  return (
    <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md", L.cls)} title={L.label}>
      <L.icon className="size-3" aria-hidden />
      <span className="sr-only">{L.label}</span>
    </span>
  );
}

function LedgerItem({ entry }: { entry: LedgerRow }) {
  const ws = useWorkspace();
  const [open, setOpen] = useState(false);
  const isFix = entry.blame === "system_fix";
  return (
    <motion.li initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className={cn("group rounded-lg px-1.5 py-1.5 transition-colors hover:bg-raised/60", isFix && "bg-fix/[0.06] shadow-[inset_2px_0_0_rgb(180_140_255/0.5)]")}>
      <div className="flex gap-2.5">
        <LaneIcon lane={entry.lane} />
        <div className="min-w-0 flex-1">
          <button className="block w-full text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <span className="block text-[12.5px] leading-snug">{entry.title}</span>
            {entry.body && <span className={cn("mt-0.5 block text-[11.5px] leading-relaxed text-muted-foreground", !open && "line-clamp-2")}>{entry.body}</span>}
          </button>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <BlameBadge blame={entry.blame} credits={Number(entry.credits)} />
            {entry.object_ref && (
              <button onClick={() => ws.select(entry.object_ref)} className="inline-flex h-5 max-w-[150px] items-center gap-1 truncate rounded-full border border-hairline px-2 text-[11px] text-muted-foreground hover:border-amber/40 hover:text-foreground">
                <Target className="size-2.5 shrink-0" />
                <span className="truncate">{objectLabel(ws.blueprint, entry.object_ref)}</span>
              </button>
            )}
            <TimeAgo iso={entry.created_at} className="ml-auto text-[10.5px] text-faint" />
          </div>
        </div>
      </div>
    </motion.li>
  );
}

function Composer() {
  const ws = useWorkspace();
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [order, setOrder] = useState<{ wo: WorkOrderRow; overBudget: boolean } | null>(null);
  const [approving, setApproving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const scope = ws.scope === null && ws.selected ? ws.selected : ws.scope;
  // The ✕ on the scope chip clears it for the current scope + focus request only.
  const scopeKey = `${scope ? `${scope.type}:${scope.id}` : "none"}#${ws.composerFocusKey}`;
  const [clearedFor, setClearedFor] = useState<string | null>(null);
  const effectiveScope = clearedFor === scopeKey ? null : scope;
  const building = ws.build.status === "running" || ws.build.status === "repair" || ws.build.status === "finishing";

  useEffect(() => {
    if (ws.composerFocusKey) ref.current?.focus();
  }, [ws.composerFocusKey]);

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

  async function approve() {
    if (!order) return;
    setApproving(true);
    const r = await approveChange(ws.project.id, order.wo.id);
    setApproving(false);
    if (!r.ok) {
      toast.error(r.error ?? "Couldn't apply the change");
      return;
    }
    toast.success(order.wo.proposal?.summary ?? "Change applied", { description: `${r.label} — you can go back to the previous one any time, for free.` });
    setOrder(null);
    router.refresh();
  }

  const p = order?.wo.proposal;
  const needsPerson = p && p.operations.length === 0;

  return (
    <div className="border-t border-hairline p-3">
      {order && p && (
        <div className="panel-raised mb-2.5 rounded-xl p-3" role="region" aria-label="Work Order">
          <div className="flex items-center justify-between">
            <span className="micro-label text-amber">{needsPerson ? "Needs a person" : "Work Order"}</span>
            <button onClick={() => { void rejectChange(ws.project.id, order.wo.id); setOrder(null); }} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
          </div>
          <p className="mt-1.5 text-[13px] font-medium leading-snug">{p.summary}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{p.rationale}</p>
          {!needsPerson && (
            <>
              <dl className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
                <div className="rounded-md bg-deep px-1 py-1.5"><dt className="text-[10px] text-muted-foreground">Screens</dt><dd className="font-mono text-[12px]">{p.blastRadius.screens.length}</dd></div>
                <div className="rounded-md bg-deep px-1 py-1.5"><dt className="text-[10px] text-muted-foreground">Agents</dt><dd className="font-mono text-[12px]">{p.blastRadius.agents.length}</dd></div>
                <div className="rounded-md bg-deep px-1 py-1.5"><dt className="text-[10px] text-muted-foreground">Files</dt><dd className="font-mono text-[12px]">{p.blastRadius.files}</dd></div>
              </dl>
              {order.overBudget && <p className="mt-2 text-[11.5px] text-ask">This would pass your spending cap. Approving raises nothing — you&apos;ll be asked first.</p>}
              <div className="mt-2.5 flex items-center gap-2">
                <Button size="sm" className="h-8 flex-1" onClick={approve} disabled={approving || order.overBudget}>
                  {approving ? <Loader2 className="animate-spin" /> : <Check />} Approve · {formatCredits(p.credits)}
                </Button>
                <span className="text-[11px] text-muted-foreground">≈ {creditsUsd(p.credits)} · ~{p.minutes} min</span>
              </div>
            </>
          )}
          {needsPerson && (
            <Button size="sm" variant="outline" className="mt-2.5 h-8 w-full" onClick={() => { ws.openHandoff(effectiveScope); setOrder(null); }}>
              <UsersRound /> Ask a teammate
            </Button>
          )}
          {p.mode === "rules" && !needsPerson && <p className="mt-2 text-[10.5px] text-faint">Offline mode — handled by built-in rules.</p>}
        </div>
      )}

      <div className={cn("panel rounded-xl transition-colors focus-within:border-amber/50", building && "opacity-60")}>
        {effectiveScope && (
          <div className="flex items-center gap-1.5 px-2.5 pt-2">
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-amber/30 bg-amber-soft px-1.5 py-0.5 text-[11px] text-amber">
              <Target className="size-3 shrink-0" />
              <span className="truncate">Scoped to {objectLabel(ws.blueprint, effectiveScope)}</span>
              <button onClick={() => setClearedFor(scopeKey)} aria-label="Remove scope" className="ml-0.5 hover:text-foreground"><X className="size-3" /></button>
            </span>
          </div>
        )}
        <label htmlFor="composer" className="sr-only">Ask for a change</label>
        <textarea
          id="composer"
          ref={ref}
          rows={2}
          value={text}
          disabled={building}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={building ? "Building… you can ask for changes when it's done." : effectiveScope ? `Change ${objectLabel(ws.blueprint, effectiveScope)}…` : ws.project.buildState === "draft" ? "Change the plan before building…" : "Ask for a change…"}
          className="block w-full resize-none bg-transparent px-3 py-2.5 text-[13px] leading-relaxed outline-none placeholder:text-faint"
        />
        <div className="flex items-center justify-between px-2 pb-2">
          <span className="flex items-center gap-1 text-[10.5px] text-faint">
            <CornerDownLeft className="size-3" /> to get a price first · nothing runs until you approve
          </span>
          <Button size="icon-sm" className="size-7 rounded-lg" onClick={submit} disabled={!text.trim() || pending || building} aria-label="Get a Work Order">
            {pending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
      </div>
    </div>
  );
}
