import "server-only";
import { STYLE_RULE, cleanDeep } from "@/lib/text";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import type { Blueprint, ObjectRef } from "@/lib/blueprint/schema";
import { applyOps } from "@/lib/blueprint/apply";
import { estimateChange } from "@/lib/blueprint/estimate";
import { objectLabel, resolveRef } from "@/lib/blueprint";
import type { ChangeProposal } from "@/lib/db/types";
import { getModel } from "@/lib/llm/provider";
import { costOf } from "@/lib/llm/pricing";
import { ruleProposal } from "./rules";
import { EditsSchema, blueprintIndex, compileEdits } from "./edits";
import { generateFiles } from "@/lib/codegen/files";
import { diffFiles } from "@/lib/codegen/diff";

const EDIT_INSTRUCTIONS = `You change Architect 2.0 projects. A project is a Blueprint: data types (entities with fields and sample records), screens made of blocks, AI agents with tools and rules, and connections.
Given a request and a scope, return the smallest set of typed edits that fully does what was asked, inside the scope when one is given.
- New detail shown in a table: addFields (with realistic sampleValues) plus addColumns.
- "Ask before", "needs approval", "don't let it … without asking": permissions with permission "ask". "Just do it": "auto". "Tell me": "log". Name each tool, or use "*" or "irreversible".
- New page or view: newScreens (pick the entity it shows and, if useful, the agent people talk to there).
- Rules for how an agent behaves: rules. Test cases: rehearsals. Look and feel: theme (hex colours only).
- Use ids or exact visible names from the blueprint map. Never invent ids for existing objects.
- Use patches only when no typed edit fits.
- Set feasible=false only when it truly needs custom code or an outside system the blueprint cannot express; explain what a person would need to do.
${STYLE_RULE}`;

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
    const resolved = resolveRef(bp, scope);
    const scopeScreenId = scope?.type === "screen" ? scope.id : scope?.type === "block" ? bp.screens.find((x) => [...x.regions.main, ...x.regions.side].some((b) => b.id === scope.id))?.id : undefined;
    const base = `Scope: ${scopeLabel}\n${resolved ? `Scoped object JSON:\n${JSON.stringify(resolved.value)}\n` : ""}Request: ${request}\n\nBlueprint map:\n${blueprintIndex(bp)}\n\nFull blueprint JSON (for reference and patches):\n${JSON.stringify({ ...bp, estimate: undefined })}`;
    let inputTokens = 0;
    let outputTokens = 0;
    let feedback = "";
    // Up to two attempts: the second one sees exactly why the first failed.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await generateText({
          model: m.model,
          instructions: EDIT_INSTRUCTIONS,
          prompt: feedback ? `${base}\n\nYour previous edits could not be applied: ${feedback}\nFix them and return the complete set of edits again.` : base,
          output: Output.object({ schema: EditsSchema, name: "blueprint_edits" }),
          maxOutputTokens: 8000,
          timeout: 70_000,
          maxRetries: 1,
          // The edit schema is too large for strict grammar mode; a JSON tool call plus zod validation is enough.
          providerOptions: { anthropic: { effort: "low", structuredOutputMode: "jsonTool" } },
        });
        inputTokens += result.usage.inputTokens ?? 0;
        outputTokens += result.usage.outputTokens ?? 0;
        const usage = { model: m.id, inputTokens, outputTokens, ...costOf(m.id, inputTokens, outputTokens) };
        const out = cleanDeep(result.output);
        if (!out.feasible) {
          return { proposal: { summary: out.summary, rationale: out.rationale, operations: [], blastRadius: { screens: [], agents: [], files: 0 }, credits: 0, minutes: 0, mode: "live" }, usage };
        }
        const compiled = compileEdits(bp, out, scopeScreenId);
        if (!compiled.ops.length) {
          feedback = compiled.problems.join("; ") || "the edits changed nothing";
          continue;
        }
        const applied = applyOps(bp, compiled.ops);
        if (applied.ok) {
          const radius = blastRadius(bp, applied.blueprint);
          const est = estimateChange({ screens: radius.screens.length, agents: radius.agents.length, files: radius.files });
          const rationale = compiled.problems.length ? `${out.rationale} (Skipped: ${compiled.problems.join("; ")}.)` : out.rationale;
          return { proposal: { summary: out.summary, rationale, operations: compiled.ops, blastRadius: radius, credits: est.credits, minutes: est.minutes, mode: "live" }, usage };
        }
        feedback = [applied.error, ...compiled.problems].join("; ");
        console.warn("[change] edits failed validation, retrying:", feedback);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[change] model failed:", msg);
        // A schema mismatch is worth one more try with the error; anything else (outage, timeout) falls back.
        if (NoObjectGeneratedError.isInstance(e) && attempt === 0) {
          feedback = `your output did not match the schema (${msg.slice(0, 300)})`;
          continue;
        }
        break;
      }
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
