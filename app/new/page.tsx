import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Logo } from "@/components/brand/logo";
import { NewProject } from "@/components/new/new-project";
import { ImportWizard } from "@/components/import/import-wizard";
import { llmMode } from "@/lib/llm/provider";

export const metadata = { title: "New project" };

export default async function NewPage(props: PageProps<"/new">) {
  const sp = await props.searchParams;
  await requireUser("/new");
  const prompt = typeof sp.prompt === "string" ? sp.prompt.slice(0, 2000) : "";
  const repo = typeof sp.repo === "string" ? sp.repo : "";
  const isImport = sp.mode === "import";
  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[620px] overflow-hidden">
        <div className="absolute left-1/2 top-[-340px] h-[640px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgb(245_165_36/0.13),transparent_62%)] blur-2xl [animation:aurora-b_22s_ease-in-out_infinite_alternate]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.045)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_50%_0%,black,transparent_70%)]" />
      </div>
      <header className="relative z-10 border-b border-hairline bg-canvas/60 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
          <Logo href="/home" />
          <nav className="ml-auto flex items-center gap-1 text-[13px]" aria-label="Start from">
            <Link href="/new" className={`rounded-md px-2.5 py-1.5 ${!isImport ? "bg-raised font-medium" : "text-muted-foreground hover:text-foreground"}`}>Describe it</Link>
            <Link href="/new?mode=import" className={`rounded-md px-2.5 py-1.5 ${isImport ? "bg-raised font-medium" : "text-muted-foreground hover:text-foreground"}`}>Bring your existing project</Link>
            <Link href="/home" className="ml-3 rounded-md px-2.5 py-1.5 text-muted-foreground hover:text-foreground">Cancel</Link>
          </nav>
        </div>
      </header>
      <main id="main" className="relative px-6 py-12">
        {isImport ? <ImportWizard initialRepo={repo} llm={llmMode()} /> : <NewProject initialPrompt={prompt} llm={llmMode()} />}
      </main>
    </div>
  );
}
