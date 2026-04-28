import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  MODELS,
  PROVIDERS,
  getModel,
  type ModelId,
  type ProviderId,
} from "@/modules/ai/config";
import { clearKey, getAllKeys, setKey } from "@/modules/ai/lib/keyring";
import {
  emitKeysChanged,
  loadPreferences,
  setDefaultModel,
} from "@/modules/settings/store";
import {
  ArrowDown01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { ProviderKeyCard } from "../components/ProviderKeyCard";
import { ProviderIcon } from "../components/ProviderIcon";
import { SectionHeader } from "../components/SectionHeader";

type KeysMap = Record<ProviderId, string | null>;

export function AiSection() {
  const [keys, setKeys] = useState<KeysMap | null>(null);
  const [defaultModel, setDefault] = useState<ModelId | null>(null);

  useEffect(() => {
    void getAllKeys().then(setKeys);
    void loadPreferences().then((p) => setDefault(p.defaultModelId));
  }, []);

  const onSave = async (provider: ProviderId, value: string) => {
    await setKey(provider, value);
    setKeys((prev) => (prev ? { ...prev, [provider]: value } : prev));
    await emitKeysChanged();
  };

  const onClear = async (provider: ProviderId) => {
    await clearKey(provider);
    setKeys((prev) => (prev ? { ...prev, [provider]: null } : prev));
    await emitKeysChanged();
  };

  const onPickDefault = async (id: ModelId) => {
    setDefault(id);
    await setDefaultModel(id);
  };

  if (!keys || !defaultModel) {
    return (
      <div className="text-[12px] text-muted-foreground">Loading…</div>
    );
  }

  const defaultModelInfo = getModel(defaultModel);

  return (
    <div className="flex flex-col gap-7">
      <SectionHeader
        title="AI"
        description="Bring your own keys. They are stored in your OS keychain and used only by Terax."
      />

      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-medium tracking-tight text-muted-foreground">
          Default model
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-9 justify-between gap-2 px-2.5 text-[12px]"
            >
              <span className="flex items-center gap-2">
                <ProviderIcon provider={defaultModelInfo.provider} size={14} />
                <span>{defaultModelInfo.label}</span>
                <span className="text-muted-foreground">
                  · {defaultModelInfo.hint}
                </span>
              </span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={12}
                strokeWidth={2}
                className="opacity-70"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[260px]">
            {PROVIDERS.map((p) => {
              const models = MODELS.filter((m) => m.provider === p.id);
              const hasKey = !!keys[p.id];
              return (
                <div key={p.id} className="px-1 pt-1.5">
                  <div className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    <ProviderIcon provider={p.id} size={11} />
                    <span>{p.label}</span>
                    {!hasKey && (
                      <span className="ml-auto text-[9.5px] normal-case tracking-normal text-muted-foreground/70">
                        no key
                      </span>
                    )}
                  </div>
                  {models.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      disabled={!hasKey}
                      onSelect={() => hasKey && onPickDefault(m.id as ModelId)}
                      className={cn(
                        "flex items-center justify-between gap-2 text-[12px]",
                        m.id === defaultModel && "bg-accent/50",
                      )}
                    >
                      <span className="flex flex-col">
                        <span>{m.label}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {m.hint}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </div>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col gap-3">
        <label className="text-[11px] font-medium tracking-tight text-muted-foreground">
          API keys
        </label>
        <div className="flex flex-col gap-2">
          {PROVIDERS.map((p) => (
            <ProviderKeyCard
              key={p.id}
              provider={p}
              currentKey={keys[p.id]}
              onSave={(v: string) => onSave(p.id, v)}
              onClear={() => onClear(p.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
