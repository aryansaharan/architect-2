"use client";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import type { FileDiff } from "@/lib/codegen/diff";
import type { GeneratedFile } from "@/lib/codegen/types";
import { Segmented } from "@/components/arch/segmented";
import { NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";

/** The pieces the Code tab shares between business apps (generated files) and code apps (the real files). */

/** The highlighter's language for a path. CSS reads well enough with the script colours (comments, strings, numbers). */
const EXT_LANG: Record<string, GeneratedFile["lang"]> = { ts: "ts", tsx: "tsx", js: "ts", jsx: "tsx", mjs: "ts", cjs: "ts", py: "py", yml: "yaml", yaml: "yaml", md: "md", mdx: "md", json: "json", sql: "sql", sh: "sh", toml: "toml" };
export function langOf(path: string, opts: { css?: boolean } = {}): GeneratedFile["lang"] {
  const base = path.split("/").pop() ?? "";
  if (/^\.env/.test(base)) return "env";
  const ext = base.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "css" && opts.css) return "ts";
  return EXT_LANG[ext] ?? "txt";
}

export type Tree = { name: string; path: string; children?: Tree[] };

export function buildTree(paths: string[]): Tree[] {
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

/** Diff lines: additions in the success green, removals in faint ink. Blue and green keep their access meanings. */
export const DIFF = {
  add: "border-ok bg-brand-soft text-foreground",
  del: "border-foreground/30 bg-foreground/[0.04] text-muted-foreground",
  same: "border-transparent text-foreground/70",
};
export const DIFF_DOT = { added: "bg-ok", removed: "bg-foreground/30", modified: "bg-muted-foreground" } as const;

/** A version's name as the Versions menu writes it. */
export const versionName = (label: string) => label.replace(/^Went live$/, "Published").replace(/^Restored #(\d+) · /, "Restored version $1 · ");

/**
 * Which version to compare: a small choice when there are two to four (one tab stop, arrow keys move),
 * a list drawn like the inputs when there are more.
 */
export function VersionPicker({ which, value, onChange, compact, className }: { which: "from" | "to"; value: string; onChange: (id: string) => void; compact?: boolean; className?: string }) {
  const ws = useWorkspace();
  const list = ws.checkpoints;
  const title = which === "from" ? "From" : "To";
  if (list.length >= 2 && list.length <= 4) {
    const options = [...list].sort((a, b) => a.seq - b.seq).map((c) => ({
      value: c.id,
      title: `Version ${c.seq} · ${versionName(c.label)}`,
      label: compact ? <><span className="sr-only">Version </span>v{c.seq}</> : <span className="min-w-0 truncate">Version {c.seq} · {versionName(c.label)}</span>,
    }));
    return (
      <div className={cn(compact ? "flex items-center gap-2" : "", className)}>
        <p className={cn("text-meta font-medium text-muted-foreground", !compact && "mb-1")}>{title}</p>
        <Segmented ariaLabel={`${title} version`} value={value} onChange={onChange} options={options} className={cn(!compact && "flex w-full flex-col items-stretch [&>button]:justify-start [&>button]:overflow-hidden")} />
      </div>
    );
  }
  return (
    <label className={cn("block", compact && "flex min-w-0 flex-1 items-center gap-2", className)}>
      <span className="text-meta font-medium text-muted-foreground">{title}</span>
      <NativeSelect aria-label={`${title} version`} value={value} onChange={(e) => onChange(e.target.value)} className={cn(!compact && "mt-1")}>
        {list.map((c) => <option key={c.id} value={c.id}>Version {c.seq} · {versionName(c.label)}</option>)}
      </NativeSelect>
    </label>
  );
}

export function TreeView({ nodes, depth, active, onOpen, openDirs, toggle }: { nodes: Tree[]; depth: number; active: string; onOpen: (p: string) => void; openDirs: Set<string>; toggle: (p: string) => void }) {
  return (
    <ul>
      {nodes.map((n) =>
        n.children ? (
          <li key={n.path}>
            <button onClick={() => toggle(n.path)} className="flex w-full items-center gap-1 rounded-sm px-1 py-0.5 text-left text-muted-foreground transition-colors duration-150 hover:text-foreground" style={{ paddingLeft: depth * 12 + 4 }} aria-expanded={openDirs.has(n.path)}>
              {openDirs.has(n.path) ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
              <Folder className="size-3 shrink-0" />
              <span className="truncate">{n.name}</span>
            </button>
            {openDirs.has(n.path) && <TreeView nodes={n.children} depth={depth + 1} active={active} onOpen={onOpen} openDirs={openDirs} toggle={toggle} />}
          </li>
        ) : (
          <li key={n.path}>
            <button onClick={() => onOpen(n.path)} aria-current={n.path === active ? "true" : undefined} className={cn("flex w-full items-center gap-1.5 truncate rounded-sm px-1 py-0.5 text-left transition-colors duration-150", n.path === active ? "bg-brand-soft text-brand ring-1 ring-brand/30" : "text-foreground/80 hover:bg-raised")} style={{ paddingLeft: depth * 12 + 20 }}>
              <span className="truncate">{n.name}</span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

/** The changed files, each with its additions and removals, linking to its diff below. */
export function DiffIndex({ diffs }: { diffs: FileDiff[] }) {
  return (
    <ul className="mt-4 space-y-0.5">
      {diffs.map((d) => (
        <li key={d.path}>
          <a href={`#diff-${d.path}`} className="flex items-center gap-2 rounded-sm px-2 py-1 text-badge transition-colors duration-150 hover:bg-raised">
            <span className={cn("size-1.5 shrink-0 rounded-full", DIFF_DOT[d.status as keyof typeof DIFF_DOT] ?? DIFF_DOT.modified)} title={d.status} />
            <span className="min-w-0 flex-1 truncate font-mono">{d.path}</span>
            <span className="tabular-nums text-ok">+{d.additions}</span>
            <span className="tabular-nums text-muted-foreground">−{d.deletions}</span>
          </a>
        </li>
      ))}
      {diffs.length === 0 && <li className="px-2 py-4 text-center text-meta text-muted-foreground">No differences between these versions.</li>}
    </ul>
  );
}

/** Each changed file's unified diff: additions in the success green, removals in faint ink. */
export function DiffSections({ diffs }: { diffs: FileDiff[] }) {
  return (
    <div className="space-y-4">
      {diffs.map((d) => (
        <section key={d.path} id={`diff-${d.path}`} className="overflow-hidden rounded-md border border-hairline">
          <header className="flex items-center gap-2 border-b border-hairline bg-panel px-3 py-2 text-badge">
            <span className="truncate font-mono">{d.path}</span>
            <span className="ml-auto tabular-nums text-ok">+{d.additions}</span>
            <span className="tabular-nums text-muted-foreground">−{d.deletions}</span>
          </header>
          <div className="code-face overflow-x-auto py-1 text-code">
            {d.hunks.map((h, hi) => (
              <div key={hi}>
                <div className="bg-deep px-3 py-0.5 text-muted-foreground">{h.header}</div>
                {h.lines.map((l, li) => (
                  <div key={li} className={cn("whitespace-pre border-l-2 px-3", l.startsWith("+") ? DIFF.add : l.startsWith("-") ? DIFF.del : DIFF.same)}>{l || " "}</div>
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
