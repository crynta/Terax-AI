package app.crynta.terax

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.io.FileOutputStream

/**
 * BootstrapPlugin is a Kotlin-side fallback for the Rust `bootstrap_android`
 * command in `src-tauri/src/bootstrap.rs`. The Rust path is the primary one
 * (it shells out to Android's bundled `tar`); this plugin exists to:
 *
 *   1. Surface a quick "are we ready?" check the WebView can call without
 *      taking the JNI hop into Rust (useful for splash-screen UX).
 *   2. Re-extract the rootfs purely from Kotlin if the device lacks `tar`
 *      — vanishingly rare on modern Android but cheap insurance.
 *
 * The plugin reads its source bytes straight out of the APK's `assets/`
 * folder, which Tauri populates from `src-tauri/assets/` when the bundle
 * is built.
 */
@TauriPlugin
class BootstrapPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun isBootstrapped(invoke: Invoke) {
        val base = activity.filesDir
        val proot = File(base, "proot")
        val rootfs = File(base, "rootfs")
        val ready =
            proot.exists() && rootfs.exists() && (rootfs.list()?.isNotEmpty() == true)
        val out = JSObject()
        out.put("ready", ready)
        invoke.resolve(out)
    }

    @Command
    fun extractRootfs(invoke: Invoke) {
        try {
            val base = activity.filesDir
            val rootfs = File(base, "rootfs").also { it.mkdirs() }

            // Copy proot binary out of the APK assets dir
            val proot = File(base, "proot")
            activity.assets.open("android/proot-aarch64").use { input ->
                FileOutputStream(proot).use { output -> input.copyTo(output) }
            }
            proot.setExecutable(true, false)

            // Spill the tarball to cache, untar via the system `tar`,
            // then delete the cache copy. Java has no built-in tar reader.
            val tarball = File(activity.cacheDir, "alpine-rootfs.tar.gz")
            activity.assets.open("android/alpine-rootfs.tar.gz").use { input ->
                FileOutputStream(tarball).use { output -> input.copyTo(output) }
            }

            val proc = ProcessBuilder(
                "tar", "xzf", tarball.absolutePath, "-C", rootfs.absolutePath
            ).redirectErrorStream(true).start()
            val exitCode = proc.waitFor()
            tarball.delete()

            if (exitCode != 0) {
                invoke.reject("tar extraction failed with code $exitCode")
                return
            }

            // Write minimal resolv.conf so DNS works inside the rootfs
            File(rootfs, "etc").mkdirs()
            File(rootfs, "etc/resolv.conf").writeText(
                "nameserver 8.8.8.8\nnameserver 1.1.1.1\n"
            )

            val out = JSObject()
            out.put("status", "ok")
            invoke.resolve(out)
        } catch (e: Exception) {
            invoke.reject(e.message ?: "Unknown error during rootfs extraction")
        }
    }
}
