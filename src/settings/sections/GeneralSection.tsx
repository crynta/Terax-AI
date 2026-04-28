import { cn } from "@/lib/utils";
import { useTheme } from "@/modules/theme";
import {
  ComputerIcon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ThemePref } from "@/modules/settings/store";
import { SectionHeader } from "../components/SectionHeader";

const OPTIONS: {
  id: ThemePref;
  label: string;
  icon: typeof ComputerIcon;
}[] = [
  { id: "system", label: "System", icon: ComputerIcon },
  { id: "light", label: "Light", icon: Sun03Icon },
  { id: "dark", label: "Dark", icon: Moon02Icon },
];

export function GeneralSection() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="General"
        description="Appearance and global Terax preferences."
      />

      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-medium tracking-tight text-muted-foreground">
          Appearance
        </label>
        <div className="grid grid-cols-3 gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setTheme(o.id)}
              className={cn(
                "group flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg border bg-card transition-all",
                theme === o.id
                  ? "border-foreground/60 ring-1 ring-foreground/20"
                  : "border-border/60 hover:border-border",
              )}
            >
              <HugeiconsIcon icon={o.icon} size={18} strokeWidth={1.5} />
              <span className="text-[11.5px]">{o.label}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          System follows your OS preference.
        </p>
      </div>
    </div>
  );
}
