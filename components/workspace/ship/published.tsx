"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, ExternalLink, Loader2, Undo2, X } from "lucide-react";
import type { DeploymentRow } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { TimeAgo } from "@/components/time-ago";
import { DUR, EASE, SPRING } from "@/lib/motion";
import { rollbackTo, takeOffline } from "@/lib/actions/ship";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";
import { useOrigin } from "./use-origin";

/**
 * What Publish shows once an app is online, for business and code apps alike: the live link, publishing
 * step by step, the published versions with rollback and the way offline, and the moment it goes live.
 */

export type HistoryRow = { d: DeploymentRow; title: string; status: string; rollBackTo: number | null };
const TARGET_NAME: Record<DeploymentRow["target"], string> = { architect_cloud: "", vercel: "Vercel (sandbox)", vpc: "Your VPC (sandbox)" };

/**
 * Published versions as plain history, newest first: "Version 6 · Change the brand colour to teal" when
 * a version was published, "Rolled back to version 4" when an older one was put back. Publishing always
 * puts the project's newest version live, so a row that put up an older version than the row before it
 * was a rollback. Each older version shown gets one "Roll back to this", on the latest row that names it
 * ("Version 4 · …" rather than "Rolled back to version 4" when both are shown).
 */
export function versionHistory(deployments: DeploymentRow[], checkpoints: { id: string; seq: number; label: string }[], liveCheckpointId: string | null, limit: number): HistoryRow[] {
  const byId = new Map(checkpoints.map((c) => [c.id, c]));
  const seqOf = (d: DeploymentRow) => (d.checkpoint_id ? byId.get(d.checkpoint_id)?.seq ?? null : null);
  const liveSeq = liveCheckpointId ? byId.get(liveCheckpointId)?.seq ?? null : null;
  const cloud = deployments.filter((d) => d.target === "architect_cloud");
  const rollback = new Set<string>();
  // Oldest first, so each row is compared with the one it replaced.
  [...cloud].reverse().forEach((d, i, rows) => {
    const seq = seqOf(d);
    const before = i > 0 ? seqOf(rows[i - 1]) : null;
    if (seq !== null && before !== null && seq < before) rollback.add(d.id);
  });
  const shown = deployments.slice(0, limit);
  const olderThanLive = (d: DeploymentRow) => {
    const seq = seqOf(d);
    return d.target === "architect_cloud" && d.status !== "live" && seq !== null && liveSeq !== null && seq < liveSeq;
  };
  // The row that offers each older version: its latest publish row shown, else its latest row shown.
  const offer = new Map<string, string>();
  for (const d of shown) if (olderThanLive(d) && !rollback.has(d.id) && !offer.has(d.checkpoint_id!)) offer.set(d.checkpoint_id!, d.id);
  for (const d of shown) if (olderThanLive(d) && !offer.has(d.checkpoint_id!)) offer.set(d.checkpoint_id!, d.id);
  return shown.map((d) => {
    const seq = seqOf(d);
    const cp = d.checkpoint_id ? byId.get(d.checkpoint_id) : undefined;
    // Older rows were labelled "Published" or "Went live" when publishing made a copy; those say nothing about the version.
    const what = cp && !/^(Published|Went live)$/.test(cp.label) ? ` · ${cp.label}` : "";
    const title = seq === null ? "A saved version" : rollback.has(d.id) ? `Rolled back to version ${seq}` : `Version ${seq}${what}`;
    const takenOffline = !liveCheckpointId && d.status !== "sandbox" && d.id === cloud[0]?.id;
    const status = d.status === "live" ? "Live now" : d.status === "sandbox" ? "Prepared" : takenOffline ? "Taken offline" : "Replaced";
    return { d, title, status, rollBackTo: d.checkpoint_id && offer.get(d.checkpoint_id) === d.id ? seq : null };
  });
}

/** The live link, big and easy to copy, with who can use it. `quiet` keeps Copy outlined while there's something to fix or publish. */
export function LiveLink({ live, liveVersion, access, quiet }: { live: DeploymentRow; liveVersion: number | null; access: string; quiet: boolean }) {
  const ws = useWorkspace();
  const origin = useOrigin();
  const liveUrl = ws.liveSlug ? `${origin}/live/${ws.liveSlug}` : "";
  const copyLink = () => {
    const url = `${window.location.origin}/live/${ws.liveSlug}`;
    void navigator.clipboard.writeText(url);
    toast.success("Link copied", { description: url });
  };
  return (
    <section aria-label="Live link" className="panel mt-6 rounded-md p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Pill tone="ok" dot size="md">Live now</Pill>
        <span className="text-ui text-muted-foreground">
          {liveVersion !== null ? `Version ${liveVersion} · ` : ""}published <TimeAgo iso={live.created_at} />
        </span>
      </div>
      {/* Who can use it, from what the live app makes public. */}
      <p className="mt-2 text-ui text-muted-foreground">{access}</p>
      {/* A copy field: the whole link on one line, cut short with an ellipsis if it doesn't fit, never broken mid-word. */}
      <div className="mt-3 flex items-center gap-2 rounded-md border border-hairline bg-canvas p-1.5 pl-3">
        <code className="min-w-0 flex-1 truncate font-mono text-code text-foreground" title={liveUrl || undefined}>{liveUrl || `/live/${ws.liveSlug}`}</code>
        {/* Filled only when there's nothing to fix or publish: then sharing the link is what's left to do. */}
        <Button size="sm" variant={quiet ? "outline" : "default"} className="shrink-0" onClick={copyLink}><Copy /> Copy link</Button>
      </div>
      <Button asChild variant="outline" size="sm" className="mt-3"><a href={liveUrl || `/live/${ws.liveSlug}`} target="_blank" rel="noreferrer">Open it <ExternalLink /></a></Button>
    </section>
  );
}

/** Publishing, step by step, under the Publish button. `at` is the step under way (null hides it). */
/** After publishing: does the live link really answer? A plain GET of the page, as a visitor would load it. */
export async function liveAnswers(slug: string): Promise<boolean> {
  if (!slug) return false;
  return fetch(`/live/${slug}`, { cache: "no-store" }).then((r) => r.ok, () => false);
}

export function DeployProgress({ steps, at }: { steps: readonly string[]; at: number | null }) {
  return (
    <AnimatePresence>
      {at !== null && (
        <motion.div
          id="deploy-progress"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={{ duration: DUR.panel, ease: EASE }}
          className="panel mt-4 overflow-hidden rounded-md"
        >
          <div className="h-1 bg-deep">
            <motion.div className="h-full bg-brand" animate={{ width: `${Math.round(((at + 0.5) / steps.length) * 100)}%` }} transition={{ duration: DUR.page, ease: EASE }} />
          </div>
          <ol className="p-3 text-ui" aria-live="polite">
            {steps.map((s, i) => (
              <li key={s} className={cn("flex items-center gap-2 py-0.5 transition-colors duration-250 ease-paper", i > at ? "text-faint" : i === at ? "text-foreground" : "text-muted-foreground")}>
                {i < at ? <Check className="size-3.5 text-ok" /> : i === at ? <Loader2 className="size-3.5 animate-spin text-brand" /> : <span className="size-3.5" />}
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** After publishing: the published versions, rolling back to one (instant, free), and the way offline. */
export function PublishedVersions({ deployments, history, live, pending, start }: { deployments: DeploymentRow[]; history: HistoryRow[]; live: DeploymentRow | undefined; pending: boolean; start: React.TransitionStartFunction }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [confirmOffline, setConfirmOffline] = useState(false);
  if (deployments.length === 0) return null;
  return (
    <section aria-labelledby="versions" className="mt-10">
      <h3 id="versions" className="font-pencil text-section">Versions</h3>
      <ul className="panel mt-3 divide-y divide-hairline rounded-md">
        {history.map(({ d, title, status, rollBackTo }) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-ui">
            <span className="min-w-0 flex-1">
              <span className="block text-ui font-medium">{title}</span>
              <span className="block text-meta text-muted-foreground">
                {status}
                {TARGET_NAME[d.target] && ` · ${TARGET_NAME[d.target]}`} · <TimeAgo iso={d.created_at} />
              </span>
            </span>
            {d.status === "live" && <Pill tone="ok" dot>Live</Pill>}
            {rollBackTo !== null && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                aria-label={`Roll back to this, version ${rollBackTo}`}
                onClick={() =>
                  start(async () => {
                    const r = await rollbackTo(ws.project.id, d.id);
                    if (r.ok) toast.success(`Rolled back to version ${rollBackTo}`, { description: "Instant and free. Your test version is unchanged." });
                    else toast.error(r.error);
                    router.refresh();
                  })
                }
              >
                <Undo2 /> Roll back to this
              </Button>
            )}
          </li>
        ))}
      </ul>
      {live && (
        <div className="mt-3">
          {confirmOffline ? (
            <div role="group" aria-label="Confirm taking the live version offline" className="panel rounded-md p-4">
              <p className="text-ui">Take it offline? The link will show “not found” until you publish again. Your project and its versions stay as they are.</p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await takeOffline(ws.project.id);
                      if (r.ok) toast.success("Taken offline", { description: "Publish again any time from here." });
                      else toast.error(r.error);
                      setConfirmOffline(false);
                      router.refresh();
                    })
                  }
                >
                  {pending ? <Loader2 className="animate-spin" /> : null} Take it offline
                </Button>
                <Button variant="ghost" disabled={pending} autoFocus onClick={() => setConfirmOffline(false)}>Keep it live</Button>
              </div>
            </div>
          ) : (
            <button className="text-ui text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors duration-150 hover:text-foreground" disabled={pending} onClick={() => setConfirmOffline(true)}>
              Take it offline…
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** Going live gets a quiet moment: the link, how to share it, and the way back. */
export function LaunchMoment({ slug, origin, note, onClose }: { slug: string; origin: string; note: string; onClose: () => void }) {
  const url = `${origin}/live/${slug}`;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-4 sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="You're live"
        // Put down on the page once: it drops in a touch askew and settles straight.
        initial={{ opacity: 0, y: -12, rotate: -2 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        exit={{ opacity: 0, y: 6, transition: { duration: DUR.hover, ease: EASE } }}
        transition={{ ...SPRING, opacity: { duration: DUR.panel, ease: EASE } }}
        className="panel-raised relative w-full min-w-0 max-w-[520px] rounded-lg px-5 pb-7 pt-9 text-center sm:px-8"
      >
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 text-muted-foreground"><X /></Button>
        <p className="font-pencil text-title">It&apos;s live.</p>
        <p className="mt-3 text-body text-muted-foreground">{note}</p>
        <div className="mt-6 flex items-center gap-2 rounded-md border border-hairline bg-canvas p-1.5 pl-3">
          <code className="min-w-0 flex-1 truncate text-left font-mono text-code">{url}</code>
          <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(url); toast.success("Link copied"); }}><Copy /> Copy</Button>
        </div>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="ghost" size="lg" onClick={onClose}>Back to Publish</Button>
          <Button asChild size="lg">
            <a href={url} target="_blank" rel="noreferrer">Open it <ExternalLink /></a>
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
