import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, type UIMessage, type UIMessageStreamWriter } from "ai";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProject, listAgentRuns, usageSummary } from "@/lib/db/queries";
import { logUsage } from "@/lib/db/writes";
import { getModel } from "@/lib/llm/provider";
import { costOf } from "@/lib/llm/pricing";
import { agentInstructions, approvalFor, buildTools, stubResult } from "@/lib/agents/tools";
import { scriptedRun } from "@/lib/agents/scripted";
import { holdModelBudget } from "@/lib/llm/guard";
import { PRICE, canAfford } from "@/lib/pricing";
import { shortId } from "@/lib/sim/hash";
import type { Agent, Blueprint } from "@/lib/blueprint/schema";
import type { ToolCallRecord } from "@/lib/db/types";
import { monthStartIso } from "@/lib/prices";

export const maxDuration = 90;
export const dynamic = "force-dynamic";

/** Output tokens per model step (a turn is at most 4 steps). */
const MAX_STEP_OUTPUT = 1200;

const approvalSecret = () => process.env.SIGNING_SECRET || process.env.SUPABASE_SECRET_KEY || undefined;

type Body = { messages: UIMessage[]; projectId: string; agentId: string; runId?: string };

/** What one chat request may carry: a conversation short enough to be cheap, in the shape the SDK sends. */
const LIMITS = { messages: 40, parts: 40, textChars: 4000, totalChars: 24000, bytes: 200_000 };

function readBody(raw: unknown): Body | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.projectId !== "string" || typeof b.agentId !== "string" || b.agentId.length > 80) return null;
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > LIMITS.messages) return null;
  if (JSON.stringify(b.messages).length > LIMITS.bytes) return null;
  let total = 0;
  for (const m of b.messages as { role?: unknown; parts?: unknown }[]) {
    // Only the two sides of the conversation: nobody sends their own system prompt.
    if (m.role !== "user" && m.role !== "assistant") return null;
    if (!Array.isArray(m.parts) || m.parts.length > LIMITS.parts) return null;
    for (const p of m.parts as { type?: unknown; text?: unknown }[]) {
      if (typeof p?.type !== "string") return null;
      if (typeof p.text === "string") {
        if (p.text.length > LIMITS.textChars) return null;
        total += p.text.length;
      }
    }
  }
  if (total > LIMITS.totalChars) return null;
  return { messages: b.messages as UIMessage[], projectId: b.projectId, agentId: b.agentId, runId: typeof b.runId === "string" ? b.runId : undefined };
}

/** A short assistant reply written straight into the stream (the budget fence, asking too fast). */
function notice(messages: UIMessage[], id: string, text: string, mode: string) {
  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: ({ writer }) => {
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
    },
  });
  return createUIMessageStreamResponse({ stream, headers: { "x-prodai-mode": mode } });
}

type AnyPart = { type: string; text?: string; toolCallId?: string; state?: string; input?: unknown; output?: unknown; approval?: { approved?: boolean; isAutomatic?: boolean } };

/**
 * The saved runs for Replay, fetched by the playground after each turn. A plain
 * fetch, not a router refresh: refreshing the page while the chat was still
 * updating swapped the whole Agents tab for its loading skeleton.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return new Response("projectId is required", { status: 400 });
  const supa = await createClient();
  const runs = await listAgentRuns(supa, projectId);
  return Response.json({ runs }, { headers: { "cache-control": "no-store" } });
}

async function say(writer: UIMessageStreamWriter, id: string, s: string) {
  writer.write({ type: "text-start", id });
  for (const chunk of s.match(/.{1,18}(\s|$)|.+/g) ?? [s]) {
    writer.write({ type: "text-delta", id, delta: chunk });
    await new Promise((r) => setTimeout(r, 18));
  }
  writer.write({ type: "text-end", id });
}

/**
 * Offline runs honour "Ask first" on look-ups too (an agent set to Approve
 * everything asks before every tool). The shared script (lib/agents/scripted.ts)
 * always reads without asking, so the read's approval is handled here and the run
 * then carries on to the action exactly as the script would. Returns false when
 * the read doesn't need a person, leaving the whole run to the shared script.
 */
async function scriptedGatedRead(writer: UIMessageStreamWriter, bp: Blueprint, agent: Agent, messages: UIMessage[]): Promise<boolean> {
  const read = agent.tools.find((t) => t.access === "read");
  if (!read || approvalFor(read) !== "user-approval") return false;
  const last = messages[messages.length - 1];
  type Part = { type: string; toolCallId?: string; state?: string; input?: { query?: string }; approval?: { approved?: boolean } };
  const responded = last?.role === "assistant" ? (last.parts as Part[]).find((p) => p.type.startsWith("tool-") && p.state === "approval-responded" && p.toolCallId) : undefined;
  if (responded && responded.type !== `tool-${read.id}`) return false; // the action's approval: the shared script finishes it
  const seed = shortId(JSON.stringify(messages.length) + agent.id, 8);
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const ask = (lastUser?.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join(" ").trim() || agent.rehearsals[0]?.input || "Help with the latest item.";
  writer.write({ type: "start-step" });
  if (!responded) {
    await say(writer, `a-${seed}`, `On it. ${agent.name} asks before every look-up, so I need your OK to check ${read.name.toLowerCase()} first.`);
    const id = `call_${seed}_r`;
    writer.write({ type: "tool-input-available", toolCallId: id, toolName: read.id, input: { query: ask.slice(0, 120) } });
    writer.write({ type: "tool-approval-request", approvalId: `appr_${seed}_r`, toolCallId: id });
    writer.write({ type: "finish-step" });
    return true;
  }
  if (!responded.approval?.approved) {
    writer.write({ type: "tool-output-denied", toolCallId: responded.toolCallId! });
    await say(writer, `t-${seed}`, "Understood. I won't look it up. Tell me what you'd like to do instead.");
    writer.write({ type: "finish-step" });
    return true;
  }
  writer.write({ type: "tool-output-available", toolCallId: responded.toolCallId!, output: stubResult(bp, agent, read, responded.input?.query ?? ask) });
  const act = agent.tools.find((t) => t.access === "irreversible") ?? agent.tools.find((t) => t.access === "write");
  if (!act) {
    await say(writer, `b-${seed}`, "Here's what I found. Nothing needs changing right now.");
    writer.write({ type: "finish-step" });
    return true;
  }
  const gated = approvalFor(act) === "user-approval";
  await say(writer, `b-${seed}`, `I found what I need. The next step is to ${act.name.toLowerCase()}${gated ? (act.access === "irreversible" ? ", which can't be undone, so I need your OK." : ", and that asks first too, so I need your OK.") : "."}`);
  const id = `call_${seed}_a`;
  writer.write({ type: "tool-input-available", toolCallId: id, toolName: act.id, input: { query: ask.slice(0, 140) } });
  if (gated) writer.write({ type: "tool-approval-request", approvalId: `appr_${seed}_a`, toolCallId: id });
  else {
    writer.write({ type: "tool-output-available", toolCallId: id, output: stubResult(bp, agent, act, ask) });
    await say(writer, `c-${seed}`, "Done, and it's in the log. Anything else?");
  }
  writer.write({ type: "finish-step" });
  return true;
}

function summarize(messages: UIMessage[], access: Record<string, ToolCallRecord["access"]>) {
  const transcript: { role: "user" | "assistant"; text: string }[] = [];
  const toolCalls: ToolCallRecord[] = [];
  for (const m of messages) {
    const text = (m.parts as AnyPart[]).filter((p) => p.type === "text").map((p) => p.text).join(" ").trim();
    if (text && (m.role === "user" || m.role === "assistant")) transcript.push({ role: m.role, text: text.slice(0, 2000) });
    for (const p of m.parts as AnyPart[]) {
      if (!p.type.startsWith("tool-") || !p.toolCallId) continue;
      const toolId = p.type.slice(5);
      toolCalls.push({
        toolCallId: p.toolCallId,
        toolId,
        access: access[toolId] ?? "read",
        input: p.input,
        output: p.output,
        state: p.state === "output-denied" ? "denied" : p.state === "output-error" ? "error" : "done",
        approval: p.approval ? (p.approval.approved === false ? "denied" : p.approval.isAutomatic ? "logged" : "approved") : access[toolId] === "write" ? "logged" : "auto",
      });
    }
  }
  return { transcript, toolCalls };
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const body = readBody(await req.json().catch(() => null));
  if (!body) return new Response("That conversation is too long or malformed. Start a new one.", { status: 400 });
  const supa = await createClient();
  const project = await getProject(supa, body.projectId);
  const agent = project?.blueprint.agents.find((a) => a.id === body.agentId);
  if (!project || !agent) return new Response("Agent not found", { status: 404 });
  const bp = project.blueprint;
  const access = Object.fromEntries(agent.tools.map((t) => [t.id, t.access])) as Record<string, ToolCallRecord["access"]>;
  const runId = body.runId && /^[0-9a-f-]{36}$/i.test(body.runId) ? body.runId : crypto.randomUUID();

  const persist = async (messages: UIMessage[], tokens: { input: number; output: number; costUsd: number; mode: "live" | "scripted" }) => {
    const { transcript, toolCalls } = summarize(messages, access);
    const approvals = toolCalls.filter((t) => t.approval === "approved" || t.approval === "denied").map((t) => ({ toolId: t.toolId, decision: t.approval as "approved" | "denied", at: new Date().toISOString() }));
    const { data: existing } = await supa.from("agent_runs").select("input_tokens, output_tokens, cost_usd").eq("id", runId).maybeSingle();
    await supa.from("agent_runs").upsert({
      id: runId,
      project_id: project.id,
      agent_id: agent.id,
      checkpoint_id: project.current_checkpoint_id,
      transcript,
      tool_calls: toolCalls,
      approvals,
      input_tokens: (existing?.input_tokens ?? 0) + tokens.input,
      output_tokens: (existing?.output_tokens ?? 0) + tokens.output,
      cost_usd: Number(existing?.cost_usd ?? 0) + tokens.costUsd,
      mode: tokens.mode,
    });
  };

  // Budget fence: stop before passing the cap, and say so (HTTP 200, not an error).
  const spent = await usageSummary(supa, { projectId: project.id, sinceIso: monthStartIso() });
  if (spent.credits >= project.settings.budgetCapCredits) {
    return notice(body.messages, "cap", `I've paused: this project has used ${Math.round(spent.credits)} of its ${project.settings.budgetCapCredits}-credit cap. Raise the cap in Settings and I'll carry on. Nothing was charged for this message.`, "budget");
  }

  const hold = await holdModelBudget(user, "chat");
  if (!hold.ok && hold.reason === "rate") return notice(body.messages, "rate", "That's a lot of messages in a few minutes. Give me a moment, then try again. Nothing was charged.", "rate");
  // A message answered by Claude costs credits; without enough, the helper plays its scripted run, free.
  const afford = hold.ok ? await canAfford(user.id, user.isAnonymous, "helperMessage") : null;
  if (hold.ok && afford && !afford.ok) await hold.release();
  const m = hold.ok && afford?.ok ? getModel() : null;
  if (m && hold.ok) {
    // Metered exactly once, however the run ends: finished, failed or abandoned. The provider bills every step.
    const done = { input: 0, output: 0 };
    let metered = false;
    const inFlight = { input: Math.ceil((agentInstructions(bp, agent).length + JSON.stringify(body.messages).length) / 3.5), output: MAX_STEP_OUTPUT };
    const meter = async (input: number, output: number, failed: boolean) => {
      if (metered) return;
      metered = true;
      const { costUsd } = costOf(m.id, input, output);
      // One price per message answered; a failed run is not charged (its real cost still counts toward the daily model budget).
      await logUsage({ userId: user.id, projectId: project.id, kind: "agent_run", provider: "anthropic", model: m.id, inputTokens: input, outputTokens: output, costUsd, credits: failed ? 0 : PRICE.helperMessage, meta: { agentId: agent.id, runId, ...(failed ? { failed: true } : {}) } });
      await hold.release();
    };
    try {
      const result = streamText({
        model: m.model,
        instructions: agentInstructions(bp, agent),
        messages: await convertToModelMessages(body.messages),
        tools: buildTools(bp, agent),
        // One rule for every tool, shared with codegen: "ask" or irreversible waits for a person.
        // Supervision presets write these permissions, so "Approve everything" gates every tool here.
        toolApproval: Object.fromEntries(agent.tools.map((t) => [t.id, approvalFor(t)])),
        // Bounded per turn: a few steps, each with a short answer, so one message can't cost dollars.
        stopWhen: isStepCount(4),
        maxOutputTokens: MAX_STEP_OUTPUT,
        timeout: 80_000,
        maxRetries: 0,
        // Approval requests are signed here and checked when they come back, so a browser can't forge an "Allow".
        experimental_toolApprovalSecret: approvalSecret(),
        providerOptions: { anthropic: { effort: "low", metadata: { userId: user.id } } },
        onStepEnd: ({ usage }) => {
          done.input += usage.inputTokens ?? 0;
          done.output += usage.outputTokens ?? 0;
        },
        onFinish: async ({ totalUsage }) => meter(totalUsage.inputTokens ?? 0, totalUsage.outputTokens ?? 0, false),
        onError: async ({ error }) => {
          console.error("[chat] model run failed:", error instanceof Error ? error.message : error);
          await meter(done.input + inFlight.input, done.output + inFlight.output, true);
        },
        onAbort: async () => meter(done.input + inFlight.input, done.output + inFlight.output, true),
      });
      const stream = toUIMessageStream({
        stream: result.stream,
        originalMessages: body.messages,
        onEnd: async ({ messages }) => {
          const usage = await result.totalUsage;
          const input = usage.inputTokens ?? 0;
          const output = usage.outputTokens ?? 0;
          await persist(messages, { input, output, costUsd: costOf(m.id, input, output).costUsd, mode: "live" });
        },
      });
      return createUIMessageStreamResponse({ stream, headers: { "x-prodai-mode": "live", "x-prodai-run": runId } });
    } catch (e) {
      console.error("[chat] model failed, scripted fallback:", e instanceof Error ? e.message : e);
      await hold.release();
    }
  } else if (hold.ok && afford?.ok) await hold.release();

  const stream = createUIMessageStream({
    originalMessages: body.messages,
    execute: async ({ writer }) => {
      if (!(await scriptedGatedRead(writer, bp, agent, body.messages))) await scriptedRun(writer, bp, agent, body.messages);
    },
    onEnd: async ({ messages }) => persist(messages, { input: 0, output: 0, costUsd: 0, mode: "scripted" }),
  });
  return createUIMessageStreamResponse({ stream, headers: { "x-prodai-mode": "scripted", "x-prodai-run": runId } });
}
