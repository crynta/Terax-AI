import { cn } from "@/lib/utils";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo } from "react";
import { FileTreeNode } from "./FileTreeNode";
import { dotfilesGroupKey } from "./lib/partitionDotfiles";
import type { DirEntry, useFileTree } from "./lib/useFileTree";

type Tree = ReturnType<typeof useFileTree>;

type Props = {
  parentPath: string;
  rootPath: string;
  depth: number;
  dotfiles: DirEntry[];
  tree: Tree;
  onOpenFile: (path: string, pin?: boolean) => void;
  onRevealInTerminal?: (path: string) => void;
  onAttachToAgent?: (path: string) => void;
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
};

function DotfilesGroupNodeImpl({
  parentPath,
  rootPath,
  depth,
  dotfiles,
  tree,
  onOpenFile,
  onRevealInTerminal,
  onAttachToAgent,
  selectedPath,
  onSelectPath,
}: Props) {
  const groupKey = dotfilesGroupKey(parentPath);
  const isExpanded = tree.expanded.has(groupKey);
  const isSelected = selectedPath === groupKey;

  return (
    <>
      <button
        type="button"
        data-fs-path={groupKey}
        onClick={() => {
          onSelectPath(groupKey);
          tree.toggle(groupKey);
        }}
        className={cn(
          "group flex w-full min-w-0 items-center gap-2 rounded-sm px-1.5 py-0.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent/70 cursor-pointer",
          isSelected && "bg-accent text-foreground",
        )}
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        <span className="flex size-3.5 shrink-0 items-center justify-center">
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={12}
            strokeWidth={2.25}
            className={cn("transition-transform", isExpanded && "rotate-90")}
          />
        </span>
        <span className="size-4 shrink-0 text-center text-[13px] leading-4">
          ...
        </span>
        <span className="min-w-0 flex-1 truncate">
          dotfiles ({dotfiles.length})
        </span>
      </button>

      {isExpanded &&
        dotfiles.map((entry) => (
          <FileTreeNode
            key={entry.name}
            entry={entry}
            parentPath={parentPath}
            rootPath={rootPath}
            depth={depth + 1}
            tree={tree}
            onOpenFile={onOpenFile}
            onRevealInTerminal={onRevealInTerminal}
            onAttachToAgent={onAttachToAgent}
            selectedPath={selectedPath}
            onSelectPath={onSelectPath}
          />
        ))}
    </>
  );
}

export const DotfilesGroupNode = memo(DotfilesGroupNodeImpl);
