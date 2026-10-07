import "server-only";
import { transform } from "esbuild";
import type { Blueprint, ObjectRef } from "@/lib/blueprint/schema";
import { generateFiles } from "@/lib/codegen/files";

/**
 * The code making an app real writes, really compiled. Every TypeScript and TSX file goes through
 * esbuild (syntax, JSX), JSON is parsed, and the rest (Python, YAML, SQL, Markdown) is written as is:
 * nothing here pretends to run Python. A file that fails to compile is reported with its line.
 */

export type CompiledFile = {
  path: string;
  lines: number;
  objectRef?: ObjectRef;
  outcome: "compiled" | "parsed" | "written" | "failed";
  error?: { line?: number; column?: number; message: string };
};

export async function compileProject(bp: Blueprint): Promise<CompiledFile[]> {
  const files = generateFiles(bp);
  return Promise.all(
    files.map(async (f): Promise<CompiledFile> => {
      const base = { path: f.path, lines: f.content.split("\n").length, objectRef: f.objectRef };
      if (f.lang === "ts" || f.lang === "tsx") {
        try {
          await transform(f.content, { loader: f.lang, jsx: "automatic", format: "esm", target: "es2022", sourcefile: f.path, logLevel: "silent" });
          return { ...base, outcome: "compiled" };
        } catch (e) {
          const first = (e as { errors?: { text: string; location?: { line: number; column: number } | null }[] }).errors?.[0];
          return { ...base, outcome: "failed", error: { line: first?.location?.line, column: first?.location?.column, message: first?.text ?? (e instanceof Error ? e.message : "It didn't compile") } };
        }
      }
      if (f.lang === "json") {
        try {
          JSON.parse(f.content);
          return { ...base, outcome: "parsed" };
        } catch (e) {
          return { ...base, outcome: "failed", error: { message: e instanceof Error ? e.message : "It isn't valid JSON" } };
        }
      }
      return { ...base, outcome: "written" };
    }),
  );
}

/** "12 compiled · 2 parsed · 9 written": what happened to the files, in print. */
export function compiledWords(files: CompiledFile[]): string {
  const n = (o: CompiledFile["outcome"]) => files.filter((f) => f.outcome === o).length;
  const parts = [`${n("compiled")} compiled with esbuild`, n("parsed") ? `${n("parsed")} JSON checked` : "", n("written") ? `${n("written")} written as is` : "", n("failed") ? `${n("failed")} failed` : ""].filter(Boolean);
  return `${files.length} files · ${parts.join(" · ")}`;
}
