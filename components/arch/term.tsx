"use client";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

/**
 * Plain words first, developer words on hover. One vocabulary for both
 * audiences: nobody has to switch modes to understand a label.
 */
export const GLOSSARY = {
  blueprint: { term: "The plan", plain: "The plan of your app: the screens people use, the AI helpers that do the work, the data it keeps and the systems it connects to.", dev: "The Blueprint: the project's JSON spec. Every file in the repo is generated from it." },
  "work-order": { term: "A change and its price", plain: "A quote before anything runs: what will change, how long it takes and what it costs. Nothing happens until you approve it.", dev: "A Work Order: a planned change set with an estimate, like a PR description with a price." },
  "save-point": { term: "Version", plain: "A snapshot of the whole project. Going back to one is free and never loses the newer work.", dev: "A checkpoint (save point): Blueprint snapshot plus generated code, diffable against any other." },
  rehearsal: { term: "Test run", plain: "A practice conversation that checks an AI helper behaves before real people rely on it.", dev: "A rehearsal: an eval case run against the agent, re-run on every build." },
  "house-rules": { term: "House Rules", plain: "Promises Prod AI keeps about your existing code, such as “never change the framework”.", dev: "Path and policy constraints enforced on every change and PR." },
  preflight: { term: "Preflight", plain: "The checklist before going live: sign-in, keys, approvals, test runs, a spending cap and where data is stored.", dev: "Pre-deploy gates. Blocking checks stop the release." },
  supervision: { term: "How closely it's watched", plain: "How closely a person watches an AI helper: on its own, spot-checked, or approving everything.", dev: "Supervision: the human-in-the-loop policy per agent." },
  "ask-first": { term: "Ask first", plain: "The AI helper stops and asks a person before this action. Always on for actions that can't be undone, and on for everything under Approve everything.", dev: "Tool call requires approval (toolApproval: user-approval)." },
  credits: { term: "Credits", plain: "How work is priced. 1 credit is about $0.01, and you always see the price before anything runs.", dev: "Metered model tokens and compute at list price." },
  "our-fix": { term: "Our fix", plain: "A problem Prod AI caused and fixed itself. You are never charged for these.", dev: "Repair operations billed at 0 credits and recorded in the ledger." },
  handoff: { term: "Handoff", plain: "Send a question to an engineer with everything attached. The answer comes back as a sentence.", dev: "An issue with object ref, prompt history and last diff attached." },
} as const;

export type TermKey = keyof typeof GLOSSARY;

export function Term({ k, children, className }: { k: TermKey; children?: React.ReactNode; className?: string }) {
  const g = GLOSSARY[k];
  return (
    <HoverCard openDelay={250} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span tabIndex={0} className={cn("cursor-help underline decoration-current/35 decoration-dotted underline-offset-4 outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-brand/50", className)}>
          {children ?? g.term}
        </span>
      </HoverCardTrigger>
      <HoverCardContent side="top" className="normal-case tracking-normal">
        <p className="text-ui font-semibold text-foreground">{g.term}</p>
        <p className="mt-1 text-ui text-muted-foreground">{g.plain}</p>
        <p className="mt-2.5 border-t border-hairline pt-2 text-meta text-muted-foreground">
          <span className="font-medium text-brand">Developers:</span> {g.dev}
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}
