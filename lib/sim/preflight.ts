import type { Blueprint } from "@/lib/blueprint/schema";

export type PreflightStatus = "pass" | "warn" | "fail";
export type PreflightFix = "enable_auth" | "gate_irreversible" | "sandbox_keys" | "set_budget" | "build_first";
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
  const rehearsals = bp.agents.flatMap((a) => a.rehearsals);
  const withHistory = rehearsals.filter((r) => r.history.length);
  const passing = withHistory.filter((r) => r.history[r.history.length - 1].pass).length;
  const rate = withHistory.length ? passing / withHistory.length : 1;
  const built = opts.built ?? true;
  const region = opts.region ?? bp.meta.region;

  return [
    {
      id: "signin",
      label: "People must sign in",
      plain: "Only people you invite can open the team screens.",
      status: bp.meta.auth.enabled ? "pass" : "fail",
      detail: bp.meta.auth.enabled ? `Sign-in with ${bp.meta.auth.providers.join(", ")}.` : "Anyone with the link could see your data.",
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
      status: !built ? "fail" : rate >= 0.8 ? "pass" : "fail",
      detail: !built
        ? "Build the project first. Rehearsals run as part of the build."
        : withHistory.length
          ? `${passing} of ${withHistory.length} passing (${Math.round(rate * 100)}%).`
          : `${rehearsals.length} of ${rehearsals.length} passed during the last build.`,
      blocking: true,
      fix: !built ? { label: "Build it", action: "build_first" } : undefined,
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
      fix: opts.budgetCapCredits > 0 ? undefined : { label: "Set a 200-credit cap", action: "set_budget" },
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

export const canGoLive = (checks: PreflightCheck[]) => checks.every((c) => !c.blocking || c.status !== "fail");
