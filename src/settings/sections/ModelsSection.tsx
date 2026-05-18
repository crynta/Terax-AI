import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  MODELS,
  PROVIDERS,
  getAutocompleteEligibleModels,
  getModel,
  getProvider,
  providerNeedsKey,
  providerSupportsKey,
  type ModelId,
  type ProviderId,
} from "@/modules/ai/config";
import { clearKey, getAllKeys, getCustomEndpointKey, setCustomEndpointKey, clearCustomEndpointKey, setKey } from "@/modules/ai/lib/keyring";
import { fetchCustomEndpointModels, type RemoteModel } from "@/modules/ai/lib/fetchModels";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  emitKeysChanged,
  setAutocompleteEnabled,
  setAutocompleteModelId,
  setAutocompleteProvider,
  setCustomEndpoints,
  setDefaultModel,
  setLmstudioBaseURL,
  setLmstudioModelId,
} from "@/modules/settings/store";
import type { CustomEndpoint } from "@/modules/settings/store";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowDown01Icon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState } from "react";
import { ProviderIcon } from "../components/ProviderIcon";
import { ProviderKeyCard } from "../components/ProviderKeyCard";
import { SectionHeader } from "../components/SectionHeader";

type KeysMap = Record<ProviderId, string | null>;

export function ModelsSection() {
  const [keys, setKeys] = useState<KeysMap | null>(null);
  const defaultModel = usePreferencesStore((s) => s.defaultModelId);
  const lmstudioModelId = usePreferencesStore((s) => s.lmstudioModelId);
  const openaiCompatModelId = usePreferencesStore(
    (s) => s.openaiCompatibleModelId,
  );

  useEffect(() => {
    void getAllKeys().then(setKeys);
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

  if (!keys) {
    return <div className="text-[12px] text-muted-foreground">Loading…</div>;
  }

  const cloudProviders = PROVIDERS.filter(
    (p) =>
      providerNeedsKey(p.id) && p.id !== "lmstudio" && p.id !== "openai-compatible",
  );
  const configuredCount = cloudProviders.filter((p) => !!keys[p.id]).length;

  return (
    <div className="flex flex-col gap-7">
      <SectionHeader
        title="Models"
        description="Bring your own keys. They live in your OS keychain and are used only by Terax."
      />

      <DefaultModelBlock
        defaultModel={defaultModel}
        keys={keys}
        lmstudioModelId={lmstudioModelId}
        openaiCompatModelId={openaiCompatModelId}
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <Label>Cloud providers</Label>
          <span className="text-[10.5px] text-muted-foreground">
            {configuredCount} of {cloudProviders.length} configured
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {cloudProviders.map((p) => (
            <ProviderKeyCard
              key={p.id}
              provider={p}
              currentKey={keys[p.id]}
              onSave={(v) => onSave(p.id, v)}
              onClear={() => onClear(p.id)}
            />
          ))}
        </div>
      </div>

      <LocalModelsBlock />

      <CustomEndpointsBlock />

      <AutocompleteBlock keys={keys} />
    </div>
  );
}

function DefaultModelBlock({
  defaultModel,
  keys,
  lmstudioModelId,
  openaiCompatModelId,
}: {
  defaultModel: ModelId;
  keys: KeysMap;
  lmstudioModelId: string;
  openaiCompatModelId: string;
}) {
  const m = getModel(defaultModel);

  const isAvailable = (modelId: string, providerId: ProviderId): boolean => {
    if (modelId === "lmstudio-local") return !!lmstudioModelId.trim();
    if (modelId === "openai-compatible-custom")
      return !!openaiCompatModelId.trim();
    return providerNeedsKey(providerId) ? !!keys[providerId] : true;
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>Default model</Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="h-9 justify-between gap-2 px-2.5 text-[12px]"
          >
            <span className="flex items-center gap-2">
              <ProviderIcon provider={m.provider} size={14} />
              <span>{m.label}</span>
              <span className="text-muted-foreground">· {m.hint}</span>
            </span>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              size={12}
              strokeWidth={2}
              className="opacity-70"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="bottom"
          sideOffset={6}
          avoidCollisions={false}
          className="min-w-[280px] p-1"
        >
          <div className="max-h-[240px] overflow-y-auto overscroll-contain pr-1">
            {PROVIDERS.map((p) => {
              const models = MODELS.filter((x) => x.provider === p.id);
              if (models.length === 0) return null;
              const hasKey = providerNeedsKey(p.id) ? !!keys[p.id] : true;
              return (
                <div key={p.id} className="px-1 pt-1.5 first:pt-1">
                  <div className="mb-0.5 flex items-center gap-1.5 px-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    <ProviderIcon provider={p.id} size={11} />
                    <span>{p.label}</span>
                    {!hasKey ? (
                      <span className="ml-auto text-[9.5px] normal-case tracking-normal text-muted-foreground/70">
                        no key
                      </span>
                    ) : null}
                  </div>
                  {models.map((mod) => {
                    const available = isAvailable(mod.id, p.id);
                    return (
                      <DropdownMenuItem
                        key={mod.id}
                        disabled={!available}
                        onSelect={() =>
                          available && void setDefaultModel(mod.id as ModelId)
                        }
                        className={cn(
                          "flex items-start gap-2 text-[12px]",
                          mod.id === defaultModel && "bg-accent/50",
                        )}
                      >
                        <span className="flex flex-1 flex-col">
                          <span>{mod.label}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {mod.description}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function LocalModelsBlock() {
  const baseURL = usePreferencesStore((s) => s.lmstudioBaseURL);
  const modelId = usePreferencesStore((s) => s.lmstudioModelId);
  const [urlDraft, setUrlDraft] = useState(baseURL);
  const [modelDraft, setModelDraft] = useState(modelId);
  const [testStatus, setTestStatus] = useState<
    "idle" | "testing" | "ok" | "fail"
  >("idle");

  useEffect(() => setUrlDraft(baseURL), [baseURL]);
  useEffect(() => setModelDraft(modelId), [modelId]);

  const dirty =
    urlDraft.trim() !== baseURL || modelDraft.trim() !== modelId;

  const save = async () => {
    const u = urlDraft.trim();
    const m = modelDraft.trim();
    if (u && u !== baseURL) await setLmstudioBaseURL(u);
    if (m !== modelId) await setLmstudioModelId(m);
  };

  const test = async () => {
    setTestStatus("testing");
    try {
      const status = await invoke<number>("lm_ping", {
        baseUrl: urlDraft,
      });
      setTestStatus(status > 0 ? "ok" : "fail");
    } catch {
      setTestStatus("fail");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <Label>Local — LM Studio</Label>
        <span className="text-[10.5px] leading-relaxed text-muted-foreground">
          Run any GGUF model on your machine via LM Studio's HTTP server. Enable
          the server in LM Studio → Developer tab.
        </span>
      </div>

      <div className="flex flex-col gap-2.5 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
        <FieldRow label="Base URL">
          <div className="flex flex-1 gap-1.5">
            <Input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onBlur={() => {
                const v = urlDraft.trim();
                if (v && v !== baseURL) void setLmstudioBaseURL(v);
              }}
              placeholder="http://localhost:1234/v1"
              spellCheck={false}
              className="h-8 flex-1 font-mono text-[11.5px]"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void test()}
              disabled={!urlDraft.trim()}
              className="h-8 px-3 text-[11px]"
            >
              Test
            </Button>
            <Button
              size="sm"
              onClick={() => void save()}
              disabled={!dirty}
              className="h-8 px-3 text-[11px]"
            >
              Save
            </Button>
          </div>
        </FieldRow>

        <FieldRow label="Model ID">
          <Input
            value={modelDraft}
            onChange={(e) => setModelDraft(e.target.value)}
            onBlur={() => {
              const v = modelDraft.trim();
              if (v !== modelId) void setLmstudioModelId(v);
            }}
            placeholder="qwen2.5-coder-7b-instruct"
            spellCheck={false}
            className="h-8 font-mono text-[11.5px]"
          />
        </FieldRow>

        <StatusLine status={testStatus} />

        {!modelId.trim() ? (
          <p className="text-[10.5px] leading-relaxed text-amber-600 dark:text-amber-400">
            Enter the model id that's loaded in LM Studio — e.g. the one shown
            on the server's <span className="font-mono">/v1/models</span> page.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CustomEndpointsBlock() {
  const endpoints = usePreferencesStore((s) => s.customEndpoints);
  const [editing, setEditing] = useState<CustomEndpoint | null>(null);
  const [form, setForm] = useState({ name: "", baseURL: "", modelId: "", contextWindow: "128000" });
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [showForm, setShowForm] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<Map<string, RemoteModel[]>>(new Map());
  const [fetchingEp, setFetchingEp] = useState<Set<string>>(new Set());
  const [epKeys, setEpKeys] = useState<Record<string, string | null>>({});
  const [epKeyDrafts, setEpKeyDrafts] = useState<Record<string, string>>(({}));

  useEffect(() => {
    void (async () => {
      const map: Record<string, string | null> = {};
      for (const ep of endpoints) {
        map[ep.id] = await getCustomEndpointKey(ep.id);
      }
      setEpKeys(map);
    })();
  }, [endpoints]);

  const resetForm = () => {
    setForm({ name: "", baseURL: "", modelId: "", contextWindow: "128000" });
    setEditing(null);
    setShowForm(false);
    setTestStatus("idle");
  };

  const saveForm = async () => {
    const name = form.name.trim();
    const baseURL = form.baseURL.trim();
    const modelId = form.modelId.trim();
    const contextWindow = parseInt(form.contextWindow, 10) || 128000;
    if (!name || !baseURL || !modelId) return;

    let updated: CustomEndpoint[];
    if (editing) {
      updated = endpoints.map((e) =>
        e.id === editing.id ? { ...e, name, baseURL, modelId, contextWindow } : e,
      );
    } else {
      const ep: CustomEndpoint = {
        id: crypto.randomUUID(),
        name,
        baseURL,
        modelId,
        contextWindow,
      };
      updated = [...endpoints, ep];
    }
    await setCustomEndpoints(updated);
    resetForm();
  };

  const removeEndpoint = async (id: string) => {
    await setCustomEndpoints(endpoints.filter((e) => e.id !== id));
    setFetchedModels((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const startEdit = (ep: CustomEndpoint) => {
    setEditing(ep);
    setForm({ name: ep.name, baseURL: ep.baseURL, modelId: ep.modelId, contextWindow: String(ep.contextWindow) });
    setShowForm(true);
    setTestStatus("idle");
  };

  const test = async () => {
    setTestStatus("testing");
    try {
      const status = await invoke<number>("lm_ping", { baseUrl: form.baseURL });
      setTestStatus(status > 0 ? "ok" : "fail");
    } catch {
      setTestStatus("fail");
    }
  };

  const fetchModels = async (ep: CustomEndpoint) => {
    setFetchingEp((prev) => new Set(prev).add(ep.id));
    try {
      const result = await fetchCustomEndpointModels(ep.baseURL, epKeys[ep.id]);
      if (result.models.length > 0) {
        setFetchedModels((prev) => new Map(prev).set(ep.id, result.models));
      } else {
        setFetchedModels((prev) => {
          const next = new Map(prev);
          next.delete(ep.id);
          return next;
        });
      }
    } catch {
      setFetchedModels((prev) => {
        const next = new Map(prev);
        next.delete(ep.id);
        return next;
      });
    } finally {
      setFetchingEp((prev) => {
        const next = new Set(prev);
        next.delete(ep.id);
        return next;
      });
    }
  };

  const selectModel = async (ep: CustomEndpoint, modelId: string, ctx: number | null) => {
    const updated = endpoints.map((e) =>
      e.id === ep.id ? { ...e, modelId, contextWindow: ctx ?? e.contextWindow } : e,
    );
    await setCustomEndpoints(updated);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <Label>Custom endpoints</Label>
          <span className="text-[10.5px] leading-relaxed text-muted-foreground">
            Add multiple OpenAI-compatible endpoints — AWS, vLLM, VibeProxy, etc.
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => { resetForm(); setShowForm(true); }}
          className="h-7 px-2.5 text-[11px]"
        >
          + Add
        </Button>
      </div>

      {endpoints.length > 0 && (
        <div className="flex flex-col gap-2">
          {endpoints.map((ep) => {
            const models = fetchedModels.get(ep.id);
            const loading = fetchingEp.has(ep.id);
            return (
              <div key={ep.id} className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-card/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 flex-col">
                    <span className="text-[11.5px] font-medium">{ep.name}</span>
                    <span className="truncate font-mono text-[10px] text-muted-foreground">
                      {ep.modelId} · {ep.baseURL}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60">
                      context {ep.contextWindow.toLocaleString()}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void fetchModels(ep)}
                    disabled={loading}
                    className="h-6 px-2 text-[10px]"
                  >
                    {loading ? "..." : "Fetch"}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => startEdit(ep)}
                    className="size-6 text-muted-foreground"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={1.75} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => void removeEndpoint(ep.id)}
                    className="size-6 text-muted-foreground hover:text-destructive"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={1.75} />
                  </Button>
                </div>
                {models && models.length > 0 && (
                  <div className="max-h-[160px] overflow-y-auto rounded border border-border/40 bg-background/40">
                    {models.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => void selectModel(ep, m.id, m.context_length)}
                        className={cn(
                          "flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-accent/50",
                          m.id === ep.modelId && "bg-accent/40",
                        )}
                      >
                        <span className="flex-1 truncate font-mono text-[10.5px]">{m.id}</span>
                        <span className="flex shrink-0 gap-1">
                          {m.context_length != null && (
                            <span className="rounded bg-muted/50 px-1 text-[9px] text-muted-foreground">
                              {(m.context_length / 1000).toFixed(0)}k
                            </span>
                          )}
                          {m.supports_tools && (
                            <span className="rounded bg-muted/50 px-1 text-[9px] text-muted-foreground">tools</span>
                          )}
                          {m.supports_reasoning && (
                            <span className="rounded bg-muted/50 px-1 text-[9px] text-muted-foreground">think</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="w-7 shrink-0 text-[10px] text-muted-foreground">Key</span>
                  {epKeys[ep.id] ? (
                    <div className="flex flex-1 items-center gap-1.5">
                      <code className="flex-1 truncate rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {`${epKeys[ep.id]!.slice(0, 4)}${"•".repeat(6)}${epKeys[ep.id]!.slice(-4)}`}
                      </code>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={async () => {
                          await clearCustomEndpointKey(ep.id);
                          await emitKeysChanged();
                          setEpKeys((prev) => ({ ...prev, [ep.id]: null }));
                        }}
                        className="size-5 text-muted-foreground hover:text-destructive"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={1.75} />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-1 gap-1.5">
                      <Input
                        type="password"
                        value={epKeyDrafts[ep.id] ?? ""}
                        onChange={(e) => setEpKeyDrafts((prev) => ({ ...prev, [ep.id]: e.target.value }))}
                        placeholder="Optional — leave empty for unauthenticated"
                        spellCheck={false}
                        className="h-6 flex-1 font-mono text-[10.5px]"
                      />
                      <Button
                        size="sm"
                        onClick={async () => {
                          const v = (epKeyDrafts[ep.id] ?? "").trim();
                          if (!v) return;
                          await setCustomEndpointKey(ep.id, v);
                          await emitKeysChanged();
                          setEpKeys((prev) => ({ ...prev, [ep.id]: v }));
                          setEpKeyDrafts((prev) => {
                            const next = { ...prev };
                            delete next[ep.id];
                            return next;
                          });
                        }}
                        disabled={!(epKeyDrafts[ep.id] ?? "").trim()}
                        className="h-6 px-2 text-[10px]"
                      >
                        Save
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {endpoints.length === 0 && !showForm && (
        <span className="text-[10.5px] text-muted-foreground/60">
          No custom endpoints configured.
        </span>
      )}

      {showForm && (
        <div className="flex flex-col gap-2.5 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
          <FieldRow label="Name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="My endpoint"
              spellCheck={false}
              className="h-8 flex-1 text-[11.5px]"
            />
          </FieldRow>

          <FieldRow label="Base URL">
            <div className="flex flex-1 gap-1.5">
              <Input
                value={form.baseURL}
                onChange={(e) => setForm({ ...form, baseURL: e.target.value })}
                placeholder="https://api.example.com/v1"
                spellCheck={false}
                className="h-8 flex-1 font-mono text-[11.5px]"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void test()}
                disabled={!form.baseURL.trim()}
                className="h-8 px-3 text-[11px]"
              >
                Test
              </Button>
            </div>
          </FieldRow>

          <FieldRow label="Model ID">
            <Input
              value={form.modelId}
              onChange={(e) => setForm({ ...form, modelId: e.target.value })}
              placeholder="gpt-4o, qwen3-max, glm-4.6, …"
              spellCheck={false}
              className="h-8 font-mono text-[11.5px]"
            />
          </FieldRow>

          <FieldRow label="Context">
            <Input
              value={form.contextWindow}
              onChange={(e) => setForm({ ...form, contextWindow: e.target.value.replace(/\D/g, "") })}
              placeholder="128000"
              spellCheck={false}
              className="h-8 w-28 font-mono text-[11.5px]"
            />
          </FieldRow>

          <StatusLine status={testStatus} />

          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={resetForm} className="h-7 px-2.5 text-[11px]">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void saveForm()}
              disabled={!form.name.trim() || !form.baseURL.trim() || !form.modelId.trim()}
              className="h-7 px-3 text-[11px]"
            >
              {editing ? "Update" : "Add endpoint"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AutocompleteBlock({ keys }: { keys: KeysMap }) {
  const enabled = usePreferencesStore((s) => s.autocompleteEnabled);
  const provider = usePreferencesStore((s) => s.autocompleteProvider);
  const modelId = usePreferencesStore((s) => s.autocompleteModelId);
  const eligible = useMemo(() => getAutocompleteEligibleModels(), []);

  const currentModel = useMemo(
    () =>
      MODELS.find((m) => m.provider === provider && m.id === modelId) ??
      MODELS.find((m) => m.id === modelId) ??
      eligible[0],
    [eligible, provider, modelId],
  );

  const setModel = (id: string, providerId: ProviderId) => {
    void setAutocompleteProvider(providerId);
    void setAutocompleteModelId(id);
  };

  const hasKey = providerSupportsKey(provider)
    ? providerNeedsKey(provider)
      ? !!keys[provider]
      : true
    : true;

  // Group eligible models by provider for the dropdown.
  const grouped = useMemo(() => {
    const map = new Map<ProviderId, (typeof eligible)[number][]>();
    for (const m of eligible) {
      const arr = map.get(m.provider) ?? [];
      arr.push(m);
      map.set(m.provider, arr);
    }
    return map;
  }, [eligible]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <Label>Editor autocomplete</Label>
          <span className="text-[10.5px] leading-relaxed text-muted-foreground">
            Inline ghost-text suggestions in the code editor. Pick a fast model
            (LPU/wafer-scale, local, or a small cloud tier).
          </span>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => void setAutocompleteEnabled(v)}
        />
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
        <FieldRow label="Model">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-8 flex-1 justify-between gap-2 px-2.5 text-[11.5px]"
              >
                <span className="flex items-center gap-2 truncate">
                  <ProviderIcon provider={currentModel.provider} size={12} />
                  <span className="truncate">{currentModel.label}</span>
                  <span className="text-muted-foreground">
                    · {currentModel.hint}
                  </span>
                </span>
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  size={11}
                  strokeWidth={2}
                  className="opacity-70"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-[24rem] min-w-[280px] overflow-y-auto"
            >
              {PROVIDERS.map((p) => {
                const list = grouped.get(p.id);
                if (!list || list.length === 0) return null;
                const pHasKey = providerNeedsKey(p.id) ? !!keys[p.id] : true;
                return (
                  <div key={p.id} className="px-1 pt-1.5 first:pt-1">
                    <div className="mb-0.5 flex items-center gap-1.5 px-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                      <ProviderIcon provider={p.id} size={11} />
                      <span>{p.label}</span>
                      {!pHasKey ? (
                        <span className="ml-auto text-[9.5px] normal-case tracking-normal text-muted-foreground/70">
                          no key
                        </span>
                      ) : null}
                    </div>
                    {list.map((m) => (
                      <DropdownMenuItem
                        key={m.id}
                        disabled={!pHasKey}
                        onSelect={() => pHasKey && setModel(m.id, p.id)}
                        className={cn(
                          "text-[11.5px]",
                          m.id === modelId && "bg-accent/50",
                        )}
                      >
                        <span className="flex flex-col">
                          <span>{m.label}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {m.description}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </div>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </FieldRow>

        {!hasKey ? (
          <span className="text-[10.5px] text-amber-500">
            No API key configured for {getProvider(provider).label}. Add one
            above.
          </span>
        ) : null}
      </div>
    </div>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-[11px] tracking-tight text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-1 items-center">{children}</div>
    </div>
  );
}

function StatusLine({
  status,
}: {
  status: "idle" | "testing" | "ok" | "fail";
}) {
  if (status === "idle") return null;
  if (status === "testing") {
    return (
      <span className="text-[10.5px] text-muted-foreground">Testing…</span>
    );
  }
  if (status === "ok") {
    return (
      <span className="flex items-center gap-1 text-[10.5px] text-emerald-600 dark:text-emerald-400">
        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={11} strokeWidth={2} />
        Reachable — server responded.
      </span>
    );
  }
  return (
    <span className="text-[10.5px] text-destructive">
      Could not reach the server.
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
      {children}
    </span>
  );
}
