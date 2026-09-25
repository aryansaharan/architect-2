import type { Blueprint, BlueprintInput, Vertical } from "../schema";
import { hydrate } from "../index";
import { matchVertical } from "../match";
import { claimsBrief, claimsFixture } from "./claims";
import { supportBrief, supportFixture } from "./support";
import { salesBrief, salesFixture } from "./sales";
import { hrBrief, hrFixture } from "./hr";

export type StarterVertical = Exclude<Vertical, "custom">;

export const STARTERS: Record<StarterVertical, { brief: string; fixture: BlueprintInput; label: string; icon: string }> = {
  claims: { brief: claimsBrief, fixture: claimsFixture, label: "Claims triage", icon: "shield-check" },
  support: { brief: supportBrief, fixture: supportFixture, label: "Support inbox", icon: "inbox" },
  sales: { brief: salesBrief, fixture: salesFixture, label: "Account research", icon: "radar" },
  hr: { brief: hrBrief, fixture: hrFixture, label: "New-hire onboarding", icon: "user-plus" },
};

export function starterBlueprint(vertical: StarterVertical): Blueprint {
  return hydrate(structuredClone(STARTERS[vertical].fixture));
}

/** Closest starter for a free-text brief (used offline or when the model fails). */
export function starterFor(brief: string): { vertical: StarterVertical; blueprint: Blueprint; confidence: number } {
  const { vertical, confidence } = matchVertical(brief);
  return { vertical, blueprint: starterBlueprint(vertical), confidence };
}
