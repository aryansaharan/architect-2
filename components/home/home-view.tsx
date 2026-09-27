import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { UserMenuView } from "@/components/workspace/top-bar";
import { Button } from "@/components/ui/button";
import { Greeting } from "./greeting";
import { HomeComposer } from "./home-composer";
import { ProjectCard, type HomeProject } from "./project-card";

/** The same items, in the same order, as the Settings header (app/settings/page.tsx). */
const MAIN_NAV = [
  { href: "/home", label: "Projects" },
  { href: "/settings#connections", label: "Connections" },
  { href: "/settings#usage", label: "Usage" },
  { href: "/settings", label: "Settings" },
];

export function HomeView({
  user,
  projects,
  credits,
  cap,
}: {
  user: { name: string; isAnonymous: boolean; avatarUrl: string | null };
  projects: HomeProject[];
  credits: number;
  cap: number;
}) {
  const first = user.name.split(" ")[0];
  return (
    <div className="min-h-screen">
      <header className="top-0 z-20 border-b border-hairline bg-canvas/95 [position:sticky]">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5 sm:px-6">
          <Logo href="/home" />
          <nav className="ml-4 hidden items-center gap-1 text-[13px] md:flex" aria-label="Main">
            {MAIN_NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={n.href === "/home" ? "page" : undefined}
                className={n.href === "/home" ? "rounded-md bg-raised px-2.5 py-1.5 font-medium" : "rounded-md px-2.5 py-1.5 text-muted-foreground hover:text-foreground"}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden font-mono text-[12px] text-muted-foreground sm:inline">
              {Math.round(credits)} / {cap} cr this month
            </span>
            <UserMenuView name={user.name} isAnonymous={user.isAnonymous} avatarUrl={user.avatarUrl} />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-5 pb-24 pt-10 sm:px-6 sm:pt-14">
        {user.isAnonymous && (
          <div className="mb-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-dashed border-hairline-hi px-4 py-3 text-[13.5px] text-muted-foreground">
            <span>You&apos;re trying Prod AI as a guest. Everything works. Sign in any time and your work comes with you.</span>
            <Button asChild size="sm" variant="outline" className="ml-auto h-8 bg-panel">
              <Link href="/login?next=/home">Keep this work</Link>
            </Button>
          </div>
        )}

        <section aria-labelledby="greeting">
          <h1 id="greeting" className="font-display text-[46px] leading-none sm:text-[58px]">
            <Greeting name={user.isAnonymous ? undefined : first} />
          </h1>
          <div className="mt-7">
            <HomeComposer />
          </div>
        </section>

        <section aria-labelledby="projects-heading" className="mt-16 sm:mt-20">
          <h2 id="projects-heading" className="flex items-baseline gap-3 font-display text-[34px] leading-none">
            Your projects
            {projects.length > 0 && <span className="font-sans text-[13px] text-faint">{projects.length}</span>}
          </h2>
          {projects.length === 0 ? (
            <p className="mt-4 font-pencil text-[23px] leading-snug text-muted-foreground">Nothing here yet. Your first app is one sentence away.</p>
          ) : (
            <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p, i) => (
                <li key={p.id}>
                  <ProjectCard p={p} seed={i + 1} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
