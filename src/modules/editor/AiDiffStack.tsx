import { cn } from "@/lib/utils";
import type { AiDiffTab, Tab } from "@/modules/tabs";
import { AiDiffPane } from "./AiDiffPane";

type Props = {
  tabs: Tab[];
  activeId: number;
  onAccept: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
};

export function AiDiffStack({ tabs, activeId, onAccept, onReject }: Props) {
  const diffs = tabs.filter((t): t is AiDiffTab => t.kind === "ai-diff");
  if (diffs.length === 0) return null;
  return (
    <div className="relative h-full w-full">
      {diffs.map((t) => {
        const visible = t.id === activeId;
        return (
          <div
            key={t.id}
            className={cn(
              "absolute inset-0",
              !visible && "invisible pointer-events-none",
            )}
            aria-hidden={!visible}
          >
            <AiDiffPane
              path={t.path}
              originalContent={t.originalContent}
              proposedContent={t.proposedContent}
              status={t.status}
              isNewFile={t.isNewFile}
              onAccept={() => onAccept(t.approvalId)}
              onReject={() => onReject(t.approvalId)}
            />
          </div>
        );
      })}
    </div>
  );
}
