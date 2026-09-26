import type { ImportReport } from "@/lib/db/types";

type Manifests = Record<string, string>;

const FRAMEWORK_SIGNALS: { id: string; label: string; deps: RegExp; paths?: RegExp }[] = [
  { id: "langgraph", label: "LangGraph", deps: /(^|["'\s])(@langchain\/langgraph|langgraph)(["'\s=<>~^]|$)/m, paths: /(^|\/)(graph|langgraph)[\w-]*\.(py|ts)$/ },
  { id: "crewai", label: "CrewAI", deps: /(^|["'\s])crewai(\[[\w,]+\])?(["'\s=<>~^]|$)/m, paths: /(^|\/)crew[\w-]*\.py$|(^|\/)config\/(agents|tasks)\.ya?ml$/ },
  { id: "openai_agents", label: "OpenAI Agents SDK", deps: /(^|["'\s])(openai-agents|@openai\/agents)(["'\s=<>~^]|$)/m },
  { id: "google_adk", label: "Google ADK", deps: /(^|["'\s])(google-adk|@google\/adk)(["'\s=<>~^]|$)/m },
  { id: "lyzr", label: "Lyzr", deps: /(^|["'\s])(lyzr[\w-]*|@lyzr\/[\w-]+)(["'\s=<>~^]|$)/m, paths: /(^|\/)lyzr[\w/-]*\.(py|ts)$/i },
  { id: "mastra", label: "Mastra", deps: /(^|["'\s])@mastra\/core(["'\s]|$)/m, paths: /(^|\/)mastra\// },
  { id: "ai_sdk", label: "Vercel AI SDK", deps: /"(ai|@ai-sdk\/[\w-]+)"\s*:/m },
  { id: "autogen", label: "AutoGen", deps: /(^|["'\s])(pyautogen|autogen-agentchat|autogen)(["'\s=<>~^]|$)/m },
  { id: "pydantic_ai", label: "Pydantic AI", deps: /(^|["'\s])pydantic-ai(["'\s=<>~^]|$)/m },
  { id: "langchain", label: "LangChain", deps: /(^|["'\s])(langchain|@langchain\/core|langchain-core)(["'\s=<>~^]|$)/m },
];

const STACK_SIGNALS: { label: string; re: RegExp; file?: RegExp }[] = [
  { label: "Next.js", re: /"next"\s*:/ },
  { label: "React", re: /"react"\s*:/ },
  { label: "Vue", re: /"vue"\s*:/ },
  { label: "Svelte", re: /"svelte"\s*:/ },
  { label: "Express", re: /"express"\s*:/ },
  { label: "FastAPI", re: /(^|["'\s])fastapi/m },
  { label: "Django", re: /(^|["'\s])django(["'\s=<>~^]|$)/im },
  { label: "Flask", re: /(^|["'\s])flask(["'\s=<>~^]|$)/im },
  { label: "Streamlit", re: /(^|["'\s])streamlit/m },
  { label: "Prisma", re: /"prisma"\s*:|"@prisma\/client"/ },
  { label: "Drizzle", re: /"drizzle-orm"\s*:/ },
  { label: "Supabase", re: /"@supabase\/[\w-]+"\s*:|(^|["'\s])supabase(["'\s=<>~^]|$)/m },
  { label: "Tailwind CSS", re: /"tailwindcss"\s*:/ },
  { label: "TypeScript", re: /"typescript"\s*:/ },
  { label: "Pydantic", re: /(^|["'\s])pydantic(["'\s=<>~^]|$)/m },
  { label: "Docker", re: /$^/, file: /(^|\/)(Dockerfile|docker-compose\.ya?ml)$/ },
];

const IGNORED = /(^|\/)(node_modules|dist|build|\.next|\.git|\.venv|venv|__pycache__|coverage|\.turbo|vendor)(\/|$)|\.(lock|png|jpe?g|gif|webp|svg|ico|pdf|zip|mp4|woff2?|ttf|ipynb_checkpoints)$|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|uv\.lock)$/i;
const SOURCE = /\.(py|ts|tsx|js|jsx|go|rs|java|rb)$/;

export function detect(paths: string[], manifests: Manifests) {
  const all = Object.entries(manifests)
    .filter(([p]) => /package\.json$|requirements[\w-]*\.txt$|pyproject\.toml$|setup\.py$|Pipfile$/.test(p))
    .map(([, t]) => t)
    .join("\n");

  const frameworks: ImportReport["frameworks"] = [];
  for (const f of FRAMEWORK_SIGNALS) {
    const depHit = f.deps.test(all);
    const pathHit = f.paths ? paths.find((p) => f.paths!.test(p) && !IGNORED.test(p)) : undefined;
    if (depHit || pathHit) {
      const where = Object.entries(manifests).find(([p, t]) => /package\.json$|requirements|pyproject|setup\.py|Pipfile/.test(p) && f.deps.test(t))?.[0];
      frameworks.push({ id: f.id, label: f.label, evidence: [where ? `dependency in ${where}` : null, pathHit ? `file ${pathHit}` : null].filter(Boolean).join(" · ") });
    }
  }
  // Wonderwork's own agent format
  const gitAgent = paths.find((p) => /(^|\/)agent\.ya?ml$/.test(p) || /(^|\/)SOUL\.md$/.test(p));
  if (gitAgent) frameworks.push({ id: "gitagent", label: "GitAgent spec", evidence: `file ${gitAgent}` });

  const stack: ImportReport["stack"] = [];
  for (const s of STACK_SIGNALS) {
    const fileHit = s.file ? paths.find((p) => s.file!.test(p)) : undefined;
    if (s.re.test(all) || fileHit) stack.push({ label: s.label, evidence: fileHit ? `file ${fileHit}` : "dependency" });
  }
  const langs = new Map<string, number>();
  for (const p of paths) {
    const ext = p.match(/\.(py|ts|tsx|js|jsx|go|rs|java|rb)$/)?.[1];
    if (ext && !IGNORED.test(p)) langs.set(ext, (langs.get(ext) ?? 0) + 1);
  }

  const tests: string[] = [];
  if (/"(vitest|jest|@playwright\/test|mocha)"\s*:/.test(all)) tests.push(all.match(/"(vitest|jest|@playwright\/test|mocha)"\s*:/)![1]);
  if (/(^|["'\s])pytest/m.test(all) || paths.some((p) => /(^|\/)tests?\/.*\.py$|test_\w+\.py$/.test(p))) tests.push("pytest");
  if (paths.some((p) => p.startsWith(".github/workflows/"))) tests.push("GitHub Actions CI");

  const conventions: string[] = [];
  if (paths.some((p) => p.startsWith("src/"))) conventions.push("Code lives under src/");
  if (paths.some((p) => /^(src\/)?app\//.test(p)) && stack.some((s) => s.label === "Next.js")) conventions.push("Next.js App Router");
  if (paths.some((p) => /^(src\/)?pages\//.test(p)) && stack.some((s) => s.label === "Next.js")) conventions.push("Next.js Pages Router");
  if (manifests["tsconfig.json"]?.includes('"strict": true')) conventions.push("TypeScript strict mode");
  if (paths.some((p) => /(^|\/)\.env\.example$/.test(p))) conventions.push("Secrets documented in .env.example");
  if (paths.some((p) => /(^|\/)(eslint\.config\.\w+|\.eslintrc[\w.]*|ruff\.toml|\.ruff\.toml)$/.test(p)) || /\[tool\.ruff\]/.test(manifests["pyproject.toml"] ?? "")) conventions.push("Has a linter config: Wonderwork will follow it");
  if (paths.some((p) => /(^|\/)agents?\//.test(p))) conventions.push("Agents grouped in an agents/ folder");
  const topLang = [...langs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (topLang) conventions.push(`Mostly ${topLang === "py" ? "Python" : topLang === "ts" || topLang === "tsx" ? "TypeScript" : topLang === "js" || topLang === "jsx" ? "JavaScript" : topLang} (${langs.get(topLang)} files)`);

  // Coverage map: top-level (and second-level for big dirs) folders
  const dirs = new Map<string, string[]>();
  for (const p of paths) {
    const parts = p.split("/");
    const key = parts.length > 1 ? parts[0] : "(root)";
    if (!dirs.has(key)) dirs.set(key, []);
    dirs.get(key)!.push(p);
  }
  const understood: string[] = [];
  const unsure: string[] = [];
  const ignored: string[] = [];
  for (const [dir, files] of [...dirs.entries()].sort()) {
    const label = dir === "(root)" ? "root files" : `${dir}/`;
    if (files.every((f) => IGNORED.test(f)) || /^(\.github|\.vscode|\.idea|docs?|assets|public|static|images)$/i.test(dir)) {
      ignored.push(label);
      continue;
    }
    const src = files.filter((f) => SOURCE.test(f));
    const known = src.some((f) => FRAMEWORK_SIGNALS.some((s) => s.paths?.test(f))) || files.some((f) => /(package\.json|requirements|pyproject|agent\.ya?ml|README)/i.test(f)) || /^(app|src|agents?|lib|components|api|server|backend|frontend|tests?)$/i.test(dir);
    if (known) understood.push(`${label} · ${files.length} files`);
    else if (src.length) unsure.push(`${label} · ${src.length} source files, no known framework`);
    else ignored.push(label);
  }

  return { frameworks, stack, tests: [...new Set(tests)], conventions, coverage: { understood: understood.slice(0, 12), unsure: unsure.slice(0, 8), ignored: ignored.slice(0, 10) } };
}

export function defaultHouseRules(report: Pick<ImportReport, "stack" | "frameworks" | "coverage" | "tests">): string[] {
  const rules = [
    `Never change the framework${report.stack[0] ? ` (${report.stack.slice(0, 2).map((s) => s.label).join(" + ")})` : ""} without asking.`,
    "Every change ships as a pull request, never push to main.",
  ];
  if (report.frameworks.some((f) => f.id !== "ai_sdk" && f.id !== "langchain")) rules.push(`Keep agents in ${report.frameworks.filter((f) => f.id !== "ai_sdk").map((f) => f.label).slice(0, 2).join(" / ")}: wrap them, don't rewrite them.`);
  if (report.tests.length) rules.push(`Run the existing tests (${report.tests.join(", ")}) before opening a pull request.`);
  if (report.coverage.unsure.length) rules.push(`Don't touch ${report.coverage.unsure[0].split(" · ")[0]} until someone explains it.`);
  rules.push("Don't touch .github/ or infrastructure files.");
  return rules;
}

/**
 * Validates where an existing agent lives before it is added to a project
 * (Agents › Add agent). Shared by the dialog (inline error) and the server action.
 * Returns an error sentence, or null when the location is usable.
 */
export function agentLocationError(kind: "code" | "endpoint", location: string): string | null {
  const loc = location.trim();
  if (!loc) return kind === "code" ? "Paste a repository path." : "Paste the endpoint URL.";
  if (kind === "endpoint") {
    let url: URL;
    try {
      if (/\s/.test(loc)) throw new Error("spaces");
      url = new URL(loc);
    } catch {
      return "Enter a full URL starting with https:// or http://, like https://agents.acme.com/mcp/fraud-review.";
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return "The endpoint must start with https:// or http://.";
    if (!/^(localhost|[a-z0-9-]+(\.[a-z0-9-]+)+|\[[0-9a-f:]+\])$/i.test(url.hostname)) return "That URL is missing a real host name, like agents.acme.com.";
    return null;
  }
  if (/\s/.test(loc)) return "A repository path has no spaces, like github.com/acme/agents/tree/main/fraud_review.py.";
  const parts = loc.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split("/").filter(Boolean);
  if (parts.length < 2 || !parts.every((p) => /^[\w.@~+-]+$/.test(p))) return "Paste a repository path like github.com/acme/agents or github.com/acme/agents/tree/main/fraud_review.py.";
  return null;
}

const GENERIC_SEGMENT = /^(agents?|src|lib|app|apps|main|master|tree|blob|index|mcp|a2a|api|v\d+|http|https|www|examples?|packages?|python|py|ts|js|node|server|service|run|invoke)$/i;
const ACRONYMS: Record<string, string> = { ai: "AI", api: "API", crm: "CRM", hr: "HR", it: "IT", kyc: "KYC", llm: "LLM", mcp: "MCP", qa: "QA", sdk: "SDK", sla: "SLA", sql: "SQL", ui: "UI", openai: "OpenAI", github: "GitHub", hubspot: "HubSpot", localhost: "Local" };

/**
 * A readable display name for an imported or remote agent, from its repository
 * path or URL: "github.com/acme/agents/tree/main/fraud_review.py" → "Fraud Review",
 * "https://agents.acme.com/" → "Acme Agent". Generic segments (agents, src, main…) are skipped.
 */
export function agentNameFromLocation(location: string): string {
  const loc = location.trim();
  let host = "";
  let path = loc;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(loc) ? loc : `https://${loc}`);
    host = u.hostname;
    path = u.pathname;
  } catch {
    /* keep the raw text */
  }
  const segments = path.split(/[/#?]/).filter(Boolean).map((p) => p.replace(/\.(py|ts|tsx|js|mjs|ya?ml|json|ipynb)$/i, ""));
  const pick = [...segments].reverse().find((p) => !GENERIC_SEGMENT.test(p) && /[a-z]/i.test(p));
  const hostWord = host.split(".").filter((p) => !/^(www|api|agents?|mcp|app|com|net|org|io|ai|dev|co|cloud|run)$/i.test(p))[0];
  const words = (pick ?? hostWord ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_.-]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => ACRONYMS[w.toLowerCase()] ?? (w === w.toUpperCase() && w.length <= 4 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()));
  if (!words.length) return "External Agent";
  const name = words.join(" ");
  // One word ("Acme", "Triage") reads like a company or a verb, so it becomes "Acme Agent". Never "Agent Agent".
  return words.length === 1 && !/agent|bot|assistant/i.test(name) ? `${name} Agent` : name;
}
