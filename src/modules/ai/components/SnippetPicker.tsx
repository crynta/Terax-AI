import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import type { Snippet } from "../lib/snippets";

type Props = {
  open: boolean;
  snippets: readonly Snippet[];
  activeIndex: number;
  onPick: (handle: string) => void;
  onHover: (index: number) => void;
};

/**
 * Inline floating snippet list. Does NOT take focus — the composer textarea
 * keeps focus and forwards Arrow/Enter keys to drive the active row.
 */
export function SnippetPicker({
  open,
  snippets,
  activeIndex,
  onPick,
  onHover,
}: Props) {
  if (!open) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.1 }}
      className={cn(
        "absolute bottom-full left-1 z-90 mb-1 w-72",
        "overflow-hidden rounded-lg border border-border/60 bg-popover/95 shadow-xl backdrop-blur-xl",
      )}
      onMouseDown={(e) => {
        // Prevent textarea from losing focus on click.
        e.preventDefault();
      }}
    >
      {snippets.length === 0 ? (
        <div className="px-3 py-2.5 text-[11px] text-muted-foreground">
          No matching snippets. Add some in Settings → Agents.
        </div>
      ) : (
        <ul className="max-h-56 overflow-y-auto py-1">
          {snippets.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onMouseEnter={() => onHover(i)}
                onClick={() => onPick(s.handle)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 px-2 py-1.5 text-left text-[12px]",
                  i === activeIndex ? "bg-accent" : "hover:bg-accent/60",
                )}
              >
                <span className="flex w-full items-center gap-1.5">
                  <span className="font-mono text-muted-foreground">
                    #{s.handle}
                  </span>
                  <span className="font-medium">{s.name}</span>
                </span>
                {s.description ? (
                  <span className="line-clamp-1 text-[10.5px] text-muted-foreground">
                    {s.description}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
