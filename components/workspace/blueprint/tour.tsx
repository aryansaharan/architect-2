"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../context";

export function Tour() {
  const ws = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  if (!open || params.get("tour") !== "1") return null;
  // Closing or finishing drops ?tour=1, so a reload (or Back) doesn't bring the tour back.
  const withoutTour = () => {
    const sp = new URLSearchParams(params.toString());
    sp.delete("tour");
    const q = sp.toString();
    return q ? `${pathname}?${q}` : pathname;
  };
  const close = () => {
    setOpen(false);
    router.replace(withoutTour(), { scroll: false });
  };
  const base = `/p/${ws.project.id}`;
  const gated = ws.blueprint.agents.find((a) => a.tools.some((t) => t.access === "irreversible")) ?? ws.blueprint.agents[0];
  const steps = [
    {
      title: "This is the plan, and the product",
      body: "Every screen, agent, kind of data and connection in one view. Click any card to read it in plain English, as a spec, or as code. No developer mode: depth is per object.",
      cta: null as null | { href: string; label: string },
    },
    {
      title: "Agents ask before they act",
      body: `Coloured dots are permissions: green reads, blue changes things you can undo, rose can't be undone, and asks a person first. That's ${gated.name}, open on the right.`,
      cta: null,
    },
    {
      title: "Now try it for real",
      body: "Preview is the live app, rendered from this plan. Point at anything to tweak it for free, or talk to an agent in the Agents tab and watch it ask for approval.",
      cta: { href: `${base}/preview`, label: "Open Preview" },
    },
  ];
  const s = steps[step];
  return (
    // From step 2 the agent opens in the inspector on the right, and its card (with the dots
    // this step explains) sits near the top of the canvas, so the tour moves to the bottom left.
    <div className={cn("absolute z-10 w-[340px] max-w-[calc(100%-2.5rem)]", step === 0 ? "right-5 top-16" : "bottom-5 left-5")} role="dialog" aria-label="Quick tour">
      <div className="panel-raised rounded-xl p-4">
        <div className="flex items-center justify-between">
          <span className="micro-label text-amber">Quick tour · {step + 1} of {steps.length}</span>
          <button onClick={close} aria-label="Close tour" className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
        </div>
        <p className="mt-2 text-[14px] font-semibold">{s.title}</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{s.body}</p>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-1">{steps.map((_, i) => <span key={i} className={`h-1 w-5 rounded-full ${i <= step ? "bg-amber" : "bg-raised"}`} />)}</div>
          {s.cta ? (
            <Button asChild size="sm" className="h-7">
              <Link href={s.cta.href} onClick={() => window.history.replaceState(null, "", withoutTour())}>{s.cta.label} <ArrowRight /></Link>
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-7"
              onClick={() => {
                if (step === 0) ws.select({ type: "agent", id: gated.id });
                setStep((x) => x + 1);
              }}
            >
              Next <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
