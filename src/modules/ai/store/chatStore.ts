import { Chat, type UIMessage } from "@ai-sdk/react";
import {
  type ChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import { create } from "zustand";
import { createTeraxAgent, createTeraxTransport } from "../lib/agent";
import { logger } from "../logger";
import type { ToolContext } from "../tools/tools";

type Live = {
  getCwd: () => string | null;
  getTerminalContext: () => string | null;
};

type StoreState = {
  live: Live;
  setLive: (live: Live) => void;

  apiKey: string | null;
  setApiKey: (key: string | null) => void;

  panelOpen: boolean;
  pendingPrefill: string | null;
  openPanel: (prefill?: string | null) => void;
  closePanel: () => void;
  togglePanel: (prefill?: string | null) => void;
  consumePrefill: () => string | null;
};

const chatRegistry = new Map<number, Chat<UIMessage>>();

export const useChatStore = create<StoreState>((set, get) => ({
  live: { getCwd: () => null, getTerminalContext: () => null },
  setLive: (live) => set({ live }),

  apiKey: null,
  setApiKey: (key) => {
    if (get().apiKey === key) return;
    chatRegistry.forEach((c) => void c.stop());
    chatRegistry.clear();
    set({ apiKey: key });
  },

  panelOpen: false,
  pendingPrefill: null,
  openPanel: (prefill) =>
    set({ panelOpen: true, pendingPrefill: prefill ?? null }),
  closePanel: () => set({ panelOpen: false, pendingPrefill: null }),
  togglePanel: (prefill) =>
    set((s) =>
      s.panelOpen
        ? { panelOpen: false, pendingPrefill: null }
        : { panelOpen: true, pendingPrefill: prefill ?? null },
    ),
  consumePrefill: () => {
    const v = get().pendingPrefill;
    if (v != null) set({ pendingPrefill: null });
    return v;
  },
}));

export function getOrCreateChat(
  tabId: number,
  apiKey: string,
): Chat<UIMessage> {
  const existing = chatRegistry.get(tabId);
  if (existing) return existing;

  const toolContext: ToolContext = {
    getCwd: () => useChatStore.getState().live.getCwd(),
    getTerminalContext: () => useChatStore.getState().live.getTerminalContext(),
  };

  const agent = createTeraxAgent({ apiKey, toolContext });
  const transport = createTeraxTransport(
    agent,
  ) as unknown as ChatTransport<UIMessage>;

  const chat = new Chat<UIMessage>({
    id: `tab-${tabId}`,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: (e) => logger.error("chat.error", e),
  });

  chatRegistry.set(tabId, chat);
  logger.log(`chat.create tab=${tabId}`);
  return chat;
}

export function dropChat(tabId: number): void {
  const c = chatRegistry.get(tabId);
  if (!c) return;
  void c.stop();
  chatRegistry.delete(tabId);
}

export async function sendToTab(tabId: number, text: string): Promise<boolean> {
  const apiKey = useChatStore.getState().apiKey;
  if (!apiKey) return false;
  const chat = getOrCreateChat(tabId, apiKey);
  await chat.sendMessage({ text });
  return true;
}

export function stopTab(tabId: number): void {
  void chatRegistry.get(tabId)?.stop();
}
