import "server-only";
import type { Supa } from "@/lib/supabase/server";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { starterBlueprint, STARTERS } from "@/lib/blueprint/fixtures";
import { applyOps, markBuilt } from "@/lib/blueprint/apply";
import { planRepair, repairLedgerTitle } from "@/lib/sim/repair";
import { toolsOffPreset } from "@/lib/blueprint/describe";
import { shortId } from "@/lib/sim/hash";
import { generateFiles } from "@/lib/codegen/files";
import { diffFiles, diffToText } from "@/lib/codegen/diff";
import { addCheckpoint, addLedger, createProject, logUsage, updateProject } from "@/lib/db/writes";
import { preflight } from "@/lib/sim/preflight";
import { rehearsalOutcome } from "@/lib/sim/rehearse";
import type { Blueprint } from "@/lib/blueprint/schema";
import { seedSampleRecords } from "@/lib/apps/records";

/** "1 AI helper", "2 AI helpers": counts in plain words. */
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Rehearsal history that matches the story the ledger tells: every rehearsal
 * ran during the build, Settlement's payout rehearsals failed before the
 * approval gate was added, and the re-run passed all of them.
 * Outcomes come from the same judge as Agents › Rehearsals (lib/sim/rehearse.ts).
 */
function withBuildRehearsals(planned: Blueprint, built: Blueprint, firstRun: string, reRun: string): Blueprint {
  const next = structuredClone(built);
  for (const agent of next.agents) {
    const before = planned.agents.find((a) => a.id === agent.id);
    for (const r of agent.rehearsals) {
      const first = before ? rehearsalOutcome(before, r) : { pass: true, note: "" };
      const after = rehearsalOutcome(agent, r);
      r.history = first.pass
        ? [{ at: firstRun, pass: after.pass, note: after.pass ? "Passed during build" : after.note }]
        : [
            { at: firstRun, pass: false, note: first.note },
            { at: reRun, pass: after.pass, note: after.pass ? "Passed after the approval gate was added" : after.note },
          ];
    }
  }
  return next;
}

/**
 * Seeds the hero demo: a Claims Triage Desk that has been planned, built
 * (with one repair), rehearsed, commented on, handed off and put live.
 * Everything is written through the guest's own session, so RLS is exercised, except the published site,
 * which only the server may write (like every publish).
 */
export async function seedDemoProject(supa: Supa, userId: string): Promise<string> {
  const t0 = Date.now() - 1000 * 60 * 95;
  const at = (min: number) => new Date(t0 + min * 60_000).toISOString();

  const planned = starterBlueprint("claims");
  const repair = planRepair(planned);
  const repaired = applyOps(planned, repair.options[0].ops);
  const built = withBuildRehearsals(planned, markBuilt(repaired.ok ? repaired.blueprint : planned), at(24), at(26));
  const rehearsed = built.agents.flatMap((a) => a.rehearsals);
  const passed = rehearsed.filter((r) => r.history[r.history.length - 1]?.pass).length;
  // Every agent's supervision must match its tool permissions after the build (e.g. Settlement: Spot-check, with
  // Read claim on Just do it, Post in Slack on Tell me, and only Issue payment, which can't be undone, on Ask first).
  const mismatched = built.agents.filter((a) => toolsOffPreset(a).length);
  if (mismatched.length) console.warn("[seed] supervision and tool permissions disagree for", mismatched.map((a) => a.id).join(", "));

  const project = await createProject(supa, {
    ownerId: userId,
    name: built.meta.name,
    vertical: "claims",
    brief: STARTERS.claims.brief,
    blueprint: built,
    isDemo: true,
    buildState: "built",
    settings: { budgetCapCredits: 500 },
  });

  // Same wording as a real plan (app/api/plan/route.ts) and a real build (lib/actions/build.ts completeBuild).
  const cp1 = await addCheckpoint(supa, project.id, { label: "Plan approved", kind: "blueprint", blueprint: planned, summary: `${count(planned.screens.length, "screen")} · ${count(planned.agents.length, "AI helper")} · ${count(planned.entities.length, "data type")} · ${count(planned.connections.length, "connection")}` });
  const cp2 = await addCheckpoint(supa, project.id, { label: "Build complete", kind: "build", blueprint: built, summary: `${count(built.screens.length, "screen")} · ${count(built.agents.length, "AI helper")} · ${passed} of ${count(rehearsed.length, "test run")} passed` });
  // The latest change a teammate is shown: the repair's real diff to the gated agent's spec.
  const gatedSpec = `agents/${repair.objectRef.id}/agent.yaml`;
  const lastDiff = diffToText(diffFiles(generateFiles(planned), generateFiles(built)).filter((f) => f.path === gatedSpec));

  const slug = `claims-desk-${shortId(project.id)}`;
  // Published sites are written only by the server. The project was just created through the guest's session, so they own it.
  if (hasAdmin()) {
    const { error } = await adminClient().from("live_sites").insert({ slug, project_id: project.id, checkpoint_id: cp2.id, blueprint: built });
    if (error) console.error("[seed] publishing the demo failed", error.message);
    // Like every newly published app, the example starts with its plan's sample records, marked as samples.
    else await seedSampleRecords(project.id, built);
  }
  await supa.from("deployments").insert({
    project_id: project.id,
    env: "live",
    target: "architect_cloud",
    checkpoint_id: cp2.id,
    status: "live",
    preflight: preflight(built, { budgetCapCredits: 500 }).map((c) => ({ id: c.id, label: c.label, pass: c.status !== "fail" })),
    url: `/live/${slug}`,
    created_at: at(88),
  });

  await addLedger(supa, project.id, [
    { lane: "thought", kind: "brief", title: "You described the project", body: STARTERS.claims.brief, createdAt: at(0) },
    { lane: "thought", kind: "work_order", title: `Plan ready · ${count(planned.screens.length, "screen")}, ${count(planned.agents.length, "AI helper")}`, body: "Started from the closest starter plan, free. Making it real is free too, and you pressed it.", checkpointId: cp1.id, credits: 0, createdAt: at(2) },
    // In the order a real build writes them: the repair when it is chosen mid-build (resolveRepair), then the build and its rehearsal run (completeBuild).
    { lane: "checked", kind: "repair", blame: "system_fix", title: repairLedgerTitle(repair), body: repair.options[0].narration, objectRef: repair.objectRef, credits: 0, meta: { planId: repair.id, optionId: "a", changelog: repair.options[0].changelog }, createdAt: at(25) },
    { lane: "did", kind: "build_step", title: `Built ${count(built.screens.length, "screen")} and ${count(built.agents.length, "AI helper")}`, body: built.screens.map((s) => s.title).join(", ") + ".", credits: 0, checkpointId: cp2.id, createdAt: at(26) },
    { lane: "checked", kind: "rehearsal", title: `Test runs: ${passed} of ${rehearsed.length} passed`, ...(passed < rehearsed.length ? { body: "Open AI helpers › Tests & reliability to see what failed and fix it." } : {}), credits: 0, checkpointId: cp2.id, createdAt: at(27) },
    { lane: "did", kind: "ship", title: "Published on Prod Cloud", body: `Anyone with the link can open /live/${slug}. Payouts stay in test mode.`, checkpointId: cp2.id, createdAt: at(88) },
    { lane: "did", kind: "agent_run", blame: "agent", title: "Intake Triage asked before emailing Dana Whitfield", body: "You allowed it once. The email was sent from claims@harbormutual.com.", objectRef: { type: "agent", id: "intake-triage" }, credits: 0, createdAt: at(90) },
    { lane: "thought", kind: "comment", blame: "teammate", title: "Maya commented on Intake Queue", body: "“Can we sort this by SLA risk instead of date?”", objectRef: { type: "screen", id: "intake-queue" }, createdAt: at(91) },
    { lane: "thought", kind: "handoff", title: "You asked Priya to connect the policy system", body: "“I don't have the Guidewire key. Can you wire up the sandbox?”", objectRef: { type: "connection", id: "policy-system" }, createdAt: at(93) },
  ]);

  await supa.from("comments").insert({
    project_id: project.id,
    screen_id: "intake-queue",
    block_id: "intake-table",
    x: 62,
    y: 38,
    body: "Can we sort this by SLA risk instead of date?",
    author_name: "Maya Singh · Claims lead",
    created_at: at(91),
  });

  await supa.from("handoffs").insert({
    project_id: project.id,
    object_ref: { type: "connection", id: "policy-system" },
    prompt: "I don't have the Guidewire key. Can you wire up the sandbox so Intake Triage can confirm coverage?",
    context: {
      objectLabel: "Policy system (Guidewire)",
      promptHistory: [STARTERS.claims.brief, "Make sure payouts always wait for a person."],
      lastDiff,
    },
    assignee: "Priya Raman · Platform engineer",
    status: "open",
    created_at: at(93),
  });

  await supa.from("agent_runs").insert({
    project_id: project.id,
    agent_id: "intake-triage",
    checkpoint_id: cp2.id,
    mode: "scripted",
    transcript: [
      { role: "user", text: "A new claim just came in from Dana Whitfield. Triage it." },
      { role: "assistant", text: "CLM-20931 is an Auto claim on an active policy (HM-A-44102). Low fraud risk. I routed it to Michael Okafor (14 open cases). I'd like to send Dana a confirmation email. Waiting for your approval." },
      { role: "assistant", text: "Email sent. Summary for the adjuster: “Low-speed rear-end collision, bumper and tail-light damage, police report attached.”" },
    ],
    tool_calls: [
      { toolCallId: "tc1", toolId: "read_claim", access: "read", input: { query: "CLM-20931" }, output: { claim_no: "CLM-20931", amount: 4200 }, state: "done", approval: "auto" },
      { toolCallId: "tc2", toolId: "lookup_policy", access: "read", input: { query: "HM-A-44102" }, output: { status: "Active", coverage: 50000 }, state: "done", approval: "auto" },
      { toolCallId: "tc3", toolId: "route_claim", access: "write", input: { query: "CLM-20931 → Michael Okafor" }, output: { ok: true }, state: "done", approval: "logged" },
      { toolCallId: "tc4", toolId: "email_policyholder", access: "irreversible", input: { query: "Confirmation to dana.whitfield@example.com" }, output: { sent: true }, state: "done", approval: "approved" },
    ],
    approvals: [{ toolId: "email_policyholder", decision: "approved", at: at(90) }],
    input_tokens: 2140,
    output_tokens: 610,
    cost_usd: 0.02595,
    created_at: at(90),
  });

  // The example is free: making it real costs nothing and its one conversation was scripted, so neither uses the person's monthly credits.
  await logUsage({ userId, projectId: project.id, kind: "agent_run", provider: "anthropic", model: "claude-opus-5", inputTokens: 2140, outputTokens: 610, costUsd: 0.02595, credits: 0, meta: { agentId: "intake-triage", scripted: true } });

  await updateProject(supa, project.id, { current_checkpoint_id: cp2.id });
  return project.id;
}
