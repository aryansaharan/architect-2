"use client";
import { useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";

/**
 * The playground conversation. It never calls router.refresh(): useChat keeps its
 * state in an external store, and a store update landing while a refresh is still
 * loading makes React render that refresh as blocking, so the page segment falls
 * back to app/p/[id]/loading.tsx and the conversation, approval card and replay
 * vanish behind a skeleton. Callers get `onTurnEnd` instead and update local state
 * (the run is already saved by then: the route persists it before the stream closes).
 */
export function useAgentChat(projectId: string, agentId: string, opts: { onTurnEnd?: () => void } = {}) {
  const [runId, setRunId] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`));
  const [mode, setMode] = useState<"live" | "scripted" | "budget" | null>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { projectId, agentId, runId },
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          const m = res.headers.get("x-prodai-mode");
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
    onFinish: () => opts.onTurnEnd?.(), // useChat always calls the latest callbacks
  });
  return {
    ...chat,
    runId,
    mode,
    // Starting over keeps the last mode the server reported: it's fresher than what the page loaded with.
    reset: () => setRunId(crypto.randomUUID()),
  };
}
