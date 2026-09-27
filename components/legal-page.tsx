import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-5 sm:px-6">
          <Logo />
          <Link href="/" className="ml-auto text-[13px] text-muted-foreground hover:text-foreground">
            Back to the start
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-5 pb-20 pt-12 sm:px-6 sm:pt-16">
        <h1 className="font-display text-[48px] leading-none sm:text-[56px]">{title}</h1>
        <p className="mt-3 font-sketch text-[13px] text-muted-foreground">Last updated {updated}</p>
        <div className="panel mt-8 space-y-5 rounded-2xl p-6 text-[15px] leading-relaxed text-foreground/85 sm:p-9 [&_a]:text-brand [&_a]:underline-offset-4 [&_a:hover]:underline [&_h2]:mt-9 [&_h2]:font-display [&_h2]:text-[30px] [&_h2]:font-medium [&_h2]:leading-none [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-2">
          {children}
        </div>
      </main>
    </div>
  );
}
