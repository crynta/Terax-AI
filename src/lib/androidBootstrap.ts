// src/lib/androidBootstrap.ts
//
// On Android first launch, the Rust `bootstrap_android` command extracts
// the bundled proot binary + Alpine rootfs into the app's private files
// dir. PTY creation will refuse to start until both exist, so we await
// the bootstrap before mounting the React tree.
//
// On desktop targets this is a no-op (and returns instantly), so it's
// safe to call unconditionally from `main.tsx`.

import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";

let bootstrapPromise: Promise<void> | null = null;

/**
 * Resolve once the Android sandbox is ready. Memoizes the promise so
 * StrictMode's dev double-invoke doesn't trigger two parallel
 * extractions.
 *
 * On desktop platforms this resolves immediately.
 */
export function ensureAndroidBootstrapped(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    let os: string;
    try {
      os = platform();
    } catch {
      // Browser-only smoke test or other non-Tauri host: nothing to do.
      return;
    }
    if (os !== "android") return;

    try {
      const result = await invoke<string>("bootstrap_android");
      if (result === "bootstrapped") {
        console.info("[terax] Android bootstrap complete");
      } else {
        console.debug("[terax] Android bootstrap already complete");
      }
    } catch (err) {
      // Surface the failure but don't block forever — the PTY commands
      // will report the same problem with a clearer error when the user
      // tries to open a terminal.
      console.error("[terax] Android bootstrap failed:", err);
    }
  })();
  return bootstrapPromise;
}
