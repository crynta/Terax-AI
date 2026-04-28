import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";
import { DEFAULT_MODEL_ID, type ModelId } from "@/modules/ai/config";

export type ThemePref = "system" | "light" | "dark";

export type Preferences = {
  theme: ThemePref;
  defaultModelId: ModelId;
};

const STORE_PATH = "terax-settings.json";
const KEY_THEME = "theme";
const KEY_DEFAULT_MODEL = "defaultModelId";

const DEFAULTS: Preferences = {
  theme: "system",
  defaultModelId: DEFAULT_MODEL_ID,
};

const store = new LazyStore(STORE_PATH, { defaults: {}, autoSave: 200 });

export async function loadPreferences(): Promise<Preferences> {
  const [theme, defaultModelId] = await Promise.all([
    store.get<ThemePref>(KEY_THEME),
    store.get<ModelId>(KEY_DEFAULT_MODEL),
  ]);
  return {
    theme: theme ?? DEFAULTS.theme,
    defaultModelId: defaultModelId ?? DEFAULTS.defaultModelId,
  };
}

export async function setTheme(value: ThemePref): Promise<void> {
  await store.set(KEY_THEME, value);
  await store.save();
}

export async function setDefaultModel(value: ModelId): Promise<void> {
  await store.set(KEY_DEFAULT_MODEL, value);
  await store.save();
}

/** Subscribe to changes from any window (settings → main). */
export function onPreferencesChange(
  cb: (key: "theme" | "defaultModelId", value: unknown) => void,
): Promise<UnlistenFn> {
  return store.onChange<unknown>((key, value) => {
    if (key === KEY_THEME) cb("theme", value);
    else if (key === KEY_DEFAULT_MODEL) cb("defaultModelId", value);
  });
}

// API key changes are stored in OS keychain (not the prefs store),
// so we broadcast via a Tauri event for cross-window listeners.
const KEYS_CHANGED_EVENT = "terax://ai-keys-changed";

export async function emitKeysChanged(): Promise<void> {
  await emit(KEYS_CHANGED_EVENT);
}

export function onKeysChanged(cb: () => void): Promise<UnlistenFn> {
  return listen(KEYS_CHANGED_EVENT, () => cb());
}
