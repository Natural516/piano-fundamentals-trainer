package com.pianofundamentals.trainer

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

@CapacitorPlugin(name = "ThemePackage")
class ThemePackagePlugin : Plugin() {
    companion object { private const val EVENT_PROGRESS = "themePackageProgress" }

    private val worker = Executors.newSingleThreadExecutor()
    private val transactions = ConcurrentHashMap<String, NativeThemeInspection>()
    private lateinit var store: AndroidThemeStore
    private lateinit var validator: NativeThemeArchiveValidator

    override fun load() {
        store = AndroidThemeStore(File(context.filesDir, "themes"))
        validator = NativeThemeArchiveValidator(ThemeTrustStore.forBuild(), AndroidThemeImageInspector(), BuildConfig.THEME_HOST_COMPAT_VERSION)
        store.cleanupStaging()
        store.rewriteIndex()
    }

    override fun handleOnDestroy() {
        worker.shutdownNow()
        super.handleOnDestroy()
    }

    @PluginMethod
    fun pickThemePackage(call: PluginCall) {
        if (!ThemeTrustStore.forBuild().installationAvailable()) {
            call.resolve(failure("PRODUCTION_TRUST_NOT_CONFIGURED")); return
        }
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/octet-stream"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/zip", "application/octet-stream", "*/*"))
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false)
        }
        startActivityForResult(call, intent, "themePackagePicked")
    }

    @ActivityCallback
    fun themePackagePicked(call: PluginCall, result: ActivityResult) {
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            call.resolve(failure("PICKER_CANCELLED")); return
        }
        worker.execute {
            val transactionId = UUID.randomUUID().toString()
            val transactionRoot = File(store.stagingRoot, transactionId)
            val packageFile = File(transactionRoot, "package.pftheme.part")
            val extracted = File(transactionRoot, "extracted")
            try {
                transactionRoot.mkdirs()
                progress("READING")
                copySelectedUri(uri, packageFile)
                progress("VALIDATING")
                val inspection = validator.inspectAndExtract(packageFile, transactionId, extracted)
                progress("CHECKING_SIGNATURE")
                transactions[transactionId] = inspection
                progress("READY_TO_INSTALL")
                resolve(call, JSObject.fromJSONObject(inspection.toJson()).apply {
                    put("manifestJson", File(inspection.extractedRoot, "manifest.json").readText(Charsets.UTF_8))
                    put("themeJson", inspection.themeText)
                })
            } catch (failure: ThemePackageFailure) {
                transactionRoot.deleteRecursively()
                resolve(call, failure(failure.errorCode))
            } catch (error: Exception) {
                transactionRoot.deleteRecursively()
                resolve(call, failure(nativeFailureCode(error, "INSTALL_FAILED")))
            }
        }
    }

    @PluginMethod
    fun inspectThemePackage(call: PluginCall) {
        val transactionId = call.getString("transactionId").orEmpty()
        val inspection = transactions[transactionId]
        if (inspection == null) call.resolve(failure("STAGING_TRANSACTION_NOT_FOUND"))
        else call.resolve(JSObject.fromJSONObject(inspection.toJson()).apply {
            put("manifestJson", File(inspection.extractedRoot, "manifest.json").readText(Charsets.UTF_8))
            put("themeJson", inspection.themeText)
        })
    }

    @PluginMethod
    fun installThemePackage(call: PluginCall) {
        val transactionId = call.getString("transactionId").orEmpty()
        val inspection = transactions.remove(transactionId)
        if (inspection == null) { call.resolve(failure("STAGING_TRANSACTION_NOT_FOUND")); return }
        worker.execute {
            try {
                progress("INSTALLING")
                val record = store.install(inspection, BuildConfig.VERSION_NAME)
                progress("INSTALLED")
                resolve(call, success().put("theme", record.toJson()))
            } catch (failure: ThemePackageFailure) {
                inspection.packageFile.parentFile?.deleteRecursively()
                resolve(call, failure(failure.errorCode))
            } catch (error: Exception) {
                inspection.packageFile.parentFile?.deleteRecursively()
                resolve(call, failure(nativeFailureCode(error, "INSTALL_FAILED")))
            }
        }
    }

    @PluginMethod
    fun listInstalledThemes(call: PluginCall) {
        worker.execute {
            try { resolve(call, success().put("themes", InstalledThemeRecord.array(store.listInstalled()))) }
            catch (_: Exception) { resolve(call, failure("THEME_STORE_READ_FAILED")) }
        }
    }

    @PluginMethod
    fun rebuildIndex(call: PluginCall) {
        worker.execute {
            try { resolve(call, success().put("themes", InstalledThemeRecord.array(store.rewriteIndex()))) }
            catch (_: Exception) { resolve(call, failure("INDEX_REBUILD_FAILED")) }
        }
    }

    @PluginMethod
    fun loadInstalledTheme(call: PluginCall) {
        worker.execute {
            try {
                val themeId = required(call, "themeId")
                val version = required(call, "version")
                val (root, record) = store.quickVerify(themeId, version)
                val manifest = File(root, "manifest.json").readText(Charsets.UTF_8)
                val theme = File(root, "theme.json").readText(Charsets.UTF_8)
                resolve(call, success().put("record", record.toJson()).put("manifestJson", manifest).put("themeJson", theme))
            } catch (failure: ThemePackageFailure) { resolve(call, failure(failure.errorCode)) }
            catch (_: Exception) { resolve(call, failure("THEME_LOAD_FAILED")) }
        }
    }

    @PluginMethod
    fun verifyInstalledTheme(call: PluginCall) {
        worker.execute {
            try {
                val (root, record) = store.get(required(call, "themeId"), required(call, "version"))
                validator.verifyInstalledDirectory(root, record)
                resolve(call, success().put("integrity", "VERIFIED"))
            } catch (failure: ThemePackageFailure) { resolve(call, failure(failure.errorCode)) }
            catch (_: Exception) { resolve(call, failure("VERIFY_FAILED")) }
        }
    }

    @PluginMethod
    fun removeTheme(call: PluginCall) {
        if (call.getBoolean("active", false) == true) { call.resolve(failure("ACTIVE_THEME_REQUIRES_LIGHT")); return }
        worker.execute {
            try { store.remove(required(call, "themeId"), required(call, "version")); resolve(call, success()) }
            catch (failure: ThemePackageFailure) { resolve(call, failure(failure.errorCode)) }
            catch (_: Exception) { resolve(call, failure("REMOVE_FAILED")) }
        }
    }

    @PluginMethod
    fun resolveThemeAsset(call: PluginCall) {
        worker.execute {
            try {
                val file = store.resolveAsset(required(call, "themeId"), required(call, "version"), required(call, "relativePath"))
                resolve(call, success().put("fileUri", Uri.fromFile(file).toString()))
            } catch (failure: ThemePackageFailure) { resolve(call, failure(failure.errorCode)) }
            catch (_: Exception) { resolve(call, failure("ASSET_RESOLVE_FAILED")) }
        }
    }

    @PluginMethod
    fun cleanupStaging(call: PluginCall) {
        transactions.clear()
        store.cleanupStaging()
        call.resolve(success())
    }

    private fun copySelectedUri(uri: Uri, destination: File) {
        val displayName = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }
        if (displayName != null && !displayName.endsWith(".pftheme", ignoreCase = true)) throw ThemePackageFailure("INVALID_THEME_PACKAGE")
        val input = context.contentResolver.openInputStream(uri) ?: throw ThemePackageFailure("FILE_READ_FAILED")
        var total = 0L
        input.buffered().use { source ->
            FileOutputStream(destination).buffered().use { target ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    val count = source.read(buffer)
                    if (count < 0) break
                    total += count
                    if (total > ThemePackageLimits.ARCHIVE_BYTES) throw ThemePackageFailure("PACKAGE_TOO_LARGE")
                    target.write(buffer, 0, count)
                }
            }
        }
    }

    private fun required(call: PluginCall, name: String): String = call.getString(name)?.takeIf { it.isNotBlank() } ?: throw ThemePackageFailure("INVALID_ARGUMENT", name)
    private fun progress(stage: String) = notifyListeners(EVENT_PROGRESS, JSObject().put("stage", stage), true)
    private fun success() = JSObject().put("status", "ok")
    private fun failure(code: String) = JSObject().put("status", "error").put("errorCode", code)
    private fun nativeFailureCode(error: Exception, fallback: String): String = if (error.message?.contains("ENOSPC", true) == true || error.message?.contains("no space", true) == true) "STORAGE_FULL" else fallback
    private fun resolve(call: PluginCall, result: JSObject) = activity.runOnUiThread { call.resolve(result) }
}
