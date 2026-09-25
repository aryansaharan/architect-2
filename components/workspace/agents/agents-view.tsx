"use client";
import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronRight, CircleX, FlaskConical, History, Loader2, Play, Plus, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import type { Agent } from "@/lib/blueprint/schema";
import type { AgentRunRow } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AccessChip } from "@/components/arch/badges";
import { TimeAgo } from "@/components/time-ago";
import { CodeView } from "@/components/arch/code-view";
import { Segmented } from "@/components/arch/segmented";
import { Playground } from "@/components/agents/playground";
import { AgentPlain, AgentSpec } from "../inspector/agent-faces";
import { FRAMEWORK_LABEL, SUPERVISION_LABEL } from "@/lib/blueprint/describe";
import { FRAMEWORKS } from "@/lib/codegen/frameworks";
import { agentYaml, rulesMd, soulMd } from "@/lib/codegen/agentFiles";
import { addRehearsal, runRehearsals } from "@/lib/actions/agents";
import { setFramework } from "@/lib/actions/blueprint";
import { creditsUsd, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";
import { AddAgentDialog } from "./add-agent-dialog";

type Tab = "overview" | "playground" | "rehearsals" | "replay" | "code";

export function AgentsView({ runs, initialAgent, initialTab }: { runs: AgentRunRow[]; initialAgent?: string; initialTab?: Tab }) {
  const ws = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const agents = ws.blueprint.agents;
  const [agentId, setAgentId] = useState(initialAgent && agents.some((a) => a.id === initialAgent) ? initialAgent : agents[0].id);
  const [tab, setTab] = useState<Tab>(initialTab ?? "overview");
  const [adding, setAdding] = useState(false);
  const agent = agents.find((a) => a.id === agentId) ?? agents[0];
  const pick = (id: string) => {
    setAgentId(id);
    router.replace(`${pathname}?agent=${id}`, { scroll: false });
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[280px] shrink-0 flex-col border-r border-hairline max-md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="micro-label">Team · {agents.length} agents</h2>
          <Button size="sm" variant="outline" className="h-7" onClick={() => setAdding(true)}><Plus /> Add</Button>
        </div>
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
          {agents.map((a) => {
            const reh = a.rehearsals;
            const last = reh.filter((r) => r.history.length);
            const passing = last.filter((r) => r.history[r.history.length - 1].pass).length;
            const ungated = a.tools.some((t) => t.access === "irreversible" && t.permission !== "ask");
            return (
              <li key={a.id}>
                <button onClick={() => pick(a.id)} aria-current={a.id === agent.id} className={cn("w-full rounded-xl border p-3 text-left transition-colors", a.id === agent.id ? "border-amber/50 bg-amber-soft" : "border-hairline bg-panel hover:border-[#343947]")}>
                  <span className="flex items-center gap-2.5">
                    <Avatar name={a.name} hue={a.avatarHue} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{a.name}</span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">{a.role}</span>
                    </span>
                  </span>
                  <span className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>{FRAMEWORK_LABEL[a.framework]}</span>
                    <span>{SUPERVISION_LABEL[a.supervision].label}</span>
                    {last.length > 0 && <span className={passing === last.length ? "text-read" : "text-ask"}>{passing}/{last.length} rehearsals</span>}
                    {ungated && <span className="text-ask">ungated action</span>}
                    {a.origin !== "generated" && <span className="text-change">{a.origin === "imported" ? "imported" : "remote"}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-hairline px-5 py-3">
          <Avatar name={agent.name} hue={agent.avatarHue} size={34} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{agent.name}</p>
            <p className="truncate text-[12px] text-muted-foreground">{agent.role} · ~{agent.cost.creditsPerRun} cr per run (≈ {creditsUsd(agent.cost.creditsPerRun)})</p>
          </div>
          <select aria-label="Agent" value={agent.id} onChange={(e) => pick(e.target.value)} className="ml-2 h-8 rounded-md border border-hairline bg-deep px-2 text-[12.5px] md:hidden">
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <Segmented<Tab>
            className="ml-auto"
            ariaLabel="Agent view"
            value={tab}
            onChange={setTab}
            options={[
              { value: "overview", label: "Overview" },
              { value: "playground", label: <><Sparkles className="size-3.5" />Playground</> },
              { value: "rehearsals", label: <><FlaskConical className="size-3.5" />Rehearsals</> },
              { value: "replay", label: <><History className="size-3.5" />Replay</> },
              { value: "code", label: "Code" },
            ]}
          />
        </div>
        <div className="min-h-0 flex-1">
          {tab === "overview" && <Overview key={agent.id} agent={agent} />}
          {tab === "playground" && <Playground key={agent.id} projectId={ws.project.id} agent={agent} bp={ws.blueprint} llm={ws.llm} />}
          {tab === "rehearsals" && <Rehearsals key={agent.id} agent={agent} />}
          {tab === "replay" && <Replay agent={agent} runs={runs.filter((r) => r.agent_id === agent.id)} />}
          {tab === "code" && <AgentCode key={agent.id} agent={agent} />}
        </div>
      </div>
      <AddAgentDialog open={adding} onOpenChange={setAdding} onAdded={(id) => { setAdding(false); pick(id); setTab("overview"); }} />
    </div>
  );
}

function Overview({ agent }: { agent: Agent }) {
  return (
    <div className="grid h-full min-h-0 lg:grid-cols-2">
      <div className="min-h-0 overflow-y-auto border-hairline px-6 py-5 lg:border-r">
        <p className="micro-label mb-3 text-amber">Plain · for everyone</p>
        <AgentPlain agent={agent} />
      </div>
      <div className="min-h-0 overflow-y-auto px-6 py-5">
        <p className="micro-label mb-3 text-amber">Spec · change it here, free</p>
        <AgentSpec agent={agent} />
      </div>
    </div>
  );
}

function Rehearsals({ agent }: { agent: Agent }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [running, setRunning] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", input: "", expect: "" });
  const withHistory = agent.rehearsals.filter((r) => r.history.length);
  const passing = withHistory.filter((r) => r.history[r.history.length - 1].pass).length;
  const rate = withHistory.length ? passing / withHistory.length : null;
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
      <div className="mx-auto max-w-4xl px-6 py-6">
        <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
          <div className="panel rounded-xl p-4">
            <p className="micro-label">Reliability</p>
            <p className={cn("mt-2 text-[34px] font-semibold tabular-nums", rate === null ? "text-muted-foreground" : rate >= 0.9 ? "text-read" : rate >= 0.8 ? "text-amber" : "text-ask")}>{rate === null ? "—" : `${Math.round(rate * 100)}%`}</p>
            <p className="text-[12.5px] text-muted-foreground">{rate === null ? "Not rehearsed yet." : `${passing} of ${withHistory.length} rehearsals passing on the latest run.`} Going live needs 80%.</p>
            {trend.length > 1 && (
              <div className="mt-3 flex h-10 items-end gap-1" aria-label="Pass rate over recent runs">
                {trend.map((t, i) => <span key={i} className={cn("flex-1 rounded-sm", t >= 0.9 ? "bg-read/70" : t >= 0.8 ? "bg-amber/70" : "bg-ask/70")} style={{ height: `${Math.max(10, t * 100)}%` }} />)}
              </div>
            )}
          </div>
          <div className="panel flex flex-col justify-between rounded-xl p-4">
            <div>
              <p className="text-[14px] font-medium">Rehearsals are conversations {agent.name} must get right before anyone relies on it.</p>
              <p className="mt-1 text-[12.5px] text-muted-foreground">They run on every build and every pull request. If you loosen a permission, the rehearsal that depends on it will catch it.</p>
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
              <li key={r.id} className={cn("panel rounded-xl p-3.5", last && !last.pass && "border-ask/40")}>
                <div className="flex items-start gap-3">
                  {running === i ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-amber" /> : !last ? <span className="mt-1 size-3 shrink-0 rounded-full border border-hairline" /> : last.pass ? <Check className="mt-0.5 size-4 shrink-0 text-read" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-ask" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{r.name}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground"><span className="text-foreground/80">When:</span> {r.input}</p>
                    <p className="text-[12.5px] text-muted-foreground"><span className="text-foreground/80">Should:</span> {r.expect}</p>
                    {last && <p className={cn("mt-1.5 text-[12px]", last.pass ? "text-read" : "text-ask")}>{last.note} · <TimeAgo iso={last.at} /></p>}
                  </div>
                  {last && !last.pass && (
                    <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={() => { ws.setScope({ type: "agent", id: agent.id }); ws.focusComposer({ type: "agent", id: agent.id }); }}>
                      <Wand2 /> Fix this
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="panel mt-5 rounded-xl p-4">
          <p className="text-[13px] font-medium">Add a rehearsal</p>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1.4fr_1.4fr_auto]">
            <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-9" aria-label="Rehearsal name" />
            <Input placeholder="When this happens…" value={form.input} onChange={(e) => setForm({ ...form, input: e.target.value })} className="h-9" aria-label="What happens" />
            <Input placeholder="…it should do this" value={form.expect} onChange={(e) => setForm({ ...form, expect: e.target.value })} className="h-9" aria-label="What should happen" />
            <Button className="h-9" disabled={pending || !form.input || !form.expect} onClick={() => start(async () => { const r = await addRehearsal(ws.project.id, agent.id, form); if (r.ok) { toast.success("Rehearsal added"); setForm({ name: "", input: "", expect: "" }); } else toast.error(r.error); router.refresh(); })}>
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
        <div>
          <History className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-[14px] font-medium">No runs yet</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Every conversation with {agent.name} is saved here: what it looked up, what it changed, who approved what, and what it cost.</p>
        </div>
      </div>
    );
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-2 px-6 py-6">
        <p className="micro-label mb-2">Replay &amp; audit log · {runs.length} runs</p>
        {runs.map((r) => {
          const expanded = open === r.id;
          const firstUser = r.transcript.find((t) => t.role === "user")?.text ?? "Conversation";
          const approvals = r.tool_calls.filter((t) => t.approval === "approved").length;
          const denied = r.tool_calls.filter((t) => t.approval === "denied" || t.state === "denied").length;
          return (
            <div key={r.id} className="panel overflow-hidden rounded-xl">
              <button onClick={() => setOpen(expanded ? null : r.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={expanded}>
                <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">“{firstUser}”</span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-muted-foreground">
                    <span>{r.tool_calls.length} tool calls</span>
                    {approvals > 0 && <span className="text-read">{approvals} approved by a person</span>}
                    {denied > 0 && <span className="text-ask">{denied} denied</span>}
                    <span>{(r.input_tokens + r.output_tokens).toLocaleString()} tokens · {formatUsd(Number(r.cost_usd))}</span>
                    <span>{r.mode === "scripted" ? "scripted" : "live"}</span>
                  </span>
                </span>
                <TimeAgo iso={r.created_at} className="shrink-0 text-[11.5px] text-faint" />
              </button>
              {expanded && (
                <ol className="space-y-2 border-t border-hairline px-4 py-3">
                  {r.transcript.map((t, i) => (
                    <li key={`t${i}`} className="flex gap-2 text-[12.5px]">
                      <span className={cn("w-16 shrink-0 font-mono text-[11px]", t.role === "user" ? "text-muted-foreground" : "text-amber")}>{t.role === "user" ? "person" : "agent"}</span>
                      <span className="leading-relaxed">{t.text}</span>
                    </li>
                  ))}
                  {r.tool_calls.map((t) => {
                    const tool = agent.tools.find((x) => x.id === t.toolId);
                    return (
                      <li key={t.toolCallId} className="flex items-center gap-2 text-[12px]">
                        <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground">tool</span>
                        <AccessChip access={t.access}>{tool?.name ?? t.toolId}</AccessChip>
                        <span className="truncate font-mono text-[11px] text-muted-foreground">{typeof t.input === "object" && t.input && "query" in t.input ? String((t.input as { query: string }).query) : ""}</span>
                        <span className={cn("ml-auto shrink-0 text-[11px]", t.approval === "approved" ? "text-read" : t.approval === "denied" ? "text-ask" : "text-faint")}>
                          {t.approval === "approved" ? "approved by a person" : t.approval === "denied" ? "denied" : t.approval === "logged" ? "logged" : "automatic"}
                        </span>
                      </li>
                    );
                  })}
                  <li className="pt-1 text-[11.5px] text-faint">Run {r.id.slice(0, 8)} · save point {ws.checkpoints.find((c) => c.id === r.checkpoint_id)?.seq ?? "—"} · {r.input_tokens.toLocaleString()} in / {r.output_tokens.toLocaleString()} out</li>
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
        <div className="flex flex-wrap items-center gap-1 border-b border-hairline px-3 py-2">
          {Object.values(FRAMEWORKS).map((m) => (
            <button key={m.id} onClick={() => setFw(m.id)} className={cn("rounded-md px-2.5 py-1 text-[12px]", m.id === fw ? "bg-raised text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {m.label}{m.id === agent.framework && <span className="ml-1 text-amber">●</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 border-b border-hairline px-3 py-1.5">
          {([["runtime", mod.fileName(preview)], ["yaml", "agent.yaml"], ["soul", "SOUL.md"], ["rules", "RULES.md"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFile(k)} className={cn("rounded px-2 py-0.5 font-mono text-[11px]", file === k ? "bg-deep text-foreground" : "text-muted-foreground hover:text-foreground")}>{l}</button>
          ))}
          <span className="ml-auto font-mono text-[10.5px] text-faint">{mod.install}</span>
        </div>
        <CodeView code={code} lang={lang} className="min-h-0 flex-1" />
      </div>
      <div className="overflow-y-auto p-5">
        <p className="micro-label">What doesn&apos;t translate to {mod.label}</p>
        <ul className="mt-3 space-y-3">
          {mod.notes(preview, ws.blueprint).map((n) => <li key={n} className="text-[12.5px] leading-relaxed text-muted-foreground">{n}</li>)}
        </ul>
        <div className="mt-6 rounded-xl border border-hairline p-3">
          <p className="flex items-center gap-2 text-[12.5px] font-medium"><ShieldCheck className="size-3.5 text-read" />Same permissions everywhere</p>
          <p className="mt-1 text-[12px] text-muted-foreground">Approval gates compile to {mod.label}&apos;s own mechanism. Rehearsals run the same way in every framework.</p>
        </div>
        {fw !== agent.framework && (
          <Button className="mt-4 w-full" disabled={pending} onClick={() => start(async () => { const r = await setFramework(ws.project.id, agent.id, fw); if (r.ok) toast.success(`${agent.name} now runs on ${mod.label}`, { description: "Free · saved as a save point" }); else toast.error(r.error); router.refresh(); })}>
            {pending ? <Loader2 className="animate-spin" /> : null} Run {agent.name} on {mod.label}
          </Button>
        )}
      </div>
    </div>
  );
}
