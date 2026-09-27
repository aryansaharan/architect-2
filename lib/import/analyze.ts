import "server-only";
import { fetchRaw, fetchRepo, GitHubError, parseRepo, type RepoRef } from "./github";
import { detect } from "./detect";
import { agentSourceCandidates, detectAgents, withAgentEvidence } from "./agents";
import { cleanDeep } from "@/lib/text";
import { MAX_TREE, type ImportReportWithTree } from "./snapshot";
import cached from "./cached.json";

const MANIFEST = /(^|\/)(package\.json|requirements[\w-]*\.txt|pyproject\.toml|setup\.py|Pipfile|tsconfig\.json|langgraph\.json)$/;

export type AnalyzeResult = { ok: true; report: ImportReportWithTree } | { ok: false; error: string; code: "invalid" | "not_found" | "rate_limited" | "network" };

export async function analyzeRepo(input: string): Promise<AnalyzeResult> {
  const ref = parseRepo(input);
  if (!ref) return { ok: false, error: "That doesn't look like a GitHub repository. Try github.com/owner/repo.", code: "invalid" };
  try {
    return { ok: true, report: await analyze(ref) };
  } catch (e) {
    const key = `${ref.owner}/${ref.name}`.toLowerCase();
    const hit = (cached as Record<string, ImportReportWithTree>)[key];
    if (hit) return { ok: true, report: { ...hit, cached: true } };
    if (e instanceof GitHubError && e.status === 404) return { ok: false, error: "We couldn't find that repository. It may be private. Connect GitHub to import private repos.", code: "not_found" };
    if (e instanceof GitHubError && e.rateLimited) return { ok: false, error: "GitHub's public rate limit is used up for the moment. Try one of the example repos, or again in a few minutes.", code: "rate_limited" };
    return { ok: false, error: "We couldn't reach GitHub just now. Try again in a moment.", code: "network" };
  }
}

async function analyze(ref: RepoRef): Promise<ImportReportWithTree> {
  const { meta, branch, tree } = await fetchRepo(ref);
  const blobs = tree.tree.filter((t) => t.type === "blob").map((t) => t.path);
  const paths = blobs.slice(0, 5000);
  const manifestPaths = paths.filter((p) => MANIFEST.test(p) && p.split("/").length <= 3 && !/node_modules|examples?\/.*\/.*\//.test(p)).slice(0, 12);
  const readmePath = paths.find((p) => /^readme\.md$/i.test(p));
  const toFetch = [...manifestPaths, ...(readmePath ? [readmePath] : []), ...paths.filter((p) => /(^|\/)\.env\.example$/.test(p)).slice(0, 1)];
  const texts = await Promise.all(toFetch.map((p) => fetchRaw(ref, branch, p)));
  const manifests: Record<string, string> = {};
  toFetch.forEach((p, i) => {
    if (texts[i]) manifests[p] = texts[i]!;
  });
  const d = detect(paths, manifests);
  // Then the agents themselves: read from the source files most likely to define them (at most 10 more raw
  // fetches, which don't count against GitHub's API limit). Nothing is invented: unread means unlisted.
  const { picked, candidates } = agentSourceCandidates(paths, d.frameworks, manifests);
  const sources = await Promise.all(picked.map((p) => fetchRaw(ref, branch, p)));
  const files: Record<string, string> = {};
  picked.forEach((p, i) => {
    if (sources[i]) files[p] = sources[i]!;
  });
  const { agents, toolCount } = detectAgents(files, manifests);
  const frameworks = withAgentEvidence(d.frameworks, agents);
  const readme = readmePath ? manifests[readmePath] ?? "" : "";
  return {
    repo: {
      owner: ref.owner,
      name: ref.name,
      url: meta.html_url,
      description: meta.description,
      defaultBranch: branch,
      stars: meta.stargazers_count,
      language: meta.language,
      license: meta.license?.spdx_id ?? null,
      pushedAt: meta.pushed_at,
    },
    stack: d.stack,
    frameworks,
    tests: d.tests,
    conventions: d.conventions,
    coverage: d.coverage,
    fileCount: blobs.length,
    truncated: tree.truncated || blobs.length > 5000,
    cached: false,
    readmeExcerpt: readme.replace(/<[^>]+>/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").slice(0, 6000),
    // Every file path, kept so the Code tab can show the repository exactly as it is.
    tree: blobs.slice(0, MAX_TREE),
    agents: cleanDeep(agents),
    agentScan: { filesRead: Object.keys(files), candidates, toolCount },
  };
}
