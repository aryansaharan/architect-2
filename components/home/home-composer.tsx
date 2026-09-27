"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { GitHubMark } from "@/components/brand/logo";
import { WritingSheet } from "./writing-sheet";

/** Home's writing area: a note goes to a new project; a GitHub repo is the quiet second way in. */
export function HomeComposer({ autoFocus }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  return (
    <div>
      <WritingSheet id="brief" value={text} onChange={setText} autoFocus={autoFocus} onSubmit={(t) => router.push(`/new?prompt=${encodeURIComponent(t)}`)} />
      <Link href="/new?mode=import" className="group mt-4 inline-flex items-center gap-2 text-[13.5px] text-muted-foreground hover:text-foreground">
        <GitHubMark className="size-3.5" />
        Or start from a GitHub repo
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
