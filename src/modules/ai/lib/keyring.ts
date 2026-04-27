import {
  deletePassword,
  getPassword,
  setPassword,
} from "tauri-plugin-keyring-api";
import { KEYRING_ACCOUNT_OPENAI, KEYRING_SERVICE } from "../config";

export async function getOpenAiKey(): Promise<string | null> {
  try {
    const v = await getPassword(KEYRING_SERVICE, KEYRING_ACCOUNT_OPENAI);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export async function setOpenAiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) throw new Error("API key is empty");
  await setPassword(KEYRING_SERVICE, KEYRING_ACCOUNT_OPENAI, trimmed);
}

export async function clearOpenAiKey(): Promise<void> {
  try {
    await deletePassword(KEYRING_SERVICE, KEYRING_ACCOUNT_OPENAI);
  } catch {
    // already absent — fine
  }
}

export async function hasOpenAiKey(): Promise<boolean> {
  return (await getOpenAiKey()) !== null;
}
