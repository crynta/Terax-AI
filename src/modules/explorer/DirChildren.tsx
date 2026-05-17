import { memo } from "react";
import { DotfilesGroupNode } from "./DotfilesGroupNode";
import { FileTreeNode } from "./FileTreeNode";
import { partitionDotfiles } from "./lib/partitionDotfiles";
import type { DirEntry, useFileTree } from "./lib/useFileTree";

type Tree = ReturnType<typeof useFileTree>;

type Props = {
  entries: DirEntry[];
  parentPath: string;
  rootPath: string;
  depth: number;
  tree: Tree;
  onOpenFile: (path: string, pin?: boolean) => void;
  onRevealInTerminal?: (path: string) => void;
  onAttachToAgent?: (path: string) => void;
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
};

/**
 * Renders the ordered child rows of a directory. In "grouped" mode, dotfiles
 * are collected into a single leading DotfilesGroupNode; otherwise every entry
 * renders inline as a FileTreeNode.
 */
function DirChildrenImpl({
  entries,
  parentPath,
  rootPath,
  depth,
  tree,
  onOpenFile,
  onRevealInTerminal,
  onAttachToAgent,
  selectedPath,
  onSelectPath,
}: Props) {
  const grouped = tree.hiddenFiles === "grouped";
  const { regular, dotfiles } = grouped
    ? partitionDotfiles(entries)
    : { regular: entries, dotfiles: [] as DirEntry[] };

  return (
    <>
      {grouped && dotfiles.length > 0 && (
        <DotfilesGroupNode
          parentPath={parentPath}
          rootPath={rootPath}
          depth={depth}
          dotfiles={dotfiles}
          tree={tree}
          onOpenFile={onOpenFile}
          onRevealInTerminal={onRevealInTerminal}
          onAttachToAgent={onAttachToAgent}
          selectedPath={selectedPath}
          onSelectPath={onSelectPath}
        />
      )}
      {regular.map((entry) => (
        <FileTreeNode
          key={entry.name}
          entry={entry}
          parentPath={parentPath}
          rootPath={rootPath}
          depth={depth}
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

export const DirChildren = memo(DirChildrenImpl);
