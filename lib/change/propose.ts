import "server-only";
import { STYLE_RULE, cleanDeep } from "@/lib/text";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { Blueprint, ObjectRef } from "@/lib/blueprint/schema";
import { applyOps } from "@/lib/blueprint/apply";
import { estimateChange } from "@/lib/blueprint/estimate";
import { objectLabel, resolveRef } from "@/lib/blueprint";
import type { ChangeOperation, ChangeProposal } from "@/lib/db/types";
import { getModel } from "@/lib/llm/provider";
import { costOf } from "@/lib/llm/pricing";
import { ruleProposal } from "./rules";
import { generateFiles } from "@/lib/codegen/files";
import { diffFiles } from "@/lib/codegen/diff";

const ProposalSchema = z.object({
  feasible: z.boolean().describe("false if the request needs custom code or an outside system the blueprint can't express"),
  summary: z.string().describe("Imperative, under 12 words, e.g. 'Add an SLA risk column to the intake table'"),
  rationale: z.string().describe("One plain-English sentence explaining the change and its effect"),
  operations: z
    .array(
      z.object({
        op: z.enum(["set", "add", "remove"]),
        path: z.string().describe("RFC 6901 JSON Pointer into the blueprint, e.g. /screens/0/regions/main/1/columns"),
        valueJson: z.string().describe("The new value encoded as JSON (use \"null\" for remove)"),
      }),
    )
    .describe("Minimal operations. Prefer 'set' on the smallest containing value. Keep all ids stable."),
});

export type ProposeResult = { proposal: ChangeProposal; usage?: { model: string; inputTokens: number; outputTokens: number; costUsd: number; credits: number } };

/** Key-order-independent JSON (Postgres jsonb reorders keys). */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

function blastRadius(before: Blueprint, after: Blueprint) {
  const changed = <T extends { id: string }>(a: T[], b: T[]) => b.filter((x) => stable(x) !== stable(a.find((y) => y.id === x.id))).map((x) => x.id);
  const screens = changed(before.screens, after.screens);
  const agents = changed(before.agents, after.agents);
  const files = diffFiles(generateFiles(before), generateFiles(after)).filter((d) => d.path !== "blueprint.json").length;
  return { screens, agents, files: Math.max(1, files) };
}

export async function proposeChange(bp: Blueprint, request: string, scope: ObjectRef | null, opts: { allowModel?: boolean } = {}): Promise<ProposeResult> {
  const m = opts.allowModel === false ? null : getModel();
  const scopeLabel = scope ? `${scope.type} "${objectLabel(bp, scope)}" (id ${scope.id})` : "the whole project";
  if (m) {
    try {
      const resolved = resolveRef(bp, scope);
      const result = await generateText({
        model: m.model,
        instructions:
          "You edit Architect 2.0 blueprints (JSON). Given a blueprint, a scope and a request, return the smallest set of JSON Pointer operations that implements the request inside the scope. Obey the blueprint's existing shapes exactly: block types kpis/table/list/detail/form/chat/timeline/text/actions; table columns must be field names of the table's entity (add the field to the entity first if needed, and add the value to its sample rows); tool permissions are auto/log/ask; supervision is autonomous/spot_check/approve_all. Never change ids. If the request needs something the blueprint can't express, set feasible=false and explain in rationale. " + STYLE_RULE,
        prompt: `Scope: ${scopeLabel}\n${resolved ? `Scoped object JSON:\n${JSON.stringify(resolved.value)}\n` : ""}Request: ${request}\n\nFull blueprint JSON:\n${JSON.stringify({ ...bp, estimate: undefined })}`,
        output: Output.object({ schema: ProposalSchema, name: "change_proposal" }),
        maxOutputTokens: 6000,
        timeout: 60_000,
        maxRetries: 1,
        providerOptions: { anthropic: { effort: "low", structuredOutputMode: "outputFormat" } },
      });
      const out = cleanDeep(result.output);
      const inputTokens = result.usage.inputTokens ?? 0;
      const outputTokens = result.usage.outputTokens ?? 0;
      const usage = { model: m.id, inputTokens, outputTokens, ...costOf(m.id, inputTokens, outputTokens) };
      if (out.feasible && out.operations.length) {
        const ops: ChangeOperation[] = out.operations.map((o) => ({ op: o.op, path: o.path, value: o.op === "remove" ? undefined : safeJson(o.valueJson) }));
        const applied = applyOps(bp, ops);
        if (applied.ok) {
          const radius = blastRadius(bp, applied.blueprint);
          const est = estimateChange({ screens: radius.screens.length, agents: radius.agents.length, files: radius.files });
          return { proposal: { summary: out.summary, rationale: out.rationale, operations: ops, blastRadius: radius, credits: est.credits, minutes: est.minutes, mode: "live" }, usage };
        }
        console.warn("[change] model ops failed validation:", applied.error);
      }
      if (!out.feasible) {
        return { proposal: { summary: out.summary, rationale: out.rationale, operations: [], blastRadius: { screens: [], agents: [], files: 0 }, credits: 0, minutes: 0, mode: "live" }, usage };
      }
    } catch (e) {
      console.error("[change] model failed, using rules:", e instanceof Error ? e.message : e);
    }
  }
  const rule = ruleProposal(bp, request, scope);
  if (rule.operations.length) {
    const applied = applyOps(bp, rule.operations);
    if (applied.ok) {
      const radius = blastRadius(bp, applied.blueprint);
      const est = estimateChange({ screens: radius.screens.length, agents: radius.agents.length, files: radius.files });
      return { proposal: { ...rule, blastRadius: radius, credits: est.credits, minutes: est.minutes, mode: "rules" } };
    }
  }
  return {
    proposal: {
      summary: "This one needs a person",
      rationale: `I can't make “${request.slice(0, 80)}” safely on my own${m ? "" : " in offline mode"}. Hand it to a teammate. They'll get the screen, your request and the latest changes.`,
      operations: [],
      blastRadius: { screens: [], agents: [], files: 0 },
      credits: 0,
      minutes: 0,
      mode: "rules",
    },
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
