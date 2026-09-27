package com.pianofundamentals.trainer

import com.google.crypto.tink.subtle.Ed25519Verify
import java.security.MessageDigest
import java.util.Base64

data class ThemeTrustResult(val keyId: String?, val trustLevel: String)

class ThemeTrustStore(
    private val channel: String,
    private val allowUnsigned: Boolean,
    private val trustedRawKeys: Map<String, ByteArray>
) {
    companion object {
        const val DEVELOPMENT_KEY_ID = "pft-theme-dev-2026-01"
        const val PRODUCTION_KEY_ID = "pft-theme-prod-2026-01"
        internal const val DEVELOPMENT_PUBLIC_KEY_RAW_BASE64 = "6KVnECCY+ckFme5tP8Bn6tCmtSm1nNQMaFLjvBSjgm8="
        internal const val PRODUCTION_PUBLIC_KEY_RAW_BASE64 = "LllxMUNefyKH0nIXtxo/FF+hHbRvgYEmX+NhwyI5rLM="

        fun forBuild(): ThemeTrustStore {
            val keys = when (BuildConfig.THEME_CHANNEL) {
                "debug", "qa" -> mapOf(DEVELOPMENT_KEY_ID to Base64.getDecoder().decode(DEVELOPMENT_PUBLIC_KEY_RAW_BASE64))
                "release" -> mapOf(PRODUCTION_KEY_ID to Base64.getDecoder().decode(PRODUCTION_PUBLIC_KEY_RAW_BASE64))
                else -> emptyMap()
            }
            return ThemeTrustStore(BuildConfig.THEME_CHANNEL, BuildConfig.ALLOW_UNSIGNED_THEME_PACKAGES, keys)
        }

        fun fingerprint(rawPublicKey: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(rawPublicKey).joinToString("") { "%02x".format(it) }
    }

    fun verify(signatureMetadata: Map<String, Any?>?, signature: ByteArray?, payload: ByteArray): ThemeTrustResult {
        if (signatureMetadata == null) {
            if (!allowUnsigned || channel != "debug") throw ThemePackageFailure("SIGNATURE_REQUIRED")
            if (signature != null) throw ThemePackageFailure("INVALID_SIGNATURE_METADATA")
            return ThemeTrustResult(null, "UNSIGNED_DEBUG")
        }
        val algorithm = signatureMetadata["algorithm"] as? String
        val keyId = signatureMetadata["keyId"] as? String ?: throw ThemePackageFailure("SIGNATURE_INVALID")
        val file = signatureMetadata["file"] as? String
        if (algorithm != "Ed25519" || file != "signature.ed25519" || signature == null || signature.size != 64) throw ThemePackageFailure("SIGNATURE_INVALID")
        val rawKey = trustedRawKeys[keyId] ?: throw ThemePackageFailure("SIGNER_NOT_TRUSTED", keyId)
        try {
            Ed25519Verify(rawKey).verify(signature, payload)
        } catch (_: Exception) {
            throw ThemePackageFailure("SIGNATURE_INVALID", keyId)
        }
        return ThemeTrustResult(keyId, if (channel == "release") "PRODUCTION" else "DEVELOPER")
    }

    fun installationAvailable(): Boolean = channel != "release" || trustedRawKeys.containsKey(PRODUCTION_KEY_ID)
}
