import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo, GitHubMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { LandingComposer } from "@/components/landing/landing-composer";
import { PencilArrow, PencilBox, PlanSketch, RealSketch, WriteSketch } from "@/components/landing/sketches";
import { getSessionUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/env";

const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/aryansaharan/architect-2";

const STEPS = [
  { title: "Write it", body: "Say what you want in your own words, the way you'd explain it to a friend.", Sketch: WriteSketch },
  { title: "See the sketch", body: "Prod AI draws the screens and the AI helpers in pencil. You see the price before anything is built.", Sketch: PlanSketch },
  { title: "Make it real", body: "It becomes a real app. Change it with notes in the margin. AI helpers ask before doing anything that can't be undone.", Sketch: RealSketch },
];

const FRAMEWORKS = ["Lyzr ADK", "LangGraph", "CrewAI", "OpenAI Agents SDK", "Google ADK", "Mastra"];

const WORKS = [
  "Sign in with Google or an email link, or try it as a guest",
  "Sign in and Claude plans your app from your own words. Guests start from the closest starter plan.",
  "Your projects are saved to your account, and only you can see them",
  "AI helpers you can talk to, which ask before anything that can't be undone",
  "Bring a public GitHub repo, and get code for six agent frameworks",
  "A public link for every app you publish",
];

const TEST_MODE = [
  "Making it real follows a set script. The plan, the code and the data are yours.",
  "Pull requests to GitHub stay in a sandbox",
  "Email, payments and other outside services run on test data",
];

/** A small button's tap area, grown to 40px on touch screens without changing how it looks. */
const TAP = "relative after:absolute after:inset-x-0 after:-inset-y-1";

export default async function Landing() {
  const user = hasSupabase() ? await getSessionUser() : null;
  const member = Boolean(user && !user.isAnonymous);

  return (
    <div className="min-h-screen overflow-x-clip">
      <header className="top-0 z-30 border-b border-hairline bg-canvas/95 [position:sticky]">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-7 px-5 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-6 text-ui text-muted-foreground md:flex" aria-label="Sections">
            <a href="#how" className="transition-colors duration-150 hover:text-foreground">How it works</a>
            <a href="#developers" className="transition-colors duration-150 hover:text-foreground">For developers</a>
            <Link href="/architecture" className="transition-colors duration-150 hover:text-foreground">Architecture</Link>
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            {member ? (
              <Button asChild variant="outline" className={TAP}>
                <Link href="/home">Your projects <ArrowRight /></Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" className={TAP}>
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild variant="outline" className={TAP}>
                  <Link href={user ? "/new" : `/login?next=${encodeURIComponent("/new")}`}>Start building</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero: say what you want. */}
        <section className="mx-auto max-w-3xl px-5 pb-10 pt-14 text-center sm:px-6 sm:pt-20">
          <h1 className="text-balance font-pencil text-[46px] sm:text-hero">
            <span className="pencil-underline">Sketch</span> your app.
            <br />
            <em>Get a production app.</em>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lead text-muted-foreground">
            Write what you want in plain words. Prod AI draws it in pencil first, then makes it a real app when you say so.
          </p>
        </section>

        <section aria-label="Start with a note" className="relative mx-auto max-w-3xl px-5 sm:px-6">
          <LandingComposer signedIn={Boolean(user)} />
          <div className="pointer-events-none absolute -right-52 top-24 hidden w-48 xl:block" aria-hidden>
            <p className="font-pencil text-note leading-tight text-muted-foreground">no forms, no tech words. just write.</p>
            <PencilArrow className="-ml-6 mt-1 w-28" />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 pt-14 sm:px-6 sm:pt-20">
          <h2 className="text-center font-pencil text-title">How it works</h2>
          <ol className="mt-12 grid gap-14 md:grid-cols-3 md:gap-10">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex flex-col items-center text-center">
                <s.Sketch className="h-auto w-full max-w-[300px]" />
                <h3 className="mt-5 font-pencil text-section">
                  <span className="text-brand">{i + 1}.</span> {s.title}
                </h3>
                <p className="mt-3 max-w-xs text-body text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* The product, once */}
        <section className="mx-auto max-w-5xl px-5 pt-14 sm:px-6 sm:pt-20" aria-label="What a project looks like">
          <figure>
            <div className="panel overflow-hidden rounded-md p-1.5">
              <Image
                src="/showcase/studio.png"
                alt="A project in Prod AI: the app's screens, its AI helpers and the price on one sheet, with notes in the margin"
                width={1440}
                height={900}
                className="block h-auto w-full rounded-sm"
              />
            </div>
            <figcaption className="mt-5 text-balance text-center font-pencil text-note leading-tight text-muted-foreground">
              Your app, its AI helpers and what it costs, on one sheet. Write in the margin to change it.
            </figcaption>
          </figure>
        </section>

        {/* For developers */}
        <section id="developers" className="mx-auto max-w-6xl scroll-mt-20 px-5 pt-14 sm:px-6 sm:pt-20">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <div>
              <p className="font-sketch text-sketch text-muted-foreground">For developers</p>
              <h2 className="mt-2 font-pencil text-title">Under the sketch, it&apos;s real code.</h2>
              <p className="mt-4 max-w-md text-lead text-muted-foreground">
                The sketch is for everyone on the team. The code is yours: readable, in a framework you already know, and never locked in.
              </p>
              <Link href="/architecture" className="mt-4 inline-flex min-h-9 items-center gap-1.5 text-body font-medium text-brand underline decoration-dotted underline-offset-4">
                See how it&apos;s built <ArrowRight className="size-4" />
              </Link>
            </div>
            <ul className="space-y-7">
              <li className="flex gap-4">
                <PencilBox on seed={3} />
                <div>
                  <h3 className="text-lead font-semibold">Real code in six agent frameworks</h3>
                  <p className="mt-1 text-body text-muted-foreground">Every AI helper is a set of files you can read, with runtime code for the framework you choose.</p>
                  <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Frameworks">
                    {FRAMEWORKS.map((f) => (
                      <li key={f} className="rounded-full border border-hairline-hi px-2.5 py-0.5 font-sketch text-sketch text-foreground">{f}</li>
                    ))}
                  </ul>
                </div>
              </li>
              <li className="flex gap-4">
                <PencilBox on seed={5} />
                <div>
                  <h3 className="text-lead font-semibold">Bring your GitHub repo. It stays untouched.</h3>
                  <p className="mt-1 text-body text-muted-foreground">Prod AI reads it first, writes down what it must never change, and sends every change as a pull request for you to review.</p>
                </div>
              </li>
              <li className="flex gap-4">
                <PencilBox on seed={7} />
                <div>
                  <h3 className="text-lead font-semibold">Open the code anywhere</h3>
                  <p className="mt-1 text-body text-muted-foreground">Take it to Cursor, Claude Code or your own editor whenever you want the wheel, and bring it back.</p>
                </div>
              </li>
            </ul>
          </div>
        </section>

        {/* What works today, said once and plainly. */}
        <section id="real" className="mx-auto max-w-4xl scroll-mt-20 px-5 pt-14 sm:px-6 sm:pt-20">
          <h2 className="font-pencil text-section">What works today</h2>
          <div className="mt-6 grid gap-8 sm:grid-cols-2">
            <div>
              <p className="font-sketch text-sketch text-foreground">Works today</p>
              <ul className="mt-3 space-y-2.5">
                {WORKS.map((t) => (
                  <li key={t} className="flex gap-3 text-body">
                    <span className="mt-0.5"><PencilBox on seed={t.length} /></span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-sketch text-sketch text-foreground">In test mode for now</p>
              <ul className="mt-3 space-y-2.5">
                {TEST_MODE.map((t) => (
                  <li key={t} className="flex gap-3 text-body text-muted-foreground">
                    <span className="mt-0.5"><PencilBox on={false} seed={t.length} /></span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-16 border-t border-hairline sm:mt-24">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-8 text-ui text-muted-foreground sm:px-6">
          <Logo />
          <span>Made by Aryan Saharan.</span>
          <nav className="flex items-center gap-5 sm:ml-auto" aria-label="Footer">
            <Link href="/privacy" className="inline-flex min-h-9 items-center transition-colors duration-150 hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="inline-flex min-h-9 items-center transition-colors duration-150 hover:text-foreground">Terms</Link>
            <a href={REPO_URL} className="inline-flex min-h-9 items-center gap-1.5 transition-colors duration-150 hover:text-foreground" target="_blank" rel="noreferrer">
              <GitHubMark /> Source
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
