import { ThemeProvider } from "@/components/ThemeProvider";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AiInput,
  type AiInputHandle,
  AiSessionView,
  useSessions,
} from "@/modules/ai";
import { EditorPane } from "@/modules/editor";
import { FileExplorer } from "@/modules/explorer";
import { Header, type SearchInlineHandle } from "@/modules/header";
import { ShortcutsDialog } from "@/modules/shortcuts";
import { StatusBar } from "@/modules/statusbar";
import { useTabs } from "@/modules/tabs";
import { TerminalPane, type TerminalPaneHandle } from "@/modules/terminal";
import { homeDir } from "@tauri-apps/api/path";
import type { SearchAddon } from "@xterm/addon-search";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";

export default function App() {
  const {
    tabs,
    activeId,
    setActiveId,
    newTab,
    openFileTab,
    closeTab,
    updateTab,
    selectByIndex,
  } = useTabs();

  const searchAddons = useRef<Map<number, SearchAddon>>(new Map());
  const [activeSearchAddon, setActiveSearchAddon] =
    useState<SearchAddon | null>(null);
  const searchInlineRef = useRef<SearchInlineHandle | null>(null);
  const terminalRefs = useRef<Map<number, TerminalPaneHandle>>(new Map());
  const aiInputRef = useRef<AiInputHandle | null>(null);

  const sidebarRef = useRef<PanelImperativeHandle | null>(null);
  const toggleSidebar = useCallback(() => {
    const p = sidebarRef.current;
    if (!p) return;
    if (p.getSize().asPercentage <= 0) p.expand();
    else p.collapse();
  }, []);

  const [home, setHome] = useState<string | null>(null);
  useEffect(() => {
    homeDir()
      .then(setHome)
      .catch(() => setHome(null));
  }, []);

  const [aiOpen, setAiOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const sessions = useSessions();

  const activeTab = tabs.find((t) => t.id === activeId);
  const activeSession = sessions.get(activeId);
  const isTerminalTab = activeTab?.kind === "terminal";
  const isEditorTab = activeTab?.kind === "editor";

  useEffect(() => {
    setActiveSearchAddon(searchAddons.current.get(activeId) ?? null);
  }, [activeId]);

  const handleSearchReady = useCallback(
    (id: number, addon: SearchAddon) => {
      searchAddons.current.set(id, addon);
      if (id === activeId) setActiveSearchAddon(addon);
    },
    [activeId],
  );

  const handleClose = useCallback(
    (id: number) => {
      const t = tabs.find((x) => x.id === id);
      if (t?.kind === "editor" && t.dirty) {
        const ok = window.confirm(
          `"${t.title}" has unsaved changes. Close anyway?`,
        );
        if (!ok) return;
      }
      searchAddons.current.delete(id);
      terminalRefs.current.delete(id);
      sessions.clear(id);
      closeTab(id);
    },
    [tabs, closeTab, sessions],
  );

  const cycleTab = useCallback(
    (delta: 1 | -1) => {
      if (tabs.length < 2) return;
      const idx = tabs.findIndex((t) => t.id === activeId);
      const nextIdx = (idx + delta + tabs.length) % tabs.length;
      setActiveId(tabs[nextIdx].id);
    },
    [tabs, activeId, setActiveId],
  );

  const toggleAi = useCallback(() => {
    setAiOpen((prev) => {
      const next = !prev;
      if (next) setTimeout(() => aiInputRef.current?.focus(), 50);
      return next;
    });
  }, []);

  const openNewTab = useCallback(() => {
    const inheritedTab = tabs.find(
      (t) => t.id === activeId && t.kind === "terminal",
    );
    const inherited =
      (inheritedTab?.kind === "terminal" ? inheritedTab.cwd : undefined) ??
      home ??
      undefined;
    newTab(inherited);
  }, [tabs, activeId, home, newTab]);

  const sendCd = useCallback(
    (path: string) => {
      const term = terminalRefs.current.get(activeId);
      if (!term) return;
      const quoted = path.includes(" ")
        ? `'${path.replace(/'/g, `'\\''`)}'`
        : path;
      term.write(`cd ${quoted}\n`);
      term.focus();
    },
    [activeId],
  );

  const handleAiSubmit = useCallback(
    (prompt: string) => {
      sessions.start(activeId, prompt);
    },
    [sessions, activeId],
  );

  const handleOpenFile = useCallback(
    (path: string) => {
      openFileTab(path);
    },
    [openFileTab],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const ctrl = e.ctrlKey;
      const consume = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };

      if (ctrl && e.key === "Tab") {
        consume();
        cycleTab(e.shiftKey ? -1 : 1);
        return;
      }
      if (!mod) return;

      if (e.key === "t") {
        consume();
        openNewTab();
      } else if (e.key === "w") {
        consume();
        handleClose(activeId);
      } else if (e.key === "f") {
        // Let CodeMirror's own search handle Cmd+F on editor tabs.
        if (isEditorTab) return;
        consume();
        searchInlineRef.current?.focus();
      } else if (e.key === "i") {
        consume();
        toggleAi();
      } else if (e.key === "k") {
        consume();
        setShortcutsOpen((v) => !v);
      } else if (e.key === "b") {
        consume();
        toggleSidebar();
      } else if (/^[1-9]$/.test(e.key)) {
        consume();
        selectByIndex(parseInt(e.key, 10) - 1);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [
    activeId,
    cycleTab,
    handleClose,
    openNewTab,
    selectByIndex,
    toggleAi,
    toggleSidebar,
    isEditorTab,
  ]);

  // Terminal panes stay mounted to preserve PTY state; only the active one is visible.
  const terminalStack = useMemo(
    () => (
      <div className="relative h-full w-full">
        {tabs
          .filter((t) => t.kind === "terminal")
          .map((t) => (
            <div key={t.id} className="absolute inset-0">
              <TerminalPane
                tabId={t.id}
                visible={t.id === activeId}
                initialCwd={t.kind === "terminal" ? t.cwd : undefined}
                ref={(h) => {
                  if (h) terminalRefs.current.set(t.id, h);
                  else terminalRefs.current.delete(t.id);
                }}
                onSearchReady={handleSearchReady}
                onCwd={(id, cwd) => updateTab(id, { cwd })}
              />
            </div>
          ))}
      </div>
    ),
    [tabs, activeId, handleSearchReady, updateTab],
  );

  const mainContent = useMemo(() => {
    if (!activeTab) return null;
    if (activeTab.kind === "editor") {
      return (
        <div className="h-full px-3 pt-2 pb-2">
          <div className="h-full overflow-hidden rounded-md border border-border/60 bg-background">
            <EditorPane
              key={activeTab.id}
              path={activeTab.path}
              onDirtyChange={(dirty) => updateTab(activeTab.id, { dirty })}
            />
          </div>
        </div>
      );
    }
    return <div className="h-full px-3 pt-2 pb-2">{terminalStack}</div>;
  }, [activeTab, terminalStack, updateTab]);

  const activeCwd =
    activeTab?.kind === "terminal" ? (activeTab.cwd ?? null) : null;

  return (
    <ThemeProvider>
      <TooltipProvider>
        <div className="dark relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
          <Header
            tabs={tabs}
            activeId={activeId}
            onSelect={setActiveId}
            onNew={openNewTab}
            onClose={handleClose}
            onToggleSidebar={toggleSidebar}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onOpenSettings={() => {}}
            searchAddon={isTerminalTab ? activeSearchAddon : null}
            searchRef={searchInlineRef}
          />

          <main className="flex min-h-0 flex-1 flex-col">
            <ResizablePanelGroup
              orientation="horizontal"
              className="min-h-0 flex-1"
            >
              <ResizablePanel
                id="sidebar"
                panelRef={sidebarRef}
                defaultSize="22%"
                minSize="14%"
                maxSize="40%"
                collapsible
                collapsedSize={0}
              >
                <div className="h-full border-r border-border/60 bg-card">
                  <FileExplorer onOpenFile={handleOpenFile} />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="workspace"
                defaultSize="78%"
                minSize="30%"
              >
                <ResizablePanelGroup
                  orientation="vertical"
                  className="min-h-0 flex-1"
                >
                  <ResizablePanel
                    id="main"
                    defaultSize={
                      aiOpen && activeSession && isTerminalTab ? 65 : 100
                    }
                    minSize={25}
                  >
                    {mainContent}
                  </ResizablePanel>
                  {aiOpen && activeSession && isTerminalTab ? (
                    <>
                      <ResizableHandle />
                      <ResizablePanel id="ai" defaultSize={35} minSize={15}>
                        <motion.div
                          key="ai-session"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            type: "spring",
                            stiffness: 280,
                            damping: 30,
                          }}
                          className="h-full"
                        >
                          <AiSessionView session={activeSession} />
                        </motion.div>
                      </ResizablePanel>
                    </>
                  ) : null}
                </ResizablePanelGroup>
              </ResizablePanel>
            </ResizablePanelGroup>

            <AnimatePresence initial={false}>
              {aiOpen && isTerminalTab && (
                <motion.div
                  key="ai-input"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 320,
                    damping: 32,
                  }}
                  className="overflow-hidden"
                >
                  <AiInput
                    ref={aiInputRef}
                    onSubmit={handleAiSubmit}
                    onClose={() => setAiOpen(false)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          <StatusBar
            cwd={activeCwd}
            home={home}
            onCd={sendCd}
            aiOpen={aiOpen}
            canSubmit={activeSession?.status !== "thinking"}
            onOpenAi={toggleAi}
            onSubmit={() => {
              aiInputRef.current?.focus();
            }}
          />

          <ShortcutsDialog
            open={shortcutsOpen}
            onOpenChange={setShortcutsOpen}
          />
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}
