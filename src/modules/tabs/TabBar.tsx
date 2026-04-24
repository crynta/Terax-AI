import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fileIconUrl } from "@/modules/explorer/lib/iconResolver";
import {
  Cancel01Icon,
  Folder01Icon,
  Folder02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Tab } from "./lib/useTabs";

type Props = {
  tabs: Tab[];
  activeId: number;
  onSelect: (id: number) => void;
  onNew: () => void;
  onClose: (id: number) => void;
};

export function TabBar({ tabs, activeId, onSelect, onNew, onClose }: Props) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Tabs
        value={String(activeId)}
        onValueChange={(v) => onSelect(Number(v))}
        className="min-w-0 shrink"
      >
        <TabsList className="h-7 gap-0.5 bg-transparent p-0">
          {tabs.map((t) => (
            <TabsTrigger
              key={t.id}
              value={String(t.id)}
              className="group h-7 gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors data-[state=active]:bg-accent data-[state=active]:text-foreground hover:text-foreground/80"
            >
              <span className="max-w-50 truncate flex items-center gap-2 px-4">
                <TabIcon tab={t} active={t.id === activeId} />
                {labelFor(t)}
                {t.kind === "editor" && t.dirty && (
                  <span
                    aria-label="Unsaved changes"
                    className="size-1.5 rounded-full bg-foreground/70"
                  />
                )}
              </span>
              {tabs.length > 1 && (
                <span
                  role="button"
                  aria-label="Close tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(t.id);
                  }}
                  className="rounded p-0.5 opacity-0 transition-opacity hover:bg-accent hover:opacity-100 group-hover:opacity-60"
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    size={11}
                    strokeWidth={2}
                  />
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={onNew}
        title="New tab (⌘T)"
      >
        <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} />
      </Button>
    </div>
  );
}

function TabIcon({ tab, active }: { tab: Tab; active: boolean }) {
  if (tab.kind === "editor") {
    const url = fileIconUrl(tab.title);
    return url ? (
      <img src={url} alt="" className="size-3.5 shrink-0" />
    ) : null;
  }
  return (
    <HugeiconsIcon
      icon={active ? Folder02Icon : Folder01Icon}
      size={14}
      strokeWidth={2}
    />
  );
}

function labelFor(t: Tab): string {
  if (t.kind === "editor") return t.title;
  if (!t.cwd) return t.title;
  const parts = t.cwd.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "/";
}
