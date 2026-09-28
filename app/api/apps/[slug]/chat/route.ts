import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, type UIMessage, type UIMessageStreamWriter } from "ai";
import { getSessionUser } from "@/lib/auth";
import { isTeam, loadSite, roleFor, type AppRole, type LiveSite } from "@/lib/apps/access";
import { liveView } from "@/lib/apps/live";
import { getRecord } from "@/lib/apps/records";
import { publicAccess } from "@/lib/apps/view";
import { buildHelperTools, findChatBlock, helperApprovals, helperInstructions, helperReach, type HelperCtx } from "@/lib/apps/helper-tools";
import { scriptBlueprint } from "@/lib/apps/helper-shared";
import { usageSummary } from "@/lib/db/queries";
import { logUsage } from "@/lib/db/writes";
import { holdModelBudgetAs } from "@/lib/llm/guard";
import { costOf } from "@/lib/llm/pricing";
import { getModel } from "@/lib/llm/provider";
import { visitorKey } from "@/lib/security/rate-limit";
import { demoReply, type DemoChatContext } from "@/lib/sim/demo-chat";
import { adminClient } from "@/lib/supabase/admin";
import type { Screen } from "@/lib/blueprint/schema";
import type { ToolCallRecord } from "@/lib/db/types";

/**
 * An AI helper inside a published app (/live/<slug>), working on the app's real records.
 * The team (owner and invited people) can talk to any of the app's helpers; a visitor only to a
 * helper on a public page, and only when the owner switched public helpers on. The owner pays:
 * the model budget and the project's spending cap are the owner's, the rate limit follows whoever
 * is typing. Without a model or budget the helper answers from a script over the same records.
 */
export const maxDuration = 90;
export const dynamic = "force-dynamic";

/** Output tokens per model step (a turn is at most 4 steps). */
const MAX_STEP_OUTPUT = 1200;

const approvalSecret = () => process.env.SIGNING_SECRET || process.env.SUPABASE_SECRET_KEY || undefined;

/** What one chat request may carry: a conversation short enough to be cheap, in the shape the SDK sends. */
const LIMITS = { messages: 40, parts: 40, textChars: 4000, totalChars: 24000, bytes: 200_000 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9_-]{1,80}$/;

type Body = { messages: UIMessage[]; agentId: string; blockId: string; runId?: string; recordId?: string };

function readBody(raw: unknown): Body | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.agentId !== "string" || !ID.test(b.agentId) || typeof b.blockId !== "string" || !ID.test(b.blockId)) return null;
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > LIMITS.messages) return null;
  if (JSON.stringify(b.messages).length > LIMITS.bytes) return null;
  let total = 0;
  for (const m of b.messages as { role?: unknown; parts?: unknown }[]) {
    // Only the two sides of the conversation: nobody sends their own system prompt.
    if (!m || (m.role !== "user" && m.role !== "assistant")) return null;
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
  return {
    messages: b.messages as UIMessage[],
    agentId: b.agentId,
    blockId: b.blockId,
    runId: typeof b.runId === "string" && UUID.test(b.runId) ? b.runId : undefined,
    recordId: typeof b.recordId === "string" && UUID.test(b.recordId) ? b.recordId : undefined,
  };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** The team talks to any helper; a visitor only to one on a public page, when the owner allows it. */
function mayChat(site: LiveSite, role: AppRole, screen: Screen): boolean {
  if (isTeam(role)) return true;
  if (site.settings.app?.publicHelpers !== true) return false;
  return publicAccess(site.blueprint, site.settings.app?.hiddenEntities).screens.includes(screen.id);
}

/** The owner pays; a guest owner has no model budget. Unknown owners count as guests (nothing is spent). */
async function ownerOf(site: LiveSite): Promise<{ isGuest: boolean; email: string | null }> {
  const { data, error } = await adminClient().auth.admin.getUserById(site.ownerId);
  if (error || !data?.user) return { isGuest: true, email: null };
  const guest = Boolean(data.user.is_anonymous);
  return { isGuest: guest, email: guest ? null : (data.user.email ?? null) };
}

/** A short assistant reply written straight into the stream (asking too fast). */
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

async function say(writer: UIMessageStreamWriter, id: string, s: string) {
  writer.write({ type: "text-start", id });
  // [^] is any character, newlines included, so the answer's paragraphs survive the chunking.
  for (const chunk of s.match(/[^]{1,18}(\s|$)|\s*\S+\s?/g) ?? [s]) {
    writer.write({ type: "text-delta", id, delta: chunk });
    await new Promise((r) => setTimeout(r, 12));
  }
  writer.write({ type: "text-end", id });
}

type AnyPart = { type: string; text?: string; toolCallId?: string; state?: string; input?: unknown; output?: unknown; approval?: { approved?: boolean; isAutomatic?: boolean } };

const lastUserText = (messages: UIMessage[]) =>
  ([...messages].reverse().find((m) => m.role === "user")?.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();

/** A tool call the person just answered (the scripted helper can't carry it out, so it says so). */
function answeredApproval(messages: UIMessage[]): string | null {
  const last = messages[messages.length - 1];
  if (last?.role !== "assistant") return null;
  const p = (last.parts as AnyPart[]).find((x) => x.type.startsWith("tool-") && x.state === "approval-responded" && x.toolCallId);
  return p?.toolCallId ?? null;
}

/** Tool outputs are kept for the audit trail, capped so one run can't outgrow its row. */
const capped = (v: unknown) => {
  const s = JSON.stringify(v ?? null);
  return s.length > 4000 ? { truncated: s.slice(0, 4000) } : v;
};

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
        input: capped(p.input),
        output: capped(p.output),
        state: p.state === "output-denied" ? "denied" : p.state === "output-error" ? "error" : "done",
        approval: p.approval ? (p.approval.approved === false ? "denied" : p.approval.isAutomatic ? "logged" : "approved") : access[toolId] === "write" ? "logged" : "auto",
      });
    }
  }
  return { transcript: transcript.slice(-60), toolCalls: toolCalls.slice(-60) };
}

/** GET ?agentId&blockId: may this person talk to this helper? (The server decides again on every message.) */
export async function GET(req: Request, ctx: RouteContext<"/api/apps/[slug]/chat">) {
  const { slug } = await ctx.params;
  const site = await loadSite(slug);
  if (!site) return Response.json({ error: "Not found" }, { status: 404 });
  const url = new URL(req.url);
  const where = findChatBlock(site.blueprint, url.searchParams.get("agentId") ?? "", url.searchParams.get("blockId") ?? "");
  const role = await roleFor(site, await getSessionUser());
  return Response.json({ allowed: Boolean(where && mayChat(site, role, where.screen)), team: isTeam(role) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request, ctx: RouteContext<"/api/apps/[slug]/chat">) {
  const { slug } = await ctx.params;
  const tooLong = () => new Response("That conversation is too long. Start a new one.", { status: 413 });
  if (Number(req.headers.get("content-length") ?? 0) > LIMITS.bytes + 4000) return tooLong();
  const raw = await req.text().catch(() => "");
  if (raw.length > LIMITS.bytes + 4000) return tooLong();
  const body = readBody(parseJson(raw));
  if (!body) return new Response("That conversation is too long or malformed. Start a new one.", { status: 400 });

  const site = await loadSite(slug);
  if (!site) return new Response("Not found", { status: 404 });
  const agent = site.blueprint.agents.find((a) => a.id === body.agentId);
  const where = agent ? findChatBlock(site.blueprint, agent.id, body.blockId) : null;
  if (!agent || !where) return new Response("This AI helper isn't in the app", { status: 404 });
  const user = await getSessionUser();
  const role = await roleFor(site, user);
  if (!mayChat(site, role, where.screen)) return new Response(isTeam(role) ? "Not allowed" : "This AI helper is only for the app's team.", { status: 403 });

  const team = isTeam(role);
  const actorId = team && user ? user.id : null;
  const admin = adminClient();
  const owner = await ownerOf(site);

  // A run belongs to one person talking to one helper of this app; anything else starts a new run.
  let runId = body.runId ?? crypto.randomUUID();
  if (body.runId) {
    const { data: prior } = await admin.from("agent_runs").select("project_id, agent_id, surface, actor_id").eq("id", runId).maybeSingle();
    if (prior && (prior.project_id !== site.projectId || prior.agent_id !== agent.id || prior.surface !== "live" || (prior.actor_id ?? null) !== actorId)) runId = crypto.randomUUID();
  }

  const helper: HelperCtx = { site, agent, role, actorId, actorEmail: team && user && !user.isAnonymous ? user.email : null, ownerEmail: owner.email, runId };
  const access = Object.fromEntries(agent.tools.map((t) => [t.id, t.access])) as Record<string, ToolCallRecord["access"]>;

  const persist = async (messages: UIMessage[], tokens: { input: number; output: number; costUsd: number; mode: "live" | "scripted" }) => {
    const { transcript, toolCalls } = summarize(messages, access);
    const approvals = toolCalls.filter((t) => t.approval === "approved" || t.approval === "denied").map((t) => ({ toolId: t.toolId, decision: t.approval as "approved" | "denied", at: new Date().toISOString() }));
    const { data: existing } = await admin.from("agent_runs").select("input_tokens, output_tokens, cost_usd").eq("id", runId).maybeSingle();
    const { error } = await admin.from("agent_runs").upsert({
      id: runId,
      project_id: site.projectId,
      agent_id: agent.id,
      checkpoint_id: null,
      transcript,
      tool_calls: toolCalls,
      approvals,
      input_tokens: (existing?.input_tokens ?? 0) + tokens.input,
      output_tokens: (existing?.output_tokens ?? 0) + tokens.output,
      cost_usd: Number(existing?.cost_usd ?? 0) + tokens.costUsd,
      mode: tokens.mode,
      surface: "live",
      actor_id: actorId,
    });
    if (error) console.error("[helper] run save failed", error.message);
  };

  // The rate limit follows whoever is typing: a team member by account, a visitor by network (per app).
  const rateKey = actorId ? `user:${actorId}:live` : `${await visitorKey()}:live:${site.projectId}`;
  const hold = await holdModelBudgetAs({ payerId: site.ownerId, payerIsGuest: owner.isGuest, rateKey, op: "chat" });
  if (!hold.ok && hold.reason === "rate") return notice(body.messages, "rate", "That's a lot of messages in a few minutes. Give it a moment, then try again.", "rate");

  // The project's spending cap is the owner's too: past it, the helper answers from its script.
  let overCap = false;
  if (hold.ok) {
    const spent = await usageSummary(admin, { projectId: site.projectId }).catch(() => null);
    overCap = !spent || spent.credits >= site.settings.budgetCapCredits;
  }
  const m = hold.ok && !overCap ? getModel() : null;

  if (m && hold.ok) {
    // The record open on screen, when it's one this person may see through the helper.
    let open: { type: string; title: string; id?: string } | undefined;
    if (body.recordId) {
      const rec = await getRecord(site.projectId, body.recordId);
      const reach = rec && helperReach(helper).find((r) => r.entity.id === rec.entityId);
      const title = reach?.entity.fields[0]?.name;
      if (rec && reach && title && reach.fields.includes(title)) open = { type: reach.entity.name, title: String(rec.data[title] ?? "").slice(0, 120), ...(team ? { id: rec.id } : {}) };
    }
    const instructions = helperInstructions(helper, open);
    // Metered exactly once, however the run ends: finished, failed or abandoned. The provider bills every step.
    const done = { input: 0, output: 0 };
    let metered = false;
    const inFlight = { input: Math.ceil((instructions.length + JSON.stringify(body.messages).length) / 3.5), output: MAX_STEP_OUTPUT };
    const meter = async (input: number, output: number, failed: boolean) => {
      if (metered) return;
      metered = true;
      const { costUsd, credits } = costOf(m.id, input, output);
      // A failed run is not charged (0 credits); its real cost still counts toward the owner's daily model budget.
      await logUsage({ userId: site.ownerId, projectId: site.projectId, kind: "agent_run", provider: "anthropic", model: m.id, inputTokens: input, outputTokens: output, costUsd, credits: failed ? 0 : credits, meta: { agentId: agent.id, runId, surface: "live", actor: actorId ?? "visitor", ...(failed ? { failed: true } : {}) } });
      await hold.release();
    };
    try {
      const result = streamText({
        model: m.model,
        instructions,
        messages: await convertToModelMessages(body.messages),
        tools: buildHelperTools(helper),
        // The blueprint's permission per tool; anything that can't be undone always waits for a person.
        toolApproval: helperApprovals(helper),
        stopWhen: isStepCount(4),
        maxOutputTokens: MAX_STEP_OUTPUT,
        timeout: 80_000,
        maxRetries: 0,
        // Approval requests are signed here and checked when they come back, so a browser can't forge an "Allow".
        experimental_toolApprovalSecret: approvalSecret(),
        providerOptions: { anthropic: { effort: "low", metadata: { userId: actorId ?? rateKey.slice(0, 40) } } },
        onStepEnd: ({ usage }) => {
          done.input += usage.inputTokens ?? 0;
          done.output += usage.outputTokens ?? 0;
        },
        onFinish: async ({ totalUsage }) => meter(totalUsage.inputTokens ?? 0, totalUsage.outputTokens ?? 0, false),
        onError: async ({ error }) => {
          console.error("[helper] model run failed:", error instanceof Error ? error.message : error);
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
      console.error("[helper] model failed, scripted fallback:", e instanceof Error ? e.message : e);
      await hold.release();
    }
  } else if (hold.ok) await hold.release();

  // Scripted: today's answers (lib/sim/demo-chat.ts) over exactly the records this person can see.
  const view = await liveView(site, role);
  const rows = Object.fromEntries(Object.entries(view.records).map(([e, list]) => [e, list.map((r) => r.data)]));
  const bp = scriptBlueprint(view.bp, rows, team ? null : publicAccess(site.blueprint, site.settings.app?.hiddenEntities).read);
  const blocks = [...where.screen.regions.main, ...(where.screen.regions.side ?? [])];
  const detail = blocks.find((b) => b.type === "detail");
  const withEntity = detail ?? blocks.find((b) => "entityId" in b && Boolean(b.entityId));
  const entityId = withEntity && "entityId" in withEntity ? withEntity.entityId : undefined;
  const at = entityId && body.recordId ? (view.records[entityId] ?? []).findIndex((r) => r.id === body.recordId) : -1;
  const demo: DemoChatContext = { screenId: where.screen.id, entityId, selected: detail && at >= 0 ? at : undefined, live: true };
  const scriptAgent = bp.agents.find((a) => a.id === agent.id);
  const id = `s-${runId.slice(0, 8)}-${body.messages.length}`;

  const stream = createUIMessageStream({
    originalMessages: body.messages,
    execute: async ({ writer }) => {
      writer.write({ type: "start-step" });
      const answered = answeredApproval(body.messages);
      if (answered) {
        writer.write({ type: "tool-output-denied", toolCallId: answered });
        await say(writer, id, "I can't carry that out right now, so nothing happened. Try again in a little while.");
      } else {
        await say(writer, id, demoReply(bp, scriptAgent, lastUserText(body.messages) || "What can you do?", demo));
      }
      writer.write({ type: "finish-step" });
    },
    onEnd: async ({ messages }) => persist(messages, { input: 0, output: 0, costUsd: 0, mode: "scripted" }),
  });
  return createUIMessageStreamResponse({ stream, headers: { "x-prodai-mode": overCap ? "budget" : "scripted", "x-prodai-run": runId } });
}
