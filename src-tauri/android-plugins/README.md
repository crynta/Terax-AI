# Terax Android plugin sources

The Kotlin files in `app.crynta.terax/` are the Android-side companions to
the Rust commands in `src-tauri/src/`. They live here, in a repo-owned
directory, instead of being authored directly under `src-tauri/gen/android/`
because that folder is **regenerated** by `pnpm tauri android init` — any
hand-edited files there would be wiped.

## Layout

```
android-plugins/
└── app.crynta.terax/
    ├── BootstrapPlugin.kt   ← Optional pure-Kotlin rootfs extractor
    └── KeystorePlugin.kt    ← Optional hardware-backed AES-GCM key wrapper
```

## How they get into the APK

`scripts/init-android.sh` runs `pnpm tauri android init` (idempotent) and
then **copies these files** into the generated tree under
`src-tauri/gen/android/app/src/main/java/app/crynta/terax/`. It also patches
`MainActivity.kt` to register both plugins. Re-run the script any time you
edit a file here.

```bash
./scripts/init-android.sh
```

## Why neither is wired in by default

- **BootstrapPlugin** is a fallback. The primary bootstrap path is the Rust
  `bootstrap_android` command (uses Android's bundled `tar` for speed).
  The Kotlin path is only invoked if the Rust call fails — for example on
  the rare device whose userland is missing `tar`.
- **KeystorePlugin** is opt-in extra defense. The Rust `secrets` module
  already stores credentials in `/data/data/<pkg>/files/secrets.json` with
  mode 0600, which is private to the app on a non-rooted device. The
  Keystore wrapper exists for builds that want to additionally tie each
  secret to a hardware-backed AES-256-GCM key — handy for compliance
  scenarios but not necessary for the default UX.
