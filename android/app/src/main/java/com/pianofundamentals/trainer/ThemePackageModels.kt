package com.pianofundamentals.trainer

import org.json.JSONArray
import org.json.JSONObject
import java.io.File

data class NativeThemeManifest(
    val themeId: String,
    val name: String,
    val subtitle: String,
    val version: String,
    val minAppVersion: String,
    val maxAppVersionExclusive: String,
    val packageFormatVersion: Int,
    val themeApiVersion: Int,
    val signature: Map<String, Any?>?,
    val previewCover: String?
) {
    companion object {
        @Suppress("UNCHECKED_CAST")
        fun from(map: Map<String, Any?>): NativeThemeManifest {
            fun string(name: String) = map[name] as? String ?: throw ThemePackageFailure("INVALID_MANIFEST", name)
            fun int(name: String) = (map[name] as? java.math.BigDecimal)?.intValueExact() ?: throw ThemePackageFailure("INVALID_MANIFEST", name)
            if (string("format") != "piano-fundamentals-theme" || string("themeType") != "full" || string("entry") != "theme.json" || string("checksums") != "checksums.json") throw ThemePackageFailure("INVALID_MANIFEST")
            val themeId = string("themeId")
            if (!Regex("^[a-z0-9]+(?:[.-][a-z0-9]+)+$").matches(themeId) || themeId.length > 64) throw ThemePackageFailure("INVALID_MANIFEST", "themeId")
            val preview = map["preview"] as? Map<String, Any?> ?: throw ThemePackageFailure("INVALID_MANIFEST", "preview")
            return NativeThemeManifest(themeId, string("name"), string("subtitle"), string("version"), string("minAppVersion"), string("maxAppVersionExclusive"), int("packageFormatVersion"), int("themeApiVersion"), map["signature"] as? Map<String, Any?>, preview["cover"] as? String)
        }
    }
}

data class NativeThemeInspection(
    val transactionId: String,
    val packageFile: File,
    val extractedRoot: File,
    val manifest: NativeThemeManifest,
    val manifestMap: Map<String, Any?>,
    val checksumsMap: Map<String, Any?>,
    val themeText: String,
    val manifestDigest: String,
    val checksumsDigest: String,
    val packageDigest: String,
    val trust: ThemeTrustResult,
    val entrySizes: Map<String, Long>
) {
    fun toJson(includeToken: Boolean = true): JSONObject = JSONObject().apply {
        put("status", "ok")
        if (includeToken) put("transactionId", transactionId)
        put("themeId", manifest.themeId)
        put("name", manifest.name)
        put("subtitle", manifest.subtitle)
        put("version", manifest.version)
        put("minAppVersion", manifest.minAppVersion)
        put("maxAppVersionExclusive", manifest.maxAppVersionExclusive)
        put("packageFormatVersion", manifest.packageFormatVersion)
        put("themeApiVersion", manifest.themeApiVersion)
        put("trustKeyId", trust.keyId ?: JSONObject.NULL)
        put("trustLevel", trust.trustLevel)
        put("signatureStatus", if (trust.keyId == null) "UNSIGNED_DEBUG" else "VERIFIED")
        put("packageDigest", packageDigest)
        put("preview", manifest.previewCover ?: JSONObject.NULL)
    }
}

data class InstalledThemeRecord(
    val themeId: String,
    val version: String,
    val name: String,
    val subtitle: String,
    val manifestDigest: String,
    val checksumsDigest: String,
    val packageDigest: String,
    val installedAt: String,
    val trustKeyId: String?,
    val trustLevel: String,
    val packageFormatVersion: Int,
    val themeApiVersion: Int,
    val appVersionAtInstall: String,
    val minAppVersion: String,
    val maxAppVersionExclusive: String,
    val verifiedFiles: Map<String, Long>
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("themeId", themeId); put("version", version); put("name", name); put("subtitle", subtitle)
        put("manifestDigest", manifestDigest); put("checksumsDigest", checksumsDigest); put("packageDigest", packageDigest)
        put("installedAt", installedAt); put("trustKeyId", trustKeyId ?: JSONObject.NULL); put("trustLevel", trustLevel)
        put("packageFormatVersion", packageFormatVersion); put("themeApiVersion", themeApiVersion); put("appVersionAtInstall", appVersionAtInstall)
        put("minAppVersion", minAppVersion); put("maxAppVersionExclusive", maxAppVersionExclusive)
        put("verifiedFiles", JSONObject(verifiedFiles))
    }

    companion object {
        fun fromJson(json: JSONObject): InstalledThemeRecord = InstalledThemeRecord(
            json.getString("themeId"), json.getString("version"), json.getString("name"), json.optString("subtitle"),
            json.getString("manifestDigest"), json.getString("checksumsDigest"), json.getString("packageDigest"), json.getString("installedAt"),
            json.optString("trustKeyId").ifBlank { null }, json.getString("trustLevel"), json.getInt("packageFormatVersion"), json.getInt("themeApiVersion"),
            json.getString("appVersionAtInstall"), json.getString("minAppVersion"), json.getString("maxAppVersionExclusive"),
            json.optJSONObject("verifiedFiles")?.let { files -> files.keys().asSequence().associateWith { files.getLong(it) } } ?: emptyMap()
        )

        fun array(records: List<InstalledThemeRecord>): JSONArray = JSONArray().also { array -> records.forEach { array.put(it.toJson()) } }
    }
}
