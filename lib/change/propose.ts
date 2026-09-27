import "server-only";
import { STYLE_RULE, cleanDeep } from "@/lib/text";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import type { Blueprint, ObjectRef } from "@/lib/blueprint/schema";
import { applyOps } from "@/lib/blueprint/apply";
import { estimateChange } from "@/lib/blueprint/estimate";
import { objectLabel, resolveRef } from "@/lib/blueprint";
import type { ChangeOperation, ChangeProposal } from "@/lib/db/types";
import { getModel } from "@/lib/llm/provider";
import { costOf } from "@/lib/llm/pricing";
import { ruleProposal } from "./rules";
import { EditsSchema, blueprintIndex, draftEdits, partialRationale, salvageEdits, type Draft, type Edits } from "./edits";
import { generateFiles } from "@/lib/codegen/files";
import { diffFiles } from "@/lib/codegen/diff";

const EDIT_INSTRUCTIONS = `You change Prod AI projects. A project is a Blueprint: data types (entities with fields and sample records), screens made of blocks, AI agents with tools and rules, and connections.
Given a request and a scope, return the smallest set of typed edits that fully does what was asked, inside the scope when one is given.
- New detail shown in a table: addFields (with realistic sampleValues) plus addColumns.
- Column order ("as the second column", "first", "after Status"): addColumns with position, counting from 1 on the left, from the table's current columns in the map. Never use patches for column order.
- "Ask before", "needs approval", "don't let it … without asking": permissions with permission "ask". "Just do it": "auto". "Tell me": "log". Name each tool, or use "*" or "irreversible".
- New page or view: newScreens (pick the entity it shows and, if useful, the agent people talk to there).
- Rules for how an agent behaves: rules. Test cases: rehearsals. Look and feel: theme (hex colours only).
- Use ids or exact visible names from the blueprint map. Never invent ids for existing objects.
- Use patches only when no typed edit fits.
- If the message is a question about the project (not a change), set isQuestion=true and feasible=false, answer it in rationale in one or two plain sentences, and suggest one change they could ask for. Put that suggestion in summary, phrased as a request.
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

/** Price exactly what will be applied: the blast radius of these operations, nothing the model only intended. */
function quoteFor(bp: Blueprint, summary: string, rationale: string, draft: { ops: ChangeOperation[]; blueprint: Blueprint }): ChangeProposal {
  const radius = blastRadius(bp, draft.blueprint);
  const est = estimateChange({ screens: radius.screens.length, agents: radius.agents.length, files: radius.files });
  return { summary: plainSummary(summary), rationale, operations: draft.ops, blastRadius: radius, credits: est.credits, minutes: est.minutes, mode: "live" };
}

/** Model text is shown to people as written, so internals (JSON paths, patch errors) never get through. */
const INTERNALS = /\/(?:screens|agents|entities|connections|meta)\/|path not found|json pointer|bad index|\(skipped:/i;
const WHOLE_FALLBACK = "Here's the change, priced on exactly what it touches.";
const plainText = (text: string, fallback: string) => (text.trim() && !INTERNALS.test(text) ? text : fallback);
const plainSummary = (text: string) => text.replace(/\s*\(?\/(?:screens|agents|entities|connections|meta)\/[^\s)]*\)?/gi, "").trim() || "Change the project";

export async function proposeChange(bp: Blueprint, request: string, scope: ObjectRef | null, opts: { allowModel?: boolean } = {}): Promise<ProposeResult> {
  const m = opts.allowModel === false ? null : getModel();
  const scopeLabel = scope ? `${scope.type} "${objectLabel(bp, scope)}" (id ${scope.id})` : "the whole project";
  if (m) {
    const resolved = resolveRef(bp, scope);
    const scopeScreenId = scope?.type === "screen" ? scope.id : scope?.type === "block" ? bp.screens.find((x) => [...x.regions.main, ...x.regions.side].some((b) => b.id === scope.id))?.id : undefined;
    // The compact map is enough for typed edits and keeps a quote cheap; the full JSON only rides along on a retry.
    const base = `Scope: ${scopeLabel}\n${resolved ? `Scoped object JSON:\n${JSON.stringify(resolved.value)}\n` : ""}Request: ${request}\n\nBlueprint map:\n${blueprintIndex(bp)}`;
    const full = `\n\nFull blueprint JSON (for reference and patches):\n${JSON.stringify({ ...bp, estimate: undefined })}`;
    const quote = (summary: string, rationale: string, draft: { ops: ChangeOperation[]; blueprint: Blueprint }) => quoteFor(bp, summary, rationale, draft);
    let inputTokens = 0;
    let outputTokens = 0;
    let feedback = "";
    type Usage = NonNullable<ProposeResult["usage"]>;
    const usageSoFar = (): Usage => ({ model: m.id, inputTokens, outputTokens, ...costOf(m.id, inputTokens, outputTokens) });
    // An attempt where only part of the edits applied. Never quoted as if it were whole: it is kept
    // only as a fallback in case the retry can't do the whole thing either.
    const best: { partial: { out: Edits; draft: Extract<Draft, { kind: "partial" }> } | null } = { partial: null };
    const judge = (out: Edits): ProposeResult | null => {
      if (!out.feasible || out.isQuestion) {
        // A retry that gives up shouldn't throw away a first attempt that mostly worked.
        if (best.partial) return null;
        return { proposal: { summary: plainSummary(out.summary), rationale: plainText(out.rationale, "I can't do this one with the building blocks this app has."), operations: [], blastRadius: { screens: [], agents: [], files: 0 }, credits: 0, minutes: 0, mode: "live", ...(out.isQuestion ? { answer: true } : {}) }, usage: usageSoFar() };
      }
      const draft = draftEdits(bp, out, scopeScreenId);
      if (draft.kind === "whole") return { proposal: quote(out.summary, plainText(out.rationale, WHOLE_FALLBACK), draft), usage: usageSoFar() };
      if (draft.kind === "partial") {
        if (!best.partial || draft.problems.length <= best.partial.draft.problems.length) best.partial = { out, draft };
        feedback = `only part of them applied, and a change must apply whole. What failed: ${draft.problems.join("; ")}`;
      } else {
        feedback = draft.feedback;
      }
      console.warn("[change] edits did not fully apply, retrying:", feedback);
      return null;
    };
    // Up to two attempts: the second one sees exactly why the first failed or fell short.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await generateText({
          model: m.model,
          instructions: EDIT_INSTRUCTIONS,
          prompt: feedback ? `${base}${full}\n\nYour previous edits could not be applied as asked: ${feedback}\nReturn the complete set of edits again (everything the request needs, not only the fix), using typed edits wherever one fits.` : base,
          output: Output.object({ schema: EditsSchema, name: "blueprint_edits" }),
          maxOutputTokens: 8000,
          timeout: 70_000,
          maxRetries: 1,
          // The edit schema is too large for strict grammar mode; a JSON tool call plus zod validation is enough.
          providerOptions: { anthropic: { effort: "low", structuredOutputMode: "jsonTool" } },
        });
        inputTokens += result.usage.inputTokens ?? 0;
        outputTokens += result.usage.outputTokens ?? 0;
        const done = judge(cleanDeep(result.output));
        if (done) return done;
        continue;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Near-miss JSON: repair it locally instead of failing the request.
        if (NoObjectGeneratedError.isInstance(e) && e.text) {
          let raw: unknown = null;
          try { raw = JSON.parse(e.text); } catch { raw = null; }
          const salvaged = salvageEdits(raw);
          if (e.usage) { inputTokens += e.usage.inputTokens ?? 0; outputTokens += e.usage.outputTokens ?? 0; }
          if (salvaged) {
            const done = judge(cleanDeep(salvaged));
            if (done) return done;
            continue;
          }
        }
        console.error("[change] model failed:", msg, NoObjectGeneratedError.isInstance(e) ? (e.text ?? "").slice(0, 400) : "");
        if (NoObjectGeneratedError.isInstance(e) && attempt === 0) {
          feedback = `your output did not match the schema (${msg.slice(0, 300)})`;
          continue;
        }
        break;
      }
    }
    // Still partial after the retry: quote only what applies (and price only that), and say plainly what was left out.
    const partial = best.partial;
    if (partial) return { proposal: quote(partial.out.summary, partialRationale(partial.draft.notes), partial.draft), usage: usageSoFar() };
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
