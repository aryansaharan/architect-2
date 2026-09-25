import { Fragment } from "react";
import { cn } from "@/lib/utils";

type Lang = "ts" | "tsx" | "py" | "yaml" | "md" | "json" | "sql" | "sh" | "env" | "txt" | "toml";

const KW: Record<string, string[]> = {
  py: ["def", "class", "return", "import", "from", "as", "if", "else", "elif", "for", "in", "while", "with", "async", "await", "try", "except", "raise", "None", "True", "False", "and", "or", "not", "lambda", "yield", "pass", "is"],
  ts: ["import", "export", "from", "const", "let", "var", "function", "return", "async", "await", "if", "else", "for", "of", "in", "new", "type", "interface", "extends", "default", "true", "false", "null", "undefined", "as", "try", "catch", "throw", "class"],
  sql: ["create", "table", "primary", "key", "default", "not", "null", "references", "alter", "enable", "row", "level", "security", "policy", "on", "using", "select", "from", "where", "in", "check", "insert", "into", "values", "uuid", "text", "numeric", "date", "boolean", "timestamptz"],
};

type Tok = { t: string; c?: string };

function tokenize(code: string, lang: Lang): Tok[] {
  const l = lang === "tsx" ? "ts" : lang;
  if (l === "md") {
    return code.split(/(\n)/).map((line) =>
      /^#{1,6} /.test(line) ? { t: line, c: "text-amber font-semibold" } : /^>/.test(line) ? { t: line, c: "text-muted-foreground italic" } : /^\s*[-*\d]+[.)]? /.test(line) ? { t: line, c: "text-foreground/90" } : /^\|/.test(line) ? { t: line, c: "text-change/90" } : { t: line },
    );
  }
  const comment = l === "py" || l === "yaml" || l === "sh" || l === "env" || l === "toml" ? "#[^\\n]*" : l === "sql" ? "--[^\\n]*" : l === "ts" ? "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/" : "(?!)";
  const str = `"(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*'${l === "ts" ? "|`(?:[^`\\\\]|\\\\.)*`" : ""}${l === "py" ? '|"""[\\s\\S]*?"""' : ""}`;
  const key = l === "yaml" ? "^[ \\t-]*[A-Za-z0-9_]+(?=:)" : l === "json" ? '"[^"\\n]*"(?=\\s*:)' : l === "env" ? "^[A-Z0-9_]+(?==)" : "(?!)";
  const num = "\\b\\d+(?:\\.\\d+)?\\b";
  const kw = KW[l] ? `\\b(?:${KW[l].join("|")})\\b` : "(?!)";
  const deco = l === "py" ? "@[A-Za-z_][\\w.]*" : "(?!)";
  const re = new RegExp(`(${comment})|(${key})|(${l === "py" ? '"""[\\s\\S]*?"""|' : ""}${str})|(${deco})|(${kw})|(${num})`, l === "sql" ? "gmi" : "gm");
  const out: Tok[] = [];
  let last = 0;
  for (const m of code.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ t: code.slice(last, i) });
    const [whole, c, k, s, d, w, n] = m;
    out.push({
      t: whole,
      c: c ? "text-faint italic" : k ? "text-change" : s ? "text-read/90" : d ? "text-fix" : w ? "text-amber/90" : n ? "text-fix" : undefined,
    });
    last = i + whole.length;
  }
  if (last < code.length) out.push({ t: code.slice(last) });
  return out;
}

export function CodeView({ code, lang, className, lineNumbers = true, highlightLines }: { code: string; lang: Lang; className?: string; lineNumbers?: boolean; highlightLines?: Set<number> }) {
  const toks = tokenize(code, lang);
  // split tokens into lines for numbering
  const lines: Tok[][] = [[]];
  for (const tok of toks) {
    const parts = tok.t.split("\n");
    parts.forEach((p, i) => {
      if (i > 0) lines.push([]);
      if (p) lines[lines.length - 1].push({ t: p, c: tok.c });
    });
  }
  if (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
  return (
    <pre className={cn("code-face overflow-auto text-[12.5px] leading-[1.65]", className)}>
      <code className="block min-w-max py-3">
        {lines.map((line, i) => (
          <span key={i} className={cn("flex px-3", highlightLines?.has(i + 1) && "bg-amber-soft")}>
            {lineNumbers && <span className="mr-4 inline-block w-7 shrink-0 select-none text-right text-faint/70">{i + 1}</span>}
            <span className="whitespace-pre text-foreground/85">
              {line.map((t, j) => (
                <Fragment key={j}>{t.c ? <span className={t.c}>{t.t}</span> : t.t}</Fragment>
              ))}
              {line.length === 0 ? " " : null}
            </span>
          </span>
        ))}
      </code>
    </pre>
  );
}
