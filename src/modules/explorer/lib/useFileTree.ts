import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";

export type DirEntry = {
  name: string;
  kind: "file" | "dir" | "symlink";
  size: number;
  mtime: number;
};

type ChildrenState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; entries: DirEntry[] }
  | { status: "error"; message: string };

type TreeState = Record<string, ChildrenState>;

function joinPath(parent: string, name: string): string {
  if (parent.endsWith("/")) return `${parent}${name}`;
  return `${parent}/${name}`;
}

export function useFileTree(rootPath: string | null) {
  const [nodes, setNodes] = useState<TreeState>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchChildren = useCallback(async (path: string) => {
    setNodes((s) => ({ ...s, [path]: { status: "loading" } }));
    try {
      const entries = await invoke<DirEntry[]>("fs_read_dir", { path });
      setNodes((s) => ({ ...s, [path]: { status: "loaded", entries } }));
    } catch (e) {
      setNodes((s) => ({
        ...s,
        [path]: { status: "error", message: String(e) },
      }));
    }
  }, []);

  // Load root when it changes; reset expansion state.
  useEffect(() => {
    if (!rootPath) {
      setNodes({});
      setExpanded(new Set());
      return;
    }
    setExpanded(new Set());
    setNodes({});
    void fetchChildren(rootPath);
  }, [rootPath, fetchChildren]);

  const toggle = useCallback(
    (path: string) => {
      setExpanded((curr) => {
        const next = new Set(curr);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });
      // Fetch on first expand.
      setNodes((curr) => {
        if (!curr[path] || curr[path].status === "error") {
          void fetchChildren(path);
        }
        return curr;
      });
    },
    [fetchChildren],
  );

  const refresh = useCallback(
    (path: string) => {
      void fetchChildren(path);
    },
    [fetchChildren],
  );

  return {
    nodes,
    expanded,
    toggle,
    refresh,
    joinPath,
  };
}
