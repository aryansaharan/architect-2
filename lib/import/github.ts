import "server-only";

export type RepoRef = { owner: string; name: string; branch?: string; path?: string };

/** GitHub owner and repo names: letters, digits, "-", "_" and ".", and never a path segment like "..". */
const validName = (s: string) => /^[\w.-]{1,100}$/.test(s) && !/^\.+$/.test(s);

export function parseRepo(input: string): RepoRef | null {
  const s = input.trim().slice(0, 300).replace(/\.git$/, "").replace(/\/+$/, "");
  const url = s.match(/github\.com[/:]([\w.-]+)\/([\w.-]+)(?:\/tree\/([\w./-]+?))?(?:\/(.*))?$/i);
  const short = url ? null : s.match(/^([\w.-]+)\/([\w.-]+)$/);
  const m = url ?? short;
  if (!m || !validName(m[1]) || !validName(m[2])) return null;
  const branch = url?.[3]?.split("/")[0];
  return { owner: m[1], name: m[2], branch: branch && validName(branch) ? branch : undefined };
}

export type RepoMeta = {
  default_branch: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  license: { spdx_id: string | null } | null;
  pushed_at: string | null;
  html_url: string;
  size: number;
};

export class GitHubError extends Error {
  constructor(message: string, public status: number, public rateLimited = false) {
    super(message);
  }
}

function headers(): HeadersInit {
  const h: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "prod-ai-prototype" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (res.status === 404) throw new GitHubError("Repository not found or private", 404);
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    throw new GitHubError("GitHub rate limit reached", res.status, remaining === "0" || res.status === 429);
  }
  if (!res.ok) throw new GitHubError(`GitHub returned ${res.status}`, res.status);
  return (await res.json()) as T;
}

export async function fetchRepo(ref: RepoRef) {
  const meta = await gh<RepoMeta>(`/repos/${ref.owner}/${ref.name}`);
  const branch = ref.branch ?? meta.default_branch;
  const tree = await gh<{ tree: { path: string; type: "blob" | "tree"; size?: number }[]; truncated: boolean }>(`/repos/${ref.owner}/${ref.name}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  return { meta, branch, tree };
}

/** raw.githubusercontent.com does not count against the API rate limit. */
export async function fetchRaw(ref: RepoRef, branch: string, path: string, maxBytes = 60_000): Promise<string | null> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${ref.owner}/${ref.name}/${encodeURIComponent(branch)}/${path.split("/").map(encodeURIComponent).join("/")}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, maxBytes);
  } catch {
    return null;
  }
}
