import "server-only";
import { z } from "zod";
import { PACKAGE_LIST } from "./packages";
import { LIMITS, type BuildError, type CodeApp } from "./schema";
import { STYLE_RULE } from "@/lib/text";

/**
 * What Claude is told when it writes, changes or fixes a code app, and the shapes it answers in.
 * The answer shapes are deliberately loose (no lengths, patterns or counts) so they map onto strict
 * structured outputs; every answer is then checked against CodeAppSchema (lib/code-apps/schema.ts)
 * and Prod AI's own checks (checkApp in lib/code-apps/generate.ts) before anything is saved.
 */

const ModelCollection = z.object({
  name: z.string().describe("Lowercase letters, digits and _, starting with a letter, like scores or messages"),
  label: z.string().describe("A plain name for people, like High scores"),
  read: z.enum(["public", "team"]).describe("Who may read its records: public is anyone with the link, team is the owner and people they invite"),
  write: z.enum(["public", "team"]).describe("Who may add or change records"),
});

const ModelManifest = z.object({
  title: z.string().describe("The app's name, 1 to 5 words"),
  tagline: z.string().describe("One plain sentence saying what it is for, under 120 characters"),
  kind: z.string().describe('What it is in a few words, like "a memory game" or "a portfolio site"'),
  collections: z.array(ModelCollection).describe("Every prod.data collection the code uses. Empty when it saves nothing"),
  usesAI: z.boolean().describe("True only if the code calls prod.ai.ask"),
});

const ModelFile = z.object({
  path: z.string().describe('Relative path like "App.jsx", "components/Board.jsx" or "styles.css"'),
  content: z.string().describe("The complete file, ready to compile"),
});

/** A whole new app. The manifest comes first so the app's name can be shown while the files are written. */
export const WriteSchema = z.object({
  manifest: ModelManifest,
  files: z.array(ModelFile).describe("App.jsx first, then the files it imports"),
});
export type WriteOutput = z.infer<typeof WriteSchema>;

/** A change or a fix: whole-file replacements, new files and deletions, with a plain summary. */
export const EditSchema = z.object({
  answer: z.boolean().describe("True when the note is a question or needs no change to the files; then files and remove are empty"),
  summary: z.string().describe('What the change does, under 10 words, like "Add a timer and a best time". For a question: one change they could ask for, phrased as a request'),
  reply: z.string().describe("One to three plain sentences for the person: what changed and anything worth knowing, or the answer to their question"),
  files: z.array(ModelFile).describe("Every file added or changed, each with its COMPLETE new content"),
  remove: z.array(z.string()).describe("Paths of files to delete"),
  manifest: ModelManifest.nullable().describe("The full updated manifest when the title, collections or AI use change; otherwise null"),
});
export type EditOutput = z.infer<typeof EditSchema>;

/** How the app is built and run, what it may use, and the bar it has to clear. Shared by every task. */
const RULES = `How Prod AI runs the app
- React 19 function components and hooks. JSX uses the automatic runtime: never import React just for JSX (import hooks like useState from "react").
- The entry is App.jsx with a default export: export default function App() {...}. Prod AI mounts it into the page itself, so never call createRoot or render, and never write index.html, main.jsx or a package.json.
- Files: .jsx (preferred), .js, .css and .json (.tsx and .ts work too). Relative paths with no leading slash and no src/ folder, like "App.jsx", "components/Board.jsx", "lib/questions.js", "styles.css". Import between files with relative paths that include the extension: import Board from "./components/Board.jsx". At most ${LIMITS.files} files, each under ${Math.floor(LIMITS.fileBytes / 1000)} KB.
- Packages: only these exist (there is no npm install): ${PACKAGE_LIST}. Import them by exactly those names, for example import { motion, AnimatePresence } from "motion/react"; import { Heart, Star } from "lucide-react" (lucide-react 0.511: use well-known icon names only); import confetti from "canvas-confetti"; import * as THREE from "three" (three's addons such as OrbitControls are not available). Anything else fails the build.
- One page, no router: switch views with React state (or the URL hash).
- Styling: Tailwind CSS v4 utility classes in className. Tailwind's browser build is loaded, so every utility works, including arbitrary values (bg-[#0b1020], grid-cols-[1fr_2fr]), responsive, hover, focus-visible and motion-safe variants. Put what utilities can't express (keyframes, custom properties, a font) in a plain .css file imported from code: import "./styles.css". A .css file is plain CSS: no @tailwind, @apply, @theme or @import "tailwindcss".
- Fonts: system font stacks, or one or two Google Fonts loaded by an @import url("https://fonts.googleapis.com/css2?family=...&display=swap"); as the very first line of a .css file.

The sandbox (the app runs in a sealed frame)
- No network: never use fetch, XMLHttpRequest, WebSocket, EventSource or outside scripts, and never load images, video or audio from other sites. Draw with CSS, inline SVG, emoji, lucide icons, canvas or three.js. Sounds, if any, come from the Web Audio API.
- No storage: localStorage, sessionStorage, indexedDB and cookies throw an error in the sandbox. Keep state in React; save what must last with prod.data.
- No iframes. Links to other sites open in a new tab (target="_blank" rel="noreferrer").

Data and AI: window.prod (use it only when the idea needs saved data or AI)
- await prod.data.list(collection, { limit: 50 }) gives an array of records { id, createdAt, ...fields } (sort it yourself when order matters).
- await prod.data.add(collection, fields) saves a record and gives it back with its id and createdAt.
- await prod.data.update(collection, id, fields) and await prod.data.remove(collection, id).
- await prod.ai.ask(prompt) gives a plain-text answer. Each call costs the owner credits: call it only when the person asks for it (a button), never on load, in a loop, or on every keystroke. Show that it's thinking, and keep prompts under 4,000 characters.
- await prod.user() gives { role, name }: role is "owner", "member" (invited by the owner), "visitor" (anyone else with the link) or "preview" (the owner testing it in the studio). Show team-only views (an inbox of messages, moderation) to owner, member and preview, never to a visitor.
- Every prod call can fail (offline, too many requests, no permission): await it inside try/catch and show a short, friendly message. Show loading states. Field values are strings, numbers, booleans or small plain objects; a record stays under 4 KB.
- Declare every collection the code uses in manifest.collections with the least access that works: a contact form's messages are write "public", read "team"; a public leaderboard or guestbook is read "public", write "public"; private notes are read "team", write "team". In the studio the data is kept in memory and resets on reload, which is expected.

The bar
- Complete and working on the first run: every feature the description implies, wired up for real. No placeholders, no TODO or FIXME comments, no lorem ipsum, no "coming soon", no buttons that do nothing. When the app needs content (a portfolio's projects, quiz questions, words, levels), write real, specific content: at least 10 questions for a quiz, at least 4 projects for a portfolio.
- Looks great: a deliberate visual identity that fits the idea (palette, type scale, spacing, shape, motion), not a default template. Strong hierarchy, generous spacing, consistent radii, polished empty, loading, success and error states. Subtle motion (motion/react or CSS transitions) that respects prefers-reduced-motion.
- Responsive from 360 px phones to wide screens; the app fills the viewport (min-h-screen) and nothing overflows sideways.
- Accessible: semantic HTML (header, main, nav, section, button, form, label), every control usable by keyboard with a visible focus ring, labels for inputs, aria-label on icon-only buttons, aria-live for changing results (scores, answers, timers), text contrast of at least 4.5:1. Never rely on colour alone.
- Games: a clear start, score, win or lose state and restart; keyboard controls where natural; pause when it helps; clean up timers, listeners and animation frames in effects.
- Code: small, focused components (3 to 10 files is typical), clear names, no dead code, no console.log. Keep the whole app compact, about 800 lines in all (it is written in one go, and a shorter app that fully works beats a longer one): reach for Tailwind utilities, small data arrays and simple inline SVG rather than long hand-drawn artwork.
- Write characters such as emoji, accented letters, arrows and symbols as themselves, never as backslash-u escapes: inside JSX an escape is shown exactly as written.
- Words in the app: plain and friendly. Don't mention Prod AI, Claude or the sandbox unless asked.
${STYLE_RULE}`;

export const WRITE_INSTRUCTIONS = `You are a senior front-end engineer and product designer. From a short description you write a complete, working, beautiful web app as real React source files. Prod AI compiles them with esbuild and runs them in a sealed browser sandbox, so they must compile and run first time.

Return the manifest (title, tagline, kind, collections, usesAI), then the files: App.jsx first, then every file it imports.

${RULES}`;

export const CHANGE_INSTRUCTIONS = `You change a web app Prod AI made: real React source files, built and run under the rules below. You get the current files and a note from the person who owns the app.

- When the note is a question, or nothing in the files needs to change, set answer to true, answer it in reply (one to three plain sentences, about this app), suggest one change they could ask for in summary, and leave files and remove empty.
- Otherwise make the smallest change that fully does what was asked, and keep everything else exactly as it is: the same look, structure, content and behaviour. Return every file you add or change with its complete new content (never a diff, never "rest unchanged" comments), list files to delete in remove, and keep imports consistent with what you add or delete.
- summary is the change in under 10 words. reply says, in plain words, what changed and anything worth knowing. Both are a promise: describe only what your files do.
- Return manifest only when the title, tagline, collections or AI use change (then the whole manifest); otherwise null.

${RULES}`;

export const FIX_INSTRUCTIONS = `You fix a web app Prod AI made: real React source files, built and run under the rules below. It failed: a build error (with file, line and column), a runtime error from the sandbox (message and stack), or a failed check. Find the real cause and fix it.

- Return whole-file replacements for the files you change (complete content, never a diff), new files if something is missing, and deletions in remove. Fix what's broken and anything else that would fail the same way; keep the look, content and behaviour.
- Common causes: a package that isn't in the list (rewrite without it), an icon lucide-react 0.511 doesn't have (use a well-known one), a missing file or wrong import path or extension, a named or default export that doesn't match its import, localStorage or fetch (not allowed in the sandbox), an undefined variable, hooks called conditionally, a collection used in code but missing from the manifest.
- answer is false. summary says what you fixed in under 10 words, like "Fixed a missing import in Board.jsx". reply says what was wrong in one plain sentence.
- Return manifest only when it has to change (then the whole manifest); otherwise null.

${RULES}`;

/** The files as Claude reads them. */
export function filesBlock(app: Pick<CodeApp, "files">): string {
  return app.files.map((f) => `<file path="${f.path}">\n${f.content}\n</file>`).join("\n\n");
}

export function manifestBlock(app: Pick<CodeApp, "manifest">): string {
  return `<manifest>\n${JSON.stringify(app.manifest, null, 2)}\n</manifest>`;
}

export function writePrompt(brief: string, answers: string): string {
  const extra = answers.trim() ? `\n\nAnswers to a few quick questions (hints; ignore any that don't fit this kind of app):\n${answers.trim()}` : "";
  return `Write this app.\n\n<description>\n${brief}\n</description>${extra}`;
}

export function changePrompt(app: CodeApp, note: string): string {
  return `${manifestBlock(app)}\n\n${filesBlock(app)}\n\nThe owner's note:\n<note>\n${note}\n</note>`;
}

/** Lines around an error, numbered, so Claude can see exactly where it is. */
function excerpt(content: string, line: number): string {
  const lines = content.split("\n");
  const from = Math.max(1, line - 4);
  const to = Math.min(lines.length, line + 4);
  const out: string[] = [];
  for (let i = from; i <= to; i++) out.push(`${i === line ? ">" : " "}${String(i).padStart(4)} | ${lines[i - 1]}`);
  return out.join("\n");
}

export type ProblemReport = { build?: BuildError[]; runtime?: { message: string; stack?: string }; checks?: string[] };

export function fixPrompt(app: CodeApp, problem: ProblemReport): string {
  const parts: string[] = [];
  if (problem.build?.length) {
    parts.push("The build failed:");
    for (const e of problem.build) {
      const at = e.file ? `${e.file}${e.line ? `:${e.line}${e.column ? `:${e.column}` : ""}` : ""}` : "";
      parts.push(`- ${at ? `${at} ` : ""}${e.message}`);
      const file = e.file ? app.files.find((f) => f.path === e.file) : undefined;
      if (file && e.line) parts.push(excerpt(file.content, e.line));
    }
  }
  if (problem.runtime) {
    parts.push(`It compiled, then failed while running in the sandbox:\n${problem.runtime.message}${problem.runtime.stack ? `\n${problem.runtime.stack}` : ""}`);
  }
  if (problem.checks?.length) {
    parts.push(`It failed Prod AI's checks:\n${problem.checks.map((c) => `- ${c}`).join("\n")}`);
  }
  return `${manifestBlock(app)}\n\n${filesBlock(app)}\n\n<problem>\n${parts.join("\n")}\n</problem>`;
}
