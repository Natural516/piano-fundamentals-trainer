package com.pianofundamentals.trainer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.util.Base64

class ThemeTrustStoreTest {
    private fun hex(value: String) = value.chunked(2).map { it.toInt(16).toByte() }.toByteArray()

    @Test fun tinkVerifiesRfc8032Ed25519Vector() {
        val publicKey = hex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")
        val signature = hex("e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155" +
            "5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b")
        val store = ThemeTrustStore("qa", false, mapOf("test" to publicKey))
        assertEquals("DEVELOPER", store.verify(mapOf("algorithm" to "Ed25519", "keyId" to "test", "file" to "signature.ed25519"), signature, byteArrayOf()).trustLevel)
        signature[0] = (signature[0].toInt() xor 1).toByte()
        assertEquals("SIGNATURE_INVALID", assertThrows(ThemePackageFailure::class.java) { store.verify(mapOf("algorithm" to "Ed25519", "keyId" to "test", "file" to "signature.ed25519"), signature, byteArrayOf()) }.errorCode)
    }

    @Test fun qaRejectsUnsignedAndUnknownKeysWhileDebugGateIsExplicit() {
        val qa = ThemeTrustStore("qa", false, emptyMap())
        val release = ThemeTrustStore("release", false, emptyMap())
        assertEquals("SIGNATURE_REQUIRED", assertThrows(ThemePackageFailure::class.java) { qa.verify(null, null, byteArrayOf()) }.errorCode)
        assertEquals("SIGNATURE_REQUIRED", assertThrows(ThemePackageFailure::class.java) { release.verify(null, null, byteArrayOf()) }.errorCode)
        assertEquals("UNSIGNED_DEBUG", ThemeTrustStore("debug", true, emptyMap()).verify(null, null, byteArrayOf()).trustLevel)
        val unknown = mapOf<String, Any?>("algorithm" to "Ed25519", "keyId" to "unknown", "file" to "signature.ed25519")
        assertEquals("SIGNER_NOT_TRUSTED", assertThrows(ThemePackageFailure::class.java) { qa.verify(unknown, ByteArray(64), byteArrayOf()) }.errorCode)
        assertEquals("SIGNER_NOT_TRUSTED", assertThrows(ThemePackageFailure::class.java) { release.verify(unknown, ByteArray(64), byteArrayOf()) }.errorCode)
    }

    @Test fun qaAndReleaseTrustStoresAreMutuallyExclusive() {
        val publicKey = hex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")
        val signature = hex("e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155" +
            "5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b")
        val qa = ThemeTrustStore("qa", false, mapOf(ThemeTrustStore.DEVELOPMENT_KEY_ID to publicKey))
        val release = ThemeTrustStore("release", false, mapOf(ThemeTrustStore.PRODUCTION_KEY_ID to publicKey))
        val developerMetadata = mapOf<String, Any?>("algorithm" to "Ed25519", "keyId" to ThemeTrustStore.DEVELOPMENT_KEY_ID, "file" to "signature.ed25519")
        val productionMetadata = mapOf<String, Any?>("algorithm" to "Ed25519", "keyId" to ThemeTrustStore.PRODUCTION_KEY_ID, "file" to "signature.ed25519")

        assertEquals("DEVELOPER", qa.verify(developerMetadata, signature, byteArrayOf()).trustLevel)
        assertEquals("SIGNER_NOT_TRUSTED", assertThrows(ThemePackageFailure::class.java) { release.verify(developerMetadata, signature, byteArrayOf()) }.errorCode)
        assertEquals("SIGNER_NOT_TRUSTED", assertThrows(ThemePackageFailure::class.java) { qa.verify(productionMetadata, signature, byteArrayOf()) }.errorCode)
        assertEquals("PRODUCTION", release.verify(productionMetadata, signature, byteArrayOf()).trustLevel)
    }

    @Test fun embeddedProductionKeyFingerprintIsFrozen() {
        val raw = Base64.getDecoder().decode(ThemeTrustStore.PRODUCTION_PUBLIC_KEY_RAW_BASE64)
        assertEquals("c5726c60348d670692e9f3f2548bb793e7c07b09dcf0f0e4ca3584a0d4e42ba8", ThemeTrustStore.fingerprint(raw))
        assertEquals(32, Base64.getDecoder().decode(ThemeTrustStore.DEVELOPMENT_PUBLIC_KEY_RAW_BASE64).size)
    }
}
