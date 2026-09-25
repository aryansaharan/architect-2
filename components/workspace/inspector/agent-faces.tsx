"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Brain, Coins, Gauge, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/arch/segmented";
import { AccessChip, Avatar } from "@/components/arch/badges";
import type { Agent, AgentTool, Framework, ToolPermission } from "@/lib/blueprint/schema";
import { Frameworks } from "@/lib/blueprint/schema";
import { agentSummary, connectionName, FRAMEWORK_LABEL, MEMORY_LABEL, PERMISSION_LABEL, SUPERVISION_LABEL } from "@/lib/blueprint/describe";
import { creditsUsd } from "@/lib/format";
import { setFramework, setSupervision, setToolPermission, updateAgentText } from "@/lib/actions/blueprint";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";

export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="mt-5 first:mt-1">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="micro-label">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function PermissionRow({ tool, compact }: { tool: AgentTool; compact?: boolean }) {
  const ws = useWorkspace();
  return (
    <li className={cn("flex items-center gap-2.5 rounded-lg border border-hairline bg-deep/60 px-2.5", compact ? "py-1.5" : "py-2")}>
      <AccessChip access={tool.access} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px]">{tool.name}</span>
        {!compact && <span className="block truncate text-[11px] text-muted-foreground">{connectionName(ws.blueprint, tool.connectionId)}</span>}
      </span>
      <span className={cn("shrink-0 text-[11.5px] font-medium", tool.permission === "ask" ? "text-ask" : tool.permission === "log" ? "text-change" : "text-muted-foreground")}>
        {PERMISSION_LABEL[tool.permission]}
      </span>
    </li>
  );
}

export function AgentPlain({ agent }: { agent: Agent }) {
  const ws = useWorkspace();
  const s = agentSummary(ws.blueprint, agent);
  const reh = agent.rehearsals;
  const passed = reh.filter((r) => r.history.length && r.history[r.history.length - 1].pass).length;
  return (
    <div>
      <div className="flex items-center gap-3 pt-1">
        <Avatar name={agent.name} hue={agent.avatarHue} size={40} />
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium">{agent.role}</p>
          <p className="text-[12px] text-muted-foreground">{FRAMEWORK_LABEL[agent.framework]} · {agent.cost.model}</p>
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-foreground/90">{agent.plain}</p>
      {s.ungated.length > 0 && (
        <p className="mt-3 rounded-lg border border-ask/30 bg-ask/10 px-3 py-2 text-[12.5px] text-ask">
          {s.ungated.map((t) => t.name).join(", ")} can&apos;t be undone and doesn&apos;t ask first. Preflight will block going live until it does.
        </p>
      )}

      <Section title="What it's allowed to do">
        <ul className="space-y-1.5">{agent.tools.map((t) => <PermissionRow key={t.id} tool={t} />)}</ul>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
          <span className="text-read">Read</span> looks things up · <span className="text-change">Change</span> edits records you can undo · <span className="text-ask">Can&apos;t undo</span> sends, pays, creates or deletes.
        </p>
      </Section>

      <Section title="How closely it's watched">
        <div className="flex gap-2.5 rounded-lg border border-hairline bg-deep/60 p-2.5">
          <Gauge className="mt-0.5 size-4 shrink-0 text-amber" />
          <p className="text-[12.5px]">
            <span className="font-medium">{SUPERVISION_LABEL[agent.supervision].label}.</span>{" "}
            <span className="text-muted-foreground">{SUPERVISION_LABEL[agent.supervision].plain}</span>
          </p>
        </div>
      </Section>

      <Section title="Rules it follows">
        <ol className="space-y-1.5">
          {agent.rules.map((r, i) => (
            <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed">
              <span className="font-mono text-[11px] text-faint">{i + 1}.</span>
              {r}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="At a glance">
        <dl className="grid grid-cols-2 gap-2">
          <Stat icon={Brain} label="Remembers" value={MEMORY_LABEL[agent.memory.scope].replace("Remembers ", "").replace("Shares memory ", "")} />
          <Stat icon={Coins} label="Cost per run" value={`~${agent.cost.creditsPerRun} cr (≈ ${creditsUsd(agent.cost.creditsPerRun)})`} />
          <Stat icon={ShieldCheck} label="Rehearsals" value={reh.length ? `${passed || (ws.project.buildState === "built" ? reh.length : 0)} of ${reh.length} passing` : "None yet"} />
          <Stat icon={Gauge} label="Works on" value={s.screens.length ? s.screens.map((x) => x.title).join(", ") : "Background only"} />
        </dl>
      </Section>
    </div>
  );
}

function Stat({ icon: I, label, value }: { icon: typeof Brain; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-deep/60 p-2.5">
      <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><I className="size-3" />{label}</dt>
      <dd className="mt-1 text-[12.5px] leading-snug">{value}</dd>
    </div>
  );
}

export function AgentSpec({ agent }: { agent: Agent }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [job, setJob] = useState(agent.jobDescription);
  const [rules, setRules] = useState(agent.rules.join("\n"));
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(msg, { description: "Free · saved as a save point" });
      else toast.error(r.error ?? "Couldn't save");
      router.refresh();
    });

  return (
    <div>
      <Section title="Permissions" aside={pending ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : null}>
        <ul className="space-y-2">
          {agent.tools.map((t) => (
            <li key={t.id} className="rounded-lg border border-hairline bg-deep/60 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[12px]">{t.id}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{connectionName(ws.blueprint, t.connectionId)}</span>
                </span>
                <AccessChip access={t.access} />
              </div>
              <Segmented<ToolPermission>
                ariaLabel={`Permission for ${t.name}`}
                size="xs"
                className="mt-2 w-full [&>button]:flex-1 [&>button]:justify-center"
                value={t.permission}
                onChange={(v) => run(() => setToolPermission(ws.project.id, agent.id, t.id, v), `${t.name}: ${PERMISSION_LABEL[v]}`)}
                options={[
                  { value: "auto", label: "Just do it" },
                  { value: "log", label: "Tell me" },
                  { value: "ask", label: "Ask first" },
                ]}
              />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Supervision">
        <Segmented<Agent["supervision"]>
          ariaLabel="Supervision"
          size="xs"
          className="w-full [&>button]:flex-1 [&>button]:justify-center"
          value={agent.supervision}
          onChange={(v) => run(() => setSupervision(ws.project.id, agent.id, v), SUPERVISION_LABEL[v].label)}
          options={[
            { value: "autonomous", label: "On its own" },
            { value: "spot_check", label: "Spot-check" },
            { value: "approve_all", label: "Approve all" },
          ]}
        />
      </Section>

      <Section title="Framework" aside={<span className="text-[11px] text-faint">same agent, any runtime</span>}>
        <div className="grid grid-cols-3 gap-1.5">
          {Frameworks.map((f) => (
            <button
              key={f}
              onClick={() => f !== agent.framework && run(() => setFramework(ws.project.id, agent.id, f as Framework), `Now runs on ${FRAMEWORK_LABEL[f]}`)}
              className={cn("rounded-md border px-2 py-1.5 text-[11.5px] transition-colors", f === agent.framework ? "border-amber/50 bg-amber-soft text-amber" : "border-hairline text-muted-foreground hover:text-foreground")}
            >
              {FRAMEWORK_LABEL[f]}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Job description (system prompt)">
        <Textarea value={job} onChange={(e) => setJob(e.target.value)} rows={7} className="font-mono text-[12px] leading-relaxed" />
        {job !== agent.jobDescription && (
          <Button size="sm" className="mt-2 h-7" disabled={pending} onClick={() => run(() => updateAgentText(ws.project.id, agent.id, { jobDescription: job }), "Job description saved")}>
            Save · free
          </Button>
        )}
      </Section>

      <Section title="Rules · one per line">
        <Textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={5} className="text-[12.5px] leading-relaxed" />
        {rules !== agent.rules.join("\n") && (
          <Button size="sm" className="mt-2 h-7" disabled={pending} onClick={() => run(() => updateAgentText(ws.project.id, agent.id, { rules: rules.split("\n") }), "Rules saved")}>
            Save · free
          </Button>
        )}
      </Section>

      <Section title="Memory & triggers">
        <p className="text-[12.5px] text-muted-foreground">
          Memory: <span className="text-foreground">{agent.memory.scope}</span> · {agent.memory.retentionDays} days. Runs on: <span className="text-foreground">{agent.triggers.join(", ")}</span>.
        </p>
      </Section>
    </div>
  );
}
