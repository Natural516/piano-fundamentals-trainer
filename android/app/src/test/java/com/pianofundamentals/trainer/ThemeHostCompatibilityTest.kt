package com.pianofundamentals.trainer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.File
import java.nio.file.Files

/** Exercises the real native compatibility boundary, not a second SemVer implementation. */
class ThemeHostCompatibilityTest {
    private fun inspect(version: String, minimum: String, maximum: String): NativeThemeInspection {
        val root = Files.createTempDirectory("theme-host-compatibility").toFile()
        try {
            File(root, "manifest.json").writeText(
                """{"format":"piano-fundamentals-theme","packageFormatVersion":1,"themeApiVersion":1,"themeId":"natural516.bocchi","name":"Compatibility fixture","subtitle":"","themeType":"full","entry":"theme.json","checksums":"checksums.json","signature":null,"preview":{"cover":null,"gallery":[]},"version":"__VERSION__","minAppVersion":"__MIN__","maxAppVersionExclusive":"__MAX__"}"""
                    .replace("__VERSION__", version).replace("__MIN__", minimum).replace("__MAX__", maximum)
            )
            val theme = File(root, "theme.json").apply { writeText("""{"schemaVersion":1,"capabilities":{}}""") }
            File(root, "checksums.json").writeText(
                """{"algorithm":"SHA-256","files":{"theme.json":"__HASH__"}}"""
                    .replace("__HASH__", ThemePackageSecurityPolicy.sha256(theme))
            )
            val record = InstalledThemeRecord(
                "natural516.bocchi", version, "Compatibility fixture", "", "", "", "fixture",
                "", null, "UNSIGNED_DEBUG", 1, 1, BuildConfig.VERSION_NAME, minimum, maximum, emptyMap()
            )
            // Unsigned fixture isolates compatibility from signing. Production trust is unchanged
            // and remains covered by ThemeTrustStoreTest; no production package is produced here.
            val validator = NativeThemeArchiveValidator(
                ThemeTrustStore("debug", true, emptyMap()),
                object : ThemeImageInspector { override fun dimensions(file: File, extension: String) = 1 to 1 },
                BuildConfig.THEME_HOST_COMPAT_VERSION
            )
            return validator.verifyInstalledDirectory(root, record)
        } finally {
            root.deleteRecursively()
        }
    }

    @Test fun hostUsesTheActualAndroidVersion() {
        assertEquals("1.6.0", BuildConfig.VERSION_NAME)
        assertEquals(14, BuildConfig.VERSION_CODE)
        assertEquals(BuildConfig.VERSION_NAME, BuildConfig.THEME_HOST_COMPAT_VERSION)
    }

    @Test fun newBocchiMinimumIsAccepted() {
        assertEquals("1.1.0", inspect("1.1.0", "1.6.0", "2.0.0").manifest.version)
    }

    @Test fun higherMinimumIsRejected() {
        val failure = assertThrows(ThemePackageFailure::class.java) { inspect("1.1.0", "1.6.1", "2.0.0") }
        assertEquals("THEME_VERSION_INCOMPATIBLE", failure.errorCode)
    }

    @Test fun maximumRemainsExclusive() {
        val failure = assertThrows(ThemePackageFailure::class.java) { inspect("1.1.0", "1.5.3", "1.6.0") }
        assertEquals("THEME_VERSION_INCOMPATIBLE", failure.errorCode)
    }

    @Test fun oldBocchiMinimumRemainsAccepted() {
        assertEquals("1.0.0", inspect("1.0.0", "1.5.3", "2.0.0").manifest.version)
    }
}
