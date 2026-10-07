"use client";
import { useLayoutEffect, useRef } from "react";
import { drawDrawing, nextTurn, prefersReducedMotion } from "@/components/motion/entry-draw";
import { cn } from "@/lib/utils";

/** How many lines a file has ("42 lines"), not counting a final newline. */
export function lineCount(content: string): number {
  if (!content) return 0;
  return content.replace(/\n$/, "").split("\n").length;
}

const words = (name: string) =>
  name
    .replace(/\.(jsx|tsx|js|ts|css|json)$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .toLowerCase()
    .trim();

/** What a file is for, when its name makes it obvious. Null when it doesn't: better nothing than a guess. */
export function whatFileDoes(path: string): string | null {
  const base = path.split("/").pop() ?? path;
  const dir = path.includes("/") ? path.split("/").slice(0, -1).join("/").toLowerCase() : "";
  if (/^App\.(jsx|tsx)$/.test(path)) return "Where the app starts";
  if (base.endsWith(".css")) return "How it looks";
  if (base.endsWith(".json")) return "Content it comes with";
  if (/^use[A-Z]/.test(base) || /(^|\/)hooks?$/.test(dir)) return `Shared logic: ${words(base.replace(/^use/, ""))}`;
  if (/(^|\/)(utils?|lib|helpers?)$/.test(dir) || /^(utils?|helpers?)\./.test(base)) return "Helpers the other files use";
  if (/(^|\/)(data|content)$/.test(dir)) return `Built-in ${words(base)}`;
  if (/(^|\/)(components?|ui|screens?|pages?|views?)$/.test(dir) && /^[A-Z]/.test(base)) return `Draws the ${words(base)}`;
  if (/^[A-Z]/.test(base) && /\.(jsx|tsx)$/.test(base)) return `Draws the ${words(base)}`;
  return null;
}

/** A few lines that show what a file is: past its imports, without blank lines, each kept short. */
export function excerpt(content: string, n = 5): string[] {
  const lines = content.split("\n");
  const body = lines.filter((l) => l.trim() && !/^\s*(import|export \* from|\/\/|\/\*|\*)/.test(l));
  return (body.length ? body : lines.filter((l) => l.trim())).slice(0, n).map((l) => {
    const t = l.replace(/\t/g, "  ").replace(/\s+$/, "");
    return t.length > 64 ? `${t.slice(0, 63)}…` : t;
  });
}

/** A sketch card's outline (the same uneven corners as .sketch), stretched to the card. Starts top left, like a hand would. */
const OUTLINE = "M4.2 0.75H98Q99.25 0.75 99.25 5.6V97.6Q99.25 99.25 96 99.25H2.1Q0.75 99.25 0.75 93.5V3.4Q0.75 0.75 4.2 0.75Z";

/**
 * One file as Claude writes it, in pencil: the outline drawn as it arrives, its name written in, and a few
 * of its lines fading in as they come (a file can arrive in growing parts). Re-renders never redraw it.
 */
export function WritingFileCard({ path, content, done }: { path: string; content: string; done: boolean }) {
  const card = useRef<HTMLLIElement>(null);
  const started = useRef(false);
  useLayoutEffect(() => {
    if (started.current || !card.current) return;
    started.current = true;
    if (prefersReducedMotion()) return;
    drawDrawing(card.current, { delay: nextTurn("file", 200), duration: 700 });
  }, []);
  const lines = excerpt(content);
  const n = lineCount(content);
  return (
    <li ref={card} className="relative min-w-0 border-[1.25px] border-transparent px-3 pb-3 pt-2.5 sm:px-4">
      <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute -left-[1.25px] -top-[1.25px] h-[calc(100%+2.5px)] w-[calc(100%+2.5px)] overflow-visible">
        <path data-fade="" d={OUTLINE} fill="var(--panel)" fillOpacity={0.7} />
        <path data-stroke="" d={OUTLINE} fill="none" stroke="var(--graphite)" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="relative flex items-baseline gap-2">
        <p data-write="" className="min-w-0 flex-1 truncate font-mono text-badge text-foreground">
          {path}
        </p>
        <span className="shrink-0 text-meta tabular-nums text-faint">
          {n} {n === 1 ? "line" : "lines"}
          {!done && <span className="sr-only"> so far</span>}
        </span>
      </div>
      {/* The code itself, in graphite: each line fades in once, as it arrives. */}
      <pre aria-hidden className="relative mt-2 h-[6.6rem] overflow-hidden font-mono text-code leading-[1.3rem] text-muted-foreground/80">
        {lines.map((l, i) => (
          <span key={i} className="fade-up block truncate">
            {l || " "}
          </span>
        ))}
      </pre>
    </li>
  );
}

/**
 * The app's files on the Sheet: one card each with its path, how long it is, and what it's for when the
 * name says so. In pencil (dashed) until the app is real, then in ink.
 */
export function FileCards({ files, real, className }: { files: { path: string; content: string }[]; real: boolean; className?: string }) {
  // The entry first, then the rest as they're laid out in folders.
  const sorted = [...files].sort((a, b) => Number(/^App\.(jsx|tsx)$/.test(b.path)) - Number(/^App\.(jsx|tsx)$/.test(a.path)) || a.path.localeCompare(b.path));
  return (
    <ul className={cn("grid grid-cols-1 gap-3 @min-[520px]/sheet:grid-cols-2 @min-[820px]/sheet:grid-cols-3", className)}>
      {sorted.map((f) => {
        const n = lineCount(f.content);
        const what = whatFileDoes(f.path);
        return (
          <li key={f.path} className={cn("min-w-0 px-3.5 py-3", real ? "panel rounded-md" : "sketch-soft bg-panel/60")}>
            <div className="flex items-baseline gap-2">
              <p className="min-w-0 flex-1 truncate font-mono text-badge text-foreground" title={f.path}>
                {f.path}
              </p>
              <span className="shrink-0 text-meta tabular-nums text-faint">
                {n} {n === 1 ? "line" : "lines"}
              </span>
            </div>
            <p className={cn("mt-1 truncate text-meta", what ? "text-muted-foreground" : "text-faint")}>{what ?? " "}</p>
          </li>
        );
      })}
    </ul>
  );
}
