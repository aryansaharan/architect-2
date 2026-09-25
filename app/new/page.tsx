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
    <div className="min-h-screen">
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
          <Logo href="/home" />
          <nav className="ml-auto flex items-center gap-1 text-[13px]" aria-label="Start from">
            <Link href="/new" className={`rounded-md px-2.5 py-1.5 ${!isImport ? "bg-raised font-medium" : "text-muted-foreground hover:text-foreground"}`}>Describe it</Link>
            <Link href="/new?mode=import" className={`rounded-md px-2.5 py-1.5 ${isImport ? "bg-raised font-medium" : "text-muted-foreground hover:text-foreground"}`}>Bring your existing project</Link>
            <Link href="/home" className="ml-3 rounded-md px-2.5 py-1.5 text-muted-foreground hover:text-foreground">Cancel</Link>
          </nav>
        </div>
      </header>
      <main id="main" className="px-6 py-12">
        {isImport ? <ImportWizard initialRepo={repo} llm={llmMode()} /> : <NewProject initialPrompt={prompt} llm={llmMode()} />}
      </main>
    </div>
  );
}
