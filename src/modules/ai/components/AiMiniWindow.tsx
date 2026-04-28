import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useChat, type UIMessage } from "@ai-sdk/react";
import {
  Add01Icon,
  ArrowDown01Icon,
  Cancel01Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import { useEffect, useMemo } from "react";
import type { SessionMeta } from "../lib/sessions";
import { getOrCreateChat, useChatStore } from "../store/chatStore";
import { AiChatView } from "./AiChat";

const SUGGESTIONS = [
  { label: "Explain the last error", text: "Explain the last error in the terminal." },
  { label: "Generate a command", text: "Give me a command to " },
  { label: "Summarize buffer", text: "Summarize what just happened in the terminal." },
];

export function AiMiniWindow() {
  const closeMini = useChatStore((s) => s.closeMini);
  const sessionId = useChatStore((s) => s.activeSessionId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        closeMini();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeMini]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      data-ai-mini-window
      className={cn(
        "no-scrollbar-deep fixed right-4 bottom-12 z-40 flex h-[36rem] w-[28rem] flex-col overflow-hidden",
        "rounded-xl border border-border/60 bg-card/95 shadow-2xl backdrop-blur-xl",
        "text-[12px]",
      )}
    >
      {sessionId ? (
        <Body sessionId={sessionId} onClose={closeMini} />
      ) : (
        <EmptyShell onClose={closeMini} />
      )}
    </motion.div>
  );
}

function Body({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const focusInput = useChatStore((s) => s.focusInput);
  const step = useChatStore((s) => s.agentMeta.step);

  const chat = useMemo(() => getOrCreateChat(sessionId), [sessionId]);
  const helpers = useChat<UIMessage>({ chat });
  const isBusy =
    helpers.status === "submitted" || helpers.status === "streaming";

  return (
    <>
      <Header step={step} isBusy={isBusy} onClose={onClose} />

      <div className="flex min-h-0 flex-1 flex-col">
        {helpers.messages.length === 0 ? (
          <EmptyState onPick={focusInput} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col [&_.text-sm]:text-[12px] [&_p]:leading-relaxed">
            <AiChatView
              messages={helpers.messages}
              status={helpers.status}
              error={helpers.error}
              clearError={helpers.clearError}
              addToolApprovalResponse={helpers.addToolApprovalResponse}
              stop={helpers.stop}
            />
          </div>
        )}
      </div>
    </>
  );
}

function EmptyShell({ onClose }: { onClose: () => void }) {
  return (
    <>
      <Header step={null} isBusy={false} onClose={onClose} />
      <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground">
        Loading sessions…
      </div>
    </>
  );
}

function Header({
  step,
  isBusy,
  onClose,
}: {
  step: string | null;
  isBusy: boolean;
  onClose: () => void;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <img
          src="/logo.png"
          alt=""
          className="size-3.5 shrink-0"
          draggable={false}
        />
        <span className="text-[11px] font-semibold tracking-tight">Terax</span>
        <SessionPicker />
        {isBusy && (
          <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
            <Spinner className="size-2.5" />
            <span className="truncate">{step ?? "Thinking…"}</span>
          </span>
        )}
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={onClose}
        className="size-5"
        aria-label="Close"
        title="Close (Esc)"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={1.75} />
      </Button>
    </div>
  );
}

function SessionPicker() {
  const sessions = useChatStore((s) => s.sessions);
  const activeId = useChatStore((s) => s.activeSessionId);
  const switchSession = useChatStore((s) => s.switchSession);
  const newSession = useChatStore((s) => s.newSession);
  const deleteSession = useChatStore((s) => s.deleteSession);

  const active = sessions.find((s) => s.id === activeId) ?? null;
  if (!active) return null;

  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex min-w-0 max-w-[14rem] items-center gap-1 rounded-md px-1.5 py-0.5",
            "text-[10.5px] text-muted-foreground transition-colors",
            "hover:bg-accent hover:text-foreground",
          )}
          title="Switch session"
        >
          <span className="size-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span className="truncate">{active.title || "New chat"}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={10}
            strokeWidth={2}
            className="opacity-70"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuItem
          onSelect={() => newSession()}
          className="gap-2 text-xs"
        >
          <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={1.75} />
          New session
        </DropdownMenuItem>
        {sorted.length > 0 ? <DropdownMenuSeparator /> : null}
        {sorted.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            active={s.id === activeId}
            onSelect={() => switchSession(s.id)}
            onDelete={() => deleteSession(s.id)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SessionRow({
  session,
  active,
  onSelect,
  onDelete,
}: {
  session: SessionMeta;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        // Don't dismiss if user clicked the trash icon — handle below.
        const target = e.target as HTMLElement | null;
        if (target?.closest("[data-session-delete]")) {
          e.preventDefault();
          return;
        }
        onSelect();
      }}
      className={cn(
        "group flex items-center justify-between gap-2 text-xs",
        active && "bg-accent/40",
      )}
    >
      <span className="min-w-0 flex-1 truncate">
        {session.title || "New chat"}
      </span>
      <button
        type="button"
        data-session-delete
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete session"
        className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
      >
        <HugeiconsIcon icon={Delete02Icon} size={11} strokeWidth={1.75} />
      </button>
    </DropdownMenuItem>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="space-y-1">
        <p className="text-[12px] font-medium tracking-tight">
          Ask Terax anything
        </p>
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">
          Terax sees the active terminal — cwd and recent output.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-1">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onPick(s.text)}
            className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
