import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-5 sm:px-6">
          <Logo />
          <Link href="/" className="ml-auto inline-flex min-h-9 items-center text-ui text-muted-foreground transition-colors duration-150 hover:text-foreground">
            Back to the start
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-5 pb-20 pt-12 sm:px-6 sm:pt-16">
        <h1 className="font-pencil text-title">{title}</h1>
        <p className="mt-2 text-meta text-muted-foreground">Last updated {updated}</p>
        <div className="panel mt-8 space-y-4 rounded-md p-6 text-body text-foreground sm:p-9 [&_a]:text-brand [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-4 [&_h2]:mt-8 [&_h2]:font-(family-name:--font-pencil) [&_h2]:font-medium [&_h2]:text-section [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-2">
          {children}
        </div>
      </main>
    </div>
  );
}
