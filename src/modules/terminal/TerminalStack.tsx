import type { Tab } from "@/modules/tabs";
import type { SearchAddon } from "@xterm/addon-search";
import { useEffect, useRef } from "react";
import { TerminalPane, type TerminalPaneHandle } from "./TerminalPane";

type Props = {
  tabs: Tab[];
  activeId: number;
  registerHandle: (id: number, handle: TerminalPaneHandle | null) => void;
  onSearchReady: (id: number, addon: SearchAddon) => void;
  onCwd: (id: number, cwd: string) => void;
};

export function TerminalStack({
  tabs,
  activeId,
  registerHandle,
  onSearchReady,
  onCwd,
}: Props) {
  const terminals = tabs.filter((t) => t.kind === "terminal");

  const registerRef = useRef(registerHandle);
  const searchReadyRef = useRef(onSearchReady);
  const cwdRef = useRef(onCwd);
  useEffect(() => {
    registerRef.current = registerHandle;
  }, [registerHandle]);
  useEffect(() => {
    searchReadyRef.current = onSearchReady;
  }, [onSearchReady]);
  useEffect(() => {
    cwdRef.current = onCwd;
  }, [onCwd]);

  type Bundle = {
    setRef: (h: TerminalPaneHandle | null) => void;
    onSearch: (addon: SearchAddon) => void;
    onCwd: (cwd: string) => void;
  };
  const bundles = useRef(new Map<number, Bundle>());
  const getBundle = (id: number): Bundle => {
    let b = bundles.current.get(id);
    if (!b) {
      b = {
        setRef: (h) => registerRef.current(id, h),
        onSearch: (addon) => searchReadyRef.current(id, addon),
        onCwd: (cwd) => cwdRef.current(id, cwd),
      };
      bundles.current.set(id, b);
    }
    return b;
  };

  useEffect(() => {
    const live = new Set(terminals.map((t) => t.id));
    for (const id of bundles.current.keys()) {
      if (!live.has(id)) bundles.current.delete(id);
    }
  }, [terminals]);

  return (
    <div className="relative h-full w-full">
      {terminals.map((t) => {
        const b = getBundle(t.id);
        return (
          <div key={t.id} className="absolute inset-0">
            <TerminalPane
              tabId={t.id}
              visible={t.id === activeId}
              initialCwd={t.kind === "terminal" ? t.cwd : undefined}
              ref={b.setRef}
              onSearchReady={(_id, addon) => b.onSearch(addon)}
              onCwd={(_id, cwd) => b.onCwd(cwd)}
            />
          </div>
        );
      })}
    </div>
  );
}
