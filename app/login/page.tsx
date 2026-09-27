import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { AuthPanel } from "@/components/auth/auth-panel";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/home";
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const user = await getSessionUser();
  if (user && !user.isAnonymous && !error) redirect(next);
  const isGuest = Boolean(user?.isAnonymous);

  return (
    <main id="main" className="relative grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden border-r border-hairline lg:block">
        <div className="dot-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_30%_40%,black,transparent_75%)]" />
        <div aria-hidden className="solstice-orb -left-[30%] -top-[30%] h-[720px] w-[720px] opacity-[0.38]" />
        <div aria-hidden className="solstice-orb -bottom-[30%] -right-[35%] h-[560px] w-[560px] opacity-[0.22] [animation-direction:reverse] [animation-duration:36s]" />
        <div className="relative flex h-full flex-col justify-between p-10">
          <Logo />
          <div className="max-w-md">
            <p className="font-display text-[48px] leading-[1.05] tracking-tight text-foreground">
              {"Agents that".split(" ").map((w, i) => <span key={i} className="word-in mr-[0.25em]" style={{ animationDelay: `${i * 80}ms` }}>{w}</span>)}
              {"ask before they act.".split(" ").map((w, i) => <em key={i} className="word-in text-amber-grad mr-[0.25em] last:mr-0" style={{ animationDelay: `${180 + i * 80}ms` }}>{w}</em>)}
            </p>
            <ul className="fade-up mt-8 space-y-3 text-[14px] text-muted-foreground" style={{ animationDelay: "600ms" }}>
              <li className="flex gap-3"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber shadow-[0_0_10px_rgb(223_255_79/0.8)]" />See the plan and the price before anything runs.</li>
              <li className="flex gap-3"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber shadow-[0_0_10px_rgb(223_255_79/0.8)]" />When a build breaks, it shows you what it tried, and you don&apos;t pay for its fixes.</li>
              <li className="flex gap-3"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber shadow-[0_0_10px_rgb(223_255_79/0.8)]" />Every change is a save point you can return to.</li>
            </ul>
          </div>
          <p className="micro-label">Built for Lyzr · Architect 2.0 prototype</p>
        </div>
      </section>
      <section className="flex flex-col items-center justify-center px-6 py-16">
        <div className="mb-10 lg:hidden"><Logo /></div>
        <div className="fade-up w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">{isGuest ? "Keep your work" : "Sign in to Prod AI"}</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            {isGuest
              ? "You're exploring as a guest. Connect an account and everything you've built comes with you."
              : "One account for the people who describe apps and the people who ship them."}
          </p>
        </div>
        <div className="fade-up mt-8 w-full max-w-sm" style={{ animationDelay: "150ms" }}>
          <AuthPanel next={next} error={error} isGuest={isGuest} />
        </div>
        <p className="mt-10 text-center text-xs text-muted-foreground">
          <Link href="/" className="underline-offset-4 hover:underline">Back to the overview</Link>
        </p>
      </section>
    </main>
  );
}
