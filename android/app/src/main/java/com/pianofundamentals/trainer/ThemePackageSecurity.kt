package com.pianofundamentals.trainer

import com.fasterxml.jackson.core.JsonFactory
import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.core.JsonToken
import com.fasterxml.jackson.core.StreamReadFeature
import com.fasterxml.jackson.core.io.JsonStringEncoder
import java.io.File
import java.math.BigDecimal
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.text.Normalizer
import java.util.Locale

class ThemePackageFailure(val errorCode: String, detail: String = errorCode) : Exception("$errorCode: $detail")

object ThemePackageLimits {
    const val ARCHIVE_BYTES = 64L * 1024 * 1024
    const val UNPACKED_BYTES = 96L * 1024 * 1024
    const val FILES = 128
    const val ORDINARY_FILE_BYTES = 12L * 1024 * 1024
    const val PREVIEW_BYTES = 4L * 1024 * 1024
    const val MANIFEST_BYTES = 64L * 1024
    const val THEME_BYTES = 256L * 1024
    const val CHECKSUMS_BYTES = 256L * 1024
    const val IMAGE_EDGE = 4096
    const val IMAGE_PIXELS = 16L * 1000 * 1000
    const val TOTAL_IMAGE_PIXELS = 60L * 1000 * 1000
    const val ENTRY_COMPRESSION_RATIO = 100.0
    const val ARCHIVE_COMPRESSION_RATIO = 20.0
}

object ThemePackageSecurityPolicy {
    val allowedExtensions = setOf(".json", ".png", ".jpg", ".jpeg", ".webp", ".ed25519")
    val imageExtensions = setOf(".png", ".jpg", ".jpeg", ".webp")

    fun normalizeRelativePath(input: String): String {
        if (input.isEmpty() || input.indexOf('\u0000') >= 0 || input.contains('\\')) throw ThemePackageFailure("UNSAFE_PATH", input)
        val normalized = Normalizer.normalize(input, Normalizer.Form.NFC)
        if (normalized.startsWith('/') || normalized.startsWith("//") || Regex("^[A-Za-z]:").containsMatchIn(normalized)) throw ThemePackageFailure("UNSAFE_PATH", input)
        if (Regex("^[A-Za-z][A-Za-z0-9+.-]*:").containsMatchIn(normalized)) throw ThemePackageFailure("UNSAFE_PATH", input)
        val parts = normalized.split('/')
        if (parts.any { it.isEmpty() || it == "." || it == ".." }) throw ThemePackageFailure("UNSAFE_PATH", input)
        return parts.joinToString("/")
    }

    fun extension(path: String): String {
        val name = path.substringAfterLast('/')
        val dot = name.lastIndexOf('.')
        return if (dot < 0) "" else name.substring(dot).lowercase(Locale.ROOT)
    }

    fun fileLimit(path: String): Long = when {
        path == "manifest.json" -> ThemePackageLimits.MANIFEST_BYTES
        path == "theme.json" -> ThemePackageLimits.THEME_BYTES
        path == "checksums.json" -> ThemePackageLimits.CHECKSUMS_BYTES
        path.startsWith("preview/") || path.startsWith("previews/") -> ThemePackageLimits.PREVIEW_BYTES
        else -> ThemePackageLimits.ORDINARY_FILE_BYTES
    }

    fun safeChild(root: File, relativePath: String): File {
        val normalized = normalizeRelativePath(relativePath)
        val rootPath = root.canonicalFile.toPath()
        val target = File(root, normalized).canonicalFile
        if (!target.toPath().startsWith(rootPath)) throw ThemePackageFailure("UNSAFE_PATH", relativePath)
        return target
    }

    fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered().use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}

object StrictThemeJson {
    private val factory = JsonFactory.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build()

    fun parse(bytes: ByteArray): Any? {
        val decoder = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
        val text = try { decoder.decode(ByteBuffer.wrap(bytes)).toString() } catch (_: Exception) { throw ThemePackageFailure("INVALID_JSON", "UTF-8") }
        try {
            factory.createParser(text).use { parser ->
                val first = parser.nextToken() ?: throw ThemePackageFailure("INVALID_JSON", "empty")
                val result = read(parser, first)
                if (parser.nextToken() != null) throw ThemePackageFailure("INVALID_JSON", "trailing data")
                return result
            }
        } catch (failure: ThemePackageFailure) {
            throw failure
        } catch (error: Exception) {
            throw ThemePackageFailure("INVALID_JSON", error.message ?: "parse")
        }
    }

    @Suppress("UNCHECKED_CAST")
    fun objectValue(bytes: ByteArray): Map<String, Any?> = parse(bytes) as? Map<String, Any?> ?: throw ThemePackageFailure("INVALID_JSON", "root must be object")

    private fun read(parser: JsonParser, token: JsonToken): Any? = when (token) {
        JsonToken.START_OBJECT -> linkedMapOf<String, Any?>().also { result ->
            while (parser.nextToken() != JsonToken.END_OBJECT) {
                if (parser.currentToken() != JsonToken.FIELD_NAME) throw ThemePackageFailure("INVALID_JSON", "field")
                val key = parser.currentName
                val valueToken = parser.nextToken() ?: throw ThemePackageFailure("INVALID_JSON", "value")
                result[key] = read(parser, valueToken)
            }
        }
        JsonToken.START_ARRAY -> mutableListOf<Any?>().also { result ->
            while (true) {
                val next = parser.nextToken()
                if (next == JsonToken.END_ARRAY) break
                if (next == null) throw ThemePackageFailure("INVALID_JSON", "array")
                result += read(parser, next)
            }
        }
        JsonToken.VALUE_STRING -> parser.text
        JsonToken.VALUE_NUMBER_INT, JsonToken.VALUE_NUMBER_FLOAT -> parser.decimalValue
        JsonToken.VALUE_TRUE -> true
        JsonToken.VALUE_FALSE -> false
        JsonToken.VALUE_NULL -> null
        else -> throw ThemePackageFailure("INVALID_JSON", token.name)
    }
}

object ThemeJcs {
    private const val PREFIX = "PFTHEME-SIGNATURE-V1\n"
    private val encoder = JsonStringEncoder.getInstance()

    fun canonicalize(value: Any?): String = when (value) {
        null -> "null"
        is Boolean -> if (value) "true" else "false"
        is String -> quote(value)
        is BigDecimal -> canonicalNumber(value)
        is Byte, is Short, is Int, is Long -> value.toString()
        is List<*> -> value.joinToString(separator = ",", prefix = "[", postfix = "]") { canonicalize(it) }
        is Map<*, *> -> value.entries.map { (key, child) ->
            val stringKey = key as? String ?: throw ThemePackageFailure("JCS_INVALID", "non-string key")
            stringKey to child
        }.sortedBy { it.first }.joinToString(separator = ",", prefix = "{", postfix = "}") { (key, child) -> "${quote(key)}:${canonicalize(child)}" }
        else -> throw ThemePackageFailure("JCS_INVALID", value::class.java.name)
    }

    fun signaturePayload(manifest: Map<String, Any?>, checksums: Map<String, Any?>): ByteArray =
        "$PREFIX${canonicalize(manifest)}\n${canonicalize(checksums)}".toByteArray(StandardCharsets.UTF_8)

    private fun quote(value: String): String = "\"${String(encoder.quoteAsString(value))}\""
    private fun canonicalNumber(value: BigDecimal): String {
        if (value.compareTo(BigDecimal.ZERO) == 0) return "0"
        return value.stripTrailingZeros().toPlainString()
    }
}

object ThemeSemver {
    private val pattern = Regex("^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z.-]+))?(?:\\+[0-9A-Za-z.-]+)?$")
    data class Value(val major: Int, val minor: Int, val patch: Int, val prerelease: String?) : Comparable<Value> {
        override fun compareTo(other: Value): Int {
            listOf(major.compareTo(other.major), minor.compareTo(other.minor), patch.compareTo(other.patch)).firstOrNull { it != 0 }?.let { return it }
            if (prerelease == null && other.prerelease != null) return 1
            if (prerelease != null && other.prerelease == null) return -1
            return (prerelease ?: "").compareTo(other.prerelease ?: "")
        }
    }
    fun parse(input: String): Value {
        val match = pattern.matchEntire(input) ?: throw ThemePackageFailure("INVALID_VERSION", input)
        return Value(match.groupValues[1].toInt(), match.groupValues[2].toInt(), match.groupValues[3].toInt(), match.groupValues[4].ifEmpty { null })
    }
}
