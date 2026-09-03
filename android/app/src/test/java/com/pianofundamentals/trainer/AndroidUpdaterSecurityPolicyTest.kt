package com.pianofundamentals.trainer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidUpdaterSecurityPolicyTest {
    private fun identity(
        selectionId: String = "4:first",
        path: String = "/data/user/0/app/cache/update/verified/update.apk",
        hash: String = "A".repeat(64),
        lastModified: Long = 100L
    ) = VerifiedArtifactIdentity(
        artifactId = "update.apk",
        canonicalPath = path,
        expectedSize = 4_000_000L,
        observedSize = 4_000_000L,
        sha256 = hash,
        packageId = AndroidUpdaterSecurityPolicy.PACKAGE_ID,
        versionCode = 5L,
        signerSet = setOf(AndroidUpdaterSecurityPolicy.PINNED_SIGNER_SHA256),
        selectionId = selectionId,
        lastModified = lastModified,
        readOnly = true,
        liveVerified = true
    )

    @Test
    fun up26Api26PermissionFalseRequiresPermission() {
        assertTrue(AndroidUpdaterSecurityPolicy.shouldQueryInstallCapability(26))
        assertEquals("PERMISSION_REQUIRED", AndroidUpdaterSecurityPolicy.installCapability(26, false))
    }

    @Test
    fun up27Api26PermissionTrueIsReady() {
        assertTrue(AndroidUpdaterSecurityPolicy.shouldQueryInstallCapability(36))
        assertEquals("READY", AndroidUpdaterSecurityPolicy.installCapability(36, true))
    }

    @Test
    fun up28Api24And25NeverQueryApi26Capability() {
        assertFalse(AndroidUpdaterSecurityPolicy.shouldQueryInstallCapability(24))
        assertFalse(AndroidUpdaterSecurityPolicy.shouldQueryInstallCapability(25))
        assertEquals("READY", AndroidUpdaterSecurityPolicy.installCapability(24, null))
        assertEquals("READY", AndroidUpdaterSecurityPolicy.installCapability(25, null))
    }

    @Test
    fun up29LegacyAndModernSignerPathsStillRequireExactCurrentSet() {
        assertEquals(
            AndroidUpdaterSecurityPolicy.SignerInspectionApi.LEGACY_SIGNATURES,
            AndroidUpdaterSecurityPolicy.signerInspectionApi(27)
        )
        assertEquals(
            AndroidUpdaterSecurityPolicy.SignerInspectionApi.SIGNING_INFO,
            AndroidUpdaterSecurityPolicy.signerInspectionApi(28)
        )
        assertTrue(AndroidUpdaterSecurityPolicy.exactCurrentSignerSet(setOf(AndroidUpdaterSecurityPolicy.PINNED_SIGNER_SHA256)))
        assertFalse(AndroidUpdaterSecurityPolicy.exactCurrentSignerSet(emptySet()))
        assertFalse(AndroidUpdaterSecurityPolicy.exactCurrentSignerSet(setOf("DEBUG")))
        assertFalse(AndroidUpdaterSecurityPolicy.exactCurrentSignerSet(setOf(AndroidUpdaterSecurityPolicy.PINNED_SIGNER_SHA256, "EXTRA")))
    }

    @Test
    fun up30TokenCannotAuthorizeArbitraryIdentity() {
        val registry = VerifiedArtifactTokenRegistry { "opaque-token" }
        registry.select("4:first")
        val token = registry.issue(identity())
        assertTrue(registry.validate(token, identity()))
        assertFalse(registry.validate(token, identity(path = "/sdcard/arbitrary.apk")))
        assertFalse(registry.validate("forged-token", identity()))
    }

    @Test
    fun up31ChangedArtifactAfterVerificationIsRejected() {
        val registry = VerifiedArtifactTokenRegistry { "opaque-token" }
        registry.select("4:first")
        val token = registry.issue(identity())
        assertFalse(registry.validate(token, identity(hash = "B".repeat(64))))
        assertFalse(registry.validate(token, identity(lastModified = 101L)))
    }

    @Test
    fun up32ProcessRestartInvalidatesToken() {
        val beforeRestart = VerifiedArtifactTokenRegistry { "opaque-token" }
        beforeRestart.select("4:first")
        val token = beforeRestart.issue(identity())
        val afterRestart = VerifiedArtifactTokenRegistry { "new-token" }
        assertFalse(afterRestart.validate(token, identity()))
    }

    @Test
    fun up33NewSelectionInvalidatesPreviousToken() {
        val registry = VerifiedArtifactTokenRegistry { "opaque-token" }
        registry.select("4:first")
        val token = registry.issue(identity())
        registry.select("5:second")
        assertEquals(0, registry.size())
        assertFalse(registry.validate(token, identity()))
    }

    @Test
    fun up34OnlyNarrowVerifiedScopeIsAccepted() {
        val root = "/data/user/0/app/cache/update/verified"
        assertTrue(AndroidUpdaterSecurityPolicy.isInsideVerifiedScope(root, "$root/update.apk"))
        assertFalse(AndroidUpdaterSecurityPolicy.isInsideVerifiedScope(root, "/data/user/0/app/cache/other.apk"))
        assertFalse(AndroidUpdaterSecurityPolicy.isInsideVerifiedScope(root, "/sdcard/update.apk"))
    }
}
