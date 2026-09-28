"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A tab failed to render. The rest of the project keeps working: try again, or go back to the Sheet. */
export default function TabError({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset: () => void }) {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="grid h-full place-items-center bg-canvas p-6 sm:p-8">
      {/* An error is ink with an icon and a plain sentence, not rose. */}
      <div role="alert" className="panel max-w-md rounded-md px-6 py-6 text-center sm:px-7">
        <CircleAlert className="mx-auto size-5 text-foreground" aria-hidden />
        <h1 className="mt-2 font-pencil text-section text-foreground">This view hit a problem</h1>
        <p className="mt-2 text-body text-muted-foreground">Nothing in your project was changed. Your sketch, versions and notes are safe. Try this view again, or go back to the Sheet.</p>
        {error.digest && <p className="mt-3 font-mono text-badge text-faint">Reference {error.digest}</p>}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={() => (retry ?? reset)()}>
            <RotateCcw aria-hidden /> Try again
          </Button>
          <Button asChild>
            <Link href={`/p/${id}`}>Back to the Sheet</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
