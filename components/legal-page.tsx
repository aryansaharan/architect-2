import { Logo } from "@/components/brand/logo";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-6"><Logo /></div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-[28px] font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Last updated {updated}</p>
        <div className="mt-8 space-y-5 text-[14.5px] leading-relaxed text-foreground/85 [&_h2]:mt-8 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc">{children}</div>
      </main>
    </div>
  );
}
