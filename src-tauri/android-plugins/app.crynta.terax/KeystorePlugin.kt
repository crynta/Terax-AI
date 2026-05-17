package app.crynta.terax

import android.app.Activity
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * KeystorePlugin: optional hardware-backed key storage for Android.
 *
 * The Rust `secrets` module already falls back to a 0600 JSON file in
 * `/data/data/app.crynta.terax/files/` on Android — which is private to the
 * app and unreadable by other apps on non-rooted devices. This Kotlin plugin
 * exists for builds that want to *additionally* wrap each secret with a
 * Keystore-backed AES-256-GCM key (often hardware-backed on modern devices),
 * so a forensic dump of the data dir still leaves the ciphertext encrypted.
 *
 * It is **not** wired into the Rust secrets module yet — callers who want
 * Keystore-backed storage invoke this plugin directly via `invokeMobilePlugin`
 * from the WebView. The Rust file-store remains the default.
 */
@InvokeArg
class KeyArgs {
    lateinit var service: String
    lateinit var account: String
    var secret: String? = null
}

@TauriPlugin
class KeystorePlugin(private val activity: Activity) : Plugin(activity) {

    companion object {
        private const val PROVIDER = "AndroidKeyStore"
        private const val CIPHER_ALGO = "AES/GCM/NoPadding"
        private const val KEY_SIZE = 256
        private const val GCM_TAG_LENGTH = 128
    }

    // One AES key per (service, account) pair — bound to this app, this user,
    // and (on supported hardware) the TEE.
    private fun keystoreAlias(service: String, account: String) =
        "terax:$service:$account"

    // Encrypted blob lives in the app's private files dir under a hashed name.
    // We Base64-url-encode the composite key so the filename can't contain
    // path separators.
    private fun storageFile(service: String, account: String): File {
        val dir = File(activity.filesDir, "keystore_secrets").also { it.mkdirs() }
        val name = Base64.encodeToString(
            "$service:$account".toByteArray(Charsets.UTF_8),
            Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
        )
        return File(dir, name)
    }

    private fun getOrCreateKey(alias: String): SecretKey {
        val ks = KeyStore.getInstance(PROVIDER).also { it.load(null) }
        if (ks.containsAlias(alias)) {
            return (ks.getEntry(alias, null) as KeyStore.SecretKeyEntry).secretKey
        }
        val keyGen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER)
        keyGen.init(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(KEY_SIZE)
                // false = no biometric prompt per call. Flip to true if/when
                // we expose a BiometricPrompt-gated mode.
                .setUserAuthenticationRequired(false)
                .build()
        )
        return keyGen.generateKey()
    }

    @Command
    fun get(invoke: Invoke) {
        val args = invoke.parseArgs(KeyArgs::class.java)
        try {
            val file = storageFile(args.service, args.account)
            val out = JSObject()
            if (!file.exists()) {
                out.put("value", org.json.JSONObject.NULL)
                invoke.resolve(out)
                return
            }
            val blob = file.readBytes()
            if (blob.size < 13) {
                invoke.reject("ciphertext too short")
                return
            }
            // First 12 bytes = IV, remainder = ciphertext + GCM tag
            val iv = blob.copyOfRange(0, 12)
            val ciphertext = blob.copyOfRange(12, blob.size)
            val key = getOrCreateKey(keystoreAlias(args.service, args.account))
            val cipher = Cipher.getInstance(CIPHER_ALGO)
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_LENGTH, iv))
            val plain = String(cipher.doFinal(ciphertext), Charsets.UTF_8)
            out.put("value", plain)
            invoke.resolve(out)
        } catch (e: Exception) {
            invoke.reject(e.message ?: "get failed")
        }
    }

    @Command
    fun set(invoke: Invoke) {
        val args = invoke.parseArgs(KeyArgs::class.java)
        val secret = args.secret ?: return invoke.reject("secret is required")
        try {
            val key = getOrCreateKey(keystoreAlias(args.service, args.account))
            val cipher = Cipher.getInstance(CIPHER_ALGO)
            cipher.init(Cipher.ENCRYPT_MODE, key)
            val iv = cipher.iv
            val ciphertext = cipher.doFinal(secret.toByteArray(Charsets.UTF_8))
            storageFile(args.service, args.account).writeBytes(iv + ciphertext)
            val out = JSObject()
            out.put("ok", true)
            invoke.resolve(out)
        } catch (e: Exception) {
            invoke.reject(e.message ?: "set failed")
        }
    }

    @Command
    fun delete(invoke: Invoke) {
        val args = invoke.parseArgs(KeyArgs::class.java)
        try {
            val file = storageFile(args.service, args.account)
            if (file.exists()) file.delete()
            val ks = KeyStore.getInstance(PROVIDER).also { it.load(null) }
            val alias = keystoreAlias(args.service, args.account)
            if (ks.containsAlias(alias)) ks.deleteEntry(alias)
            val out = JSObject()
            out.put("ok", true)
            invoke.resolve(out)
        } catch (e: Exception) {
            invoke.reject(e.message ?: "delete failed")
        }
    }
}
