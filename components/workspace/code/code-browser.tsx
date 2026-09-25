"use client";
import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronRight, CircleCheck, Copy, Download, ExternalLink, FileCode2, Folder, GitBranch, GitPullRequest, Loader2, RefreshCw, Terminal } from "lucide-react";
import type { Blueprint } from "@/lib/blueprint/schema";
import type { CheckpointMeta, WorkOrderRow } from "@/lib/db/types";
import { generateFiles } from "@/lib/codegen/files";
import { diffFiles } from "@/lib/codegen/diff";
import type { GeneratedFile } from "@/lib/codegen/types";
import { CodeView } from "@/components/arch/code-view";
import { Segmented } from "@/components/arch/segmented";
import { Button } from "@/components/ui/button";
import { GitHubMark } from "@/components/brand/logo";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TimeAgo } from "@/components/time-ago";
import { connectGitHub, pullFromGitHub } from "@/lib/actions/github";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";

type Tree = { name: string; path: string; children?: Tree[]; file?: GeneratedFile };

function buildTree(files: GeneratedFile[]): Tree[] {
  const root: Tree = { name: "", path: "", children: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    parts.forEach((p, i) => {
      const path = parts.slice(0, i + 1).join("/");
      if (i === parts.length - 1) node.children!.push({ name: p, path, file: f });
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

export function CodeBrowser({ compare, workOrders }: { compare: { from: { meta: CheckpointMeta; blueprint: Blueprint } | null; to: { meta: CheckpointMeta; blueprint: Blueprint } | null }; workOrders: WorkOrderRow[] }) {
  const ws = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const files = useMemo(() => generateFiles(ws.blueprint), [ws.blueprint]);
  const tree = useMemo(() => buildTree(files), [files]);
  const [mode, setMode] = useState<"files" | "changes">(params.get("compare") ? "changes" : "files");
  const [active, setActive] = useState(params.get("file") ?? files.find((f) => f.path.startsWith("agents/"))?.path ?? files[0].path);
  const [openDirs, setOpenDirs] = useState<Set<string>>(() => new Set(["agents", "app", "app/(app)", ...files.filter((f) => f.path === active).map((f) => f.path.split("/").slice(0, -1).join("/"))]));
  const file = files.find((f) => f.path === active) ?? files[0];
  const diffs = useMemo(() => (compare.from && compare.to ? diffFiles(generateFiles(compare.from.blueprint), generateFiles(compare.to.blueprint)) : []), [compare]);

  const setCompare = (key: "from" | "to", id: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set(key, id);
    sp.set("compare", "1");
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[260px] shrink-0 flex-col border-r border-hairline max-md:hidden">
        <div className="px-3 py-2.5">
          <Segmented ariaLabel="Code view" value={mode} onChange={setMode} className="w-full [&>button]:flex-1 [&>button]:justify-center" options={[{ value: "files", label: `Files · ${files.length}` }, { value: "changes", label: "Changes" }]} />
        </div>
        {mode === "files" ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 font-mono text-[12px]">
            <TreeView nodes={tree} depth={0} active={active} onOpen={setActive} openDirs={openDirs} toggle={(p) => setOpenDirs((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; })} />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            <label className="micro-label">From</label>
            <select value={compare.from?.meta.id ?? ""} onChange={(e) => setCompare("from", e.target.value)} className="mt-1 h-8 w-full rounded-md border border-hairline bg-deep px-2 text-[12px]">
              {ws.checkpoints.map((c) => <option key={c.id} value={c.id}>#{c.seq} {c.label}</option>)}
            </select>
            <label className="micro-label mt-3 block">To</label>
            <select value={compare.to?.meta.id ?? ""} onChange={(e) => setCompare("to", e.target.value)} className="mt-1 h-8 w-full rounded-md border border-hairline bg-deep px-2 text-[12px]">
              {ws.checkpoints.map((c) => <option key={c.id} value={c.id}>#{c.seq} {c.label}</option>)}
            </select>
            <ul className="mt-4 space-y-1">
              {diffs.map((d) => (
                <li key={d.path}>
                  <a href={`#diff-${d.path}`} className="flex items-center gap-2 rounded-md px-2 py-1 font-mono text-[11.5px] hover:bg-raised">
                    <span className={cn("size-1.5 shrink-0 rounded-full", d.status === "added" ? "bg-read" : d.status === "removed" ? "bg-ask" : "bg-amber")} />
                    <span className="min-w-0 flex-1 truncate">{d.path}</span>
                    <span className="text-read">+{d.additions}</span>
                    <span className="text-ask">−{d.deletions}</span>
                  </a>
                </li>
              ))}
              {diffs.length === 0 && <li className="px-2 py-4 text-center text-[12px] text-muted-foreground">No differences between these save points.</li>}
            </ul>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {mode === "files" ? (
          <>
            <div className="flex items-center gap-2 border-b border-hairline px-4 py-2">
              <FileCode2 className="size-3.5 text-muted-foreground" />
              <span className="truncate font-mono text-[12px]">{file.path}</span>
              {file.objectRef && (
                <button onClick={() => ws.select(file.objectRef!)} className="ml-2 rounded-full border border-hairline px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">Open in inspector</button>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                <Button size="sm" variant="ghost" className="h-7" onClick={() => { void navigator.clipboard.writeText(file.content); toast.success("Copied"); }}><Copy /> Copy</Button>
                <OpenIn />
              </div>
            </div>
            <CodeView code={file.content} lang={file.lang} className="min-h-0 flex-1" />
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {compare.from && compare.to && (
              <p className="mb-3 text-[12.5px] text-muted-foreground">
                Save point #{compare.from.meta.seq} “{compare.from.meta.label}” → #{compare.to.meta.seq} “{compare.to.meta.label}” · {diffs.length} file{diffs.length === 1 ? "" : "s"} changed
              </p>
            )}
            <div className="space-y-4">
              {diffs.map((d) => (
                <section key={d.path} id={`diff-${d.path}`} className="overflow-hidden rounded-xl border border-hairline">
                  <header className="flex items-center gap-2 border-b border-hairline bg-panel px-3 py-2 font-mono text-[12px]">
                    <span className="truncate">{d.path}</span>
                    <span className="ml-auto text-read">+{d.additions}</span>
                    <span className="text-ask">−{d.deletions}</span>
                  </header>
                  <div className="code-face overflow-x-auto py-1 text-[12px] leading-[1.6]">
                    {d.hunks.map((h, hi) => (
                      <div key={hi}>
                        <div className="px-3 py-0.5 text-change/80">{h.header}</div>
                        {h.lines.map((l, li) => (
                          <div key={li} className={cn("whitespace-pre px-3", l.startsWith("+") ? "bg-read/10 text-read" : l.startsWith("-") ? "bg-ask/10 text-ask" : "text-foreground/60")}>{l || " "}</div>
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

      <GitHubPanel workOrders={workOrders} />
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
            <button onClick={() => onOpen(n.path)} className={cn("flex w-full items-center gap-1.5 truncate rounded px-1 py-0.5 text-left", n.path === active ? "bg-amber-soft text-amber" : "text-foreground/80 hover:bg-raised")} style={{ paddingLeft: depth * 12 + 20 }}>
              <span className="truncate">{n.name}</span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

function OpenIn() {
  const ws = useWorkspace();
  const repo = ws.project.settings.github?.repo;
  const copyCmd = (cmd: string, label: string) => {
    void navigator.clipboard.writeText(cmd);
    toast.success(`${label} command copied`, { description: cmd });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-7">Open in <ChevronDown /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onSelect={() => copyCmd(`cursor ${repo ? `https://github.com/${repo}` : "."}`, "Cursor")}><ExternalLink /> Cursor</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => copyCmd(`git clone https://github.com/${repo ?? "you/app"} && cd ${(repo ?? "you/app").split("/")[1]} && claude`, "Claude Code")}><Terminal /> Claude Code</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => copyCmd(`code ${repo ? `https://github.com/${repo}` : "."}`, "VS Code")}><ExternalLink /> VS Code</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => copyCmd("npx @architect/cli sync --watch", "Architect CLI")}><RefreshCw /> Sync with your editor (CLI)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GitHubPanel({ workOrders }: { workOrders: WorkOrderRow[] }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const gh = ws.project.settings.github;
  const changes = workOrders.filter((w) => w.kind === "change" && (w.status === "done" || w.status === "proposed")).slice(0, 5);

  function exportBundle() {
    const all = generateFiles(ws.blueprint);
    const text = all.map((f) => `# ===== ${f.path} =====\n${f.content}`).join("\n\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ws.blueprint.meta.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-source.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <aside aria-label="GitHub" className="w-[290px] shrink-0 overflow-y-auto border-l border-hairline p-4 max-xl:hidden">
      <p className="flex items-center gap-2 text-[13px] font-semibold"><GitHubMark /> Your code on GitHub</p>
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
          <div className="rounded-lg border border-hairline bg-deep/60 p-2.5">
            <p className="truncate font-mono text-[12px]">{gh.repo}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><GitBranch className="size-3" />main · two-way sync on · sandbox</p>
          </div>
          <div>
            <p className="micro-label">Changes for review</p>
            <ul className="mt-2 space-y-1.5">
              {changes.length === 0 && <li className="text-[12px] text-muted-foreground">Your next approved Work Order opens one here.</li>}
              {changes.map((w, i) => (
                <li key={w.id} className="rounded-lg border border-hairline p-2">
                  <p className="flex items-start gap-1.5 text-[12px]">
                    <GitPullRequest className={cn("mt-0.5 size-3 shrink-0", w.status === "done" ? "text-fix" : "text-read")} />
                    <span className="min-w-0 flex-1 leading-snug">{w.proposal?.summary ?? w.request}</span>
                  </p>
                  <p className="mt-1 flex items-center gap-2 pl-4 text-[11px] text-muted-foreground">
                    <span className="font-mono">#{changes.length - i + 11}</span>
                    <span className="inline-flex items-center gap-1 text-read"><CircleCheck className="size-3" />rehearsals passed</span>
                    <span>{w.status === "done" ? "merged" : "open"}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-change/25 bg-change/[0.06] p-2.5">
            <p className="text-[12px]">Priya pushed 2 commits to <span className="font-mono">main</span></p>
            <Button size="sm" variant="outline" className="mt-2 h-7 w-full" disabled={pending} onClick={() => start(async () => { await pullFromGitHub(ws.project.id); toast.success("Pulled 2 commits", { description: "No conflicts. Rehearsals still pass." }); router.refresh(); })}>
              {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Pull into the blueprint
            </Button>
          </div>
          <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><Check className="size-3 text-read" />CI runs every rehearsal on each pull request</p>
        </div>
      )}
      <div className="mt-6 border-t border-hairline pt-4">
        <p className="micro-label">No lock-in</p>
        <Button variant="outline" size="sm" className="mt-2 w-full" onClick={exportBundle}><Download /> Download all source</Button>
        <p className="mt-2 text-[11px] text-faint">Standard Next.js, Postgres and agent files. Runs without Architect.</p>
      </div>
      {ws.checkpoints[0] && <p className="mt-6 text-[11px] text-faint">Last save point <TimeAgo iso={ws.checkpoints[0].created_at} /></p>}
    </aside>
  );
}
