"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleAlert, Ellipsis, FolderGit2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Wireframe } from "@/components/landing/sketches";
import { TimeAgo } from "@/components/time-ago";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Pill, type PillTone } from "@/components/ui/pill";
import { deleteProject, renameProject } from "@/lib/actions/projects";
import type { BuildState } from "@/lib/db/types";

export type HomeProject = {
  id: string;
  name: string;
  tagline: string;
  buildState: BuildState;
  live: boolean;
  layout?: string;
  screens: number;
  helpers: number;
  imported: boolean;
  updatedAt: string;
  /** A business app (plan and renderer) or a code app (real files Claude writes). Unknown reads as business. */
  kind?: "business" | "code";
  /** A code app: what it is in a few words ("a memory game"), and whether its latest build worked. */
  code?: { what: string; built: boolean };
};

/** The longest project name (lib/actions/projects.ts holds the same limit). */
const MAX_NAME = 120;

/** Where the project is, in the same words as its top bar: Sketch, Making it real, Real, Published. A code app is real once it builds. */
function stage(p: HomeProject): { label: string; tone: PillTone; dot?: boolean; border?: string; ink?: boolean } {
  if (p.kind === "code") {
    if (p.live) return { label: "Published", tone: "ok", dot: true };
    return p.code?.built ? { label: "Real", tone: "neutral", border: "border-line-strong", ink: true } : { label: "Sketch", tone: "neutral", border: "border-dashed" };
  }
  if (p.buildState === "draft") return { label: "Sketch", tone: "neutral", border: "border-dashed" };
  if (p.buildState === "building") return { label: "Making it real", tone: "neutral", dot: true };
  return p.live ? { label: "Published", tone: "ok", dot: true } : { label: "Real", tone: "neutral", border: "border-line-strong", ink: true };
}

/**
 * A project on paper: still in pencil until it's made real, then inked. The whole card opens it;
 * its small menu renames it (in place) or deletes it (after saying plainly what goes with it).
 */
export function ProjectCard({ p, seed }: { p: HomeProject; seed: number }) {
  const s = stage(p);
  const code = p.kind === "code";
  const inked = code ? s.label !== "Sketch" : p.buildState !== "draft";
  // The name as last saved here, shown at once while the page catches up.
  const [saved, setSaved] = useState<string | null>(null);
  const name = saved ?? p.name;
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  // What the menu was closed for. It happens once the menu has fully closed and let go of the keyboard,
  // so the name field (or the dialog) gets the focus and keeps it.
  const then = useRef<"rename" | "delete" | null>(null);

  async function rename(next: string) {
    setEditing(false);
    requestAnimationFrame(() => trigger.current?.focus());
    const clean = next.replace(/\s+/g, " ").trim();
    if (!clean || clean === name) return;
    const before = saved;
    setSaved(clean);
    const r = await renameProject(p.id, clean);
    if (!r.ok) {
      setSaved(before);
      toast.error(r.error);
    }
  }

  return (
    <div className="panel group relative h-full overflow-hidden rounded-md transition-colors duration-150 hover:border-line-strong has-[a:focus-visible]:border-ring has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/25">
      <div className="border-b border-hairline bg-canvas px-6 py-5">
        <Wireframe layout={p.layout} ink={inked} seed={seed} className="mx-auto block h-auto w-full max-w-[240px]" />
      </div>
      <div className="p-4 pt-3">
        <div className="flex items-center gap-3">
          {editing ? (
            <RenameField
              id={`rename-${p.id}`}
              name={name}
              onDone={(v) => void rename(v)}
              onCancel={() => {
                setEditing(false);
                requestAnimationFrame(() => trigger.current?.focus());
              }}
            />
          ) : (
            <h3 className="min-w-0 truncate pr-1 font-pencil text-note leading-tight text-foreground">
              {/* The link covers the whole card; the menu sits above it. */}
              <Link href={`/p/${p.id}`} className="outline-none after:absolute after:inset-0 after:content-['']">
                {name}
              </Link>
            </h3>
          )}
          {/* Size and ink go on the label: cn() drops a text-* size token merged with a text colour (Pill's tones). */}
          <Pill tone={s.tone} dot={s.dot} className={`ml-auto shrink-0 ${s.border ?? ""}`}>
            <span className={s.ink ? "text-badge text-foreground" : "text-badge"}>{s.label}</span>
          </Pill>
        </div>
        {p.tagline && <p className="mt-1 line-clamp-2 text-body text-muted-foreground">{p.tagline}</p>}
        <p className="mt-3 flex min-w-0 items-center gap-3 text-meta tabular-nums text-faint">
          {/* Which kind of app it is, first in the line: real code, or a business app built from a plan. */}
          <span className="shrink-0 font-medium text-muted-foreground">{code ? "Code" : "Business"}</span>
          {code ? (
            p.code?.what && <span className="min-w-0 truncate">{p.code.what}</span>
          ) : (
            <>
              <span>{p.screens} {p.screens === 1 ? "screen" : "screens"}</span>
              <span>{p.helpers} AI {p.helpers === 1 ? "helper" : "helpers"}</span>
            </>
          )}
          {p.imported && (
            <span className="inline-flex items-center gap-1">
              <FolderGit2 className="size-3" />
              from GitHub
            </span>
          )}
          <TimeAgo iso={p.updatedAt} className="ml-auto shrink-0" />
        </p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={trigger} variant="ghost" size="icon-sm" className="absolute right-2 top-2 z-10 text-muted-foreground" aria-label={`More for ${name}`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-44"
          onCloseAutoFocus={(e) => {
            const next = then.current;
            then.current = null;
            if (!next) return;
            e.preventDefault();
            if (next === "rename") setEditing(true);
            else setConfirming(true);
          }}
        >
          <DropdownMenuItem onSelect={() => (then.current = "rename")}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => (then.current = "delete")}>
            <Trash2 /> Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteDialog
        open={confirming}
        onOpenChange={(o) => {
          setConfirming(o);
          if (!o) requestAnimationFrame(() => trigger.current?.focus());
        }}
        id={p.id}
        name={name}
        live={p.live}
      />
    </div>
  );
}

/** The name, written over in place: Enter or leaving the field saves it, Escape keeps the old one. */
function RenameField({ id, name, onDone, onCancel }: { id: string; name: string; onDone: (v: string) => void; onCancel: () => void }) {
  const box = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);
  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (save) onDone(box.current?.value ?? name);
    else onCancel();
  };
  return (
    <form
      className="relative z-10 min-w-0 flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        finish(true);
      }}
    >
      <label className="sr-only" htmlFor={id}>
        Project name
      </label>
      <input
        ref={box}
        id={id}
        defaultValue={name}
        maxLength={MAX_NAME}
        required
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            finish(false);
          }
        }}
        className="-my-1 -ml-1.5 h-8 w-full min-w-0 rounded-md border border-input bg-raised px-1.5 font-pencil text-note leading-tight text-foreground outline-none transition-[border-color,box-shadow] duration-150 ease-paper focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
      />
    </form>
  );
}

/** Asks before deleting, saying plainly what goes with it. Can't be undone, so it's in rose (docs/DESIGN.md). */
function DeleteDialog({ open, onOpenChange, id, name, live }: { open: boolean; onOpenChange: (o: boolean) => void; id: string; name: string; live: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const r = await deleteProject(id);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onOpenChange(false);
    toast.success(`Deleted ${name}`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="break-words pr-6 font-pencil text-section font-medium">Delete {name}?</DialogTitle>
          <DialogDescription>
            {live
              ? "Its published app goes offline and the records people added to it are removed, along with every version and note."
              : "Its sketch, every version and note, and any records saved in its app go with it."}{" "}
            <span className="font-medium text-ask">This can&apos;t be undone.</span>
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="flex gap-2 text-ui text-foreground">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} autoFocus onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void confirm()}>
            <Trash2 aria-hidden /> {busy ? "Deleting…" : "Delete project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
