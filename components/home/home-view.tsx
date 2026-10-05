import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { EntryOnce } from "@/components/motion/entry-once";
import motion from "@/components/motion/entry-motion.module.css";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import type { CreditMeter } from "@/lib/prices";
import { Greeting } from "./greeting";
import { HomeComposer } from "./home-composer";
import { ProjectCard, type HomeProject } from "./project-card";

export function HomeView({
  user,
  projects,
  credits,
  capMessage = null,
}: {
  user: { name: string; isAnonymous: boolean; avatarUrl: string | null };
  projects: HomeProject[];
  credits: CreditMeter;
  /** Set when the person can't keep another project: said before they write. */
  capMessage?: string | null;
}) {
  const first = user.name.split(" ")[0];
  return (
    <div className="min-h-screen">
      <AppHeader current="/home" user={user} credits={credits} />

      <main id="main" className="mx-auto max-w-5xl px-5 pb-24 pt-10 sm:px-6 sm:pt-14">
        {user.isAnonymous && (
          <div className="mb-10 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-md border border-dashed border-hairline-hi px-4 py-3 text-body text-muted-foreground">
            <p className="min-w-0 flex-1 basis-72">
              You&apos;re trying Prod AI as a guest, so new apps start from the closest starter plan. Sign in for {credits.memberAllowance} free credits a month and Claude plans them from your own words. Your work comes with you.
            </p>
            {/* At the guest cap the note under the greeting carries the sign-in, so it isn't offered twice. */}
            {!capMessage && (
              <Button asChild variant="outline" className="relative after:absolute after:inset-x-0 after:-inset-y-1">
                <Link href="/login?next=/home">Sign in to keep this work</Link>
              </Button>
            )}
          </div>
        )}

        <section aria-labelledby="greeting">
          <h1 id="greeting" className="font-pencil text-title">
            <Greeting name={user.isAnonymous ? undefined : first} />
          </h1>
          <div className="mt-6">
            <HomeComposer capMessage={capMessage} isGuest={user.isAnonymous} />
          </div>
        </section>

        <section aria-labelledby="projects-heading" className="mt-16 sm:mt-20">
          <h2 id="projects-heading" className="flex items-center gap-3 font-pencil text-section">
            Your projects
            {projects.length > 0 && (
              <Pill className="font-sans">
                <span className="text-badge tabular-nums">{projects.length}</span>
              </Pill>
            )}
          </h2>
          {projects.length === 0 ? (
            <p className="mt-4 font-pencil text-note leading-tight text-muted-foreground">Nothing here yet. Your first app is one sentence away.</p>
          ) : (
            // The cards are laid down one after another on the first visit of the session; after that they're simply there.
            <EntryOnce id="home-cards">
              <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((p, i) => (
                  <li key={p.id} className={motion.cardIn} style={{ "--entry-i": i } as React.CSSProperties}>
                    <ProjectCard p={p} seed={i + 1} />
                  </li>
                ))}
              </ul>
            </EntryOnce>
          )}
        </section>
      </main>
    </div>
  );
}
