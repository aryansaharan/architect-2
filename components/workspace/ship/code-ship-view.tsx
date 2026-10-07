"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AnimatePresence } from "motion/react";
import { Check, CircleAlert, Info, Loader2 } from "lucide-react";
import type { DeploymentRow } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { canGoLive, codeAccessLine, codePreflight, collectionWords, type PreflightCheck } from "@/lib/sim/preflight";
import { goLive, publishState, type PublishState } from "@/lib/actions/ship";
import { setPublicHelpers } from "@/lib/actions/app-settings";
import { PRICE } from "@/lib/prices";
import { cn } from "@/lib/utils";
import { useCodeApp, useLastRun } from "@/components/code-apps/around-code-app";
import { useWorkspace } from "../context";
import { DeployProgress, liveAnswers, LaunchMoment, LiveLink, PublishedVersions, versionHistory } from "./published";
import { Switch } from "./switch";
import { useOrigin } from "./use-origin";

/**
 * Publish for a code app: four checks (it builds, it starts, what it stores, whether it uses AI), one
 * Publish button, then the live link, versions, rollback and the way offline as for every app. A code
 * app is always public (its collections' rules protect its data), so there are no people to invite and
 * no sample data. The server checks everything again when it publishes.
 */
export function CodeShipView({ deployments }: { deployments: DeploymentRow[] }) {
  const ws = useWorkspace();
  const router = useRouter();
  const origin = useOrigin();
  const { manifest, build } = useCodeApp();
  const run = useLastRun(ws.project.id, build?.hash);
  const [helpersLocal, setHelpersLocal] = useState<boolean | null>(null);
  const [helpersBusy, setHelpersBusy] = useState(false);
  const publicHelpers = helpersLocal ?? Boolean(ws.project.settings.app?.publicHelpers);
  const title = manifest?.title || ws.project.name;

  const checks = useMemo(() => codePreflight({ build, run, manifest, publicHelpers }), [build, run, manifest, publicHelpers]);
  const ready = canGoLive(checks);
  const blocking = checks.filter((c) => c.blocking && c.status === "fail");
  const primaryFix = blocking.find((c) => c.fix)?.id ?? null;

  const [pending, start] = useTransition();
  const [deploying, setDeploying] = useState<number | null>(null);
  const [launched, setLaunched] = useState<string | null>(null);
  const live = deployments.find((d) => d.status === "live");
  const isLive = Boolean(live && ws.liveSlug);
  const liveVersion = live?.checkpoint_id ? (ws.checkpoints.find((c) => c.id === live.checkpoint_id)?.seq ?? null) : null;
  const history = useMemo(() => versionHistory(deployments, ws.checkpoints, isLive ? (live?.checkpoint_id ?? null) : null, 6), [deployments, ws.checkpoints, isLive, live]);
  // What publishing would do now: which version goes live, and whether what's live is already this build of
  // these files (the server compares them). Asked again when the versions or what's published change.
  const [state, setState] = useState<PublishState | "checking" | "unknown">("checking");
  useEffect(() => {
    let gone = false;
    publishState(ws.project.id)
      .then((s) => !gone && setState(s ?? "unknown"))
      .catch(() => !gone && setState("unknown"));
    return () => {
      gone = true;
    };
  }, [ws.project.id, ws.checkpoints, ws.codeBuild, ws.liveSlug, deployments]);
  const known = typeof state === "object" ? state : null;
  const checking = isLive && state === "checking";
  const unchanged = isLive && Boolean(known?.unchanged);

  // Two real steps: publish this build, then load the live link to check it answers.
  const steps = ["Publishing the latest build", "Checking the live link answers"];
  async function publish() {
    setDeploying(0);
    setTimeout(() => document.getElementById("deploy-progress")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
    const r = await goLive(ws.project.id, "architect_cloud").catch(() => ({ ok: false as const, error: "That didn't go through. Nothing changed on the live link. Try again in a moment." }));
    if (!r.ok) {
      setDeploying(null);
      return void toast.error(r.error);
    }
    const slug = r.slug ?? ws.liveSlug ?? "";
    setDeploying(1);
    if (!(await liveAnswers(slug))) toast.error("It's published, but the live link didn't answer yet. Open it again in a moment.");
    setDeploying(null);
    setLaunched(slug);
    router.refresh();
  }

  const toggleHelpers = async (on: boolean) => {
    setHelpersBusy(true);
    const r = await setPublicHelpers(ws.project.id, on);
    setHelpersBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setHelpersLocal(on);
    toast.success(on ? "Visitors can use the app's AI" : "Only you can use the app's AI");
    router.refresh();
  };

  const canPublish = ready && deploying === null && !unchanged && !checking;
  const publishHint = checking
    ? "Checking for changes since you published…"
    : !ready
      ? `Fix the ${blocking.length === 1 ? "item" : `${blocking.length} items`} above to publish.`
      : unchanged
        ? "No changes since you published."
        : isLive
          ? `Puts ${known ? `version ${known.version}` : "your latest version"} live${liveVersion !== null ? ` in place of version ${liveVersion}` : ""}. Rolling back is one click.`
          : "Goes live on Prod Cloud. You can take it offline any time.";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
        <h2 className="font-pencil text-title">Publish</h2>
        <p className="mt-2 text-body text-muted-foreground">
          {isLive ? "Your app is online. What you change here stays in your test version until you publish again." : `Put ${title} online so anyone with the link can use it. You can take it back any time.`}
        </p>

        {isLive && live && <LiveLink live={live} liveVersion={liveVersion} access={codeAccessLine} quiet={Boolean(canPublish || primaryFix)} />}

        <section aria-labelledby="checks" className="mt-8">
          {blocking.length > 0 ? (
            <h3 id="checks" className="font-pencil text-section">Fix {blocking.length === 1 ? "this" : `these ${blocking.length}`} first</h3>
          ) : (
            <h3 id="checks" className="flex items-center gap-2 font-pencil text-section text-ok">
              <Check className="size-5" strokeWidth={2.5} aria-hidden />
              Ready to go live
            </h3>
          )}
          <ul className="mt-3 space-y-2">
            {checks.map((c) => (
              <CheckRow key={c.id} c={c} primary={c.id === primaryFix} hideDetail={c.id === "stores" && Boolean(manifest?.collections.length)}>
                {c.id === "stores" && manifest && manifest.collections.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-ui text-muted-foreground">
                    {manifest.collections.map((col) => (
                      <li key={col.name}>
                        <span className="text-foreground/90">{col.label.trim() || col.name}</span>: {collectionWords(col)}
                      </li>
                    ))}
                  </ul>
                ) : c.id === "ai" && manifest?.usesAI ? (
                  <label className="mt-2 flex items-center gap-2 text-ui text-muted-foreground">
                    <Switch checked={publicHelpers} disabled={helpersBusy} onChange={(v) => void toggleHelpers(v)} label={`Let visitors use the app's AI, ${PRICE.helperMessage} credits a call from your credits`} />
                    Let visitors use it too
                    {helpersBusy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                  </label>
                ) : null}
              </CheckRow>
            ))}
          </ul>
          {/* Code apps have no private version yet: say so where it's decided. */}
          <p className="mt-4 flex items-start gap-2 rounded-md border border-dashed border-hairline-hi px-4 py-3 text-ui text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Apps written as code are always public for now: anyone with the link can open it, and there&apos;s no sign-in wall or people to invite. Who can read and add records is set for each collection above, and the server holds to it.
            </span>
          </p>
        </section>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="cta" disabled={!canPublish} onClick={() => void publish()}>
            {deploying !== null ? (
              <>
                <Loader2 className="animate-spin" /> Publishing…
              </>
            ) : isLive ? (
              "Publish changes"
            ) : (
              "Publish"
            )}
          </Button>
          <p className="text-ui text-muted-foreground">{publishHint}</p>
        </div>
        <DeployProgress steps={steps} at={deploying} />

        <PublishedVersions deployments={deployments} history={history} live={live} pending={pending} start={start} />
      </div>
      <AnimatePresence>
        {launched !== null && <LaunchMoment slug={launched} origin={origin} note={`${title} is online now. Anyone with the link can use it, and rolling back is one click.`} onClose={() => setLaunched(null)} />}
      </AnimatePresence>
    </div>
  );
}

/** One check: passed (a tick), needs fixing (ink with an icon and the way to fix it), or worth reading (dashed). */
function CheckRow({ c, primary, hideDetail, children }: { c: PreflightCheck; primary: boolean; hideDetail?: boolean; children?: React.ReactNode }) {
  const ws = useWorkspace();
  const must = c.blocking && c.status === "fail";
  const info = c.status === "info";
  return (
    <li className={cn("flex flex-wrap items-start gap-x-4 gap-y-2 rounded-md border px-4 py-3", must ? "border-hairline-hi bg-panel" : info ? "border-dashed border-hairline-hi bg-panel" : "border-hairline bg-panel")}>
      {must ? <CircleAlert className="mt-1 size-4 shrink-0 text-foreground" aria-hidden /> : info ? <Info className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden /> : <Check className="mt-1 size-4 shrink-0 text-ok" strokeWidth={2.5} aria-hidden />}
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium">
          {c.label}
          {info && <span className="ml-2 text-meta font-normal text-muted-foreground">read before you publish</span>}
        </p>
        {/* The collections are listed one per line instead of in one sentence. */}
        {!hideDetail && <p className="mt-0.5 text-ui text-muted-foreground">{c.detail}</p>}
        {children}
      </div>
      {must && c.fix && (
        <Button asChild variant={primary ? "default" : "outline"} className="shrink-0">
          <Link href={`/p/${ws.project.id}`}>{c.fix.label}</Link>
        </Button>
      )}
    </li>
  );
}
