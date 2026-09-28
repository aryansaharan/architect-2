"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronRight, CircleAlert, Cloud, Container, Copy, Download, ExternalLink, Globe, Loader2, Server, Undo2, X } from "lucide-react";
import type { DeploymentRow } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { DUR, EASE } from "@/lib/motion";
import { TimeAgo } from "@/components/time-ago";
import { canGoLive, preflight, type PreflightCheck } from "@/lib/sim/preflight";
import { generateFiles } from "@/lib/codegen/files";
import { fixPreflight, goLive, rollbackTo, takeOffline } from "@/lib/actions/ship";
import { creditsUsd } from "@/lib/format";
import { downloadBlob, zip } from "@/lib/zip";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";
import { AppControls } from "./app-controls";
import { useOrigin } from "./use-origin";

type Target = DeploymentRow["target"];
const TARGETS: { id: Target; name: string; icon: typeof Cloud; body: string; tag: string }[] = [
  { id: "architect_cloud", name: "Prod Cloud", icon: Cloud, body: "Instant and managed. AI helpers run with the permissions and caps you set.", tag: "Recommended · real" },
  { id: "vercel", name: "Your Vercel team", icon: Server, body: "Push to your own Vercel project and keep your usual deploy previews.", tag: "Sandbox" },
  { id: "vpc", name: "Your VPC or on-prem", icon: Container, body: "Download a Docker bundle and run everything inside your network.", tag: "Sandbox" },
];

/** A plain hostname: dot-separated labels of letters, digits and inner hyphens, ending in a real TLD. */
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;


/** A name as a URL-safe slug: "Claims Desk" → "claims-desk". */
const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");

const STEPS = ["Packaging the current version", "Getting a server ready", "Setting up the database, with each row private to its owner", "Registering AI helpers and their ask-first steps", "Warming up", "Checking the live link answers"];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What a check that needs attention means, in a few plain words. */
function attentionLine(c: PreflightCheck, bp: ReturnType<typeof useWorkspace>["blueprint"], built: boolean): string {
  switch (c.id) {
    case "signin":
      return "Anyone with the link could see your data";
    case "permissions": {
      const n = bp.agents.flatMap((a) => a.tools).filter((t) => t.access === "irreversible" && t.permission !== "ask").length;
      return `${plural(n, "action")} that can't be undone ${n === 1 ? "doesn't" : "don't"} ask first`;
    }
    case "rehearsals":
      return !built ? "It isn't built yet" : c.status === "fail" ? "Too many test runs fail" : "Some test runs haven't run yet";
    case "keys": {
      const n = bp.connections.filter((x) => x.status === "missing").length;
      return `${plural(n, "connection")} still ${n === 1 ? "uses" : "use"} test data`;
    }
    case "budget":
      return "No spending cap yet";
    default:
      return c.label;
  }
}

/** Short, one-click fix labels. The build fix gets its own label (it may start, resume or only show the build). */
const FIX_LABEL: Record<string, string> = { enable_auth: "Turn on sign-in", gate_irreversible: "Make them ask first", sandbox_keys: "Add keys", set_budget: "Set a 500-credit cap", run_rehearsals: "Run them" };

export function ShipView({ deployments }: { deployments: DeploymentRow[] }) {
  const ws = useWorkspace();
  const router = useRouter();
  const bp = ws.blueprint;
  // An imported repo is already built (it is the user's own code), so it needs rehearsals, not a charged build.
  const built = ws.project.buildState === "built" || ws.project.source === "import";
  const checks = useMemo(
    () =>
      preflight(bp, {
        budgetCapCredits: ws.project.settings.budgetCapCredits,
        built,
        region: ws.project.settings.region,
        hiddenEntities: ws.project.settings.app?.hiddenEntities,
        publicHelpers: ws.project.settings.app?.publicHelpers,
      }),
    [bp, ws.project.settings, built],
  );
  const ready = canGoLive(checks);
  const blocking = checks.filter((c) => c.blocking && c.status === "fail");
  const optional = checks.filter((c) => !(c.blocking && c.status === "fail") && c.status !== "pass" && c.status !== "info");
  const passed = checks.filter((c) => c.status === "pass");
  // Nothing to fix, but worth reading before publishing: what the public pages show.
  const info = checks.filter((c) => c.status === "info");
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
  const isLive = Boolean(live && ws.liveSlug);

  // The build fix: start the build (or pick up one that was interrupted) right here, then show it running on the plan.
  const buildRunning = ws.build.mode === "build" && (ws.build.status === "running" || ws.build.status === "repair" || ws.build.status === "finishing");
  const interrupted = ws.project.buildState === "building" && !buildRunning;
  const buildCredits = bp.estimate.credits;
  const overCap = ws.project.buildState === "draft" && buildCredits > Math.max(0, ws.usage.cap - ws.usage.credits);
  const buildLabel = buildRunning ? "Watch the build" : interrupted ? "Resume the build · free" : overCap ? "Review the build" : `Make it real · ${buildCredits} credits`;
  const buildDetail = buildRunning ? "Building now. Test runs happen near the end of the build." : interrupted ? "The build was interrupted before its test runs. Resuming is free: it was already paid for." : null;

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
    if (r.ok) toast.success("Fixed", { description: "Free · saved as a new version" });
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

  const copyLink = () => {
    const url = `${window.location.origin}/live/${ws.liveSlug}`;
    void navigator.clipboard.writeText(url);
    toast.success("Link copied", { description: url });
  };

  const publishLabel = isLive && target === "architect_cloud" ? "Publish changes" : "Publish";
  const fixRow = (c: PreflightCheck) => {
    const action = c.fix?.action;
    if (!action) return null;
    const must = c.blocking && c.status === "fail";
    return (
      <Button variant={must ? "default" : "outline"} className="shrink-0" disabled={pending} onClick={() => fix(action)}>
        {fixing === action ? <Loader2 className="animate-spin" /> : null}
        {action === "build_first" ? buildLabel : FIX_LABEL[action] ?? c.fix!.label}
      </Button>
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
        <h2 className="font-pencil text-title">Publish</h2>
        <p className="mt-2 text-body text-muted-foreground">
          {isLive ? "Your app is online. What you change here stays in your test version until you publish again." : `Put ${bp.meta.name} online so people can use it. You can take it back any time.`}
        </p>

        {/* The live link, big and easy to copy. */}
        {isLive && live && (
          <section aria-label="Live link" className="panel mt-6 rounded-md p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Pill tone="ok" dot size="md">Live now</Pill>
              <span className="text-ui text-muted-foreground">Anyone with the link can use it · published <TimeAgo iso={live.created_at} /></span>
            </div>
            {/* A copy field: the whole link on one line, cut short with an ellipsis if it doesn't fit, never broken mid-word. */}
            <div className="mt-3 flex items-center gap-2 rounded-md border border-hairline bg-canvas p-1.5 pl-3">
              <code className="min-w-0 flex-1 truncate font-mono text-code text-foreground" title={liveUrl || undefined}>{liveUrl || `/live/${ws.liveSlug}`}</code>
              <Button size="sm" className="shrink-0" onClick={copyLink}><Copy /> Copy link</Button>
            </div>
            <Button asChild variant="outline" size="sm" className="mt-3"><a href={liveUrl || `/live/${ws.liveSlug}`} target="_blank" rel="noreferrer">Open it <ExternalLink /></a></Button>
          </section>
        )}

        {/* Only what needs attention. Everything that already passes is folded away. */}
        <section aria-labelledby="attention" className="mt-8">
          {blocking.length > 0 ? (
            <h3 id="attention" className="font-pencil text-section">Fix {blocking.length === 1 ? "this" : `these ${blocking.length}`} first</h3>
          ) : (
            <h3 id="attention" className="flex items-center gap-2 font-pencil text-section text-ok"><Check className="size-5" strokeWidth={2.5} aria-hidden />Ready to go live</h3>
          )}
          {(blocking.length > 0 || optional.length > 0 || info.length > 0) && (
            <ul className="mt-3 space-y-2">
              {[...blocking, ...optional].map((c) => {
                const must = c.blocking && c.status === "fail";
                const irreversible = c.id === "permissions";
                return (
                  <li key={c.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border px-4 py-3", must ? (irreversible ? "border-ask/35 bg-ask/[0.05]" : "border-hairline-hi bg-panel") : "border-dashed border-hairline-hi bg-panel")}>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-body font-medium", irreversible && must && "text-ask")}>
                        {attentionLine(c, bp, built)}
                        {!must && <span className="ml-2 text-meta font-normal text-muted-foreground">optional</span>}
                      </p>
                      <p className="mt-0.5 text-ui text-muted-foreground">{(c.fix?.action === "build_first" && buildDetail) || c.detail}</p>
                    </div>
                    {fixRow(c)}
                  </li>
                );
              })}
              {info.map((c) => (
                <li key={c.id} className="rounded-md border border-dashed border-hairline-hi bg-panel px-4 py-3">
                  <p className="text-body font-medium">
                    {c.label}
                    <span className="ml-2 text-meta font-normal text-muted-foreground">read before you publish</span>
                  </p>
                  <p className="mt-0.5 text-ui text-muted-foreground">{c.detail}</p>
                  <a href="#what-is-public" className="mt-1 inline-block text-ui text-brand underline decoration-dotted underline-offset-4">Change what&apos;s public</a>
                </li>
              ))}
            </ul>
          )}
          {passed.length > 0 && (
            <details className="group mt-3">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-ui text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-3.5 transition-transform duration-150 ease-paper group-open:rotate-90" aria-hidden />
                Everything else is ready ({passed.length})
              </summary>
              <ul className="mt-2 space-y-1.5 pl-5">
                {passed.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 text-ui">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden />
                    <span><span className="text-foreground/90">{c.label}.</span> <span className="text-muted-foreground">{c.detail}</span></span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {/* One primary action. */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="cta" disabled={!ready || !domainValid || deploying !== null} onClick={deploy}>
            {deploying !== null ? <Loader2 className="animate-spin" /> : null} {publishLabel}
          </Button>
          {target === "vpc" && <Button size="lg" variant="outline" onClick={downloadBundle}><Download /> Download bundle</Button>}
          <p className="text-ui text-muted-foreground">
            {!ready
              ? `Fix the ${blocking.length === 1 ? "item" : `${blocking.length} items`} above to publish.`
              : !domainValid
                ? "Fix the custom domain under More options to publish."
                : target === "architect_cloud"
                  ? isLive
                    ? `Replaces the live version with version ${ws.checkpoints[0]?.seq ?? 1}. Rolling back is one click.`
                    : "Goes live on Prod Cloud. Rolling back is one click."
                  : `Prepares ${target === "vercel" ? "your Vercel project" : "a bundle for your network"} (sandbox).`}
          </p>
        </div>
        <AnimatePresence>
          {deploying !== null && (
            <motion.div
              id="deploy-progress"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: DUR.panel, ease: EASE }}
              className="panel mt-4 overflow-hidden rounded-md"
            >
              <div className="h-1 bg-deep">
                <motion.div className="h-full bg-brand" animate={{ width: `${Math.round(((deploying + 0.5) / STEPS.length) * 100)}%` }} transition={{ duration: DUR.page, ease: EASE }} />
              </div>
              <ol className="p-3 text-ui" aria-live="polite">
                {STEPS.map((s, i) => (
                  <li key={s} className={cn("flex items-center gap-2 py-0.5 transition-colors duration-250 ease-paper", i > deploying ? "text-faint" : i === deploying ? "text-foreground" : "text-muted-foreground")}>
                    {i < deploying ? <Check className="size-3.5 text-ok" /> : i === deploying ? <Loader2 className="size-3.5 animate-spin text-brand" /> : <span className="size-3.5" />}
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </motion.div>
          )}
        </AnimatePresence>

        {/* The owner's controls for the published app: people, what's public, AI helpers for visitors, sample data. */}
        <AppControls />

        {/* After publishing: versions, rollback, and the way offline. */}
        {deployments.length > 0 && (
          <section aria-labelledby="versions" className="mt-10">
            <h3 id="versions" className="font-pencil text-section">Versions</h3>
            <ul className="panel mt-3 divide-y divide-hairline rounded-md">
              {deployments.slice(0, 6).map((d) => {
                const cp = ws.checkpoints.find((c) => c.id === d.checkpoint_id);
                return (
                  <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-ui">
                    <span className="min-w-0 flex-1">
                      <span className="block text-ui font-medium">{cp ? <>Version {cp.seq} · {cp.label === "Went live" ? "Published" : cp.label}</> : "A saved version"}</span>
                      <span className="block text-meta text-muted-foreground">
                        {d.status === "live" ? "Live now" : d.status === "sandbox" ? "Prepared" : "Replaced"} · {d.target === "architect_cloud" ? "Prod Cloud" : d.target === "vercel" ? "Vercel (sandbox)" : "Your VPC (sandbox)"} · <TimeAgo iso={d.created_at} />
                      </span>
                    </span>
                    {d.status === "live" && <Pill tone="ok" dot>Live</Pill>}
                    {d.status === "rolled_back" && d.target === "architect_cloud" && live && (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await rollbackTo(ws.project.id, d.id); if (r.ok) toast.success("Rolled back", { description: "Instant and free." }); else toast.error(r.error); router.refresh(); })}>
                        <Undo2 /> Roll back to this
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            {live && (
              <div className="mt-3">
                {confirmOffline ? (
                  <div role="group" aria-label="Confirm taking the live version offline" className="panel rounded-md p-4">
                    <p className="text-ui">Take it offline? The link will show “not found” until you publish again. Your project and its versions stay as they are.</p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const r = await takeOffline(ws.project.id);
                            if (r.ok) toast.success("Taken offline", { description: "Publish again any time from here." });
                            else toast.error(r.error);
                            setConfirmOffline(false);
                            router.refresh();
                          })
                        }
                      >
                        {pending ? <Loader2 className="animate-spin" /> : null} Take it offline
                      </Button>
                      <Button variant="ghost" disabled={pending} autoFocus onClick={() => setConfirmOffline(false)}>Keep it live</Button>
                    </div>
                  </div>
                ) : (
                  <button className="text-ui text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors duration-150 hover:text-foreground" disabled={pending} onClick={() => setConfirmOffline(true)}>
                    Take it offline…
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {/* Where it runs, a custom domain and what it costs: for the people who want them. */}
        <details className="group mt-10 border-t border-hairline pt-5">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 font-pencil text-note leading-tight transition-colors duration-150 hover:text-brand [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 transition-transform duration-150 ease-paper group-open:rotate-90" aria-hidden />
            More options
          </summary>
          <div className="mt-5 space-y-8">
            <section aria-labelledby="tg">
              <h4 id="tg" className="text-body font-semibold">Where it runs</h4>
              <div className="mt-2.5 grid gap-2">
                {TARGETS.map((t) => (
                  <button key={t.id} onClick={() => setTarget(t.id)} aria-pressed={target === t.id} className={cn("flex w-full gap-3 rounded-md border p-3.5 text-left transition-colors duration-150 ease-paper", target === t.id ? "border-brand/30 bg-brand-soft" : "border-hairline bg-panel hover:border-line-strong")}>
                    <t.icon className={cn("mt-0.5 size-4 shrink-0", target === t.id ? "text-brand" : "text-muted-foreground")} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-body font-medium">{t.name}<Pill tone={t.tag.includes("real") ? "ok" : "neutral"}>{t.tag}</Pill></span>
                      <span className="mt-0.5 block text-meta text-muted-foreground">{t.body}</span>
                    </span>
                    {target === t.id && <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />}
                  </button>
                ))}
              </div>
            </section>

            <label className="block">
              <span className="flex items-center gap-1.5 text-body font-semibold"><Globe className="size-3.5 text-muted-foreground" />Custom domain <span className="font-normal text-muted-foreground">· optional</span></span>
              <Input
                className="mt-2 max-w-md"
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
                <span id="domain-help" className="mt-1.5 flex items-center gap-1.5 text-meta font-medium text-foreground"><CircleAlert className="size-3.5 shrink-0" aria-hidden />That isn&apos;t a domain. Use one like {exampleDomain}, without spaces or symbols.</span>
              ) : host && domainValid ? (
                <span id="domain-help" className="mt-1.5 block text-meta text-muted-foreground">Add a CNAME for <span className="font-mono">{host}</span> to <span className="font-mono">cname.prodai.app</span>. We&apos;ll check DNS and issue a certificate (sandbox).</span>
              ) : null}
            </label>

            <section aria-labelledby="cost">
              <h4 id="cost" className="text-body font-semibold">What it costs to run</h4>
              <p className="mt-1 text-ui text-muted-foreground">One conversation with an AI helper costs about <span className="text-foreground">{perConversation.toFixed(1)} credits (≈ {creditsUsd(perConversation)})</span>.</p>
              <label className="mt-3 block max-w-md text-ui">
                If <span className="font-medium tabular-nums text-foreground">{users.toLocaleString()}</span> people each use it 4 times a month
                <input type="range" min={50} max={20000} step={50} value={users} onChange={(e) => setUsers(Number(e.target.value))} className="mt-2 w-full accent-brand" aria-label="People using it" />
              </label>
              <p className="mt-2 text-lead font-semibold tabular-nums">About {creditsUsd(monthly)} a month <span className="text-ui font-normal text-muted-foreground">· {Math.round(monthly).toLocaleString()} credits</span></p>
              <p className="mt-2 text-meta text-muted-foreground">Your cap is {ws.project.settings.budgetCapCredits} credits. Past it, AI helpers pause and tell you. They never keep spending quietly.</p>
            </section>

            <p className="text-ui text-muted-foreground">
              Want to try it first? <Link href={`/p/${ws.project.id}/preview`} className="text-brand underline decoration-dotted underline-offset-4">Open the test version</Link> (version {ws.checkpoints[0]?.seq ?? 1}, only you, sample data).
            </p>
          </div>
        </details>
      </div>
      <AnimatePresence>{launched !== null && <LaunchMoment slug={launched} origin={origin} name={bp.meta.name} onClose={() => setLaunched(null)} />}</AnimatePresence>
    </div>
  );
}

/** Going live gets a quiet moment: the link, how to share it, and the way back. */
function LaunchMoment({ slug, origin, name, onClose }: { slug: string; origin: string; name: string; onClose: () => void }) {
  const url = `${origin}/live/${slug}`;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-4 sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="You're live"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: DUR.panel, ease: EASE }}
        className="panel-raised relative w-full min-w-0 max-w-[520px] rounded-lg px-5 pb-7 pt-9 text-center sm:px-8"
      >
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 text-muted-foreground"><X /></Button>
        <p className="font-pencil text-title">It&apos;s live.</p>
        <p className="mt-3 text-body text-muted-foreground">{name} is online now. AI helpers keep the permissions and spending cap you set, and rolling back is one click.</p>
        <div className="mt-6 flex items-center gap-2 rounded-md border border-hairline bg-canvas p-1.5 pl-3">
          <code className="min-w-0 flex-1 truncate text-left font-mono text-code">{url}</code>
          <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(url); toast.success("Link copied"); }}><Copy /> Copy</Button>
        </div>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="ghost" size="lg" onClick={onClose}>Back to Publish</Button>
          <Button asChild size="lg">
            <a href={url} target="_blank" rel="noreferrer">Open it <ExternalLink /></a>
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
