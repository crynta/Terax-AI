import { cn } from "@/lib/utils";
import {
  InformationCircleIcon,
  Settings01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import type { SettingsTab } from "@/modules/settings/openSettingsWindow";
import { AboutSection } from "./sections/AboutSection";
import { AiSection } from "./sections/AiSection";
import { GeneralSection } from "./sections/GeneralSection";

type TabDef = {
  id: SettingsTab;
  label: string;
  icon: typeof Settings01Icon;
};

const TABS: TabDef[] = [
  { id: "general", label: "General", icon: Settings01Icon },
  { id: "ai", label: "AI", icon: SparklesIcon },
  { id: "about", label: "About", icon: InformationCircleIcon },
];

function readInitialTab(): SettingsTab {
  if (typeof window === "undefined") return "general";
  const url = new URL(window.location.href);
  const t = url.searchParams.get("tab");
  if (t === "general" || t === "ai" || t === "about") return t;
  return "general";
}

export function SettingsApp() {
  const [active, setActive] = useState<SettingsTab>(readInitialTab);

  useEffect(() => {
    const onTab = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail === "general" || detail === "ai" || detail === "about") {
        setActive(detail);
      }
    };
    window.addEventListener("terax:settings-tab", onTab);
    return () => window.removeEventListener("terax:settings-tab", onTab);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground select-none">
      <aside
        data-tauri-drag-region
        className="flex w-[180px] shrink-0 flex-col gap-1 border-r border-border/60 bg-card/60 px-3 pt-12 pb-3"
      >
        <div className="mb-2 flex items-center gap-2 px-2">
          <img src="/logo.png" alt="" className="size-3.5" draggable={false} />
          <span className="text-[11px] font-semibold tracking-tight">
            Settings
          </span>
        </div>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-2 text-[12px] transition-colors",
              active === t.id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <HugeiconsIcon icon={t.icon} size={14} strokeWidth={1.75} />
            <span>{t.label}</span>
          </button>
        ))}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto px-7 pt-12 pb-7">
        {active === "general" && <GeneralSection />}
        {active === "ai" && <AiSection />}
        {active === "about" && <AboutSection />}
      </main>
    </div>
  );
}
