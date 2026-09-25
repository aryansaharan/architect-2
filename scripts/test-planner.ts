import { planWithModel } from "../lib/llm/planner";
const prompt = process.argv[2] ?? "A returns desk for an online furniture store: read return requests, check the order and warranty, approve simple refunds, and email the customer.";
(async () => {
  const t = Date.now();
  const r = await planWithModel(`Brief: ${prompt}`);
  console.log("mode", r.mode, "ms", Date.now() - t);
  if (r.mode === "live") {
    const bp = r.blueprint;
    console.log(bp.meta.name, "|", bp.meta.tagline);
    console.log("screens", bp.screens.map((s) => `${s.title}[${s.layout}]`).join(", "));
    console.log("agents", bp.agents.map((a) => `${a.name}(${a.tools.map((t) => `${t.id}:${t.access}`).join(",")})`).join(" | "));
    console.log("entities", bp.entities.map((e) => `${e.plural}(${e.fields.length}f/${e.sample.length}r)`).join(", "));
    console.log("connections", bp.connections.map((c) => `${c.name}:${c.status}`).join(", "));
    console.log("usage", r.usage, "estimate", bp.estimate.credits);
  } else console.log(r.reason);
})();
