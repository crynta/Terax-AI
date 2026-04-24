import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWorkspace } from "@/stores/workspace";
import { FolderAddIcon, Folder01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";
import { FileTreeNode } from "./FileTreeNode";
import { useFileTree } from "./lib/useFileTree";

type Props = {
  onOpenFile: (path: string) => void;
};

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

export function FileExplorer({ onOpenFile }: Props) {
  const rootPath = useWorkspace((s) => s.rootPath);
  const setRootPath = useWorkspace((s) => s.setRootPath);
  const tree = useFileTree(rootPath);

  const pickFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") setRootPath(selected);
  }, [setRootPath]);

  if (!rootPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <HugeiconsIcon
          icon={Folder01Icon}
          size={28}
          strokeWidth={1.5}
          className="text-muted-foreground"
        />
        <div className="text-xs text-muted-foreground">
          No folder opened
        </div>
        <Button size="sm" variant="secondary" onClick={pickFolder}>
          <HugeiconsIcon icon={FolderAddIcon} size={14} strokeWidth={2} />
          Open Folder
        </Button>
      </div>
    );
  }

  const root = tree.nodes[rootPath];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border/60 px-2">
        <span
          className="flex-1 truncate text-xs font-medium text-foreground/80"
          title={rootPath}
        >
          {basename(rootPath)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={() => tree.refresh(rootPath)}
          title="Refresh"
        >
          <HugeiconsIcon icon={RefreshIcon} size={12} strokeWidth={2} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={pickFolder}
          title="Open folder"
        >
          <HugeiconsIcon icon={FolderAddIcon} size={13} strokeWidth={2} />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="py-1">
          {root?.status === "loading" && (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">
              Loading…
            </div>
          )}
          {root?.status === "error" && (
            <div className="px-3 py-2 text-[11px] text-destructive">
              {root.message}
            </div>
          )}
          {root?.status === "loaded" &&
            root.entries.map((entry) => (
              <FileTreeNode
                key={entry.name}
                entry={entry}
                parentPath={rootPath}
                depth={0}
                tree={tree}
                onOpenFile={onOpenFile}
              />
            ))}
        </div>
      </ScrollArea>
    </div>
  );
}
