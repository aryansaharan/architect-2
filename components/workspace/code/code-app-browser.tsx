"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CircleAlert, Copy, Download, FileCode2, Loader2, Package, Terminal } from "lucide-react";
import type { CodeFile } from "@/lib/code-apps/schema";
import { PACKAGES } from "@/lib/code-apps/packages";
import { codeVersionFiles, type CodeVersionFiles } from "@/lib/code-apps/around-actions";
import { diffFiles } from "@/lib/codegen/diff";
import type { GeneratedFile } from "@/lib/codegen/types";
import { buildErrorLine } from "@/lib/sim/preflight";
import { CodeView } from "@/components/arch/code-view";
import { Segmented } from "@/components/arch/segmented";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TimeAgo } from "@/components/time-ago";
import { downloadBlob } from "@/lib/zip";
import { cn } from "@/lib/utils";
import { useCodeApp } from "@/components/code-apps/around-code-app";
import { useWorkspace } from "../context";
import { buildTree, DiffIndex, DiffSections, langOf, TreeView, VersionPicker, versionName } from "./shared";

const RUN = "npm install && npm run dev";

/** The entry first, then the rest in the tree's order. */
const firstFile = (files: CodeFile[]) => files.find((f) => f.path === "App.jsx" || f.path === "App.tsx")?.path ?? files[0]?.path ?? "";

const asGenerated = (files: CodeFile[] | null): GeneratedFile[] => (files ?? []).map((f) => ({ path: f.path, content: f.content, lang: langOf(f.path, { css: true }) }));

/** The packages the files import (bare names only), for the panel: "react, lucide-react (icons)". */
function packagesUsed(files: CodeFile[]): string[] {
  const found = new Set<string>();
  for (const f of files) {
    for (const m of f.content.matchAll(/(?:from\s+|import\s*\(?\s*)["']([^"'./][^"']*)["']/g)) {
      const spec = m[1];
      const root = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
      found.add(root);
    }
  }
  return [...found].sort();
}

/** Downloads the runnable Vite project the export route builds from the saved files. Says so plainly if it can't. */
async function downloadProject(projectId: string, name: string) {
  const res = await fetch(`/api/code-apps/${projectId}/export`).catch(() => null);
  if (!res || !res.ok) {
    const body = res ? ((await res.json().catch(() => null)) as { error?: string } | null) : null;
    toast.error("Couldn't download the project", { description: body?.error ?? "Try again in a moment." });
    return;
  }
  const blob = await res.blob();
  const fromHeader = /filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") ?? "")?.[1];
  const file = fromHeader || `${name}.zip`;
  downloadBlob(blob, file);
  toast.success(`Downloaded ${file}`, { description: `Unzip it, then run ${RUN} in the folder.` });
}

const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";

/**
 * The Code tab for a code app: the real files Claude wrote (a tree and each file, highlighted), what
 * changed between two versions (real diffs of the files each version saved), and the whole project to
 * take away as a Vite project that runs with `npm install && npm run dev`.
 */
export function CodeAppBrowser({ fromId, toId }: { fromId: string | null; toId: string | null }) {
  const ws = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // The files as the project page has them: a change, a fix or an undo refreshes them.
  const { files: list, build } = useCodeApp();
  const tree = useMemo(() => buildTree(list.map((f) => f.path)), [list]);
  const dirs = useMemo(() => new Set(list.flatMap((f) => f.path.split("/").slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join("/")))), [list]);
  const [closedDirs, setClosedDirs] = useState<Set<string>>(() => new Set());
  const openDirs = useMemo(() => new Set([...dirs].filter((d) => !closedDirs.has(d))), [dirs, closedDirs]);
  const toggle = (p: string) =>
    setClosedDirs((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  const [mode, setMode] = useState<"files" | "changes">(params.get("compare") ? "changes" : "files");
  const [picked, setPicked] = useState<string | null>(params.get("file"));
  const active = picked && list.some((f) => f.path === picked) ? picked : firstFile(list);
  const file = list.find((f) => f.path === active);

  // The latest build's errors, pinned to the lines they name.
  const errors = useMemo(() => (build && !build.ok ? build.errors : []), [build]);
  const errorLines = useMemo(() => new Set(errors.filter((e) => e.file === active && e.line).map((e) => e.line!)), [errors, active]);

  // The two versions being compared, read when the Changes view is open.
  const [versions, setVersions] = useState<{ key: string; list: CodeVersionFiles[] } | null>(null);
  const key = `${fromId ?? ""}:${toId ?? ""}`;
  useEffect(() => {
    if (mode !== "changes" || !fromId || !toId) return;
    let alive = true;
    codeVersionFiles(ws.project.id, [fromId, toId]).then(
      (l) => alive && setVersions({ key, list: l }),
      () => alive && setVersions({ key, list: [] }),
    );
    return () => {
      alive = false;
    };
  }, [mode, fromId, toId, key, ws.project.id]);
  const loaded = versions?.key === key ? versions.list : null;
  const from = loaded?.find((v) => v.id === fromId) ?? null;
  const to = loaded?.find((v) => v.id === toId) ?? null;
  const diffs = useMemo(() => (from && to ? diffFiles(asGenerated(from.files), asGenerated(to.files)) : []), [from, to]);
  const fromMeta = ws.checkpoints.find((c) => c.id === fromId);
  const toMeta = ws.checkpoints.find((c) => c.id === toId);

  const setCompare = (which: "from" | "to", id: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set(which, id);
    sp.set("compare", "1");
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  const [panelOpen, setPanelOpen] = useState(false);
  const filesLabel = `Files · ${list.length}`;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[260px] shrink-0 flex-col border-r border-hairline max-md:hidden">
        <div className="px-3 py-2.5">
          <Segmented ariaLabel="Code view" value={mode} onChange={setMode} className="w-full [&>button]:flex-1 [&>button]:justify-center" options={[{ value: "files", label: filesLabel }, { value: "changes", label: "Changes" }]} />
        </div>
        {mode === "files" ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 font-mono text-code">
            <TreeView nodes={tree} depth={0} active={active} onOpen={setPicked} openDirs={openDirs} toggle={toggle} />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {ws.checkpoints.length < 2 ? (
              <p className="text-meta text-muted-foreground">There&apos;s one version so far. Each change Claude makes, and each fix, saves a new one to compare.</p>
            ) : (
              <>
                <VersionPicker which="from" value={fromId ?? ""} onChange={(id) => setCompare("from", id)} />
                <VersionPicker which="to" value={toId ?? ""} onChange={(id) => setCompare("to", id)} className="mt-3" />
                {loaded && <DiffIndex diffs={diffs} />}
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phones: the files as a list, the versions as small choices. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2 md:hidden">
          <Segmented ariaLabel="Code view" value={mode} onChange={setMode} options={[{ value: "files", label: filesLabel }, { value: "changes", label: "Changes" }]} />
          {mode === "files" ? (
            <NativeSelect aria-label="File" value={active} onChange={(e) => setPicked(e.target.value)} className="min-w-0 flex-1 basis-40 font-mono text-badge">
              {list.map((f) => (
                <option key={f.path} value={f.path}>
                  {f.path}
                </option>
              ))}
            </NativeSelect>
          ) : (
            ws.checkpoints.length >= 2 && (
              <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">
                <VersionPicker which="from" compact value={fromId ?? ""} onChange={(id) => setCompare("from", id)} />
                <VersionPicker which="to" compact value={toId ?? ""} onChange={(id) => setCompare("to", id)} />
              </div>
            )
          )}
        </div>

        {mode === "files" ? (
          <>
            <div className="flex items-center gap-2 border-b border-hairline px-4 py-2 max-md:flex-wrap">
              <FileCode2 className="size-3.5 text-muted-foreground" aria-hidden />
              <span className="truncate font-mono text-badge">{file?.path ?? "No file"}</span>
              <div className="ml-auto flex items-center gap-1.5">
                {file && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard.writeText(file.content);
                      toast.success("Copied");
                    }}
                  >
                    <Copy /> Copy
                  </Button>
                )}
                <Button size="sm" variant="outline" className="xl:hidden" onClick={() => setPanelOpen(true)}>
                  <Download /> <span className="max-sm:sr-only">Download</span>
                </Button>
              </div>
            </div>
            {errors.length > 0 && (
              <div role="status" className="flex items-start gap-2 border-b border-hairline bg-panel px-4 py-2 text-ui">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <p className="min-w-0 flex-1">
                  The latest build failed: <span className="font-mono text-badge">{buildErrorLine(errors[0])}</span>
                  {errors[0].file && errors[0].file !== active && list.some((f) => f.path === errors[0].file) && (
                    <>
                      {" "}
                      <button className="text-brand underline decoration-dotted underline-offset-4" onClick={() => setPicked(errors[0].file!)}>
                        Open {errors[0].file}
                      </button>
                    </>
                  )}
                  <span className="text-muted-foreground"> · </span>
                  <Link href={`/p/${ws.project.id}`} className="text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground">
                    Fix it on the Sheet
                  </Link>
                </p>
              </div>
            )}
            {file ? (
              <CodeView code={file.content} lang={langOf(file.path, { css: true })} highlightLines={errorLines} className="min-h-0 flex-1" />
            ) : (
              <p className="p-6 text-ui text-muted-foreground">Claude hasn&apos;t written any files for this app yet.</p>
            )}
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {ws.checkpoints.length < 2 ? (
              <p className="text-ui text-muted-foreground">Nothing to compare yet: this app has one version.</p>
            ) : !loaded ? (
              <p className="flex items-center gap-2 text-ui text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Reading both versions…
              </p>
            ) : !from?.files || !to?.files ? (
              <p className="text-ui text-muted-foreground">One of these versions was saved before the app was written as code, so it has no files to compare. Pick another.</p>
            ) : (
              <>
                {fromMeta && toMeta && (
                  <p className="mb-3 text-ui text-muted-foreground">
                    Version {fromMeta.seq} “{versionName(fromMeta.label)}” → version {toMeta.seq} “{versionName(toMeta.label)}” · {diffs.length} file{diffs.length === 1 ? "" : "s"} changed
                  </p>
                )}
                <DiffSections diffs={diffs} />
              </>
            )}
          </div>
        )}
      </div>

      <TakeAway files={list} build={build} className="w-[290px] shrink-0 border-l border-hairline max-xl:hidden" />
      {/* Below xl the panel has no room beside the code, so it opens as a sheet. */}
      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent side="right" className="w-[320px] p-0">
          <SheetTitle className="sr-only">Download the project</SheetTitle>
          <TakeAway files={list} build={build} className="h-full" />
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** The project to take away: a real Vite project, how to run it, and what's in it. */
function TakeAway({ files, build, className }: { files: CodeFile[]; build: { ok: boolean; at: string } | null; className?: string }) {
  const ws = useWorkspace();
  const [busy, setBusy] = useState(false);
  const packages = useMemo(() => packagesUsed(files), [files]);
  const latest = ws.checkpoints[0];
  return (
    <aside aria-label="Download the project" className={cn("overflow-y-auto p-4", className)}>
      <h2 className="font-pencil text-note leading-tight">Take it with you</h2>
      <p className="mt-2 text-ui text-muted-foreground">The whole app as a Vite project: these files, a package.json and a small stand-in for Prod AI that keeps records in the browser.</p>
      <Button
        className="mt-3 w-full"
        disabled={busy || !files.length}
        onClick={async () => {
          setBusy(true);
          await downloadProject(ws.project.id, slugOf(ws.project.name));
          setBusy(false);
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Download />} Download project
      </Button>
      <p className="mt-3 flex items-center gap-1.5 text-meta font-medium text-muted-foreground">
        <Terminal className="size-3" aria-hidden />
        Then, in the unzipped folder
      </p>
      <div className="mt-1.5 flex items-center gap-2 rounded-md border border-hairline bg-canvas p-1.5 pl-3">
        <code className="min-w-0 flex-1 truncate font-mono text-badge text-foreground">{RUN}</code>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Copy the command"
          className="text-muted-foreground"
          onClick={() => {
            void navigator.clipboard.writeText(RUN);
            toast.success("Command copied");
          }}
        >
          <Copy />
        </Button>
      </div>
      <p className="mt-1.5 text-meta text-faint">Needs Node.js 20 or newer. Opens on localhost.</p>

      <div className="mt-6 border-t border-hairline pt-4">
        <p className="text-meta font-medium text-muted-foreground">What&apos;s in it</p>
        <ul className="mt-2 space-y-1.5 text-meta text-muted-foreground">
          <li className="tabular-nums">
            {files.length} {files.length === 1 ? "file" : "files"}, {Math.max(1, Math.round(files.reduce((n, f) => n + f.content.length, 0) / 1000))} KB
          </li>
          {packages.length > 0 && (
            <li className="flex items-start gap-1.5">
              <Package className="mt-0.5 size-3 shrink-0" aria-hidden />
              <span>{packages.map((p) => (PACKAGES[p] && p !== "react" ? `${p} (${PACKAGES[p].what})` : p)).join(", ")}</span>
            </li>
          )}
          <li>
            {build ? (
              build.ok ? (
                <>
                  Built without errors{build.at && <> <TimeAgo iso={build.at} /></>}
                </>
              ) : (
                "The latest build failed; the download has the files as they are"
              )
            ) : (
              "Not built yet"
            )}
          </li>
        </ul>
      </div>
      {latest && (
        <p className="mt-6 text-meta text-faint">
          Version {latest.seq} saved <TimeAgo iso={latest.created_at} />
        </p>
      )}
    </aside>
  );
}
