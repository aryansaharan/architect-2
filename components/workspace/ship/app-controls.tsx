"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlert, Copy, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { TimeAgo } from "@/components/time-ago";
import { clearSampleData, inviteMember, loadAppControls, removeMember, setHiddenEntity, setPublicHelpers, type AppControls as Controls } from "@/lib/actions/app-settings";
import { listWords, publicSummary } from "@/lib/sim/preflight";
import { PRICE } from "@/lib/prices";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";
import { Switch } from "./switch";
import { useOrigin } from "./use-origin";

type Busy = "invite" | "helpers" | "clear" | `remove:${string}` | `hide:${string}` | null;

/**
 * The owner's controls for the published app: who may use its team screens, what its public pages show,
 * whether visitors may talk to its AI helpers, and its sample data. Everything is read and decided on the
 * server (lib/actions/app-settings.ts); this only shows it and asks.
 */
export function AppControls() {
  const ws = useWorkspace();
  const router = useRouter();
  const origin = useOrigin();
  const projectId = ws.project.id;
  const [data, setData] = useState<Controls | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [hiddenLocal, setHiddenLocal] = useState<string[] | null>(null);
  const [helpersLocal, setHelpersLocal] = useState<boolean | null>(null);

  // Read again whenever the app goes online or offline (its link changes).
  const liveSlug = ws.liveSlug;
  useEffect(() => {
    let alive = true;
    loadAppControls(projectId).then(
      (r) => {
        if (!alive) return;
        if (r.ok) {
          setData(r);
          setLoadError(null);
        } else setLoadError(r.error);
      },
      () => alive && setLoadError("Check your connection and reload the page"),
    );
    return () => {
      alive = false;
    };
  }, [projectId, liveSlug]);

  const hidden = hiddenLocal ?? ws.project.settings.app?.hiddenEntities ?? [];
  const helpersOn = helpersLocal ?? Boolean(ws.project.settings.app?.publicHelpers);
  // What the published version's public pages show; before publishing, what they will show.
  const draftSummary = useMemo(() => publicSummary(ws.blueprint), [ws.blueprint]);
  const summary = data?.live?.summary ?? draftSummary;
  const live = data?.live ?? null;

  if (loadError) {
    return (
      <p className="mt-10 flex items-center gap-1.5 text-ui text-foreground">
        <CircleAlert className="size-3.5 shrink-0" aria-hidden />
        Couldn&apos;t load who can use the app. {loadError}.
      </p>
    );
  }
  if (!data) {
    return (
      <div className="mt-10 space-y-3" aria-hidden>
        <div className="skeleton h-7 w-32 rounded-sm" />
        <div className="skeleton h-24 rounded-md" />
      </div>
    );
  }

  const toggleHidden = async (entityId: string, hide: boolean) => {
    setBusy(`hide:${entityId}`);
    const r = await setHiddenEntity(projectId, entityId, hide);
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    setHiddenLocal(r.hiddenEntities);
    router.refresh();
  };
  const toggleHelpers = async (on: boolean) => {
    setBusy("helpers");
    const r = await setPublicHelpers(projectId, on);
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    setHelpersLocal(on);
    toast.success(on ? "Visitors can talk to your AI helpers" : "AI helpers are for your team only");
    router.refresh();
  };

  return (
    <>
      <People data={data} setData={setData} busy={busy} setBusy={setBusy} origin={origin} />

      <section aria-labelledby="whats-public" id="what-is-public" className="mt-10 scroll-mt-6">
        <h3 id="whats-public" className="font-pencil text-section">What&apos;s public</h3>
        {!summary.pages.length ? (
          <p className="mt-2 text-body text-muted-foreground">Everything is private to your team. This app has no public pages, so only you{live ? " and the people you invite" : ""} can open it.</p>
        ) : (
          <>
            <p className="mt-2 text-ui text-muted-foreground">
              Anyone with the link can open {listWords(summary.pages.map((p) => p.title))} without signing in. They see only what {summary.pages.length === 1 ? "this page shows" : "these pages show"}, never your team screens.
              {!live && " This is what the app will show once it's published."}
            </p>
            {summary.types.length ? (
              <ul className="panel mt-3 divide-y divide-hairline rounded-md">
                {summary.types.map((t) => {
                  const isHidden = hidden.includes(t.entityId);
                  return (
                    <li key={t.entityId} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-body font-medium">
                          {t.plural}
                          {isHidden ? <Pill>Hidden</Pill> : <Pill tone="ok">Public</Pill>}
                        </p>
                        {isHidden ? (
                          <p className="mt-0.5 text-ui text-muted-foreground">Kept off public pages. Nothing about them shows, and public forms for them stop taking new ones. Your team still sees everything.</p>
                        ) : (
                          <div className="mt-0.5 space-y-0.5 text-ui text-muted-foreground">
                            <p>{t.shows.length ? <>Shows <span className="text-foreground/90">{t.shows.join(", ")}</span>.</> : "Shows nothing from your records."}</p>
                            {t.collects.length > 0 && <p>Anyone can send in new ones with <span className="text-foreground/90">{t.collects.join(", ")}</span>.</p>}
                          </div>
                        )}
                      </div>
                      <label className="flex shrink-0 items-center gap-2 text-ui text-muted-foreground">
                        {busy === `hide:${t.entityId}` && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                        Hide from public pages
                        <Switch checked={isHidden} disabled={busy !== null} onChange={(v) => void toggleHidden(t.entityId, v)} label={`Hide ${t.plural.toLowerCase()} from public pages`} />
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-ui text-muted-foreground">{summary.pages.length === 1 ? "It doesn't" : "They don't"} show or collect any of your records.</p>
            )}
          </>
        )}
      </section>

      {/* Only meaningful when a public page has a chat with an AI helper. */}
      {summary.helpers.length > 0 && (
        <section aria-labelledby="public-helpers" className="mt-10">
          <h3 id="public-helpers" className="font-pencil text-section">AI helpers for visitors</h3>
          <div className="panel mt-3 flex items-start gap-4 rounded-md px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-body">Let visitors talk to the AI helpers on your public pages. Each message Claude answers uses {PRICE.helperMessage} of your credits.</p>
              <p className="mt-0.5 text-ui text-muted-foreground">
                On public pages: {listWords(summary.helpers.map((h) => h.name))}. {helpersOn ? "They keep their permissions and your spending cap, and anything that can't be undone still waits for a person." : "Off: only you and the people you invite can talk to them."}
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-2">
              {busy === "helpers" && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />}
              <Switch checked={helpersOn} disabled={busy !== null} onChange={(v) => void toggleHelpers(v)} label="Let visitors talk to the AI helpers on your public pages" />
            </span>
          </div>
        </section>
      )}

      {live && <SampleData data={data} setData={setData} busy={busy} setBusy={setBusy} />}
    </>
  );
}

type SectionProps = { data: Controls; setData: (fn: (d: Controls | null) => Controls | null) => void; busy: Busy; setBusy: (b: Busy) => void };

function People({ data, setData, busy, setBusy, origin }: SectionProps & { origin: string }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<{ email: string; status: "failed" | "not_configured" } | null>(null);
  const live = data.live;
  const link = live ? `${origin}/live/${live.slug}` : "";
  const full = data.members.length >= data.maxMembers;

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!address) return setError("Type the email address of the person to invite.");
    setBusy("invite");
    setError(null);
    const r = await inviteMember(ws.project.id, address);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setData((d) => (d ? { ...d, members: [r.member, ...d.members] } : d));
    setEmail("");
    if (r.email === "sent") {
      setShare(null);
      toast.success("Invitation sent", { description: r.member.email });
    } else setShare({ email: r.member.email, status: r.email });
    router.refresh();
  }

  async function remove(address: string) {
    setBusy(`remove:${address}`);
    const r = await removeMember(ws.project.id, address);
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    setData((d) => (d ? { ...d, members: d.members.filter((m) => m.email !== address) } : d));
    if (share?.email === address) setShare(null);
    toast.success("Removed", { description: `${address} can't open the team screens any more.` });
    router.refresh();
  }

  const copy = () => {
    void navigator.clipboard.writeText(link);
    toast.success("Link copied", { description: link });
  };

  return (
    <section aria-labelledby="people" className="mt-10">
      <h3 id="people" className="font-pencil text-section">People</h3>
      <p className="mt-2 text-ui text-muted-foreground">Team screens are private to you and the people you invite. They sign in with Google or an email link, using the address you invited.</p>

      {data.isGuest ? (
        <div className="panel mt-3 rounded-md p-4">
          <p className="text-body">You&apos;re using Prod AI as a guest, so only you can open the team screens.</p>
          <p className="mt-0.5 text-ui text-muted-foreground">An invitation comes from your name and email address. Sign in first, and everything you made stays yours.</p>
          <Button asChild className="mt-3">
            <Link href={`/login?next=${encodeURIComponent(`/p/${ws.project.id}/ship`)}`}>Sign in to invite people</Link>
          </Button>
        </div>
      ) : !live ? (
        <p className="mt-3 rounded-md border border-dashed border-hairline-hi px-4 py-3 text-ui text-muted-foreground">Publish the app first. Then you can invite people to its team screens.</p>
      ) : (
        <>
          <form onSubmit={invite} noValidate className="mt-3 flex max-w-lg gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              placeholder="name@company.com"
              aria-label="Email address to invite"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "invite-error" : undefined}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={full}
              maxLength={254}
            />
            <Button type="submit" disabled={busy !== null || full}>
              {busy === "invite" ? <Loader2 className="animate-spin" /> : null} Invite
            </Button>
          </form>
          {error && (
            <p id="invite-error" role="alert" className="mt-1.5 flex items-center gap-1.5 text-meta font-medium text-foreground">
              <CircleAlert className="size-3.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}
          {!error && !data.emailReady && !share && <p className="mt-1.5 text-meta text-muted-foreground">Email isn&apos;t set up on this copy of Prod AI yet. After you invite someone, you&apos;ll get the link to send them yourself.</p>}

          {share && (
            <div role="status" className="mt-3 max-w-lg rounded-md border border-dashed border-hairline-hi bg-panel p-3">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-ui">{share.status === "not_configured" ? "Email isn't set up yet. Send them this link:" : "The email didn't go through. Send them this link:"}</p>
                <Button variant="ghost" size="icon-xs" aria-label="Dismiss" className="text-muted-foreground" onClick={() => setShare(null)}><X /></Button>
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-md border border-hairline bg-canvas p-1.5 pl-3">
                <code className="min-w-0 flex-1 truncate font-mono text-code" title={link}>{link}</code>
                <Button size="sm" variant="outline" className="shrink-0" onClick={copy}><Copy /> Copy</Button>
              </div>
              <p className="mt-1.5 text-meta text-muted-foreground">They sign in with {share.email} to see the team screens.</p>
            </div>
          )}

          {data.members.length > 0 ? (
            <>
              <ul aria-label="People invited" className="panel mt-3 divide-y divide-hairline rounded-md">
                {data.members.map((m) => (
                  <li key={m.email} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-ui font-medium" title={m.email}>{m.email}</span>
                    {m.acceptedAt ? <Pill tone="ok" dot>Joined</Pill> : <Pill>Invited</Pill>}
                    <span className="text-meta text-muted-foreground">
                      {m.acceptedAt ? "joined " : "invited "}
                      <TimeAgo iso={m.acceptedAt ?? m.invitedAt} />
                    </span>
                    <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void remove(m.email)} aria-label={`Remove ${m.email}`} className="text-muted-foreground">
                      {busy === `remove:${m.email}` ? <Loader2 className="animate-spin" /> : null} Remove
                    </Button>
                  </li>
                ))}
              </ul>
              <p className={cn("mt-1.5 text-meta tabular-nums", full ? "text-foreground" : "text-muted-foreground")}>
                {data.members.length} of {data.maxMembers} people{full ? ". Remove someone to invite another." : ""}
              </p>
            </>
          ) : (
            <p className="mt-3 text-ui text-muted-foreground">No one yet. Right now only you can open the team screens.</p>
          )}
        </>
      )}
    </section>
  );
}

function SampleData({ data, setData, busy, setBusy }: SectionProps) {
  const ws = useWorkspace();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  async function clear() {
    setBusy("clear");
    const r = await clearSampleData(ws.project.id);
    setBusy(null);
    setConfirming(false);
    if (!r.ok) return void toast.error(r.error);
    setData((d) => (d ? { ...d, hasSample: false } : d));
    toast.success(r.cleared ? `Cleared ${r.cleared} sample record${r.cleared === 1 ? "" : "s"}` : "No sample data left", { description: "Records people added are untouched." });
    router.refresh();
  }

  return (
    <section aria-labelledby="sample-data" className="mt-10">
      <h3 id="sample-data" className="font-pencil text-section">Sample data</h3>
      {data.hasSample ? (
        <div className="panel mt-3 rounded-md p-4">
          <Pill dot>Has sample data</Pill>
          <p className="mt-2 text-body">The published app still holds the plan&apos;s sample records, marked as samples. Clear them before real people rely on it.</p>
          {confirming ? (
            <div role="group" aria-label="Confirm clearing sample data" className="mt-3 rounded-md border border-ask/35 bg-ask/[0.05] p-3">
              <p className="text-ui">Delete every sample record from the published app? Records people added stay, and your test version keeps its samples. This can&apos;t be undone.</p>
              <div className="mt-3 flex gap-2">
                <Button variant="destructive" disabled={busy !== null} onClick={() => void clear()}>
                  {busy === "clear" ? <Loader2 className="animate-spin" /> : null} Clear sample data
                </Button>
                <Button variant="ghost" disabled={busy !== null} autoFocus onClick={() => setConfirming(false)}>Keep them</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" className="mt-3" disabled={busy !== null} onClick={() => setConfirming(true)}>Clear sample data…</Button>
          )}
        </div>
      ) : (
        <p className="mt-2 text-ui text-muted-foreground">No sample data left. Everything in the published app was added by people using it.</p>
      )}
    </section>
  );
}
