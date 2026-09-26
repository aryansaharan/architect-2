import { tool, type ToolSet } from "ai";
import { STYLE_RULE } from "@/lib/text";
import { z } from "zod";
import type { Agent, AgentTool, Blueprint } from "@/lib/blueprint/schema";
import { shortId } from "@/lib/sim/hash";

/** Sandboxed tool results built from the blueprint's sample data. Nothing leaves the building. */
export function stubResult(bp: Blueprint, agent: Agent, t: AgentTool, query: string): Record<string, unknown> {
  const conn = bp.connections.find((c) => c.id === t.connectionId);
  if (t.access === "read") {
    const q = query.toLowerCase().replace(/[$£€₹]/g, "").replace(/(\d),(\d{3})/g, "$1$2");
    const numbers = new Set((q.match(/\b\d+(?:\.\d+)?\b/g) ?? []).map(Number));
    const words = q.split(/[^a-z0-9-]+/).filter((w) => w.length > 2 && !/^\d+$/.test(w));
    const pool = bp.entities.flatMap((e) => e.sample.map((row) => ({ e, row })));
    const score = (row: Record<string, string | number | boolean>) => {
      let s = 0;
      for (const v of Object.values(row)) {
        if (typeof v === "number" && numbers.has(v)) s += 4;
        const str = String(v).toLowerCase();
        if (/^[a-z]+-\d+/i.test(str) && q.includes(str)) s += 6; // ids like CLM-20931
        for (const w of words) if (str === w) s += 2;
        else if (str.includes(w)) s += 1;
      }
      return s;
    };
    const scored = pool.map((x) => ({ ...x, score: score(x.row) })).sort((a, b) => b.score - a.score);
    const top = scored[0]?.score ?? 0;
    const hits = (top > 0 ? scored.filter((s) => s.score >= Math.max(1, top - 2)) : scored).slice(0, 3);
    return {
      source: conn?.name ?? t.connectionId,
      mode: conn?.status === "missing" ? "test data (no key yet)" : "sandbox",
      results: hits.map(({ e, row }) => ({ type: e.name, ...row })),
    };
  }
  if (t.access === "write") {
    return { ok: true, source: conn?.name ?? t.connectionId, changed: query, audit: `logged · ${agent.name} · ${t.name}` };
  }
  return {
    ok: true,
    source: conn?.name ?? t.connectionId,
    sandbox: true,
    reference: `SBX-${shortId(query + t.id, 6).toUpperCase()}`,
    note: "Sandbox: recorded, not sent. In the live version this action runs for real.",
  };
}

export function buildTools(bp: Blueprint, agent: Agent): ToolSet {
  const set: ToolSet = {};
  for (const t of agent.tools) {
    const conn = bp.connections.find((c) => c.id === t.connectionId);
    set[t.id] = tool({
      description: `${t.description} (${conn?.name ?? t.connectionId}; access: ${t.access}${t.permission === "ask" ? "; a person must approve each call" : ""})`,
      inputSchema: z.object({ query: z.string().describe("What to look up, change or send. Be specific (ids, names, amounts).") }),
      execute: async ({ query }) => stubResult(bp, agent, t, query),
    });
  }
  return set;
}

export type ApprovalMode = "user-approval" | "approved" | "not-applicable";

/** Blueprint permission → AI SDK approval. "ask" (or anything irreversible) always needs a person. */
export function approvalFor(t: AgentTool): ApprovalMode {
  if (t.permission === "ask" || t.access === "irreversible") return "user-approval";
  if (t.permission === "log") return "approved";
  return "not-applicable";
}

export function agentInstructions(bp: Blueprint, agent: Agent): string {
  const others = bp.agents.filter((a) => a.id !== agent.id).map((a) => `${a.name} (${a.role})`);
  const ents = bp.entities.map((e) => `${e.plural}: ${e.fields.map((f) => f.name).join(", ")}`).join("\n");
  return `${agent.jobDescription}

${STYLE_RULE}

Rules you must follow:
${agent.rules.map((r) => `- ${r}`).join("\n")}

You work inside "${bp.meta.name}" (${bp.meta.tagline}). Other agents on the team: ${others.join("; ") || "none"}.
Data you can reach through your tools:
${ents}

How to behave:
- Use your tools to look things up instead of guessing. Keep answers short and concrete: names, ids, amounts.
- Some tools need a person's approval. Call them when the task requires it. The person will be asked. If they deny it, acknowledge it and suggest a next step; never try another way around.
- This is a test version: tool results come from sandboxed sample data.`;
}
