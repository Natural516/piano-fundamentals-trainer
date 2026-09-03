package com.pianofundamentals.trainer

import java.util.LinkedHashMap

internal object AndroidUpdaterSecurityPolicy {
    const val PACKAGE_ID = "com.pianofundamentals.trainer"
    const val PINNED_SIGNER_SHA256 = "19:3D:A3:16:AE:F6:A2:2F:9C:15:D1:01:9E:25:87:E7:25:85:8A:70:8B:D0:07:7A:D8:58:98:CD:65:57:96:32"
    const val MAX_APK_BYTES = 268_435_456L

    enum class SignerInspectionApi { LEGACY_SIGNATURES, SIGNING_INFO }

    fun signerInspectionApi(apiLevel: Int): SignerInspectionApi =
        if (apiLevel >= 28) SignerInspectionApi.SIGNING_INFO else SignerInspectionApi.LEGACY_SIGNATURES

    fun shouldQueryInstallCapability(apiLevel: Int): Boolean = apiLevel >= 26

    fun installCapability(apiLevel: Int, canRequestPackages: Boolean?): String {
        if (apiLevel < 24) return "UNSUPPORTED"
        if (apiLevel < 26) return "READY"
        return if (canRequestPackages == true) "READY" else "PERMISSION_REQUIRED"
    }

    fun exactCurrentSignerSet(actual: Set<String>): Boolean =
        actual == setOf(PINNED_SIGNER_SHA256)

    fun isInsideVerifiedScope(verifiedRootCanonical: String, artifactCanonical: String): Boolean {
        val root = verifiedRootCanonical.trimEnd('/', '\\') + "/"
        return artifactCanonical.replace('\\', '/').startsWith(root.replace('\\', '/'))
    }
}

internal data class VerifiedArtifactIdentity(
    val artifactId: String,
    val canonicalPath: String,
    val expectedSize: Long,
    val observedSize: Long,
    val sha256: String,
    val packageId: String,
    val versionCode: Long,
    val signerSet: Set<String>,
    val selectionId: String,
    val lastModified: Long,
    val readOnly: Boolean,
    val liveVerified: Boolean
)

internal class VerifiedArtifactTokenRegistry(
    private val tokenFactory: () -> String
) {
    private data class Entry(val token: String, val identity: VerifiedArtifactIdentity)

    private val entries = LinkedHashMap<String, Entry>()
    private var activeSelectionId: String? = null

    @Synchronized
    fun select(selectionId: String) {
        entries.clear()
        activeSelectionId = selectionId
    }

    @Synchronized
    fun issue(identity: VerifiedArtifactIdentity): String {
        require(identity.selectionId == activeSelectionId)
        require(identity.liveVerified && identity.readOnly)
        val token = tokenFactory()
        require(token.isNotBlank() && !entries.containsKey(token))
        entries[token] = Entry(token, identity)
        return token
    }

    @Synchronized
    fun validate(token: String, observed: VerifiedArtifactIdentity): Boolean {
        val entry = entries[token] ?: return false
        return entry.identity == observed &&
            observed.selectionId == activeSelectionId &&
            observed.liveVerified && observed.readOnly
    }

    @Synchronized
    fun identity(token: String): VerifiedArtifactIdentity? = entries[token]?.identity

    @Synchronized
    fun invalidate(token: String) {
        entries.remove(token)
    }

    @Synchronized
    fun invalidateAll() {
        entries.clear()
        activeSelectionId = null
    }

    @Synchronized
    fun size(): Int = entries.size
}
