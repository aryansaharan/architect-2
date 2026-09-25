import { structuredPatch } from "diff";
import type { GeneratedFile } from "./types";

export type FileDiff = {
  path: string;
  status: "added" | "removed" | "modified";
  additions: number;
  deletions: number;
  hunks: { header: string; lines: string[] }[];
};

/** Unified diffs between two generated file sets (e.g. two save points). */
export function diffFiles(before: GeneratedFile[], after: GeneratedFile[]): FileDiff[] {
  const a = new Map(before.map((f) => [f.path, f.content]));
  const b = new Map(after.map((f) => [f.path, f.content]));
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort();
  const out: FileDiff[] = [];
  for (const path of paths) {
    const x = a.get(path);
    const y = b.get(path);
    if (x === y) continue;
    const patch = structuredPatch(path, path, x ?? "", y ?? "", "", "", { context: 3 });
    let additions = 0;
    let deletions = 0;
    const hunks = patch.hunks.map((h) => {
      h.lines.forEach((l) => {
        if (l.startsWith("+")) additions++;
        else if (l.startsWith("-")) deletions++;
      });
      return { header: `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`, lines: h.lines };
    });
    out.push({ path, status: x === undefined ? "added" : y === undefined ? "removed" : "modified", additions, deletions, hunks });
  }
  return out;
}

export function diffToText(d: FileDiff[]): string {
  return d.map((f) => [`--- a/${f.path}`, `+++ b/${f.path}`, ...f.hunks.flatMap((h) => [h.header, ...h.lines])].join("\n")).join("\n");
}
