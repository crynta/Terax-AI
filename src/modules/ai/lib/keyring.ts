import {
  deletePassword,
  getPassword,
  setPassword,
} from "tauri-plugin-keyring-api";
import {
  getProvider,
  KEYRING_SERVICE,
  PROVIDERS,
  providerNeedsKey,
  type ProviderId,
} from "../config";

export type ProviderKeys = Record<ProviderId, string | null>;

export const EMPTY_PROVIDER_KEYS: ProviderKeys = {
  openai: null,
  anthropic: null,
  google: null,
  xai: null,
  cerebras: null,
  groq: null,
  lmstudio: null,
};

export async function getKey(provider: ProviderId): Promise<string | null> {
  if (!providerNeedsKey(provider)) return null;
  try {
    const v = await getPassword(KEYRING_SERVICE, getProvider(provider).keyringAccount);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export async function setKey(provider: ProviderId, key: string): Promise<void> {
  if (!providerNeedsKey(provider)) {
    throw new Error(`${provider} does not use an API key`);
  }
  const trimmed = key.trim();
  if (!trimmed) throw new Error("API key is empty");
  await setPassword(KEYRING_SERVICE, getProvider(provider).keyringAccount, trimmed);
}

export async function clearKey(provider: ProviderId): Promise<void> {
  if (!providerNeedsKey(provider)) return;
  try {
    await deletePassword(KEYRING_SERVICE, getProvider(provider).keyringAccount);
  } catch {
    // already absent — fine
  }
}

export async function getAllKeys(): Promise<ProviderKeys> {
  const entries = await Promise.all(
    PROVIDERS.map(async (p) => [p.id, await getKey(p.id)] as const),
  );
  const out = { ...EMPTY_PROVIDER_KEYS };
  for (const [id, v] of entries) out[id] = v;
  return out;
}

export function hasAnyKey(keys: ProviderKeys): boolean {
  return PROVIDERS.some((p) => providerNeedsKey(p.id) && !!keys[p.id]);
}
