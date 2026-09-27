import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { noEmDash } from "@/lib/text";

/**
 * A small, safe markdown renderer for agent replies: headings, bold, italic,
 * inline code, links, lists, tables and fenced code. No HTML is ever injected.
 * Works on partial text while a reply is still streaming.
 */
type Theme = "studio" | "app";

const T = {
  studio: { text: "text-foreground/90", strong: "text-foreground", muted: "text-muted-foreground", code: "bg-deep border border-hairline text-foreground/90", link: "text-brand underline decoration-dotted underline-offset-4", th: "bg-deep text-muted-foreground", border: "border-hairline" },
  app: { text: "text-slate-800", strong: "text-slate-900", muted: "text-slate-500", code: "bg-slate-100 border border-slate-200 text-slate-800", link: "text-[var(--app-primary)] underline underline-offset-4", th: "bg-slate-50 text-slate-500", border: "border-slate-200" },
};

function inline(s: string, theme: Theme, key = 0): React.ReactNode[] {
  const t = T[theme];
  const out: React.ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (m[1]) out.push(<code key={k} className={cn("rounded px-1 py-px font-mono text-[0.9em]", t.code)}>{tok.slice(1, -1)}</code>);
    else if (m[2] || m[3]) out.push(<strong key={k} className={cn("font-semibold", t.strong)}>{tok.slice(2, -2)}</strong>);
    else if (m[4] || m[5]) out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    else if (m[6]) {
      const label = tok.slice(1, tok.indexOf("]("));
      out.push(<a key={k} href={m[7]} target="_blank" rel="noreferrer" className={t.link}>{label}</a>);
    }
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isDivider = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function Markdown({ text, theme = "studio", className }: { text: string; theme?: Theme; className?: string }) {
  const t = T[theme];
  const lines = noEmDash(text).replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    // fenced code
    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push(<pre key={k++} className={cn("overflow-x-auto rounded-lg p-2.5 font-mono text-[11.5px] leading-relaxed", t.code)}>{body.join("\n")}</pre>);
      continue;
    }
    // table
    if (isTableRow(line) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      blocks.push(
        <div key={k++} className={cn("overflow-x-auto rounded-lg border", t.border)}>
          <table className="w-full text-left text-[12px]">
            <thead><tr className={t.th}>{head.map((h, j) => <th key={j} className="px-2.5 py-1.5 font-medium">{inline(h, theme, j)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri} className={cn("border-t", t.border)}>{r.map((c, j) => <td key={j} className="px-2.5 py-1.5 align-top">{inline(c, theme, j)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    // lists
    const li = line.match(/^\s*([-*•]|\d+[.)])\s+(.*)/);
    if (li) {
      const ordered = /\d/.test(li[1]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*([-*•]|\d+[.)])\s+(.*)/);
        if (!m || /\d/.test(m[1]) !== ordered) break;
        items.push(m[2]);
        i++;
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(<Tag key={k++} className={cn("space-y-1 pl-5", ordered ? "list-decimal" : "list-disc", theme === "studio" ? "marker:text-faint" : "marker:text-slate-400")}>{items.map((it, j) => <li key={j}>{inline(it, theme, j)}</li>)}</Tag>);
      continue;
    }
    // headings
    const h = line.match(/^\s*(#{1,4})\s+(.*)/);
    if (h) {
      blocks.push(<p key={k++} className={cn("font-semibold", t.strong, h[1].length <= 2 ? "text-[14px]" : "text-[13px]")}>{inline(h[2], theme)}</p>);
      i++;
      continue;
    }
    // horizontal rule
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { i++; continue; }
    // paragraph: gather consecutive plain lines
    if (line.trim()) {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(```|#{1,4}\s|[-*•]\s|\d+[.)]\s)/.test(lines[i]) && !(isTableRow(lines[i]) && isDivider(lines[i + 1] ?? ""))) para.push(lines[i++]);
      blocks.push(<p key={k++}>{para.map((p, j) => <Fragment key={j}>{j > 0 && <br />}{inline(p, theme, j)}</Fragment>)}</p>);
      continue;
    }
    i++;
  }
  return <div className={cn("space-y-2 leading-relaxed", t.text, className)}>{blocks}</div>;
}
