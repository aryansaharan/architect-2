import { writeFileSync } from "node:fs";
import { analyzeRepo } from "../lib/import/analyze";
const repos = ["langchain-ai/langgraph-example", "openai/openai-cs-agents-demo", "crewAIInc/crewAI-examples", "vercel/chatbot"];
(async () => {
  const out: Record<string, unknown> = {};
  for (const r of repos) {
    const res = await analyzeRepo(r);
    if (!res.ok) { console.log("FAIL", r, res.error); continue; }
    out[r.toLowerCase()] = res.report;
    const rep = res.report;
    console.log(`✓ ${r}: ${rep.fileCount} files · frameworks: ${rep.frameworks.map((f) => `${f.label} (${f.evidence})`).join("; ") || "none"} · stack: ${rep.stack.map((s) => s.label).join(", ")} · tests: ${rep.tests.join(", ")}`);
    console.log("   conventions:", rep.conventions.join(" | "));
    console.log("   understood:", rep.coverage.understood.join(" | "));
    console.log("   unsure:", rep.coverage.unsure.join(" | "), " ignored:", rep.coverage.ignored.join(" | "));
  }
  writeFileSync("lib/import/cached.json", JSON.stringify(out, null, 1));
})();
