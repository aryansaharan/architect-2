import type { ImportReport } from "@/lib/db/types";

/** Most files kept from an imported repository's tree (paths only). */
export const MAX_TREE = 2500;

/**
 * The import report as stored in projects.import_report. `tree` is every file
 * path in the repository at import time, so the Code tab can show the repo as
 * it really is. Older imports have no tree; the snapshot route backfills it.
 */
export type ImportReportWithTree = ImportReport & { tree?: string[] };

/** What the Code tab needs to show an imported repository, untouched. */
export type RepoSnapshot = {
  owner: string;
  name: string;
  branch: string;
  url: string;
  /** Every file path, or null when only the folder summary is known. */
  paths: string[] | null;
  /** Top-level folders from the stack report, used when `paths` is null. */
  folders: string[];
  fileCount: number;
  truncated: boolean;
  frameworks: ImportReport["frameworks"];
  /** Where the tree came from: stored at import, fetched now, the cached examples, or the folder summary. */
  source: "import" | "github" | "cached" | "summary";
};

/** Cleans a client-sent tree before it is stored: strings only, sane lengths, capped. */
export function cleanTree(tree: unknown): string[] | undefined {
  if (!Array.isArray(tree)) return undefined;
  const out = tree.filter((p): p is string => typeof p === "string" && p.length > 0 && p.length <= 300 && !p.startsWith("/") && !p.split("/").includes("..")).slice(0, MAX_TREE);
  return out.length ? out : undefined;
}

/** Folder names from the report's coverage map ("python-backend/ · 11 files" → "python-backend/"). */
export function coverageFolders(report: Pick<ImportReport, "coverage">): string[] {
  const all = [...report.coverage.understood, ...report.coverage.unsure, ...report.coverage.ignored];
  return [...new Set(all.map((s) => s.split(" · ")[0]).filter((s) => s.endsWith("/")))];
}

export function isRepoRef(owner: string, name: string): boolean {
  return /^[\w.-]{1,100}$/.test(owner) && /^[\w.-]{1,100}$/.test(name) && owner !== ".." && name !== "..";
}
