"use client";
import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEntrance } from "@/components/motion/entry-draw";
import { WritingFileCard } from "@/components/code-apps/file-cards";
import { cn } from "@/lib/utils";
import { CapNote, signInHref } from "./cap-note";
import type { usePlanStream } from "./plan-stream";

/** Error codes the plan route uses when a code app can't be written for this person: a guest, no credits, or no Claude today. */
const NEEDS_CLAUDE = new Set(["code-sign-in", "code-credits", "code-unavailable"]);

/** Words in pencil, written in when they arrive. */
function Written({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEntrance(ref, "write", { lane: "code-title", gap: 90 });
  return (
    <span ref={ref} className={className}>
      {children}
    </span>
  );
}

/** Who may read or add, in plain words: "Anyone can see and add", "Only your team can add". */
export function accessWords(read?: string, write?: string): string {
  if (read === "public" && write === "public") return "anyone can see and add";
  if (read === "public") return "anyone can see, only your team can add";
  if (write === "public") return "anyone can add, only your team can see";
  return "only your team can see and add";
}

/**
 * A code app being written: the files appear as pencil cards as Claude finishes each one (name, a few
 * lines fading in, how long it is), then the app's name and what it keeps. Then it opens on the Sheet.
 */
export function CodeWritingView({
  s,
  eyebrow,
  onRetry,
  onBusiness,
  signInNext,
}: {
  s: ReturnType<typeof usePlanStream>;
  eyebrow: React.ReactNode;
  onRetry: () => void;
  /** Start from a business starter instead (the same note, planned as a business app). */
  onBusiness: () => void;
  /** Where a guest comes back to after signing in, with their note. Null for members. */
  signInNext: string | null;
}) {
  const { files, manifest, status, error, errorCode, elapsed, done } = s;
  const working = !done && !error;
  const keeps = (manifest?.collections ?? []).filter((c) => c?.label || c?.name);
  const writing = [...files].reverse().find((f) => !f.done) ?? files.at(-1);
  // The server says what it's doing; while it writes, the file it's on.
  const phase = error
    ? "The pencil slipped."
    : done
      ? "Written. Opening your sheet…"
      : writing && (!status || status === "Writing the files")
        ? `Writing ${writing.path}…`
        : status
          ? `${status}…`
          : "Reading your note…";

  if (error && errorCode === "cap")
    return (
      <div className="mx-auto max-w-2xl">
        {eyebrow}
        <h1 className="mt-4 font-pencil text-title">No room for another project</h1>
        <CapNote alert className="mt-6" message={error} signInNext={signInNext} />
      </div>
    );

  // Writing real code needs Claude: a guest signs in (the note comes along), and anyone can start from a business starter, free.
  if (error && !files.length && (signInNext || (errorCode && NEEDS_CLAUDE.has(errorCode))))
    return (
      <div className="mx-auto max-w-2xl">
        {eyebrow}
        <h1 className="mt-4 font-pencil text-title">{signInNext ? "Sign in to have Claude write it" : "Claude can't write this one just now"}</h1>
        <div role="alert" className="panel mt-6 rounded-md px-4 py-4 sm:px-5">
          <p className="flex gap-2 text-body text-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>{signInNext ? `${error} Your note comes with you when you sign in.` : error}</span>
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 pl-6">
            {signInNext && (
              <Button asChild size="lg">
                <Link href={signInHref(signInNext)}>
                  Sign in <ArrowRight />
                </Link>
              </Button>
            )}
            <Button variant={signInNext ? "ghost" : "default"} size="lg" className={cn(signInNext && "-ml-4 text-muted-foreground")} onClick={onBusiness}>
              Start from a business starter instead
            </Button>
          </div>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {eyebrow}
        <p className="text-meta text-faint sm:ml-auto">Writing real code with Claude</p>
      </div>
      <h1 className="mt-4 font-pencil text-title">
        {manifest?.title ? (
          <Written key="title" className="inline-block">
            {manifest.title}
          </Written>
        ) : (
          <span className={cn(working ? "text-foreground" : "text-faint")}>Claude is writing your app</span>
        )}
      </h1>
      <p className="mt-3 min-h-[1.55em] text-lead text-muted-foreground">{manifest?.tagline ? <span className="fade-up">{manifest.tagline}</span> : ""}</p>

      {error && (
        <div role="alert" className="mt-4 flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-hairline-hi bg-panel px-3 py-2 text-body text-foreground">
          <p className="flex min-w-0 flex-1 gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
          <Button variant="ghost" className="text-muted-foreground" onClick={onBusiness}>
            Start from a business starter instead
          </Button>
        </div>
      )}

      <div className="dot-grid mt-6 grid gap-8 rounded-md border border-hairline p-5 sm:p-7 lg:grid-cols-[1fr_230px]">
        <section aria-label="Files">
          <h2 className="flex items-baseline gap-1.5 font-sketch text-sketch text-muted-foreground">
            Files
            {files.length > 0 && <span className="font-sans text-meta tabular-nums text-faint">{files.length}</span>}
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {/* Keyed by place: a file still being written must not redraw its card. */}
            {files.map((f, i) => (
              <WritingFileCard key={`file-${i}`} path={f.path} content={f.content} done={f.done || i < files.length - 1 || done} />
            ))}
            {/* Empty places the same size as a written card, so the sheet doesn't jump as files arrive. */}
            {working &&
              Array.from({ length: Math.max(1, 2 - files.length) }).map((_, i) => (
                <li key={`empty-${i}`} className="sketch-soft px-3 pb-3 pt-2.5 sm:px-4" aria-hidden>
                  <p className="invisible font-mono text-badge">&nbsp;</p>
                  <div className="mt-2 grid h-[6.6rem] place-items-center text-center">
                    {i === 0 && <span className="font-pencil text-note leading-tight text-faint">{files.length ? "and…" : "files go here"}</span>}
                  </div>
                </li>
              ))}
          </ul>
        </section>

        <aside aria-label="What it is and what it keeps" className="space-y-7">
          <section>
            <h2 className="font-sketch text-sketch text-muted-foreground">What it is</h2>
            <p className={cn("mt-1.5 font-pencil text-note leading-tight", manifest?.kind ? "text-foreground" : "text-faint")}>{manifest?.kind ? <Written>{manifest.kind}</Written> : working ? "…" : "A web app"}</p>
          </section>
          <section>
            <h2 className="font-sketch text-sketch text-muted-foreground">It keeps</h2>
            {keeps.length ? (
              <ul className="mt-1.5 space-y-1.5">
                {keeps.map((c, i) => (
                  <li key={`keep-${i}`}>
                    <Written className="block w-fit font-pencil text-note leading-tight text-foreground">{c.label || c.name}</Written>
                    <span className="fade-up block text-meta text-muted-foreground">{accessWords(c.read, c.write)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 font-pencil text-note leading-tight text-faint">{manifest ? "Nothing" : "…"}</p>
            )}
          </section>
          {manifest && (
            <section className="fade-up">
              <h2 className="font-sketch text-sketch text-muted-foreground">AI</h2>
              <p className="mt-1.5 text-body text-foreground">{manifest.usesAI ? "Asks AI for some of its answers, 5 credits a question from your allowance." : "Doesn't use AI."}</p>
            </section>
          )}
        </aside>
      </div>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <p className={cn("font-pencil text-note leading-tight", done ? "text-brand" : "text-foreground")} aria-live="polite">
          {phase}
        </p>
        <span className="text-meta tabular-nums text-faint">{elapsed}s</span>
        {done && <span className="text-meta text-muted-foreground">Saved as version 1.</span>}
      </div>
      <div className="mt-1.5 space-y-1 text-body text-muted-foreground">
        {working && elapsed > 25 && <p>Writing real code takes a minute or two. Every file appears here as it&apos;s written.</p>}
        {done && <p>Next: make it real. That&apos;s free, and it really builds and starts your app.</p>}
      </div>
    </div>
  );
}
