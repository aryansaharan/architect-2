import Link from "next/link";
import { FolderGit2 } from "lucide-react";
import { Wireframe } from "@/components/landing/sketches";
import { TimeAgo } from "@/components/time-ago";
import type { BuildState } from "@/lib/db/types";
import { cn } from "@/lib/utils";

export type HomeProject = {
  id: string;
  name: string;
  tagline: string;
  buildState: BuildState;
  live: boolean;
  layout?: string;
  screens: number;
  helpers: number;
  imported: boolean;
  updatedAt: string;
};

function stage(p: HomeProject): { label: string; tone: string } {
  if (p.buildState === "draft") return { label: "Pencil sketch", tone: "text-muted-foreground" };
  if (p.buildState === "building") return { label: "Being made", tone: "text-foreground" };
  return p.live ? { label: "Published", tone: "text-amber" } : { label: "Real app", tone: "text-amber" };
}

/** A project on paper: still in pencil until it's made real, then inked. */
export function ProjectCard({ p, seed }: { p: HomeProject; seed: number }) {
  const s = stage(p);
  const inked = p.buildState !== "draft";
  return (
    <Link href={`/p/${p.id}`} className="panel group block h-full overflow-hidden rounded-xl transition-colors duration-200 hover:border-hairline-hi">
      <div className="border-b border-hairline bg-canvas px-6 py-5">
        <Wireframe layout={p.layout} ink={inked} seed={seed} className="mx-auto block h-auto w-full max-w-[240px]" />
      </div>
      <div className="p-4 pt-3">
        <div className="flex items-baseline gap-3">
          <p className="min-w-0 truncate font-pencil text-[25px] leading-tight text-foreground">{p.name}</p>
          <span className={cn("ml-auto shrink-0 font-sketch text-[11.5px]", s.tone)}>{s.label}</span>
        </div>
        {p.tagline && <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{p.tagline}</p>}
        <p className="mt-3 flex items-center gap-3 text-[12px] text-faint">
          <span>{p.screens} {p.screens === 1 ? "screen" : "screens"}</span>
          <span>{p.helpers} AI {p.helpers === 1 ? "helper" : "helpers"}</span>
          {p.imported && (
            <span className="inline-flex items-center gap-1">
              <FolderGit2 className="size-3" />
              from GitHub
            </span>
          )}
          <TimeAgo iso={p.updatedAt} className="ml-auto" />
        </p>
      </div>
    </Link>
  );
}
