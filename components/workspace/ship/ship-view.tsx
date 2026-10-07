"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AnimatePresence } from "motion/react";
import { Check, ChevronRight, CircleAlert, Cloud, Container, Download, Globe, Loader2, Server } from "lucide-react";
import type { DeploymentRow } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { accessLine, canGoLive, preflight, type PreflightCheck } from "@/lib/sim/preflight";
import { generateFiles } from "@/lib/codegen/files";
import { fixPreflight, goLive, publishState, type PublishState } from "@/lib/actions/ship";
import { PRICE } from "@/lib/prices";
import { downloadBlob, zip } from "@/lib/zip";
import { cn } from "@/lib/utils";
import { useProjectKind } from "@/components/code-apps/around-code-app";
import { useWorkspace } from "../context";
import { AppControls } from "./app-controls";
import { CodeShipView } from "./code-ship-view";
import { DeployProgress, liveAnswers, LaunchMoment, LiveLink, PublishedVersions, versionHistory } from "./published";
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

// Two real steps: publish this version, then load the live link to check it answers.
const STEPS = ["Publishing this version", "Checking the live link answers"];

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
const FIX_LABEL: Record<string, string> = { enable_auth: "Turn on sign-in", gate_irreversible: "Make them ask first", sandbox_keys: "Add keys", set_budget: "Set a 500-credit cap", run_rehearsals: "Play them with Claude" };

/** Which must-fix comes first (and gets the one filled button): nothing else matters until it's built, then who can see the data. */
const blockerRank = (c: PreflightCheck) => (c.fix?.action === "build_first" ? 0 : ({ signin: 1, permissions: 2, budget: 3, rehearsals: 4 } as Record<string, number>)[c.id] ?? 5);


/** Publish: a code app (real files, a real build) has its own checks; a business app keeps these. */
export function ShipView({ deployments }: { deployments: DeploymentRow[] }) {
  return useProjectKind() === "code" ? <CodeShipView deployments={deployments} /> : <BusinessShipView deployments={deployments} />;
}

function BusinessShipView({ deployments }: { deployments: DeploymentRow[] }) {
  const ws = useWorkspace();
  const router = useRouter();
  const bp = ws.blueprint;
  // An imported repo is already built (it is the user's own code), so it needs rehearsals, not a build.
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
  const blocking = checks.filter((c) => c.blocking && c.status === "fail").sort((a, b) => blockerRank(a) - blockerRank(b));
  // One filled button on the page: the first must-fix that has a fix, or else Publish.
  const primaryFix = blocking.find((c) => c.fix)?.id ?? null;
  const optional = checks.filter((c) => !(c.blocking && c.status === "fail") && c.status !== "pass" && c.status !== "info");
  const passed = checks.filter((c) => c.status === "pass");
  // Nothing to fix, but worth reading before publishing: what the public pages show.
  const info = checks.filter((c) => c.status === "info");
  const [target, setTarget] = useState<Target>("architect_cloud");
  const [domain, setDomain] = useState("");
  const [domainTouched, setDomainTouched] = useState(false);
  const [deploying, setDeploying] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [launched, setLaunched] = useState<string | null>(null);
  const live = deployments.find((d) => d.status === "live");
  // AI helper messages answered by Claude come out of the person's monthly credits, one price each.
  const messagesLeft = Math.floor(ws.credits.left / PRICE.helperMessage);
  // Forgive a pasted URL ("https://claims.example.com/"); anything else must be a real hostname.
  const host = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const domainValid = !host || HOSTNAME.test(host);
  const projectSlug = slugify(ws.project.name) || "app";
  // Suggest a domain that fits this project, not someone else's.
  const exampleDomain = `app.${slugify(ws.project.name) || "yourcompany"}.com`;
  const origin = useOrigin();
  const isLive = Boolean(live && ws.liveSlug);
  const liveVersion = live?.checkpoint_id ? ws.checkpoints.find((c) => c.id === live.checkpoint_id)?.seq ?? null : null;
  const history = useMemo(() => versionHistory(deployments, ws.checkpoints, isLive ? live?.checkpoint_id ?? null : null, 6), [deployments, ws.checkpoints, isLive, live]);

  // What publishing would do now: whether anything changed since the live version and which version goes live.
  // Asked again whenever the project, its versions or what's published change.
  const [state, setState] = useState<PublishState | "checking" | "unknown">("checking");
  useEffect(() => {
    let gone = false;
    publishState(ws.project.id)
      .then((s) => !gone && setState(s ?? "unknown"))
      .catch(() => !gone && setState("unknown"));
    return () => {
      gone = true;
    };
  }, [ws.project.id, ws.blueprint, ws.checkpoints, deployments]);
  const known = typeof state === "object" ? state : null;
  const unchanged = isLive && target === "architect_cloud" && (state === "checking" || Boolean(known?.unchanged));
  // Who can use the live app, from what it makes public; the project's own plan until the server has answered.
  const access = known?.access ?? accessLine(bp, ws.project.settings.app?.hiddenEntities);

  // The build fix: start the build (or pick up one that was interrupted) right here, then show it running on the plan.
  const buildRunning = ws.build.mode === "build" && (ws.build.status === "running" || ws.build.status === "repair" || ws.build.status === "finishing");
  const interrupted = ws.project.buildState === "building" && !buildRunning;
  const buildLabel = buildRunning ? "Watch the build" : interrupted ? "Resume the build" : "Make it real";
  const buildDetail = buildRunning ? "Building now. Test runs happen near the end of the build." : interrupted ? "The build was interrupted before its test runs. Resume it to finish them." : null;

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
      // Make it real on the Sheet, where its price (and the choice to play the test runs) is shown first.
      router.push(`/p/${ws.project.id}`);
      return;
    }
    const r = await fixPreflight(ws.project.id, action);
    if (r.ok) toast.success(r.message ?? "Fixed", r.message ? undefined : { description: "Free · saved as a new version" });
    else toast.error(r.error);
    router.refresh();
  };

  async function deploy() {
    setDeploying(0);
    setTimeout(() => document.getElementById("deploy-progress")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
    const r = await goLive(ws.project.id, target, host || undefined).catch(() => ({ ok: false as const, error: "That didn't go through. Nothing changed on the live link. Try again in a moment." }));
    if (!r.ok) {
      setDeploying(null);
      return void toast.error(r.error);
    }
    if (target === "architect_cloud") {
      setDeploying(1);
      if (!(await liveAnswers(r.slug ?? ws.liveSlug ?? ""))) toast.error("It's published, but the live link didn't answer yet. Open it again in a moment.");
    }
    setDeploying(null);
    // What's live is the project as it is now, until the next change.
    if (target === "architect_cloud") setState((s) => (typeof s === "object" ? { ...s, unchanged: true } : s));
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

  const publishLabel = isLive && target === "architect_cloud" ? "Publish changes" : "Publish";
  const canPublish = ready && domainValid && deploying === null && !unchanged;
  const publishHint = !ready
    ? `Fix the ${blocking.length === 1 ? "item" : `${blocking.length} items`} above to publish.`
    : !domainValid
      ? "Fix the custom domain under More options to publish."
      : target !== "architect_cloud"
        ? `Prepares ${target === "vercel" ? "your Vercel project" : "a bundle for your network"} (sandbox).`
        : isLive && state === "checking"
          ? "Checking for changes since you published…"
          : unchanged
            ? "No changes since you published."
            : !known
              ? isLive
                ? "Replaces the live version with your latest changes. Rolling back is one click."
                : "Goes live on Prod Cloud. You can take it offline any time."
              : `${known.savesEdits ? `Saves your latest edits as version ${known.version} and puts it live` : `Puts version ${known.version} live`}${
                  !isLive ? " on Prod Cloud. You can take it offline any time." : liveVersion !== null ? ` in place of version ${liveVersion}. Rolling back is one click.` : ". Rolling back is one click."
                }`;
  const fixRow = (c: PreflightCheck) => {
    const action = c.fix?.action;
    if (!action) return null;
    return (
      <Button variant={c.id === primaryFix ? "default" : "outline"} className="shrink-0" disabled={pending} onClick={() => fix(action)}>
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
        {isLive && live && <LiveLink live={live} liveVersion={liveVersion} access={access} quiet={Boolean(canPublish || primaryFix)} />}

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
          <Button size="cta" disabled={!canPublish} onClick={deploy}>
            {deploying !== null ? (
              <>
                <Loader2 className="animate-spin" /> Publishing…
              </>
            ) : (
              publishLabel
            )}
          </Button>
          {target === "vpc" && <Button size="lg" variant="outline" onClick={downloadBundle}><Download /> Download bundle</Button>}
          <p className="text-ui text-muted-foreground">{publishHint}</p>
        </div>
        <DeployProgress steps={STEPS} at={deploying} />

        {/* The owner's controls for the published app: people, what's public, AI helpers for visitors, sample data. */}
        <AppControls />

        {/* After publishing: versions, rollback, and the way offline. */}
        <PublishedVersions deployments={deployments} history={history} live={live} pending={pending} start={start} />

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
              <p className="mt-1 text-ui text-muted-foreground">
                Publishing is free. Each message an AI helper answers with Claude costs <span className="tabular-nums text-foreground">{PRICE.helperMessage} credits</span> from your monthly credits, visitors&apos; messages on your published app included.
              </p>
              {ws.credits.guest ? (
                <p className="mt-2 text-ui text-muted-foreground">
                  As a guest, AI helpers answer from their script, free.{" "}
                  <Link href={`/login?next=${encodeURIComponent(`/p/${ws.project.id}/ship`)}`} className="text-brand underline decoration-dotted underline-offset-4 hover:text-brand-hi">
                    Sign in for {ws.credits.memberAllowance} free credits a month
                  </Link>
                </p>
              ) : (
                <p className="mt-2 text-lead font-semibold tabular-nums">
                  Enough for {messagesLeft.toLocaleString()} more {messagesLeft === 1 ? "message" : "messages"} this month{" "}
                  <span className="text-ui font-normal text-muted-foreground">· {Math.floor(ws.credits.left)} of {ws.credits.allowance} credits left</span>
                </p>
              )}
              <p className="mt-2 text-meta text-muted-foreground">
                Past your monthly credits or this project&apos;s spending cap ({ws.project.settings.budgetCapCredits} credits), AI helpers answer from their script or pause, and tell you. They never keep spending quietly.
              </p>
            </section>

            <p className="text-ui text-muted-foreground">
              Want to try it first? <Link href={`/p/${ws.project.id}/preview`} className="text-brand underline decoration-dotted underline-offset-4">Open the test version</Link> (version {ws.checkpoints[0]?.seq ?? 1}, only you, sample data).
            </p>
          </div>
        </details>
      </div>
      <AnimatePresence>{launched !== null && <LaunchMoment slug={launched} origin={origin} note={`${bp.meta.name} is online now. AI helpers keep the permissions and spending cap you set, and rolling back is one click.`} onClose={() => setLaunched(null)} />}</AnimatePresence>
    </div>
  );
}
