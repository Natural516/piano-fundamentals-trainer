package com.pianofundamentals.trainer

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.time.Instant

class AndroidThemeStore(private val themesRoot: File) {
    private val indexFile = File(themesRoot, "index.json")
    val stagingRoot = File(themesRoot, ".staging")

    init {
        themesRoot.mkdirs()
        stagingRoot.mkdirs()
    }

    fun cleanupStaging(exceptTransactionId: String? = null) {
        stagingRoot.listFiles()?.forEach { if (it.name != exceptTransactionId) it.deleteRecursively() }
    }

    fun install(inspection: NativeThemeInspection, appVersion: String): InstalledThemeRecord {
        val existingVersions = listInstalled().filter { it.themeId == inspection.manifest.themeId }
        val exact = existingVersions.firstOrNull { it.version == inspection.manifest.version }
        if (exact != null) {
            if (exact.packageDigest == inspection.packageDigest) throw ThemePackageFailure("ALREADY_INSTALLED")
            throw ThemePackageFailure("SAME_VERSION_DIFFERENT_PACKAGE")
        }
        val newest = existingVersions.maxByOrNull { ThemeSemver.parse(it.version) }
        if (newest != null && ThemeSemver.parse(inspection.manifest.version) < ThemeSemver.parse(newest.version)) throw ThemePackageFailure("DOWNGRADE_BLOCKED")
        val themeRoot = File(themesRoot, inspection.manifest.themeId)
        val destination = File(themeRoot, inspection.manifest.version)
        if (destination.exists()) throw ThemePackageFailure("SAME_VERSION_DIFFERENT_PACKAGE")
        val installedAt = Instant.now().toString()
        val record = InstalledThemeRecord(
            inspection.manifest.themeId, inspection.manifest.version, inspection.manifest.name, inspection.manifest.subtitle,
            inspection.manifestDigest, inspection.checksumsDigest, inspection.packageDigest, installedAt,
            inspection.trust.keyId, inspection.trust.trustLevel, inspection.manifest.packageFormatVersion, inspection.manifest.themeApiVersion,
            appVersion, inspection.manifest.minAppVersion, inspection.manifest.maxAppVersionExclusive,
            inspection.entrySizes.filterKeys { it != "INSTALL_COMPLETE.json" }
        )
        writeDurableJson(File(inspection.extractedRoot, "INSTALL_COMPLETE.json"), record.toJson().toString(2))
        themeRoot.mkdirs()
        if (!inspection.extractedRoot.renameTo(destination)) throw ThemePackageFailure("ATOMIC_INSTALL_FAILED")
        writeIndex(rebuildIndex())
        inspection.packageFile.parentFile?.deleteRecursively()
        return record
    }

    fun listInstalled(): List<InstalledThemeRecord> = rebuildIndex()

    fun rebuildIndex(): List<InstalledThemeRecord> {
        val records = mutableListOf<InstalledThemeRecord>()
        themesRoot.listFiles()?.filter { it.isDirectory && it.name != ".staging" }?.forEach { themeDir ->
            themeDir.listFiles()?.filter { it.isDirectory }?.forEach { versionDir ->
                val complete = File(versionDir, "INSTALL_COMPLETE.json")
                if (complete.isFile) {
                    try { records += InstalledThemeRecord.fromJson(JSONObject(complete.readText(Charsets.UTF_8))) } catch (_: Exception) { }
                }
            }
        }
        return records.sortedWith(compareBy<InstalledThemeRecord> { it.themeId }.thenBy { ThemeSemver.parse(it.version) })
    }

    fun rewriteIndex(): List<InstalledThemeRecord> = rebuildIndex().also { writeIndex(it) }

    fun get(themeId: String, version: String): Pair<File, InstalledThemeRecord> {
        val root = ThemePackageSecurityPolicy.safeChild(themesRoot, "$themeId/$version")
        val complete = File(root, "INSTALL_COMPLETE.json")
        if (!root.isDirectory || !complete.isFile) throw ThemePackageFailure("THEME_NOT_INSTALLED")
        return root to InstalledThemeRecord.fromJson(JSONObject(complete.readText(Charsets.UTF_8)))
    }

    fun quickVerify(themeId: String, version: String): Pair<File, InstalledThemeRecord> {
        val (root, record) = get(themeId, version)
        val manifest = File(root, "manifest.json")
        val checksums = File(root, "checksums.json")
        if (!manifest.isFile || !checksums.isFile || ThemePackageSecurityPolicy.sha256(manifest) != record.manifestDigest || ThemePackageSecurityPolicy.sha256(checksums) != record.checksumsDigest) {
            throw ThemePackageFailure("QUICK_INTEGRITY_FAILED")
        }
        record.verifiedFiles.forEach { (relativePath, expectedSize) ->
            val file = ThemePackageSecurityPolicy.safeChild(root, relativePath)
            if (!file.isFile || file.length() != expectedSize) throw ThemePackageFailure("QUICK_INTEGRITY_FAILED", relativePath)
        }
        return root to record
    }

    fun resolveAsset(themeId: String, version: String, relativePath: String): File {
        val (root, _) = get(themeId, version)
        val normalized = ThemePackageSecurityPolicy.normalizeRelativePath(relativePath)
        val checksums = StrictThemeJson.objectValue(File(root, "checksums.json").readBytes())
        @Suppress("UNCHECKED_CAST")
        val files = checksums["files"] as? Map<String, Any?> ?: throw ThemePackageFailure("INVALID_CHECKSUMS")
        if (!files.containsKey(normalized)) throw ThemePackageFailure("ASSET_NOT_VERIFIED", normalized)
        val target = ThemePackageSecurityPolicy.safeChild(root, normalized)
        if (!target.isFile) throw ThemePackageFailure("THEME_FILE_MISSING", normalized)
        return target
    }

    fun remove(themeId: String, version: String) {
        val (root, _) = get(themeId, version)
        if (!root.deleteRecursively()) throw ThemePackageFailure("REMOVE_FAILED")
        root.parentFile?.let { if (it.listFiles().isNullOrEmpty()) it.delete() }
        writeIndex(rebuildIndex())
    }

    private fun writeIndex(records: List<InstalledThemeRecord>) {
        val json = JSONObject().put("formatVersion", 1).put("themes", InstalledThemeRecord.array(records)).toString(2)
        val temp = File(themesRoot, "index.json.tmp")
        writeDurableJson(temp, json)
        if (indexFile.exists() && !indexFile.delete()) throw ThemePackageFailure("INDEX_WRITE_FAILED")
        if (!temp.renameTo(indexFile)) throw ThemePackageFailure("INDEX_WRITE_FAILED")
        syncDirectory(themesRoot)
    }

    private fun writeDurableJson(file: File, text: String) {
        file.parentFile?.mkdirs()
        FileOutputStream(file).use { output ->
            output.write(text.toByteArray(Charsets.UTF_8))
            output.fd.sync()
        }
    }

    private fun syncDirectory(directory: File) {
        try { FileOutputStream(directory).fd.sync() } catch (_: Exception) { }
    }
}
