import { Button } from "@/components/ui/button";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { AiBrain01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { getOpenAiKey } from "../lib/keyring";
import { getOrCreateChat, useChatStore } from "../store/chatStore";
import { AiChatView } from "./AiChat";
import { AiInput } from "./AiInput";
import { ApiKeyDialog } from "./ApiKeyDialog";

type Props = {
  tabId: number;
  onClose?: () => void;
};

export function AiPanel({ tabId, onClose }: Props) {
  const apiKey = useChatStore((s) => s.apiKey);
  const setApiKey = useChatStore((s) => s.setApiKey);
  const [loaded, setLoaded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    getOpenAiKey().then((k) => {
      if (!alive) return;
      setApiKey(k);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [setApiKey]);

  if (!loaded) return null;

  if (!apiKey) {
    return (
      <>
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
          <HugeiconsIcon icon={AiBrain01Icon} size={22} strokeWidth={1.5} />
          <div className="space-y-1">
            <p className="text-sm text-foreground">Connect OpenAI to start</p>
            <p className="text-xs">
              Terax is BYOK. Your key stays in your OS keychain.
            </p>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            Add API key
          </Button>
        </div>
        <ApiKeyDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSaved={(k) => setApiKey(k)}
        />
      </>
    );
  }

  return (
    <ConnectedPanel
      key={`${tabId}:${apiKey}`}
      tabId={tabId}
      apiKey={apiKey}
      onClose={onClose}
    />
  );
}

function ConnectedPanel({
  tabId,
  apiKey,
  onClose,
}: {
  tabId: number;
  apiKey: string;
  onClose?: () => void;
}) {
  const [chat] = useState(() => getOrCreateChat(tabId, apiKey));
  const helpers = useChat<UIMessage>({ chat });
  const isBusy =
    helpers.status === "submitted" || helpers.status === "streaming";

  return (
    <div className="flex h-full flex-col bg-card/30">
      <AiChatView
        messages={helpers.messages}
        status={helpers.status}
        error={helpers.error}
        clearError={helpers.clearError}
        addToolApprovalResponse={helpers.addToolApprovalResponse}
        stop={helpers.stop}
      />
      <AiInput
        busy={isBusy}
        onSubmit={(prompt) => {
          void helpers.sendMessage({ text: prompt });
        }}
        onStop={() => void helpers.stop()}
        onClose={onClose}
      />
    </div>
  );
}
