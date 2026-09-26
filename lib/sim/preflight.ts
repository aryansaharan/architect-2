import type { Blueprint } from "@/lib/blueprint/schema";
import { signInMethods } from "@/lib/blueprint/describe";

export type PreflightStatus = "pass" | "warn" | "fail";
export type PreflightFix = "enable_auth" | "gate_irreversible" | "sandbox_keys" | "set_budget" | "build_first" | "run_rehearsals";
export type PreflightCheck = {
  id: "signin" | "permissions" | "rehearsals" | "keys" | "budget" | "residency";
  label: string;
  plain: string;
  status: PreflightStatus;
  detail: string;
  blocking: boolean;
  fix?: { label: string; action: PreflightFix };
};

const REGION_LABEL = { us: "United States", eu: "European Union", in: "India" } as const;

/** Deterministic go-live checks. Blocking failures disable "Go live"; warnings don't. */
export function preflight(
  bp: Blueprint,
  opts: { budgetCapCredits: number; built?: boolean; region?: "us" | "eu" | "in" },
): PreflightCheck[] {
  const irreversible = bp.agents.flatMap((a) => a.tools.map((t) => ({ a, t }))).filter(({ t }) => t.access === "irreversible");
  const ungated = irreversible.filter(({ t }) => t.permission !== "ask");
  const missing = bp.connections.filter((c) => c.status === "missing");
  const reh = rehearsalSummary(bp);
  const built = opts.built ?? true;
  const region = opts.region ?? bp.meta.region;

  return [
    {
      id: "signin",
      label: "People must sign in",
      plain: "Only people you invite can open the team screens.",
      status: bp.meta.auth.enabled ? "pass" : "fail",
      detail: bp.meta.auth.enabled ? `Sign in with ${signInMethods(bp.meta.auth.providers)}.` : "Anyone with the link could see your data.",
      blocking: true,
      fix: bp.meta.auth.enabled ? undefined : { label: "Turn on sign-in", action: "enable_auth" },
    },
    {
      id: "permissions",
      label: "Irreversible actions ask a person first",
      plain: "Anything that sends, pays, creates or deletes waits for approval.",
      status: ungated.length ? "fail" : "pass",
      detail: ungated.length
        ? `${ungated.map(({ a, t }) => `${a.name} · ${t.name}`).join(", ")} can act without asking.`
        : `${irreversible.length} action${irreversible.length === 1 ? "" : "s"} gated across ${bp.agents.length} agents.`,
      blocking: true,
      fix: ungated.length ? { label: "Add approval gates", action: "gate_irreversible" } : undefined,
    },
    {
      id: "rehearsals",
      label: "Rehearsals pass",
      plain: "Every agent has played through its test conversations.",
      status: !built || reh.rate < 0.8 ? "fail" : reh.failing || reh.notRun || reh.unrehearsed.length ? "warn" : "pass",
      detail: !built ? "Build the project first. Rehearsals run as part of the build." : reh.detail,
      blocking: true,
      fix: !built ? { label: "Build it", action: "build_first" } : reh.notRun || reh.unrehearsed.length ? { label: "Run all rehearsals", action: "run_rehearsals" } : undefined,
    },
    {
      id: "keys",
      label: "Connections use real keys",
      plain: "Connections without keys run on test data.",
      status: missing.length ? "warn" : "pass",
      detail: missing.length ? `${missing.map((c) => c.name).join(", ")} ${missing.length === 1 ? "uses" : "use"} test data until a key is added.` : "All connections have keys.",
      blocking: false,
      fix: missing.length ? { label: "Add sandbox keys", action: "sandbox_keys" } : undefined,
    },
    {
      id: "budget",
      label: "Spending cap is set",
      plain: "Agents stop and tell you before they spend past your cap.",
      status: opts.budgetCapCredits > 0 ? "pass" : "fail",
      detail: opts.budgetCapCredits > 0 ? `${opts.budgetCapCredits} credits a month (≈ $${(opts.budgetCapCredits / 100).toFixed(2)}).` : "No cap. A busy day could cost anything.",
      blocking: true,
      fix: opts.budgetCapCredits > 0 ? undefined : { label: "Set a 500-credit cap", action: "set_budget" },
    },
    {
      id: "residency",
      label: "Data stays where you chose",
      plain: "Records and agent memory are stored in one region.",
      status: "pass",
      detail: `Stored in ${REGION_LABEL[region]}.`,
      blocking: false,
    },
  ];
}

/**
 * Every agent's rehearsals, counted honestly: the latest result of each one.
 * A rehearsal that has never run counts as not passing, and an agent with no
 * results (or no rehearsals at all) is named as not rehearsed yet.
 */
export function rehearsalSummary(bp: Blueprint) {
  const all = bp.agents.flatMap((a) => a.rehearsals);
  const ran = all.filter((r) => r.history.length);
  const passing = ran.filter((r) => r.history[r.history.length - 1].pass).length;
  const failing = ran.length - passing;
  const notRun = all.length - ran.length;
  const unrehearsed = bp.agents.filter((a) => !a.rehearsals.some((r) => r.history.length)).map((a) => a.name);
  const rate = all.length ? passing / all.length : 0;
  const parts: string[] = [];
  if (all.length && ran.length) parts.push(`${passing} of ${all.length} passing on their latest run (${Math.round(rate * 100)}%).`);
  else if (all.length) parts.push(`None of the ${all.length} rehearsals has run yet.`);
  else parts.push("No agent has any rehearsals yet. Add them in Agents › Rehearsals.");
  if (failing) parts.push(`${failing} failing.`);
  if (unrehearsed.length && unrehearsed.length < bp.agents.length) parts.push(`Not rehearsed yet: ${unrehearsed.join(", ")}.`);
  else if (notRun && ran.length) parts.push(`${notRun} ${notRun === 1 ? "hasn't" : "haven't"} run yet.`);
  if (all.length && (notRun || unrehearsed.length)) parts.push("Run them in Agents › Rehearsals.");
  return { total: all.length, passing, failing, notRun, unrehearsed, rate, detail: parts.join(" ") };
}

export const canGoLive = (checks: PreflightCheck[]) => checks.every((c) => !c.blocking || c.status !== "fail");
