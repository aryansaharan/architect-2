import "server-only";
import type { SessionUser } from "@/lib/auth";
import type { Supa } from "@/lib/supabase/server";
import type { Blueprint } from "@/lib/blueprint/schema";
import type { ProjectRow } from "@/lib/db/types";
import { getProject, usageSummary } from "@/lib/db/queries";
import { addCheckpoint, addLedger } from "@/lib/db/writes";
import { applyOps, markBuilt } from "@/lib/blueprint/apply";
import { getModel } from "@/lib/llm/provider";
import { PRICE, creditsThisMonth } from "@/lib/pricing";
import { monthStartIso } from "@/lib/prices";
import { shortId } from "@/lib/sim/hash";
import { accessSummary, checkPlan, checkSamples, helperDuty } from "./check";
import { compileProject, compiledWords, type CompiledFile } from "./compile";
import { buildFixPlan } from "./fix";
import { meteredTestRun, playAll } from "./test-run";
import { plannedRuns, publicReport, runKey, type BuildEvent, type BuildReport, type BuildStep, type TestRun, type TestsMode } from "./report";

/**
 * Making a business app real, for real, on the server. Streams each step as it finishes and saves the
 * report on the project as it goes, so a reload (or a second tab) follows the same build instead of
 * starting another one. One request at a time does the work: it holds a short lease on the report,
 * renewed on every save; any other request follows along, and takes over if the lease runs out
 * (the tab that started it closed and its request died).
 *
 * Steps: read the plan and check it holds together; check each data type's sample records; write the
 * code and compile it; each helper's duty; each connection; the test runs (Claude plays each helper and
 * a smaller call judges it, PRICE.testRun each); a fix note when one fails; who can see what; then save.
 */

const LEASE_MS = 75_000;
const CONCURRENT_RUNS = 4;
/** How long a follower watches another request's build before giving up (well inside maxDuration). */
const FOLLOW_MS = 240_000;

/** `tests: true` plays the test runs (when the person can pay for them); anything else skips them. */
export type BuildBody = { tests?: boolean; fix?: "a" | "b" | "none" };
type Ctx = { user: SessionUser; supa: Supa; emit: (e: BuildEvent) => void };

class LostLease extends Error {}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The plan a build started from, so a report is never read against a different plan. */
export const planHash = (bp: Blueprint) => shortId(JSON.stringify({ ...bp, estimate: undefined }), 12);

async function testsMode(supa: Supa, user: SessionUser, project: ProjectRow, want: boolean | undefined): Promise<TestsMode> {
  const n = plannedRuns(project.blueprint.agents).length;
  if (!n) return "none";
  if (user.isAnonymous) return "guest";
  if (!getModel()) return "offline";
  const c = await creditsThisMonth(user.id, false);
  if (c.left < n * PRICE.testRun) return "credits";
  // Only played when asked for, where the price was shown first (the Sheet's note, the plan map's quote).
  if (want !== true) return "skipped";
  const spent = await usageSummary(supa, { projectId: project.id, sinceIso: monthStartIso() }).catch(() => null);
  if (spent && spent.credits + n * PRICE.testRun > project.settings.budgetCapCredits) return "cap";
  return "claude";
}

function fresh(bp: Blueprint, tests: TestsMode): BuildReport {
  return { hash: planHash(bp), startedAt: new Date().toISOString(), phase: "running", tests, steps: [], runs: [], credits: 0 };
}

export async function runBuild(ctx: Ctx, projectId: string, body: BuildBody, depth = 0): Promise<void> {
  const { user, supa, emit } = ctx;
  const project = await getProject(supa, projectId);
  if (!project) return emit({ t: "error", message: "Project not found" });
  if (project.kind === "code") return emit({ t: "error", message: "This app is written as code: it's built from its Sheet." });
  if (project.build_state === "built") return emit({ t: "done", summary: "It's already real." });

  const token = crypto.randomUUID();
  let report: BuildReport;

  if (project.build_state !== "building") {
    if (body.fix) return emit({ t: "error", message: "This build isn't waiting on a fix any more. Make it real again." });
    report = fresh(project.blueprint, await testsMode(supa, user, project, body.tests));
    report.lease = { token, until: new Date(Date.now() + LEASE_MS).toISOString() };
    const { data, error } = await supa.from("projects").update({ build_state: "building", build_report: report }).eq("id", projectId).eq("build_state", project.build_state).select("id");
    if (error) throw error;
    if (!data?.length) return depth < 2 ? runBuild(ctx, projectId, body, depth + 1) : emit({ t: "error", message: "The build changed a moment ago. Try again." });
    const bp = project.blueprint;
    const runs = plannedRuns(bp.agents).length;
    await supa.from("work_orders").update({ status: "running" }).eq("project_id", projectId).eq("kind", "build").eq("status", "proposed");
    await addLedger(supa, projectId, [
      {
        lane: "thought",
        kind: "work_order",
        title: "You pressed Make it real",
        body: `Prod AI checks the plan, writes and compiles the code for ${count(bp.screens.length, "screen")} and ${count(bp.agents.length, "AI helper")}${report.tests === "claude" ? `, and Claude plays ${count(runs, "test run")} (${runs * PRICE.testRun} credits)` : ""}.`,
        credits: 0,
      },
    ]);
  } else {
    const saved = project.build_report;
    const now = new Date().toISOString();
    if (saved?.lease && saved.lease.until > now && saved.phase !== "done") return follow(ctx, projectId, saved, body, depth);
    // A build started before builds were real, or one stopped half-way in an older version: start its report now.
    report = saved && saved.phase !== "done" && saved.phase !== "stopped" ? saved : fresh(project.blueprint, await testsMode(supa, user, project, body.tests));
    const claim = supa.from("projects").update({ build_report: { ...report, lease: { token, until: new Date(Date.now() + LEASE_MS).toISOString() } } }).eq("id", projectId).eq("build_state", "building");
    // Only one request takes it: the one that still sees the lease it read (or no lease at all).
    const { data, error } = await (saved?.lease ? claim.eq("build_report->lease->>token", saved.lease.token) : claim.is("build_report->lease", null)).select("id");
    if (error) throw error;
    if (!data?.length) return depth < 2 ? runBuild(ctx, projectId, body, depth + 1) : emit({ t: "error", message: "The build changed a moment ago. Try again." });
    report.lease = { token, until: new Date(Date.now() + LEASE_MS).toISOString() };
  }

  emit({ t: "report", report: publicReport(report) });
  const work = new Work(ctx, projectId, report, token);
  try {
    if (report.phase === "fix") {
      if (!body.fix) {
        emit({ t: "fix", fix: report.fix! });
        await work.release();
        return;
      }
      await work.decide(project, body.fix);
    }
    await work.steps();
  } catch (e) {
    if (e instanceof LostLease) {
      // Stopped, finished or taken over elsewhere: say what it is now.
      const now = await getProject(supa, projectId);
      if (now?.build_state === "built") return emit({ t: "done", summary: "It's real." });
      if (now?.build_state !== "building") return emit({ t: "error", message: "The build was stopped." });
      return;
    }
    throw e;
  }
}

/** Watch a build another request is doing, passing on what it saves, and take over if it stops renewing. */
async function follow(ctx: Ctx, projectId: string, since: BuildReport, body: BuildBody, depth: number): Promise<void> {
  const { supa, emit } = ctx;
  emit({ t: "report", report: publicReport(since) });
  const seen = new Map(since.steps.map((s) => [s.id, s.state]));
  let runs = since.runs.length;
  const until = Date.now() + FOLLOW_MS;
  while (Date.now() < until) {
    await sleep(1500);
    const p = await getProject(supa, projectId);
    if (!p) return emit({ t: "error", message: "Project not found" });
    if (p.build_state === "built") return emit({ t: "done", summary: "It's real." });
    if (p.build_state !== "building") return emit({ t: "error", message: "The build was stopped." });
    const r = p.build_report;
    if (!r) continue;
    for (const s of r.steps)
      if (seen.get(s.id) !== s.state) {
        seen.set(s.id, s.state);
        emit({ t: "step", step: s });
      }
    for (const run of r.runs.slice(runs)) emit({ t: "run", run });
    runs = r.runs.length;
    if (r.phase === "fix" && r.fix) return emit({ t: "fix", fix: r.fix });
    if (!r.lease || r.lease.until < new Date().toISOString()) return depth < 2 ? runBuild(ctx, projectId, body, depth + 1) : undefined;
  }
  emit({ t: "error", message: "This build is still going in another tab. Reload to follow it." });
}

/** The build itself, for the request that holds the lease. */
class Work {
  private chain: Promise<void> = Promise.resolve();
  private compiled: CompiledFile[] | null = null;
  constructor(
    private ctx: Ctx,
    private projectId: string,
    private report: BuildReport,
    private token: string,
  ) {}

  /** Save the report (and anything else), renewing the lease; throws LostLease when it isn't ours any more. */
  private save(patch: Record<string, unknown> = {}): Promise<void> {
    const run = async () => {
      const until = new Date(Date.now() + LEASE_MS).toISOString();
      this.report.lease = { token: this.token, until };
      const { data, error } = await this.ctx.supa
        .from("projects")
        .update({ build_report: this.report, ...patch })
        .eq("id", this.projectId)
        .eq("build_state", "building")
        .eq("build_report->lease->>token", this.token)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new LostLease();
    };
    this.chain = this.chain.then(run);
    return this.chain;
  }

  /** Let a later request pick the build up straight away (the person is deciding on a fix). */
  async release() {
    this.report.lease = undefined;
    await this.ctx.supa.from("projects").update({ build_report: this.report }).eq("id", this.projectId).eq("build_state", "building").eq("build_report->lease->>token", this.token);
  }

  private async blueprint(): Promise<Blueprint> {
    const p = await getProject(this.ctx.supa, this.projectId);
    if (!p || p.build_state !== "building") throw new LostLease();
    return p.blueprint;
  }

  private done(id: string) {
    return this.report.steps.some((s) => s.id === id && s.state !== "running");
  }

  private async step(base: Omit<BuildStep, "state">, work: () => Promise<Pick<BuildStep, "state" | "detail">>) {
    if (this.done(base.id)) return;
    const started = Date.now();
    this.ctx.emit({ t: "step", step: { ...base, state: "running" } });
    const out = await work();
    const step: BuildStep = { ...base, ...out, ms: Date.now() - started };
    const at = this.report.steps.findIndex((s) => s.id === base.id);
    if (at === -1) this.report.steps.push(step);
    else this.report.steps[at] = step;
    this.ctx.emit({ t: "step", step });
    await this.save();
  }

  private async files(bp: Blueprint) {
    return (this.compiled ??= await compileProject(bp));
  }

  async steps() {
    const bp = await this.blueprint();

    await this.step({ id: "read", label: "Reading your sketch" }, async () => {
      const problems = checkPlan(bp);
      if (problems.length) return { state: "warn", detail: `${count(problems.length, "thing")} to tidy: ${problems.slice(0, 2).map((p) => p.message).join(" ")}` };
      return { state: "done", detail: `${count(bp.screens.length, "screen")}, ${count(bp.agents.length, "AI helper")}, ${count(bp.entities.length, "kind")} of data, ${count(bp.connections.length, "connection")}: every list, form and button points at something real.` };
    });

    for (const e of bp.entities)
      await this.step({ id: `data-${e.id}`, label: `Setting up ${e.plural.toLowerCase()}`, objectRef: { type: "entity", id: e.id } }, async () => {
        const s = checkSamples(e);
        if (s.problems.length) return { state: "warn", detail: `${count(e.fields.length, "detail")} · ${count(s.records, "sample record")}, ${s.problems.length} with a value that doesn't fit: ${s.problems[0]}` };
        return { state: "done", detail: `${count(e.fields.length, "detail")} · ${count(s.records, "sample record")} to test with, each fits its fields` };
      });

    await this.step({ id: "code", label: "Writing and compiling the code" }, async () => {
      const files = await this.files(bp);
      const failed = files.filter((f) => f.outcome === "failed");
      if (failed.length) {
        console.error("[build] generated code didn't compile:", failed.map((f) => `${f.path}: ${f.error?.message}`).join("; "));
        const f = failed[0];
        return { state: "warn", detail: `${compiledWords(files)}. ${f.path}${f.error?.line ? ` line ${f.error.line}` : ""}: ${f.error?.message}. That's Prod AI's mistake in the download, not your app: the app itself still works.` };
      }
      return { state: "done", detail: compiledWords(files) };
    });

    for (const s of bp.screens)
      await this.step({ id: `screen-${s.id}`, label: `Inking ${s.title}`, objectRef: { type: "screen", id: s.id } }, async () => {
        const f = (await this.files(bp)).find((x) => x.objectRef?.type === "screen" && x.objectRef.id === s.id);
        if (!f) return { state: "done", detail: "Drawn by Prod AI's renderer" };
        if (f.outcome === "failed") return { state: "warn", detail: `${f.path} didn't compile${f.error?.line ? ` (line ${f.error.line})` : ""}: ${f.error?.message}` };
        return { state: "done", detail: `${f.path} · ${count(f.lines, "line")} · compiled` };
      });

    for (const a of bp.agents)
      await this.step({ id: `agent-${a.id}`, label: `Putting ${a.name} on duty`, objectRef: { type: "agent", id: a.id } }, async () => {
        const code = (await this.files(bp)).find((x) => x.objectRef?.type === "agent" && x.objectRef.id === a.id && /\.(py|ts)$/.test(x.path));
        const file = code ? ` · ${code.path} ${code.outcome === "compiled" ? "compiled" : code.outcome === "failed" ? "didn't compile" : "written"}` : "";
        return { state: code?.outcome === "failed" ? "warn" : "done", detail: `${helperDuty(a)}${file}` };
      });

    for (const c of bp.connections)
      await this.step({ id: `conn-${c.id}`, label: c.status === "missing" ? `${c.name} isn't connected yet, so it uses test data` : `Connecting ${c.name}`, objectRef: { type: "connection", id: c.id } }, async () =>
        c.status === "missing"
          ? { state: "warn", detail: "Add its key later in Keys & passwords. Until then the test version answers from sample data, and publishing reminds you." }
          : { state: "done", detail: "Its key is saved. The test version still uses sandbox data, so nothing real is touched." },
      );

    await this.tests(bp);
    if (this.report.phase === "fix") return;
    await this.finish();
  }

  /** The test runs: Claude plays each helper, a smaller call judges it; PRICE.testRun each, a failed run free. */
  private async tests(bp: Blueprint, again?: TestRun[]) {
    const id = again ? "tests-again" : "tests";
    if (this.done(id)) return;
    const planned = again ?? plannedRuns(bp.agents);
    const mode = this.report.tests;
    if (!again && mode !== "claude") {
      const n = planned.length;
      const credits = mode === "credits" ? await creditsThisMonth(this.ctx.user.id, false) : null;
      const detail: Record<Exclude<TestsMode, "claude">, string> = {
        none: "The plan has no test runs. Add some in AI helpers › Tests & reliability.",
        skipped: `The ${count(n, "test run")} weren't played this time. Play them any time from AI helpers › Tests & reliability (${PRICE.testRun} credits each).`,
        guest: `Test runs are played by Claude, so they need you signed in (${PRICE.testRun} credits each; signing in gives you free credits every month).`,
        credits: `The ${count(n, "test run")} need ${n * PRICE.testRun} credits and you have ${Math.floor(credits?.left ?? 0)} left, so they're skipped. Run them later from AI helpers.`,
        cap: `The ${count(n, "test run")} would pass this project's monthly spending limit, so they're skipped. Raise it in Settings.`,
        offline: "Claude isn't available right now, so the test runs are skipped. Run them later from AI helpers.",
      };
      await this.step({ id, label: n ? `Skipping ${count(n, "test run")}` : "No test runs to play" }, async () => ({ state: "skipped", detail: detail[mode] }));
      return;
    }

    const label = again ? `Playing ${count(planned.length, "test run")} again with the fix` : `Claude is playing ${count(planned.length, "test run")}`;
    this.ctx.emit({ t: "step", step: { id, label, state: "running", detail: "Each one is a practice conversation: Claude plays the helper, then a second call checks it against what should happen." } });
    const started = Date.now();
    const have = new Set(this.report.runs.filter((r) => Boolean(r.again) === Boolean(again)).map(runKey));
    const todo = planned.filter((p) => !have.has(runKey(p)));
    // Keep the lease alive while long runs are out.
    const beat = setInterval(() => void this.save().catch(() => {}), 25_000);
    try {
      const items = todo.flatMap((p) => {
        const agent = bp.agents.find((a) => a.id === p.agentId);
        const r = agent?.rehearsals.find((x) => x.id === p.rehearsalId);
        return agent && r ? [{ agent, r }] : [];
      });
      await playAll(
        items,
        ({ agent, r }) => this.playOne(bp, agent, r, Boolean(again)),
        async (run) => {
          this.report.runs.push(run);
          this.report.credits += run.credits;
          this.ctx.emit({ t: "run", run });
          await this.save();
        },
        CONCURRENT_RUNS,
      );
    } finally {
      clearInterval(beat);
    }

    const mine = this.report.runs.filter((r) => Boolean(r.again) === Boolean(again));
    const passed = mine.filter((r) => r.outcome === "pass").length;
    const failed = mine.filter((r) => r.outcome === "fail").length;
    const errors = mine.filter((r) => r.outcome === "error").length;
    const credits = mine.reduce((n, r) => n + r.credits, 0);
    const step: BuildStep = {
      id,
      label: again ? "Played the failed test runs again" : `Claude played ${count(mine.length, "test run")}`,
      state: failed || errors ? "warn" : "done",
      detail: `${passed} of ${mine.length} passed${failed ? ` · ${failed} failed` : ""}${errors ? ` · ${errors} couldn't run (not charged)` : ""} · ${credits ? `${credits} credits` : "free"}`,
      ms: Date.now() - started,
    };
    const at = this.report.steps.findIndex((s) => s.id === id);
    if (at === -1) this.report.steps.push(step);
    else this.report.steps[at] = step;
    this.ctx.emit({ t: "step", step });

    if (!again && failed) {
      const plan = buildFixPlan(bp, mine);
      if (plan && plan.options.length) {
        this.report.phase = "fix";
        this.report.fix = plan;
        await this.save();
        this.ctx.emit({ t: "fix", fix: plan });
        await this.release();
        return;
      }
    }
    await this.save();
  }

  private playOne(bp: Blueprint, agent: Blueprint["agents"][number], r: Blueprint["agents"][number]["rehearsals"][number], again: boolean): Promise<TestRun> {
    // A replay after Prod AI's fix is free; every call is still metered.
    return meteredTestRun(this.ctx.user, this.projectId, bp, agent, r, { free: again, again, meta: { hash: this.report.hash } });
  }

  /** The person picked a fix (or none): apply it, play the failed runs again for free, then finish. */
  async decide(project: ProjectRow, choice: "a" | "b" | "none") {
    const fix = this.report.fix!;
    if (fix.chosen) return;
    const option = fix.options.find((o) => o.id === choice);
    if (choice !== "none" && option) {
      const applied = applyOps(project.blueprint, option.ops);
      if (!applied.ok) throw new Error(`Could not apply the fix: ${applied.error}`);
      fix.chosen = choice;
      this.report.phase = "running";
      this.report.steps.push({ id: "fix", label: "Applying the fix", state: "done", detail: option.narration });
      await this.save({ blueprint: applied.blueprint });
      this.ctx.emit({ t: "step", step: this.report.steps[this.report.steps.length - 1] });
      await addLedger(this.ctx.supa, this.projectId, [
        {
          lane: "checked",
          kind: "repair",
          blame: "system_fix",
          title: `Caught: ${fix.title.replace(/^A test run caught /, "")}`,
          body: `${fix.failures.map((f) => `${f.agentName}, “${f.rehearsalName}”: ${f.reason}`).join(" ")} ${option.narration}`,
          objectRef: fix.objectRef,
          credits: 0,
          meta: { planId: fix.id, optionId: choice, changelog: option.changelog },
        },
      ]);
      const failed = this.report.runs.filter((r) => !r.again && r.outcome === "fail").map((r) => ({ ...r }));
      await this.tests(applied.blueprint, failed);
    } else {
      fix.chosen = "none";
      this.report.phase = "running";
      this.report.steps.push({ id: "fix", label: "Leaving it as it is", state: "skipped", detail: "You chose to finish without a fix. The failed test runs stay on record in AI helpers › Tests & reliability." });
      await this.save();
      this.ctx.emit({ t: "step", step: this.report.steps[this.report.steps.length - 1] });
    }
  }

  /** Who can see what, then save it as real: the plan marked built, each test run's result in its history, a version. */
  private async finish() {
    const bp = await this.blueprint();
    const project = await getProject(this.ctx.supa, this.projectId);
    await this.step({ id: "checks", label: "Checking sign-in and who can see what" }, async () => ({
      state: "done",
      detail: `${accessSummary(bp, project?.settings.app?.hiddenEntities)}${bp.meta.auth.enabled ? "" : " · sign-in is off, so anyone with the link can open the team screens"}`,
    }));

    const now = new Date().toISOString();
    const built = markBuilt(bp);
    // Each test's latest result (after a fix, the replay's) goes into its history, as AI helpers › Tests shows.
    const latest = new Map<string, TestRun>();
    for (const r of this.report.runs) if (r.outcome !== "error") latest.set(runKey(r), r);
    let passed = 0;
    for (const a of built.agents)
      for (const r of a.rehearsals) {
        const run = latest.get(runKey({ agentId: a.id, rehearsalId: r.id }));
        if (!run) continue;
        if (run.outcome === "pass") passed++;
        r.history = [...r.history, { at: now, pass: run.outcome === "pass", note: `Claude: ${run.reason}` }].slice(-10);
      }
    const played = latest.size;
    this.report.phase = "done";
    this.report.finishedAt = now;
    this.report.lease = undefined;
    const { data, error } = await this.ctx.supa
      .from("projects")
      .update({ blueprint: built, build_state: "built", build_report: this.report })
      .eq("id", this.projectId)
      .eq("build_state", "building")
      .eq("build_report->lease->>token", this.token)
      .select("id");
    if (error) throw error;
    if (!data?.length) throw new LostLease();

    const tests = played ? `${passed} of ${count(played, "test run")} passed` : "no test runs played";
    const cp = await addCheckpoint(this.ctx.supa, this.projectId, { label: "Build complete", kind: "build", blueprint: built, summary: `${count(built.screens.length, "screen")} · ${count(built.agents.length, "AI helper")} · ${tests}` });
    const files = this.compiled ? compiledWords(this.compiled) : null;
    await addLedger(this.ctx.supa, this.projectId, [
      { lane: "did", kind: "build_step", title: `Built ${count(built.screens.length, "screen")} and ${count(built.agents.length, "AI helper")}`, body: `${built.screens.map((s) => s.title).join(", ")}.${files ? ` Code: ${files}.` : ""}`, checkpointId: cp.id },
      {
        lane: "checked",
        kind: "rehearsal",
        title: played ? `Test runs: ${passed} of ${played} passed` : "Test runs: not played",
        body: played ? `Played by Claude and judged${this.report.credits ? ` · ${this.report.credits} credits` : ""}.${passed < played ? " Open AI helpers › Tests & reliability to see what failed." : ""}` : (this.report.steps.find((s) => s.id === "tests")?.detail ?? ""),
        checkpointId: cp.id,
      },
    ]);
    await this.ctx.supa.from("work_orders").update({ status: "done", resolved_at: now }).eq("project_id", this.projectId).eq("kind", "build").eq("status", "running");
    this.ctx.emit({ t: "done", summary: `${built.meta.name} is real: ${count(built.screens.length, "screen")}, ${count(built.agents.length, "AI helper")} on duty, ${tests}.` });
  }
}
