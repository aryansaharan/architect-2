import "server-only";
import { generateText, isStepCount, Output } from "ai";
import { z } from "zod";
import type { Agent, Blueprint, Rehearsal } from "@/lib/blueprint/schema";
import { agentInstructions, approvalFor, buildTools } from "@/lib/agents/tools";
import { getFastModel, getModel, supportsEffort } from "@/lib/llm/provider";
import { costOf, failedSpend, type ModelSpend } from "@/lib/llm/pricing";
import { holdModelBudgetAs, promptHoldUsd } from "@/lib/llm/guard";
import { logUsage } from "@/lib/db/writes";
import { PRICE } from "@/lib/prices";
import { STYLE_RULE, cleanDeep } from "@/lib/text";
import type { SuggestedFix, TestRun, ToolCallSeen } from "./report";

/**
 * One real test run: Claude plays the AI helper on the test's message, with the helper's real
 * instructions, rules and tools (on sandboxed sample data, exactly like Try it), and every tool that
 * asks a person first stops the run there, as it would in the app. Then a second, smaller call judges
 * the transcript against what the test expects and, when it fails, suggests the smallest fix.
 */

const HELPER = { output: 900, steps: 4 };
const JUDGE = { output: 500 };

/** What one test run may cost at most, for the daily budget's hold. */
export function testRunHoldUsd(bp: Blueprint, agent: Agent, r: Rehearsal): number {
  const chars = agentInstructions(bp, agent).length + r.input.length + 6000;
  return promptHoldUsd(chars, HELPER.output, HELPER.steps) + promptHoldUsd(chars / 2, JUDGE.output);
}

const Verdict = z.object({
  pass: z.boolean().describe("True when the helper's behaviour meets the expectation"),
  reason: z.string().describe("One plain sentence for the app's owner, under 30 words: what the helper did, and how that meets or misses the expectation"),
  fix: z.enum(["none", "rule", "ask_first"]).describe("When it fails: 'rule' to add one rule to the helper, or 'ask_first' when a tool it used should wait for a person's OK. 'none' only when it passes"),
  rule: z.string().describe("When fix is 'rule': the rule, an imperative sentence under 20 words that would have prevented this failure. Otherwise empty"),
  toolId: z.string().describe("When fix is 'ask_first': the id of the tool that must ask a person first. Otherwise empty"),
});

const JUDGE_INSTRUCTIONS = `You judge one test run of an AI helper inside a business app. You get the helper's job, its rules and tools, the test's message, what the test expects, and what the helper did.
Judge only against the expectation. Style, length and politeness don't matter unless the expectation says so.
A tool call marked "asked a person first" paused for a person's OK, and in this test run a stand-in person said yes, so the helper could carry on. Asking first is always correct, never a reason to fail, and counts as having a person's approval.
Tool results come from sandboxed sample data. That is fine and never a reason to fail.
When it fails, suggest the smallest fix: one specific rule, or the one tool that should ask first. Write for a non-technical owner, in plain words. ${STYLE_RULE}`;

type Part = { type: string; text?: string; toolCallId?: string; toolName?: string; input?: unknown };

const brief = (v: unknown, n = 200) => {
  const s = typeof v === "string" ? v : JSON.stringify(v ?? "");
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

export type PlayedRun = { run: Omit<TestRun, "credits" | "at" | "again">; spend: ModelSpend[] };

export async function playTestRun(bp: Blueprint, agent: Agent, r: Rehearsal, opts: { userId: string }): Promise<PlayedRun> {
  const base = { agentId: agent.id, rehearsalId: r.id, name: r.name };
  const m = getModel();
  const judge = getFastModel();
  if (!m || !judge) return { run: { ...base, outcome: "error", reason: "Claude isn't available right now, so this test run couldn't be played.", reply: "", calls: [], fix: null }, spend: [] };
  const spend: ModelSpend[] = [];
  const tools = new Map(agent.tools.map((t) => [t.id, t]));

  // 1. Claude plays the helper.
  let reply = "";
  const calls: ToolCallSeen[] = [];
  try {
    const result = await generateText({
      model: m.model,
      instructions: agentInstructions(bp, agent),
      prompt: r.input,
      tools: buildTools(bp, agent),
      // A tool that asks a person first is approved by a stand-in person here, so the helper can finish its job
      // the way it would after a real OK. The transcript still records that it asked.
      toolApproval: Object.fromEntries(agent.tools.map((t) => [t.id, approvalFor(t) === "user-approval" ? { type: "approved" as const, reason: "Test run: a stand-in person said yes" } : approvalFor(t)])),
      stopWhen: isStepCount(HELPER.steps),
      maxOutputTokens: HELPER.output,
      timeout: 90_000,
      maxRetries: 0,
      providerOptions: { anthropic: { ...(supportsEffort(m.id) ? { effort: "low" as const } : {}), metadata: { userId: opts.userId } } },
    });
    const byId = new Map<string, ToolCallSeen>();
    for (const step of result.steps)
      for (const p of step.content as Part[]) {
        if (p.type === "text" && p.text) reply += (reply ? "\n" : "") + p.text;
        if (p.type === "tool-call" && p.toolCallId && p.toolName && !byId.has(p.toolCallId)) {
          const t = tools.get(p.toolName);
          const asked = t ? approvalFor(t) === "user-approval" : false;
          const seen: ToolCallSeen = { toolId: p.toolName, name: t?.name ?? p.toolName, access: t?.access ?? "read", asked, input: brief((p.input as { query?: string })?.query ?? p.input) };
          byId.set(p.toolCallId, seen);
          calls.push(seen);
        }
      }
    const u = result.totalUsage;
    spend.push({ model: m.id, inputTokens: u.inputTokens ?? 0, outputTokens: u.outputTokens ?? 0, ...costOf(m.id, u.inputTokens ?? 0, u.outputTokens ?? 0), credits: 0 });
  } catch (e) {
    console.error("[test-run] helper run failed:", e instanceof Error ? e.message : e);
    spend.push(await failedSpend(m.id, undefined, { inputTokens: Math.ceil(agentInstructions(bp, agent).length / 3.5) * HELPER.steps, outputTokens: HELPER.output * HELPER.steps }));
    return { run: { ...base, outcome: "error", reason: "Claude couldn't finish this test run (it timed out or failed), so it isn't counted.", reply: "", calls: [], fix: null }, spend };
  }

  // 2. A smaller call judges it against the expectation.
  const did = [
    reply ? `It replied:\n${reply.slice(0, 3000)}` : "It wrote no reply.",
    calls.length
      ? `Tools it called:\n${calls.map((c) => `- ${c.name} (id ${c.toolId}, ${c.access === "irreversible" ? "can't be undone" : c.access === "write" ? "changes data" : "looks things up"}): "${c.input}"${c.asked ? ", asked a person first (the stand-in said yes), then ran" : ", ran"}`).join("\n")}`
      : "It called no tools.",
  ].join("\n\n");
  const prompt = `The helper: ${agent.name}, ${agent.role}.
Its job: ${agent.jobDescription.slice(0, 1500)}
Its rules:
${agent.rules.map((x) => `- ${x}`).join("\n")}
Its tools:
${agent.tools.map((t) => `- ${t.id}: ${t.name} (${t.access}; ${approvalFor(t) === "user-approval" ? "asks a person first" : "runs on its own"})`).join("\n") || "none"}

The test "${r.name}".
Message: ${r.input}
Expected: ${r.expect}

What the helper did:
${did}`;
  try {
    const v = await generateText({
      model: judge.model,
      instructions: JUDGE_INSTRUCTIONS,
      prompt,
      output: Output.object({ schema: Verdict, name: "verdict" }),
      maxOutputTokens: JUDGE.output,
      timeout: 25_000,
      maxRetries: 1,
      providerOptions: { anthropic: { ...(supportsEffort(judge.id) ? { effort: "low" as const } : {}), structuredOutputMode: "outputFormat", metadata: { userId: opts.userId } } },
    });
    const u = v.usage;
    spend.push({ model: judge.id, inputTokens: u.inputTokens ?? 0, outputTokens: u.outputTokens ?? 0, ...costOf(judge.id, u.inputTokens ?? 0, u.outputTokens ?? 0), credits: 0 });
    const out = cleanDeep(v.output) as z.infer<typeof Verdict>;
    let fix: SuggestedFix | null = null;
    if (!out.pass) {
      if (out.fix === "ask_first" && tools.has(out.toolId.trim())) fix = { kind: "ask_first", toolId: out.toolId.trim() };
      else if (out.rule.trim()) fix = { kind: "rule", rule: out.rule.trim().slice(0, 200) };
      else fix = { kind: "rule", rule: `When asked something like this: ${r.expect}`.slice(0, 200) };
    }
    return { run: { ...base, outcome: out.pass ? "pass" : "fail", reason: out.reason.trim().slice(0, 300) || (out.pass ? "Behaved as expected." : "Didn't do what the test expects."), reply: reply.slice(0, 1200), calls, fix }, spend };
  } catch (e) {
    console.error("[test-run] judge failed:", e instanceof Error ? e.message : e);
    spend.push(await failedSpend(judge.id, undefined, { inputTokens: Math.ceil(prompt.length / 3.5), outputTokens: JUDGE.output }));
    return { run: { ...base, outcome: "error", reason: "The helper answered, but judging the answer failed, so this test run isn't counted.", reply: reply.slice(0, 1200), calls, fix: null }, spend };
  }
}

/**
 * A test run with its money handled: holds the daily AI budget, plays it, meters every model call, and
 * charges PRICE.testRun once when Claude finished it (never when it couldn't run, never for a replay after
 * Prod AI's fix). Used by the build and by AI helpers › Tests & reliability.
 */
export async function meteredTestRun(
  user: { id: string; isAnonymous: boolean },
  projectId: string,
  bp: Blueprint,
  agent: Agent,
  r: Rehearsal,
  opts: { free?: boolean; again?: boolean; meta?: Record<string, unknown> } = {},
): Promise<TestRun> {
  const at = new Date().toISOString();
  const hold = await holdModelBudgetAs({ payerId: user.id, payerIsGuest: user.isAnonymous, rateKey: `user:${user.id}`, op: "test", estimateUsd: testRunHoldUsd(bp, agent, r) });
  if (!hold.ok) {
    const reason = hold.reason === "rate" ? "Too many test runs in a few minutes, so this one was skipped." : "Prod AI's AI budget for today is used up, so this test run was skipped.";
    return { agentId: agent.id, rehearsalId: r.id, name: r.name, outcome: "error", reason, reply: "", calls: [], fix: null, credits: 0, at, held: hold.reason, ...(opts.again ? { again: true } : {}) };
  }
  try {
    const played = await playTestRun(bp, agent, r, { userId: user.id });
    const credits = played.run.outcome !== "error" && !opts.free ? PRICE.testRun : 0;
    for (const [i, s] of played.spend.entries())
      await logUsage({
        userId: user.id,
        projectId,
        // Counted like any AI helper message toward the daily AI budget (model_spend_usd), marked as a test run.
        kind: "agent_run",
        provider: "anthropic",
        model: s.model,
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        costUsd: s.costUsd,
        credits: i === 0 ? credits : 0,
        meta: { testRun: true, agentId: agent.id, rehearsalId: r.id, ...opts.meta, ...(opts.again ? { again: true } : {}), ...(s.failed ? { failed: true } : {}) },
      });
    return { ...played.run, credits, at, ...(opts.again ? { again: true } : {}) };
  } finally {
    await hold.release();
  }
}

/**
 * Plays test runs a few at a time. The daily AI budget holds each run's worst case while it's out, so with
 * little room left a run can be refused while others are still going: it waits for them and tries again,
 * and is only reported as skipped once nothing else is running.
 */
export async function playAll<T>(items: T[], play: (item: T) => Promise<TestRun>, onDone: (run: TestRun) => Promise<void> | void, concurrency = 3): Promise<void> {
  let next = 0;
  let inFlight = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      let run: TestRun;
      for (let tries = 0; ; tries++) {
        inFlight++;
        try {
          run = await play(item);
        } finally {
          inFlight--;
        }
        if (run.held !== "budget" || inFlight === 0 || tries >= 60) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      await onDone(run);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}
