package com.pianofundamentals.trainer

import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.util.Locale

internal class ManifestTransportFailure(val errorCode: String) : Exception(errorCode)

internal object AndroidManifestTransportPolicy {
    const val MAX_MANIFEST_BYTES = 65_536
    const val MAX_REDIRECTS = 5

    fun validatedHttpsUrl(url: URL): URL {
        if (url.protocol.lowercase(Locale.ROOT) != "https" ||
            url.host.isBlank() || url.userInfo != null || url.ref != null) {
            throw ManifestTransportFailure("MANIFEST_NETWORK_ERROR")
        }
        return url
    }

    fun redirectedHttpsUrl(current: URL, location: String): URL {
        if (location.isBlank()) throw ManifestTransportFailure("MANIFEST_NETWORK_ERROR")
        return validatedHttpsUrl(URL(current, location))
    }

    fun isRedirect(status: Int): Boolean = status in listOf(
        HttpURLConnection.HTTP_MOVED_PERM,
        HttpURLConnection.HTTP_MOVED_TEMP,
        HttpURLConnection.HTTP_SEE_OTHER,
        307,
        308
    )
}

internal class BoundedManifestUtf8Buffer(
    private val maximumBytes: Int = AndroidManifestTransportPolicy.MAX_MANIFEST_BYTES
) {
    private val output = ByteArrayOutputStream()
    var size: Int = 0
        private set

    fun append(bytes: ByteArray, offset: Int = 0, length: Int = bytes.size) {
        if (offset < 0 || length < 0 || offset + length > bytes.size || size > maximumBytes - length) {
            throw ManifestTransportFailure("MANIFEST_INVALID")
        }
        output.write(bytes, offset, length)
        size += length
    }

    fun decodeUtf8(): String {
        val decoder = StandardCharsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
        return try {
            decoder.decode(ByteBuffer.wrap(output.toByteArray())).toString()
        } catch (_: Exception) {
            throw ManifestTransportFailure("MANIFEST_INVALID")
        }
    }
}
