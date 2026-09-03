package com.pianofundamentals.trainer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.net.URL

class AndroidManifestTransportPolicyTest {
    @Test
    fun net02BoundedUtf8IsReturnedWithoutSchemaInterpretation() {
        val raw = "{\"schemaVersion\":1,\"opaque\":\"钢琴\"}"
        val buffer = BoundedManifestUtf8Buffer()
        val bytes = raw.toByteArray(Charsets.UTF_8)
        buffer.append(bytes, 0, 7)
        buffer.append(bytes, 7, bytes.size - 7)
        assertEquals(bytes.size, buffer.size)
        assertEquals(raw, buffer.decodeUtf8())
    }

    @Test
    fun net03HttpsCrossHostRedirectIsSupported() {
        val current = URL("https://github.com/release/latest.json")
        val redirected = AndroidManifestTransportPolicy.redirectedHttpsUrl(
            current,
            "https://objects.githubusercontent.com/assets/latest.json"
        )
        assertEquals("https", redirected.protocol)
        assertEquals("objects.githubusercontent.com", redirected.host)
    }

    @Test
    fun net04HttpsToHttpRedirectIsRejected() {
        assertThrows(ManifestTransportFailure::class.java) {
            AndroidManifestTransportPolicy.redirectedHttpsUrl(
                URL("https://github.com/release/latest.json"),
                "http://objects.githubusercontent.com/assets/latest.json"
            )
        }
    }

    @Test
    fun net05OversizedResponseFailsBeforeAppendingBeyondBound() {
        val buffer = BoundedManifestUtf8Buffer(8)
        buffer.append(ByteArray(8))
        assertThrows(ManifestTransportFailure::class.java) {
            buffer.append(byteArrayOf(1))
        }
        assertEquals(8, buffer.size)
    }
}
