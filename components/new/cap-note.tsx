import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Where Sign in goes, coming back to `next` afterwards (a guest's note or repo comes with it). */
export const signInHref = (next: string) => `/login?next=${encodeURIComponent(next)}`;

/**
 * Said before anyone writes, when they can't keep another project: why, then the ways on.
 * A guest signs in (whatever they were starting comes with them); anyone can delete one from their projects.
 */
export function CapNote({
  message,
  signInNext,
  projectsHref = "/home",
  alert = false,
  className,
}: {
  message: string;
  /** Where a guest comes back to after signing in. Null for members: signing in again gives them nothing. */
  signInNext?: string | null;
  /** The projects list, to delete one. Null where it's already on the page. */
  projectsHref?: string | null;
  /** True when it arrives late (after pressing a button), so it's announced. */
  alert?: boolean;
  className?: string;
}) {
  return (
    <div role={alert ? "alert" : undefined} className={cn("panel rounded-md px-4 py-4 sm:px-5", className)}>
      <p className="flex gap-2 text-body text-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        {message}
      </p>
      {(signInNext || projectsHref) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 pl-6">
          {signInNext && (
            <Button asChild size="lg">
              <Link href={signInHref(signInNext)}>
                Sign in to keep more <ArrowRight />
              </Link>
            </Button>
          )}
          {projectsHref &&
            (signInNext ? (
              <Link href={projectsHref} className="inline-flex min-h-9 items-center text-ui text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors duration-150 hover:text-foreground">
                Go to your projects
              </Link>
            ) : (
              <Button asChild size="lg">
                <Link href={projectsHref}>Go to your projects</Link>
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}
