"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FolderGit2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/arch/segmented";
import { GitHubMark } from "@/components/brand/logo";

export const EXAMPLES = [
  { label: "Claims triage", prompt: "A claims triage desk for a mid-size insurer: take in new claims, flag likely fraud, route each claim to the right adjuster, and prepare payouts that a human approves." },
  { label: "Support inbox", prompt: "A support inbox for our SaaS: read every ticket, draft replies from the help centre, escalate outages to on-call, and let the team approve replies before they go out." },
  { label: "Account research", prompt: "An account research desk for our sales team: research target accounts, watch for buying signals, and draft first-touch emails a rep reviews before sending." },
  { label: "New-hire onboarding", prompt: "A new-hire onboarding desk: build each new hire's plan, provision their accounts and laptop with IT approval, and track compliance training." },
];

export function HomeComposer({ autoFocus }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"describe" | "import">("describe");
  const [text, setText] = useState("");
  const [repo, setRepo] = useState("");

  const go = () => {
    if (mode === "describe" && text.trim()) router.push(`/new?prompt=${encodeURIComponent(text.trim())}`);
    if (mode === "import" && repo.trim()) router.push(`/new?mode=import&repo=${encodeURIComponent(repo.trim())}`);
  };

  return (
    <div className="mt-5">
      <Segmented
        ariaLabel="How to start"
        value={mode}
        onChange={setMode}
        options={[
          { value: "describe", label: <><Sparkles className="size-3.5" />Describe it</> },
          { value: "import", label: <><FolderGit2 className="size-3.5" />Bring your existing project</> },
        ]}
      />
      <div className="panel mt-3 rounded-2xl transition-[border-color,box-shadow] duration-500 focus-within:border-amber/50 focus-within:shadow-[0_0_0_4px_rgb(223_255_79/0.08),0_24px_70px_-24px_rgb(223_255_79/0.45)]">
        {mode === "describe" ? (
          <>
            <label htmlFor="brief" className="sr-only">Describe what you want to build</label>
            <textarea
              id="brief"
              autoFocus={autoFocus}
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go();
              }}
              placeholder="Describe the job, not the tech. “A desk that reads every refund request, checks the order, and asks me before sending money back.”"
              className="block w-full resize-none bg-transparent px-4 pt-4 text-[15px] leading-relaxed outline-none placeholder:text-faint"
            />
            <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pt-2">
              {EXAMPLES.map((ex) => (
                <button key={ex.label} onClick={() => setText(ex.prompt)} className={"rounded-full border px-2.5 py-1 text-[12px] transition-all duration-200 hover:-translate-y-px hover:border-amber/40 hover:text-foreground active:translate-y-0 " + (text === ex.prompt ? "border-amber/50 bg-amber-soft text-foreground" : "border-hairline text-muted-foreground")}>
                  {ex.label}
                </button>
              ))}
              <Button className="sheen ml-auto h-9 shadow-[0_8px_24px_-10px_rgb(223_255_79/0.8)] disabled:shadow-none" onClick={go} disabled={!text.trim()}>
                Plan it <span className="kbd ml-1 border-black/20 bg-black/10 text-primary-foreground/80">⌘↵</span> <ArrowRight />
              </Button>
            </div>
          </>
        ) : (
          <div className="p-4">
            <label htmlFor="repo" className="text-[13px] font-medium">Public GitHub repository</label>
            <div className="mt-2 flex gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-lg border border-hairline bg-deep px-3">
                <GitHubMark className="text-muted-foreground" />
                <input id="repo" value={repo} onChange={(e) => setRepo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="github.com/owner/repo" className="h-10 w-full bg-transparent text-[14px] outline-none placeholder:text-faint" />
              </div>
              <Button className="h-10" onClick={go} disabled={!repo.trim()}>Read it <ArrowRight /></Button>
            </div>
            <p className="mt-2.5 text-[12px] text-muted-foreground">
              Prod AI reads your stack and agents first, tells you what it understood, and signs House Rules before it touches anything. Try{" "}
              {["openai/openai-cs-agents-demo", "langchain-ai/langgraph-example", "crewAIInc/crewAI-examples"].map((r, i) => (
                <span key={r}>
                  <button className="font-mono text-foreground/80 underline decoration-dotted underline-offset-4 hover:text-foreground" onClick={() => setRepo(`github.com/${r}`)}>{r}</button>
                  {i < 2 ? ", " : "."}
                </span>
              ))}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
