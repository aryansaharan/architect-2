import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProject } from "@/lib/db/queries";
import { fetchRaw, fetchRepo } from "@/lib/import/github";
import { MAX_TREE, coverageFolders, isRepoRef, type ImportReportWithTree, type RepoSnapshot } from "@/lib/import/snapshot";
import cached from "@/lib/import/cached.json";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|mp4|mov|woff2?|ttf|otf|eot|jar|pyc|so|dylib|exe|bin|tsbuildinfo)$/i;

/**
 * An imported project's repository, as it really is.
 *   GET ?project=<id>              → RepoSnapshot (the file tree stored at import)
 *   GET ?project=<id>&path=<file>  → { content } read from GitHub, never modified
 * Projects imported before trees were stored get theirs fetched once and saved.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const url = new URL(req.url);
  const projectId = url.searchParams.get("project") ?? "";
  const path = url.searchParams.get("path");
  const supa = await createClient();
  // Row-level security: only the owner can read the project.
  const project = await getProject(supa, projectId).catch(() => null);
  const report = project?.import_report as ImportReportWithTree | null | undefined;
  if (!project || project.source !== "import" || !report?.repo) return Response.json({ error: "Not an imported project" }, { status: 404 });
  const { owner, name, defaultBranch: branch } = report.repo;
  if (!isRepoRef(owner, name)) return Response.json({ error: "Unknown repository" }, { status: 400 });

  if (path !== null) {
    if (!path || path.length > 300 || path.startsWith("/") || path.split("/").includes("..")) return Response.json({ error: "Bad path" }, { status: 400 });
    if (report.tree && !report.tree.includes(path)) return Response.json({ error: "That file isn't in the repository" }, { status: 404 });
    if (BINARY.test(path)) return Response.json({ error: "binary" }, { status: 415 });
    const content = await fetchRaw({ owner, name }, branch, path, 120_000);
    if (content === null) return Response.json({ error: "Couldn't read that file from GitHub just now" }, { status: 502 });
    return Response.json({ content, truncated: content.length >= 120_000 }, { headers: { "Cache-Control": "private, max-age=300" } });
  }

  const base = { owner, name, branch, url: report.repo.url || `https://github.com/${owner}/${name}`, folders: coverageFolders(report), fileCount: report.fileCount, frameworks: report.frameworks };
  const snapshot = (paths: string[] | null, source: RepoSnapshot["source"]): RepoSnapshot => ({ ...base, paths, source, truncated: report.truncated || (paths !== null && paths.length < report.fileCount) });

  if (report.tree?.length) return Response.json(snapshot(report.tree, "import"));

  // Imported before trees were stored: read it from GitHub once and keep it on the project.
  try {
    const { tree } = await fetchRepo({ owner, name, branch });
    const paths = tree.tree.filter((t) => t.type === "blob").map((t) => t.path).slice(0, MAX_TREE);
    await supa.from("projects").update({ import_report: { ...report, tree: paths } }).eq("id", project.id);
    return Response.json(snapshot(paths, "github"));
  } catch {
    const hit = (cached as Record<string, ImportReportWithTree>)[`${owner}/${name}`.toLowerCase()];
    if (hit?.tree?.length) return Response.json(snapshot(hit.tree, "cached"));
    return Response.json(snapshot(null, "summary"));
  }
}
