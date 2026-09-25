"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";

export function useAgentChat(projectId: string, agentId: string) {
  const router = useRouter();
  const [runId, setRunId] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`));
  const [mode, setMode] = useState<"live" | "scripted" | "budget" | null>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { projectId, agentId, runId },
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          const m = res.headers.get("x-architect-mode");
          if (m === "live" || m === "scripted" || m === "budget") setMode(m);
          return res;
        },
      }),
    [projectId, agentId, runId],
  );
  const chat = useChat({
    id: `${projectId}:${agentId}:${runId}`,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: () => router.refresh(),
  });
  return {
    ...chat,
    runId,
    mode,
    reset: () => {
      setRunId(crypto.randomUUID());
      setMode(null);
    },
  };
}
