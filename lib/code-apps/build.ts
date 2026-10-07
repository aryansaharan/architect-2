import "server-only";
import { createHash } from "node:crypto";
import { posix } from "node:path";
import * as esbuild from "esbuild";
import { CodeAppSchema, type BuildError, type BuildResult, type CodeApp, type CodeFile } from "./schema";
import { isAllowedPackage, PACKAGE_LIST } from "./packages";
import { LINE_TABLE_MARK } from "./sandbox-html";

/**
 * The real build of a code app (docs/CODE-APPS.md, "Build"). Every file is compiled with esbuild (JSX and
 * TypeScript), relative imports are resolved among the app's own files, packages outside the allowed list
 * are refused, and the result is one ES module plus one CSS string. Packages stay as bare imports: the
 * sandbox page's import map loads them, so every package shares one copy of React. Nothing touches disk.
 *
 * Steps are reported as they happen (onStep), in the words the studio shows: "Checking the files",
 * "Compiling N files", "Bundling with M packages", "Ready to start".
 */

export type BuildStepId = "check" | "compile" | "bundle" | "ready";
export type BuildStep = { id: BuildStepId; label: string; state: "running" | "done" | "failed"; detail?: string };

/** The bundle is stored on the project (and, when published, on the site): it has to fit their 1 MB columns. */
const MAX_OUTPUT_BYTES = 900_000;
/** At most this many errors and warnings are kept: enough to fix, small enough to store and show. */
const MAX_MESSAGES = 20;
/** The generated entry's own name; it can't collide with an app file (those can't contain ":"). */
const ENTRY = "prod:entry";

const LOADERS: Record<string, esbuild.Loader> = { jsx: "jsx", tsx: "tsx", js: "jsx", ts: "ts", css: "css", json: "json" };
const ext = (path: string) => path.slice(path.lastIndexOf(".") + 1);
const loaderFor = (path: string): esbuild.Loader => LOADERS[ext(path)] ?? "jsx";
const isCode = (path: string) => /\.(jsx|tsx|js|ts)$/.test(path);
/** Extensions tried, in order, for an import that leaves its extension out ("./Board" -> "./Board.jsx"). */
const TRY = [".jsx", ".tsx", ".js", ".ts", ".json", ".css"];

/** A short fingerprint of the files: the same files always give the same hash, any change gives a new one. */
export function hashFiles(files: Pick<CodeFile, "path" | "content">[]): string {
  const h = createHash("sha256");
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) h.update(`${f.path}\0${f.content}\0`);
  return h.digest("hex").slice(0, 12);
}

/** "react-dom/client" -> "react-dom": what the label counts and the export's package.json lists. */
export const packageRoot = (spec: string) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Where an import points among the app's files, or null when no file is there. */
function findFile(files: Map<string, string>, wanted: string): string | null {
  if (files.has(wanted)) return wanted;
  // TypeScript style: "./Board.js" written for Board.ts or Board.tsx (and .jsx for .js).
  const stem = wanted.replace(/\.(js|jsx|ts|tsx)$/, "");
  if (stem !== wanted) for (const e of [".tsx", ".ts", ".jsx", ".js"]) if (files.has(stem + e)) return stem + e;
  for (const e of TRY) if (files.has(wanted + e)) return wanted + e;
  for (const e of TRY) if (files.has(`${wanted}/index${e}`)) return `${wanted}/index${e}`;
  return null;
}

/** A message from esbuild in the shape the studio and the repair loop read: which file, where, and what. */
function toBuildError(m: esbuild.Message): BuildError {
  const loc = m.location;
  const raw = loc?.file?.replace(/^app:/, "");
  const file = raw && raw !== ENTRY && !raw.startsWith("prod:") ? raw : undefined;
  let message = m.text;
  // The generated entry imports App's default export: say what that means for the app's own file.
  if (!file && /No matching export .* for import "default"/.test(message)) message = "App.jsx needs a default export, like: export default function App() { ... }";
  const note = m.notes.find((n) => n.text && !/^The plugin "prod-files" didn't set/.test(n.text))?.text;
  if (note && !message.includes(note)) message = `${message}. ${note}`;
  return { file, line: file ? loc?.line : undefined, column: file && loc ? loc.column + 1 : undefined, message: message.slice(0, 600) };
}

const messagesOf = (e: unknown): { errors: esbuild.Message[]; warnings: esbuild.Message[] } => {
  const f = e as Partial<esbuild.BuildFailure> | undefined;
  return Array.isArray(f?.errors) ? { errors: f.errors, warnings: Array.isArray(f.warnings) ? f.warnings : [] } : { errors: [{ id: "", pluginName: "", text: e instanceof Error ? e.message : "The build stopped", location: null, notes: [], detail: undefined }], warnings: [] };
};

/** "App.jsx line 12: Expected ..." for a step's detail. */
const firstProblem = (errors: BuildError[]) => {
  const e = errors[0];
  if (!e) return undefined;
  const where = e.file ? `${e.file}${e.line ? ` line ${e.line}` : ""}: ` : "";
  return `${where}${e.message}`.slice(0, 240) + (errors.length > 1 ? ` (and ${count(errors.length - 1, "more problem")})` : "");
};

/** The schema's problems, with the file each one is about when it names one. */
function schemaErrors(input: unknown, issues: { path: PropertyKey[]; message: string }[]): BuildError[] {
  const files = (input as { files?: { path?: unknown }[] } | null)?.files;
  return issues.slice(0, MAX_MESSAGES).map((i) => {
    const at = i.path[0] === "files" && typeof i.path[1] === "number" ? files?.[i.path[1]]?.path : undefined;
    const where = i.path.length && i.path[0] !== "files" ? `${i.path.join(".")}: ` : "";
    return { file: typeof at === "string" ? at : undefined, message: `${where}${i.message}` };
  });
}

/**
 * The generated entry: mount App into #root and tell the sandbox when the first render has painted.
 * CSS files are all imported here first, so a stylesheet counts even if no file imports it.
 */
function entrySource(app: CodeApp): string {
  const css = app.files.filter((f) => f.path.endsWith(".css")).map((f) => f.path).sort();
  const main = app.files.some((f) => f.path === "App.jsx") ? "App.jsx" : "App.tsx";
  return [
    `import { createElement, useEffect } from "react";`,
    `import { createRoot } from "react-dom/client";`,
    ...css.map((p) => `import ${JSON.stringify(`./${p}`)};`),
    `import App from ${JSON.stringify(`./${main}`)};`,
    `const host = window.__prodHost;`,
    `function ProdReady(props) {`,
    `  useEffect(() => { requestAnimationFrame(() => host && host.mounted()); }, []);`,
    `  return props.children;`,
    `}`,
    `const root = createRoot(document.getElementById("root"), {`,
    `  onUncaughtError: (error, info) => { if (host) host.reactError(error, info && info.componentStack); else console.error(error); },`,
    `});`,
    `root.render(createElement(ProdReady, null, createElement(App)));`,
  ].join("\n");
}

type Bundled = { js: string; css: string; packages: string[]; warnings: esbuild.Message[]; map: string | null };

/** The bundle step: esbuild over the app's files in memory. Throws esbuild's failure (with its messages) when it can't. */
async function bundle(app: CodeApp): Promise<Bundled> {
  const files = new Map(app.files.map((f) => [f.path, f.content]));
  const used = new Set<string>();
  const plugin: esbuild.Plugin = {
    name: "prod-files",
    setup(b) {
      b.onResolve({ filter: /.*/ }, (args) => {
        const spec = args.path;
        if (args.kind === "entry-point") return { path: ENTRY, namespace: "prod" };
        const css = args.kind === "import-rule" || args.kind === "url-token" || args.kind === "composes-from";
        // Stylesheets may pull in web fonts and images from the web; the sandbox's own policy decides what loads.
        if (/^(https?:)?\/\//i.test(spec) || spec.startsWith("data:")) {
          if (css) return { path: spec, external: true };
          return { errors: [{ text: `Import packages by name, not from a web address ("${spec}"). Prod AI can load: ${PACKAGE_LIST}` }] };
        }
        // Tailwind is already on the page (its browser build); a stylesheet's @import "tailwindcss" is kept for the sandbox to handle.
        if (css && /^tailwindcss(\/|$)/.test(spec)) return { path: spec, external: true };
        const relative = spec.startsWith("./") || spec.startsWith("../") || spec === "." || spec === "..";
        const fromRoot = spec.startsWith("@/") || spec.startsWith("/") || spec.startsWith("~/");
        if (relative || fromRoot || (css && !spec.startsWith("@") && /\.(css|jsx?|tsx?|json)$/.test(spec))) {
          const importer = args.namespace === "app" ? args.importer : "";
          const base = relative || (css && !fromRoot) ? posix.dirname(importer || "x") : ".";
          const rest = fromRoot ? spec.replace(/^(@|~)?\//, "") : spec;
          const wanted = posix.normalize(posix.join(base, rest)).replace(/^\.\//, "");
          if (wanted.startsWith("../") || wanted === "..") return { errors: [{ text: `"${spec}" points outside the app's files` }] };
          const found = findFile(files, wanted);
          if (!found) {
            const near = [...files.keys()].filter((p) => p.toLowerCase() === wanted.toLowerCase() || p.replace(/\.[a-z]+$/, "").toLowerCase() === wanted.replace(/\.[a-z]+$/, "").toLowerCase());
            return { errors: [{ text: `There's no file "${wanted}" for "${spec}"${near.length ? `. Did you mean "${near[0]}"? File names are case-sensitive` : ""}` }] };
          }
          return { path: found, namespace: "app" };
        }
        if (isAllowedPackage(spec)) {
          used.add(packageRoot(spec));
          return { path: spec, external: true };
        }
        const root = packageRoot(spec);
        const hint = isAllowedPackage(root) ? ` Import "${root}" itself: only these entry points load in the sandbox.` : "";
        return { errors: [{ text: `The package "${spec}" isn't available in Prod AI.${hint} Use one of these: ${PACKAGE_LIST}` }] };
      });
      b.onLoad({ filter: /.*/, namespace: "prod" }, () => ({ contents: entrySource(app), loader: "js" }));
      b.onLoad({ filter: /.*/, namespace: "app" }, (args) => ({ contents: files.get(args.path) ?? "", loader: loaderFor(args.path) }));
    },
  };
  const out = await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    outdir: "/out",
    format: "esm",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    jsxImportSource: "react",
    charset: "utf8",
    legalComments: "none",
    sourcemap: "external",
    sourcesContent: false,
    logLevel: "silent",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [plugin],
  });
  const pick = (suffix: string) => out.outputFiles.find((f) => f.path.endsWith(suffix))?.text ?? "";
  // React and React DOM always load (the entry mounts the app with them).
  used.add("react");
  used.add("react-dom");
  return { js: pick(".js"), css: pick(".css"), packages: [...used].sort(), warnings: out.warnings, map: pick(".js.map") || null };
}

/**
 * A compact table from the bundle's lines to the app's files: [bundleLine, fileIndex, fileLine] (0-based)
 * wherever the mapping jumps, decoded from esbuild's source map. The sandbox uses it to say which file
 * and line a runtime error came from.
 */
function lineTable(rawMap: string | null): { sources: string[]; table: number[][] } | null {
  if (!rawMap) return null;
  let map: { sources?: string[]; mappings?: string };
  try {
    map = JSON.parse(rawMap) as typeof map;
  } catch {
    return null;
  }
  if (!map.sources || typeof map.mappings !== "string") return null;
  const sources = map.sources.map((s) => {
    const p = s.replace(/^.*?app:/, "");
    return s.includes("prod:") ? "" : p;
  });
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const table: number[][] = [];
  let src = 0;
  let srcLine = 0;
  let last: number[] | null = null;
  const lines = map.mappings.split(";");
  for (let gen = 0; gen < lines.length; gen++) {
    let first: [number, number] | null = null;
    for (const seg of lines[gen].split(",")) {
      if (!seg) continue;
      const vals: number[] = [];
      let shift = 0;
      let value = 0;
      for (const ch of seg) {
        const digit = B64.indexOf(ch);
        if (digit < 0) return null;
        value += (digit & 31) << shift;
        if (digit & 32) shift += 5;
        else {
          vals.push(value & 1 ? -(value >>> 1) : value >>> 1);
          shift = 0;
          value = 0;
        }
      }
      if (vals.length >= 4) {
        src += vals[1];
        srcLine += vals[2];
        if (!first) first = [src, srcLine];
      }
    }
    if (!first) continue;
    if (!last || first[0] !== last[1] || first[1] - last[2] !== gen - last[0]) {
      last = [gen, first[0], first[1]];
      table.push(last);
    }
  }
  return { sources, table };
}

/**
 * Builds a code app for real. Never throws: a problem in the files, a refused package or esbuild itself
 * failing all come back as a failed BuildResult with plain errors (file, line, column when known).
 */
export async function buildCodeApp(input: CodeApp | unknown, onStep?: (s: BuildStep) => void): Promise<BuildResult> {
  const step = (s: BuildStep) => {
    try {
      onStep?.(s);
    } catch {
      // A closed stream must not stop the build.
    }
  };
  const at = () => new Date().toISOString();
  const rawFiles = (input as { files?: unknown } | null)?.files;
  const hash = Array.isArray(rawFiles) ? hashFiles(rawFiles.filter((f): f is CodeFile => typeof f?.path === "string" && typeof f?.content === "string")) : "none";

  // 1. Checking the files: the shape, the limits, the entry.
  step({ id: "check", label: "Checking the files", state: "running" });
  const parsed = CodeAppSchema.safeParse(input);
  if (!parsed.success) {
    const errors = schemaErrors(input, parsed.error.issues);
    step({ id: "check", label: "Checking the files", state: "failed", detail: firstProblem(errors) });
    return { ok: false, at: at(), hash, errors };
  }
  const app = parsed.data;
  const bytes = app.files.reduce((n, f) => n + f.content.length, 0);
  step({ id: "check", label: "Checking the files", state: "done", detail: `${count(app.files.length, "file")}, ${kb(bytes)}` });

  // 2. Compiling every file on its own, so every syntax error in every file is reported at once.
  const compileLabel = `Compiling ${count(app.files.length, "file")}`;
  step({ id: "compile", label: compileLabel, state: "running" });
  const compiled = await Promise.all(
    app.files.map(async (f) => {
      try {
        const r = await esbuild.transform(f.content, { loader: loaderFor(f.path), sourcefile: `app:${f.path}`, jsx: "automatic", jsxImportSource: "react", format: isCode(f.path) ? "esm" : undefined, target: "es2022", logLevel: "silent" });
        return { errors: [] as esbuild.Message[], warnings: r.warnings, code: isCode(f.path) ? r.code : "" };
      } catch (e) {
        return { ...messagesOf(e), code: "" };
      }
    }),
  );
  const compileErrors = compiled.flatMap((c) => c.errors).map(toBuildError).slice(0, MAX_MESSAGES);
  if (compileErrors.length) {
    step({ id: "compile", label: compileLabel, state: "failed", detail: firstProblem(compileErrors) });
    return { ok: false, at: at(), hash, errors: compileErrors };
  }
  step({ id: "compile", label: compileLabel, state: "done" });

  // 3. Bundling: resolve imports among the files, keep allowed packages for the import map, refuse the rest.
  // The label's count comes from the compiled imports; the bundler's own count (exact) replaces it when done.
  const seen = new Set<string>(["react", "react-dom"]);
  for (const c of compiled) for (const m of c.code.matchAll(/(?:^|[\s;])(?:import|export)\s*(?:[^"';]*?\sfrom\s*)?["']([^"'./][^"']*)["']/g)) if (isAllowedPackage(m[1])) seen.add(packageRoot(m[1]));
  step({ id: "bundle", label: `Bundling with ${count(seen.size, "package")}`, state: "running" });
  let out: Bundled;
  try {
    out = await bundle(app);
  } catch (e) {
    const errors = messagesOf(e).errors.map(toBuildError).slice(0, MAX_MESSAGES);
    step({ id: "bundle", label: `Bundling with ${count(seen.size, "package")}`, state: "failed", detail: firstProblem(errors) });
    return { ok: false, at: at(), hash, errors };
  }
  const bundleLabel = `Bundling with ${count(out.packages.length, "package")}`;
  const size = Buffer.byteLength(out.js) + Buffer.byteLength(out.css);
  if (size > MAX_OUTPUT_BYTES) {
    const errors = [{ message: `The built app is ${kb(size)}; the most Prod AI can run is ${kb(MAX_OUTPUT_BYTES)}. Make the files smaller.` }];
    step({ id: "bundle", label: bundleLabel, state: "failed", detail: errors[0].message });
    return { ok: false, at: at(), hash, errors };
  }
  step({ id: "bundle", label: bundleLabel, state: "done", detail: out.packages.join(", ") });

  // 4. Ready: the bundle (with its line table for runtime errors) and the stylesheet.
  const lines = lineTable(out.map);
  const table = lines ? JSON.stringify(lines) : "";
  const js = table && table.length < 60_000 && size + table.length < MAX_OUTPUT_BYTES ? `${out.js.trimEnd()}${LINE_TABLE_MARK}${table}\n` : out.js;
  const warnings = [...compiled.flatMap((c) => c.warnings), ...out.warnings].map(toBuildError).slice(0, MAX_MESSAGES);
  step({ id: "ready", label: "Ready to start", state: "done", detail: kb(size) });
  return { ok: true, at: at(), hash, js, css: out.css, warnings };
}

/** The packages an app imports (by root name, React always included), for the downloadable project's package.json. */
export async function packagesUsed(app: CodeApp): Promise<string[]> {
  try {
    return (await bundle(app)).packages;
  } catch {
    // It doesn't build: list what its files name that Prod AI allows, so the download still installs them.
    const names = new Set<string>(["react", "react-dom"]);
    for (const f of app.files) for (const m of f.content.matchAll(/from\s*["']([^"'./][^"']*)["']|import\s*["']([^"'./][^"']*)["']/g)) {
      const spec = m[1] ?? m[2];
      if (spec && isAllowedPackage(spec)) names.add(packageRoot(spec));
    }
    return [...names].sort();
  }
}
