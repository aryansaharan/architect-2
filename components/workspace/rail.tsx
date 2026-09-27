"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type Ref } from "react";
import { motion } from "motion/react";
import { Brain, Check, ChevronDown, Hammer, Loader2, PanelLeftClose, PanelLeftOpen, ShieldCheck, Target } from "lucide-react";
import { BlameBadge } from "@/components/arch/badges";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TimeAgo } from "@/components/time-ago";
import { cn } from "@/lib/utils";
import { objectLabel } from "@/lib/blueprint";
import type { Lane, LedgerRow } from "@/lib/db/types";
import { useWorkspace } from "./context";
import { parseRailPref, RAIL_COOKIE, RAIL_STORAGE_KEY, type RailPref } from "./rail-pref";

const LANE: Record<Lane, { icon: typeof Brain; label: string; cls: string }> = {
  thought: { icon: Brain, label: "Thought", cls: "text-muted-foreground bg-raised" },
  did: { icon: Hammer, label: "Did", cls: "text-amber bg-amber-soft" },
  checked: { icon: ShieldCheck, label: "Checked", cls: "text-read bg-read/10" },
};

type Filter = "all" | "fixes" | "team";

/* ------------------------------------------------ open / collapsed, remembered */

const RAIL_EVENT = "prodai:rail-pref";

function subscribeRail(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(RAIL_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(RAIL_EVENT, cb);
  };
}

function readRail(): RailPref {
  try {
    return parseRailPref(window.localStorage.getItem(RAIL_STORAGE_KEY));
  } catch {
    return "auto";
  }
}

function writeRail(v: RailPref) {
  try {
    window.localStorage.setItem(RAIL_STORAGE_KEY, v);
  } catch {
    // Private mode: the cookie below still remembers it.
  }
  // Mirrored to a cookie so the server paints the right width on the next load.
  document.cookie = `${RAIL_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new Event(RAIL_EVENT));
}

/**
 * The activity rail. `collapsible` (desktop) adds the slim strip and the toggle;
 * the phone sheet shows the full panel only.
 */
export function Rail({ collapsible = false, initialPref = "auto" }: { collapsible?: boolean; initialPref?: RailPref }) {
  const pref = useSyncExternalStore(subscribeRail, readRail, () => initialPref);
  const collapseBtn = useRef<HTMLButtonElement>(null);
  const expandBtn = useRef<HTMLButtonElement>(null);

  if (!collapsible) return <RailPanel className="flex w-full bg-panel/40" />;

  const setOpen = (open: boolean, viaKeyboard: boolean) => {
    writeRail(open ? "open" : "collapsed");
    // From the keyboard, the button that was pressed is gone now: hand focus to its counterpart.
    if (viaKeyboard) requestAnimationFrame(() => (open ? collapseBtn : expandBtn).current?.focus({ preventScroll: true }));
  };

  return (
    <div
      className={cn(
        "flex h-full shrink-0 overflow-hidden border-r border-hairline bg-panel/40 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        pref === "open" ? "w-[312px]" : pref === "collapsed" ? "w-14" : "w-14 min-[1600px]:w-[312px]",
      )}
    >
      <RailPanel
        className={cn("w-[312px]", pref === "open" ? "flex" : pref === "collapsed" ? "hidden" : "hidden min-[1600px]:flex")}
        collapseRef={collapseBtn}
        onCollapse={(viaKeyboard) => setOpen(false, viaKeyboard)}
      />
      <SlimRail
        className={pref === "open" ? "hidden" : pref === "collapsed" ? "flex" : "flex min-[1600px]:hidden"}
        buttonRef={expandBtn}
        onOpen={(viaKeyboard) => setOpen(true, viaKeyboard)}
      />
    </div>
  );
}

/** Collapsed: the event count and the latest thing that happened, one click from the full history. */
function SlimRail({ className, buttonRef, onOpen }: { className: string; buttonRef: Ref<HTMLButtonElement>; onOpen: (viaKeyboard: boolean) => void }) {
  const ws = useWorkspace();
  const b = ws.build;
  const building = b.status !== "idle" && b.status !== "done";
  const step = building && b.current?.kind === "step" ? b.current : null;
  const latest = ws.ledger[0] ?? null;
  const count = ws.ledger.length + (building ? b.completed.length : 0);
  const title = b.status === "repair" ? "Waiting for you: pick a fix" : (step?.title ?? latest?.title ?? "Nothing yet");
  const lane: Lane = b.status === "repair" ? "checked" : (step?.lane ?? latest?.lane ?? "thought");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={buttonRef}
          type="button"
          // A keyboard "click" has detail 0.
          onClick={(e) => onOpen(e.detail === 0)}
          aria-expanded={false}
          aria-label={`Open brief and activity. ${count} ${count === 1 ? "event" : "events"}. Latest: ${title}`}
          className={cn("group h-full w-14 shrink-0 flex-col items-center gap-3 py-3 text-muted-foreground transition-colors hover:bg-raised/40 hover:text-foreground focus-visible:outline-offset-[-3px]", className)}
        >
          <span className="grid size-8 place-items-center rounded-lg border border-hairline bg-deep transition-colors group-hover:border-amber/40 group-hover:text-amber">
            <PanelLeftOpen className="size-4" aria-hidden />
          </span>
          <span className="flex flex-col items-center leading-none">
            <span className="font-mono text-[13px] tabular-nums text-foreground">{count}</span>
            <span className="mt-1 text-[9px] uppercase tracking-[0.12em] text-faint">{count === 1 ? "event" : "events"}</span>
          </span>
          <span aria-hidden className="h-px w-6 bg-hairline" />
          {step && b.status === "running" ? (
            <span className="grid size-5 shrink-0 place-items-center rounded-md bg-amber-soft"><Loader2 className="size-3 animate-spin text-amber" aria-hidden /></span>
          ) : (
            <LaneIcon lane={lane} />
          )}
          {/* The latest item reads top to bottom, like a book spine. */}
          <span className={cn("min-h-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-start text-[12px] leading-5 [writing-mode:vertical-rl]", b.status === "repair" ? "text-fix" : "text-foreground/80")}>{title}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-64">
        <span className="line-clamp-3">Latest: {title}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/** `className` sets the width and the display (flex or hidden). */
function RailPanel({ className, collapseRef, onCollapse }: { className: string; collapseRef?: Ref<HTMLButtonElement>; onCollapse?: (viaKeyboard: boolean) => void }) {
  const ws = useWorkspace();
  const [filter, setFilter] = useState<Filter>("all");
  const [briefOpen, setBriefOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  // Fade an edge of the history only when there is more to scroll to on that side.
  const [fade, setFade] = useState<"none" | "top" | "bottom" | "both">("none");

  const entries = useMemo(() => {
    const rows = [...ws.ledger].reverse();
    if (filter === "fixes") return rows.filter((r) => r.blame === "system_fix");
    if (filter === "team") return rows.filter((r) => r.blame === "teammate" || r.kind === "handoff" || r.kind === "comment");
    return rows;
  }, [ws.ledger, filter]);

  const live = ws.build.status !== "idle" && ws.build.status !== "done" ? ws.build.completed : [];

  const updateFade = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const top = el.scrollTop > 2;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setFade(top && bottom ? "both" : top ? "top" : bottom ? "bottom" : "none");
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [entries.length, live.length, ws.build.status]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // Opening from the slim strip shows the panel for the first time: start at the latest item, like it always does.
    let hidden = el.clientHeight === 0;
    const ro = new ResizeObserver(() => {
      if (hidden && el.clientHeight > 0) el.scrollTop = el.scrollHeight;
      hidden = el.clientHeight === 0;
      updateFade();
    });
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [updateFade]);

  const fixes = ws.ledger.filter((r) => r.blame === "system_fix").length;

  return (
    <aside aria-label="Brief and activity" className={cn("h-full shrink-0 flex-col", className)}>
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <h2 className="micro-label">Brief &amp; activity</h2>
        {onCollapse && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                ref={collapseRef}
                type="button"
                onClick={(e) => onCollapse(e.detail === 0)}
                aria-expanded
                aria-label="Collapse brief and activity"
                className="-mr-1 grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
              >
                <PanelLeftClose className="size-4" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Collapse to a slim strip</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="px-3 pt-2">
        <button onClick={() => setBriefOpen((o) => !o)} className="panel w-full rounded-lg p-2.5 text-left" aria-expanded={briefOpen}>
          <span className="flex items-center justify-between">
            <span className="text-[12px] font-medium">The brief</span>
            <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", briefOpen && "rotate-180")} />
          </span>
          <span className={cn("mt-1 block text-[12.5px] leading-relaxed text-muted-foreground", !briefOpen && "line-clamp-2")}>{ws.project.brief || ws.blueprint.meta.plain}</span>
        </button>
      </div>

      {/* The history gets its own header, so the list scrolls under a clean edge, not under the brief. */}
      <div className="mt-3 flex items-center justify-between gap-2 border-b border-hairline px-3 pb-2">
        <h3 className="flex items-baseline gap-1.5 text-[12px] font-medium">
          History <span className="font-mono text-[11px] font-normal text-faint">{entries.length + live.length}</span>
        </h3>
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

      <div
        ref={scroller}
        onScroll={updateFade}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2",
          fade === "both" && "[mask-image:linear-gradient(to_bottom,transparent,black_24px,black_calc(100%-20px),transparent)]",
          fade === "top" && "[mask-image:linear-gradient(to_bottom,transparent,black_24px)]",
          fade === "bottom" && "[mask-image:linear-gradient(to_bottom,black_calc(100%-20px),transparent)]",
        )}
      >
        {entries.length === 0 && live.length === 0 ? (
          <p className="px-1 py-6 text-center text-[12.5px] text-muted-foreground">Nothing here yet. Everything Prod AI thinks, does and checks will show up here, with its price.</p>
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
