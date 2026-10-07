import type { CodeFile } from "@/lib/code-apps/schema";

/** One thing that went wrong, from the build (esbuild) or from the running app (prod:error). */
export type FixError = { file?: string; line?: number; column?: number; message: string; stack?: string; source?: "build" | "runtime" | "start" };

const q = (s: string) => `“${s}”`;

/**
 * A build or runtime error in plain words. Known shapes are said simply; anything else is shown as it came,
 * since the real message is more useful than a vague one. The raw message is always shown beside it.
 */
export function plainError(message: string): string {
  const m = message.replace(/^(Uncaught\s+)?(Error|TypeError|ReferenceError|SyntaxError|RangeError):\s*/, "").trim();
  let x: RegExpMatchArray | null;
  if ((x = m.match(/Could not resolve "(.+?)"/))) return x[1].startsWith(".") ? `It imports ${q(x[1])}, but there's no file with that name.` : `It imports ${q(x[1])}, which isn't one of the packages a Prod AI app can use.`;
  if ((x = m.match(/No matching export in "(.+?)" for import "(.+?)"/))) return `It imports ${q(x[2])} from ${q(x[1])}, but that file doesn't share anything by that name.`;
  if ((x = m.match(/Expected "(.+?)" but found "(.+?)"/))) return `A typo in the code: ${q(x[1])} should come here, not ${q(x[2])}.`;
  if ((x = m.match(/Expected "(.+?)" but found end of file/))) return `The file ends too soon: a ${q(x[1])} is missing.`;
  if ((x = m.match(/Unexpected "(.+?)"/))) return `A typo in the code: ${q(x[1])} doesn't belong here.`;
  if (/Unterminated (string|template)/.test(m)) return "Some text in quotes is never closed.";
  // In JSX this nearly always means a { or a tag above it wasn't closed, so the closing tag reads as a pattern.
  if (/Unterminated regular expression/.test(m)) return "A typo in the code: something just before this isn't closed, often a } or a tag.";
  if ((x = m.match(/The symbol "(.+?)" has already been declared/))) return `${q(x[1])} is defined twice.`;
  if ((x = m.match(/Unexpected closing "(.+?)" tag does not match opening "(.+?)" tag/))) return `A closing ${q(x[1])} tag doesn't match the ${q(x[2])} tag it should close.`;
  if ((x = m.match(/^(\S+) is not defined/))) return `The app uses ${q(x[1])}, which doesn't exist.`;
  if ((x = m.match(/Cannot read propert(?:y|ies) of (undefined|null) \(reading '(.+?)'\)/))) return `The app tried to read ${q(x[2])} from something that's empty.`;
  if ((x = m.match(/^(.+?) is not a function/))) return `The app called ${q(x[1])} as if it could run, but it can't.`;
  if ((x = m.match(/^(.+?) is not iterable/))) return `The app tried to go through ${q(x[1])} as a list, but it isn't one.`;
  if (/Element type is invalid/.test(m)) return "Something the app shows on screen doesn't exist, or isn't shared the right way from its file.";
  if (/Too many re-renders|Maximum update depth exceeded/.test(m)) return "The app keeps redrawing itself in a loop.";
  if (/Rendered (more|fewer) hooks/.test(m)) return "A part of the app uses React hooks in a changing order.";
  if (/Failed to (fetch dynamically imported module|resolve module specifier)/.test(m)) return "A package the app uses couldn't be loaded.";
  if ((x = m.match(/didn't start within (\d+) seconds/))) return `The app didn't show anything within ${x[1]} seconds.`;
  return m || "Something went wrong.";
}

/** The line the error points at, from the app's own files, when it's handy (trimmed, not too long). */
export function codeLine(files: CodeFile[] | undefined, e: Pick<FixError, "file" | "line">): string | null {
  if (!files || !e.file || !e.line) return null;
  const f = files.find((x) => x.path === e.file || x.path === e.file?.replace(/^\.?\//, ""));
  const line = f?.content.split("\n")[e.line - 1];
  if (!line?.trim()) return null;
  const t = line.trim();
  return t.length > 140 ? `${t.slice(0, 137)}…` : t;
}

/** "App.jsx, line 12": where it is, in words. */
export function whereWords(e: Pick<FixError, "file" | "line">): string | null {
  if (!e.file) return null;
  return e.line ? `${e.file}, line ${e.line}` : e.file;
}

/** The same error said twice (a render loop, say) is shown once. */
export function sameError(a: FixError, b: FixError): boolean {
  return a.message === b.message && a.file === b.file && a.line === b.line;
}
