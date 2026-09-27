package com.pianofundamentals.trainer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.math.BigDecimal

class ThemePackageSecurityPolicyTest {
    @Test fun rejectsTraversalAbsoluteWindowsUncBackslashNulAndEmptySegments() {
        listOf("../a.png", "./a.png", "/a.png", "C:/a.png", "//server/a.png", "a\\b.png", "a\u0000.png", "a//b.png")
            .forEach { path -> assertEquals("UNSAFE_PATH", assertThrows(ThemePackageFailure::class.java) { ThemePackageSecurityPolicy.normalizeRelativePath(path) }.errorCode) }
    }

    @Test fun jcsVectorsAreDeterministicAcrossOrderWhitespaceUnicodeIntegerAndEscapes() {
        val first = StrictThemeJson.objectValue("{\n \"z\":1,\"a\":\"\u97f3\u4e50\",\"escaped\":\"line\\nquote\\\"\"}".toByteArray())
        val second = linkedMapOf<String, Any?>("escaped" to "line\nquote\"", "a" to "音乐", "z" to BigDecimal("1.000"))
        val expected = "{\"a\":\"音乐\",\"escaped\":\"line\\nquote\\\"\",\"z\":1}"
        assertEquals(expected, ThemeJcs.canonicalize(first))
        assertEquals(expected, ThemeJcs.canonicalize(second))
    }

    @Test fun strictJsonRejectsDuplicateKeysAndMalformedUtf8() {
        assertEquals("INVALID_JSON", assertThrows(ThemePackageFailure::class.java) { StrictThemeJson.parse("{\"a\":1,\"a\":2}".toByteArray()) }.errorCode)
        assertEquals("INVALID_JSON", assertThrows(ThemePackageFailure::class.java) { StrictThemeJson.parse(byteArrayOf(0xc3.toByte(), 0x28)) }.errorCode)
    }
}
