import type { Blueprint } from "@/lib/blueprint/schema";
import { signInMethods } from "@/lib/blueprint/describe";
import { publicAccess } from "@/lib/apps/view";
import { PRICE } from "@/lib/prices";

/** "info" is for reading, not fixing: it never blocks publishing and never counts as a problem. */
export type PreflightStatus = "pass" | "warn" | "fail" | "info";
export type PreflightFix = "enable_auth" | "gate_irreversible" | "sandbox_keys" | "set_budget" | "build_first" | "run_rehearsals";
export type PreflightCheck = {
  id: "signin" | "permissions" | "rehearsals" | "keys" | "budget" | "residency" | "public";
  label: string;
  plain: string;
  status: PreflightStatus;
  detail: string;
  blocking: boolean;
  fix?: { label: string; action: PreflightFix };
};


/** Deterministic go-live checks. Blocking failures disable "Go live"; warnings don't. */
export function preflight(
  bp: Blueprint,
  opts: { budgetCapCredits: number; built?: boolean; region?: "us" | "eu" | "in"; hiddenEntities?: string[]; publicHelpers?: boolean },
): PreflightCheck[] {
  const irreversible = bp.agents.flatMap((a) => a.tools.map((t) => ({ a, t }))).filter(({ t }) => t.access === "irreversible");
  const ungated = irreversible.filter(({ t }) => t.permission !== "ask");
  const missing = bp.connections.filter((c) => c.status === "missing");
  const reh = rehearsalSummary(bp);
  const built = opts.built ?? true;

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
        : `${irreversible.length} action${irreversible.length === 1 ? "" : "s"} gated across ${bp.agents.length} AI helper${bp.agents.length === 1 ? "" : "s"}.`,
      blocking: true,
      fix: ungated.length ? { label: "Add approval gates", action: "gate_irreversible" } : undefined,
    },
    {
      id: "rehearsals",
      label: "Test runs pass",
      plain: "Every AI helper has played through its test conversations.",
      status: !built || reh.rate < 0.8 ? "fail" : reh.failing || reh.notRun || reh.unrehearsed.length ? "warn" : "pass",
      detail: !built ? "Make it real first. Test runs happen as part of the build." : reh.detail,
      blocking: true,
      fix: !built ? { label: "Make it real", action: "build_first" } : reh.notRun || reh.unrehearsed.length ? { label: "Run all test runs", action: "run_rehearsals" } : undefined,
    },
    {
      id: "keys",
      label: "Connections have keys",
      plain: "Connections without keys run on test data.",
      // Any connection without a key is named and counted: this row never reads as all clear while one runs on test data.
      status: missing.length ? "warn" : "pass",
      detail: keysDetail(bp.connections.length, missing.map((c) => c.name)),
      blocking: false,
      fix: missing.length ? { label: "Add sandbox keys", action: "sandbox_keys" } : undefined,
    },
    {
      id: "budget",
      label: "Spending cap is set",
      plain: "On top of your monthly credits, this project stops using credits at its own cap, and says so.",
      status: opts.budgetCapCredits > 0 ? "pass" : "fail",
      detail: opts.budgetCapCredits > 0 ? `This project stops at ${opts.budgetCapCredits} credits.` : "No cap. A busy day could use all your monthly credits.",
      blocking: true,
      fix: opts.budgetCapCredits > 0 ? undefined : { label: "Set a 500-credit cap", action: "set_budget" },
    },
    {
      id: "residency",
      label: "Where data is stored",
      plain: "Records and AI helper memory are stored in one region.",
      status: "pass",
      // One database holds every project today; choosing a region per project is planned (ARCHITECTURE.md, cells).
      detail: "Stored in the United States (US East) for every project today. Choosing a region per project is planned.",
      blocking: false,
    },
    publicCheck(bp, opts.hiddenEntities ?? [], Boolean(opts.publicHelpers)),
  ];
}

/**
 * What a published app's public pages (screens for customers) show to anyone with the link, by data type,
 * computed like the live app does (lib/apps/view.ts publicAccess) before anything is hidden.
 * "shows" are the fields public pages display; "collects" the fields their forms take. Files aren't stored.
 */
export type PublicSummary = {
  pages: { id: string; title: string }[];
  types: { entityId: string; name: string; plural: string; shows: string[]; collects: string[] }[];
  /** AI helpers that have a chat on a public page. */
  helpers: { id: string; name: string }[];
};

const humanize = (name: string) => {
  const s = name.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function publicSummary(bp: Blueprint): PublicSummary {
  const access = publicAccess(bp);
  const screens = bp.screens.filter((s) => access.screens.includes(s.id));
  const blocks = screens.flatMap((s) => [...s.regions.main, ...(s.regions.side ?? [])]);
  const forms = blocks.flatMap((b) => (b.type === "form" ? [b] : []));
  const label = (entityId: string, field: string) => {
    const own = bp.entities.find((e) => e.id === entityId)?.fields.find((f) => f.name === field)?.label;
    const asked = forms.find((f) => f.entityId === entityId)?.fields.find((f) => f.name === field)?.label;
    return own || asked || humanize(field);
  };
  const files = new Set(forms.flatMap((f) => f.fields.filter((x) => x.kind === "file").map((x) => `${f.entityId}:${x.name}`)));
  const ids = [...new Set([...Object.keys(access.read), ...Object.keys(access.create)])];
  const types = ids.flatMap((id) => {
    const e = bp.entities.find((x) => x.id === id);
    if (!e) return [];
    return [{
      entityId: id,
      name: e.name,
      plural: e.plural,
      shows: (access.read[id] ?? []).map((f) => label(id, f)),
      collects: (access.create[id] ?? []).filter((f) => !files.has(`${id}:${f}`)).map((f) => label(id, f)),
    }];
  });
  const helperIds = [...new Set(blocks.flatMap((b) => (b.type === "chat" ? [b.agentId] : [])))];
  const helpers = helperIds.flatMap((id) => {
    const a = bp.agents.find((x) => x.id === id);
    return a ? [{ id, name: a.name }] : [];
  });
  return { pages: screens.map((s) => ({ id: s.id, title: s.title })), types, helpers };
}

/** "a", "a and b", "a, b and c". */
export const listWords = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Field labels as written ("Policy number", "When did it happen?"), quoted so questions read cleanly in a sentence. */
const fieldList = (labels: string[]) => listWords(labels.map((l) => `“${l}”`));

function publicCheck(bp: Blueprint, hidden: string[], helpersOn: boolean): PreflightCheck {
  const sum = publicSummary(bp);
  const base = { id: "public" as const, label: "What public pages show", plain: "Anyone with the link can open public pages without signing in.", blocking: false };
  if (!sum.pages.length) return { ...base, status: "pass", detail: "This app has no public pages. Everything is private to your team." };
  const off = new Set(hidden);
  const shown = sum.types.filter((t) => !off.has(t.entityId));
  const parts = [`Anyone can open ${listWords(sum.pages.map((p) => p.title))} without signing in.`];
  for (const t of shown) {
    if (t.collects.length) parts.push(`Anyone can send in ${t.plural.toLowerCase()} with ${fieldList(t.collects)}.`);
    if (t.shows.length) parts.push(`Anyone can see ${fieldList(t.shows)} of your ${t.plural.toLowerCase()}.`);
  }
  if (!shown.some((t) => t.shows.length)) parts.push("Nothing from your records is shown.");
  const hiddenNames = sum.types.filter((t) => off.has(t.entityId)).map((t) => t.plural);
  if (hiddenNames.length) parts.push(`Hidden from public pages: ${listWords(hiddenNames)}.`);
  if (sum.helpers.length) {
    const names = listWords(sum.helpers.map((h) => h.name));
    parts.push(helpersOn ? `Visitors can talk to ${names}. Each message Claude answers uses ${PRICE.helperMessage} of your credits.` : `Visitors can't talk to ${names} unless you turn that on.`);
  }
  return { ...base, status: "info", detail: parts.join(" ") };
}

/** The keys row in words: how many connections run on test data and which, or that none does. */
export function keysDetail(total: number, missing: string[]): string {
  const n = missing.length;
  if (n) return `${n} connection${n === 1 ? " uses" : "s use"} test data: ${missing.join(", ")}. ${n === 1 ? "It stays" : "They stay"} on test data until ${n === 1 ? "a key is" : "keys are"} added.`;
  if (!total) return "This app doesn't connect to anything outside itself.";
  return `${total === 1 ? "Its one connection is" : `All ${total} connections are`} connected. None uses test data.`;
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
  else if (all.length) parts.push(`None of the ${all.length} test runs has run yet.`);
  else parts.push("No AI helper has any test runs yet. Add them in AI helpers › Tests & reliability.");
  if (failing) parts.push(`${failing} failing.`);
  if (unrehearsed.length && unrehearsed.length < bp.agents.length) parts.push(`No test runs yet: ${unrehearsed.join(", ")}.`);
  else if (notRun && ran.length) parts.push(`${notRun} ${notRun === 1 ? "hasn't" : "haven't"} run yet.`);
  if (all.length && (notRun || unrehearsed.length)) parts.push("Run them in AI helpers › Tests & reliability.");
  return { total: all.length, passing, failing, notRun, unrehearsed, rate, detail: parts.join(" ") };
}

export const canGoLive = (checks: PreflightCheck[]) => checks.every((c) => !c.blocking || c.status !== "fail");
