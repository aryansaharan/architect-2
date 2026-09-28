import Link from "next/link";
import { FolderGit2 } from "lucide-react";
import { Wireframe } from "@/components/landing/sketches";
import { TimeAgo } from "@/components/time-ago";
import { Pill, type PillTone } from "@/components/ui/pill";
import type { BuildState } from "@/lib/db/types";

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

/** Where the project is, in the same words as its top bar: Sketch, Making it real, Real, Published. */
function stage(p: HomeProject): { label: string; tone: PillTone; dot?: boolean; border?: string; ink?: boolean } {
  if (p.buildState === "draft") return { label: "Sketch", tone: "neutral", border: "border-dashed" };
  if (p.buildState === "building") return { label: "Making it real", tone: "neutral", dot: true };
  return p.live ? { label: "Published", tone: "ok", dot: true } : { label: "Real", tone: "neutral", border: "border-line-strong", ink: true };
}

/** A project on paper: still in pencil until it's made real, then inked. */
export function ProjectCard({ p, seed }: { p: HomeProject; seed: number }) {
  const s = stage(p);
  const inked = p.buildState !== "draft";
  return (
    <Link href={`/p/${p.id}`} className="panel group block h-full overflow-hidden rounded-md transition-colors duration-150 hover:border-line-strong">
      <div className="border-b border-hairline bg-canvas px-6 py-5">
        <Wireframe layout={p.layout} ink={inked} seed={seed} className="mx-auto block h-auto w-full max-w-[240px]" />
      </div>
      <div className="p-4 pt-3">
        <div className="flex items-center gap-3">
          <h3 className="min-w-0 truncate pr-1 font-pencil text-note leading-tight text-foreground">{p.name}</h3>
          {/* Size and ink go on the label: cn() drops a text-* size token merged with a text colour (Pill's tones). */}
          <Pill tone={s.tone} dot={s.dot} className={`ml-auto ${s.border ?? ""}`}>
            <span className={s.ink ? "text-badge text-foreground" : "text-badge"}>{s.label}</span>
          </Pill>
        </div>
        {p.tagline && <p className="mt-1 line-clamp-2 text-body text-muted-foreground">{p.tagline}</p>}
        <p className="mt-3 flex items-center gap-3 text-meta tabular-nums text-faint">
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
