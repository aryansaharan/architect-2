import { BlueprintSchema } from "../lib/blueprint/schema";
import { integrityErrors } from "../lib/blueprint/validate";
import { estimate } from "../lib/blueprint/estimate";
import * as claims from "../lib/blueprint/fixtures/claims";

const mods: Record<string, Record<string, unknown>> = { claims };
for (const name of ["support", "sales", "hr"]) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mods[name] = require(`../lib/blueprint/fixtures/${name}`);
  } catch {
    console.log(`- ${name}: not present yet`);
  }
}
let failed = false;
for (const [name, mod] of Object.entries(mods)) {
  const fixture = mod[`${name}Fixture`];
  const brief = mod[`${name}Brief`];
  const parsed = BlueprintSchema.safeParse(fixture);
  if (!parsed.success) {
    failed = true;
    console.log(`✗ ${name}: schema`, JSON.stringify(parsed.error.issues.slice(0, 8), null, 1));
    continue;
  }
  const errs = integrityErrors(parsed.data);
  if (errs.length) { failed = true; console.log(`✗ ${name}: integrity\n  ` + errs.join("\n  ")); continue; }
  const est = estimate(parsed.data);
  console.log(`✓ ${name}: ${parsed.data.screens.length} screens, ${parsed.data.agents.length} agents, ${parsed.data.entities.length} entities, ${parsed.data.connections.length} connections · ${est.credits} credits · brief ${typeof brief === "string" ? "ok" : "MISSING"}`);
}
process.exit(failed ? 1 : 0);
