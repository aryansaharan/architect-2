import type { Manifest } from "@/lib/code-apps/schema";

/**
 * What a change to a code app does to its files, as the margin shows it. The proposal itself is made and
 * checked on the server (lib/code-apps/change.ts): `files` lists each file it adds, changes or removes.
 */
export type CodeFileChange = { path: string; action: "add" | "change" | "remove" };

/** The files a proposal (or a history entry's meta) touches, or null when it isn't a code change. */
export function codeChangesOf(p: unknown): CodeFileChange[] | null {
  if (!p || typeof p !== "object") return null;
  const files = (p as { files?: unknown }).files;
  if (!Array.isArray(files)) return null;
  return files
    .filter((f): f is CodeFileChange => Boolean(f) && typeof f === "object" && typeof (f as CodeFileChange).path === "string" && ["add", "change", "remove"].includes((f as CodeFileChange).action))
    .slice(0, 40);
}

const VERB: Record<CodeFileChange["action"], string> = { add: "adds", change: "changes", remove: "removes" };
export const actionWord = (a: CodeFileChange["action"]) => VERB[a];

/** "Changes 2 files", "Adds 1 file and changes 2", "Removes 1 file": what a code change touches, in plain words. */
export function codeTouchWords(files: CodeFileChange[]): string {
  if (!files.length) return "A small change";
  const n = (a: CodeFileChange["action"]) => files.filter((f) => f.action === a).length;
  const parts = (["add", "change", "remove"] as const).filter((a) => n(a) > 0).map((a, i) => `${i === 0 ? VERB[a][0].toUpperCase() + VERB[a].slice(1) : VERB[a]} ${n(a)}`);
  const last = parts.pop()!;
  const words = parts.length ? `${parts.join(", ")} and ${last}` : last;
  return `${words} ${files.length === 1 ? "file" : "files"}`;
}

/** Starter notes for a code app: things people often ask of the kind of app it is. Claude writes each one. */
export function codeSuggestions(manifest: Manifest | undefined): string[] {
  const kind = `${manifest?.kind ?? ""} ${manifest?.title ?? ""}`.toLowerCase();
  const out: string[] = [];
  if (/game|quiz|puzzle|trivia|match/.test(kind)) out.push("Add a high score list", "Add a sound when you win");
  else if (/portfolio|site|page|blog|landing/.test(kind)) out.push("Add a contact section", "Make the headings bigger");
  else out.push("Make it easier to use on a phone");
  out.push("Add a dark mode");
  return out.slice(0, 3);
}
