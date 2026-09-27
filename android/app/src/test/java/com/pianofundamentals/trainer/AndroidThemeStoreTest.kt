package com.pianofundamentals.trainer

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.file.Files

class AndroidThemeStoreTest {
    private fun record(version: String, digest: String = "package-$version") = InstalledThemeRecord(
        "natural516.bocchi", version, "孤独摇滚", "乐队手账风格", "m", "c", digest, "2026-09-27T00:00:00Z",
        "dev", "DEVELOPER", 1, 1, "1.5.2", "1.5.3", "2.0.0", emptyMap()
    )

    @Test fun indexCanBeRebuiltAndRemoveDoesNotTouchOtherVersion() {
        val root = Files.createTempDirectory("theme-store").toFile()
        val store = AndroidThemeStore(root)
        for (version in listOf("1.0.0", "1.0.1")) {
            val dir = root.resolve("natural516.bocchi/$version").apply { mkdirs() }
            dir.resolve("INSTALL_COMPLETE.json").writeText(record(version).toJson().toString())
        }
        assertEquals(listOf("1.0.0", "1.0.1"), store.rewriteIndex().map { it.version })
        store.remove("natural516.bocchi", "1.0.0")
        assertFalse(root.resolve("natural516.bocchi/1.0.0").exists())
        assertTrue(root.resolve("natural516.bocchi/1.0.1").isDirectory)
        assertEquals(1, JSONObject(root.resolve("index.json").readText()).getJSONArray("themes").length())
    }

    @Test fun missingInstallCompleteFailsClosed() {
        val store = AndroidThemeStore(Files.createTempDirectory("theme-store-missing").toFile())
        assertEquals("THEME_NOT_INSTALLED", assertThrows(ThemePackageFailure::class.java) { store.get("natural516.bocchi", "1.0.0") }.errorCode)
    }
}
