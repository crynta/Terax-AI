import { useChat, type UIMessage } from "@ai-sdk/react";
import { useEffect, useMemo } from "react";
import {
  getOrCreateChat,
  useChatStore,
  type AgentRunStatus,
} from "../store/chatStore";

/**
 * Headless bridge that mirrors chat lifecycle into the store, so the status
 * pill / mini-window / panel can react without being inside the chat hook tree.
 *
 * Side effects:
 *  - Patches `agentMeta` on every status / approvals change.
 *  - Auto-opens the mini-window when an approval is pending — the user has
 *    to act on it; hiding it would be hostile.
 *  - Persists messages of the active session on every change.
 */
export function AgentRunBridge() {
  const sessionId = useChatStore((s) => s.activeSessionId);
  if (!sessionId) return null;
  return <Bridge sessionId={sessionId} />;
}

function Bridge({ sessionId }: { sessionId: string }) {
  const chat = useMemo(() => getOrCreateChat(sessionId), [sessionId]);
  const { status, messages } = useChat<UIMessage>({ chat });
  const patch = useChatStore((s) => s.patchAgentMeta);
  const openMini = useChatStore((s) => s.openMini);
  const persistMessages = useChatStore((s) => s.persistMessages);

  useEffect(() => {
    persistMessages(sessionId, messages);
  }, [sessionId, messages, persistMessages]);

  const approvalsPending = useMemo(() => {
    let n = 0;
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const p of m.parts) {
        if ((p as { state?: string }).state === "approval-requested") n++;
      }
    }
    return n;
  }, [messages]);

  useEffect(() => {
    let runStatus: AgentRunStatus;
    if (approvalsPending > 0) runStatus = "awaiting-approval";
    else if (status === "submitted") runStatus = "thinking";
    else if (status === "streaming") runStatus = "streaming";
    else if (status === "error") runStatus = "error";
    else runStatus = "idle";
    patch({
      status: runStatus,
      approvalsPending,
      ...(runStatus === "idle" || runStatus === "error"
        ? { step: null }
        : {}),
      ...(runStatus === "idle" ? { error: null } : {}),
    });
  }, [status, approvalsPending, patch]);

  useEffect(() => {
    if (approvalsPending > 0) openMini();
  }, [approvalsPending, openMini]);

  return null;
}
