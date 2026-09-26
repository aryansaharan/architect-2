import "server-only";
import type { Supa } from "@/lib/supabase/server";
import { starterBlueprint, STARTERS } from "@/lib/blueprint/fixtures";
import { applyOps, markBuilt } from "@/lib/blueprint/apply";
import { planRepair } from "@/lib/sim/repair";
import { shortId } from "@/lib/sim/hash";
import { addCheckpoint, addLedger, createProject, logUsage, updateProject } from "@/lib/db/writes";
import { preflight } from "@/lib/sim/preflight";
import { rehearsalOutcome } from "@/lib/sim/rehearse";
import type { Blueprint } from "@/lib/blueprint/schema";

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
 * Everything is written through the guest's own session, so RLS is exercised.
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

  const cp1 = await addCheckpoint(supa, project.id, { label: "Plan approved", kind: "blueprint", blueprint: planned, summary: "5 screens · 3 agents · 4 data types · 5 connections" });
  const cp2 = await addCheckpoint(supa, project.id, { label: "Build complete", kind: "build", blueprint: built, summary: "Built and rehearsed. Added an approval gate to Settlement." });

  const slug = `claims-desk-${shortId(project.id)}`;
  await supa.from("live_sites").insert({ slug, project_id: project.id, checkpoint_id: cp2.id, blueprint: built });
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
    { lane: "thought", kind: "work_order", title: "Plan ready · 5 screens, 3 agents", body: "Estimated 24 min and 96 credits (≈ $0.96). You approved it.", checkpointId: cp1.id, credits: 0, createdAt: at(2) },
    { lane: "did", kind: "build_step", title: "Built 5 screens and put 3 agents on duty", body: "Intake Queue, Claim Detail, Adjuster Desk, Payouts, File a Claim.", credits: 96, createdAt: at(24) },
    { lane: "checked", kind: "repair", blame: "system_fix", title: "Caught: Settlement could send money without asking", body: repair.options[0].narration, objectRef: { type: "agent", id: "settlement" }, credits: 0, createdAt: at(25) },
    { lane: "checked", kind: "rehearsal", title: `Rehearsed ${rehearsed.length} conversations · ${passed} passed`, credits: 0, checkpointId: cp2.id, createdAt: at(27) },
    { lane: "did", kind: "ship", title: "Went live on Wonderwork Cloud", body: `Anyone with the link can open /live/${slug}. Payouts stay in test mode.`, checkpointId: cp2.id, createdAt: at(88) },
    { lane: "did", kind: "agent_run", blame: "agent", title: "Intake Triage asked before emailing Dana Whitfield", body: "You allowed it once. The email was sent from claims@harbormutual.com.", objectRef: { type: "agent", id: "intake-triage" }, credits: 0.7, createdAt: at(90) },
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
      lastDiff: "agents/settlement/agent.yaml\n-    permission: log\n+    permission: ask",
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

  await logUsage(supa, { userId, projectId: project.id, kind: "build", credits: 96, meta: { note: "Work Order estimate", scripted: true } });
  await logUsage(supa, { userId, projectId: project.id, kind: "agent_run", provider: "anthropic", model: "claude-opus-5", inputTokens: 2140, outputTokens: 610, costUsd: 0.02595, credits: 0.7, meta: { agentId: "intake-triage", scripted: true } });

  await updateProject(supa, project.id, { current_checkpoint_id: cp2.id });
  return project.id;
}
