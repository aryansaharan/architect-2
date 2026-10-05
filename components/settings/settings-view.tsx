"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CircleAlert, Cloud, Container, Eye, EyeOff, KeyRound, Loader2, Plug, Server, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { ConnectionIcon } from "@/components/icon";
import { GitHubMark } from "@/components/brand/logo";
import { setBudgetCap, toggleIntegration } from "@/lib/actions/settings";
import type { UsageSummary } from "@/lib/db/queries";
import { formatCredits } from "@/lib/format";
import { resetWords, type CreditMeter } from "@/lib/prices";
import { MeterBar, PriceList, meterWords } from "@/components/credits";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "usage", label: "Usage & budget" },
  { id: "connections", label: "Connections" },
  { id: "keys", label: "Keys & passwords" },
  { id: "team", label: "Team & roles" },
  { id: "deploy", label: "Deploy targets" },
  { id: "account", label: "Account" },
];

// Quotes are logged at 0 credits (they're free), so paid "llm" events are plans by Claude and AI helpers it wrote.
// Builds cost credits only under the earlier pricing; making it real is free now.
const KIND_LABEL: Record<string, string> = { llm: "Plans and new AI helpers by Claude", build: "Builds, under the earlier pricing", change: "Changes Claude wrote", agent_run: "AI helper messages", import: "Repos imported by Claude", refund: "Refunds", tweak: "Tweaks" };

const CATALOG = [
  { provider: "github", name: "GitHub", body: "Two-way sync, a branch per change, test runs on every change." },
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

/** Credits in running text are written out ("12 credits"); "cr" is only for pills and counters. */
const creditText = (n: number) => formatCredits(n).replace(/ cr$/, " credits");

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
  credits,
  projects,
  connections,
}: {
  user: { name: string; email: string | null; isAnonymous: boolean; provider: string | null };
  integrations: { provider: string; status: string }[];
  month: UsageSummary;
  credits: CreditMeter;
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
  // Every connection the list above says "needs a key", plus the keys already set, so the two never disagree.
  const keyed = connections.filter((c) => c.auth === "api_key" || !isConnected(c));

  async function copyInvite() {
    const link = `${window.location.origin}/login?next=%2Fhome&invite=${Math.random().toString(36).slice(2, 10)}`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(link);
      setInvite({ link, copied: true });
      toast.success("Invite link copied", { description: "It opens sign-in. Workspace roles aren't enforced yet: to share an app, invite people from its Publish tab." });
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
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-8 sm:px-6 sm:py-10 md:grid-cols-[200px_1fr]">
      <nav className="sticky top-24 hidden h-fit space-y-0.5 md:block" aria-label="Settings sections">
        <p className="px-2.5 pb-3 font-pencil text-title">Settings</p>
        {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`} className="block rounded-md px-2.5 py-1.5 text-ui text-muted-foreground transition-colors duration-150 hover:bg-panel hover:text-foreground">{s.label}</a>)}
      </nav>
      <main id="main" className="min-w-0 space-y-12">
        {/* Phones: the title and the sections as one row of links, so the long page has a way around. */}
        <div className="md:hidden">
          <h1 className="font-pencil text-title">Settings</h1>
          <nav aria-label="Settings sections" className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1">
            {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`} className="shrink-0 rounded-full border border-hairline bg-panel px-3 py-1 text-meta text-muted-foreground transition-colors duration-150 hover:border-line-strong hover:text-foreground">{s.label}</a>)}
          </nav>
        </div>

        <section id="usage" className="scroll-mt-24">
          <h2 className="font-pencil text-section">Usage &amp; budget</h2>
          <p className="mt-2 text-ui text-muted-foreground">Only work Claude does costs credits, and you see the price before it runs. Every credit is attributed here.</p>
          <div className="panel mt-5 grid rounded-md lg:grid-cols-2">
            <div className="p-4">
              <p className="micro-label">Your free credits · this month</p>
              {credits.guest ? (
                <>
                  <p className="mt-1.5 text-body">Guests use the free starter plans, so nothing costs credits.</p>
                  <p className="mt-1 text-ui text-muted-foreground">Sign in for {credits.memberAllowance} free credits a month, and Claude plans your apps, writes changes and answers as your AI helpers.</p>
                  <Button asChild variant="outline" className="mt-3">
                    <Link href="/login?next=/settings">Sign in for free credits</Link>
                  </Button>
                </>
              ) : (
                <>
                  <p className="mt-1.5 text-lead font-semibold tabular-nums">
                    {meterWords(credits)} <span className="text-ui font-normal text-muted-foreground">used · {Math.floor(credits.left)} left</span>
                  </p>
                  <MeterBar m={credits} className="mt-2" />
                  <p className="mt-2 text-meta tabular-nums text-muted-foreground">
                    {credits.allowance} free credits every month. {resetWords(credits.resetsOn)}
                  </p>
                </>
              )}
              <ul className="mt-4 space-y-2.5">
                {kinds.map(([k, v]) => (
                  <li key={k} className="text-ui">
                    <div className="flex justify-between gap-3"><span>{KIND_LABEL[k] ?? k}</span><span className={cn("tabular-nums", v < 0 && "text-ok")}>{v < 0 ? "−" : ""}{creditText(Math.abs(v))}</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-deep"><div className={cn("h-full rounded-full", v < 0 ? "bg-ok/60" : "bg-brand/70")} style={{ width: `${(Math.abs(v) / maxKind) * 100}%` }} /></div>
                  </li>
                ))}
                {kinds.length === 0 && <li className="text-ui text-muted-foreground">Nothing spent yet.</li>}
              </ul>
            </div>
            <div className="border-hairline p-4 max-lg:border-t lg:border-l">
              <p className="micro-label">What costs credits</p>
              <PriceList className="mt-3" />
              <p className="micro-label mt-6">By AI helper · messages</p>
              <ul className="mt-3 space-y-1.5 text-ui">
                {agents.map(([id, v]) => <li key={id} className="flex justify-between gap-3"><span className="truncate">{agentNames[id] ?? id}</span><span className="shrink-0 tabular-nums">{creditText(v)}</span></li>)}
                {agents.length === 0 && <li className="text-muted-foreground">No messages yet. Try a helper from its Try it panel.</li>}
              </ul>
            </div>
          </div>
          <div className="panel mt-3 rounded-md">
            <div className="border-b border-hairline px-4 py-3">
              <p className="text-ui font-medium">Spending caps · optional, per project</p>
              <p className="mt-0.5 text-meta text-muted-foreground">
                An extra limit for one project, on top of your monthly credits. Past it, that project stops using credits and says so: changes wait and AI helpers pause or answer from their script, even with credits left.
              </p>
            </div>
            <ul className="divide-y divide-hairline">
              {projects.map((p) => {
                const pct = Math.min(1, p.used / Math.max(1, p.cap));
                const err = capError(caps[p.id] ?? "");
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <Link href={`/p/${p.id}/blueprint`} className="min-w-0 flex-1 basis-40 truncate text-ui underline decoration-hairline-hi decoration-dotted underline-offset-4 transition-colors duration-150 hover:decoration-current">{p.name}</Link>
                    <span className="w-40">
                      <span className="block h-1.5 overflow-hidden rounded-full bg-deep"><span className={cn("block h-full rounded-full", pct > 0.9 ? "bg-foreground/70" : "bg-brand/70")} style={{ width: `${Math.max(2, pct * 100)}%` }} /></span>
                      <span className="mt-1 block text-meta tabular-nums text-muted-foreground">{Math.round(p.used)} of {p.cap} credits this month</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-ui text-muted-foreground">
                        Cap
                        <Input type="number" min={10} max={100000} className="w-24 tabular-nums" value={caps[p.id]} onChange={(e) => setCaps((c) => ({ ...c, [p.id]: e.target.value }))} aria-label={`Cap for ${p.name}`} aria-invalid={err ? true : undefined} aria-describedby={err ? `cap-err-${p.id}` : undefined} />
                      </label>
                      <Button variant="outline" disabled={pending || Boolean(err) || Number(caps[p.id]) === p.cap} onClick={() => start(async () => { const r = await setBudgetCap(p.id, Number(caps[p.id])); if (r.ok && r.warning) toast.warning(`Cap set to ${r.value} credits`, { description: r.warning }); else if (r.ok) toast.success(`Cap set to ${r.value} credits`); else toast.error(r.error); router.refresh(); })}>Save</Button>
                    </span>
                    {err && <p id={`cap-err-${p.id}`} className="flex basis-full items-center justify-end gap-1.5 text-meta font-medium text-foreground"><CircleAlert className="size-3.5" aria-hidden />{err}</p>}
                  </li>
                );
              })}
              {projects.length === 0 && <li className="px-4 py-4 text-ui text-muted-foreground">No projects yet.</li>}
            </ul>
          </div>
        </section>

        <section id="connections" className="scroll-mt-24">
          <h2 className="font-pencil text-section">Connections</h2>
          <p className="mt-2 text-ui text-muted-foreground">What your AI helpers may reach. Each connection says in plain English what it allows. Email is real once it&apos;s set up; the others run on test data for now.</p>
          <ul className="panel mt-5 grid rounded-md lg:grid-cols-2">
            {CATALOG.map((c, i) => {
              const account = connected.has(c.provider);
              const via = connectedIn(c.provider);
              const on = account || via.length > 0;
              // Connected only inside a project: it's managed there, so this row shows it but doesn't toggle it.
              const projectOnly = on && !account;
              return (
                <li key={c.provider} className={cn("flex items-center gap-3 border-hairline px-4 py-3", i > 0 && "max-lg:border-t", i > 1 && "lg:border-t", i % 2 === 1 && "lg:border-l")}>
                  <span className="grid size-7 shrink-0 place-items-center rounded-md border border-hairline bg-canvas">{c.provider === "github" ? <GitHubMark className="size-3.5" /> : <Plug className="size-3.5 text-muted-foreground" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-ui font-medium">{c.name}</span>
                    <span className="block text-meta text-muted-foreground">{c.body}</span>
                    {projectOnly && <span className="block truncate text-meta text-faint" title={via.join(", ")}>In {via[0]}{via.length > 1 ? ` and ${via.length - 1} more` : ""}</span>}
                  </span>
                  {/* Quiet on purpose: eight bright buttons in a row would shout. Connected reads as a status. */}
                  <Button size="sm" variant={on ? "ghost" : "outline"} className={cn("shrink-0", on && "text-ok hover:text-ok")} disabled={pending || projectOnly} title={projectOnly ? "Connected inside a project. Manage it from that project's plan." : account ? `Disconnect ${c.name}` : undefined} onClick={() => start(async () => { await toggleIntegration(c.provider, !account); toast.success(account ? `${c.name} disconnected` : `${c.name} connected (sandbox)`); router.refresh(); })}>
                    {on ? <><Check /> Connected</> : "Connect"}
                  </Button>
                </li>
              );
            })}
          </ul>
          {connections.length > 0 && (
            <div className="panel mt-3 rounded-md">
              <p className="border-b border-hairline px-4 py-3 text-ui font-medium">Used by your projects</p>
              <ul className="divide-y divide-hairline">
                {connections.map((c) => {
                  const ok = isConnected(c);
                  return (
                    <li key={c.name} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-ui">
                      <ConnectionIcon kind={c.kind} className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">{c.name}</span>
                      <span className="text-meta text-muted-foreground max-sm:hidden">{c.project}</span>
                      {ok ? <Pill tone="ok" dot>Connected</Pill> : <Pill>Needs a key</Pill>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        <section id="keys" className="scroll-mt-24">
          <h2 className="font-pencil text-section">Keys &amp; passwords</h2>
          <p className="mt-2 text-ui text-muted-foreground">Private keys for other services. Encrypted at rest, never shown in logs, never sent to a model.</p>
          <ul className="panel mt-5 divide-y divide-hairline rounded-md">
            {keyed.map((c) => (
              <li key={c.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-ui">
                <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-badge sm:w-60 sm:flex-none">{c.name.toUpperCase().replace(/\(.*?\)/g, "").replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "")}{c.auth === "oauth" ? "_TOKEN" : "_API_KEY"}</span>
                <span className="flex items-center gap-1 sm:flex-1">
                  {isConnected(c) ? <span className="font-mono text-badge text-muted-foreground">{reveal === c.name ? "sk_sandbox_4f1a…9c2e" : "••••••••••••••••"}</span> : <Pill>Not set</Pill>}
                  {isConnected(c) && (
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => setReveal(reveal === c.name ? null : c.name)} aria-label={reveal === c.name ? "Hide the key" : "Show the key"}>
                      {reveal === c.name ? <EyeOff /> : <Eye />}
                    </Button>
                  )}
                </span>
              </li>
            ))}
            {keyed.length === 0 && <li className="px-4 py-4 text-ui text-muted-foreground">No keys needed yet.</li>}
          </ul>
        </section>

        <section id="team" className="scroll-mt-24">
          <h2 className="font-pencil text-section">Team &amp; roles</h2>
          <p className="mt-2 text-ui text-muted-foreground">Not everyone should be able to change everything.</p>
          <div className="panel mt-5 rounded-md">
            <ul className="divide-y divide-hairline text-ui">
              <li className="flex items-center gap-3 px-4 py-2.5"><span className="min-w-0 flex-1 truncate">{user.name}{user.email ? ` · ${user.email}` : ""}</span><span className="font-medium">Owner</span></li>
              <li className="flex items-center gap-3 px-4 py-2.5"><span className="min-w-0 flex-1 truncate">Priya Raman · Platform engineer</span><span className="text-muted-foreground">Editor</span></li>
              <li className="flex items-center gap-3 px-4 py-2.5"><span className="min-w-0 flex-1 truncate">Maya Singh · Claims lead</span><span className="text-muted-foreground">Viewer</span></li>
            </ul>
            <dl className="grid gap-3 border-t border-hairline bg-canvas/60 px-4 py-3 md:grid-cols-3">
              {[
                { role: "Owner", body: "Everything, including billing, caps and going live." },
                { role: "Editor", body: "Change plans, approve priced changes, try AI helpers. Can't raise caps." },
                { role: "Viewer", body: "Use the test version, comment, and approve AI helper actions. Can't change anything." },
              ].map((r) => (
                <div key={r.role}>
                  <dt className="text-meta font-medium">{r.role}</dt>
                  <dd className="text-meta text-muted-foreground">{r.body}</dd>
                </div>
              ))}
            </dl>
          </div>
          <Button variant="outline" className="mt-3" onClick={() => void copyInvite()}><UserRoundPlus /> Invite someone</Button>
          {invite && (
            <div className="mt-2.5 max-w-lg">
              <label htmlFor="invite-link" className="text-meta text-muted-foreground">{invite.copied ? "Copied to your clipboard. Sandbox: it opens sign-in." : "Copy this link and send it. Sandbox: it opens sign-in."}</label>
              <Input id="invite-link" readOnly value={invite.link} onFocus={(e) => e.currentTarget.select()} className="mt-1 font-mono text-code" />
            </div>
          )}
        </section>

        <section id="deploy" className="scroll-mt-24">
          <h2 className="font-pencil text-section">Deploy targets</h2>
          <ul className="panel mt-5 divide-y divide-hairline rounded-md">
            {[
              { icon: Cloud, name: "Prod Cloud", body: "Managed and instant. Published apps run here today.", on: true },
              { icon: Server, name: "Vercel", body: "Your team, your deploy previews.", on: connected.has("vercel") },
              { icon: Container, name: "Your VPC / on-prem", body: "Docker bundle and runtime images for your AI helpers.", on: false },
            ].map((t) => (
              <li key={t.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <t.icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 basis-52">
                  <span className="block text-ui font-medium">{t.name}</span>
                  <span className="block text-meta text-muted-foreground">{t.body}</span>
                </span>
                {t.on ? <Pill tone="ok" dot>Ready</Pill> : <span className="text-meta text-muted-foreground">Set up from a project&apos;s Publish page</span>}
              </li>
            ))}
          </ul>
        </section>

        <section id="account" className="scroll-mt-24">
          <h2 className="font-pencil text-section">Account</h2>
          <div className="panel mt-5 rounded-md p-4 text-ui">
            <p>{user.isAnonymous ? "You're a guest. Your work is saved in this browser session." : `Signed in${user.provider ? ` with ${user.provider}` : ""}${user.email ? ` as ${user.email}` : ""}.`}</p>
            {user.isAnonymous && <Button asChild className="mt-3"><Link href="/login?next=/settings">Sign in to keep this work</Link></Button>}
          </div>
        </section>
      </main>
      {pending && <Loader2 className="fixed bottom-6 right-6 size-5 animate-spin text-brand" aria-label="Saving" />}
    </div>
  );
}
