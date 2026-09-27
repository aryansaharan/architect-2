"use client";
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";
import { Check, CircleAlert, CircleX, Cloud, Container, Copy, Download, ExternalLink, Globe, Loader2, Rocket, Server, Undo2, X } from "lucide-react";
import type { DeploymentRow } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeAgo } from "@/components/time-ago";
import { canGoLive, preflight } from "@/lib/sim/preflight";
import { generateFiles } from "@/lib/codegen/files";
import { fixPreflight, goLive, rollbackTo, takeOffline } from "@/lib/actions/ship";
import { creditsUsd } from "@/lib/format";
import { downloadBlob, zip } from "@/lib/zip";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";
import { Term } from "@/components/arch/term";

type Target = DeploymentRow["target"];
const TARGETS: { id: Target; name: string; icon: typeof Cloud; body: string; tag: string }[] = [
  { id: "architect_cloud", name: "Prod Cloud", icon: Cloud, body: "Instant, managed. Agents run with the permissions and caps you set.", tag: "Recommended · real" },
  { id: "vercel", name: "Your Vercel team", icon: Server, body: "Push to your own Vercel project and keep your usual deploy previews.", tag: "Sandbox" },
  { id: "vpc", name: "Your VPC or on-prem", icon: Container, body: "Download a Docker bundle and run everything inside your network.", tag: "Sandbox" },
];

/** A plain hostname: dot-separated labels of letters, digits and inner hyphens, ending in a real TLD. */
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/** This site's origin, so live links read and copy as full URLs. Empty during server rendering. */
const noSubscribe = () => () => {};
function useOrigin(): string {
  return useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
}

/** A name as a URL-safe slug: "Claims Desk" → "claims-desk". */
const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");

const STEPS = ["Packaging the current save point", "Provisioning the runtime", "Applying the database schema with row-level security", "Registering agents and their approval gates", "Warming up", "Checking the live URL answers"];

export function ShipView({ deployments }: { deployments: DeploymentRow[] }) {
  const ws = useWorkspace();
  const router = useRouter();
  const bp = ws.blueprint;
  // An imported repo is already built (it is the user's own code), so it needs rehearsals, not a charged build.
  const built = ws.project.buildState === "built" || ws.project.source === "import";
  const checks = useMemo(() => preflight(bp, { budgetCapCredits: ws.project.settings.budgetCapCredits, built, region: ws.project.settings.region }), [bp, ws.project.settings, built]);
  const ready = canGoLive(checks);
  const blocking = checks.filter((c) => c.blocking && c.status === "fail").length;
  const [target, setTarget] = useState<Target>("architect_cloud");
  const [domain, setDomain] = useState("");
  const [domainTouched, setDomainTouched] = useState(false);
  const [confirmOffline, setConfirmOffline] = useState(false);
  const [deploying, setDeploying] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [users, setUsers] = useState(1000);
  const [launched, setLaunched] = useState<string | null>(null);
  const live = deployments.find((d) => d.status === "live");
  const perConversation = bp.agents.reduce((s, a) => s + a.cost.creditsPerRun, 0) / Math.max(1, bp.agents.length);
  const monthly = users * 4 * perConversation;
  // Forgive a pasted URL ("https://claims.example.com/"); anything else must be a real hostname.
  const host = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const domainValid = !host || HOSTNAME.test(host);
  const projectSlug = slugify(ws.project.name) || "app";
  // Suggest a domain that fits this project, not someone else's.
  const exampleDomain = `app.${slugify(ws.project.name) || "yourcompany"}.com`;
  const origin = useOrigin();
  const liveUrl = ws.liveSlug ? `${origin}/live/${ws.liveSlug}` : "";

  // Preflight's "Build it": start the build (or pick up one that was interrupted) right here, then show it running on the plan.
  const buildRunning = ws.build.mode === "build" && (ws.build.status === "running" || ws.build.status === "repair" || ws.build.status === "finishing");
  const interrupted = ws.project.buildState === "building" && !buildRunning;
  const buildCredits = bp.estimate.credits;
  const overCap = ws.project.buildState === "draft" && buildCredits > Math.max(0, ws.usage.cap - ws.usage.credits);
  const buildLabel = buildRunning ? "Watch the build" : interrupted ? "Resume the build · free" : overCap ? "Review the build" : `Build it · ${buildCredits} credits`;
  const buildDetail = buildRunning ? "Building now. Rehearsals run near the end of the build." : interrupted ? "The build was interrupted before rehearsals ran. Resuming is free: it was already paid for." : null;

  const [fixing, setFixing] = useState<Parameters<typeof fixPreflight>[1] | null>(null);
  const fix = (action: Parameters<typeof fixPreflight>[1]) => {
    setFixing(action);
    start(async () => {
      await runFix(action);
      setFixing(null);
    });
  };
  const runFix = async (action: Parameters<typeof fixPreflight>[1]) => {
    if (action === "build_first") {
      // Over the cap, the Work Order on the plan explains why and what to do; otherwise start or resume here.
      if (!buildRunning && !overCap && !(await ws.build.start())) return;
      router.push(`/p/${ws.project.id}/blueprint`);
      return;
    }
    const r = await fixPreflight(ws.project.id, action);
    if (r.ok) toast.success("Fixed", { description: "Free · saved as a save point" });
    else toast.error(r.error);
    router.refresh();
  };

  async function deploy() {
    for (let i = 0; i < STEPS.length; i++) {
      setDeploying(i);
      if (i === 0) setTimeout(() => document.getElementById("deploy-progress")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
      await new Promise((r) => setTimeout(r, 650 + (i % 2) * 250));
    }
    const r = await goLive(ws.project.id, target, host || undefined);
    setDeploying(null);
    if (!r.ok) return void toast.error(r.error);
    if (target === "architect_cloud") setLaunched(r.slug ?? ws.liveSlug ?? "");
    else toast.success(target === "vercel" ? "Vercel deploy prepared (sandbox)" : "Bundle ready (sandbox)");
    router.refresh();
  }

  function downloadBundle() {
    const files = generateFiles(bp).filter((f) => ["docker-compose.yml", ".env.example", "README.md", "supabase/schema.sql"].includes(f.path) || f.path.startsWith("agents/"));
    const slug = `${projectSlug}-bundle`;
    try {
      downloadBlob(new Blob([zip(files.map((f) => ({ path: `${slug}/${f.path}`, content: f.content })))], { type: "application/zip" }), `${slug}.zip`);
    } catch {
      const text = files.map((f) => `# ===== ${f.path} =====\n${f.content}`).join("\n\n");
      downloadBlob(new Blob([text], { type: "text/plain" }), `${slug}.txt`);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <p className="micro-label text-amber">Go live · roll back any time</p>
        <h2 className="mt-1 font-display text-[36px] leading-tight tracking-tight">Ship</h2>
        <p className="mt-1 text-[13.5px] text-muted-foreground">Two versions, one project. The test version is yours to break; the live version is what people use.</p>

        {/* Environments */}
        <div className="mt-6 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
          <div className="panel rounded-xl p-4 transition-colors hover:border-hairline-hi">
            <p className="micro-label">Test version</p>
            <p className="mt-1 text-[14px] font-medium">Only you · sandbox data</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">Save point #{ws.checkpoints[0]?.seq ?? 1} · {ws.checkpoints[0]?.label}</p>
            <Link href={`/p/${ws.project.id}/preview`} className="mt-3 inline-flex text-[12.5px] text-amber hover:underline">Open preview →</Link>
          </div>
          <div aria-hidden className="relative hidden w-16 items-center md:flex">
            <span className="h-px w-full bg-[linear-gradient(90deg,var(--hairline-hi),rgb(61_214_140/0.5))]" />
            <span className={cn("absolute size-1.5 rounded-full shadow-[0_0_10px_currentColor] [animation:travel-x_2.4s_cubic-bezier(0.45,0,0.2,1)_infinite]", live ? "bg-read text-read" : "bg-amber text-amber")} />
          </div>
          <div className={cn("rounded-xl border p-4 transition-[border-color,box-shadow] duration-700", live ? "border-read/35 bg-[linear-gradient(180deg,rgb(61_214_140/0.09),rgb(61_214_140/0.03))] shadow-[0_0_60px_-24px_rgb(61_214_140/0.55)]" : "border-dashed border-hairline")}>
            <p className="micro-label">Live version</p>
            {live && ws.liveSlug ? (
              <>
                <p className="mt-1 flex items-center gap-2 text-[14px] font-medium"><span className="size-2 rounded-full bg-read pulse-read" />Anyone with the link</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <code className="min-w-0 flex-1 truncate rounded-md border border-hairline bg-deep px-2 py-1 font-mono text-[12px]" title={liveUrl}>{liveUrl}</code>
                  <Button size="icon-sm" variant="outline" className="size-7" aria-label="Copy link" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/live/${ws.liveSlug}`); toast.success("Link copied", { description: `${window.location.origin}/live/${ws.liveSlug}` }); }}><Copy /></Button>
                  <Button asChild size="icon-sm" variant="outline" className="size-7" aria-label="Open live version"><a href={liveUrl || `/live/${ws.liveSlug}`} target="_blank" rel="noreferrer"><ExternalLink /></a></Button>
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
              <h3 id="pf" className="text-[14px] font-semibold"><Term k="preflight" /></h3>
              <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px]", ready ? "border-read/30 bg-read/10 text-read" : "border-ask/30 bg-ask/10 text-ask")}>
                <span className={cn("size-1.5 rounded-full", ready ? "bg-read" : "bg-ask")} />
                {ready ? "Ready to go live" : `${checks.filter((c) => c.blocking && c.status === "fail").length} blocking`}
              </span>
            </div>
            <ul className="divide-y divide-hairline">
              {checks.map((c, i) => (
                <motion.li key={c.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.08 + i * 0.07 }} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-raised/40">
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.2 + i * 0.07 }} className={cn("mt-px grid size-5 shrink-0 place-items-center rounded-full ring-1", c.status === "pass" ? "bg-read/10 text-read ring-read/25" : c.status === "warn" ? "bg-amber/10 text-amber ring-amber/25" : "bg-ask/10 text-ask ring-ask/25")}>
                    {c.status === "pass" ? <Check className="size-3" strokeWidth={3} /> : c.status === "warn" ? <CircleAlert className="size-3" /> : <CircleX className="size-3" />}
                  </motion.span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{c.label}</p>
                    <p className="text-[12px] text-muted-foreground">{(c.fix?.action === "build_first" && buildDetail) || c.detail}</p>
                  </div>
                  {c.fix && (
                    <Button size="sm" variant={c.status === "fail" ? "default" : "outline"} className="h-7 shrink-0" disabled={pending} onClick={() => fix(c.fix!.action)}>
                      {fixing === c.fix.action ? <Loader2 className="animate-spin" /> : null}
                      {c.fix.action === "build_first" ? buildLabel : c.fix.label}
                    </Button>
                  )}
                </motion.li>
              ))}
            </ul>
            <p className="border-t border-hairline px-4 py-2.5 text-[11.5px] text-faint">Warnings don&apos;t block going live. Real risks do.</p>
          </section>

          {/* Targets */}
          <section aria-labelledby="tg" className="space-y-3">
            <h3 id="tg" className="text-[14px] font-semibold">Where it runs</h3>
            {TARGETS.map((t) => (
              <button key={t.id} onClick={() => setTarget(t.id)} aria-pressed={target === t.id} className={cn("relative flex w-full gap-3 rounded-xl border p-3.5 text-left transition-[border-color,transform] duration-200", target === t.id ? "border-transparent" : "border-hairline bg-panel hover:-translate-y-px hover:border-hairline-hi")}>
                {target === t.id && <motion.span layoutId="ship-target" aria-hidden className="absolute inset-0 rounded-xl border border-amber/50 bg-[linear-gradient(180deg,rgb(223_255_79/0.13),rgb(223_255_79/0.04))] shadow-[0_0_36px_-14px_rgb(223_255_79/0.6)]" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                <t.icon className={cn("relative mt-0.5 size-4 shrink-0 transition-colors", target === t.id ? "text-amber" : "text-muted-foreground")} />
                <span className="relative min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[13.5px] font-medium">{t.name}<span className={cn("rounded px-1.5 py-px text-[10.5px]", t.tag.includes("real") ? "bg-read/10 text-read" : "bg-raised text-muted-foreground")}>{t.tag}</span></span>
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">{t.body}</span>
                </span>
              </button>
            ))}
            <label className="block">
              <span className="micro-label flex items-center gap-1.5"><Globe className="size-3" />Custom domain · optional</span>
              <Input
                className="mt-1.5 h-9"
                placeholder={exampleDomain}
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onBlur={() => setDomainTouched(true)}
                aria-invalid={domainTouched && !domainValid ? true : undefined}
                aria-describedby="domain-help"
                autoCapitalize="none"
                spellCheck={false}
              />
              {domainTouched && !domainValid ? (
                <span id="domain-help" className="mt-1 block text-[11.5px] text-ask">That isn&apos;t a domain. Use one like {exampleDomain}, without spaces or symbols.</span>
              ) : host && domainValid ? (
                <span id="domain-help" className="mt-1 block text-[11.5px] text-muted-foreground">Add a CNAME for <span className="font-mono">{host}</span> to <span className="font-mono">cname.prodai.app</span>. We&apos;ll check DNS and issue a certificate (sandbox).</span>
              ) : null}
            </label>
            <div className="flex gap-2 pt-1">
              <Button size="lg" className="btn-solstice sheen h-10 flex-1 disabled:animate-none" disabled={!ready || !domainValid || deploying !== null} onClick={deploy}>
                {deploying !== null ? <Loader2 className="animate-spin" /> : <Rocket />} {!ready ? `Fix ${blocking} blocking check${blocking === 1 ? "" : "s"} to go live` : !domainValid ? "Fix the custom domain to go live" : live && target === "architect_cloud" ? "Update the live version" : "Go live"}
              </Button>
              {target === "vpc" && <Button size="lg" variant="outline" className="h-10" onClick={downloadBundle}><Download /> Bundle</Button>}
            </div>
            <AnimatePresence>
              {deploying !== null && (
                <motion.div
                  id="deploy-progress"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, transition: { duration: 0.2 } }}
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                  className="aurora panel-raised overflow-hidden rounded-xl"
                >
                  <div className="h-0.5 bg-deep">
                    <motion.div className="bg-solstice h-full shadow-[0_0_12px_rgb(141_255_158/0.8)]" animate={{ width: `${Math.round(((deploying + 0.5) / STEPS.length) * 100)}%` }} transition={{ type: "spring", stiffness: 90, damping: 20 }} />
                  </div>
                  <ol className="p-3 text-[12.5px]" aria-live="polite">
                    {STEPS.map((s, i) => (
                      <li key={s} className={cn("flex items-center gap-2 py-0.5 transition-colors duration-300", i > deploying ? "text-faint" : i === deploying ? "text-foreground" : "text-muted-foreground")}>
                        {i < deploying ? (
                          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}><Check className="size-3.5 text-read" /></motion.span>
                        ) : i === deploying ? <Loader2 className="size-3.5 animate-spin text-amber" /> : <span className="size-3.5" />}
                        <span className={cn(i === deploying && "text-shimmer")}>{s}</span>
                      </li>
                    ))}
                  </ol>
                </motion.div>
              )}
            </AnimatePresence>
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
            <p className="mt-1 text-[12px] text-muted-foreground">Your cap is {ws.project.settings.budgetCapCredits} credits. Past it, agents pause and tell you. They never keep spending quietly.</p>
          </section>
          <section className="panel rounded-xl">
            <h3 className="border-b border-hairline px-4 py-3 text-[14px] font-semibold">Deployments</h3>
            {deployments.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">Nothing deployed yet.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {deployments.slice(0, 6).map((d) => {
                  const cp = ws.checkpoints.find((c) => c.id === d.checkpoint_id);
                  return (
                    <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-[12.5px]">
                      <span className={cn("size-2 shrink-0 rounded-full", d.status === "live" ? "bg-read" : d.status === "sandbox" ? "bg-change" : "bg-faint")} />
                      <span className="min-w-0 flex-1">
                        <span className="block">{d.target === "architect_cloud" ? "Prod Cloud" : d.target === "vercel" ? "Vercel (sandbox)" : "Your VPC (sandbox)"}</span>
                        {cp && <span className="block truncate text-[11.5px] text-muted-foreground" title={cp.label}>Save point #{cp.seq} · {cp.label}</span>}
                        <span className="block text-[11.5px] text-muted-foreground">{d.status === "live" ? "Serving now" : d.status === "sandbox" ? "Prepared" : "Replaced"} · <TimeAgo iso={d.created_at} /></span>
                      </span>
                      {d.status === "rolled_back" && d.target === "architect_cloud" && live && (
                        <Button size="sm" variant="ghost" className="h-7" disabled={pending} onClick={() => start(async () => { const r = await rollbackTo(ws.project.id, d.id); if (r.ok) toast.success("Rolled back", { description: "Instant and free." }); else toast.error(r.error); router.refresh(); })}>
                          <Undo2 /> Roll back to this
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {live && (
              <div className="border-t border-hairline px-4 py-2.5">
                {confirmOffline ? (
                  <div role="group" aria-label="Confirm taking the live version offline">
                    <p className="text-[12.5px]">Take it offline? The link will show “not found” until you go live again. Your project and save points stay as they are.</p>
                    <div className="mt-2 flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-ask/40 text-ask hover:bg-ask/10 hover:text-ask"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const r = await takeOffline(ws.project.id);
                            if (r.ok) toast.success("Taken offline", { description: "Go live again any time from here." });
                            else toast.error(r.error);
                            setConfirmOffline(false);
                            router.refresh();
                          })
                        }
                      >
                        {pending ? <Loader2 className="animate-spin" /> : null} Take it offline
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7" disabled={pending} autoFocus onClick={() => setConfirmOffline(false)}>Keep it live</Button>
                    </div>
                  </div>
                ) : (
                  <button className="text-[12px] text-muted-foreground hover:text-ask" disabled={pending} onClick={() => setConfirmOffline(true)}>
                    Take the live version offline
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
      <AnimatePresence>{launched !== null && <LaunchMoment slug={launched} origin={origin} name={bp.meta.name} onClose={() => setLaunched(null)} />}</AnimatePresence>
    </div>
  );
}

/** Going live deserves a moment: rings of light, the link, and the way back. */
function LaunchMoment({ slug, origin, name, onClose }: { slug: string; origin: string; name: string; onClose: () => void }) {
  const url = `${origin}/live/${slug}`;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-canvas/70 p-6 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="You're live"
        initial={{ opacity: 0, y: 30, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className="panel-raised relative w-full max-w-[520px] overflow-hidden rounded-3xl px-8 pb-8 pt-12 text-center shadow-[0_0_0_1px_rgb(61_214_140/0.25),0_40px_120px_-20px_rgb(0_0_0/0.9),0_0_120px_-30px_rgb(61_214_140/0.55)]"
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_at_50%_0%,rgb(61_214_140/0.22),transparent_70%)]" />
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        <div className="relative mx-auto grid size-20 place-items-center">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute inset-0 rounded-full border border-read/50"
              initial={{ scale: 0.6, opacity: 0.9 }}
              animate={{ scale: 2.6, opacity: 0 }}
              transition={{ duration: 2.2, ease: "easeOut", delay: 0.3 + i * 0.45, repeat: Infinity, repeatDelay: 0.6 }}
            />
          ))}
          <motion.span
            initial={{ scale: 0, rotate: -40 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 15, delay: 0.2 }}
            className="relative grid size-16 place-items-center rounded-2xl bg-[linear-gradient(160deg,rgb(61_214_140/0.3),rgb(61_214_140/0.1))] text-read ring-1 ring-read/40 shadow-[0_0_40px_-6px_rgb(61_214_140/0.7)]"
          >
            <Rocket className="size-7" />
          </motion.span>
        </div>
        <motion.p initial={{ opacity: 0, y: 10, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ delay: 0.45, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="relative mt-6 font-display text-[40px] leading-none tracking-tight">
          You&apos;re <em className="text-read">live.</em>
        </motion.p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }} className="relative mt-3 text-[13.5px] text-muted-foreground">
          {name} is serving real people now. Agents keep the permissions and spending cap you set, and rollback is one click.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.5 }} className="relative mt-6 flex items-center gap-2 rounded-xl border border-hairline bg-deep p-1.5 pl-3">
          <span className="size-2 shrink-0 rounded-full bg-read pulse-read" />
          <code className="min-w-0 flex-1 truncate text-left font-mono text-[12.5px]">{url}</code>
          <Button size="sm" variant="outline" className="h-8" onClick={() => { void navigator.clipboard.writeText(url); toast.success("Link copied"); }}><Copy /> Copy</Button>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.5 }} className="relative mt-4 flex justify-center gap-2">
          <Button variant="ghost" className="h-10" onClick={onClose}>Back to Ship</Button>
          <Button asChild className="btn-solstice sheen h-10 px-5">
            <a href={url} target="_blank" rel="noreferrer">Open the live version <ExternalLink /></a>
          </Button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
