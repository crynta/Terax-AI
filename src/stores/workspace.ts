import { create } from "zustand";
import { persist } from "zustand/middleware";

type WorkspaceState = {
  rootPath: string | null;
  setRootPath: (path: string | null) => void;
};

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set) => ({
      rootPath: null,
      setRootPath: (rootPath) => set({ rootPath }),
    }),
    { name: "terax.workspace" },
  ),
);
