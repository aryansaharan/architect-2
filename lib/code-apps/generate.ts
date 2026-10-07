import "server-only";
import { createHash } from "node:crypto";
import { Output, streamText } from "ai";
import type { SessionUser } from "@/lib/auth";
import type { Supa } from "@/lib/supabase/server";
import type { Blueprint } from "@/lib/blueprint/schema";
import { addCheckpoint, addLedger, createProject, logUsage } from "@/lib/db/writes";
import { holdModelBudget, promptHoldUsd, type ModelHold } from "@/lib/llm/guard";
import { getModel, supportsEffort, type ModelHandle } from "@/lib/llm/provider";
import { costOf, failedSpend, type ModelSpend } from "@/lib/llm/pricing";
import { PRICE, canAfford, monthlyAllowance, outOfCreditsNote } from "@/lib/pricing";
import { projectCapMessage } from "@/lib/security/caps";
import { cleanDeep, noEmDash } from "@/lib/text";
import { PACKAGE_LIST, isAllowedPackage } from "./packages";
import { CodeAppSchema, LIMITS, type CodeApp, type CodeFile, type Collection, type Manifest } from "./schema";
import { EditSchema, FIX_INSTRUCTIONS, WRITE_INSTRUCTIONS, WriteSchema, fixPrompt, writePrompt, type EditOutput, type ProblemReport } from "./prompts";

/**
 * Claude writing a code app: a whole new app streamed file by file (POST /api/plan with kind "code"),
 * and the edit engine changes and fixes share (lib/code-apps/change.ts, lib/code-apps/repair.ts).
 * Nothing Claude writes is saved until it passes CodeAppSchema and Prod AI's own checks (checkApp):
 * allowed packages only, imports that resolve, an App entry with a default export, nothing the
 * sandbox forbids, every collection declared, and (when esbuild is available) files that compile.
 */

// ---------------------------------------------------------------------------------------------
// Limits for one model call. A whole app is written in one call; a change or a fix is a smaller one.

/** Output cap for writing a whole app (thinking included). About 80 KB of code at most. */
export const WRITE_MAX_OUTPUT = 28_000;
/** Output cap for a change or a fix: whole-file replacements of the files it touches. */
export const EDIT_MAX_OUTPUT = 16_000;
const WRITE_TIMEOUT_MS = 235_000;
const FIX_TIMEOUT_MS = 85_000;
/** Everything for a new app (the write, one fix, the save) ends inside the route's 300 seconds. */
const PLAN_DEADLINE_MS = 288_000;
/** A fix that can't get this long isn't started. */
const MIN_FIX_MS = 25_000;
/** A change or a fix on its own (not inside a new app's time budget). */
export const EDIT_TIMEOUT_MS = 140_000;

// ---------------------------------------------------------------------------------------------
// Cleaning and checking what Claude wrote.

const JS = /\.(jsx|tsx|js|ts)$/;

/** Code-safe: an em dash between words becomes ", ", anything else a hyphen. Never joins lines, never touches quotes. */
function codeNoEmDash(s: string): string {
  if (!s.includes("\u2014")) return s;
  return s.replace(/([\p{L}\p{N}])?([ \t]*)\u2014([ \t]*)([\p{L}\p{N}])?/gu, (_m, a: string | undefined, before: string, after: string, b: string | undefined) =>
    a && b ? `${a}, ${b}` : `${a ?? ""}${before ? " " : ""}-${after ? " " : ""}${b ?? ""}`,
  );
}

/**
 * Unicode escapes written into code become the characters they stand for. In JSX text and attributes an escape
 * shows up as written ("\\u00b7" on screen), and in strings it means the same character either way. An escaped
 * backslash, ASCII, control and invisible characters are left as they are, so no string or regex changes meaning.
 */
function unescapeUnicode(s: string): string {
  if (!s.includes("\\u")) return s;
  return s.replace(
    /(\\+)u(?:\{([0-9a-fA-F]{1,6})\}|([dD][89abAB][0-9a-fA-F]{2})\\u([dD][c-fC-F][0-9a-fA-F]{2})|([0-9a-fA-F]{4}))/g,
    (m, slashes: string, braced?: string, hi?: string, lo?: string, four?: string) => {
      if (slashes.length % 2 === 0) return m;
      const cp = braced ? parseInt(braced, 16) : hi && lo ? (parseInt(hi, 16) - 0xd800) * 0x400 + (parseInt(lo, 16) - 0xdc00) + 0x10000 : parseInt(four ?? "0", 16);
      if (cp < 0xa0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) || (cp >= 0x2000 && cp <= 0x200f) || cp === 0x2028 || cp === 0x2029 || cp === 0xfeff || cp === 0xad) return m;
      return slashes.slice(1) + String.fromCodePoint(cp);
    },
  );
}

const cleanPath = (p: string) => p.trim().replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");

/** Files as Claude wrote them, tidied: relative paths, no shared src/ folder, the last copy of a path wins. */
export function normalizeFiles(files: unknown): CodeFile[] {
  const list = (Array.isArray(files) ? files : []).filter(
    (f): f is { path: string; content: string } => Boolean(f) && typeof f.path === "string" && typeof f.content === "string",
  );
  let out = list.map((f) => {
    const path = cleanPath(f.path);
    return { path, content: codeNoEmDash(JS.test(path) ? unescapeUnicode(f.content) : f.content) };
  });
  // Everything under src/ is the same app: imports between its files are relative, so they still resolve.
  if (out.length && out.every((f) => f.path.startsWith("src/"))) out = out.map((f) => ({ ...f, path: f.path.slice(4) }));
  const byPath = new Map<string, CodeFile>();
  for (const f of out) if (f.path) byPath.set(f.path, f);
  return [...byPath.values()];
}

/** Text cut to a limit, on a word boundary when one is close. */
function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.7 ? cut.slice(0, space) : cut).trim();
}

const usesAI = (files: CodeFile[]) => files.some((f) => /\bprod\s*\.\s*ai\s*\.\s*ask\s*\(/.test(f.content));

/** The manifest, tidied: lengths clipped, collections listed once, usesAI read from the code itself (never trusted). */
export function normalizeManifest(raw: unknown, files: CodeFile[]): Manifest {
  const m = (raw && typeof raw === "object" ? cleanDeep(raw) : {}) as Partial<Manifest>;
  const seen = new Set<string>();
  const collections = (Array.isArray(m.collections) ? m.collections : [])
    .filter((c): c is Collection => Boolean(c) && typeof c.name === "string")
    .map((c) => ({ name: c.name.trim(), label: clip(String(c.label ?? c.name), 60), read: c.read, write: c.write }))
    .filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)));
  return {
    title: clip(String(m.title ?? ""), 60),
    tagline: clip(String(m.tagline ?? ""), 140),
    kind: clip(String(m.kind ?? ""), 60),
    collections,
    usesAI: usesAI(files),
  };
}

const EXTS = [".jsx", ".tsx", ".js", ".ts", ".json", ".css"];

/** "components/Board.jsx" + "../lib/x" → "lib/x" (null when it climbs out of the app). */
function joinPath(fromFile: string, spec: string): string | null {
  const parts = fromFile.split("/").slice(0, -1);
  for (const seg of spec.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

function resolves(paths: Set<string>, fromFile: string, spec: string): boolean {
  const base = joinPath(fromFile, spec);
  if (base === null) return false;
  return paths.has(base) || EXTS.some((e) => paths.has(base + e)) || EXTS.some((e) => paths.has(`${base}/index${e}`));
}

const IMPORT_RE = /(?:^|[;\n\r}])\s*(?:import|export)\s+(?:[\w*{}\s,$]+?\s+from\s+)?["']([^"'\n]+)["']/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g;
const CSS_IMPORT_RE = /@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?/g;
const COLLECTION_RE = /\bprod\s*\.\s*data\s*\.\s*(?:list|add|update|remove)\s*\(\s*["'`]([^"'`]+)["'`]/g;

const FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /\b(?:localStorage|sessionStorage)\s*[.[]/, why: "uses localStorage or sessionStorage, which throw in the sandbox: keep state in React and save with prod.data" },
  { re: /\bindexedDB\s*\.|document\s*\.\s*cookie/, why: "uses indexedDB or cookies, which throw in the sandbox: keep state in React and save with prod.data" },
  { re: /(?<![\w.$])fetch\s*\(|\bXMLHttpRequest\b|\bnew\s+WebSocket\s*\(|\bnew\s+EventSource\s*\(|\bsendBeacon\s*\(/, why: "makes network requests, which the sandbox blocks: use prod.data and prod.ai.ask instead" },
  { re: /\bcreateRoot\s*\(|\bhydrateRoot\s*\(|ReactDOM\s*\.\s*render\s*\(/, why: "mounts React itself: Prod AI mounts App.jsx, so remove createRoot or render" },
  { re: /\/\/\s*(?:TODO|FIXME)\b|\/\*\s*(?:TODO|FIXME)\b|lorem ipsum/i, why: "has a TODO, FIXME or lorem ipsum: finish it with real code and content" },
];

type Esbuild = typeof import("esbuild");
let esbuildModule: Esbuild | null | undefined;
/**
 * esbuild, when this server can load it (it's how Prod AI builds the app; next.config.ts keeps it out of the
 * bundle, as serverExternalPackages). Without it the syntax check is skipped, and the real build catches it.
 */
async function loadEsbuild(): Promise<Esbuild | null> {
  if (esbuildModule !== undefined) return esbuildModule;
  try {
    esbuildModule = await import("esbuild");
  } catch (e) {
    console.warn("[code-apps] esbuild isn't available, so files aren't compiled before saving:", e instanceof Error ? e.message.slice(0, 160) : e);
    esbuildModule = null;
  }
  return esbuildModule;
}

/** Each file compiled on its own (syntax only): "components/Board.jsx:12:4 Expected ..." for anything that doesn't. */
async function syntaxErrors(files: CodeFile[]): Promise<string[]> {
  const es = await loadEsbuild();
  if (!es) return [];
  const errors: string[] = [];
  for (const f of files) {
    const ext = f.path.split(".").pop() as "jsx" | "tsx" | "js" | "ts" | "css" | "json";
    if (ext === "json") {
      try {
        JSON.parse(f.content);
      } catch (e) {
        errors.push(`${f.path} isn't valid JSON: ${e instanceof Error ? e.message : "it doesn't parse"}`);
      }
      continue;
    }
    try {
      await es.transform(f.content, { loader: ext === "js" ? "jsx" : ext, jsx: "automatic", sourcefile: f.path, logLevel: "silent" });
    } catch (e) {
      const list = (e as { errors?: { text: string; location?: { line: number; column: number } | null }[] }).errors ?? [];
      for (const x of list.slice(0, 3)) errors.push(`${f.path}${x.location ? `:${x.location.line}:${x.location.column + 1}` : ""} ${x.text}`);
      if (!list.length) errors.push(`${f.path} doesn't compile`);
    }
  }
  return errors;
}

export type Draft = { files: CodeFile[]; manifest: Manifest };
export type Checked = { ok: true; app: CodeApp } | { ok: false; errors: string[]; draft: Draft };

/**
 * Whether what Claude wrote can be saved: CodeAppSchema (lib/code-apps/schema.ts) plus Prod AI's own
 * checks. The errors are plain sentences naming the file, for Claude to fix and for logs.
 */
export async function checkApp(raw: { files: unknown; manifest: unknown }): Promise<Checked> {
  const files = normalizeFiles(raw.files);
  const manifest = normalizeManifest(raw.manifest, files);
  const draft: Draft = { files, manifest };
  const errors: string[] = [];

  const parsed = CodeAppSchema.safeParse(draft);
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 12)) {
      const [top, index, field] = issue.path;
      if (top === "files" && typeof index === "number" && files[index]) {
        const f = files[index];
        errors.push(field === "content" ? `${f.path} is ${f.content.length} characters; the most a file may be is ${LIMITS.fileBytes}. Split it or make it shorter` : `"${f.path}": ${issue.message}`);
      } else errors.push(`${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}`);
    }
  }
  if (!manifest.title) errors.push("manifest.title is empty: give the app a short name");

  const paths = new Set(files.map((f) => f.path));
  for (const f of files) {
    if (JS.test(f.path)) {
      const specs = [...f.content.matchAll(IMPORT_RE), ...f.content.matchAll(DYNAMIC_IMPORT_RE)].map((m) => m[1]);
      for (const spec of new Set(specs)) {
        if (spec.startsWith(".")) {
          if (!resolves(paths, f.path, spec)) errors.push(`${f.path} imports "${spec}", but there is no such file: add it or fix the path`);
        } else if (spec.startsWith("/") || /^https?:/.test(spec)) {
          errors.push(`${f.path} imports "${spec}": import other files with relative paths like "./components/Board.jsx", and packages by name`);
        } else if (!isAllowedPackage(spec)) {
          errors.push(`${f.path} imports "${spec}", which isn't available. Only these packages exist: ${PACKAGE_LIST}`);
        }
      }
      for (const { re, why } of FORBIDDEN) if (re.test(f.content)) errors.push(`${f.path} ${why}`);
      for (const m of f.content.matchAll(COLLECTION_RE)) {
        if (!manifest.collections.some((c) => c.name === m[1])) errors.push(`${f.path} uses the collection "${m[1]}", which isn't in manifest.collections: declare it with its read and write access`);
      }
    } else if (f.path.endsWith(".css")) {
      for (const m of f.content.matchAll(CSS_IMPORT_RE)) {
        const spec = m[1];
        if (/^https:\/\/fonts\.googleapis\.com\//.test(spec)) continue;
        if (spec.startsWith(".") && resolves(paths, f.path, spec)) continue;
        if (/^tailwindcss/.test(spec)) errors.push(`${f.path} imports Tailwind: it's already loaded, so remove that line`);
        else errors.push(`${f.path} imports "${spec}": a .css file may only @import Google Fonts or another file in the app`);
      }
      if (/@(?:tailwind|apply|theme)\b/.test(f.content)) errors.push(`${f.path} uses @tailwind, @apply or @theme, which plain CSS files can't: use utility classes in className instead`);
    }
  }
  const entry = files.find((f) => f.path === "App.jsx" || f.path === "App.tsx");
  if (entry && !/\bexport\s+default\b|\bas\s+default\b/.test(entry.content)) errors.push(`${entry.path} needs a default export: export default function App() {...}`);

  errors.push(...(await syntaxErrors(files)));

  const unique = [...new Set(errors)].slice(0, 20);
  if (unique.length || !parsed.success) return { ok: false, errors: unique.length ? unique : ["The files don't match the expected shape"], draft };
  return { ok: true, app: parsed.data };
}

// ---------------------------------------------------------------------------------------------
// Edits: whole-file replacements, new files and deletions on top of an app.

export type FileChange = { path: string; action: "add" | "change" | "remove" };

export const hashOf = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** An edit on top of an app (unchecked: run checkApp on the result). */
export function applyEdit(base: Draft, edit: Pick<EditOutput, "files" | "remove" | "manifest">): Draft {
  const map = new Map(base.files.map((f) => [f.path, f.content]));
  for (const p of edit.remove ?? []) if (typeof p === "string") map.delete(cleanPath(p));
  for (const f of normalizeFiles(edit.files)) map.set(f.path, f.content);
  return { files: [...map].map(([path, content]) => ({ path, content })), manifest: (edit.manifest as Manifest | null) ?? base.manifest };
}

/** What differs between two versions of an app's files, in the order of the newer one (removals last). */
export function fileChanges(before: Pick<CodeApp, "files">, after: Pick<CodeApp, "files">): FileChange[] {
  const old = new Map(before.files.map((f) => [f.path, f.content]));
  const now = new Set(after.files.map((f) => f.path));
  const changes: FileChange[] = [];
  for (const f of after.files) {
    const prev = old.get(f.path);
    if (prev === undefined) changes.push({ path: f.path, action: "add" });
    else if (prev !== f.content) changes.push({ path: f.path, action: "change" });
  }
  for (const f of before.files) if (!now.has(f.path)) changes.push({ path: f.path, action: "remove" });
  return changes;
}

/** Key-order-independent JSON (Postgres jsonb reorders keys). */
export function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}
export const sameManifest = (a: Manifest, b: Manifest) => stable(a) === stable(b);

const providerOptions = (m: ModelHandle, userId: string, effort: "low" | "medium") => ({
  anthropic: { ...(supportsEffort(m.id) ? { effort } : {}), structuredOutputMode: "outputFormat" as const, metadata: { userId } },
});

const spendOf = (m: ModelHandle, u: { inputTokens?: number; outputTokens?: number }): ModelSpend => {
  const inputTokens = u.inputTokens ?? 0;
  const outputTokens = u.outputTokens ?? 0;
  return { model: m.id, inputTokens, outputTokens, ...costOf(m.id, inputTokens, outputTokens) };
};

/**
 * One edit by Claude (a change or a fix): whole-file replacements, new files, deletions, a plain summary.
 * Never throws; the spend is returned either way, so the caller meters it (a failed call is billed too).
 */
export async function editWithClaude(
  m: ModelHandle,
  opts: { instructions: string; prompt: string; userId: string; maxOutputTokens?: number; timeoutMs?: number; effort?: "low" | "medium" },
): Promise<{ edit: EditOutput | null; spent: ModelSpend; error?: string }> {
  let usage: PromiseLike<{ inputTokens?: number; outputTokens?: number }> | undefined;
  const maxOutputTokens = opts.maxOutputTokens ?? EDIT_MAX_OUTPUT;
  try {
    const result = streamText({
      model: m.model,
      instructions: opts.instructions,
      prompt: opts.prompt,
      output: Output.object({ schema: EditSchema, name: "code_edit" }),
      maxOutputTokens,
      timeout: opts.timeoutMs ?? EDIT_TIMEOUT_MS,
      maxRetries: 0,
      providerOptions: providerOptions(m, opts.userId, opts.effort ?? "medium"),
    });
    usage = result.usage;
    // Read to the end: the finished object and the usage resolve once the stream is consumed.
    for await (const partial of result.partialOutputStream) void partial;
    const edit = await result.output;
    const spent = spendOf(m, await result.usage);
    return {
      edit: { ...edit, summary: noEmDash(edit.summary ?? "").trim(), reply: noEmDash(edit.reply ?? "").trim() },
      spent,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 300) : "unknown";
    console.error("[code-apps] edit failed:", message);
    const promptTokens = Math.ceil((opts.instructions.length + opts.prompt.length) / 3.5);
    return { edit: null, spent: await failedSpend(m.id, usage, { inputTokens: promptTokens, outputTokens: maxOutputTokens }), error: message };
  }
}

// ---------------------------------------------------------------------------------------------
// Writing a whole app (POST /api/plan, kind "code").

export type CodeAction = { id: "sign-in" | "business" | "retry"; label: string; href?: string };

/** The events /api/plan streams for a code app (docs/CODE-APPS.md), one JSON object a line. */
export type CodePlanEvent =
  | { t: "status"; mode: "live" | "offline"; kind: "code"; model?: string; text: string }
  | { t: "manifest"; manifest: Partial<Manifest> }
  | { t: "file"; path: string; content: string; done: boolean }
  | { t: "done"; projectId: string; mode: "live"; name: string; kind: "code" }
  | { t: "error"; message: string; code?: string; actions?: CodeAction[] };

type PartialWrite = { manifest?: Partial<Manifest> & { collections?: unknown }; files?: ({ path?: string; content?: string } | undefined)[] };

/** What a write that stopped early still has: the manifest and every file that was finished. */
function salvage(p: PartialWrite | null, finished: boolean): { files: unknown; manifest: unknown } | null {
  if (!p?.manifest?.title || !p.files?.length) return null;
  const files = (finished ? p.files : p.files.slice(0, -1)).filter((f) => typeof f?.path === "string" && typeof f.content === "string");
  return files.length ? { files, manifest: p.manifest } : null;
}

/**
 * Claude writes the app, streamed: the manifest once it's decided, then each file as it grows and when
 * it's finished. Returns what was written (salvaged when the call stopped early) and what it cost.
 */
async function streamWrite(
  m: ModelHandle,
  prompt: string,
  userId: string,
  send: (e: CodePlanEvent) => void,
  sent: Map<string, string>,
): Promise<{ raw: { files: unknown; manifest: unknown } | null; spent: ModelSpend; error?: string }> {
  let usage: PromiseLike<{ inputTokens?: number; outputTokens?: number }> | undefined;
  let latest: PartialWrite | null = null;
  let manifestSent = false;
  let writing = false;
  let lastGrowing = 0;
  const finished = new Set<string>();
  const flush = (p: PartialWrite, final: boolean) => {
    const files = p.files ?? [];
    if (!manifestSent && files.length && p.manifest?.title) {
      manifestSent = true;
      send({ t: "manifest", manifest: cleanDeep(p.manifest) as Partial<Manifest> });
    }
    files.forEach((f, i) => {
      // A file's content only starts once its path is complete (path comes first in the schema).
      if (typeof f?.path !== "string" || typeof f.content !== "string") return;
      const path = cleanPath(f.path);
      const done = final || i < files.length - 1;
      // Sent again only when it grew, or to say it's finished (its last part may already have been sent).
      if (sent.get(path) === f.content && (!done || finished.has(path))) return;
      if (!done && Date.now() - lastGrowing < 700) return;
      if (!done) lastGrowing = Date.now();
      if (!writing) {
        writing = true;
        send({ t: "status", mode: "live", kind: "code", model: m.id, text: "Writing the files" });
      }
      sent.set(path, f.content);
      if (done) finished.add(path);
      send({ t: "file", path, content: codeNoEmDash(f.content), done });
    });
  };
  try {
    const result = streamText({
      model: m.model,
      instructions: WRITE_INSTRUCTIONS,
      prompt,
      output: Output.object({ schema: WriteSchema, name: "code_app" }),
      maxOutputTokens: WRITE_MAX_OUTPUT,
      timeout: WRITE_TIMEOUT_MS,
      maxRetries: 0,
      // Low effort: a whole app is long to write, so the time goes into writing it (the checks and one fix catch slips).
      providerOptions: providerOptions(m, userId, "low"),
    });
    usage = result.usage;
    for await (const partial of result.partialOutputStream) {
      latest = partial as PartialWrite;
      flush(latest, false);
    }
    const output = await Promise.resolve(result.output).then(
      (o) => o,
      (e) => {
        console.error("[code-apps] the app came back incomplete:", e instanceof Error ? e.message.slice(0, 200) : e);
        return null;
      },
    );
    const spent = spendOf(m, await result.usage);
    if (output) {
      flush(output as PartialWrite, true);
      return { raw: output, spent };
    }
    // Cut off (usually the output cap): keep the finished files; the check names what's missing for the fix.
    return { raw: salvage(latest, false), spent, error: "incomplete" };
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 300) : "unknown";
    console.error("[code-apps] writing failed:", message);
    const spent = await failedSpend(m.id, usage, { inputTokens: Math.ceil((WRITE_INSTRUCTIONS.length + prompt.length) / 3.5), outputTokens: WRITE_MAX_OUTPUT });
    return { raw: salvage(latest, false), spent, error: message };
  }
}

/** "1 file", "6 files". */
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Who may do what with a collection, in plain words. */
export function accessWords(c: Collection): string {
  if (c.read === "public" && c.write === "public") return "anyone with the link can see and add to it";
  if (c.read === "team" && c.write === "public") return "anyone can add to it, only your team can see it";
  if (c.read === "public" && c.write === "team") return "anyone can see it, only your team can add to it";
  return "only your team can see and add to it";
}

/** What the app keeps and whether it uses AI, in a sentence or two (empty when neither). */
export function dataWords(m: Manifest): string {
  const kept = m.collections.map((c) => `${c.label || c.name} (${accessWords(c)})`);
  const data = kept.length ? ` It keeps ${kept.join("; ")}.` : "";
  const ai = m.usesAI ? " It uses AI, paid from your credits: 5 a call." : "";
  return `${data}${ai}`;
}

/**
 * The project row needs a Blueprint (projects.blueprint is required), so a code app carries the smallest
 * valid one: one screen pointing at the code, one data type listing its files, and one note in place of
 * an AI helper. Business screens never show it; it exists so every read of a project keeps working.
 */
export function codePlaceholderBlueprint(app: CodeApp): Blueprint {
  const { title, tagline, kind } = app.manifest;
  return {
    version: 1,
    meta: {
      name: title,
      tagline: tagline || title,
      vertical: "custom",
      plain: `${kind || "An app"}, written by Claude as real code.`,
      theme: { primary: "#0F766E", radius: "md", density: "comfortable", mode: "light" },
      auth: { enabled: false, providers: [] },
      region: "us",
    },
    screens: [
      {
        id: "app",
        slug: "app",
        title,
        icon: "Code",
        purpose: tagline || title,
        plain: "The whole app: it is real code, so its files are its screens.",
        layout: "single",
        regions: { main: [{ type: "text", id: "code-app", markdown: "This app is written as real code. Its files are in the Code tab." }], side: [] },
        audience: "customer",
        status: "planned",
      },
    ],
    agents: [
      {
        id: "claude",
        name: "Claude",
        role: "Wrote this app's code",
        avatarHue: 172,
        plain: "Claude wrote this app's files. The app has no AI helpers of its own.",
        jobDescription: "Writes and changes this app's code when asked.",
        rules: ["Changes only what's asked for."],
        tools: [],
        supervision: "approve_all",
        knowledge: [],
        memory: { scope: "none", retentionDays: 30 },
        cost: { creditsPerRun: 0, model: "claude" },
        triggers: ["manual"],
        rehearsals: [],
        framework: "langgraph",
        origin: "generated",
      },
    ],
    entities: [
      {
        id: "file",
        name: "File",
        plural: "Files",
        plain: "The app's source files.",
        fields: [{ name: "path", label: "Path", type: "string" }],
        sample: app.files.slice(0, 12).map((f) => ({ path: f.path })),
      },
    ],
    connections: [],
    estimate: { minutes: 1, credits: 0, files: app.files.length, agentsTouched: 0, confidence: "high", breakdown: [] },
  };
}

const NDJSON = { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } as const;

const BUSINESS_ACTION: CodeAction = { id: "business", label: "Start from a business starter, free" };

/** A plain no, as the one event of a stream, with the ways on (sign in, or the business starter). */
function refusal(message: string, code: string, actions: CodeAction[]): Response {
  const lines = [
    { t: "status", mode: "offline", kind: "code", text: "Claude isn't writing this one" },
    { t: "error", message, code, actions },
  ] satisfies CodePlanEvent[];
  return new Response(lines.map((l) => JSON.stringify(l)).join("\n") + "\n", { headers: NDJSON });
}

/**
 * POST /api/plan with kind "code": Claude writes the app as real files, streamed as NDJSON events
 * (status, manifest, file, done or error). Saved as a code app with a first version, and charged
 * PRICE.codeApp only when the save succeeds and the model didn't fail. Every model call's real cost is
 * metered the moment it returns (failures too), so the budget hold can be released before a fix is held.
 * Guests and people without the credits get no model: they're told plainly and offered a business starter.
 */
export async function codePlanResponse(p: { user: SessionUser; supa: Supa; brief: string; answers: string }): Promise<Response> {
  const { user, supa, brief, answers } = p;
  if (user.isAnonymous)
    return refusal(
      `Writing an app as real code takes ${PRICE.codeApp} credits. Sign in to get ${monthlyAllowance(false)} free credits a month, or start from a business starter now, free.`,
      "code-sign-in",
      [{ id: "sign-in", label: "Sign in", href: "/login?next=%2Fnew" }, BUSINESS_ACTION],
    );
  const m = getModel();
  if (!m) return refusal("Writing an app as real code needs Claude, which isn't set up here. You can start from a business starter, free.", "code-unavailable", [BUSINESS_ACTION]);

  const prompt = writePrompt(brief, answers);
  // The hold covers the worst case of the write itself; a fix, if one is needed, is held on its own after the write is metered.
  const hold = await holdModelBudget(user, "plan", promptHoldUsd(WRITE_INSTRUCTIONS.length + prompt.length, WRITE_MAX_OUTPUT));
  if (!hold.ok && hold.reason === "rate") return Response.json({ error: "That's a lot of apps in a few minutes. Wait a little, then try again." }, { status: 429 });
  const afford = hold.ok ? await canAfford(user.id, user.isAnonymous, "codeApp") : null;
  if (hold.ok && afford && !afford.ok) await hold.release();
  if (!hold.ok)
    return refusal("Claude has done a lot for this account today, so it can't write a whole app right now. It comes back within 24 hours. You can start from a business starter now, free.", "code-unavailable", [BUSINESS_ACTION]);
  if (!afford?.ok)
    return refusal(
      `Writing an app as real code takes ${PRICE.codeApp} credits. ${outOfCreditsNote(afford!.credits, "Claude can't write this one")}`,
      "code-credits",
      [BUSINESS_ACTION],
    );

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      // A closed connection never stops the work: the app is still written and saved, and waits in the projects list.
      let open = true;
      const send = (e: CodePlanEvent) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          open = false;
        }
      };
      let held = true;
      const releaseWrite = async () => {
        if (held) {
          held = false;
          await hold.release();
        }
      };
      let fixHold: ModelHold | null = null;
      const meter = (spent: ModelSpend, step: "write" | "fix") =>
        logUsage({ userId: user.id, projectId: null, kind: "llm", provider: "anthropic", model: spent.model, inputTokens: spent.inputTokens, outputTokens: spent.outputTokens, costUsd: spent.costUsd, credits: 0, meta: { op: "code-app", step, modelCredits: spent.credits, failed: spent.failed, estimated: spent.estimated } });
      const sent = new Map<string, string>();
      const started = Date.now();
      try {
        send({ t: "status", mode: "live", kind: "code", model: m.id, text: "Claude is planning the app" });
        const write = await streamWrite(m, prompt, user.id, send, sent);
        await meter(write.spent, "write");
        await releaseWrite();
        if (!write.raw) {
          send({ t: "error", message: "Claude couldn't finish writing the app. Nothing was charged. Try again.", code: "code-failed", actions: [{ id: "retry", label: "Try again" }, BUSINESS_ACTION] });
          return;
        }
        send({ t: "status", mode: "live", kind: "code", model: m.id, text: "Checking the files" });
        let checked = await checkApp(write.raw);
        if (!checked.ok) {
          // One fix, with exactly what the checks found.
          console.warn("[code-apps] the first write didn't pass the checks:", checked.errors.slice(0, 5));
          const base = checked.draft;
          const fixText = fixPrompt(base as CodeApp, { checks: checked.errors } satisfies ProblemReport);
          const fixMs = Math.min(FIX_TIMEOUT_MS, PLAN_DEADLINE_MS - (Date.now() - started));
          if (fixMs < MIN_FIX_MS) {
            send({ t: "error", message: "Claude took too long writing the app, so it wasn't saved. Nothing was charged. Try again, maybe with a smaller first version.", code: "code-failed", actions: [{ id: "retry", label: "Try again" }, BUSINESS_ACTION] });
            return;
          }
          fixHold = await holdModelBudget(user, "change", promptHoldUsd(FIX_INSTRUCTIONS.length + fixText.length, EDIT_MAX_OUTPUT));
          if (!fixHold.ok) {
            const why = write.error ? "Claude couldn't finish writing the app in one go" : "Claude's app didn't pass Prod AI's checks";
            send({ t: "error", message: `${why}, and there's no room left today to fix it. Nothing was charged. Try again tomorrow, maybe with a smaller first version.`, code: "code-failed", actions: [BUSINESS_ACTION] });
            return;
          }
          send({ t: "status", mode: "live", kind: "code", model: m.id, text: "Fixing what the checks found" });
          const fix = await editWithClaude(m, { instructions: FIX_INSTRUCTIONS, prompt: fixText, userId: user.id, timeoutMs: fixMs, effort: "low" });
          await meter(fix.spent, "fix");
          await fixHold.release();
          if (fix.edit) checked = await checkApp(applyEdit(base, fix.edit));
          if (!checked.ok) {
            console.warn("[code-apps] the fix didn't pass the checks either:", checked.errors.slice(0, 5));
            send({ t: "error", message: `Claude's app didn't pass Prod AI's checks (${checked.errors[0]}). Nothing was charged. Try again.`, code: "code-failed", actions: [{ id: "retry", label: "Try again" }, BUSINESS_ACTION] });
            return;
          }
        }
        const app = checked.app;
        // The files as saved: anything the fix or the tidy-up changed is sent again, finished.
        for (const f of app.files) if (sent.get(f.path) !== f.content) send({ t: "file", path: f.path, content: f.content, done: true });
        send({ t: "manifest", manifest: app.manifest });
        send({ t: "status", mode: "live", kind: "code", model: m.id, text: "Saving version 1" });

        let projectId: string | null = null;
        try {
          const project = await createProject(supa, { ownerId: user.id, name: app.manifest.title, vertical: "custom", brief, blueprint: codePlaceholderBlueprint(app), buildState: "draft", kind: "code", code: app });
          projectId = project.id;
          const cp = await addCheckpoint(supa, project.id, {
            label: "Written by Claude",
            kind: "blueprint",
            blueprint: project.blueprint,
            code: app,
            summary: `${count(app.files.length, "file")}${app.manifest.collections.length ? ` · keeps ${app.manifest.collections.map((c) => c.label || c.name).join(", ")}` : ""}${app.manifest.usesAI ? " · uses AI" : ""}`,
          });
          // Charged once, only now: the app and its first version are saved and the model didn't fail. Its real cost was metered above.
          await logUsage({ userId: user.id, projectId: project.id, kind: "llm", credits: PRICE.codeApp, meta: { op: "code-app", charge: true, checkpointId: cp.id } });
          try {
            await addLedger(supa, project.id, [
              { lane: "thought", kind: "brief", title: "You described the project", body: answers ? `${brief}\n\n${answers}` : brief },
              {
                lane: "thought",
                kind: "work_order",
                title: `Wrote ${app.manifest.kind || "the app"} in ${count(app.files.length, "file")}`,
                // Plain facts, no model names: who wrote it, what it cost, and what happens next.
                body: `Written by Claude from your words · ${PRICE.codeApp} credits. Prod AI builds it for real next, free.${dataWords(app.manifest)}`,
                credits: PRICE.codeApp,
                checkpointId: cp.id,
                meta: { kind: "code", files: app.files.length },
              },
            ]);
          } catch (e) {
            // Best effort: the app is saved, so a history note that didn't write never costs you the app.
            console.error("[code-apps] could not add the history note:", e instanceof Error ? e.message : e);
          }
          send({ t: "done", projectId: project.id, mode: "live", name: app.manifest.title, kind: "code" });
        } catch (e) {
          console.error("[code-apps] save failed", e);
          // At the project cap the person can't fix it by trying again: say so, with its own code so the page offers sign-in instead.
          const cap = e instanceof Error && /project cap|row-level/i.test(e.message) ? await projectCapMessage(supa, user) : null;
          // A project saved without its first version is removed (nothing was charged), so a failed save never leaves a half-made app behind.
          if (projectId) await supa.from("projects").delete().eq("id", projectId);
          send(cap ? { t: "error", message: cap, code: "cap" } : { t: "error", message: "Couldn't save the app. Nothing was charged. Try again.", code: "code-failed", actions: [{ id: "retry", label: "Try again" }] });
        }
      } catch (e) {
        console.error("[code-apps] writing failed", e);
        send({ t: "error", message: "Something went wrong while writing the app. Nothing was charged. Try again.", code: "code-failed", actions: [{ id: "retry", label: "Try again" }] });
      } finally {
        await releaseWrite();
        if (fixHold?.ok) await fixHold.release();
        if (open) {
          try {
            controller.close();
          } catch {
            // Already closed by the person leaving.
          }
        }
      }
    },
  });
  return new Response(stream, { headers: NDJSON });
}
