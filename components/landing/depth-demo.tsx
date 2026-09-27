"use client";
import { useState } from "react";
import { Segmented } from "@/components/arch/segmented";
import { AccessChip, Avatar } from "@/components/arch/badges";
import { CodeView } from "@/components/arch/code-view";
import { cn } from "@/lib/utils";
import { PERMISSION_LABEL } from "@/lib/blueprint/describe";

type Tool = { name: string; where: string; access: "read" | "write" | "irreversible"; permission: string };

export function DepthDemo({ agent, yaml }: { agent: { name: string; role: string; hue: number; plain: string; supervision: string; tools: Tool[]; rules: string[] }; yaml: string }) {
  const [face, setFace] = useState<"plain" | "spec" | "code">("plain");
  return (
    <div className="panel-raised overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
        <Avatar name={agent.name} hue={agent.hue} size={32} />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">{agent.name}</p>
          <p className="text-[12px] text-muted-foreground">{agent.role}</p>
        </div>
        <Segmented
          className="ml-auto"
          ariaLabel="Depth"
          value={face}
          onChange={setFace}
          options={[
            { value: "plain", label: "Plain" },
            { value: "spec", label: "Spec" },
            { value: "code", label: "Code" },
          ]}
        />
      </div>
      <div className="h-[330px] overflow-y-auto">
        {face === "plain" && (
          <div className="space-y-4 p-4">
            <p className="text-[13.5px] leading-relaxed">{agent.plain}</p>
            <ul className="space-y-1.5">
              {agent.tools.map((t) => (
                <li key={t.name} className="flex items-center gap-2.5 rounded-lg border border-hairline bg-deep/60 px-2.5 py-2">
                  <AccessChip access={t.access} />
                  <span className="flex-1 text-[12.5px]">{t.name}</span>
                  <span className={cn("text-[11.5px] font-medium", t.permission === PERMISSION_LABEL.ask ? "text-ask" : "text-muted-foreground")}>{t.permission}</span>
                </li>
              ))}
            </ul>
            <p className="text-[12.5px] text-muted-foreground">{agent.supervision}</p>
          </div>
        )}
        {face === "spec" && (
          <div className="p-4">
            <table className="w-full text-left text-[12px]">
              <thead className="text-muted-foreground">
                <tr><th className="pb-2 font-medium">tool</th><th className="pb-2 font-medium">connection</th><th className="pb-2 font-medium">access</th><th className="pb-2 font-medium">permission</th></tr>
              </thead>
              <tbody className="font-mono">
                {agent.tools.map((t) => (
                  <tr key={t.name} className="border-t border-hairline">
                    <td className="py-2">{t.name.toLowerCase().replace(/ /g, "_")}</td>
                    <td className="py-2 text-muted-foreground">{t.where}</td>
                    <td className="py-2">{t.access}</td>
                    <td className={cn("py-2", t.permission === PERMISSION_LABEL.ask && "text-ask")}>{t.permission === PERMISSION_LABEL.ask ? "ask" : t.permission === PERMISSION_LABEL.log ? "log" : "auto"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-[12px] text-muted-foreground">Rules</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[12.5px]">{agent.rules.map((r) => <li key={r}>{r}</li>)}</ol>
          </div>
        )}
        {face === "code" && <CodeView code={yaml} lang="yaml" className="h-full" />}
      </div>
    </div>
  );
}
