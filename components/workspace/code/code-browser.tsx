"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronRight, CircleCheck, Copy, Download, ExternalLink, FileCode2, Folder, GitBranch, GitPullRequest, Loader2, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import type { Blueprint } from "@/lib/blueprint/schema";
import type { CheckpointMeta, WorkOrderRow } from "@/lib/db/types";
import { generateFiles, importPullRequest, type ImportPullRequest } from "@/lib/codegen/files";
import { diffFiles } from "@/lib/codegen/diff";
import type { GeneratedFile } from "@/lib/codegen/types";
import { houseRulePolicy, ruleBlocking } from "@/lib/import/house-rules";
import type { RepoSnapshot } from "@/lib/import/snapshot";
import { CodeView } from "@/components/arch/code-view";
import { Segmented } from "@/components/arch/segmented";
import { Button } from "@/components/ui/button";
import { GitHubMark } from "@/components/brand/logo";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TimeAgo } from "@/components/time-ago";
import { connectGitHub, pullFromGitHub } from "@/lib/actions/github";
import { downloadBlob, zip } from "@/lib/zip";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";

type Tree = { name: string; path: string; children?: Tree[] };

/** Same slug the GitHub connection uses for the repo name, so folder, zip and repo all match. */
const projectSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";

function buildTree(paths: string[]): Tree[] {
  const root: Tree = { name: "", path: "", children: [] };
  for (const full of paths) {
    const parts = full.split("/");
    let node = root;
    parts.forEach((p, i) => {
      const path = parts.slice(0, i + 1).join("/");
      if (i === parts.length - 1) node.children!.push({ name: p, path });
      else {
        let next = node.children!.find((c) => c.path === path && c.children);
        if (!next) {
          next = { name: p, path, children: [] };
          node.children!.push(next);
        }
        node = next;
      }
    });
  }
  const sort = (n: Tree[]): Tree[] => n.sort((a, b) => (a.children && !b.children ? -1 : !a.children && b.children ? 1 : a.name.localeCompare(b.name))).map((x) => (x.children ? { ...x, children: sort(x.children) } : x));
  return sort(root.children!);
}

const EXT_LANG: Record<string, GeneratedFile["lang"]> = { ts: "ts", tsx: "tsx", js: "ts", jsx: "tsx", mjs: "ts", cjs: "ts", py: "py", yml: "yaml", yaml: "yaml", md: "md", mdx: "md", json: "json", sql: "sql", sh: "sh", toml: "toml" };
function langOf(path: string): GeneratedFile["lang"] {
  const base = path.split("/").pop() ?? "";
  if (/^\.env/.test(base)) return "env";
  return EXT_LANG[base.split(".").pop()?.toLowerCase() ?? ""] ?? "txt";
}

type RepoFile = { status: "ok"; content: string } | { status: "binary" | "error" };

/**
 * The file to open first. Imported projects open the pull request's README (what it adds, what it
 * leaves out and why). Links from the inspector name generated paths ("agents/x/agent.yaml"), which
 * for an imported project live under the pull request's folder, or became a wrapper.
 */
function initialFile(want: string | null, files: GeneratedFile[], pr: ImportPullRequest | null): string {
  if (!want) return pr ? files[0].path : (files.find((f) => f.path.startsWith("agents/"))?.path ?? files[0].path);
  if (!pr || files.some((f) => f.path === want)) return want;
  const rooted = `${pr.root}/${want}`;
  if (files.some((f) => f.path === rooted)) return rooted;
  const agentDir = want.match(/^agents\/([^/]+)\//)?.[1];
  return (agentDir && files.find((f) => f.path.startsWith(`${pr.root}/agents/${agentDir}/wrapper.`))?.path) || want;
}

/** The imported repository as it really is: the tree stored at import, read from our API. */
function useRepoSnapshot(projectId: string, enabled: boolean) {
  const [snap, setSnap] = useState<RepoSnapshot | "error" | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetch(`/api/import/repo?project=${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: RepoSnapshot) => alive && setSnap(j))
      .catch(() => alive && setSnap("error"));
    return () => {
      alive = false;
    };
  }, [projectId, enabled]);
  return snap;
}

export function CodeBrowser({ compare, workOrders }: { compare: { from: { meta: CheckpointMeta; blueprint: Blueprint } | null; to: { meta: CheckpointMeta; blueprint: Blueprint } | null }; workOrders: WorkOrderRow[] }) {
  const ws = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const imported = ws.project.source === "import";
  const snapshot = useRepoSnapshot(ws.project.id, imported);
  const snap = snapshot && snapshot !== "error" ? snapshot : null;
  const repoPaths = useMemo(() => snap?.paths ?? [], [snap]);
  const houseRules = useMemo(() => ws.project.settings.houseRules ?? [], [ws.project.settings.houseRules]);
  const [ghOwner, ghName] = (ws.project.settings.github?.repo ?? "").split("/");

  // Imported projects: the first pull request (only new files, filtered by the House Rules). Otherwise every generated file.
  const prFor = useMemo(() => {
    if (!imported) return null;
    const ctx = { repo: { owner: snap?.owner ?? ghOwner ?? "", name: snap?.name ?? ghName ?? ws.project.name }, repoPaths, houseRules, frameworks: snap?.frameworks ?? [], agents: snap?.agents };
    return (bp: Blueprint) => importPullRequest(bp, ctx);
  }, [imported, snap, ghOwner, ghName, ws.project.name, repoPaths, houseRules]);
  const pr = useMemo(() => (prFor ? prFor(ws.blueprint) : null), [prFor, ws.blueprint]);
  const files = useMemo(() => pr?.files ?? generateFiles(ws.blueprint), [pr, ws.blueprint]);
  const tree = useMemo(() => buildTree(files.map((f) => f.path)), [files]);
  const repoTree = useMemo(() => buildTree(repoPaths), [repoPaths]);

  const [mode, setMode] = useState<"files" | "changes">(params.get("compare") ? "changes" : "files");
  const [active, setActive] = useState(() => initialFile(params.get("file"), files, pr));
  const [openDirs, setOpenDirs] = useState<Set<string>>(() => new Set(["agents", "app", "app/(app)", ...(pr ? [pr.root, `${pr.root}/agents`] : []), ...files.filter((f) => f.path === active).map((f) => f.path.split("/").slice(0, -1).join("/"))]));
  const [openRepoDirs, setOpenRepoDirs] = useState<Set<string>>(() => new Set());
  const toggleIn = (set: typeof setOpenDirs) => (p: string) => set((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });

  const repoActive = imported && !files.some((f) => f.path === active) && repoPaths.includes(active);
  const file = files.find((f) => f.path === active) ?? files[0];
  const [repoFiles, setRepoFiles] = useState<Record<string, RepoFile>>({});
  const repoFile = repoActive ? repoFiles[active] : undefined;
  useEffect(() => {
    if (!repoActive || repoFiles[active]) return;
    let alive = true;
    fetch(`/api/import/repo?project=${encodeURIComponent(ws.project.id)}&path=${encodeURIComponent(active)}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { content?: string };
        const next: RepoFile = r.ok && typeof j.content === "string" ? { status: "ok", content: j.content } : { status: r.status === 415 ? "binary" : "error" };
        if (alive) setRepoFiles((m) => ({ ...m, [active]: next }));
      })
      .catch(() => alive && setRepoFiles((m) => ({ ...m, [active]: { status: "error" } })));
    return () => {
      alive = false;
    };
  }, [repoActive, active, repoFiles, ws.project.id]);

  const diffs = useMemo(() => {
    if (!compare.from || !compare.to) return [];
    const set = (bp: Blueprint) => (prFor ? prFor(bp).files : generateFiles(bp));
    return diffFiles(set(compare.from.blueprint), set(compare.to.blueprint));
  }, [compare, prFor]);
  const [githubOpen, setGithubOpen] = useState(false);
  // Folders for the phone file picker, root files first.
  const folders = useMemo(() => {
    const byDir = new Map<string, string[]>();
    for (const f of files) {
      const dir = f.path.split("/").slice(0, -1).join("/");
      byDir.set(dir, [...(byDir.get(dir) ?? []), f.path]);
    }
    return [...byDir].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
  }, [files]);
  const repoUrl = snap ? `https://github.com/${snap.owner}/${snap.name}` : ws.project.settings.github?.repo ? `https://github.com/${ws.project.settings.github.repo}` : null;
  const blobUrl = (path: string) => (snap ? `${repoUrl}/blob/${encodeURIComponent(snap.branch)}/${path.split("/").map(encodeURIComponent).join("/")}` : repoUrl);

  const setCompare = (key: "from" | "to", id: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set(key, id);
    sp.set("compare", "1");
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  const filesLabel = imported ? "Files" : `Files · ${files.length}`;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[260px] shrink-0 flex-col border-r border-hairline max-md:hidden">
        <div className="px-3 py-2.5">
          <Segmented ariaLabel="Code view" value={mode} onChange={setMode} className="w-full [&>button]:flex-1 [&>button]:justify-center" options={[{ value: "files", label: filesLabel }, { value: "changes", label: "Changes" }]} />
        </div>
        {mode === "files" ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 font-mono text-[12px]">
            {pr ? (
              <>
                <section aria-label="Your repo, untouched">
                  <div className="px-1 pb-1.5 pt-1 font-sans">
                    <p className="flex items-center gap-1.5 text-[12px] font-semibold"><GitHubMark className="size-3.5" />Your repo · untouched</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {snap ? <>{snap.owner}/{snap.name} · {snap.branch} · {snap.fileCount.toLocaleString()} files{snap.truncated ? " (partial)" : ""}</> : snapshot === "error" ? "Couldn't load the file tree." : "Loading the file tree…"}
                    </p>
                  </div>
                  {snap?.paths ? (
                    <TreeView nodes={repoTree} depth={0} active={active} onOpen={setActive} openDirs={openRepoDirs} toggle={toggleIn(setOpenRepoDirs)} />
                  ) : snap ? (
                    <ul className="px-1 text-muted-foreground">
                      {snap.folders.map((d) => <li key={d} className="flex items-center gap-1 py-0.5"><Folder className="size-3 shrink-0" />{d}</li>)}
                      {repoUrl && <li className="pt-1 font-sans text-[11.5px]"><a href={repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-foreground/80 underline-offset-2 hover:underline">Browse every file on GitHub <ExternalLink className="size-3" /></a></li>}
                    </ul>
                  ) : snapshot === null ? (
                    <div className="space-y-1.5 px-1 py-1" aria-hidden>{[70, 55, 62, 48].map((w) => <div key={w} className="h-3.5 rounded bg-deep" style={{ width: `${w}%` }} />)}</div>
                  ) : repoUrl ? (
                    <a href={repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-1 font-sans text-[11.5px] text-foreground/80 underline-offset-2 hover:underline">Open it on GitHub <ExternalLink className="size-3" /></a>
                  ) : null}
                </section>
                <section aria-label={`Proposed in pull request ${pr.number}, not merged`} className="mt-3 border-t border-hairline pt-2.5">
                  <div className="px-1 pb-1.5 font-sans">
                    <p className="flex items-center gap-1.5 text-[12px] font-semibold"><GitPullRequest className="size-3.5 text-read" />Proposed in PR #{pr.number} (not merged)</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{pr.files.length} new files in {pr.root}/ · 0 existing files changed</p>
                  </div>
                  <TreeView nodes={tree} depth={0} active={active} onOpen={setActive} openDirs={openDirs} toggle={toggleIn(setOpenDirs)} />
                  <HeldBack pr={pr} />
                </section>
              </>
            ) : (
              <TreeView nodes={tree} depth={0} active={active} onOpen={setActive} openDirs={openDirs} toggle={toggleIn(setOpenDirs)} />
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {pr && <p className="mb-3 text-[11.5px] leading-relaxed text-muted-foreground">Changes to PR #{pr.number} between save points. Your repo&apos;s own files never appear here.</p>}
            <label className="text-[12px] font-medium text-muted-foreground">From</label>
            <select value={compare.from?.meta.id ?? ""} onChange={(e) => setCompare("from", e.target.value)} className="mt-1 h-8 w-full rounded-md border border-hairline bg-deep px-2 text-[12px]">
              {ws.checkpoints.map((c) => <option key={c.id} value={c.id}>#{c.seq} {c.label}</option>)}
            </select>
            <label className="mt-3 block text-[12px] font-medium text-muted-foreground">To</label>
            <select value={compare.to?.meta.id ?? ""} onChange={(e) => setCompare("to", e.target.value)} className="mt-1 h-8 w-full rounded-md border border-hairline bg-deep px-2 text-[12px]">
              {ws.checkpoints.map((c) => <option key={c.id} value={c.id}>#{c.seq} {c.label}</option>)}
            </select>
            <ul className="mt-4 space-y-1">
              {diffs.map((d) => (
                <li key={d.path}>
                  <a href={`#diff-${d.path}`} className="flex items-center gap-2 rounded-md px-2 py-1 font-mono text-[11.5px] hover:bg-raised">
                    <span className={cn("size-1.5 shrink-0 rounded-full", d.status === "added" ? "bg-read" : d.status === "removed" ? "bg-foreground/40" : "bg-change")} title={d.status} />
                    <span className="min-w-0 flex-1 truncate">{d.path}</span>
                    <span className="text-read">+{d.additions}</span>
                    <span className="text-muted-foreground">−{d.deletions}</span>
                  </a>
                </li>
              ))}
              {diffs.length === 0 && <li className="px-2 py-4 text-center text-[12px] text-muted-foreground">No differences between these save points.</li>}
            </ul>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phones: the file tree and save point pickers, as native selects. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2 md:hidden">
          <Segmented ariaLabel="Code view" value={mode} onChange={setMode} options={[{ value: "files", label: filesLabel }, { value: "changes", label: "Changes" }]} />
          {mode === "files" ? (
            <select aria-label="File" value={active} onChange={(e) => setActive(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-hairline bg-deep px-2 font-mono text-[12px]">
              {pr && repoPaths.length > 0 && (
                <optgroup label="Your repo · untouched">
                  {repoPaths.slice(0, 400).map((p) => <option key={`repo-${p}`} value={p}>{p}</option>)}
                </optgroup>
              )}
              {folders.map(([dir, list]) => (
                <optgroup key={dir} label={pr ? `PR #${pr.number} · ${dir || "root"}` : dir || "Project root"}>
                  {list.map((p) => <option key={p} value={p}>{p.split("/").pop()}</option>)}
                </optgroup>
              ))}
            </select>
          ) : (
            <div className="flex w-full gap-2">
              <select aria-label="From save point" value={compare.from?.meta.id ?? ""} onChange={(e) => setCompare("from", e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-hairline bg-deep px-2 text-[12px]">
                {ws.checkpoints.map((c) => <option key={c.id} value={c.id}>From #{c.seq} {c.label}</option>)}
              </select>
              <select aria-label="To save point" value={compare.to?.meta.id ?? ""} onChange={(e) => setCompare("to", e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-hairline bg-deep px-2 text-[12px]">
                {ws.checkpoints.map((c) => <option key={c.id} value={c.id}>To #{c.seq} {c.label}</option>)}
              </select>
            </div>
          )}
        </div>
        {mode === "files" ? (
          repoActive ? (
            <>
              <div className="flex items-center gap-2 border-b border-hairline px-4 py-2 max-md:flex-wrap">
                <FileCode2 className="size-3.5 text-muted-foreground" />
                <span className="truncate font-mono text-[12px]">{active}</span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-[11px] text-muted-foreground"><Lock className="size-3" />Your repo · untouched</span>
                <div className="ml-auto flex items-center gap-1.5">
                  {repoFile?.status === "ok" && <Button size="sm" variant="ghost" className="h-7" onClick={() => { void navigator.clipboard.writeText(repoFile.content); toast.success("Copied"); }}><Copy /> Copy</Button>}
                  {blobUrl(active) && (
                    <Button asChild size="sm" variant="outline" className="h-7">
                      <a href={blobUrl(active)!} target="_blank" rel="noreferrer">Open on GitHub <ExternalLink /></a>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-7 xl:hidden" onClick={() => setGithubOpen(true)} aria-label="GitHub and download">
                    <GitHubMark /> <span className="max-sm:sr-only">GitHub</span>
                  </Button>
                </div>
              </div>
              {repoFile?.status === "ok" ? (
                <CodeView code={repoFile.content} lang={langOf(active)} className="min-h-0 flex-1" />
              ) : (
                <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
                  {!repoFile ? (
                    <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Reading {active.split("/").pop()} from GitHub…</p>
                  ) : (
                    <p className="max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
                      {repoFile.status === "binary" ? "This is a binary file, so it isn't shown here." : "GitHub didn't answer just now, so this file can't be shown."} It is untouched either way.
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-hairline px-4 py-2 max-md:flex-wrap">
                <FileCode2 className="size-3.5 text-muted-foreground" />
                <span className="truncate font-mono text-[12px]">{file.path}</span>
                {pr && <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-read/30 bg-read/10 px-2 py-0.5 text-[11px] text-read"><GitPullRequest className="size-3" />PR #{pr.number} · new file · not merged</span>}
                {file.objectRef && (
                  <button onClick={() => ws.select(file.objectRef!)} className="ml-2 rounded-full border border-hairline px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">Open in inspector</button>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => { void navigator.clipboard.writeText(file.content); toast.success("Copied"); }}><Copy /> Copy</Button>
                  <OpenIn pr={pr} snap={snap} />
                  <Button size="sm" variant="outline" className="h-7 xl:hidden" onClick={() => setGithubOpen(true)} aria-label="GitHub and download">
                    <GitHubMark /> <span className="max-sm:sr-only">GitHub</span>
                  </Button>
                </div>
              </div>
              <CodeView code={file.content} lang={file.lang} className="min-h-0 flex-1" />
            </>
          )
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {compare.from && compare.to && (
              <p className="mb-3 text-[12.5px] text-muted-foreground">
                Save point #{compare.from.meta.seq} “{compare.from.meta.label}” → #{compare.to.meta.seq} “{compare.to.meta.label}” · {diffs.length} file{diffs.length === 1 ? "" : "s"} changed{pr ? ` in PR #${pr.number}` : ""}
              </p>
            )}
            <div className="space-y-4">
              {diffs.map((d) => (
                <section key={d.path} id={`diff-${d.path}`} className="overflow-hidden rounded-md border border-hairline">
                  <header className="flex items-center gap-2 border-b border-hairline bg-panel px-3 py-2 font-mono text-[12px]">
                    <span className="truncate">{d.path}</span>
                    <span className="ml-auto text-read">+{d.additions}</span>
                    <span className="text-muted-foreground">−{d.deletions}</span>
                  </header>
                  <div className="code-face overflow-x-auto py-1 text-[12px] leading-[1.6]">
                    {d.hunks.map((h, hi) => (
                      <div key={hi}>
                        <div className="bg-change/[0.06] px-3 py-0.5 text-change">{h.header}</div>
                        {h.lines.map((l, li) => (
                          <div key={li} className={cn("whitespace-pre border-l-2 px-3", l.startsWith("+") ? "border-read bg-read/10 text-foreground" : l.startsWith("-") ? "border-foreground/30 bg-foreground/[0.05] text-muted-foreground" : "border-transparent text-foreground/70")}>{l || " "}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
      </div>

      <GitHubPanel workOrders={workOrders} pr={pr} snap={snap} className="w-[290px] shrink-0 border-l border-hairline max-xl:hidden" />
      {/* Below xl the panel has no room beside the code, so it opens as a sheet. */}
      <Sheet open={githubOpen} onOpenChange={setGithubOpen}>
        <SheetContent side="right" className="w-[320px] p-0">
          <SheetTitle className="sr-only">GitHub and download</SheetTitle>
          <GitHubPanel workOrders={workOrders} pr={pr} snap={snap} className="h-full" />
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** What a fresh project would get that this pull request leaves out, grouped by the signed rule that holds it back. */
function HeldBack({ pr }: { pr: ImportPullRequest }) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => {
    const m = new Map<string, { note: string; paths: string[] }>();
    for (const h of pr.heldBack) m.set(h.rule, { note: h.note, paths: [...(m.get(h.rule)?.paths ?? []), h.path] });
    return [...m];
  }, [pr]);
  if (!groups.length) return null;
  return (
    <div className="mt-2.5 rounded-md border border-hairline bg-panel font-sans">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[11.5px] text-muted-foreground hover:text-foreground">
        {open ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
        <ShieldCheck className="size-3 shrink-0 text-brand" />
        <span className="flex-1">Held back by House Rules</span>
        <span className="font-mono text-faint">{pr.heldBack.length}</span>
      </button>
      {open && (
        <ul className="space-y-2.5 border-t border-hairline px-2 py-2">
          {groups.map(([rule, g]) => (
            <li key={rule}>
              <p className="text-[11.5px] leading-snug text-foreground/90">{rule}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-faint">{g.note}</p>
              <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-muted-foreground">
                {g.paths.map((p) => <li key={p} className="truncate line-through decoration-faint/60" title={p}>{p}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TreeView({ nodes, depth, active, onOpen, openDirs, toggle }: { nodes: Tree[]; depth: number; active: string; onOpen: (p: string) => void; openDirs: Set<string>; toggle: (p: string) => void }) {
  return (
    <ul>
      {nodes.map((n) =>
        n.children ? (
          <li key={n.path}>
            <button onClick={() => toggle(n.path)} className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-muted-foreground hover:text-foreground" style={{ paddingLeft: depth * 12 + 4 }} aria-expanded={openDirs.has(n.path)}>
              {openDirs.has(n.path) ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
              <Folder className="size-3 shrink-0" />
              <span className="truncate">{n.name}</span>
            </button>
            {openDirs.has(n.path) && <TreeView nodes={n.children} depth={depth + 1} active={active} onOpen={onOpen} openDirs={openDirs} toggle={toggle} />}
          </li>
        ) : (
          <li key={n.path}>
            <button onClick={() => onOpen(n.path)} className={cn("flex w-full items-center gap-1.5 truncate rounded px-1 py-0.5 text-left", n.path === active ? "bg-brand-soft text-brand" : "text-foreground/80 hover:bg-raised")} style={{ paddingLeft: depth * 12 + 20 }}>
              <span className="truncate">{n.name}</span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

/**
 * The zip every "download" gives: the project's files (or, for an imported repo, only the pull request's
 * new folder) inside one folder named like the project. Returns the folder name it used.
 */
function useExportBundle(pr: ImportPullRequest | null, snap: RepoSnapshot | null) {
  const ws = useWorkspace();
  return (opts: { quiet?: boolean } = {}) => {
    const slug = pr ? (snap?.name ?? projectSlug(ws.project.name)) : projectSlug(ws.project.name);
    const all = pr ? pr.files : generateFiles(ws.blueprint);
    const name = pr ? `${slug}-pr-${pr.number}` : slug;
    try {
      const bytes = zip(all.map((f) => ({ path: `${slug}/${f.path}`, content: f.content })));
      downloadBlob(new Blob([bytes], { type: "application/zip" }), `${name}.zip`);
      if (!opts.quiet) toast.success(`Downloaded ${name}.zip`, { description: pr ? `${all.length} new files, all in ${pr.root}/. Nothing else in your repo.` : `${all.length} files, in their folders.` });
    } catch {
      // Never leave someone without their code: one text file, each file headed by its path.
      const text = all.map((f) => `# ===== ${f.path} =====\n${f.content}`).join("\n\n");
      downloadBlob(new Blob([text], { type: "text/plain" }), `${name}-source.txt`);
    }
    return { zipName: `${name}.zip`, folder: slug, count: all.length };
  };
}

/**
 * Honest ways to get this code into an editor: the zip (always real), and a clone command only when
 * GitHub is connected. The GitHub connection is a sandbox, so the clone says so: nothing is pushed to a
 * project's own repo; an imported repo is real, but its pull request isn't pushed. No invented CLI.
 */
function OpenIn({ pr, snap }: { pr: ImportPullRequest | null; snap: RepoSnapshot | null }) {
  const ws = useWorkspace();
  const gh = ws.project.settings.github;
  const repo = gh?.connected ? gh.repo : undefined;
  const exportBundle = useExportBundle(pr, snap);
  const openInCursor = () => {
    const { zipName, folder, count } = exportBundle({ quiet: true });
    toast.success(`Downloaded ${zipName}`, {
      description: pr
        ? `${count} new files in ${folder}/${pr.root}/. Unzip it, copy ${pr.root}/ into your clone of ${snap ? `${snap.owner}/${snap.name}` : "your repo"}, then open that folder in Cursor (File › Open Folder).`
        : `${count} files. Unzip it, then open the ${folder} folder in Cursor (File › Open Folder).`,
    });
  };
  const cloneFromGitHub = () => {
    if (!repo) return;
    const folder = repo.split("/")[1] ?? projectSlug(ws.project.name);
    const cmd = `git clone https://github.com/${repo}.git && cd ${folder}`;
    void navigator.clipboard.writeText(cmd);
    toast.success("Clone command copied", {
      description: pr
        ? `${cmd}. Your repo is real; PR #${pr.number} is a sandbox and isn't pushed, so its files come from the zip.`
        : `${cmd}. Sandbox: GitHub isn't really connected in this prototype and nothing has been pushed to ${repo}, so the clone won't find it yet. Use the zip for the code.`,
    });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-7">Open in <ChevronDown /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuItem onSelect={openInCursor}><Download /> {pr ? `Download PR #${pr.number} (.zip), then open it in Cursor` : "Download .zip, then open the folder in Cursor"}</DropdownMenuItem>
        {repo && (
          <DropdownMenuItem onSelect={cloneFromGitHub} className="items-start">
            <GitHubMark className="mt-0.5" />
            <span className="min-w-0">
              <span className="block">Clone from GitHub · sandbox</span>
              <span className="block truncate font-mono text-[11px] text-muted-foreground">{repo}</span>
            </span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GitHubPanel({ workOrders, pr, snap, className }: { workOrders: WorkOrderRow[]; pr: ImportPullRequest | null; snap: RepoSnapshot | null; className?: string }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const gh = ws.project.settings.github;
  const changes = workOrders.filter((w) => w.kind === "change" && (w.status === "done" || w.status === "proposed")).slice(0, 5);
  // Pull request numbers: the seeded demo continues its story; everything else counts from #1 (#2 when the import PR is #1).
  const firstNumber = ws.project.isDemo ? 12 : pr ? pr.number + 1 : 1;
  // Only the seeded demo has a teammate history on main. Nobody has pushed to a repo imported seconds ago.
  const seededTeammate = ws.project.isDemo;
  const ciUntouched = pr ? Boolean(ruleBlocking(houseRulePolicy(ws.project.settings.houseRules ?? []), ".github/workflows/prodai-checks.yml")) : false;
  const exportBundle = useExportBundle(pr, snap);

  return (
    <aside aria-label="GitHub" className={cn("overflow-y-auto p-4", className)}>
      <p className="flex items-center gap-2 font-pencil text-[24px] leading-none"><GitHubMark className="size-4" /> Your code on GitHub</p>
      {!gh?.connected ? (
        <div className="mt-3">
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">Keep a copy of every file in your own repository. Each Work Order becomes a branch and a change for review, and edits you push come back into the blueprint.</p>
          <Button className="mt-3 w-full" disabled={pending} onClick={() => start(async () => { const r = await connectGitHub(ws.project.id); if (r.ok) toast.success(`Connected ${r.repo}`, { description: "Sandbox: the flow is real, the push is simulated." }); router.refresh(); })}>
            {pending ? <Loader2 className="animate-spin" /> : <GitHubMark />} Connect GitHub
          </Button>
          <p className="mt-2 text-[11px] text-faint">Sandbox in this prototype.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          <div className="rounded-md border border-hairline bg-panel p-2.5">
            <p className="truncate font-mono text-[12px]">{gh.repo}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><GitBranch className="size-3" />{pr ? `${snap?.branch ?? "main"} · pull requests only · sandbox` : "main · two-way sync on · sandbox"}</p>
          </div>
          <div>
            <p className="text-[12px] font-medium text-muted-foreground">Changes for review</p>
            <ul className="mt-2 space-y-1.5">
              {pr && (
                <li className="rounded-md border border-read/25 bg-read/[0.05] p-2">
                  <p className="flex items-start gap-1.5 text-[12px]">
                    <GitPullRequest className="mt-0.5 size-3 shrink-0 text-read" />
                    <span className="min-w-0 flex-1 leading-snug">{pr.title}</span>
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 pl-4 text-[11px] text-muted-foreground">
                    <span className="font-mono">#{pr.number}</span>
                    <span>open · not merged</span>
                    <span>{pr.files.length} new · 0 changed</span>
                  </p>
                  <p className="mt-0.5 truncate pl-4 font-mono text-[10.5px] text-faint">{pr.branch} → {snap?.branch ?? "main"}</p>
                </li>
              )}
              {!pr && changes.length === 0 && <li className="text-[12px] text-muted-foreground">Your next approved Work Order opens one here.</li>}
              {changes.map((w, i) => (
                <li key={w.id} className="rounded-md border border-hairline bg-panel p-2">
                  <p className="flex items-start gap-1.5 text-[12px]">
                    <GitPullRequest className={cn("mt-0.5 size-3 shrink-0", w.status === "done" ? "text-fix" : "text-read")} />
                    <span className="min-w-0 flex-1 leading-snug">{w.proposal?.summary ?? w.request}</span>
                  </p>
                  <p className="mt-1 flex items-center gap-2 pl-4 text-[11px] text-muted-foreground">
                    <span className="font-mono">#{firstNumber + changes.length - 1 - i}</span>
                    {w.status === "done" ? <span className="inline-flex items-center gap-1 text-read"><CircleCheck className="size-3" />rehearsals passed</span> : <span>awaiting approval</span>}
                    <span>{w.status === "done" ? "merged" : "open"}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
          {seededTeammate && (
            <div className="rounded-md border border-change/25 bg-change/[0.05] p-2.5">
              <p className="text-[12px]">Priya pushed 2 commits to <span className="font-mono">main</span></p>
              <Button size="sm" variant="outline" className="mt-2 h-7 w-full bg-panel" disabled={pending} onClick={() => start(async () => { await pullFromGitHub(ws.project.id); toast.success("Pulled 2 commits", { description: "No conflicts. Rehearsals still pass." }); router.refresh(); })}>
                {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Pull into the blueprint
              </Button>
            </div>
          )}
          <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
            <Check className="mt-0.5 size-3 shrink-0 text-read" />
            {ciUntouched ? "Your CI is untouched. Prod AI runs every rehearsal before it opens a pull request." : "CI type-checks and builds each pull request. Prod AI runs every rehearsal before it opens one."}
          </p>
        </div>
      )}
      <div className="mt-6 border-t border-hairline pt-4">
        <p className="text-[12px] font-medium text-muted-foreground">No lock-in</p>
        <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => exportBundle()}><Download /> {pr ? `Download PR #${pr.number} files` : "Download all source"}</Button>
        <p className="mt-2 text-[11px] text-faint">{pr ? `Only the new ${pr.root}/ folder: plain YAML, Markdown and thin wrappers. Delete it and your repo is exactly as it was.` : "Standard Next.js, Postgres and agent files. Runs without Prod AI."}</p>
      </div>
      {ws.checkpoints[0] && <p className="mt-6 text-[11px] text-faint">Last save point <TimeAgo iso={ws.checkpoints[0].created_at} /></p>}
    </aside>
  );
}
