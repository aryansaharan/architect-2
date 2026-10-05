import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { projectCapMessage } from "@/lib/security/caps";
import { MAX_BRIEF } from "@/components/home/brief-limits";
import { Logo, GitHubMark } from "@/components/brand/logo";
import { NewProject } from "@/components/new/new-project";
import { ImportWizard } from "@/components/import/import-wizard";
import { llmMode } from "@/lib/llm/provider";

export const metadata = { title: "New project" };

const LINK = "inline-flex h-9 items-center rounded-md px-2.5 text-muted-foreground transition-colors duration-150 hover:text-foreground";

export default async function NewPage(props: PageProps<"/new">) {
  const sp = await props.searchParams;
  const user = await requireUser("/new");
  // At the most projects they can keep, people hear it before they write, not after the plan is sketched.
  const capMessage = await projectCapMessage(await createClient(), user);
  const prompt = typeof sp.prompt === "string" ? sp.prompt.slice(0, MAX_BRIEF) : "";
  const repo = typeof sp.repo === "string" ? sp.repo : "";
  const isImport = sp.mode === "import";
  return (
    <div className="min-h-screen">
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5 sm:px-6">
          <Logo href="/home" />
          <nav className="-mr-2.5 ml-auto flex items-center gap-1 text-ui" aria-label="Start from">
            {isImport ? (
              <Link href="/new" className={LINK}>
                Describe it instead
              </Link>
            ) : (
              <Link href="/new?mode=import" className={`${LINK} gap-1.5`}>
                <GitHubMark className="size-3.5" />
                <span className="hidden sm:inline">Start from a GitHub repo</span>
                <span className="sm:hidden">From GitHub</span>
              </Link>
            )}
            <Link href="/home" className={LINK}>
              Cancel
            </Link>
          </nav>
        </div>
      </header>
      <main id="main" className="px-5 pb-20 pt-10 sm:px-6 sm:pt-14">
        {isImport ? (
          <ImportWizard initialRepo={repo} llm={llmMode()} isGuest={user.isAnonymous} capMessage={capMessage} />
        ) : (
          <NewProject initialPrompt={prompt} llm={llmMode()} isGuest={user.isAnonymous} capMessage={capMessage} />
        )}
      </main>
    </div>
  );
}
