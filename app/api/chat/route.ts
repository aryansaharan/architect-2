import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, type UIMessage } from "ai";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProject, usageSummary } from "@/lib/db/queries";
import { logUsage } from "@/lib/db/writes";
import { getModel } from "@/lib/llm/provider";
import { costOf } from "@/lib/llm/pricing";
import { agentInstructions, approvalFor, buildTools } from "@/lib/agents/tools";
import { scriptedRun } from "@/lib/agents/scripted";
import { modelBudgetOk } from "@/lib/llm/guard";
import type { ToolCallRecord } from "@/lib/db/types";

export const maxDuration = 90;
export const dynamic = "force-dynamic";

type Body = { messages: UIMessage[]; projectId: string; agentId: string; runId?: string };

type AnyPart = { type: string; text?: string; toolCallId?: string; state?: string; input?: unknown; output?: unknown; approval?: { approved?: boolean; isAutomatic?: boolean } };

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
  const body = (await req.json()) as Body;
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
  const spent = await usageSummary(supa, { projectId: project.id });
  if (spent.credits >= project.settings.budgetCapCredits) {
    const stream = createUIMessageStream({
      originalMessages: body.messages,
      execute: ({ writer }) => {
        writer.write({ type: "text-start", id: "cap" });
        writer.write({ type: "text-delta", id: "cap", delta: `I've paused: this project has used ${Math.round(spent.credits)} of its ${project.settings.budgetCapCredits}-credit cap. Raise the cap in Settings and I'll carry on. Nothing was charged for this message.` });
        writer.write({ type: "text-end", id: "cap" });
      },
    });
    return createUIMessageStreamResponse({ stream, headers: { "x-architect-mode": "budget" } });
  }

  const m = (await modelBudgetOk(supa, user)) ? getModel() : null;
  if (m) {
    try {
      const result = streamText({
        model: m.model,
        instructions: agentInstructions(bp, agent),
        messages: await convertToModelMessages(body.messages),
        tools: buildTools(bp, agent),
        toolApproval: Object.fromEntries(agent.tools.map((t) => [t.id, approvalFor(t)])),
        stopWhen: isStepCount(6),
        timeout: 80_000,
        maxRetries: 1,
        providerOptions: { anthropic: { effort: "low", metadata: { userId: user.id } } },
        onFinish: async ({ totalUsage }) => {
          const input = totalUsage.inputTokens ?? 0;
          const output = totalUsage.outputTokens ?? 0;
          const { costUsd, credits } = costOf(m.id, input, output);
          await logUsage(supa, { userId: user.id, projectId: project.id, kind: "agent_run", provider: "anthropic", model: m.id, inputTokens: input, outputTokens: output, costUsd, credits, meta: { agentId: agent.id, runId } });
        },
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
      return createUIMessageStreamResponse({ stream, headers: { "x-architect-mode": "live", "x-architect-run": runId } });
    } catch (e) {
      console.error("[chat] model failed, scripted fallback:", e instanceof Error ? e.message : e);
    }
  }

  const stream = createUIMessageStream({
    originalMessages: body.messages,
    execute: async ({ writer }) => scriptedRun(writer, bp, agent, body.messages),
    onEnd: async ({ messages }) => persist(messages, { input: 0, output: 0, costUsd: 0, mode: "scripted" }),
  });
  return createUIMessageStreamResponse({ stream, headers: { "x-architect-mode": "scripted", "x-architect-run": runId } });
}
