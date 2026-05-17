# Building Terax for Android

Terax has experimental Android support: it ships an `aarch64-linux-android`
`proot` binary plus an Alpine Linux minirootfs, and runs the PTY shell inside
the chroot. Everything else (file explorer, AI agent, editor) reuses the
desktop code.

This document covers what's already wired up, how to build the APK on a dev
machine, and what's left to verify on real hardware.

## Architecture overview

| Concern         | Desktop                                  | Android                                                                 |
| --------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| PTY backend     | `portable-pty` (`src-tauri/.../pty/session.rs`) | `nix::pty::openpty` + proot (`src-tauri/.../pty/android.rs`)            |
| Login shell    | user's `$SHELL` (zsh/bash/fish/PowerShell)| Alpine `/bin/sh -l`                                                     |
| One-shot shell  | login shell with `-lc`                   | proot → Alpine `sh -lc` (`shell::build_oneshot_command`)                |
| Key storage     | macOS Keychain / Windows Cred Mgr / file | 0600 file in app private dir; optional `KeystorePlugin.kt`              |
| Settings window | second WebView window                    | not used (Android has no multi-window)                                  |
| Auto-updater    | `tauri-plugin-updater`                   | disabled — APK updates go through Play / sideload                       |
| Touch input    | desktop key events                       | hidden `<input>` parked off-screen + IME forwarder (`terminal/touch.ts`)|

## What's already in the repo

- **Rust side**
  - `src-tauri/src/bootstrap.rs` — `bootstrap_android` Tauri command. Extracts
    proot + Alpine rootfs from the APK assets to `/data/data/<pkg>/files/`.
  - `src-tauri/src/modules/pty/android.rs` — Android PTY implementation.
  - `src-tauri/src/modules/shell/mod.rs::build_oneshot_command` — wraps every
    one-shot command in proot when compiling for Android.
  - `Cargo.toml` `cfg(target_os = "android")` dep on `nix` (no `portable-pty`).
  - `tauri.conf.json` declares the two binary assets as `bundle.resources`.
- **Android-side stubs**
  - `src-tauri/android-plugins/app.crynta.terax/BootstrapPlugin.kt` — Kotlin
    fallback for rootfs extraction.
  - `src-tauri/android-plugins/app.crynta.terax/KeystorePlugin.kt` — optional
    hardware-backed AES-GCM key wrapper.
- **Frontend**
  - `src/lib/androidBootstrap.ts` — `ensureAndroidBootstrapped()` blocks React
    mount until the rootfs is on disk (no-op on desktop).
  - `src/modules/terminal/touch.ts` — soft-keyboard IME bridge.
- **CI**
  - `.github/workflows/android.yml` — downloads the real Alpine rootfs, builds
    proot from source, runs `tauri android build`, uploads the APK as an
    artifact.

## Prerequisites for a local build

```bash
# Android Studio (or just the command-line tools)
export ANDROID_HOME=$HOME/Android/Sdk

# JDK 17 — Tauri's Gradle scaffold requires it
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

# Install the NDK + a recent SDK platform
sdkmanager 'ndk;28.0.12916984' 'platforms;android-34' 'build-tools;34.0.0'
export NDK_HOME=$ANDROID_HOME/ndk/28.0.12916984

# Rust Android targets — added automatically by init-android.sh too
rustup target add \
  aarch64-linux-android \
  armv7-linux-androideabi \
  i686-linux-android \
  x86_64-linux-android
```

## One-time runtime assets

The repo commits **text placeholders** for the two binary assets so `cargo
check` and desktop builds keep working. Before producing a real APK you have
to overwrite them with the actual binaries.

### Option A — let CI do it

Push a tag matching `v*` (or trigger the `Android APK` workflow manually) and
GitHub Actions will fetch the Alpine rootfs, cross-compile proot, and upload
the resulting APK as a build artifact.

### Option B — build them locally

```bash
# 1. Alpine 3.19 aarch64 minirootfs (~3 MiB compressed)
curl -fL \
  -o src-tauri/assets/android/alpine-rootfs.tar.gz \
  https://dl-cdn.alpinelinux.org/alpine/v3.19/releases/aarch64/alpine-minirootfs-3.19.1-aarch64.tar.gz

# 2. proot for aarch64-linux-android
TOOLCHAIN="$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin"
git clone --depth 1 https://github.com/proot-me/proot.git /tmp/proot
make -C /tmp/proot/src -j"$(nproc)" \
  CC="$TOOLCHAIN/aarch64-linux-android33-clang" \
  AR="$TOOLCHAIN/llvm-ar" \
  STRIP="$TOOLCHAIN/llvm-strip" \
  LOADER_NAMES="ld-musl-aarch64.so.1 ld-linux-aarch64.so.1" \
  proot
"$TOOLCHAIN/llvm-strip" /tmp/proot/src/proot
cp /tmp/proot/src/proot src-tauri/assets/android/proot-aarch64

# Sanity check
file src-tauri/assets/android/proot-aarch64       # expect: ARM aarch64 ELF
```

Confirm SHA-256s and never commit the real binaries — `src-tauri/.gitignore`
ignores `gen/android/` but lets the placeholder files stay tracked, so the
repo continues to build for desktop after you swap them in locally.

## Generating the Android project

```bash
./scripts/init-android.sh
```

This wraps `pnpm tauri android init` and copies our Kotlin plugin sources
into the generated `src-tauri/gen/android/app/src/main/java/app/crynta/terax/`
package. Re-run any time you edit a file under
`src-tauri/android-plugins/`.

## Build & install

```bash
# Live development on a connected device (USB debugging on)
pnpm tauri android dev

# Standalone debug APK
pnpm tauri android build --apk --debug

# Install it
adb install -r \
  src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

## How the runtime bootstrap works

1. `main.tsx` awaits `ensureAndroidBootstrapped()` before rendering React.
2. On Android, that hits the Rust `bootstrap_android` command.
3. `bootstrap_android` (in `src-tauri/src/bootstrap.rs`):
   - Copies `proot-aarch64` from APK resources to
     `/data/data/app.crynta.terax/files/proot` and chmod's it to `0755`.
   - Extracts `alpine-rootfs.tar.gz` to `…/files/rootfs/` via Android's
     bundled `tar` binary.
   - Writes `/etc/resolv.conf` + `/etc/profile.d/terax.sh` inside the rootfs.
4. Subsequent calls return `already_bootstrapped` and skip the work.

If the Rust path ever fails (e.g. on the rare device without `tar`), the
Kotlin `BootstrapPlugin.extractRootfs` is available as a fallback that uses
Java streams.

## Known gaps to verify on real hardware

- The `BaseDirectory::Resource` resolver on Android returns paths that
  `std::fs::copy` can read; this is the behavior in Tauri 2 stable but worth
  spot-checking on the first device run.
- xterm.js WebGL renderer occasionally trips on Android Chrome's GPU
  blocklist. If WebGL is denied the canvas renderer is auto-selected — verify
  the first paint is legible.
- Background processes started inside the proot chroot are killed when the
  PTY exits via `Session::drop` (sends SIGKILL to the proot PID). Long-running
  agent shell tasks should use the `shell::shell_bg_*` API, which spawns
  outside the interactive PTY.

## CI

`.github/workflows/android.yml` runs on every `v*` tag and on manual dispatch.
For signed release builds, set these repo secrets:

| Secret                          | What it is                                       |
| ------------------------------- | ------------------------------------------------ |
| `ANDROID_KEYSTORE_BASE64`       | Base64-encoded JKS keystore                      |
| `ANDROID_KEYSTORE_PASSWORD`     | Keystore password                                |
| `ANDROID_KEY_ALIAS`             | Alias inside the keystore                        |
| `ANDROID_KEY_PASSWORD`          | Per-key password                                 |

Trigger the workflow with `profile: release` to produce a signed APK.

Unsigned debug APKs build out of the box — no secrets required — and land in
the `terax-android-debug` artifact.
