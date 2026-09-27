"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Brain, Coins, Gauge, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/arch/segmented";
import { AccessChip, Avatar } from "@/components/arch/badges";
import { Term } from "@/components/arch/term";
import type { Agent, AgentTool, Framework, ToolPermission } from "@/lib/blueprint/schema";
import { Frameworks } from "@/lib/blueprint/schema";
import { agentSummary, connectionName, FRAMEWORK_LABEL, MEMORY_LABEL, PERMISSION_LABEL, PERMISSION_PLAIN, presetPermission, SUPERVISION_LABEL, supervisionView } from "@/lib/blueprint/describe";
import { rehearsalSummary } from "@/lib/sim/preflight";
import { creditsUsd } from "@/lib/format";
import { setFramework, setToolPermission, updateAgentText } from "@/lib/actions/blueprint";
import { applySupervisionPreset } from "@/lib/actions/agents";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";

/** A labelled block in a face: a pencil heading, then its content. */
export function Section({ title, children, aside }: { title: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="mt-6 first:mt-1">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="font-pencil text-[21px] leading-none text-foreground">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Every save here is free and becomes a save point. One toast wording for all of them. */
export function useAgentSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; summary?: string }>, msg: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(msg, { description: `${r.summary ? `${r.summary} · ` : ""}Free · saved as a save point you can go back to` });
      else toast.error(r.error ?? "Couldn't save");
      router.refresh();
    });
  return { pending, run };
}

/** What a kind of action does, in the words a non-developer would use. */
const ACCESS_PLAIN: Record<AgentTool["access"], string> = {
  read: "Looks things up",
  write: "Changes records you can undo",
  irreversible: "Sends, pays or deletes",
};

export function PermissionRow({ tool, compact }: { tool: AgentTool; compact?: boolean }) {
  const ws = useWorkspace();
  return (
    <li className={cn("flex items-center gap-2.5 rounded-md border border-hairline bg-panel px-2.5", compact ? "py-1.5" : "py-2")}>
      <AccessChip access={tool.access} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px]">{tool.name}</span>
        {!compact && <span className="block truncate text-[11px] text-muted-foreground">{connectionName(ws.blueprint, tool.connectionId)}</span>}
      </span>
      {/* Rose is kept for "can't be undone" (the access chip); a gate is the calm accent, so rose never means just "waits". */}
      <span title={PERMISSION_PLAIN[tool.permission]} className={cn("shrink-0 text-[11.5px] font-medium", tool.permission === "ask" ? "text-amber" : tool.permission === "log" ? "text-change" : "text-muted-foreground")}>
        {PERMISSION_LABEL[tool.permission]}
      </span>
    </li>
  );
}

/**
 * One action an AI helper can take, and how much it checks with you first:
 * Just do it, Tell me or Ask first. Only an action that can't be undone is marked in rose.
 */
export function ToolPermissionEditor({ agent, tool, onSave, disabled, stacked }: { agent: Agent; tool: AgentTool; onSave: (v: ToolPermission) => void; disabled?: boolean; stacked?: boolean }) {
  const ws = useWorkspace();
  const irreversible = tool.access === "irreversible";
  const sup = supervisionView(agent);
  return (
    <li className="rounded-md border border-hairline bg-panel/80 px-3 py-2.5">
      <div className={cn("flex gap-x-3 gap-y-2", stacked ? "flex-col" : "flex-wrap items-center")}>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13.5px] font-medium leading-snug">
            {tool.name}
            {irreversible && <span className="rounded-full border border-ask/30 bg-ask/10 px-1.5 py-px text-[10.5px] font-medium text-ask">Can&apos;t undo</span>}
          </span>
          <span className="block text-[11.5px] leading-snug text-muted-foreground">
            {ACCESS_PLAIN[tool.access]} · {connectionName(ws.blueprint, tool.connectionId)}
            {sup.mode === "custom" && sup.offPreset.some((x) => x.id === tool.id) ? <span className="text-change"> · set by hand</span> : null}
          </span>
        </span>
        <Segmented<ToolPermission>
          ariaLabel={`Permission for ${tool.name}`}
          size="xs"
          className={cn("shrink-0", stacked && "w-full [&>button]:flex-1 [&>button]:justify-center", disabled && "pointer-events-none opacity-60")}
          value={tool.permission}
          onChange={(v) => v !== tool.permission && onSave(v)}
          options={(["auto", "log", "ask"] as const).map((p) => ({ value: p, label: PERMISSION_LABEL[p], title: PERMISSION_PLAIN[p] }))}
        />
      </div>
      {irreversible && tool.permission !== "ask" && (
        <p className="mt-2 text-[11.5px] leading-snug text-ask">This can&apos;t be undone and doesn&apos;t ask first. Set it to Ask first before you publish.</p>
      )}
    </li>
  );
}

/** The permissions list with one-click editing, used by the helper card and the inspector's settings. */
export function PermissionEditorList({ agent, stacked }: { agent: Agent; stacked?: boolean }) {
  const ws = useWorkspace();
  const { pending, run } = useAgentSave();
  if (!agent.tools.length) return <p className="text-[12.5px] text-muted-foreground">No actions yet. It can only talk.</p>;
  return (
    <ul className="space-y-2">
      {agent.tools.map((t) => (
        <ToolPermissionEditor key={t.id} agent={agent} tool={t} stacked={stacked} disabled={pending} onSave={(v) => run(() => setToolPermission(ws.project.id, agent.id, t.id, v), `${t.name}: ${PERMISSION_LABEL[v]}`)} />
      ))}
    </ul>
  );
}

/** Set every action at once: a preset. Changing one action afterwards shows "Custom". */
export function SupervisionPicker({ agent }: { agent: Agent }) {
  const ws = useWorkspace();
  const { pending, run } = useAgentSave();
  const sup = supervisionView(agent);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented<Agent["supervision"] | "custom">
          ariaLabel="Supervision"
          size="xs"
          value={sup.mode}
          onChange={(v) => v !== "custom" && v !== sup.mode && run(() => applySupervisionPreset(ws.project.id, agent.id, v), `${agent.name}: ${SUPERVISION_LABEL[v].label}`)}
          options={[
            { value: "autonomous", label: "On its own", title: "Looks up: Just do it · Changes: Tell me · Can't undo: Ask first" },
            { value: "spot_check", label: "Spot-check", title: "Same as On its own, and a person reviews a sample of finished runs" },
            { value: "approve_all", label: "Approve everything", title: "Every action: Ask first" },
          ]}
        />
        {pending ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Saving" /> : sup.mode === "custom" ? <span className="text-[11.5px] text-change">Custom</span> : null}
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
        {sup.mode === "custom" ? (
          sup.plain
        ) : (
          <>
            {(["read", "write", "irreversible"] as const).map((a, i) => (
              <span key={a}>{i ? " · " : ""}{a === "read" ? "Looks up" : a === "write" ? "Changes" : "Can't undo"}: <span className="text-foreground/85">{PERMISSION_LABEL[presetPermission(sup.mode as Agent["supervision"], a)]}</span></span>
            ))}
            .{sup.mode === "spot_check" ? " A person also reviews a sample of finished runs." : ""}
          </>
        )}
      </p>
    </div>
  );
}

export function AgentPlain({ agent }: { agent: Agent }) {
  const ws = useWorkspace();
  const s = agentSummary(ws.blueprint, agent);
  const sup = supervisionView(agent);
  // Counted exactly like the publish checklist: a rehearsal that hasn't run counts as not passing.
  const reh = rehearsalSummary({ ...ws.blueprint, agents: [agent] });
  return (
    <div>
      <div className="sticky-note mt-1 rounded-sm p-3.5">
        <div className="flex items-center gap-3">
          <Avatar name={agent.name} hue={agent.avatarHue} size={36} />
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium leading-snug">{agent.role}</p>
            <p className="text-[11.5px] text-muted-foreground">An AI helper · {FRAMEWORK_LABEL[agent.framework]}</p>
          </div>
        </div>
        <p className="mt-2.5 text-[13px] leading-relaxed text-foreground/90">{agent.plain}</p>
      </div>
      {s.ungated.length > 0 && (
        <p className="mt-3 rounded-md border border-ask/30 bg-ask/10 px-3 py-2 text-[12.5px] text-ask">
          {s.ungated.map((t) => t.name).join(", ")} can&apos;t be undone and doesn&apos;t ask first. Publishing stays blocked until it does.
        </p>
      )}

      <Section title="What it's allowed to do">
        <ul className="space-y-1.5">{agent.tools.map((t) => <PermissionRow key={t.id} tool={t} />)}</ul>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
          <span className="text-read">Read</span> looks things up · <span className="text-change">Change</span> edits records you can undo · <span className="text-ask">Can&apos;t undo</span> sends, pays, creates or deletes.
        </p>
      </Section>

      <Section title="How closely it's watched">
        <div className="flex gap-2.5 rounded-md border border-hairline bg-panel p-2.5">
          <Gauge className="mt-0.5 size-4 shrink-0 text-amber" />
          <p className="text-[12.5px]">
            <span className="font-medium">{sup.label}.</span> <span className="text-muted-foreground">{sup.plain}</span>
          </p>
        </div>
      </Section>

      <Section title="Rules it follows">
        <ol className="space-y-1.5">
          {agent.rules.map((r, i) => (
            <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed">
              <span className="font-pencil text-[16px] leading-[1.2] text-faint">{i + 1}.</span>
              {r}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="At a glance">
        <dl className="grid grid-cols-2 gap-2">
          <Stat icon={Brain} label="Remembers" value={MEMORY_LABEL[agent.memory.scope].replace("Remembers ", "").replace("Shares memory ", "")} />
          <Stat icon={Coins} label="Cost per conversation" value={`~${agent.cost.creditsPerRun} credits (≈ ${creditsUsd(agent.cost.creditsPerRun)})`} />
          <Stat icon={ShieldCheck} label={<Term k="rehearsal">Practice runs</Term>} value={reh.total ? `${reh.passing} of ${reh.total} passing${reh.notRun ? ` · ${reh.notRun} not run yet` : ""}` : "None yet"} />
          <Stat icon={Gauge} label="Works on" value={s.screens.length ? s.screens.map((x) => x.title).join(", ") : "Background only"} />
        </dl>
      </Section>
    </div>
  );
}

function Stat({ icon: I, label, value }: { icon: typeof Brain; label: React.ReactNode; value: string }) {
  return (
    <div className="rounded-md border border-hairline bg-panel p-2.5">
      <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><I className="size-3" />{label}</dt>
      <dd className="mt-1 text-[12.5px] leading-snug">{value}</dd>
    </div>
  );
}

type SpecPart = "supervision" | "permissions" | "framework" | "job" | "rules" | "memory";

/**
 * The structured settings, editable. The inspector shows them all; the AI helpers screen shows the
 * developer parts (framework, job description, rules, memory) under "Details for developers".
 */
export function AgentSpec({ agent, only }: { agent: Agent; only?: SpecPart[] }) {
  const ws = useWorkspace();
  const { pending, run } = useAgentSave();
  const [job, setJob] = useState(agent.jobDescription);
  const [rules, setRules] = useState(agent.rules.join("\n"));
  const show = (p: SpecPart) => !only || only.includes(p);

  return (
    <div>
      {show("supervision") && (
        <Section title={<Term k="supervision">How closely it&apos;s watched</Term>}>
          <SupervisionPicker agent={agent} />
        </Section>
      )}

      {show("permissions") && (
        <Section title="What it's allowed to do · per action">
          <PermissionEditorList agent={agent} stacked />
        </Section>
      )}

      {show("framework") && (
        <Section title="Framework" aside={<span className="text-[11px] text-faint">same agent, any runtime</span>}>
          <div className="grid grid-cols-3 gap-1.5">
            {Frameworks.map((f) => (
              <button
                key={f}
                onClick={() => f !== agent.framework && run(() => setFramework(ws.project.id, agent.id, f as Framework), `Now runs on ${FRAMEWORK_LABEL[f]}`)}
                aria-pressed={f === agent.framework}
                className={cn("rounded-md border px-2 py-1.5 text-[11.5px] transition-colors", f === agent.framework ? "border-amber/50 bg-amber-soft text-amber" : "border-hairline bg-panel text-muted-foreground hover:text-foreground")}
              >
                {FRAMEWORK_LABEL[f]}
              </button>
            ))}
          </div>
        </Section>
      )}

      {show("job") && (
        <Section title="Job description" aside={<span className="font-mono text-[10.5px] text-faint">system prompt</span>}>
          <Textarea value={job} onChange={(e) => setJob(e.target.value)} rows={7} className="bg-panel font-mono text-[12px] leading-relaxed" aria-label="Job description (system prompt)" />
          {job !== agent.jobDescription && (
            <Button size="sm" className="mt-2 h-7" disabled={pending} onClick={() => run(() => updateAgentText(ws.project.id, agent.id, { jobDescription: job }), "Job description saved")}>
              Save · free
            </Button>
          )}
        </Section>
      )}

      {show("rules") && (
        <Section title="Rules" aside={<span className="text-[11px] text-faint">one per line</span>}>
          <Textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={5} className="bg-panel text-[12.5px] leading-relaxed" aria-label="Rules, one per line" />
          {rules !== agent.rules.join("\n") && (
            <Button size="sm" className="mt-2 h-7" disabled={pending} onClick={() => run(() => updateAgentText(ws.project.id, agent.id, { rules: rules.split("\n") }), "Rules saved")}>
              Save · free
            </Button>
          )}
        </Section>
      )}

      {show("memory") && (
        <Section title="Memory & triggers">
          <dl className="grid gap-2 text-[12.5px] sm:grid-cols-2">
            <div className="rounded-md border border-hairline bg-panel p-2.5">
              <dt className="text-[11px] text-muted-foreground">Memory</dt>
              <dd className="mt-0.5">{MEMORY_LABEL[agent.memory.scope]} <span className="font-mono text-[11px] text-faint">({agent.memory.scope} · {agent.memory.retentionDays} days)</span></dd>
            </div>
            <div className="rounded-md border border-hairline bg-panel p-2.5">
              <dt className="text-[11px] text-muted-foreground">Runs on</dt>
              <dd className="mt-0.5 font-mono text-[12px]">{agent.triggers.join(", ")}</dd>
            </div>
            <div className="rounded-md border border-hairline bg-panel p-2.5">
              <dt className="text-[11px] text-muted-foreground">Model</dt>
              <dd className="mt-0.5 font-mono text-[12px]">{agent.cost.model}</dd>
            </div>
            <div className="rounded-md border border-hairline bg-panel p-2.5">
              <dt className="text-[11px] text-muted-foreground">Cost per conversation</dt>
              <dd className="mt-0.5">~{agent.cost.creditsPerRun} credits (≈ {creditsUsd(agent.cost.creditsPerRun)})</dd>
            </div>
          </dl>
        </Section>
      )}
    </div>
  );
}
