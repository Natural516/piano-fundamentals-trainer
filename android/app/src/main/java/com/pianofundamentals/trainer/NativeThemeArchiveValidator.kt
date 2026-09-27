package com.pianofundamentals.trainer

import android.graphics.BitmapFactory
import org.apache.commons.compress.archivers.zip.ZipArchiveEntry
import org.apache.commons.compress.archivers.zip.ZipFile
import java.io.File
import java.io.FileOutputStream
import java.text.Normalizer
import java.util.Locale

interface ThemeImageInspector {
    fun dimensions(file: File, extension: String): Pair<Int, Int>
}

class AndroidThemeImageInspector : ThemeImageInspector {
    override fun dimensions(file: File, extension: String): Pair<Int, Int> {
        val header = file.inputStream().use { input -> ByteArray(16).also { input.read(it) } }
        val validMagic = when (extension) {
            ".png" -> header.take(8).toByteArray().contentEquals(byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
            ".jpg", ".jpeg" -> header.size >= 2 && header[0] == 0xff.toByte() && header[1] == 0xd8.toByte()
            ".webp" -> header.size >= 12 && String(header, 0, 4, Charsets.US_ASCII) == "RIFF" && String(header, 8, 4, Charsets.US_ASCII) == "WEBP"
            else -> false
        }
        if (!validMagic) throw ThemePackageFailure("IMAGE_DECODE_FAILED", file.name)
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, options)
        if (options.outWidth <= 0 || options.outHeight <= 0) throw ThemePackageFailure("IMAGE_DECODE_FAILED", file.name)
        return options.outWidth to options.outHeight
    }
}

class NativeThemeArchiveValidator(
    private val trustStore: ThemeTrustStore,
    private val imageInspector: ThemeImageInspector,
    private val themeHostVersion: String,
    private val supportedThemeApi: Int = 1
) {
    data class ArchiveEntryInfo(val name: String, val size: Long, val compressedSize: Long)

    fun inspectAndExtract(packageFile: File, transactionId: String, extractedRoot: File): NativeThemeInspection {
        if (!packageFile.isFile || packageFile.length() !in 1..ThemePackageLimits.ARCHIVE_BYTES) throw ThemePackageFailure("PACKAGE_TOO_LARGE")
        if (extractedRoot.exists()) extractedRoot.deleteRecursively()
        if (!extractedRoot.mkdirs()) throw ThemePackageFailure("STORAGE_ERROR")
        val infos = mutableListOf<ArchiveEntryInfo>()
        try {
            ZipFile.builder().setFile(packageFile).get().use { zip ->
                val names = mutableSetOf<String>()
                val folded = mutableSetOf<String>()
                val enumeration = zip.entries
                while (enumeration.hasMoreElements()) {
                    val entry = enumeration.nextElement()
                    if (entry.isDirectory || entry.isUnixSymlink || !isRegularFile(entry)) throw ThemePackageFailure("FORBIDDEN_ENTRY", entry.name)
                    if (entry.diskNumberStart != 0L) throw ThemePackageFailure("MULTI_DISK_ARCHIVE", entry.name)
                    if (entry.generalPurposeBit.usesEncryption()) throw ThemePackageFailure("ENCRYPTED_ARCHIVE", entry.name)
                    val name = ThemePackageSecurityPolicy.normalizeRelativePath(entry.name)
                    if (name != Normalizer.normalize(entry.name, Normalizer.Form.NFC)) throw ThemePackageFailure("UNSAFE_PATH", entry.name)
                    if (!names.add(name)) throw ThemePackageFailure("DUPLICATE_ENTRY", name)
                    if (!folded.add(name.lowercase(Locale.ROOT))) throw ThemePackageFailure("CASE_COLLISION", name)
                    val extension = ThemePackageSecurityPolicy.extension(name)
                    if (extension !in ThemePackageSecurityPolicy.allowedExtensions) throw ThemePackageFailure("FORBIDDEN_ENTRY", name)
                    if (name.endsWith(".zip", true) || name.endsWith(".pftheme", true)) throw ThemePackageFailure("NESTED_ARCHIVE", name)
                    if (names.size > ThemePackageLimits.FILES) throw ThemePackageFailure("PACKAGE_LIMIT_EXCEEDED", "files")
                    val declared = entry.size
                    if (declared < 0 || declared > ThemePackageSecurityPolicy.fileLimit(name)) throw ThemePackageFailure("FILE_TOO_LARGE", name)
                    if (entry.compressedSize > 0 && declared.toDouble() / entry.compressedSize.toDouble() > ThemePackageLimits.ENTRY_COMPRESSION_RATIO) throw ThemePackageFailure("COMPRESSION_RATIO_EXCEEDED", name)
                    val output = ThemePackageSecurityPolicy.safeChild(extractedRoot, name)
                    output.parentFile?.mkdirs()
                    var actual = 0L
                    zip.getInputStream(entry).buffered().use { input ->
                        FileOutputStream(output).buffered().use { target ->
                            val buffer = ByteArray(64 * 1024)
                            while (true) {
                                val count = input.read(buffer)
                                if (count < 0) break
                                actual += count
                                if (actual > ThemePackageSecurityPolicy.fileLimit(name)) throw ThemePackageFailure("FILE_TOO_LARGE", name)
                                target.write(buffer, 0, count)
                            }
                        }
                    }
                    if (actual != declared) throw ThemePackageFailure("ENTRY_SIZE_MISMATCH", name)
                    infos += ArchiveEntryInfo(name, actual, entry.compressedSize.coerceAtLeast(0))
                    if (infos.sumOf { it.size } > ThemePackageLimits.UNPACKED_BYTES) throw ThemePackageFailure("PACKAGE_LIMIT_EXCEEDED", "unpacked")
                }
            }
            val compressedTotal = infos.sumOf { it.compressedSize }
            val unpackedTotal = infos.sumOf { it.size }
            if (compressedTotal > 0 && unpackedTotal.toDouble() / compressedTotal.toDouble() > ThemePackageLimits.ARCHIVE_COMPRESSION_RATIO) throw ThemePackageFailure("COMPRESSION_RATIO_EXCEEDED", "archive")
            return verifyDirectory(transactionId, packageFile, extractedRoot, infos.associate { it.name to it.size })
        } catch (failure: ThemePackageFailure) {
            extractedRoot.deleteRecursively()
            throw failure
        } catch (error: Exception) {
            extractedRoot.deleteRecursively()
            throw ThemePackageFailure("INVALID_THEME_PACKAGE", error.message ?: "archive")
        }
    }

    fun verifyInstalledDirectory(root: File, record: InstalledThemeRecord): NativeThemeInspection {
        val files = root.walkTopDown().filter { it.isFile && it.name != "INSTALL_COMPLETE.json" }.associate { it.relativeTo(root).invariantSeparatorsPath to it.length() }
        return verifyDirectory("installed", null, root, files, record.packageDigest)
    }

    @Suppress("UNCHECKED_CAST")
    private fun verifyDirectory(
        transactionId: String,
        packageFile: File?,
        root: File,
        entrySizes: Map<String, Long>,
        knownPackageDigest: String? = null
    ): NativeThemeInspection {
        val manifestFile = File(root, "manifest.json")
        val themeFile = File(root, "theme.json")
        val checksumsFile = File(root, "checksums.json")
        if (!manifestFile.isFile || !themeFile.isFile || !checksumsFile.isFile) throw ThemePackageFailure("THEME_FILE_MISSING")
        val manifestBytes = manifestFile.readBytes()
        val themeBytes = themeFile.readBytes()
        val checksumsBytes = checksumsFile.readBytes()
        val manifestMap = StrictThemeJson.objectValue(manifestBytes)
        val themeMap = StrictThemeJson.objectValue(themeBytes)
        val checksumsMap = StrictThemeJson.objectValue(checksumsBytes)
        val manifest = NativeThemeManifest.from(manifestMap)
        validateCompatibility(manifest)
        if (themeMap["schemaVersion"] == null || themeMap["capabilities"] !is Map<*, *>) throw ThemePackageFailure("INVALID_THEME_SCHEMA")
        val algorithm = checksumsMap["algorithm"] as? String
        val checksumFiles = checksumsMap["files"] as? Map<String, Any?>
        if (algorithm != "SHA-256" || checksumFiles == null) throw ThemePackageFailure("INVALID_CHECKSUMS")
        val expectedNames = entrySizes.keys.filter { it != "manifest.json" && it != "checksums.json" && it != "signature.ed25519" }.sorted()
        val checksumNames = checksumFiles.keys.sorted()
        if (expectedNames != checksumNames) throw ThemePackageFailure("CHECKSUM_FILE_SET_MISMATCH")
        for ((name, expectedValue) in checksumFiles) {
            val expected = expectedValue as? String ?: throw ThemePackageFailure("INVALID_CHECKSUMS", name)
            if (!Regex("^[0-9a-f]{64}$").matches(expected)) throw ThemePackageFailure("INVALID_CHECKSUMS", name)
            val file = ThemePackageSecurityPolicy.safeChild(root, name)
            if (!file.isFile) throw ThemePackageFailure("THEME_FILE_MISSING", name)
            if (ThemePackageSecurityPolicy.sha256(file) != expected) throw ThemePackageFailure("CHECKSUM_MISMATCH", name)
        }
        val signatureFile = File(root, "signature.ed25519")
        val signatureBytes = if (signatureFile.isFile) signatureFile.readBytes() else null
        val trust = trustStore.verify(manifest.signature, signatureBytes, ThemeJcs.signaturePayload(manifestMap, checksumsMap))
        var totalPixels = 0L
        for (name in checksumFiles.keys) {
            val extension = ThemePackageSecurityPolicy.extension(name)
            if (extension in ThemePackageSecurityPolicy.imageExtensions) {
                val file = ThemePackageSecurityPolicy.safeChild(root, name)
                val (width, height) = imageInspector.dimensions(file, extension)
                val pixels = width.toLong() * height.toLong()
                if (width > ThemePackageLimits.IMAGE_EDGE || height > ThemePackageLimits.IMAGE_EDGE || pixels > ThemePackageLimits.IMAGE_PIXELS) throw ThemePackageFailure("IMAGE_LIMIT_EXCEEDED", name)
                totalPixels += pixels
                if (totalPixels > ThemePackageLimits.TOTAL_IMAGE_PIXELS) throw ThemePackageFailure("IMAGE_LIMIT_EXCEEDED", "total")
            }
        }
        return NativeThemeInspection(
            transactionId, packageFile ?: File(root, "package.pftheme"), root, manifest, manifestMap, checksumsMap,
            themeBytes.toString(Charsets.UTF_8), ThemePackageSecurityPolicy.sha256(manifestBytes), ThemePackageSecurityPolicy.sha256(checksumsBytes),
            knownPackageDigest ?: packageFile?.let { ThemePackageSecurityPolicy.sha256(it) } ?: "installed", trust, entrySizes
        )
    }

    private fun validateCompatibility(manifest: NativeThemeManifest) {
        if (manifest.packageFormatVersion != 1) throw ThemePackageFailure("PACKAGE_FORMAT_UNSUPPORTED")
        if (manifest.themeApiVersion != supportedThemeApi) throw ThemePackageFailure("THEME_API_UNSUPPORTED")
        val app = ThemeSemver.parse(themeHostVersion)
        if (app < ThemeSemver.parse(manifest.minAppVersion) || app >= ThemeSemver.parse(manifest.maxAppVersionExclusive)) throw ThemePackageFailure("THEME_VERSION_INCOMPATIBLE")
    }

    private fun isRegularFile(entry: ZipArchiveEntry): Boolean {
        val mode = entry.unixMode
        if (mode == 0) return true
        val type = mode and 0xF000
        return type == 0x8000
    }
}
