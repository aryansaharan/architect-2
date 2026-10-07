"use client";
import { PencilRadio } from "@/components/workspace/sheet/pencil-radio";
import { cn } from "@/lib/utils";

export type AppKind = "business" | "code";

/**
 * What Claude chose to make from the note, said once, with a quiet switch beside it: a business app
 * (screens, records and AI helpers for a team) or real code (any kind of web app: a game, a portfolio, a tool).
 */
export function KindLine({
  kind,
  reason,
  deciding,
  chosenBy,
  onChange,
  className,
}: {
  kind: AppKind;
  /** Why, in one plain sentence, when it's Claude's choice ("A memory game needs custom visuals and play…"). */
  reason: string | null;
  /** Still reading the note: the switch works, the sentence waits. */
  deciding: boolean;
  chosenBy: "claude" | "you" | null;
  onChange: (k: AppKind) => void;
  className?: string;
}) {
  const sentence = deciding ? "Reading your idea to see what kind of app it is…" : kind === "code" ? "Claude will write this as real code." : "Claude will plan this as a business app for your team.";
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      <div className="min-w-0 flex-1">
        <p className="font-sketch text-sketch text-muted-foreground">{chosenBy === "you" ? "You chose" : "What Claude will make"}</p>
        <p key={`${kind}-${deciding}`} className={cn("mt-0.5 text-body", deciding ? "text-muted-foreground" : "fade-up text-foreground")} aria-live="polite">
          {sentence}
          {!deciding && reason && <span className="block text-meta text-muted-foreground">{reason}</span>}
        </p>
      </div>
      <PencilRadio<AppKind>
        label="What to make"
        value={kind}
        onChange={onChange}
        options={[
          { value: "business", label: "Business app", title: "Screens, records and AI helpers for a team" },
          { value: "code", label: "Real code", title: "Any kind of web app, written as real files: a game, a portfolio, a tool" },
        ]}
      />
    </div>
  );
}
