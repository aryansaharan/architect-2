/**
 * Reads the House Rules an owner signed at import (plain sentences, see
 * defaultHouseRules in ./detect.ts) into a policy that code can enforce.
 * Pure: shared by the Code tab (what a pull request may add) and tests.
 */

export type HouseRulePolicy = {
  /** Folders no change may add files under, each with the rule that protects it. */
  protectedDirs: { dir: string; rule: string }[];
  /** Rule that puts CI, containers and database migrations off limits, if signed. */
  infra: string | null;
  /** "Keep agents in X: wrap them, don't rewrite them." */
  wrapAgents: string | null;
  /** "Never change the framework (...) without asking." */
  keepFramework: string | null;
  /** "Every change ships as a pull request, never push to main." */
  pullRequestsOnly: string | null;
  /** "Run the existing tests (...) before opening a pull request." */
  tests: string | null;
};

const TOUCH = /\b(?:don['’]?t|do not|never)\s+(?:touch|edit|change|modify|write to)\s+(.+?)(?:\s+(?:until|unless|without)\b.*)?[.!]?$/i;

/** Paths that count as infrastructure: CI, containers, deploy config and database migrations. */
export function isInfraPath(path: string): boolean {
  return /^(\.github|\.gitlab|\.circleci|infra|infrastructure|terraform|k8s|helm|deploy|supabase)\//i.test(path) || /(^|\/)(Dockerfile[\w.-]*|docker-compose[\w.-]*\.ya?ml|\.gitlab-ci\.ya?ml|vercel\.json|fly\.toml|render\.ya?ml|Procfile)$/i.test(path);
}

export function houseRulePolicy(rules: string[]): HouseRulePolicy {
  const policy: HouseRulePolicy = { protectedDirs: [], infra: null, wrapAgents: null, keepFramework: null, pullRequestsOnly: null, tests: null };
  for (const raw of rules) {
    const rule = raw.trim();
    if (!rule) continue;
    if (/\bwrap\b[^.]*\b(?:don['’]?t|do not|never)\s+rewrite\b|\b(?:don['’]?t|do not|never)\s+rewrite\b/i.test(rule)) policy.wrapAgents ??= rule;
    if (/\b(?:never|don['’]?t|do not)\s+change\s+the\s+framework\b|\bkeep\s+the\s+framework\b/i.test(rule)) policy.keepFramework ??= rule;
    if (/\bpull request\b|\bnever push to main\b/i.test(rule) && !/\brun\b.*\btests?\b/i.test(rule)) policy.pullRequestsOnly ??= rule;
    if (/\brun\b.*\btests?\b/i.test(rule)) policy.tests ??= rule;
    const touch = rule.match(TOUCH);
    if (!touch) continue;
    for (const part of touch[1].split(/,|\bor\b|\band\b/i).map((p) => p.trim()).filter(Boolean)) {
      if (/infrastructure|\binfra\b|\bci\b|deploy/i.test(part)) policy.infra ??= rule;
      const dir = part.match(/^\/?([\w.@-]+(?:\/[\w.@-]+)*)\/?$/)?.[1];
      // A path looks like "python-backend/", ".github/" or "/legacy": a slash, or a leading dot.
      if (dir && (/\//.test(part) || part.startsWith("."))) policy.protectedDirs.push({ dir: `${dir.replace(/\/+$/, "")}/`, rule });
    }
  }
  return policy;
}

/** The signed rule a new file at `path` would break, or null when the file may be added. */
export function ruleBlocking(policy: HouseRulePolicy, path: string): string | null {
  const dir = policy.protectedDirs.find((d) => path === d.dir.slice(0, -1) || path.startsWith(d.dir));
  if (dir) return dir.rule;
  if (policy.infra && isInfraPath(path)) return policy.infra;
  return null;
}
