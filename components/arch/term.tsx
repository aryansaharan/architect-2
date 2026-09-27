"use client";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

/**
 * Plain words first, developer words on hover. One vocabulary for both
 * audiences: nobody has to switch modes to understand a label.
 */
export const GLOSSARY = {
  blueprint: { term: "Blueprint", plain: "The plan of your app: the screens people use, the agents that do the work, the data it keeps and the systems it connects to.", dev: "The project's JSON spec. Every file in the repo is generated from it." },
  "work-order": { term: "Work Order", plain: "A quote before anything runs: what will change, how long it takes and what it costs. Nothing happens until you approve it.", dev: "A planned change set with an estimate, like a PR description with a price." },
  "save-point": { term: "Save point", plain: "A snapshot of the whole project. Going back to one is free and never loses the newer work.", dev: "A checkpoint: Blueprint snapshot plus generated code, diffable against any other." },
  rehearsal: { term: "Rehearsal", plain: "A practice conversation that checks an agent behaves before real people rely on it.", dev: "An eval case run against the agent, re-run on every build." },
  "house-rules": { term: "House Rules", plain: "Promises Prod AI keeps about your existing code, such as “never change the framework”.", dev: "Path and policy constraints enforced on every change and PR." },
  preflight: { term: "Preflight", plain: "The checklist before going live: sign-in, keys, approvals, rehearsals, a spending cap and where data is stored.", dev: "Pre-deploy gates. Blocking checks stop the release." },
  supervision: { term: "Supervision", plain: "How closely a person watches an agent: on its own, spot-checked, or approving everything.", dev: "Human-in-the-loop policy per agent." },
  "ask-first": { term: "Ask first", plain: "The agent stops and asks a person before this action. Always on for actions that can't be undone, and on for everything under Approve everything.", dev: "Tool call requires approval (toolApproval: user-approval)." },
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
        <span tabIndex={0} className={cn("cursor-help underline decoration-current/35 decoration-dotted underline-offset-[3px] outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-amber/50", className)}>
          {children ?? g.term}
        </span>
      </HoverCardTrigger>
      <HoverCardContent side="top" className="normal-case tracking-normal">
        <p className="text-[13px] font-semibold text-foreground">{g.term}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{g.plain}</p>
        <p className="mt-2.5 border-t border-hairline pt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-amber">Developers:</span> {g.dev}
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}
