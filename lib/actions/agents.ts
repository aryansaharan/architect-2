"use server";
import { revalidatePath } from "next/cache";
import { STYLE_RULE, cleanDeep } from "@/lib/text";
import { generateText, Output } from "ai";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProject } from "@/lib/db/queries";
import { addCheckpoint, addLedger, logUsage, updateProject } from "@/lib/db/writes";
import { BlueprintSchema, type Agent, type Blueprint, type Framework } from "@/lib/blueprint/schema";
import { integrityErrors } from "@/lib/blueprint/validate";
import { estimate } from "@/lib/blueprint/estimate";
import { getModel } from "@/lib/llm/provider";
import { costOf } from "@/lib/llm/pricing";
import { hash } from "@/lib/sim/hash";
import { rehearsalOutcome } from "@/lib/sim/rehearse";
import { modelBudgetOk } from "@/lib/llm/guard";
import { applySupervision, estimateRunCredits, FRAMEWORK_LABEL, PERMISSION_LABEL, presetPermission, SUPERVISION_LABEL } from "@/lib/blueprint/describe";
import type { LedgerKind } from "@/lib/db/types";
import { agentLocationError, agentNameFromLocation } from "@/lib/import/detect";

type R = { ok: true; agentId?: string; summary?: string } | { ok: false; error: string };

async function save(projectId: string, bp: Blueprint, title: string, body: string, agentId: string, credits = 0, opts: { kind?: LedgerKind; revalidate?: boolean } = {}) {
  const supa = await createClient();
  const parsed = BlueprintSchema.safeParse(bp);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid agent");
  const errs = integrityErrors(parsed.data);
  if (errs.length) throw new Error(errs[0]);
  parsed.data.estimate = estimate(parsed.data);
  await updateProject(supa, projectId, { blueprint: parsed.data });
  const cp = await addCheckpoint(supa, projectId, { label: title.slice(0, 60), kind: "change", blueprint: parsed.data });
  await addLedger(supa, projectId, [{ lane: "did", kind: opts.kind ?? "change", title, body, credits, objectRef: { type: "agent", id: agentId }, checkpointId: cp.id }]);
  if (opts.revalidate !== false) revalidatePath(`/p/${projectId}`, "layout");
}

/**
 * Choose how closely an agent is watched. Supervision is a preset, not a second
 * permission system: it rewrites every tool's permission (lib/blueprint/describe.ts),
 * so the agent label and its tools can never contradict each other.
 */
export async function applySupervisionPreset(projectId: string, agentId: string, level: Agent["supervision"]): Promise<R> {
  await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false, error: "Project not found" };
  const bp = structuredClone(project.blueprint);
  const agent = bp.agents.find((a) => a.id === agentId);
  if (!agent) return { ok: false, error: "Agent not found" };
  const before = new Map(agent.tools.map((t) => [t.id, t.permission]));
  applySupervision(agent, level);
  const changed = agent.tools.filter((t) => before.get(t.id) !== t.permission);
  const label = SUPERVISION_LABEL[level].label;
  try {
    await save(
      projectId,
      bp,
      `${agent.name}: ${label.toLowerCase()}`,
      changed.length ? `Preset applied. ${changed.map((t) => `${t.name}: ${PERMISSION_LABEL[t.permission]}`).join(" · ")}. Direct edit: free.` : "Preset applied. Every tool already matched. Direct edit: free.",
      agentId,
      0,
      { kind: "permission" },
    );
    return { ok: true, summary: changed.length ? `${changed.length} tool${changed.length === 1 ? "" : "s"} updated to match` : "Every tool already matched" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save" };
  }
}

/**
 * "Always allow" from a playground approval card: the tool moves to "Tell me".
 * Deliberately doesn't revalidate the page: a router refresh while the chat is
 * still streaming swapped the Agents tab for its loading skeleton. The playground
 * refreshes the rest of the studio once the conversation is out of view.
 */
export async function allowToolAlways(projectId: string, agentId: string, toolId: string): Promise<R> {
  await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false, error: "Project not found" };
  const bp = structuredClone(project.blueprint);
  const agent = bp.agents.find((a) => a.id === agentId);
  const tool = agent?.tools.find((t) => t.id === toolId);
  if (!agent || !tool) return { ok: false, error: "Tool not found" };
  if (tool.access === "irreversible") return { ok: false, error: "Actions that can't be undone always ask first" };
  tool.permission = "log";
  try {
    await save(projectId, bp, `${agent.name} · ${tool.name}: tell me`, "You chose “Always allow” in Try it. Direct edit: free.", agentId, 0, { kind: "permission", revalidate: false });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save" };
  }
}

const kebab = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "agent";
const snake = (s: string) => kebab(s).replace(/-/g, "_");
function uniqueId(bp: Blueprint, base: string) {
  let id = base;
  let n = 2;
  while (bp.agents.some((a) => a.id === id)) id = `${base}-${n++}`;
  return id;
}

/** Run every rehearsal for one agent. Deterministic: rehearsals catch real weaknesses in the blueprint. */
export async function runRehearsals(projectId: string, agentId: string): Promise<R & { passed?: number; total?: number }> {
  await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false, error: "Project not found" };
  const bp = structuredClone(project.blueprint);
  const agent = bp.agents.find((a) => a.id === agentId);
  if (!agent) return { ok: false, error: "Agent not found" };
  const now = new Date().toISOString();
  let passed = 0;
  for (const r of agent.rehearsals) {
    const out = rehearsalOutcome(agent, r);
    if (out.pass) passed++;
    r.history = [...r.history, { at: now, pass: out.pass, note: out.note }].slice(-10);
  }
  bp.estimate = estimate(bp);
  await updateProject(supa, projectId, { blueprint: bp });
  const total = agent.rehearsals.length;
  await addLedger(supa, projectId, [
    { lane: "checked", kind: "rehearsal", title: `Test runs for ${agent.name} · ${passed} of ${total} passed`, body: passed === total ? "Every conversation went as expected." : "A test run failed. Open Tests & reliability to see why and fix it.", credits: 0, objectRef: { type: "agent", id: agentId } },
  ]);
  revalidatePath(`/p/${projectId}`, "layout");
  return { ok: true, passed, total };
}

export async function addRehearsal(projectId: string, agentId: string, input: { name: string; input: string; expect: string }): Promise<R> {
  await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false, error: "Project not found" };
  const bp = structuredClone(project.blueprint);
  const agent = bp.agents.find((a) => a.id === agentId);
  if (!agent) return { ok: false, error: "Agent not found" };
  if (agent.rehearsals.length >= 8) return { ok: false, error: "Eight rehearsals is the limit for one agent" };
  if (!input.input.trim() || !input.expect.trim()) return { ok: false, error: "Add what happens and what should happen" };
  agent.rehearsals.push({ id: `r-${kebab(input.name || input.input)}-${agent.rehearsals.length}`, name: (input.name || input.input).slice(0, 50), input: input.input.slice(0, 300), expect: input.expect.slice(0, 300), history: [] });
  try {
    await save(projectId, bp, `Added a rehearsal to ${agent.name}`, `“${input.input.slice(0, 120)}” → ${input.expect.slice(0, 120)}`, agentId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not add" };
  }
}

const NewAgentSchema = z.object({
  name: z.string().describe("Two words max, a job title"),
  role: z.string().describe("Under 6 words"),
  description: z.string().describe("2 plain sentences: what it does and what it never does"),
  jobDescription: z.string().describe("System prompt, 3–5 sentences, second person"),
  rules: z.array(z.string()).describe("2–4 short guardrails"),
  supervision: z.enum(["autonomous", "spot_check", "approve_all"]),
  tools: z.array(z.object({ name: z.string(), description: z.string(), connection: z.string().describe("Exactly one of the provided connection names"), access: z.enum(["read", "write", "irreversible"]) })).describe("2–4 tools"),
  rehearsals: z.array(z.object({ name: z.string(), input: z.string(), expect: z.string() })).describe("2 test conversations: typical + edge case"),
});

export async function addAgentFromDescription(projectId: string, description: string): Promise<R> {
  const user = await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false, error: "Project not found" };
  const text = description.trim().slice(0, 800);
  if (text.length < 10) return { ok: false, error: "Describe the job in a sentence" };
  const bp = structuredClone(project.blueprint);
  if (bp.agents.length >= 6) return { ok: false, error: "Six agents is the limit for one project. Fewer, sharper agents behave better" };
  const db = bp.connections.find((c) => c.kind === "database") ?? bp.connections[0];
  let agent: Agent | null = null;
  let credits = 0;
  const m = (await modelBudgetOk(supa, user)) ? getModel() : null;
  if (m) {
    try {
      const r = await generateText({
        model: m.model,
        instructions: "You design one new AI agent for an existing Prod AI project. Be honest about risk: anything that sends, pays, creates or deletes outside the app is 'irreversible'. " + STYLE_RULE,
        prompt: `Project: ${bp.meta.name}: ${bp.meta.plain}\nExisting agents: ${bp.agents.map((a) => `${a.name} (${a.role})`).join("; ")}\nConnections: ${bp.connections.map((c) => c.name).join(", ")}\nData: ${bp.entities.map((e) => e.plural).join(", ")}\n\nNew agent: ${text}`,
        output: Output.object({ schema: NewAgentSchema, name: "new_agent" }),
        maxOutputTokens: 3000,
        timeout: 60_000,
        maxRetries: 1,
        providerOptions: { anthropic: { effort: "low", structuredOutputMode: "outputFormat" } },
      });
      const o = cleanDeep(r.output);
      const id = uniqueId(bp, kebab(o.name));
      const toolIds = new Set<string>();
      agent = {
        id,
        name: o.name,
        role: o.role,
        avatarHue: hash(id) % 360,
        plain: o.description,
        jobDescription: o.jobDescription,
        rules: o.rules.slice(0, 6).length ? o.rules.slice(0, 6) : ["Ask a person when you are unsure."],
        tools: o.tools.slice(0, 5).map((t) => {
          let tid = snake(t.name);
          while (toolIds.has(tid)) tid += "_2";
          toolIds.add(tid);
          const conn = bp.connections.find((c) => c.name.toLowerCase() === t.connection.toLowerCase()) ?? bp.connections.find((c) => t.connection.toLowerCase().includes(c.name.toLowerCase().split(" ")[0])) ?? db;
          // Supervision is a preset: every tool's permission follows it, so the two never disagree.
          return { id: tid, name: t.name, description: t.description, connectionId: conn.id, access: t.access, permission: presetPermission(o.supervision, t.access) };
        }),
        supervision: o.supervision,
        knowledge: [],
        memory: { scope: "project", retentionDays: 30 },
        cost: { creditsPerRun: 0, model: m.id },
        triggers: ["chat"],
        rehearsals: o.rehearsals.slice(0, 4).map((x, i) => ({ id: `r-${kebab(x.name)}-${i}`, name: x.name, input: x.input, expect: x.expect, history: [] })),
        framework: "lyzr",
        origin: "generated",
      };
      const u = r.usage;
      credits = costOf(m.id, u.inputTokens ?? 0, u.outputTokens ?? 0).credits;
      await logUsage(supa, { userId: user.id, projectId, kind: "llm", provider: "anthropic", model: m.id, inputTokens: u.inputTokens ?? 0, outputTokens: u.outputTokens ?? 0, costUsd: costOf(m.id, u.inputTokens ?? 0, u.outputTokens ?? 0).costUsd, credits, meta: { op: "new-agent" } });
    } catch (e) {
      console.error("[agents] model failed, template:", e instanceof Error ? e.message : e);
    }
  }
  if (!agent) {
    const name = text.split(/[.,;:]| that | who | to /i)[0].split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ") || "Helper";
    const id = uniqueId(bp, kebab(name));
    agent = {
      id,
      name,
      role: "New agent",
      avatarHue: hash(id) % 360,
      plain: `${text} It starts with read access only, and approves everything: it asks before each look-up. Loosen it when you trust it.`,
      jobDescription: `You are ${name}. ${text} Use your tools to look things up before answering, keep answers short, and hand anything you're unsure about to a person.`,
      rules: ["Hand anything you're unsure about to a person.", "Never act outside this project's data."],
      // Starts careful: Approve everything, so even its one look-up tool asks first until you loosen it.
      tools: [{ id: "look_up", name: "Look things up", description: "Search the project's records.", connectionId: db.id, access: "read", permission: presetPermission("approve_all", "read") }],
      supervision: "approve_all",
      knowledge: [],
      memory: { scope: "session", retentionDays: 30 },
      cost: { creditsPerRun: 0, model: m?.id ?? "claude-opus-5" },
      triggers: ["chat"],
      rehearsals: [{ id: "r-first", name: "First question", input: `A typical request: ${text.slice(0, 80)}`, expect: "Looks it up and answers briefly.", history: [] }],
      framework: "lyzr",
      origin: "generated",
    };
  }
  agent.cost.creditsPerRun = estimateRunCredits(agent);
  bp.agents.push(agent);
  try {
    await save(projectId, bp, `Added ${agent.name}`, `${agent.role}. ${agent.tools.length} tools · ${agent.tools.filter((t) => t.permission === "ask").length} ask first.`, agent.id, credits);
    return { ok: true, agentId: agent.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not add the agent" };
  }
}

export async function addAgentFromSource(projectId: string, input: { kind: "code" | "endpoint"; location: string; framework?: Framework; protocol?: "mcp" | "http" | "a2a"; name?: string }): Promise<R> {
  await requireUser();
  const supa = await createClient();
  const project = await getProject(supa, projectId);
  if (!project) return { ok: false, error: "Project not found" };
  const bp = structuredClone(project.blueprint);
  if (bp.agents.length >= 6) return { ok: false, error: "Six agents is the limit for one project" };
  const loc = input.location.trim().slice(0, 300);
  const invalid = agentLocationError(input.kind, loc);
  if (invalid) return { ok: false, error: invalid };
  const name = input.name?.trim().slice(0, 40) || agentNameFromLocation(loc);
  const id = uniqueId(bp, kebab(name));
  let connId = bp.connections.find((c) => c.name === `${name} endpoint`)?.id;
  if (!connId && bp.connections.length < 8) {
    connId = `${id}-endpoint`;
    bp.connections.push({ id: connId, name: `${name} ${input.kind === "code" ? "runtime" : "endpoint"}`, kind: input.protocol === "mcp" ? "mcp" : "http", auth: "api_key", status: "configured", plain: input.kind === "code" ? `Runs the imported agent from ${loc}.` : `Calls the agent at ${loc}.` });
  }
  const agent: Agent = {
    id,
    name,
    role: input.kind === "code" ? (input.framework ? `Imported from ${FRAMEWORK_LABEL[input.framework]}` : "Imported from your code") : `Remote agent (${(input.protocol ?? "http").toUpperCase()})`,
    avatarHue: hash(id) % 360,
    plain: input.kind === "code"
      ? `An agent you already had, brought in from ${loc}. Prod AI runs it as-is and wraps every tool call with the permissions below.`
      : `An agent that lives somewhere else, reached at ${loc}. Prod AI treats it like a colleague on another team: every request it makes goes through the permissions below.`,
    jobDescription: `Imported agent. Its instructions live in its own ${input.kind === "code" ? "code" : "service"}; Prod AI adds these rules on top.`,
    rules: ["Every call that changes data is logged.", "Anything irreversible waits for a person."],
    tools: [{ id: "invoke", name: "Run the agent", description: "Send it a task and get its answer.", connectionId: connId ?? bp.connections[0].id, access: "write", permission: "log" }],
    supervision: "spot_check",
    knowledge: [],
    memory: { scope: "session", retentionDays: 30 },
    cost: { creditsPerRun: 1, model: input.kind === "code" ? "bring-your-own" : "remote" },
    triggers: ["chat", "manual"],
    rehearsals: [{ id: "r-smoke", name: "Smoke test", input: "A simple, typical request.", expect: "Answers within 10 seconds without calling irreversible tools.", history: [] }],
    framework: input.framework ?? "lyzr",
    origin: input.kind === "code" ? "imported" : "endpoint",
  };
  bp.agents.push(agent);
  try {
    await save(projectId, bp, `${input.kind === "code" ? "Imported" : "Connected"} ${agent.name}`, input.kind === "code" ? `From ${loc}. Runs unchanged; Prod AI adds permissions, rehearsals and replay.` : `At ${loc}. Every call goes through Prod AI's permissions.`, agent.id);
    return { ok: true, agentId: agent.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not add the agent" };
  }
}
