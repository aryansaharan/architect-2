import "server-only";
import { zip, type ZipEntry } from "@/lib/zip";
import { packagesUsed, packageRoot } from "./build";
import { PACKAGES } from "./packages";
import type { CodeApp } from "./schema";

/**
 * A code app as a real Vite project anyone can run on their own computer: `npm install && npm run dev`.
 * The app's files go in src/ unchanged; src/main.jsx mounts App the way the sandbox does; src/prod.js
 * stands in for window.prod (records in the browser's localStorage, and an AI that says it isn't
 * connected). Packages are the ones the app imports, at the versions the sandbox loads.
 */

/** "lucide-react" -> "0.511.0", read from the sandbox's own pinned URLs, so the download runs what the app ran. */
function pinnedVersion(name: string): string | null {
  const url = PACKAGES[name]?.url;
  const m = url ? /@(\d+\.\d+\.\d+[^/?]*)/.exec(url) : null;
  return m ? m[1] : null;
}

const kebab = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "my-app";

/** At-rules only Tailwind understands; a stylesheet using them needs Tailwind in scope in a Vite build too. */
const TAILWIND_RULES = /@(apply|theme|utility|variant|custom-variant|source|plugin|config)\b/;
const IMPORTS_TAILWIND = /@import\s+(?:url\()?\s*["']tailwindcss["']/;

const PROD_JS = `/**
 * A stand-in for Prod AI's window.prod, so this app runs on its own.
 * Records are kept in this browser's localStorage (per collection), so they stay on this computer only.
 * prod.ai.ask isn't connected here: inside Prod AI it calls Claude on the app owner's credits.
 */
const KEY = "prod:data:";
const read = (collection) => {
  try {
    return JSON.parse(localStorage.getItem(KEY + collection) || "[]");
  } catch {
    return [];
  }
};
const write = (collection, records) => localStorage.setItem(KEY + collection, JSON.stringify(records));
const check = (collection) => {
  if (typeof collection !== "string" || !/^[a-z][a-z0-9_]{0,39}$/.test(collection)) throw new Error('A collection name is lowercase letters, digits and _, like "scores".');
};
const plain = (values) => {
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error('Records are plain objects, like { name: "Ana", points: 42 }.');
  const { id: _id, createdAt: _createdAt, ...rest } = JSON.parse(JSON.stringify(values));
  return rest;
};
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export const prod = {
  data: {
    async list(collection, opts = {}) {
      check(collection);
      const limit = Math.max(1, Math.min(200, Math.floor(opts.limit ?? 50)));
      return read(collection).slice(0, limit);
    },
    async add(collection, values) {
      check(collection);
      const record = { ...plain(values), id: newId(), createdAt: new Date().toISOString() };
      write(collection, [record, ...read(collection)]);
      return record;
    },
    async update(collection, id, values) {
      check(collection);
      const records = read(collection);
      const at = records.findIndex((r) => r.id === id);
      if (at === -1) throw new Error("That record is gone.");
      const next = { ...records[at] };
      for (const [k, v] of Object.entries(plain(values))) {
        if (v === null) delete next[k];
        else next[k] = v;
      }
      records[at] = next;
      write(collection, records);
      return next;
    },
    async remove(collection, id) {
      check(collection);
      write(collection, read(collection).filter((r) => r.id !== id));
      return { ok: true, id };
    },
  },
  ai: {
    async ask() {
      throw new Error("AI isn't connected in this copy of the app. Inside Prod AI, prod.ai.ask answers with Claude.");
    },
  },
  user: () => ({ role: "owner", name: "You" }),
};

window.prod = prod;
`;

function mainJsx(app: CodeApp, tailwindFile: string | null): string {
  const css = app.files.filter((f) => f.path.endsWith(".css")).map((f) => f.path).sort();
  const entry = app.files.some((f) => f.path === "App.jsx") ? "App.jsx" : "App.tsx";
  return [
    `import "./prod.js";`,
    ...(tailwindFile ? [`import "./${tailwindFile}";`] : []),
    ...css.map((p) => `import ${JSON.stringify(`./${p}`)};`),
    `import { createRoot } from "react-dom/client";`,
    `import App from ${JSON.stringify(`./${entry}`)};`,
    ``,
    `// Mounted as Prod AI's sandbox mounts it (no StrictMode), so it behaves the same here.`,
    `createRoot(document.getElementById("root")).render(<App />);`,
    ``,
  ].join("\n");
}

function readme(app: CodeApp, name: string, packages: string[]): string {
  const m = app.manifest;
  const extra = packages.filter((p) => p !== "react" && p !== "react-dom");
  const entry = app.files.some((f) => f.path === "App.jsx") ? "App.jsx" : "App.tsx";
  const lines = [
    `# ${m.title}`,
    ...(m.tagline ? ["", m.tagline] : []),
    "",
    "Made with Prod AI. This is the app's real source code, as a Vite project.",
    "",
    "## Run it",
    "",
    "You need Node.js 20.19 or newer.",
    "",
    "```sh",
    "npm install && npm run dev",
    "```",
    "",
    "Then open the address it prints (usually http://localhost:5173). `npm run build` makes a static site in `dist/` you can host anywhere.",
    "",
    "## What's inside",
    "",
    `- \`src/${entry}\` and the other files in \`src/\`: the app, exactly as Prod AI runs it.`,
    "- `src/main.jsx`: puts the app on the page.",
    "- `src/prod.js`: a stand-in for Prod AI's `prod` helper. Records (`prod.data`) are saved in this browser's localStorage, so they stay on this computer. `prod.ai.ask` isn't connected outside Prod AI.",
    "- Styling: Tailwind CSS 4, through `@tailwindcss/vite`.",
    ...(extra.length ? [`- Packages: ${extra.join(", ")}.`] : []),
    ...(m.collections.length ? ["", `Collections the app keeps: ${m.collections.map((c) => `\`${c.name}\``).join(", ")}.`] : []),
    "",
    `Package name: \`${name}\`.`,
    "",
  ];
  return lines.join("\n");
}

/** The project's files, ready to zip. */
export async function exportFiles(app: CodeApp, projectName?: string): Promise<ZipEntry[]> {
  const name = kebab(app.manifest.title || projectName || "my-app");
  const used = await packagesUsed(app);
  const dependencies: Record<string, string> = {};
  for (const p of used) {
    const root = packageRoot(p);
    const v = pinnedVersion(root);
    if (v) dependencies[root] = v;
  }
  dependencies["react"] ??= pinnedVersion("react") ?? "19.2.0";
  dependencies["react-dom"] ??= pinnedVersion("react-dom") ?? dependencies["react"];
  const pkg = {
    name,
    private: true,
    version: "0.1.0",
    type: "module",
    scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
    dependencies: Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => (a < b ? -1 : 1))),
    devDependencies: { "@tailwindcss/vite": "^4.1.11", "@vitejs/plugin-react": "^5.0.0", tailwindcss: "^4.1.11", vite: "^7.1.0" },
  };
  const viteConfig = [
    `import { fileURLToPath, URL } from "node:url";`,
    `import { defineConfig } from "vite";`,
    `import react from "@vitejs/plugin-react";`,
    `import tailwindcss from "@tailwindcss/vite";`,
    ``,
    `export default defineConfig({`,
    `  plugins: [react(), tailwindcss()],`,
    `  // "@/components/Board" means src/components/Board, as in Prod AI.`,
    `  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },`,
    `});`,
    ``,
  ].join("\n");
  const title = app.manifest.title.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
  const indexHtml = `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${title}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n`;

  // Tailwind: the sandbox has it on every page; here one stylesheet brings it in, unless the app's own CSS already does.
  const cssFiles = app.files.filter((f) => f.path.endsWith(".css"));
  const importsTailwind = cssFiles.some((f) => IMPORTS_TAILWIND.test(f.content));
  const reserved = new Set(["main.jsx", "prod.js"]);
  const tailwindFile = importsTailwind ? null : app.files.some((f) => f.path === "tailwind.css") ? "prod-tailwind.css" : "tailwind.css";
  const src = app.files
    .filter((f) => !reserved.has(f.path))
    .map((f) => {
      // A stylesheet using @apply and friends without Tailwind in scope gets a reference to it (no second copy of its CSS).
      const content = f.path.endsWith(".css") && TAILWIND_RULES.test(f.content) && !IMPORTS_TAILWIND.test(f.content) && !/@reference\b/.test(f.content) ? `@reference "tailwindcss";\n${f.content}` : f.content;
      return { path: `src/${f.path}`, content };
    });

  return [
    { path: "package.json", content: JSON.stringify(pkg, null, 2) + "\n" },
    { path: "vite.config.js", content: viteConfig },
    { path: "index.html", content: indexHtml },
    { path: ".gitignore", content: "node_modules\ndist\n.DS_Store\n" },
    { path: "README.md", content: readme(app, name, used) },
    { path: "src/main.jsx", content: mainJsx(app, tailwindFile) },
    { path: "src/prod.js", content: PROD_JS },
    ...(tailwindFile ? [{ path: `src/${tailwindFile}`, content: `@import "tailwindcss";\n` }] : []),
    ...src,
  ];
}

/** The project as a .zip archive. */
export async function exportZip(app: CodeApp, projectName?: string): Promise<{ filename: string; bytes: Uint8Array<ArrayBuffer> }> {
  const files = await exportFiles(app, projectName);
  return { filename: `${kebab(app.manifest.title || projectName || "my-app")}.zip`, bytes: zip(files) };
}
