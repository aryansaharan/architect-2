import type { BuildError, BuildResult } from "@/lib/code-apps/schema";

/**
 * What the studio needs to know about a code app's latest real build: whether it compiled, its hash
 * (the sandbox URL carries it) and its errors or warnings. Never the bundle itself: the sandbox page
 * (/run/p/[id]) serves that, so the project page stays light.
 */
export type CodeBuildInfo = { ok: boolean; at: string; hash: string; errors: BuildError[]; warnings: BuildError[] };

export function buildInfo(b: BuildResult | null | undefined): CodeBuildInfo | null {
  if (!b || typeof b !== "object" || typeof b.hash !== "string") return null;
  return b.ok
    ? { ok: true, at: b.at, hash: b.hash, errors: [], warnings: Array.isArray(b.warnings) ? b.warnings.slice(0, 20) : [] }
    : { ok: false, at: b.at, hash: b.hash, errors: Array.isArray(b.errors) ? b.errors.slice(0, 20) : [], warnings: [] };
}
