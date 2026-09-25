import type { UIMessage, UIMessageStreamWriter } from "ai";
import type { Agent, Blueprint } from "@/lib/blueprint/schema";
import { stubResult } from "./tools";
import { shortId } from "@/lib/sim/hash";

type ToolPartLike = { type: string; toolCallId?: string; state?: string; input?: { query?: string }; approval?: { id: string; approved?: boolean } };

function lastUserText(messages: UIMessage[]): string {
  const m = [...messages].reverse().find((x) => x.role === "user");
  return (m?.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();
}

/** Pending approval response in the last assistant message (after the person clicked). */
function respondedApproval(messages: UIMessage[]): { toolId: string; toolCallId: string; approved: boolean; query: string } | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return null;
  for (const p of last.parts as ToolPartLike[]) {
    if (p.type.startsWith("tool-") && p.state === "approval-responded" && p.toolCallId) {
      return { toolId: p.type.slice(5), toolCallId: p.toolCallId, approved: Boolean(p.approval?.approved), query: p.input?.query ?? "" };
    }
  }
  return null;
}

async function text(writer: UIMessageStreamWriter, id: string, s: string) {
  writer.write({ type: "text-start", id });
  for (const chunk of s.match(/.{1,18}(\s|$)|.+/g) ?? [s]) {
    writer.write({ type: "text-delta", id, delta: chunk });
    await new Promise((r) => setTimeout(r, 18));
  }
  writer.write({ type: "text-end", id });
}

/**
 * Deterministic agent run used when no model is configured (or it fails).
 * It still exercises the real approval protocol: read → propose irreversible
 * action → wait for the person → execute or stand down.
 */
export async function scriptedRun(writer: UIMessageStreamWriter, bp: Blueprint, agent: Agent, messages: UIMessage[]) {
  const seed = shortId(JSON.stringify(messages.length) + agent.id, 8);
  const responded = respondedApproval(messages);
  writer.write({ type: "start-step" });
  if (responded) {
    const t = agent.tools.find((x) => x.id === responded.toolId);
    if (responded.approved && t) {
      writer.write({ type: "tool-output-available", toolCallId: responded.toolCallId, output: stubResult(bp, agent, t, responded.query) });
      await text(writer, `t-${seed}`, `Done — ${t.name.toLowerCase()} went through (sandbox reference recorded above). I've logged it so the team can see who approved what.`);
    } else {
      writer.write({ type: "tool-output-denied", toolCallId: responded.toolCallId });
      await text(writer, `t-${seed}`, `Understood — I won't do that. I've left it for a person to handle and noted why in the activity log.`);
    }
    writer.write({ type: "finish-step" });
    return;
  }

  const ask = lastUserText(messages) || agent.rehearsals[0]?.input || "Help with the latest item.";
  const read = agent.tools.find((t) => t.access === "read");
  const act = agent.tools.find((t) => t.access === "irreversible") ?? agent.tools.find((t) => t.access === "write");
  await text(writer, `a-${seed}`, `On it. Let me check first.`);
  if (read) {
    const id = `call_${seed}_r`;
    writer.write({ type: "tool-input-available", toolCallId: id, toolName: read.id, input: { query: ask.slice(0, 120) } });
    await new Promise((r) => setTimeout(r, 450));
    writer.write({ type: "tool-output-available", toolCallId: id, output: stubResult(bp, agent, read, ask) });
  }
  if (act) {
    await text(writer, `b-${seed}`, `I found what I need. The next step is to ${act.name.toLowerCase()}${act.access === "irreversible" ? " — that can't be undone, so I need your OK." : "."}`);
    const id = `call_${seed}_a`;
    writer.write({ type: "tool-input-available", toolCallId: id, toolName: act.id, input: { query: ask.slice(0, 140) } });
    if (act.permission === "ask" || act.access === "irreversible") {
      writer.write({ type: "tool-approval-request", approvalId: `appr_${seed}`, toolCallId: id });
    } else {
      await new Promise((r) => setTimeout(r, 400));
      writer.write({ type: "tool-output-available", toolCallId: id, output: stubResult(bp, agent, act, ask) });
      await text(writer, `c-${seed}`, `Done, and it's in the log. Anything else?`);
    }
  } else {
    await text(writer, `b-${seed}`, `Here's what I found. Nothing needs changing right now.`);
  }
  writer.write({ type: "finish-step" });
}
