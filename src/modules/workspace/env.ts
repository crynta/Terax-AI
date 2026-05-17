import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { setLastWslDistro } from "@/modules/settings/store";

export type WorkspaceEnv =
  | { kind: "local" }
  | { kind: "wsl"; distro: string };

export type WslDistro = {
  name: string;
  default: boolean;
  running: boolean;
};

type State = {
  /**
   * Ambient workspace env — read by every fs / shell / AI tool call.
   * Auto-synced by App.tsx to the active terminal tab's workspace so the
   * AI agent operates in the same env the user is looking at. Falls back
   * to {@link defaultEnv} when the active tab is not a terminal.
   */
  env: WorkspaceEnv;
  /**
   * Env applied to brand-new tabs when no terminal tab is active (or as
   * the seed on first launch). Set by the status-bar selector and the
   * `+` button's caret dropdown; persisted across launches (last WSL
   * distro is restored on next start).
   */
  defaultEnv: WorkspaceEnv;
  distros: WslDistro[];
  loading: boolean;
  error: string | null;
  setEnv: (env: WorkspaceEnv) => void;
  setDefaultEnv: (env: WorkspaceEnv) => void;
  refreshDistros: () => Promise<WslDistro[]>;
};

export const LOCAL_WORKSPACE: WorkspaceEnv = { kind: "local" };

export const useWorkspaceEnvStore = create<State>((set) => ({
  env: LOCAL_WORKSPACE,
  defaultEnv: LOCAL_WORKSPACE,
  distros: [],
  loading: false,
  error: null,
  // Ambient setter — no persistence. Called by App.tsx whenever the active
  // tab changes so AI / fs / explorer read the right env.
  setEnv: (env) => set({ env }),
  // User-chosen default for new tabs. Persisted across launches.
  setDefaultEnv: (env) => {
    set({ defaultEnv: env });
    if (env.kind === "wsl") void setLastWslDistro(env.distro);
  },
  refreshDistros: async () => {
    set({ loading: true, error: null });
    try {
      const distros = await invoke<WslDistro[]>("wsl_list_distros");
      set({ distros, loading: false });
      return distros;
    } catch (e) {
      set({ distros: [], loading: false, error: String(e) });
      return [];
    }
  },
}));

export function currentWorkspaceEnv(): WorkspaceEnv {
  return useWorkspaceEnvStore.getState().env;
}

export async function getWslHome(distro: string): Promise<string> {
  return invoke<string>("wsl_home", { distro });
}
