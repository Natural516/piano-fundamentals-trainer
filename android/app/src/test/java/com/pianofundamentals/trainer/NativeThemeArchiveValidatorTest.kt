package com.pianofundamentals.trainer

import org.apache.commons.compress.archivers.zip.UnixStat
import org.apache.commons.compress.archivers.zip.ZipArchiveEntry
import org.apache.commons.compress.archivers.zip.ZipArchiveOutputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.File
import java.nio.file.Files

class NativeThemeArchiveValidatorTest {
    private val validator = NativeThemeArchiveValidator(ThemeTrustStore("debug", true, emptyMap()), object : ThemeImageInspector {
        override fun dimensions(file: File, extension: String) = 1 to 1
    }, "1.5.3")

    private fun archive(name: String, mode: Int? = null, bytes: ByteArray = "{}".toByteArray()): File {
        val file = Files.createTempFile("theme-malicious", ".pftheme").toFile()
        ZipArchiveOutputStream(file).use { output ->
            val entry = ZipArchiveEntry(name)
            if (mode != null) entry.unixMode = mode
            output.putArchiveEntry(entry); output.write(bytes); output.closeArchiveEntry()
        }
        return file
    }

    @Test fun traversalEntryIsRejectedBeforeExtraction() {
        val target = Files.createTempDirectory("theme-extract").resolve("payload").toFile()
        val failure = assertThrows(ThemePackageFailure::class.java) { validator.inspectAndExtract(archive("../escape.json"), "tx", target) }
        assertEquals("UNSAFE_PATH", failure.errorCode)
        assertFalse(target.exists())
    }

    @Test fun symlinkEntryIsRejectedBeforeExtraction() {
        val target = Files.createTempDirectory("theme-symlink").resolve("payload").toFile()
        val failure = assertThrows(ThemePackageFailure::class.java) { validator.inspectAndExtract(archive("assets/link.png", UnixStat.LINK_FLAG or 0x1ff), "tx", target) }
        assertEquals("FORBIDDEN_ENTRY", failure.errorCode)
        assertFalse(target.exists())
    }

    @Test fun forbiddenNestedArchiveIsRejected() {
        val target = Files.createTempDirectory("theme-nested").resolve("payload").toFile()
        val failure = assertThrows(ThemePackageFailure::class.java) { validator.inspectAndExtract(archive("assets/payload.zip"), "tx", target) }
        assertEquals("FORBIDDEN_ENTRY", failure.errorCode)
    }

    @Test fun syntheticZipBombRatioIsRejectedBeforeThemeParsing() {
        val target = Files.createTempDirectory("theme-ratio").resolve("payload").toFile()
        val failure = assertThrows(ThemePackageFailure::class.java) { validator.inspectAndExtract(archive("assets/compressed.png", bytes = ByteArray(3 * 1024 * 1024)), "tx", target) }
        assertEquals("COMPRESSION_RATIO_EXCEEDED", failure.errorCode)
        assertFalse(target.exists())
    }
}
