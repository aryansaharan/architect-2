"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, CircleAlert, CircleX, Cloud, Container, Copy, Download, ExternalLink, Globe, Loader2, Rocket, Server, Undo2 } from "lucide-react";
import type { DeploymentRow } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeAgo } from "@/components/time-ago";
import { canGoLive, preflight } from "@/lib/sim/preflight";
import { generateFiles } from "@/lib/codegen/files";
import { fixPreflight, goLive, rollbackTo, takeOffline } from "@/lib/actions/ship";
import { creditsUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";

type Target = DeploymentRow["target"];
const TARGETS: { id: Target; name: string; icon: typeof Cloud; body: string; tag: string }[] = [
  { id: "architect_cloud", name: "Architect Cloud", icon: Cloud, body: "Instant, managed. Agents run with the permissions and caps you set.", tag: "Recommended · real" },
  { id: "vercel", name: "Your Vercel team", icon: Server, body: "Push to your own Vercel project and keep your usual deploy previews.", tag: "Sandbox" },
  { id: "vpc", name: "Your VPC or on-prem", icon: Container, body: "Download a Docker bundle and run everything inside your network.", tag: "Sandbox" },
];

const STEPS = ["Packaging the current save point", "Provisioning the runtime", "Applying the database schema with row-level security", "Registering agents and their approval gates", "Warming up", "Checking the live URL answers"];

export function ShipView({ deployments }: { deployments: DeploymentRow[] }) {
  const ws = useWorkspace();
  const router = useRouter();
  const bp = ws.blueprint;
  const built = ws.project.buildState === "built";
  const checks = useMemo(() => preflight(bp, { budgetCapCredits: ws.project.settings.budgetCapCredits, built, region: ws.project.settings.region }), [bp, ws.project.settings, built]);
  const ready = canGoLive(checks);
  const [target, setTarget] = useState<Target>("architect_cloud");
  const [domain, setDomain] = useState("");
  const [deploying, setDeploying] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [users, setUsers] = useState(1000);
  const live = deployments.find((d) => d.status === "live");
  const perConversation = bp.agents.reduce((s, a) => s + a.cost.creditsPerRun, 0) / Math.max(1, bp.agents.length);
  const monthly = users * 4 * perConversation;

  const fix = (action: Parameters<typeof fixPreflight>[1]) =>
    start(async () => {
      if (action === "build_first") return router.push(`/p/${ws.project.id}/blueprint`);
      const r = await fixPreflight(ws.project.id, action);
      if (r.ok) toast.success("Fixed", { description: "Free · saved as a save point" });
      else toast.error(r.error);
      router.refresh();
    });

  async function deploy() {
    for (let i = 0; i < STEPS.length; i++) {
      setDeploying(i);
      await new Promise((r) => setTimeout(r, 650 + (i % 2) * 250));
    }
    const r = await goLive(ws.project.id, target, domain || undefined);
    setDeploying(null);
    if (!r.ok) return void toast.error(r.error);
    if (target === "architect_cloud") toast.success("You're live", { description: "Anyone with the link can use it. Rollback is one click." });
    else toast.success(target === "vercel" ? "Vercel deploy prepared (sandbox)" : "Bundle ready (sandbox)");
    router.refresh();
  }

  function downloadBundle() {
    const files = generateFiles(bp).filter((f) => ["docker-compose.yml", ".env.example", "README.md", "supabase/schema.sql"].includes(f.path) || f.path.startsWith("agents/"));
    const text = files.map((f) => `# ===== ${f.path} =====\n${f.content}`).join("\n\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${bp.meta.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-bundle.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h2 className="text-[22px] font-semibold tracking-tight">Ship</h2>
        <p className="mt-1 text-[13.5px] text-muted-foreground">Two versions, one project. The test version is yours to break; the live version is what people use.</p>

        {/* Environments */}
        <div className="mt-6 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
          <div className="panel rounded-xl p-4">
            <p className="micro-label">Test version</p>
            <p className="mt-1 text-[14px] font-medium">Only you · sandbox data</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">Save point #{ws.checkpoints[0]?.seq ?? 1} · {ws.checkpoints[0]?.label}</p>
            <Link href={`/p/${ws.project.id}/preview`} className="mt-3 inline-flex text-[12.5px] text-amber hover:underline">Open preview →</Link>
          </div>
          <div className="hidden items-center md:flex"><ArrowRight className="size-5 text-faint" /></div>
          <div className={cn("rounded-xl border p-4", live ? "border-read/30 bg-read/[0.06]" : "border-dashed border-hairline")}>
            <p className="micro-label">Live version</p>
            {live && ws.liveSlug ? (
              <>
                <p className="mt-1 flex items-center gap-2 text-[14px] font-medium"><span className="size-2 rounded-full bg-read pulse-ring" />Anyone with the link</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <code className="min-w-0 flex-1 truncate rounded-md border border-hairline bg-deep px-2 py-1 font-mono text-[12px]">/live/{ws.liveSlug}</code>
                  <Button size="icon-sm" variant="outline" className="size-7" aria-label="Copy link" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/live/${ws.liveSlug}`); toast.success("Link copied"); }}><Copy /></Button>
                  <Button asChild size="icon-sm" variant="outline" className="size-7" aria-label="Open live version"><a href={`/live/${ws.liveSlug}`} target="_blank" rel="noreferrer"><ExternalLink /></a></Button>
                </div>
                <p className="mt-2 text-[12px] text-muted-foreground">Published <TimeAgo iso={live.created_at} /></p>
              </>
            ) : (
              <>
                <p className="mt-1 text-[14px] font-medium text-muted-foreground">Not live yet</p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">Pass Preflight, pick where it runs, go live.</p>
              </>
            )}
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          {/* Preflight */}
          <section aria-labelledby="pf" className="panel rounded-xl">
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <h3 id="pf" className="text-[14px] font-semibold">Preflight</h3>
              <span className={cn("text-[12px]", ready ? "text-read" : "text-ask")}>{ready ? "Ready to go live" : `${checks.filter((c) => c.blocking && c.status === "fail").length} blocking`}</span>
            </div>
            <ul className="divide-y divide-hairline">
              {checks.map((c) => (
                <li key={c.id} className="flex items-start gap-3 px-4 py-3">
                  {c.status === "pass" ? <Check className="mt-0.5 size-4 shrink-0 text-read" /> : c.status === "warn" ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-ask" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{c.label}</p>
                    <p className="text-[12px] text-muted-foreground">{c.detail}</p>
                  </div>
                  {c.fix && (
                    <Button size="sm" variant={c.status === "fail" ? "default" : "outline"} className="h-7 shrink-0" disabled={pending} onClick={() => fix(c.fix!.action)}>
                      {c.fix.label}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <p className="border-t border-hairline px-4 py-2.5 text-[11.5px] text-faint">Warnings don&apos;t block going live. Real risks do.</p>
          </section>

          {/* Targets */}
          <section aria-labelledby="tg" className="space-y-3">
            <h3 id="tg" className="text-[14px] font-semibold">Where it runs</h3>
            {TARGETS.map((t) => (
              <button key={t.id} onClick={() => setTarget(t.id)} aria-pressed={target === t.id} className={cn("flex w-full gap-3 rounded-xl border p-3.5 text-left transition-colors", target === t.id ? "border-amber/50 bg-amber-soft" : "border-hairline bg-panel hover:border-[#343947]")}>
                <t.icon className={cn("mt-0.5 size-4 shrink-0", target === t.id ? "text-amber" : "text-muted-foreground")} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[13.5px] font-medium">{t.name}<span className={cn("rounded px-1.5 py-px text-[10.5px]", t.tag.includes("real") ? "bg-read/10 text-read" : "bg-raised text-muted-foreground")}>{t.tag}</span></span>
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">{t.body}</span>
                </span>
              </button>
            ))}
            <label className="block">
              <span className="micro-label flex items-center gap-1.5"><Globe className="size-3" />Custom domain · optional</span>
              <Input className="mt-1.5 h-9" placeholder="claims.harbormutual.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
              {domain && <span className="mt-1 block text-[11.5px] text-muted-foreground">Add a CNAME to <span className="font-mono">cname.architect.new</span>. We&apos;ll check DNS and issue a certificate (sandbox).</span>}
            </label>
            <div className="flex gap-2 pt-1">
              <Button size="lg" className="h-10 flex-1" disabled={!ready || deploying !== null} onClick={deploy}>
                {deploying !== null ? <Loader2 className="animate-spin" /> : <Rocket />} {live && target === "architect_cloud" ? "Update the live version" : "Go live"}
              </Button>
              {target === "vpc" && <Button size="lg" variant="outline" className="h-10" onClick={downloadBundle}><Download /> Bundle</Button>}
            </div>
            {deploying !== null && (
              <ol className="panel rounded-xl p-3 text-[12.5px]" aria-live="polite">
                {STEPS.map((s, i) => (
                  <li key={s} className={cn("flex items-center gap-2 py-0.5", i > deploying && "text-faint")}>
                    {i < deploying ? <Check className="size-3.5 text-read" /> : i === deploying ? <Loader2 className="size-3.5 animate-spin text-amber" /> : <span className="size-3.5" />}
                    {s}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Cost & status */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="panel rounded-xl p-4">
            <h3 className="text-[14px] font-semibold">What it costs to run</h3>
            <p className="mt-1 text-[12.5px] text-muted-foreground">One conversation with an agent costs about <span className="text-foreground">{perConversation.toFixed(1)} credits (≈ {creditsUsd(perConversation)})</span>.</p>
            <label className="mt-4 block text-[12.5px]">
              If <span className="font-mono text-foreground">{users.toLocaleString()}</span> people each use it 4 times a month
              <input type="range" min={50} max={20000} step={50} value={users} onChange={(e) => setUsers(Number(e.target.value))} className="mt-2 w-full accent-[var(--amber)]" aria-label="People using it" />
            </label>
            <p className="mt-2 text-[20px] font-semibold tabular-nums">≈ {creditsUsd(monthly)} <span className="text-[12.5px] font-normal text-muted-foreground">a month · {Math.round(monthly).toLocaleString()} credits</span></p>
            <p className="mt-1 text-[12px] text-muted-foreground">Your cap is {ws.project.settings.budgetCapCredits} credits. Past it, agents pause and tell you — they never keep spending quietly.</p>
          </section>
          <section className="panel rounded-xl">
            <h3 className="border-b border-hairline px-4 py-3 text-[14px] font-semibold">Deployments</h3>
            {deployments.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">Nothing deployed yet.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {deployments.slice(0, 6).map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-[12.5px]">
                    <span className={cn("size-2 shrink-0 rounded-full", d.status === "live" ? "bg-read" : d.status === "sandbox" ? "bg-change" : "bg-faint")} />
                    <span className="min-w-0 flex-1">
                      <span className="block">{d.target === "architect_cloud" ? "Architect Cloud" : d.target === "vercel" ? "Vercel (sandbox)" : "Your VPC (sandbox)"}</span>
                      <span className="block text-[11.5px] text-muted-foreground">{d.status === "live" ? "Serving now" : d.status === "sandbox" ? "Prepared" : "Replaced"} · <TimeAgo iso={d.created_at} /></span>
                    </span>
                    {d.status === "rolled_back" && d.target === "architect_cloud" && live && (
                      <Button size="sm" variant="ghost" className="h-7" disabled={pending} onClick={() => start(async () => { const r = await rollbackTo(ws.project.id, d.id); if (r.ok) toast.success("Rolled back", { description: "Instant and free." }); else toast.error(r.error); router.refresh(); })}>
                        <Undo2 /> Roll back to this
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {live && (
              <div className="border-t border-hairline px-4 py-2.5">
                <button className="text-[12px] text-muted-foreground hover:text-ask" disabled={pending} onClick={() => start(async () => { await takeOffline(ws.project.id); toast.success("Taken offline"); router.refresh(); })}>
                  Take the live version offline
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
