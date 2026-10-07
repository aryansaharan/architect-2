import "server-only";
import type { ChangeOperation, ChangeProposal } from "@/lib/db/types";
import { promptHoldUsd, type ModelHold } from "@/lib/llm/guard";
import type { ModelHandle } from "@/lib/llm/provider";
import type { ModelSpend } from "@/lib/llm/pricing";
import { PRICE } from "@/lib/prices";
import { CHANGE_INSTRUCTIONS, FIX_INSTRUCTIONS, changePrompt, fixPrompt } from "./prompts";
import { EDIT_MAX_OUTPUT, applyEdit, checkApp, editWithClaude, fileChanges, hashOf, sameManifest, stable, type FileChange } from "./generate";
import type { CodeApp, CodeFile, Manifest } from "./schema";

/**
 * A note on a code app: Claude reads the current files and proposes whole-file replacements, new files
 * and deletions with a plain summary. The proposal is checked (CodeAppSchema and Prod AI's checks) before
 * it's quoted as a Work Order: PRICE.codeChange to apply, free when nothing changes (a question answered).
 * Apply (lib/actions/change.ts) checks it again against the files as they are then.
 */

/** What a code change does to the files, kept on the Work Order's proposal. */
export type CodeEdit = {
  /** Files added or changed, each with its whole new content. */
  write: CodeFile[];
  /** Files deleted. */
  remove: string[];
  /** The whole new manifest when it changes; null when it doesn't. */
  manifest: Manifest | null;
  /** Each touched file's content hash when the quote was made (null: it didn't exist), so Apply knows if it changed since. */
  base: Record<string, string | null>;
  /** The manifest's hash when the quote was made. */
  baseManifest: string;
};

/**
 * A code change's proposal: a ChangeProposal (so the notes thread and the Work Order card show it as they do
 * any change) whose `operations` name the files it touches ("/files/App.jsx"), with the files themselves in `code`.
 */
export type CodeChangeProposal = ChangeProposal & { code: CodeEdit; files: FileChange[] };

export const isCodeProposal = (p: ChangeProposal | null | undefined): p is CodeChangeProposal =>
  Boolean(p && typeof p === "object" && "code" in p && p.code && typeof p.code === "object" && Array.isArray((p as CodeChangeProposal).code.write));

const manifestHash = (m: Manifest) => hashOf(stable(m));

/** The most the first attempt at a quote can cost (a retry, when the checks ask for one, is held on its own). */
export function codeChangeHoldUsd(app: CodeApp, note: string): number {
  return promptHoldUsd(CHANGE_INSTRUCTIONS.length + changePrompt(app, note).length, EDIT_MAX_OUTPUT);
}

export type CodeQuote = { proposal: CodeChangeProposal; spent: ModelSpend[] } | { proposal: null; spent: ModelSpend[]; error: string };

/**
 * Claude's proposal for a note on this app, checked. `holdRetry` holds the model budget for a second
 * attempt (when the first doesn't pass the checks); without a hold, there's no retry.
 */
export async function proposeCodeChange(
  m: ModelHandle,
  app: CodeApp,
  note: string,
  opts: { userId: string; holdRetry: (estimateUsd: number) => Promise<ModelHold> },
): Promise<CodeQuote> {
  const spent: ModelSpend[] = [];
  const first = await editWithClaude(m, { instructions: CHANGE_INSTRUCTIONS, prompt: changePrompt(app, note), userId: opts.userId });
  spent.push(first.spent);
  if (!first.edit) return { proposal: null, spent, error: "Claude didn't answer in time. Nothing was charged. Try again." };
  const edit = first.edit;

  // A question, or nothing to change: answered, free.
  const draft = applyEdit(app, edit);
  const touches = fileChanges(app, draft).length > 0 || !sameManifest(app.manifest, draft.manifest);
  if (edit.answer || !touches) {
    return {
      proposal: {
        summary: edit.summary || "Ask for a change",
        rationale: edit.reply || "Nothing in the app needs to change for that.",
        operations: [],
        blastRadius: { screens: [], agents: [], files: 0 },
        credits: 0,
        minutes: 0,
        mode: "live",
        answer: true,
        code: { write: [], remove: [], manifest: null, base: {}, baseManifest: manifestHash(app.manifest) },
        files: [],
      },
      spent,
    };
  }

  let checked = await checkApp(draft);
  if (!checked.ok) {
    console.warn("[code-apps] a change didn't pass the checks, retrying once:", checked.errors.slice(0, 5));
    const text = fixPrompt(checked.draft as CodeApp, { checks: checked.errors });
    const hold = await opts.holdRetry(promptHoldUsd(FIX_INSTRUCTIONS.length + text.length, EDIT_MAX_OUTPUT));
    if (hold.ok) {
      try {
        const retry = await editWithClaude(m, { instructions: FIX_INSTRUCTIONS, prompt: text, userId: opts.userId });
        spent.push(retry.spent);
        if (retry.edit) checked = await checkApp(applyEdit(checked.draft, retry.edit));
      } finally {
        await hold.release();
      }
    }
    if (!checked.ok) {
      console.warn("[code-apps] the change still didn't pass the checks:", checked.errors.slice(0, 5));
      return { proposal: null, spent, error: "Claude's change didn't pass Prod AI's checks, so it isn't offered. Nothing was charged. Try saying it another way." };
    }
  }

  const next = checked.app;
  return { proposal: codeProposal(app, next, edit.summary, edit.reply), spent };
}

/** The Work Order's proposal for going from one version of the files to another. */
function codeProposal(before: CodeApp, after: CodeApp, summary: string, reply: string): CodeChangeProposal {
  const files = fileChanges(before, after);
  const manifestChanged = !sameManifest(before.manifest, after.manifest);
  const old = new Map(before.files.map((f) => [f.path, f.content]));
  const changed = new Set(files.filter((c) => c.action !== "remove").map((c) => c.path));
  const operations: ChangeOperation[] = [
    ...files.map((c): ChangeOperation => ({ op: c.action === "add" ? "add" : c.action === "remove" ? "remove" : "set", path: `/files/${c.path}` })),
    ...(manifestChanged ? [{ op: "set" as const, path: "/manifest" }] : []),
  ];
  return {
    summary: summary || "Change the app",
    rationale: reply,
    operations,
    blastRadius: { screens: [], agents: [], files: Math.max(1, files.length) },
    credits: PRICE.codeChange,
    minutes: 1,
    mode: "live",
    code: {
      write: after.files.filter((f) => changed.has(f.path)),
      remove: files.filter((c) => c.action === "remove").map((c) => c.path),
      manifest: manifestChanged ? after.manifest : null,
      base: Object.fromEntries(files.map((c) => [c.path, old.has(c.path) ? hashOf(old.get(c.path)!) : null])),
      baseManifest: manifestHash(before.manifest),
    },
    files,
  };
}

export type AppliedCodeChange = { ok: true; app: CodeApp; files: FileChange[]; changed: boolean } | { ok: false; error: string };

/**
 * A quoted change applied to the files as they are now. Refused when a file it touches (or the manifest)
 * changed since the quote; the result is checked again, since a stored proposal is never trusted.
 */
export async function applyCodeChange(current: CodeApp, edit: CodeEdit): Promise<AppliedCodeChange> {
  const stale = "The app changed since this quote, so it no longer fits. Nothing was charged. Ask again for a fresh quote.";
  if (!Array.isArray(edit.write) || !Array.isArray(edit.remove) || !edit.base || typeof edit.base !== "object") return { ok: false, error: stale };
  const now = new Map(current.files.map((f) => [f.path, f.content]));
  for (const [path, hash] of Object.entries(edit.base)) {
    const content = now.get(path);
    if ((content === undefined ? null : hashOf(content)) !== hash) return { ok: false, error: stale };
  }
  if (edit.manifest && edit.baseManifest !== manifestHash(current.manifest)) return { ok: false, error: stale };
  const checked = await checkApp(applyEdit(current, { files: edit.write, remove: edit.remove, manifest: edit.manifest }));
  if (!checked.ok) {
    console.warn("[code-apps] a quoted change no longer checks out:", checked.errors.slice(0, 5));
    return { ok: false, error: "This change no longer checks out against the app. Nothing was charged. Ask again for a fresh quote." };
  }
  const files = fileChanges(current, checked.app);
  return { ok: true, app: checked.app, files, changed: files.length > 0 || !sameManifest(current.manifest, checked.app.manifest) };
}
