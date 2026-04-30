import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  Cancel01Icon,
  CodeIcon,
  TerminalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useComposer, type FileAttachment } from "../lib/composer";
import { useChatStore } from "../store/chatStore";
import { useSnippetsStore } from "../store/snippetsStore";
import { AgentSwitcher } from "./AgentSwitcher";
import { SnippetPicker } from "./SnippetPicker";

type SnippetTrigger = {
  // Caret-relative coords + token range in the textarea value.
  start: number;
  end: number;
  query: string;
};

/**
 * Detect a `#partial` token directly preceding the caret (no whitespace
 * between `#` and the caret). Returns null when there is no active token —
 * e.g. caret outside, char before `#` isn't whitespace/start, or token has
 * been "closed" by a space.
 */
function detectSnippetTrigger(
  value: string,
  caret: number,
): SnippetTrigger | null {
  // Walk back from caret looking for `#` with whitespace (or start) before it.
  for (let i = caret - 1; i >= 0; i--) {
    const ch = value[i];
    if (ch === "#") {
      const prev = i === 0 ? " " : value[i - 1];
      if (!/\s/.test(prev)) return null;
      const slice = value.slice(i + 1, caret);
      // Must be empty or [a-z0-9-] only.
      if (!/^[a-z0-9-]*$/i.test(slice)) return null;
      return { start: i, end: caret, query: slice.toLowerCase() };
    }
    // Stop on whitespace or other non-handle chars.
    if (/\s/.test(ch)) return null;
    if (!/[a-z0-9-]/i.test(ch)) return null;
  }
  return null;
}

export function AiInputBar() {
  const c = useComposer();
  const step = useChatStore((s) => s.agentMeta.step);
  const status = useChatStore((s) => s.agentMeta.status);
  const snippets = useSnippetsStore((s) => s.snippets);

  const [trigger, setTrigger] = useState<SnippetTrigger | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    autoresize(c.textareaRef.current);
  }, [c.value, c.textareaRef]);

  // Recompute trigger on every value change OR caret movement.
  const updateTrigger = () => {
    const el = c.textareaRef.current;
    if (!el) {
      setTrigger(null);
      return;
    }
    setTrigger(detectSnippetTrigger(c.value, el.selectionStart ?? 0));
  };

  useEffect(updateTrigger, [c.value, c.textareaRef]);

  const filteredSnippets = useMemo(() => {
    if (!trigger) return [];
    const q = trigger.query;
    if (!q) return snippets;
    return snippets.filter(
      (s) =>
        s.handle.includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q),
    );
  }, [trigger, snippets]);

  // Keep activeIndex in range as the filtered list shrinks/grows.
  useEffect(() => {
    if (activeIndex >= filteredSnippets.length) setActiveIndex(0);
  }, [filteredSnippets.length, activeIndex]);

  const pickerOpen = trigger !== null;

  const onPickSnippet = (handle: string) => {
    if (!trigger) return;
    const before = c.value.slice(0, trigger.start);
    const after = c.value.slice(trigger.end);
    const next = `${before}#${handle} ${after}`;
    c.setValue(next);
    setTrigger(null);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      const el = c.textareaRef.current;
      if (!el) return;
      const caret = before.length + handle.length + 2;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const pickActive = () => {
    const s = filteredSnippets[activeIndex];
    if (s) onPickSnippet(s.handle);
  };

  const statusLabel =
    status === "awaiting-approval"
      ? "Approval needed"
      : c.voice.recording
        ? "Listening…"
        : c.voice.transcribing
          ? "Transcribing…"
          : c.isBusy
            ? (step ?? "Thinking…")
            : null;

  const closePanel = useChatStore((s) => s.closePanel);

  return (
    <div className="shrink-0 border-t border-border/60 bg-card/40 px-3 py-2">
      <div
        className={cn(
          "flex flex-col gap-1.5 rounded-lg px-1 py-1",
          "transition-colors focus-within:border-border",
        )}
      >
        <AttachmentChips files={c.files} onRemove={c.removeFile} />

        <div className="flex items-start gap-2">
          <textarea
            ref={c.textareaRef}
            value={c.value}
            onChange={(e) => c.setValue(e.target.value)}
            onKeyUp={updateTrigger}
            onClick={updateTrigger}
            onSelect={updateTrigger}
            onKeyDown={(e) => {
              if (pickerOpen) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIndex((i) =>
                    Math.min(i + 1, Math.max(0, filteredSnippets.length - 1)),
                  );
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.max(0, i - 1));
                  return;
                }
                if (e.key === "Tab" || e.key === "Enter") {
                  if (filteredSnippets.length > 0) {
                    e.preventDefault();
                    pickActive();
                    return;
                  }
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setTrigger(null);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                c.submit();
              }
            }}
            placeholder="Ask Terax — Shift+Enter for newline · # for snippets"
            rows={1}
            disabled={c.isBusy}
            className={cn(
              "max-h-40 flex-1 resize-none bg-transparent text-[13px] leading-relaxed outline-none",
              "placeholder:text-muted-foreground/60",
            )}
          />
          <button
            type="button"
            onClick={closePanel}
            title="Close AI panel"
            aria-label="Close AI panel"
            className="mt-0.5 flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 text-[10px] text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
          >
            <span className="hidden sm:inline">Close</span>
            <KbdGroup>
              <Kbd className="h-4 min-w-4 px-1 text-[10px]">⌘I</Kbd>
            </KbdGroup>
          </button>
        </div>

        <div className="relative flex items-center justify-between gap-2 px-0.5">
          <div className="flex items-center gap-1.5">
            <AgentSwitcher />
          </div>
          <SnippetPicker
            open={pickerOpen}
            snippets={filteredSnippets}
            activeIndex={activeIndex}
            onPick={onPickSnippet}
            onHover={setActiveIndex}
          />
        </div>

        <AnimatePresence initial={false}>
          {statusLabel && (
            <motion.div
              key={statusLabel}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.12 }}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
              {c.voice.recording ? (
                <span className="size-1.5 animate-pulse rounded-full bg-destructive" />
              ) : (
                <Spinner className="size-3" />
              )}
              <span className="truncate">{statusLabel}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function AttachmentChips({
  files,
  onRemove,
}: {
  files: FileAttachment[];
  onRemove: (id: string) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      <AnimatePresence initial={false}>
        {files.map((f) => (
          <motion.div
            key={f.id}
            layout
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.12 }}
            className="group flex items-center gap-1 rounded-md border border-border/60 bg-card px-1.5 py-0.5 text-[11px]"
          >
            {f.kind === "image" && f.url ? (
              <img src={f.url} alt="" className="size-4 rounded object-cover" />
            ) : f.kind === "selection" ? (
              <HugeiconsIcon
                icon={f.source === "editor" ? CodeIcon : TerminalIcon}
                size={11}
                strokeWidth={1.75}
                className="text-muted-foreground"
              />
            ) : (
              <span className="font-mono text-[10px] text-muted-foreground">
                {extOf(f.name)}
              </span>
            )}
            <span className="max-w-35 truncate">
              {f.name}
              {f.kind === "selection" && f.text ? (
                <span className="ml-1 text-muted-foreground">
                  · {selLineCount(f.text)}L
                </span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => onRemove(f.id)}
              className="ml-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function selLineCount(text: string): number {
  if (!text) return 0;
  const trimmed = text.replace(/\n+$/, "");
  if (!trimmed) return 0;
  return trimmed.split("\n").length;
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "FILE" : name.slice(i + 1).toUpperCase();
}

function autoresize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
}

export type AiInputBarProps = { tabId: number };

// Re-export for callers who want to pass an "empty / disconnected" state.
export function AiInputBarConnect({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="shrink-0 border-t border-border/60 bg-card/40 px-3 py-2">
      <div className="flex h-10 items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/60 px-3 text-xs">
        <span className="text-muted-foreground">
          Connect OpenAI to enable Terax — your key stays in your OS keychain.
        </span>
        <Button size="sm" onClick={onAdd} className="h-7">
          Add API key
        </Button>
      </div>
    </div>
  );
}
