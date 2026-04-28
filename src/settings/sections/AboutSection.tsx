import { Button } from "@/components/ui/button";
import { getName, getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";

const REPO_URL = "https://github.com/crynta/terax";

export function AboutSection() {
  const [version, setVersion] = useState<string>("");
  const [name, setName] = useState<string>("Terax");

  useEffect(() => {
    void getVersion().then(setVersion);
    void getName().then(setName);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="About" description="" />

      <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-card/60 p-5">
        <img src="/logo.png" alt="" className="size-12" draggable={false} />
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold tracking-tight">
            {name}
          </span>
          <span className="text-[11px] text-muted-foreground">
            Open-source AI-native terminal emulator
          </span>
          <span className="mt-1 text-[11px] font-mono text-muted-foreground">
            v{version}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-[12px]">
        <dt className="text-muted-foreground">Bundle ID</dt>
        <dd className="font-mono text-[11.5px]">app.crynta.terax</dd>
        <dt className="text-muted-foreground">License</dt>
        <dd>Apache 2.0</dd>
        <dt className="text-muted-foreground">Author</dt>
        <dd>Crynta</dd>
      </dl>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void openUrl(REPO_URL)}
        >
          GitHub
        </Button>
      </div>
    </div>
  );
}
