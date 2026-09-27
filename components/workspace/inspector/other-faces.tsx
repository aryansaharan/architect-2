"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/arch/badges";
import { ConnectionIcon } from "@/components/icon";
import type { Block, Connection, Entity, Screen } from "@/lib/blueprint/schema";
import { allBlocks, BLOCK_LABELS, blockTitle, relations } from "@/lib/blueprint";
import { connectionSummary, entitySummary, list, screenSummary, signInMethods } from "@/lib/blueprint/describe";
import { creditsUsd, formatValue } from "@/lib/format";
import { setConnectionStatus, setTheme, updateScreenText } from "@/lib/actions/blueprint";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";
import { Section } from "./agent-faces";
import { ScreenThumb } from "../screen-thumb";

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(msg, { description: "Free · saved as a save point" });
      else toast.error(r.error ?? "Couldn't save");
      router.refresh();
    });
  return { pending, run };
}

export function ScreenPlain({ screen }: { screen: Screen }) {
  const ws = useWorkspace();
  const rel = relations(ws.blueprint);
  const agents = [...(rel.screenAgents.get(screen.id) ?? [])].map((id) => ws.blueprint.agents.find((a) => a.id === id)!).filter(Boolean);
  const ents = [...(rel.screenEntities.get(screen.id) ?? [])].map((id) => ws.blueprint.entities.find((e) => e.id === id)!).filter(Boolean);
  return (
    <div>
      <div className="mt-1 overflow-hidden rounded-lg border border-hairline bg-white/[0.02] p-3">
        <ScreenThumb screen={screen} large />
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-foreground/90">{screen.plain}</p>
      <p className="mt-2 text-[12.5px] text-muted-foreground">{screenSummary(ws.blueprint, screen)}</p>
      <Section title="Who sees it">
        <p className="text-[12.5px]">{screen.audience === "customer" ? "Your customers. No sign-in needed for this screen." : screen.audience === "admin" ? "Admins only." : "Your team, after signing in."}</p>
      </Section>
      {agents.length > 0 && (
        <Section title="Agents on this screen">
          <ul className="space-y-1.5">
            {agents.map((a) => (
              <li key={a.id}>
                <button onClick={() => ws.select({ type: "agent", id: a.id })} className="flex w-full items-center gap-2.5 rounded-lg border border-hairline bg-deep/60 px-2.5 py-2 text-left hover:border-amber/40">
                  <Avatar name={a.name} hue={a.avatarHue} size={24} />
                  <span className="text-[12.5px]">{a.name}</span>
                  <span className="ml-auto truncate text-[11px] text-muted-foreground">{a.role}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {ents.length > 0 && (
        <Section title="Data shown">
          <p className="text-[12.5px]">{list(ents.map((e) => e.plural))}</p>
        </Section>
      )}
      <Button asChild variant="outline" size="sm" className="mt-5 w-full">
        <Link href={`/p/${ws.project.id}/preview?screen=${screen.id}`}>Open it in Preview <ArrowRight /></Link>
      </Button>
    </div>
  );
}

export function ScreenSpec({ screen }: { screen: Screen }) {
  const ws = useWorkspace();
  const { pending, run } = useSave();
  const [title, setTitle] = useState(screen.title);
  const [purpose, setPurpose] = useState(screen.purpose);
  const dirty = title !== screen.title || purpose !== screen.purpose;
  return (
    <div>
      <Section title="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Section>
      <Section title="Purpose">
        <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </Section>
      {dirty && (
        <Button size="sm" className="mt-2 h-7" disabled={pending} onClick={() => run(() => updateScreenText(ws.project.id, screen.id, { title, purpose }), "Screen updated")}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Save · free
        </Button>
      )}
      <Section title={`Layout · ${screen.layout}`}>
        <ol className="space-y-1.5">
          {allBlocks(screen).map((b) => (
            <li key={b.id}>
              <button onClick={() => ws.select({ type: "block", id: b.id })} className="flex w-full items-center gap-2 rounded-lg border border-hairline bg-deep/60 px-2.5 py-1.5 text-left text-[12px] hover:border-amber/40">
                <span className="font-mono text-[10.5px] text-faint">{screen.regions.main.includes(b) ? "main" : "side"}</span>
                <span className="text-muted-foreground">{BLOCK_LABELS[b.type]}</span>
                <span className="ml-auto truncate">{blockTitle(b)}</span>
              </button>
            </li>
          ))}
        </ol>
      </Section>
      <Section title="Identifiers">
        <p className="font-mono text-[11.5px] text-muted-foreground">id: {screen.id} · route: /{screen.slug} · audience: {screen.audience}</p>
      </Section>
    </div>
  );
}

export function EntityPlain({ entity }: { entity: Entity }) {
  const ws = useWorkspace();
  const cols = entity.fields.slice(0, 3);
  return (
    <div>
      <p className="mt-1 text-[13px] leading-relaxed text-foreground/90">{entity.plain}</p>
      <p className="mt-2 text-[12.5px] text-muted-foreground">{entitySummary(ws.blueprint, entity)}</p>
      <Section title={`Sample records · ${entity.sample.length}`} aside={<span className="text-[11px] text-faint">test version only</span>}>
        <div className="overflow-hidden rounded-lg border border-hairline">
          <table className="w-full text-left text-[11.5px]">
            <thead className="bg-deep text-muted-foreground">
              <tr>{cols.map((f) => <th key={f.name} className="px-2 py-1.5 font-medium">{f.label ?? f.name}</th>)}</tr>
            </thead>
            <tbody>
              {entity.sample.slice(0, 5).map((row, i) => (
                <tr key={i} className="border-t border-hairline">
                  {cols.map((f) => <td key={f.name} className="max-w-[110px] truncate px-2 py-1.5">{formatValue(row[f.name], f.type)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Who can see it">
        <p className="text-[12.5px]">People on your team only. Every table has row-level security on.</p>
      </Section>
    </div>
  );
}

export function EntitySpec({ entity }: { entity: Entity }) {
  return (
    <div>
      <Section title={`Fields · ${entity.fields.length}`}>
        <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline">
          {entity.fields.map((f) => (
            <li key={f.name} className="flex items-center gap-2 bg-deep/60 px-2.5 py-1.5 text-[12px]">
              <span className="font-mono">{f.name}</span>
              <span className="ml-auto rounded bg-raised px-1.5 font-mono text-[10.5px] text-muted-foreground">{f.type}</span>
            </li>
          ))}
        </ul>
      </Section>
      {entity.fields.some((f) => f.options) && (
        <Section title="Allowed values">
          <div className="space-y-2">
            {entity.fields.filter((f) => f.options).map((f) => (
              <p key={f.name} className="text-[12px]"><span className="font-mono text-muted-foreground">{f.name}:</span> {f.options!.join(" · ")}</p>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

export function ConnectionPlain({ connection }: { connection: Connection }) {
  const ws = useWorkspace();
  const { pending, run } = useSave();
  return (
    <div>
      <div className="mt-1 flex items-center gap-3 rounded-lg border border-hairline bg-deep/60 p-3">
        <ConnectionIcon kind={connection.kind} className="size-5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">{connection.name}</p>
          <p className={cn("text-[12px]", connection.status === "configured" ? "text-read" : "text-amber")}>{connection.status === "configured" ? "Connected" : "Not connected · test data"}</p>
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-foreground/90">{connectionSummary(ws.blueprint, connection)}</p>
      {connection.status === "missing" && (
        <div className="mt-4 rounded-lg border border-amber/30 bg-amber-soft p-3">
          <p className="text-[12.5px]">Don&apos;t have the key? Ask a teammate. They&apos;ll get this connection and exactly where it&apos;s used.</p>
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" className="h-7" disabled={pending} onClick={() => run(() => setConnectionStatus(ws.project.id, connection.id, "configured"), `${connection.name} connected (sandbox)`)}>
              <KeyRound /> Add a sandbox key
            </Button>
            <Button size="sm" variant="outline" className="h-7" onClick={() => ws.openHandoff({ type: "connection", id: connection.id })}>Ask a teammate</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ConnectionSpec({ connection }: { connection: Connection }) {
  const ws = useWorkspace();
  const users = ws.blueprint.agents.flatMap((a) => a.tools.filter((t) => t.connectionId === connection.id).map((t) => ({ a, t })));
  return (
    <div>
      <Section title="Settings">
        <dl className="grid grid-cols-2 gap-2 text-[12px]">
          <div className="rounded-lg border border-hairline bg-deep/60 p-2"><dt className="text-muted-foreground">Kind</dt><dd className="font-mono">{connection.kind}</dd></div>
          <div className="rounded-lg border border-hairline bg-deep/60 p-2"><dt className="text-muted-foreground">Auth</dt><dd className="font-mono">{connection.auth}</dd></div>
          <div className="rounded-lg border border-hairline bg-deep/60 p-2"><dt className="text-muted-foreground">Status</dt><dd className="font-mono">{connection.status}</dd></div>
          <div className="rounded-lg border border-hairline bg-deep/60 p-2"><dt className="text-muted-foreground">Id</dt><dd className="truncate font-mono">{connection.id}</dd></div>
        </dl>
      </Section>
      <Section title="Tools that use it">
        <ul className="space-y-1.5 text-[12px]">
          {users.length ? users.map(({ a, t }) => <li key={a.id + t.id} className="font-mono text-muted-foreground">{a.id}.{t.id} <span className="text-foreground">({t.access}, {t.permission})</span></li>) : <li className="text-muted-foreground">None</li>}
        </ul>
      </Section>
    </div>
  );
}

export function BlockPlain({ block, screen }: { block: Block; screen: Screen }) {
  const ws = useWorkspace();
  const entity = "entityId" in block && block.entityId ? ws.blueprint.entities.find((e) => e.id === block.entityId) : undefined;
  const agent = block.type === "chat" ? ws.blueprint.agents.find((a) => a.id === block.agentId) : undefined;
  const text =
    block.type === "table" ? `A table of ${entity?.plural.toLowerCase()} showing ${list(block.columns.map((c) => entity?.fields.find((f) => f.name === c)?.label ?? c))}${block.filters.length ? `, filterable by ${list(block.filters)}` : ""}.`
    : block.type === "chat" ? `A chat with ${agent?.name}. It follows ${agent?.name}'s rules and permissions.`
    : block.type === "kpis" ? `${block.items.length} headline numbers: ${list(block.items.map((i) => i.label))}.`
    : block.type === "form" ? `A form with ${block.fields.length} questions. Submitting it ${block.onSubmit.kind === "agent" ? "hands it to an agent" : "saves it"}.`
    : block.type === "detail" ? `One ${entity?.name.toLowerCase()} at a time, with ${block.actions.length} action button${block.actions.length === 1 ? "" : "s"}.`
    : `${BLOCK_LABELS[block.type]}.`;
  return (
    <div>
      <p className="mt-1 text-[13px] leading-relaxed">{text}</p>
      <p className="mt-2 text-[12px] text-muted-foreground">On {screen.title}. Tip: in Preview, hover it and choose Tweak to edit it for free.</p>
      <Button asChild variant="outline" size="sm" className="mt-4 w-full">
        <Link href={`/p/${ws.project.id}/preview?screen=${screen.id}&tweak=${block.id}`}>Tweak it in Preview <ArrowRight /></Link>
      </Button>
    </div>
  );
}

export function BlockSpec({ block }: { block: Block }) {
  return (
    <Section title="Block settings">
      <pre className="code-face overflow-auto rounded-lg border border-hairline p-3 text-[11.5px] leading-relaxed text-foreground/85">{JSON.stringify(block, null, 2)}</pre>
    </Section>
  );
}

export function BriefPlain() {
  const ws = useWorkspace();
  const bp = ws.blueprint;
  return (
    <div>
      <p className="mt-1 text-[13px] font-medium">{bp.meta.tagline}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-foreground/90">{bp.meta.plain}</p>
      <Section title="What's in it">
        <dl className="grid grid-cols-2 gap-2 text-[12.5px]">
          {[["Screens", bp.screens.length], ["Agents", bp.agents.length], ["Kinds of data", bp.entities.length], ["Connections", bp.connections.length]].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-hairline bg-deep/60 p-2.5"><dt className="text-[11px] text-muted-foreground">{k}</dt><dd className="text-lg font-semibold tabular-nums">{v}</dd></div>
          ))}
        </dl>
      </Section>
      <Section title="Estimate to build">
        <p className="text-[12.5px]">~{bp.estimate.minutes} min · {bp.estimate.credits} credits (≈ {creditsUsd(bp.estimate.credits)}) · {bp.estimate.files} files · confidence {bp.estimate.confidence}</p>
      </Section>
    </div>
  );
}

export function BriefSpec() {
  const ws = useWorkspace();
  const { pending, run } = useSave();
  const [primary, setPrimary] = useState(ws.blueprint.meta.theme.primary);
  const swatches = ["#0F766E", "#4F46E5", "#0369A1", "#7C3AED", "#B45309", "#BE123C", "#111827"];
  return (
    <div>
      <Section title="Brand colour of the app">
        <div className="flex flex-wrap gap-2">
          {swatches.map((c) => (
            <button key={c} aria-label={`Use ${c}`} onClick={() => { setPrimary(c); run(() => setTheme(ws.project.id, { primary: c }), `Brand colour ${c}`); }} className={cn("size-7 rounded-md border-2", primary === c ? "border-foreground" : "border-transparent")} style={{ background: c }} />
          ))}
        </div>
        {pending && <Loader2 className="mt-2 size-3.5 animate-spin text-muted-foreground" />}
      </Section>
      <Section title="Sign-in">
        <p className="text-[12.5px]">{ws.blueprint.meta.auth.enabled ? `On · ${signInMethods(ws.blueprint.meta.auth.providers)}` : "Off"}</p>
      </Section>
      <Section title="Data region">
        <p className="text-[12.5px] uppercase">{ws.blueprint.meta.region}</p>
      </Section>
    </div>
  );
}
