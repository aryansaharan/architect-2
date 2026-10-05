"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { GitHubMark } from "@/components/brand/logo";
import { CapNote } from "@/components/new/cap-note";
import { WritingSheet } from "./writing-sheet";

/**
 * Home's writing area: a note goes to a new project; a GitHub repo is the quiet second way in.
 * At the most projects someone can keep, it says so before they write (their projects are right below).
 */
export function HomeComposer({ autoFocus, capMessage = null, isGuest = false }: { autoFocus?: boolean; capMessage?: string | null; isGuest?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  if (capMessage) return <CapNote message={capMessage} signInNext={isGuest ? "/new" : null} projectsHref={null} />;
  return (
    <div>
      <WritingSheet id="brief" value={text} onChange={setText} autoFocus={autoFocus} onSubmit={(t) => router.push(`/new?prompt=${encodeURIComponent(t)}`)} />
      <Link href="/new?mode=import" className="group mt-2 inline-flex min-h-9 items-center gap-2 text-ui text-muted-foreground transition-colors duration-150 hover:text-foreground">
        <GitHubMark className="size-3.5" />
        Or start from a GitHub repo
        <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
