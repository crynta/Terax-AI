# Android runtime assets

These files are bundled into the APK and extracted to
`/data/data/app.crynta.terax/files/` on first launch
by `src-tauri/src/bootstrap.rs` (the `bootstrap_android` Tauri command).

## Required files

### `proot-aarch64`

A `proot` binary cross-compiled for `aarch64-linux-android` (Android arm64).
Used to chroot into the bundled Alpine rootfs without needing root on the
device.

To build:

```bash
export NDK="$ANDROID_HOME/ndk/28.0.12916984"   # adjust to your NDK version
export TOOLCHAIN="$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin"

git clone https://github.com/proot-me/proot.git
cd proot/src
make \
  CC=$TOOLCHAIN/aarch64-linux-android33-clang \
  AR=$TOOLCHAIN/llvm-ar \
  STRIP=$TOOLCHAIN/llvm-strip \
  LOADER_NAMES="ld-musl-aarch64.so.1 ld-linux-aarch64.so.1" \
  proot
$TOOLCHAIN/llvm-strip proot
cp proot ../../src-tauri/assets/android/proot-aarch64
```

Verify with `file proot-aarch64` — it should report
`ELF 64-bit LSB executable, ARM aarch64`.

### `alpine-rootfs.tar.gz`

A minimal Alpine Linux rootfs for `aarch64`. This is what the proot chroot
points at; it gives the in-app terminal a Busybox shell plus `apk` so the
user can install additional packages at runtime.

To fetch (Alpine 3.19, ~3 MiB compressed):

```bash
curl -fL -o src-tauri/assets/android/alpine-rootfs.tar.gz \
  https://dl-cdn.alpinelinux.org/alpine/v3.19/releases/aarch64/alpine-minirootfs-3.19.1-aarch64.tar.gz
```

Always verify the SHA-256 against the Alpine download page before committing.

## Placeholders

The `proot-aarch64.placeholder` and `alpine-rootfs.tar.gz.placeholder` files
in this directory exist only to keep the resource paths resolvable for
`cargo check` and desktop builds. **They must be replaced with real artifacts
before producing a shippable Android APK** — the bootstrap step will refuse
to run with a zero-byte proot binary.

These placeholder files (and any real binary artifacts) are kept out of git
via `.gitignore`. CI builds (see `.github/workflows/android.yml`) download
the real artifacts before the APK is bundled.
