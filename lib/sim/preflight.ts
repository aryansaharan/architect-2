import type { Blueprint } from "@/lib/blueprint/schema";
import type { BuildError, Collection, Manifest } from "@/lib/code-apps/schema";
import { publicAccess } from "@/lib/apps/view";
import { PRICE } from "@/lib/prices";

/** "info" is for reading, not fixing: it never blocks publishing and never counts as a problem. */
export type PreflightStatus = "pass" | "warn" | "fail" | "info";
export type PreflightFix = "enable_auth" | "gate_irreversible" | "sandbox_keys" | "set_budget" | "build_first" | "run_rehearsals" | "open_sheet";
export type PreflightCheck = {
  /** A business app's checks, then a code app's (codePreflight). */
  id: "signin" | "permissions" | "rehearsals" | "keys" | "budget" | "residency" | "public" | "builds" | "starts" | "stores" | "ai";
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
      // A published app takes Google or an email link (components/auth/auth-panel.tsx), whatever the plan lists.
      detail: bp.meta.auth.enabled ? "Sign in with Google or an email link." : "Anyone with the link could see your data.",
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
      plain: "Claude has played each AI helper through its test conversations.",
      // Test runs are played by Claude, so a guest (or anyone who skipped them) has none: that warns, it doesn't block.
      // Played ones must mostly pass: under 80% of those played blocks publishing.
      status: !built ? "fail" : reh.played && reh.rate < 0.8 ? "fail" : reh.failing || reh.notRun || reh.unrehearsed.length ? "warn" : "pass",
      detail: !built ? "Make it real first." : reh.detail,
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

/**
 * Who can use a published app, in one sentence, from what it makes public (lib/apps/view.ts publicAccess,
 * the same rule the live app uses): without public pages only the owner and the people they invite get in.
 */
export function accessLine(bp: Blueprint, hiddenEntities: string[] = []): string {
  return publicAccess(bp, hiddenEntities).screens.length
    ? "Its public pages are open to anyone with the link; team screens are only for you and the people you invite."
    : "Private: only you and the people you invite.";
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
  // Of the test runs Claude has played, how many passed on their latest run. One not played yet isn't a failure.
  const rate = ran.length ? passing / ran.length : 0;
  const parts: string[] = [];
  if (ran.length) parts.push(`${passing} of ${ran.length} played ${ran.length === 1 ? "passes" : "pass"} on their latest run (${Math.round(rate * 100)}%).`);
  else if (all.length) parts.push(`None of the ${all.length} test runs has been played yet. Claude plays them (${PRICE.testRun} credits each); you can publish without them.`);
  else parts.push("No AI helper has any test runs yet. Add them in AI helpers › Tests & reliability.");
  if (failing) parts.push(`${failing} failing.`);
  if (unrehearsed.length && unrehearsed.length < bp.agents.length) parts.push(`Not played yet: ${unrehearsed.join(", ")}.`);
  else if (notRun && ran.length) parts.push(`${notRun} not played yet.`);
  if (all.length && (notRun || unrehearsed.length)) parts.push("Play them in AI helpers › Tests & reliability.");
  return { total: all.length, played: ran.length, passing, failing, notRun, unrehearsed, rate, detail: parts.join(" ") };
}

export const canGoLive = (checks: PreflightCheck[]) => checks.every((c) => !c.blocking || c.status !== "fail");

/* ------------------------------------------------------------------ Code apps */

/** A code app's latest build as Publish reads it (lib/code-apps/schema.ts BuildResult, without its bundle). */
export type CodeBuildState = { ok: boolean; at?: string; errors?: BuildError[] } | null;
/** How the latest build last ran in the studio's sandbox: started, stopped with an error, or not run (null). */
export type CodeRunState = { state: "started" | "failed"; message?: string } | null;

/** "App.jsx line 12: Unexpected token", the first real error, in one line. */
export function buildErrorLine(e: BuildError | undefined): string {
  if (!e) return "The build stopped without saying why.";
  const where = e.file ? `${e.file}${e.line ? ` line ${e.line}` : ""}: ` : "";
  return `${where}${e.message.split("\n")[0].slice(0, 200).replace(/[.\s]+$/, "")}`;
}

/** Who may read and who may add, in plain words. "team" is the owner (and people they invite). */
export function collectionWords(c: Pick<Collection, "read" | "write">): string {
  if (c.read === "public" && c.write === "public") return "anyone can read and add";
  if (c.read === "public") return "anyone can read; only you can add";
  if (c.write === "public") return "anyone can add; only you can read";
  return "only you can read and add";
}

/** "Scores: anyone can read and add", one per collection. */
export const collectionLines = (collections: Collection[]) => collections.map((c) => `${c.label.trim() || c.name}: ${collectionWords(c)}`);

/** Who can use a published code app, in one sentence: always anyone with the link (code apps are public in v1). */
export const codeAccessLine = "Public: anyone with the link can open it. What each collection lets people read or add is decided by its rules, on the server.";

/**
 * A code app's go-live checks. It builds (the latest real build compiled) and it starts (it ran without
 * an error in the studio's last run of this build, or, when it hasn't run here, it built) both block.
 * What it stores and whether it uses AI are for reading: who can read and add to each collection, and
 * that each AI call costs the owner credits (visitors only when the owner allows it).
 */
export function codePreflight(opts: { build: CodeBuildState; run: CodeRunState; manifest: Manifest | null; publicHelpers: boolean }): PreflightCheck[] {
  const { build, run, manifest } = opts;
  const built = Boolean(build?.ok);
  const collections = manifest?.collections ?? [];
  const lines = collectionLines(collections);
  const anyonePublic = collections.some((c) => c.read === "public" || c.write === "public");
  const starts: PreflightCheck = !built
    ? { id: "starts", label: "It starts", plain: "It opens without an error.", status: "fail", detail: "It has to build before it can start.", blocking: true }
    : run?.state === "failed"
      ? { id: "starts", label: "It starts", plain: "It opens without an error.", status: "fail", detail: `It stopped with an error when it last ran: ${run.message?.split("\n")[0].slice(0, 200).replace(/[.\s]+$/, "") || "an error in the app"}. Fix it on the Sheet.`, blocking: true, fix: { label: "Fix it on the Sheet", action: "open_sheet" } }
      : run?.state === "started"
        ? { id: "starts", label: "It starts", plain: "It opens without an error.", status: "pass", detail: "It started without errors in its last test run.", blocking: true }
        : { id: "starts", label: "It starts", plain: "It opens without an error.", status: "pass", detail: "It built without errors. Open it on the Sheet to watch it start.", blocking: true };
  return [
    {
      id: "builds",
      label: "It builds",
      plain: "Every file compiles into one app.",
      status: built ? "pass" : "fail",
      detail: built
        ? "Every file compiled into one app."
        : build
          ? `The latest build failed: ${buildErrorLine(build.errors?.[0])}. Fix it on the Sheet.`
          : "It hasn't been built yet. Building is free and happens on the Sheet.",
      blocking: true,
      fix: built ? undefined : { label: build ? "Fix it on the Sheet" : "Build it on the Sheet", action: "open_sheet" },
    },
    starts,
    {
      id: "stores",
      label: "What it stores",
      plain: "The records the app keeps, and who can read and add them.",
      status: collections.length ? (anyonePublic ? "info" : "pass") : "pass",
      detail: collections.length ? `${lines.join(". ")}.` : "Nothing. It doesn't keep any records.",
      blocking: false,
    },
    {
      id: "ai",
      label: "Uses AI",
      plain: "Each AI answer comes out of your monthly credits.",
      status: manifest?.usesAI ? "info" : "pass",
      detail: manifest?.usesAI
        ? `Each call costs you ${PRICE.helperMessage} credits. ${opts.publicHelpers ? "Visitors can use it too, on your credits." : "Only you can use it until you let visitors."}`
        : "It doesn't use AI, so it costs nothing to run.",
      blocking: false,
    },
  ];
}
