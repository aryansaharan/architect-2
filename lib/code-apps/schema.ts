import { z } from "zod";

/**
 * A code app: real source files Claude writes, plus a manifest of what it is and what data it keeps.
 * The files run in the browser (React 19, Tailwind via its browser build, and the packages in
 * lib/code-apps/packages.ts), inside a sandbox that can reach Prod AI only through window.prod
 * (docs/CODE-APPS.md). This is the one source of truth for that shape, on the server and in the browser.
 */

export const LIMITS = { files: 24, fileBytes: 60_000, totalBytes: 300_000, collections: 8, collectionName: 40 } as const;

/** Paths are relative, lowercase-friendly, no "..", ending in a known extension. The entry is App.jsx or App.tsx. */
const PATH = /^(?!.*\.\.)(?!\/)[A-Za-z0-9_\-/]{1,80}\.(jsx|tsx|js|ts|css|json)$/;

export const CodeFileSchema = z.object({
  path: z.string().regex(PATH, "A file path must be relative and end in .jsx, .tsx, .js, .ts, .css or .json"),
  content: z.string().max(LIMITS.fileBytes),
});
export type CodeFile = z.infer<typeof CodeFileSchema>;

/**
 * A place the app keeps records (prod.data). Who may read and who may add or change:
 * "public" is anyone with the link; "team" is the owner and the people they invite.
 * Records live in app_records (entity_id = the collection's name) under the same 2,000-per-app cap.
 */
export const CollectionSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "A collection name is lowercase letters, digits and _"),
  label: z.string().max(60),
  read: z.enum(["public", "team"]),
  write: z.enum(["public", "team"]),
});
export type Collection = z.infer<typeof CollectionSchema>;

export const ManifestSchema = z.object({
  title: z.string().min(1).max(60),
  tagline: z.string().max(140),
  /** What kind of thing it is, in a few words: "a memory game", "a portfolio site". */
  kind: z.string().max(60),
  collections: z.array(CollectionSchema).max(LIMITS.collections).default([]),
  /** The app calls prod.ai.ask (paid from the owner's credits, 5 a call). */
  usesAI: z.boolean().default(false),
});
export type Manifest = z.infer<typeof ManifestSchema>;

export const CodeAppSchema = z
  .object({
    files: z.array(CodeFileSchema).min(1).max(LIMITS.files),
    manifest: ManifestSchema,
  })
  .superRefine((app, ctx) => {
    const paths = app.files.map((f) => f.path);
    if (new Set(paths).size !== paths.length) ctx.addIssue({ code: "custom", message: "Two files share a path" });
    if (!paths.some((p) => p === "App.jsx" || p === "App.tsx")) ctx.addIssue({ code: "custom", message: "The app needs an App.jsx (or App.tsx) entry" });
    const total = app.files.reduce((s, f) => s + f.content.length, 0);
    if (total > LIMITS.totalBytes) ctx.addIssue({ code: "custom", message: `The app's files are ${total} bytes; the most is ${LIMITS.totalBytes}` });
  });
export type CodeApp = z.infer<typeof CodeAppSchema>;

/** The result of a real build (lib/code-apps/build.ts), stored on the project and, when published, on the site. */
export type BuildError = { file?: string; line?: number; column?: number; message: string };
export type BuildResult =
  | { ok: true; at: string; hash: string; js: string; css: string; warnings: BuildError[] }
  | { ok: false; at: string; hash: string; errors: BuildError[] };

/** What a published code app serves (never its source files). */
export type PublishedBuild = { hash: string; js: string; css: string; manifest: Manifest };
