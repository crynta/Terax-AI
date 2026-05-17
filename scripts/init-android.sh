#!/usr/bin/env bash
#
# init-android.sh — generate src-tauri/gen/android and copy our Kotlin
# plugin sources into the right package directory. Idempotent: re-run
# whenever you touch src-tauri/android-plugins/ or want to refresh the
# Android project after a Tauri upgrade.
#
# Required env:
#   ANDROID_HOME   path to the Android SDK (must contain ndk/<version>)
#   NDK_HOME       (optional) path to a specific NDK; auto-detected otherwise
#
# Usage:
#   ./scripts/init-android.sh

set -euo pipefail

repo_root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$repo_root"

if [[ -z "${ANDROID_HOME:-}" ]]; then
  echo "ERROR: ANDROID_HOME is not set — install Android Studio or the" >&2
  echo "       command-line tools, then export ANDROID_HOME=\$HOME/Android/Sdk" >&2
  exit 1
fi

# Pick an NDK: prefer NDK_HOME, else newest under $ANDROID_HOME/ndk/.
if [[ -z "${NDK_HOME:-}" ]]; then
  ndk_dir="$ANDROID_HOME/ndk"
  if [[ ! -d "$ndk_dir" ]]; then
    echo "ERROR: no NDK found under $ndk_dir — install via sdkmanager:" >&2
    echo "       sdkmanager 'ndk;28.0.12916984'" >&2
    exit 1
  fi
  NDK_HOME=$(ls -d "$ndk_dir"/*/ 2>/dev/null | sort -V | tail -n1)
  NDK_HOME="${NDK_HOME%/}"
  export NDK_HOME
fi
echo "Using NDK: $NDK_HOME"

# Add the Rust Android targets once. cargo-android will error out at build
# time if they're missing.
if command -v rustup >/dev/null 2>&1; then
  rustup target add \
    aarch64-linux-android \
    armv7-linux-androideabi \
    i686-linux-android \
    x86_64-linux-android
else
  echo "WARN: rustup not found — skipping target add. cargo will fail at build" >&2
  echo "      time if the Android targets are missing." >&2
fi

# 1) Initialize the Android project if it doesn't exist yet. The Tauri CLI
#    refuses to re-init in place, so we only call it when missing.
gen_dir="src-tauri/gen/android"
if [[ ! -d "$gen_dir" ]]; then
  echo "Generating $gen_dir via 'pnpm tauri android init' ..."
  pnpm tauri android init
else
  echo "$gen_dir already exists — skipping init"
fi

# 2) Copy our Kotlin plugin sources in. Plugins discovered by Tauri at
#    build time via the @TauriPlugin annotation — no MainActivity patching
#    required on Tauri 2 stable.
target_pkg_dir="$gen_dir/app/src/main/java/app/crynta/terax"
mkdir -p "$target_pkg_dir"

shopt -s nullglob
copied=0
for src in src-tauri/android-plugins/app.crynta.terax/*.kt; do
  cp "$src" "$target_pkg_dir/"
  echo "Copied $(basename "$src") → $target_pkg_dir/"
  copied=$((copied + 1))
done
shopt -u nullglob

if [[ $copied -eq 0 ]]; then
  echo "WARN: no plugin sources found under src-tauri/android-plugins/app.crynta.terax/" >&2
fi

echo
echo "Done. Next steps:"
echo "  pnpm tauri android dev                   # run on a connected device"
echo "  pnpm tauri android build --apk --debug   # produce a debug APK"
