"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Cloud, Container, Eye, EyeOff, KeyRound, Loader2, Plug, Server, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConnectionIcon } from "@/components/icon";
import { GitHubMark } from "@/components/brand/logo";
import { setBudgetCap, toggleIntegration } from "@/lib/actions/settings";
import type { UsageSummary } from "@/lib/db/queries";
import { creditsUsd, formatCredits } from "@/lib/format";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "usage", label: "Usage & budget" },
  { id: "connections", label: "Connections" },
  { id: "keys", label: "Keys & passwords" },
  { id: "team", label: "Team & roles" },
  { id: "deploy", label: "Deploy targets" },
  { id: "account", label: "Account" },
];

// Planning and quotes are logged at 0 credits (they're free), so paid "llm" events are agents drafted from a description.
const KIND_LABEL: Record<string, string> = { llm: "Drafting new AI helpers", build: "Builds", change: "Changes", agent_run: "AI helper conversations", import: "Imports", refund: "Refunds", tweak: "Tweaks" };

const CATALOG = [
  { provider: "github", name: "GitHub", body: "Two-way sync, branch per change, CI rehearsals." },
  { provider: "gmail", name: "Gmail", body: "AI helpers draft and send email. Sending always asks first." },
  { provider: "slack", name: "Slack", body: "Post updates and approvals to channels." },
  { provider: "hubspot", name: "HubSpot", body: "Read and update CRM records." },
  { provider: "jira", name: "Jira", body: "Create and triage issues." },
  { provider: "google-drive", name: "Google Drive", body: "Give AI helpers documents to read." },
  { provider: "notion", name: "Notion", body: "Knowledge bases and runbooks." },
  { provider: "mcp", name: "Any MCP server", body: "Bring tools from your own MCP servers." },
];

/** Which catalog entry a project connection belongs to: by product name, or any MCP server by kind. */
function providerOf(c: { name: string; kind: string }): string | null {
  if (c.kind === "mcp") return "mcp";
  const n = c.name.toLowerCase();
  return CATALOG.find((x) => x.provider !== "mcp" && n.includes(x.name.toLowerCase()))?.provider ?? null;
}

function capError(v: string): string | null {
  const n = Number(v);
  if (!v.trim() || !Number.isFinite(n)) return "Enter a number of credits.";
  if (Math.round(n) < 10) return "Minimum is 10 credits.";
  if (Math.round(n) > 100000) return "Maximum is 100,000 credits.";
  return null;
}

export function SettingsView({
  user,
  integrations,
  month,
  projects,
  connections,
}: {
  user: { name: string; email: string | null; isAnonymous: boolean; provider: string | null };
  integrations: { provider: string; status: string }[];
  month: UsageSummary;
  projects: { id: string; name: string; cap: number; used: number; agents: { id: string; name: string }[] }[];
  connections: { name: string; kind: string; auth: string; status: string; project: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [caps, setCaps] = useState<Record<string, string>>(Object.fromEntries(projects.map((p) => [p.id, String(p.cap)])));
  const [reveal, setReveal] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ link: string; copied: boolean } | null>(null);
  // One source of truth for "connected": a sandbox connection on your account, or a project connection that has its key.
  const connected = new Set(integrations.map((i) => i.provider));
  const connectedIn = (provider: string) => [...new Set(connections.filter((c) => c.status === "configured" && providerOf(c) === provider).map((c) => c.project))];
  const isConnected = (c: { name: string; kind: string; status: string }) => {
    const p = providerOf(c);
    return c.status === "configured" || (p !== null && connected.has(p));
  };

  async function copyInvite() {
    const link = `${window.location.origin}/login?next=%2Fhome&invite=${Math.random().toString(36).slice(2, 10)}`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(link);
      setInvite({ link, copied: true });
      toast.success("Invite link copied", { description: "Sandbox: it opens sign-in. Roles are simulated in this prototype." });
    } catch {
      setInvite({ link, copied: false });
      toast.message("Copy the invite link below", { description: "Your browser didn't allow copying automatically." });
    }
  }
  const kinds = Object.entries(month.byKind).filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);
  const maxKind = Math.max(1, ...kinds.map(([, v]) => Math.abs(v)));
  const agentNames = Object.fromEntries(projects.flatMap((p) => p.agents.map((a) => [a.id, a.name])));
  const agents = Object.entries(month.byAgent).sort((a, b) => b[1] - a[1]);

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-6 py-10 md:grid-cols-[200px_1fr]">
      <nav className="sticky top-24 hidden h-fit space-y-0.5 md:block" aria-label="Settings sections">
        <p className="px-2.5 pb-2 font-pencil text-[34px] leading-none">Settings</p>
        {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`} className="block rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground hover:bg-panel hover:text-foreground">{s.label}</a>)}
      </nav>
      <main id="main" className="min-w-0 space-y-12">
        <section id="usage" className="scroll-mt-24">
          <h2 className="font-pencil text-[32px] leading-none">Usage &amp; budget</h2>
          <p className="mt-2 text-[13px] text-muted-foreground">Every credit is attributed. Planning, quotes and fixes for our own mistakes are free and never show up here.</p>
          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="panel rounded-md p-4">
              <p className="text-[12.5px] text-muted-foreground">This month</p>
              <p className="mt-1 font-pencil text-[40px] leading-none tabular-nums">{formatCredits(month.credits)} <span className="font-sans text-[13px] text-muted-foreground">≈ {creditsUsd(month.credits)} · real model spend {creditsUsd(month.costUsd * 100)}</span></p>
              <ul className="mt-4 space-y-2">
                {kinds.map(([k, v]) => (
                  <li key={k} className="text-[12.5px]">
                    <div className="flex justify-between"><span>{KIND_LABEL[k] ?? k}</span><span className={cn("font-mono", v < 0 && "text-read")}>{v < 0 ? "−" : ""}{formatCredits(Math.abs(v))}</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-deep"><div className={cn("h-full rounded-full", v < 0 ? "bg-read" : "bg-amber/70")} style={{ width: `${(Math.abs(v) / maxKind) * 100}%` }} /></div>
                  </li>
                ))}
                {kinds.length === 0 && <li className="text-[12.5px] text-muted-foreground">Nothing spent yet.</li>}
              </ul>
            </div>
            <div className="panel rounded-md p-4">
              <p className="text-[12.5px] text-muted-foreground">By AI helper (conversations)</p>
              <ul className="mt-3 space-y-1.5 text-[12.5px]">
                {agents.map(([id, v]) => <li key={id} className="flex justify-between"><span>{agentNames[id] ?? id}</span><span className="font-mono">{formatCredits(v)}</span></li>)}
                {agents.length === 0 && <li className="text-muted-foreground">No conversations yet. Try a helper from its Try it panel.</li>}
              </ul>
            </div>
          </div>
          <div className="panel mt-4 rounded-md">
            <p className="border-b border-hairline px-4 py-3 text-[13px] font-medium">Spending caps · per project, per month</p>
            <ul className="divide-y divide-hairline">
              {projects.map((p) => {
                const pct = Math.min(1, p.used / Math.max(1, p.cap));
                const err = capError(caps[p.id] ?? "");
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <Link href={`/p/${p.id}/blueprint`} className="min-w-0 flex-1 truncate text-[13px] hover:underline">{p.name}</Link>
                    <span className="w-40">
                      <span className="block h-1.5 overflow-hidden rounded-full bg-deep"><span className={cn("block h-full rounded-full", pct > 0.9 ? "bg-foreground/70" : "bg-amber/70")} style={{ width: `${Math.max(2, pct * 100)}%` }} /></span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">{Math.round(p.used)} of {p.cap} credits</span>
                    </span>
                    <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      Cap
                      <Input type="number" min={10} max={100000} className="h-8 w-24" value={caps[p.id]} onChange={(e) => setCaps((c) => ({ ...c, [p.id]: e.target.value }))} aria-label={`Cap for ${p.name}`} aria-invalid={err ? true : undefined} aria-describedby={err ? `cap-err-${p.id}` : undefined} />
                    </label>
                    <Button size="sm" variant="outline" className="h-8" disabled={pending || Boolean(err) || Number(caps[p.id]) === p.cap} onClick={() => start(async () => { const r = await setBudgetCap(p.id, Number(caps[p.id])); if (r.ok && r.warning) toast.warning(`Cap set to ${r.value} credits a month`, { description: r.warning }); else if (r.ok) toast.success(`Cap set to ${r.value} credits a month`); else toast.error(r.error); router.refresh(); })}>Save</Button>
                    {err && <p id={`cap-err-${p.id}`} className="basis-full text-right text-[11.5px] font-medium text-foreground/85">{err}</p>}
                  </li>
                );
              })}
              {projects.length === 0 && <li className="px-4 py-4 text-[12.5px] text-muted-foreground">No projects yet.</li>}
            </ul>
          </div>
        </section>

        <section id="connections" className="scroll-mt-24">
          <h2 className="font-pencil text-[32px] leading-none">Connections</h2>
          <p className="mt-2 text-[13px] text-muted-foreground">What your AI helpers may reach. Each connection says in plain English what it allows. Sandbox in this prototype.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CATALOG.map((c) => {
              const account = connected.has(c.provider);
              const via = connectedIn(c.provider);
              const on = account || via.length > 0;
              // Connected only inside a project: it's managed there, so this card shows it but doesn't toggle it.
              const projectOnly = on && !account;
              return (
                <div key={c.provider} className="panel flex flex-col rounded-md p-4">
                  <p className="flex items-center gap-2 text-[13.5px] font-medium">{c.provider === "github" ? <GitHubMark /> : <Plug className="size-4 text-muted-foreground" />}{c.name}</p>
                  <p className="mt-1 flex-1 text-[12px] text-muted-foreground">{c.body}</p>
                  {projectOnly && <p className="mt-2 truncate text-[11px] text-muted-foreground" title={via.join(", ")}>In {via[0]}{via.length > 1 ? ` and ${via.length - 1} more` : ""}</p>}
                  {/* Secondary on purpose: eight bright buttons in a row would shout. Connected cards read as a quiet status. */}
                  <Button size="sm" variant={on ? "ghost" : "outline"} className={cn("mt-3 h-8", on ? "border border-read/25 text-read hover:text-read" : "bg-panel")} disabled={pending || projectOnly} title={projectOnly ? "Connected inside a project. Manage it from that project's plan." : undefined} onClick={() => start(async () => { await toggleIntegration(c.provider, !account); toast.success(account ? `${c.name} disconnected` : `${c.name} connected (sandbox)`); router.refresh(); })}>
                    {on ? <><Check /> Connected</> : "Connect"}
                  </Button>
                </div>
              );
            })}
          </div>
          {connections.length > 0 && (
            <div className="panel mt-4 rounded-md">
              <p className="border-b border-hairline px-4 py-3 text-[13px] font-medium">Used by your projects</p>
              <ul className="divide-y divide-hairline">
                {connections.map((c) => {
                  const ok = isConnected(c);
                  return (
                    <li key={c.name} className="flex items-center gap-3 px-4 py-2.5 text-[12.5px]">
                      <ConnectionIcon kind={c.kind} className="size-3.5 text-muted-foreground" />
                      <span className="flex-1">{c.name}</span>
                      <span className="text-muted-foreground">{c.project}</span>
                      <span className={ok ? "text-read" : "text-muted-foreground"}>{ok ? "connected" : "needs a key"}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        <section id="keys" className="scroll-mt-24">
          <h2 className="font-pencil text-[32px] leading-none">Keys &amp; passwords</h2>
          <p className="mt-2 text-[13px] text-muted-foreground">Private keys for other services. Encrypted at rest, never shown in logs, never sent to a model.</p>
          <ul className="panel mt-5 divide-y divide-hairline rounded-md">
            {connections.filter((c) => c.auth === "api_key").map((c) => (
              <li key={c.name} className="flex items-center gap-3 px-4 py-3 text-[12.5px]">
                <KeyRound className="size-3.5 text-muted-foreground" />
                <span className="w-56 truncate font-mono">{c.name.toUpperCase().replace(/\(.*?\)/g, "").replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "")}_API_KEY</span>
                <span className="flex-1 font-mono text-muted-foreground">{c.status === "configured" ? (reveal === c.name ? "sk_sandbox_4f1a…9c2e" : "••••••••••••••••") : "not set"}</span>
                {c.status === "configured" && <button onClick={() => setReveal(reveal === c.name ? null : c.name)} aria-label="Show or hide" className="text-muted-foreground hover:text-foreground">{reveal === c.name ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</button>}
              </li>
            ))}
            {connections.filter((c) => c.auth === "api_key").length === 0 && <li className="px-4 py-4 text-[12.5px] text-muted-foreground">No keys needed yet.</li>}
          </ul>
        </section>

        <section id="team" className="scroll-mt-24">
          <h2 className="font-pencil text-[32px] leading-none">Team &amp; roles</h2>
          <p className="mt-2 text-[13px] text-muted-foreground">Not everyone should be able to change everything.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              { role: "Owner", body: "Everything, including billing, caps and going live." },
              { role: "Editor", body: "Change plans, approve Work Orders, try AI helpers. Can't raise caps." },
              { role: "Viewer", body: "Use the test version, comment, and approve AI helper actions. Can't change anything." },
            ].map((r) => (
              <div key={r.role} className="panel rounded-md p-4">
                <p className="text-[13.5px] font-medium">{r.role}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">{r.body}</p>
              </div>
            ))}
          </div>
          <ul className="panel mt-4 divide-y divide-hairline rounded-md text-[12.5px]">
            <li className="flex items-center gap-3 px-4 py-2.5"><span className="flex-1">{user.name}{user.email ? ` · ${user.email}` : ""}</span><span className="text-amber">Owner</span></li>
            <li className="flex items-center gap-3 px-4 py-2.5"><span className="flex-1">Priya Raman · Platform engineer</span><span className="text-muted-foreground">Editor</span></li>
            <li className="flex items-center gap-3 px-4 py-2.5"><span className="flex-1">Maya Singh · Claims lead</span><span className="text-muted-foreground">Viewer</span></li>
          </ul>
          <Button variant="outline" size="sm" className="mt-3 bg-panel" onClick={() => void copyInvite()}><UserRoundPlus /> Invite someone</Button>
          {invite && (
            <div className="mt-2.5 max-w-lg">
              <label htmlFor="invite-link" className="text-[11.5px] text-muted-foreground">{invite.copied ? "Copied to your clipboard. Sandbox: it opens sign-in." : "Copy this link and send it. Sandbox: it opens sign-in."}</label>
              <Input id="invite-link" readOnly value={invite.link} onFocus={(e) => e.currentTarget.select()} className="mt-1 h-8 font-mono text-[12px]" />
            </div>
          )}
        </section>

        <section id="deploy" className="scroll-mt-24">
          <h2 className="font-pencil text-[32px] leading-none">Deploy targets</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              { icon: Cloud, name: "Prod Cloud", body: "Managed, instant, regional. Real in this prototype.", on: true },
              { icon: Server, name: "Vercel", body: "Your team, your deploy previews.", on: connected.has("vercel") },
              { icon: Container, name: "Your VPC / on-prem", body: "Docker bundle and runtime images for your AI helpers.", on: false },
            ].map((t) => (
              <div key={t.name} className="panel rounded-md p-4">
                <p className="flex items-center gap-2 text-[13.5px] font-medium"><t.icon className="size-4 text-muted-foreground" />{t.name}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">{t.body}</p>
                <p className={cn("mt-2 text-[11.5px]", t.on ? "text-read" : "text-muted-foreground")}>{t.on ? "Ready" : "Set up from a project's Publish page"}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="account" className="scroll-mt-24">
          <h2 className="font-pencil text-[32px] leading-none">Account</h2>
          <div className="panel mt-5 rounded-md p-4 text-[13px]">
            <p>{user.isAnonymous ? "You're a guest. Your work is saved in this browser session." : `Signed in${user.provider ? ` with ${user.provider}` : ""}${user.email ? ` as ${user.email}` : ""}.`}</p>
            {user.isAnonymous && <Button asChild size="sm" className="mt-3"><Link href="/login?next=/settings">Sign in to keep this work</Link></Button>}
          </div>
        </section>
      </main>
      {pending && <Loader2 className="fixed bottom-6 right-6 size-5 animate-spin text-amber" />}
    </div>
  );
}
