"use client";
import { useCallback, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, ChevronRight, CircleX, Code2, History, Loader2, Play, Plus, ShieldCheck, Wand2 } from "lucide-react";
import type { Agent } from "@/lib/blueprint/schema";
import type { AgentRunRow } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AccessChip } from "@/components/arch/badges";
import { TimeAgo } from "@/components/time-ago";
import { CodeView } from "@/components/arch/code-view";
import { Segmented } from "@/components/arch/segmented";
import { Term } from "@/components/arch/term";
import { Playground } from "@/components/agents/playground";
import { AgentSpec, PermissionEditorList, SupervisionPicker } from "../inspector/agent-faces";
import { rehearsalSummary } from "@/lib/sim/preflight";
import { FRAMEWORKS } from "@/lib/codegen/frameworks";
import { agentYaml, rulesMd, soulMd } from "@/lib/codegen/agentFiles";
import { addRehearsal, runRehearsals } from "@/lib/actions/agents";
import { setFramework } from "@/lib/actions/blueprint";
import { creditsUsd, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";
import { AddAgentDialog } from "./add-agent-dialog";
import { Markdown } from "@/components/markdown";
import { DUR, EASE } from "@/lib/motion";

/** Tabs the URL may ask for (?tab=). "overview" and "playground" open the helper itself; the rest are developer details. */
type Tab = "overview" | "playground" | "rehearsals" | "replay" | "code";
type DevTab = "rehearsals" | "replay" | "code" | "setup";

/** One helper's practice runs, counted exactly like the publish checklist (one that hasn't run counts as not passing). */
const agentRehearsals = (bp: Parameters<typeof rehearsalSummary>[0], agent: Agent) => rehearsalSummary({ ...bp, agents: [agent] });

const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DUR.panel, ease: EASE } },
  exit: { opacity: 0, transition: { duration: DUR.hover, ease: EASE } },
};

/** A native list for longer choices, drawn like the inputs. */
const SELECT = "h-8 rounded-md border border-input bg-raised px-2 text-ui text-foreground outline-none transition-colors duration-150 hover:border-line-strong focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20";

export function AgentsView({ runs, initialAgent, initialTab }: { runs: AgentRunRow[]; initialAgent?: string; initialTab?: Tab }) {
  const ws = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const agents = ws.blueprint.agents;
  // Replay stays current without a router refresh (which blanked the tab mid-chat): after each test conversation,
  // fetch the saved runs and show them until the server props catch up.
  const [fetched, setFetched] = useState<{ base: AgentRunRow[]; list: AgentRunRow[] } | null>(null);
  const allRuns = fetched && fetched.base === runs ? fetched.list : runs;
  const refreshRuns = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat?projectId=${encodeURIComponent(ws.project.id)}`, { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { runs: AgentRunRow[] };
      setFetched({ base: runs, list: body.runs });
    } catch {
      // Replay catches up on the next page load.
    }
  }, [runs, ws.project.id]);
  const [agentId, setAgentId] = useState(initialAgent && agents.some((a) => a.id === initialAgent) ? initialAgent : agents[0].id);
  const devFromUrl = initialTab === "rehearsals" || initialTab === "replay" || initialTab === "code";
  const [dev, setDev] = useState(devFromUrl);
  const [devTab, setDevTab] = useState<DevTab>(devFromUrl ? (initialTab as DevTab) : "rehearsals");
  const [adding, setAdding] = useState(false);
  const agent = agents.find((a) => a.id === agentId) ?? agents[0];
  const pick = (id: string) => {
    setAgentId(id);
    router.replace(`${pathname}?agent=${id}`, { scroll: false });
  };

  return (
    <div className="flex h-full min-h-0">
      <aside aria-label="AI helpers" className="flex w-[260px] shrink-0 flex-col border-r border-hairline max-md:hidden">
        <div className="flex items-end justify-between gap-2 px-4 pb-2 pt-4">
          <h2 className="font-pencil text-section">AI helpers</h2>
          <span className="pb-1 text-meta tabular-nums text-muted-foreground">{agents.length}</span>
        </div>
        <ul className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 pb-3 pt-2">
          {agents.map((a) => {
            const ungated = a.tools.filter((t) => t.access === "irreversible" && t.permission !== "ask").length;
            const current = a.id === agent.id;
            return (
              <li key={a.id}>
                <button
                  onClick={() => pick(a.id)}
                  aria-current={current}
                  className={cn(
                    "w-full rounded-md border p-3 text-left transition-colors duration-150 ease-paper",
                    current ? "border-brand/30 bg-brand-soft" : "border-hairline bg-panel hover:border-line-strong",
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Avatar name={a.name} hue={a.avatarHue} size={28} />
                    <span className="min-w-0 flex-1 truncate pr-1 font-pencil text-note leading-tight">{a.name}</span>
                  </span>
                  <span className="mt-1 block text-meta text-muted-foreground">{a.role}</span>
                  {ungated > 0 && <span className="mt-1.5 block text-meta text-ask">{ungated === 1 ? "1 action that can't be undone doesn't" : `${ungated} actions that can't be undone don't`} ask first</span>}
                  {a.origin !== "generated" && <span className="mt-1.5 block text-meta text-muted-foreground">{a.origin === "imported" ? "Brought in from your code" : "Runs somewhere else"}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-hairline p-3">
          <Button variant="outline" className="w-full" onClick={() => setAdding(true)}><Plus /> Add a helper</Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-12 flex-wrap items-center gap-2 border-b border-hairline px-4 py-2 sm:px-5">
          {dev ? (
            <>
              <Button variant="ghost" className="-ml-2 text-muted-foreground" onClick={() => setDev(false)}>
                <ArrowLeft /> {agent.name}
              </Button>
              <h2 className="font-pencil text-note leading-tight">Details for developers</h2>
              <Segmented<DevTab>
                className="ml-auto max-lg:w-full max-lg:overflow-x-auto"
                ariaLabel="Developer details"
                value={devTab}
                onChange={setDevTab}
                options={[
                  { value: "rehearsals", label: "Test runs" },
                  { value: "replay", label: <><History className="size-3.5" />Replay</> },
                  { value: "code", label: <><Code2 className="size-3.5" />Code</> },
                  { value: "setup", label: "Job description & memory" },
                ]}
              />
            </>
          ) : (
            <>
              {/* Phones: the helpers as one small choice (a styled list once there are more than four). */}
              <div className="flex w-full min-w-0 items-center gap-2 md:hidden">
                {agents.length <= 4 ? (
                  <Segmented ariaLabel="AI helper" value={agent.id} onChange={pick} className="min-w-0 max-w-full overflow-x-auto" options={agents.map((a) => ({ value: a.id, label: a.name }))} />
                ) : (
                  <select aria-label="AI helper" value={agent.id} onChange={(e) => pick(e.target.value)} className={cn(SELECT, "min-w-0 flex-1")}>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                )}
                <Button variant="outline" size="icon" className="ml-auto" onClick={() => setAdding(true)} aria-label="Add an AI helper"><Plus /></Button>
              </div>
              <p className="text-ui text-muted-foreground max-md:hidden">Each helper does one job, only the way you allow.</p>
              <Button variant="ghost" className="ml-auto text-muted-foreground max-md:-mr-2" onClick={() => setDev(true)}>
                <Code2 /> Details for developers <ChevronRight />
              </Button>
            </>
          )}
        </div>
        <div className="min-h-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={dev ? `dev-${devTab}-${agent.id}` : `helper-${agent.id}`} className="h-full" {...fade}>
              {!dev ? (
                <HelperView agent={agent} onRunSaved={refreshRuns} onDetails={() => setDev(true)} />
              ) : devTab === "rehearsals" ? (
                <Rehearsals agent={agent} />
              ) : devTab === "replay" ? (
                <Replay agent={agent} runs={allRuns.filter((r) => r.agent_id === agent.id)} />
              ) : devTab === "code" ? (
                <AgentCode agent={agent} />
              ) : (
                <div className="h-full overflow-y-auto">
                  <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
                    <AgentSpec key={agent.id} agent={agent} only={["job", "rules", "memory"]} />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <AddAgentDialog open={adding} onOpenChange={setAdding} onAdded={(id) => { setAdding(false); setDev(false); pick(id); }} />
    </div>
  );
}

/**
 * The helper itself, for everyone: a sticky note says who it is; a card below says what it's allowed
 * to do, beside a small test conversation. Everything developer-shaped is one click away, not in the way.
 */
function HelperView({ agent, onRunSaved, onDetails }: { agent: Agent; onRunSaved: () => void; onDetails: () => void }) {
  const ws = useWorkspace();
  const ungated = agent.tools.filter((t) => t.access === "irreversible" && t.permission !== "ask");
  return (
    <div className="h-full min-h-0 overflow-y-auto xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:overflow-hidden">
      <div className="px-4 py-5 sm:px-6 xl:min-h-0 xl:overflow-y-auto">
        <div className="mx-auto max-w-[560px]">
          <article aria-label={`${agent.name}, an AI helper`} className="sticky-note px-5 py-4">
            <div className="flex items-start gap-3">
              <Avatar name={agent.name} hue={agent.avatarHue} size={40} className="mt-1" />
              <div className="min-w-0 flex-1">
                <h2 className="font-pencil text-title">{agent.name}</h2>
                <p className="mt-1 text-body text-foreground/85">{agent.role}</p>
              </div>
            </div>
          </article>

          <section className="mt-7" aria-labelledby="allowed-title">
            <h3 id="allowed-title" className="font-pencil text-section">What it&apos;s allowed to do</h3>
            <p className="mb-3 mt-1.5 text-meta text-muted-foreground">
              <span className="text-foreground/80">Just do it</span> runs straight away · <span className="text-foreground/80">Tell me</span> runs and tells you · <span className="text-foreground/80">Ask first</span> waits for you
            </p>
            {ungated.length > 0 && (
              <p className="mb-3 rounded-md border border-ask/30 bg-ask/10 px-3 py-2 text-ui text-ask">
                {ungated.map((t) => t.name).join(", ")} can&apos;t be undone and {ungated.length === 1 ? "doesn't" : "don't"} ask first. Set {ungated.length === 1 ? "it" : "them"} to Ask first before you publish.
              </p>
            )}
            <PermissionEditorList agent={agent} />
          </section>

          <section className="panel mt-3 rounded-md px-3 py-3" aria-label="Set every action at once">
            <p className="mb-2 text-ui font-medium">Or set them all at once</p>
            <SupervisionPicker agent={agent} />
          </section>

          <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted-foreground">
            <span>About <span className="tabular-nums">{agent.cost.creditsPerRun}</span> <Term k="credits">credits</Term> a conversation (≈ {creditsUsd(agent.cost.creditsPerRun)})</span>
            <span aria-hidden>·</span>
            <button onClick={onDetails} className="underline decoration-dotted underline-offset-4 transition-colors duration-150 hover:text-foreground">Details for developers</button>
          </p>
        </div>
      </div>

      <section aria-labelledby="try-title" className="flex h-[620px] min-h-0 flex-col border-hairline max-xl:border-t xl:h-full xl:border-l">
        <div className="px-4 pt-5 sm:px-5">
          <h3 id="try-title" className="font-pencil text-section">Try it</h3>
          <p className="mt-1 text-ui text-muted-foreground">A small test conversation. It uses sample data, so nothing real happens.</p>
        </div>
        <div className="min-h-0 flex-1">
          <Playground key={agent.id} projectId={ws.project.id} agent={agent} bp={ws.blueprint} llm={ws.llm} onRunSaved={onRunSaved} />
        </div>
      </section>
    </div>
  );
}

function Rehearsals({ agent }: { agent: Agent }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [running, setRunning] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", input: "", expect: "" });
  // Same counting as the publish checklist: a rehearsal that hasn't run counts as not passing.
  const sum = agentRehearsals(ws.blueprint, agent);
  const rate = sum.total ? sum.rate : null;
  // trend: pass rate per run index (last 8 runs)
  const runsCount = Math.max(0, ...agent.rehearsals.map((r) => r.history.length));
  const trend = Array.from({ length: Math.min(8, runsCount) }, (_, k) => {
    const idx = runsCount - Math.min(8, runsCount) + k;
    const results = agent.rehearsals.map((r) => r.history[idx - (runsCount - r.history.length)]).filter(Boolean);
    return results.length ? results.filter((x) => x!.pass).length / results.length : 1;
  });

  async function runAll() {
    for (let i = 0; i < agent.rehearsals.length; i++) {
      setRunning(i);
      await new Promise((r) => setTimeout(r, 550));
    }
    const r = await runRehearsals(ws.project.id, agent.id);
    setRunning(null);
    if (!r.ok) return void toast.error(r.error);
    if (r.passed === r.total) toast.success(`${r.passed} of ${r.total} passed`);
    else toast.error(`${r.passed} of ${r.total} passed`, { description: "Open the failed one to see what happened and fix it." });
    router.refresh();
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
          <div className="panel rounded-md p-4">
            <p className="micro-label">Reliability</p>
            <p className={cn("mt-1.5 text-lead font-semibold tabular-nums", rate === null ? "text-muted-foreground" : rate >= 0.8 ? "text-ok" : "text-foreground")}>{rate === null ? "Not run yet" : `${Math.round(rate * 100)}% passing`}</p>
            <p className="mt-1 text-ui text-muted-foreground">
              {rate === null ? "No test runs yet." : `${sum.passing} of ${sum.total} passing on their latest run.`}
              {sum.notRun ? ` ${sum.notRun} not run yet, so ${sum.notRun === 1 ? "it counts" : "they count"} as not passing.` : ""} Publishing needs 80%.
            </p>
            {trend.length > 1 && (
              <div className="mt-3">
                {/* Only the latest run carries a status colour, and it matches the number above.
                    Earlier runs stay as grey history (their height is how many passed), so a fixed failure doesn't read as a live one. */}
                <div className="flex h-10 items-end gap-1" role="img" aria-label={`Pass rate over the last ${trend.length} runs: ${trend.map((t) => `${Math.round(t * 100)}%`).join(", ")}`}>
                  {trend.map((t, i) => {
                    const latest = i === trend.length - 1;
                    return (
                      <span
                        key={i}
                        title={`${latest ? "Latest run" : `Run ${i + 1} of ${trend.length}`}: ${Math.round(t * 100)}% passed`}
                        className={cn("flex-1 rounded-sm", latest ? (t >= 0.8 ? "bg-ok/70" : "bg-foreground/55") : "bg-muted-foreground/25")}
                        style={{ height: `${Math.max(10, t * 100)}%` }}
                      />
                    );
                  })}
                </div>
                <p className="mt-1 flex justify-between text-meta text-faint"><span>Earlier runs</span><span>Latest</span></p>
              </div>
            )}
          </div>
          <div className="panel flex flex-col justify-between rounded-md p-4">
            <div>
              <p className="text-body font-medium"><Term k="rehearsal">Test runs</Term> are practice conversations {agent.name} must get right before anyone relies on it.</p>
              <p className="mt-1 text-ui text-muted-foreground">They run on every build and every pull request. If you loosen a permission, the test run that depends on it will catch it.</p>
            </div>
            <Button className="mt-3 w-fit" onClick={runAll} disabled={running !== null || !agent.rehearsals.length}>
              {running !== null ? <Loader2 className="animate-spin" /> : <Play />} Run all {agent.rehearsals.length} · free
            </Button>
          </div>
        </div>

        <ul className="mt-5 space-y-2">
          {agent.rehearsals.map((r, i) => {
            const last = r.history[r.history.length - 1];
            return (
              <li key={r.id} className={cn("panel rounded-md p-3.5", last && !last.pass && "border-foreground/30")}>
                <div className="flex items-start gap-3">
                  {running === i ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-brand" /> : !last ? <span className="mt-1 size-3 shrink-0 rounded-full border border-hairline-hi" /> : last.pass ? <Check className="mt-0.5 size-4 shrink-0 text-ok" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-foreground/70" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-ui font-medium">{r.name}</p>
                    <p className="mt-0.5 text-ui text-muted-foreground"><span className="text-foreground/80">When:</span> {r.input}</p>
                    <p className="text-ui text-muted-foreground"><span className="text-foreground/80">Should:</span> {r.expect}</p>
                    {last ? <p className={cn("mt-1.5 text-meta", last.pass ? "text-ok" : "font-medium text-foreground")}>{last.pass ? "" : "Failed: "}{last.note} · <TimeAgo iso={last.at} /></p> : running !== i && <p className="mt-1.5 text-meta text-muted-foreground">Not run yet, so it counts as not passing.</p>}
                  </div>
                  {last && !last.pass && (
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => { ws.setScope({ type: "agent", id: agent.id }); ws.focusComposer({ type: "agent", id: agent.id }); }}>
                      <Wand2 /> Fix this
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="panel mt-5 rounded-md p-4">
          <p className="text-ui font-medium">Add a test run</p>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1.4fr_1.4fr_auto]">
            <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Test run name" />
            <Input placeholder="When this happens…" value={form.input} onChange={(e) => setForm({ ...form, input: e.target.value })} aria-label="What happens" />
            <Input placeholder="…it should do this" value={form.expect} onChange={(e) => setForm({ ...form, expect: e.target.value })} aria-label="What should happen" />
            <Button disabled={pending || !form.input || !form.expect} onClick={() => start(async () => { const r = await addRehearsal(ws.project.id, agent.id, form); if (r.ok) { toast.success("Test run added"); setForm({ name: "", input: "", expect: "" }); } else toast.error(r.error); router.refresh(); })}>
              <Plus /> Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Replay({ agent, runs }: { agent: Agent; runs: AgentRunRow[] }) {
  const ws = useWorkspace();
  const [open, setOpen] = useState<string | null>(runs[0]?.id ?? null);
  if (!runs.length)
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="max-w-sm">
          <History className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 font-pencil text-note leading-tight">No runs yet</p>
          <p className="mt-2 text-ui text-muted-foreground">Every conversation with {agent.name} is saved here: what it looked up, what it changed, who approved what, and what it cost.</p>
        </div>
      </div>
    );
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-2 px-4 py-6 sm:px-6">
        <p className="mb-2 text-ui text-muted-foreground">Replay and audit log · {runs.length} run{runs.length === 1 ? "" : "s"}</p>
        {runs.map((r) => {
          const expanded = open === r.id;
          const firstUser = r.transcript.find((t) => t.role === "user")?.text ?? "Conversation";
          const approvals = r.tool_calls.filter((t) => t.approval === "approved").length;
          const denied = r.tool_calls.filter((t) => t.approval === "denied" || t.state === "denied").length;
          return (
            <div key={r.id} className="panel overflow-hidden rounded-md">
              <button onClick={() => setOpen(expanded ? null : r.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={expanded}>
                <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-paper", expanded && "rotate-90")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ui" title={firstUser}>“{firstUser}”</span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-meta text-muted-foreground [&>span]:whitespace-nowrap">
                    <span>{r.tool_calls.length} tool call{r.tool_calls.length === 1 ? "" : "s"}</span>
                    {approvals > 0 && <span className="text-ok">{approvals} approved by a person</span>}
                    {denied > 0 && <span className="text-foreground/80">{denied} denied</span>}
                    <span>{(r.input_tokens + r.output_tokens).toLocaleString()} tokens · {formatUsd(Number(r.cost_usd))}</span>
                    <span>{r.mode === "scripted" ? "scripted" : "live"}</span>
                  </span>
                </span>
                <TimeAgo iso={r.created_at} className="shrink-0 text-meta text-faint" />
              </button>
              {expanded && (
                <ol className="space-y-2 border-t border-hairline px-4 py-3">
                  {r.transcript.map((t, i) => (
                    <li key={`t${i}`} className="flex gap-2 text-ui">
                      <span className={cn("w-16 shrink-0 pt-0.5 text-badge font-medium", t.role === "user" ? "text-muted-foreground" : "text-brand")}>{t.role === "user" ? "Person" : "Helper"}</span>
                      <Markdown text={t.text} className="min-w-0 flex-1 text-ui" />
                    </li>
                  ))}
                  {r.tool_calls.map((t) => {
                    const tool = agent.tools.find((x) => x.id === t.toolId);
                    const name = tool?.name ?? t.toolId;
                    const query = typeof t.input === "object" && t.input && "query" in t.input ? String((t.input as { query: string }).query) : "";
                    return (
                      <li key={t.toolCallId} className="flex min-w-0 items-center gap-2 text-meta">
                        <span className="w-16 shrink-0 text-badge font-medium text-muted-foreground">Action</span>
                        {/* Pills stay on one line: a long tool name is cut short, and the full name is in the tooltip. */}
                        <span className="flex min-w-0 max-w-[45%] shrink-0" title={name}>
                          <AccessChip access={t.access} className="min-w-0 max-w-full whitespace-nowrap"><span className="truncate">{name}</span></AccessChip>
                        </span>
                        <span className="min-w-0 truncate font-mono text-badge text-muted-foreground" title={query || undefined}>{query}</span>
                        <span className={cn("ml-auto shrink-0 whitespace-nowrap text-badge", t.approval === "approved" ? "text-ok" : t.approval === "denied" ? "text-foreground/80" : "text-faint")}>
                          {t.approval === "approved" ? "approved by a person" : t.approval === "denied" ? "denied" : t.approval === "logged" ? "logged" : "automatic"}
                        </span>
                      </li>
                    );
                  })}
                  <li className="pt-1 text-meta text-faint">Run {r.id.slice(0, 8)} · on <Term k="save-point">version</Term> {ws.checkpoints.find((c) => c.id === r.checkpoint_id)?.seq ?? "?"} · {r.input_tokens.toLocaleString()} in / {r.output_tokens.toLocaleString()} out</li>
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgentCode({ agent }: { agent: Agent }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fw, setFw] = useState(agent.framework);
  const [file, setFile] = useState<"runtime" | "yaml" | "soul" | "rules">("runtime");
  const mod = FRAMEWORKS[fw];
  const preview = { ...agent, framework: fw };
  const code = file === "runtime" ? mod.render(preview, ws.blueprint) : file === "yaml" ? agentYaml(preview, ws.blueprint) : file === "soul" ? soulMd(preview) : rulesMd(preview, ws.blueprint);
  const lang = file === "runtime" ? (mod.language === "python" ? "py" : "ts") : file === "yaml" ? "yaml" : "md";
  return (
    <div className="grid h-full min-h-0 lg:grid-cols-[1fr_300px]">
      <div className="flex min-h-0 flex-col border-hairline lg:border-r">
        <div className="flex min-w-0 items-center gap-2 border-b border-hairline px-3 py-2">
          <span className="shrink-0 text-meta text-muted-foreground">Framework</span>
          <Segmented<typeof fw>
            ariaLabel="Framework"
            size="xs"
            value={fw}
            onChange={setFw}
            className="min-w-0 max-w-full overflow-x-auto"
            options={Object.values(FRAMEWORKS).map((m) => ({ value: m.id, label: <>{m.label}{m.id === agent.framework && <span className="text-faint">· in use</span>}</> }))}
          />
        </div>
        <div className="flex min-w-0 items-center gap-2 border-b border-hairline px-3 py-2">
          <Segmented<typeof file>
            ariaLabel="File"
            size="xs"
            value={file}
            onChange={setFile}
            className="min-w-0 max-w-full shrink-0 overflow-x-auto"
            options={([["runtime", mod.fileName(preview)], ["yaml", "agent.yaml"], ["soul", "SOUL.md"], ["rules", "RULES.md"]] as const).map(([k, l]) => ({ value: k, label: <span className="font-mono">{l}</span> }))}
          />
          <span className="ml-auto truncate font-mono text-badge text-faint max-sm:hidden">{mod.install}</span>
        </div>
        <CodeView code={code} lang={lang} className="min-h-0 flex-1" />
      </div>
      <div className="overflow-y-auto p-5">
        <h3 className="font-pencil text-note leading-tight">What doesn&apos;t translate to {mod.label}</h3>
        <ul className="mt-3 space-y-3">
          {mod.notes(preview, ws.blueprint).map((n) => <li key={n} className="text-ui text-muted-foreground">{n}</li>)}
        </ul>
        <div className="panel mt-6 rounded-md p-3">
          <p className="flex items-center gap-2 text-ui font-medium"><ShieldCheck className="size-3.5 text-muted-foreground" />Same permissions everywhere</p>
          <p className="mt-1 text-meta text-muted-foreground">Approval gates compile to {mod.label}&apos;s own mechanism. Test runs work the same way in every framework.</p>
        </div>
        {fw !== agent.framework && (
          <Button className="mt-4 w-full" disabled={pending} onClick={() => start(async () => { const r = await setFramework(ws.project.id, agent.id, fw); if (r.ok) toast.success(`${agent.name} now runs on ${mod.label}`, { description: "Free · saved as a new version you can go back to" }); else toast.error(r.error); router.refresh(); })}>
            {pending ? <Loader2 className="animate-spin" /> : null} Run {agent.name} on {mod.label}
          </Button>
        )}
      </div>
    </div>
  );
}
