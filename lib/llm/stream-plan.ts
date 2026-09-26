import "server-only";
import { Output, streamText } from "ai";
import type { Blueprint } from "@/lib/blueprint/schema";
import { DraftSchema, PLANNER_INSTRUCTIONS, type Draft } from "./draft";
import { expandDraft } from "./expand";
import { getModel } from "./provider";
import { costOf } from "./pricing";
import { STYLE_RULE, cleanDeep } from "@/lib/text";

export type PlanEvent =
  | { t: "status"; mode: "live" | "offline"; model?: string }
  | { t: "partial"; draft: unknown }
  | { t: "note"; text: string }
  | { t: "done"; projectId: string; mode: "live" | "offline"; name: string }
  | { t: "error"; message: string };

export type PlanUsage = { model: string; inputTokens: number; outputTokens: number; costUsd: number; credits: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Plan with the model, streaming partial drafts to the client; fall back to a
 * starter blueprint (streamed the same way) if there's no model or it fails.
 */
export async function streamPlan(opts: {
  prompt: string;
  instructions?: string;
  userId: string;
  send: (e: PlanEvent) => void;
  fallback: () => Blueprint;
  failureNote: string;
  adjust?: (bp: Blueprint, draft: Draft | null) => Blueprint;
  allowModel?: boolean;
}): Promise<{ blueprint: Blueprint; mode: "live" | "offline"; usage: PlanUsage | null; vertical: string }> {
  const { send } = opts;
  const m = opts.allowModel === false ? null : getModel();
  if (opts.allowModel === false && getModel()) send({ t: "note", text: "Today's model budget for this account is used up, so this plan comes from the closest starter. It resets in 24 hours." });
  if (m) {
    send({ t: "status", mode: "live", model: m.id });
    try {
      const result = streamText({
        model: m.model,
        instructions: `${opts.instructions ?? PLANNER_INSTRUCTIONS}\n\n${STYLE_RULE}`,
        prompt: opts.prompt,
        output: Output.object({ schema: DraftSchema, name: "blueprint_draft" }),
        maxOutputTokens: 12000,
        timeout: 105_000,
        maxRetries: 0,
        providerOptions: { anthropic: { effort: "low", structuredOutputMode: "outputFormat", metadata: { userId: opts.userId } } },
      });
      let last = 0;
      for await (const partial of result.partialOutputStream) {
        const now = Date.now();
        if (now - last > 350) {
          send({ t: "partial", draft: cleanDeep(partial) });
          last = now;
        }
      }
      const draft = cleanDeep(await result.output);
      send({ t: "partial", draft });
      let blueprint = expandDraft(draft, { modelId: m.id });
      if (opts.adjust) blueprint = opts.adjust(blueprint, draft);
      const u = await result.usage;
      const inputTokens = u.inputTokens ?? 0;
      const outputTokens = u.outputTokens ?? 0;
      return { blueprint, mode: "live", usage: { model: m.id, inputTokens, outputTokens, ...costOf(m.id, inputTokens, outputTokens) }, vertical: draft.vertical };
    } catch (e) {
      console.error("[plan] model failed, using starter:", e instanceof Error ? e.message : e);
      send({ t: "note", text: opts.failureNote });
    }
  } else {
    send({ t: "status", mode: "offline" });
  }

  let blueprint = opts.fallback();
  if (opts.adjust) blueprint = opts.adjust(blueprint, null);
  const bp = blueprint;
  const steps = [
    { name: bp.meta.name, tagline: bp.meta.tagline },
    { entities: bp.entities.map((e) => ({ name: e.name, plural: e.plural })) },
    { connections: bp.connections.map((c) => ({ name: c.name, kind: c.kind })) },
    { agents: bp.agents.map((a) => ({ name: a.name, role: a.role, tools: a.tools.map((t) => ({ name: t.name, access: t.access })) })) },
    { screens: bp.screens.map((s) => ({ title: s.title })) },
  ];
  let acc: Record<string, unknown> = {};
  for (const s of steps) {
    acc = { ...acc, ...s };
    send({ t: "partial", draft: acc });
    await sleep(550);
  }
  return { blueprint, mode: "offline", usage: null, vertical: bp.meta.vertical };
}
