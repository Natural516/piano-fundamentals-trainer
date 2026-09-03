package com.pianofundamentals.trainer

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.system.Os
import androidx.core.content.FileProvider
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.HttpsURLConnection

@CapacitorPlugin(name = "AndroidUpdater")
class AndroidUpdaterPlugin : Plugin() {
    companion object {
        private const val EVENT_PROGRESS = "progress"
        private const val CONNECT_TIMEOUT_MS = 10_000
        private const val READ_TIMEOUT_MS = 20_000
        private const val MAX_REDIRECTS = 5
        private const val BUFFER_SIZE = 64 * 1024
        private const val FILE_PROVIDER_AUTHORITY_SUFFIX = ".updater.fileprovider"
    }

    private class NativeFailure(val code: String) : Exception(code)

    private data class ArchiveInspection(
        val packageId: String,
        val versionCode: Long,
        val signerSet: Set<String>
    )

    private data class ManifestConnection(
        val connection: HttpsURLConnection,
        val finalUrl: URL,
        val redirectCount: Int
    )

    private data class ManifestResponse(
        val text: String,
        val finalUrl: String,
        val redirectCount: Int,
        val byteCount: Int
    )

    private val mainHandler = Handler(Looper.getMainLooper())
    private val worker = Executors.newSingleThreadExecutor()
    private val cancellationRequested = AtomicBoolean(false)
    private val tokenRegistry = VerifiedArtifactTokenRegistry { UUID.randomUUID().toString() }
    private val downloadLock = Any()
    private var downloadRunning = false
    private lateinit var updateRoot: File
    private lateinit var partRoot: File
    private lateinit var verifiedRoot: File

    override fun load() {
        updateRoot = File(context.cacheDir, "update")
        partRoot = File(updateRoot, "parts")
        verifiedRoot = File(updateRoot, "verified")
        ensureDirectories()
        cleanupDirectory(partRoot)
        cleanupDirectory(verifiedRoot)
        tokenRegistry.invalidateAll()
    }

    override fun handleOnDestroy() {
        cancellationRequested.set(true)
        tokenRegistry.invalidateAll()
        worker.shutdownNow()
        super.handleOnDestroy()
    }

    @PluginMethod
    fun getInstalledPackageInfo(call: PluginCall) {
        try {
            val info = installedPackageInfo()
            call.resolve(success().apply {
                put("packageId", info.packageName)
                put("versionCode", packageVersionCode(info))
                put("versionName", info.versionName ?: "")
            })
        } catch (_: Exception) {
            call.resolve(failure("INSTALLED_PACKAGE_INFO_ERROR"))
        }
    }

    @PluginMethod
    fun fetchManifest(call: PluginCall) {
        worker.execute {
            try {
                val response = fetchProductionManifest()
                resolveOnMain(call, success().apply {
                    put("manifestText", response.text)
                    put("finalUrl", response.finalUrl)
                    put("redirectCount", response.redirectCount)
                    put("byteCount", response.byteCount)
                })
            } catch (failure: NativeFailure) {
                resolveOnMain(call, failure(failure.code))
            } catch (_: Exception) {
                resolveOnMain(call, failure("MANIFEST_NETWORK_ERROR"))
            }
        }
    }

    @PluginMethod
    fun invalidateSelection(call: PluginCall) {
        cancellationRequested.set(true)
        tokenRegistry.invalidateAll()
        cleanupDirectory(verifiedRoot)
        call.resolve(success())
    }

    @PluginMethod
    fun cancelDownload(call: PluginCall) {
        cancellationRequested.set(true)
        tokenRegistry.invalidateAll()
        cleanupDirectory(verifiedRoot)
        call.resolve(success())
    }

    @PluginMethod
    fun downloadAndVerify(call: PluginCall) {
        val selectionId = call.getString("selectionId")?.trim().orEmpty()
        val apkUrlText = call.getString("apkUrl")?.trim().orEmpty()
        val expectedHash = call.getString("expectedSha256")?.trim()?.uppercase(Locale.ROOT).orEmpty()
        val expectedPackageId = call.getString("expectedPackageId")?.trim().orEmpty()
        val expectedSize = call.data.optLong("expectedSize", -1L)
        val expectedVersionCode = call.data.optLong("expectedVersionCode", -1L)
        val installedVersionCode = call.data.optLong("installedVersionCode", -1L)

        if (selectionId.isBlank() ||
            apkUrlText.length > 2_048 ||
            expectedPackageId != AndroidUpdaterSecurityPolicy.PACKAGE_ID ||
            expectedSize !in 1..AndroidUpdaterSecurityPolicy.MAX_APK_BYTES ||
            expectedVersionCode <= installedVersionCode || installedVersionCode < 1 ||
            !expectedHash.matches(Regex("^[A-F0-9]{64}$"))) {
            call.resolve(failure("MANIFEST_INVALID"))
            return
        }
        val apkUrl = try {
            validatedHttpsUrl(URL(apkUrlText))
        } catch (_: Exception) {
            call.resolve(failure("MANIFEST_INVALID"))
            return
        }

        synchronized(downloadLock) {
            if (downloadRunning) {
                call.resolve(failure("DOWNLOAD_NETWORK_ERROR"))
                return
            }
            downloadRunning = true
        }
        cancellationRequested.set(false)
        tokenRegistry.select(selectionId)
        cleanupDirectory(partRoot)
        cleanupDirectory(verifiedRoot)

        worker.execute {
            var partFile: File? = null
            try {
                ensureDirectories()
                partFile = File(partRoot, "${UUID.randomUUID()}.part")
                val actualHash = downloadToPart(
                    apkUrl,
                    partFile,
                    selectionId,
                    expectedSize
                )
                ensureNotCancelled()
                if (partFile.length() != expectedSize) throw NativeFailure("DOWNLOAD_SIZE_MISMATCH")
                if (actualHash != expectedHash) throw NativeFailure("APK_SHA256_MISMATCH")

                emitProgress(selectionId, "verifying", expectedSize, expectedSize)
                val inspection = inspectArchive(
                    partFile,
                    expectedPackageId,
                    expectedVersionCode,
                    installedVersionCode
                )
                ensureNotCancelled()

                val verifiedFile = File(verifiedRoot, "update-${UUID.randomUUID()}.apk")
                Os.rename(partFile.absolutePath, verifiedFile.absolutePath)
                partFile = null
                if (!verifiedFile.setReadable(true, true) || !verifiedFile.setWritable(false, false)) {
                    verifiedFile.delete()
                    throw NativeFailure("APK_ARCHIVE_INVALID")
                }
                val identity = createIdentity(
                    verifiedFile,
                    selectionId,
                    expectedSize,
                    actualHash,
                    inspection
                )
                val token = tokenRegistry.issue(identity)
                resolveOnMain(call, success().apply {
                    put("token", token)
                    put("packageId", inspection.packageId)
                    put("versionCode", inspection.versionCode)
                    put("sizeBytes", expectedSize)
                    put("sha256", actualHash)
                    put("signerSha256", JSArray(inspection.signerSet.sorted()))
                })
            } catch (nativeFailure: NativeFailure) {
                partFile?.delete()
                tokenRegistry.invalidateAll()
                cleanupDirectory(verifiedRoot)
                resolveOnMain(call, failure(nativeFailure.code))
            } catch (_: Exception) {
                partFile?.delete()
                tokenRegistry.invalidateAll()
                cleanupDirectory(verifiedRoot)
                resolveOnMain(call, failure("DOWNLOAD_NETWORK_ERROR"))
            } finally {
                synchronized(downloadLock) { downloadRunning = false }
                cancellationRequested.set(false)
            }
        }
    }

    @PluginMethod
    fun getInstallCapability(call: PluginCall) {
        try {
            val canRequest = if (AndroidUpdaterSecurityPolicy.shouldQueryInstallCapability(Build.VERSION.SDK_INT)) {
                context.packageManager.canRequestPackageInstalls()
            } else {
                null
            }
            call.resolve(success().apply {
                put("androidApiLevel", Build.VERSION.SDK_INT)
                put("capability", AndroidUpdaterSecurityPolicy.installCapability(Build.VERSION.SDK_INT, canRequest))
            })
        } catch (_: Exception) {
            call.resolve(failure("INSTALL_PLATFORM_UNSUPPORTED"))
        }
    }

    @PluginMethod
    fun openInstallSettings(call: PluginCall) {
        if (Build.VERSION.SDK_INT < 26) {
            call.resolve(failure("INSTALL_PLATFORM_UNSUPPORTED"))
            return
        }
        try {
            val intent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}")
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve(success())
        } catch (_: ActivityNotFoundException) {
            call.resolve(failure("INSTALL_LAUNCH_FAILED"))
        } catch (_: SecurityException) {
            call.resolve(failure("INSTALL_LAUNCH_FAILED"))
        }
    }

    @PluginMethod
    fun installVerifiedArtifact(call: PluginCall) {
        val token = call.getString("token")?.trim().orEmpty()
        if (token.isBlank()) {
            call.resolve(failure("APK_ARCHIVE_INVALID"))
            return
        }
        worker.execute {
            try {
                val stored = tokenRegistry.identity(token) ?: throw NativeFailure("APK_ARCHIVE_INVALID")
                if (Build.VERSION.SDK_INT >= 26 && !context.packageManager.canRequestPackageInstalls()) {
                    throw NativeFailure("INSTALL_PERMISSION_REQUIRED")
                }
                val file = File(stored.canonicalPath)
                val canonical = file.canonicalFile
                if (!AndroidUpdaterSecurityPolicy.isInsideVerifiedScope(
                        verifiedRoot.canonicalPath,
                        canonical.canonicalPath
                    ) || !canonical.exists() || !canonical.isFile || canonical.canWrite() ||
                    canonical.length() != stored.observedSize || canonical.lastModified() != stored.lastModified) {
                    throw NativeFailure("APK_ARCHIVE_INVALID")
                }
                val actualHash = sha256(canonical)
                if (actualHash != stored.sha256) throw NativeFailure("APK_SHA256_MISMATCH")
                val currentInstalled = packageVersionCode(installedPackageInfo())
                val inspection = inspectArchive(
                    canonical,
                    stored.packageId,
                    stored.versionCode,
                    currentInstalled
                )
                val observed = createIdentity(
                    canonical,
                    stored.selectionId,
                    stored.expectedSize,
                    actualHash,
                    inspection
                )
                if (!tokenRegistry.validate(token, observed)) throw NativeFailure("APK_ARCHIVE_INVALID")

                val uri = FileProvider.getUriForFile(
                    context,
                    context.packageName + FILE_PROVIDER_AUTHORITY_SUFFIX,
                    canonical
                )
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                mainHandler.post {
                    try {
                        context.startActivity(intent)
                        tokenRegistry.invalidate(token)
                        call.resolve(success())
                    } catch (_: ActivityNotFoundException) {
                        call.resolve(failure("INSTALL_LAUNCH_FAILED"))
                    } catch (_: SecurityException) {
                        call.resolve(failure("INSTALL_LAUNCH_FAILED"))
                    }
                }
            } catch (nativeFailure: NativeFailure) {
                tokenRegistry.invalidate(token)
                resolveOnMain(call, failure(nativeFailure.code))
            } catch (_: Exception) {
                tokenRegistry.invalidate(token)
                resolveOnMain(call, failure("INSTALL_LAUNCH_FAILED"))
            }
        }
    }

    private fun fetchProductionManifest(): ManifestResponse {
        val initialUrl = try {
            AndroidManifestTransportPolicy.validatedHttpsUrl(URL(BuildConfig.UPDATE_MANIFEST_URL))
        } catch (_: Exception) {
            throw NativeFailure("UPDATER_CONFIGURATION_ERROR")
        }
        val opened = openManifestConnection(initialUrl)
        try {
            val declaredLength = opened.connection.contentLengthLong
            if (declaredLength > AndroidManifestTransportPolicy.MAX_MANIFEST_BYTES) {
                throw NativeFailure("MANIFEST_INVALID")
            }
            val bounded = BoundedManifestUtf8Buffer()
            BufferedInputStream(opened.connection.inputStream).use { input ->
                val buffer = ByteArray(8 * 1024)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    if (read > 0) bounded.append(buffer, 0, read)
                }
            }
            return ManifestResponse(
                text = bounded.decodeUtf8(),
                finalUrl = opened.finalUrl.toString(),
                redirectCount = opened.redirectCount,
                byteCount = bounded.size
            )
        } catch (failure: NativeFailure) {
            throw failure
        } catch (failure: ManifestTransportFailure) {
            throw NativeFailure(failure.errorCode)
        } catch (_: Exception) {
            throw NativeFailure("MANIFEST_NETWORK_ERROR")
        } finally {
            opened.connection.disconnect()
        }
    }

    private fun openManifestConnection(initialUrl: URL): ManifestConnection {
        var current = initialUrl
        repeat(AndroidManifestTransportPolicy.MAX_REDIRECTS + 1) { redirectCount ->
            val connection = current.openConnection() as? HttpsURLConnection
                ?: throw NativeFailure("MANIFEST_NETWORK_ERROR")
            try {
                connection.instanceFollowRedirects = false
                connection.requestMethod = "GET"
                connection.connectTimeout = CONNECT_TIMEOUT_MS
                connection.readTimeout = READ_TIMEOUT_MS
                connection.useCaches = false
                connection.setRequestProperty("Accept", "application/json")
                connection.setRequestProperty("Accept-Encoding", "identity")
                connection.setRequestProperty("Cache-Control", "no-store")
                val status = connection.responseCode
                if (status in 200..299) {
                    return ManifestConnection(connection, current, redirectCount)
                }
                if (AndroidManifestTransportPolicy.isRedirect(status) &&
                    redirectCount < AndroidManifestTransportPolicy.MAX_REDIRECTS) {
                    val location = connection.getHeaderField("Location")
                        ?: throw NativeFailure("MANIFEST_NETWORK_ERROR")
                    current = try {
                        AndroidManifestTransportPolicy.redirectedHttpsUrl(current, location)
                    } catch (_: ManifestTransportFailure) {
                        throw NativeFailure("MANIFEST_NETWORK_ERROR")
                    }
                    connection.disconnect()
                } else {
                    throw NativeFailure("MANIFEST_NETWORK_ERROR")
                }
            } catch (failure: NativeFailure) {
                connection.disconnect()
                throw failure
            } catch (_: Exception) {
                connection.disconnect()
                throw NativeFailure("MANIFEST_NETWORK_ERROR")
            }
        }
        throw NativeFailure("MANIFEST_NETWORK_ERROR")
    }

    private fun downloadToPart(
        initialUrl: URL,
        destination: File,
        selectionId: String,
        expectedSize: Long
    ): String {
        val connection = openHttpsConnection(initialUrl)
        try {
            val declaredLength = connection.contentLengthLong
            if (declaredLength > AndroidUpdaterSecurityPolicy.MAX_APK_BYTES ||
                (declaredLength >= 0 && declaredLength != expectedSize)) {
                throw NativeFailure("DOWNLOAD_SIZE_MISMATCH")
            }
            val digest = MessageDigest.getInstance("SHA-256")
            var count = 0L
            BufferedInputStream(connection.inputStream).use { input ->
                BufferedOutputStream(FileOutputStream(destination, false)).use { output ->
                    val buffer = ByteArray(BUFFER_SIZE)
                    while (true) {
                        ensureNotCancelled()
                        val read = input.read(buffer)
                        if (read < 0) break
                        if (read == 0) continue
                        count += read
                        if (count > expectedSize || count > AndroidUpdaterSecurityPolicy.MAX_APK_BYTES) {
                            throw NativeFailure("DOWNLOAD_SIZE_MISMATCH")
                        }
                        output.write(buffer, 0, read)
                        digest.update(buffer, 0, read)
                        emitProgress(selectionId, "downloading", count, expectedSize)
                    }
                    output.flush()
                }
            }
            if (count != expectedSize) throw NativeFailure("DOWNLOAD_SIZE_MISMATCH")
            return digest.digest().toHex()
        } catch (failure: NativeFailure) {
            throw failure
        } catch (_: Exception) {
            throw NativeFailure("DOWNLOAD_NETWORK_ERROR")
        } finally {
            connection.disconnect()
        }
    }

    private fun openHttpsConnection(initialUrl: URL): HttpsURLConnection {
        var current = validatedHttpsUrl(initialUrl)
        repeat(MAX_REDIRECTS + 1) { redirectCount ->
            val connection = current.openConnection() as? HttpsURLConnection
                ?: throw NativeFailure("DOWNLOAD_NETWORK_ERROR")
            connection.instanceFollowRedirects = false
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.useCaches = false
            connection.setRequestProperty("Accept", "application/vnd.android.package-archive")
            connection.setRequestProperty("Accept-Encoding", "identity")
            connection.setRequestProperty("Cookie", "")
            val status = connection.responseCode
            if (status in 200..299) return connection
            if (status in listOf(
                    HttpURLConnection.HTTP_MOVED_PERM,
                    HttpURLConnection.HTTP_MOVED_TEMP,
                    HttpURLConnection.HTTP_SEE_OTHER,
                    307,
                    308
                ) && redirectCount < MAX_REDIRECTS) {
                val location = connection.getHeaderField("Location")
                    ?: throw NativeFailure("DOWNLOAD_NETWORK_ERROR")
                connection.disconnect()
                current = validatedHttpsUrl(URL(current, location))
            } else {
                connection.disconnect()
                throw NativeFailure("DOWNLOAD_NETWORK_ERROR")
            }
        }
        throw NativeFailure("DOWNLOAD_NETWORK_ERROR")
    }

    private fun validatedHttpsUrl(url: URL): URL {
        if (url.protocol.lowercase(Locale.ROOT) != "https" ||
            url.host.isNullOrBlank() || url.userInfo != null || url.ref != null) {
            throw NativeFailure("MANIFEST_INVALID")
        }
        return url
    }

    private fun inspectArchive(
        file: File,
        expectedPackageId: String,
        expectedVersionCode: Long,
        installedVersionCode: Long
    ): ArchiveInspection {
        val flags = if (AndroidUpdaterSecurityPolicy.signerInspectionApi(Build.VERSION.SDK_INT) ==
            AndroidUpdaterSecurityPolicy.SignerInspectionApi.SIGNING_INFO) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            @Suppress("DEPRECATION")
            PackageManager.GET_SIGNATURES
        }
        val info = try {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageArchiveInfo(file.absolutePath, flags)
                ?: throw NativeFailure("APK_ARCHIVE_INVALID")
        } catch (nativeFailure: NativeFailure) {
            throw nativeFailure
        } catch (_: Exception) {
            throw NativeFailure("APK_ARCHIVE_INVALID")
        }
        if (info.packageName != expectedPackageId || info.packageName != AndroidUpdaterSecurityPolicy.PACKAGE_ID) {
            throw NativeFailure("APK_PACKAGE_MISMATCH")
        }
        val archiveVersion = packageVersionCode(info)
        if (archiveVersion != expectedVersionCode) throw NativeFailure("APK_VERSION_MISMATCH")
        if (archiveVersion <= installedVersionCode) throw NativeFailure("APK_DOWNGRADE_REJECTED")
        val signatures: Array<Signature> = try {
            if (Build.VERSION.SDK_INT >= 28) {
                val signingInfo = info.signingInfo ?: throw NativeFailure("APK_SIGNER_INSPECTION_UNAVAILABLE")
                signingInfo.apkContentsSigners ?: throw NativeFailure("APK_SIGNER_INSPECTION_UNAVAILABLE")
            } else {
                @Suppress("DEPRECATION")
                info.signatures ?: throw NativeFailure("APK_SIGNER_INSPECTION_UNAVAILABLE")
            }
        } catch (nativeFailure: NativeFailure) {
            throw nativeFailure
        } catch (_: Exception) {
            throw NativeFailure("APK_SIGNER_INSPECTION_UNAVAILABLE")
        }
        if (signatures.isEmpty()) throw NativeFailure("APK_SIGNER_INSPECTION_UNAVAILABLE")
        val signerSet = try {
            signatures.map { signatureSha256(it) }.toSet()
        } catch (_: Exception) {
            throw NativeFailure("APK_SIGNER_INSPECTION_UNAVAILABLE")
        }
        if (!AndroidUpdaterSecurityPolicy.exactCurrentSignerSet(signerSet)) {
            throw NativeFailure("APK_SIGNER_MISMATCH")
        }
        return ArchiveInspection(info.packageName, archiveVersion, signerSet)
    }

    private fun createIdentity(
        file: File,
        selectionId: String,
        expectedSize: Long,
        hash: String,
        inspection: ArchiveInspection
    ): VerifiedArtifactIdentity {
        val canonical = file.canonicalFile
        return VerifiedArtifactIdentity(
            artifactId = canonical.name,
            canonicalPath = canonical.canonicalPath,
            expectedSize = expectedSize,
            observedSize = canonical.length(),
            sha256 = hash,
            packageId = inspection.packageId,
            versionCode = inspection.versionCode,
            signerSet = inspection.signerSet,
            selectionId = selectionId,
            lastModified = canonical.lastModified(),
            readOnly = !canonical.canWrite(),
            liveVerified = true
        )
    }

    private fun installedPackageInfo(): PackageInfo {
        @Suppress("DEPRECATION")
        return context.packageManager.getPackageInfo(context.packageName, 0)
    }

    private fun packageVersionCode(info: PackageInfo): Long =
        if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else {
            @Suppress("DEPRECATION")
            info.versionCode.toLong()
        }

    private fun signatureSha256(signature: Signature): String =
        MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).toColonHex()

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        BufferedInputStream(FileInputStream(file)).use { input ->
            val buffer = ByteArray(BUFFER_SIZE)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                if (read > 0) digest.update(buffer, 0, read)
            }
        }
        return digest.digest().toHex()
    }

    private fun emitProgress(selectionId: String, stage: String, received: Long, total: Long) {
        val payload = JSObject().apply {
            put("selectionId", selectionId)
            put("stage", stage)
            put("receivedBytes", received)
            put("totalBytes", total)
        }
        mainHandler.post { notifyListeners(EVENT_PROGRESS, payload, false) }
    }

    private fun ensureNotCancelled() {
        if (cancellationRequested.get() || Thread.currentThread().isInterrupted) {
            throw NativeFailure("DOWNLOAD_NETWORK_ERROR")
        }
    }

    private fun ensureDirectories() {
        if ((!partRoot.exists() && !partRoot.mkdirs()) ||
            (!verifiedRoot.exists() && !verifiedRoot.mkdirs())) {
            throw NativeFailure("DOWNLOAD_NETWORK_ERROR")
        }
    }

    private fun cleanupDirectory(directory: File) {
        directory.listFiles()?.forEach { file ->
            if (file.isDirectory) file.deleteRecursively() else file.delete()
        }
    }

    private fun success(): JSObject = JSObject().apply { put("success", true) }

    private fun failure(code: String): JSObject = JSObject().apply {
        put("success", false)
        put("errorCode", code)
    }

    private fun resolveOnMain(call: PluginCall, result: JSObject) {
        mainHandler.post { call.resolve(result) }
    }

    private fun ByteArray.toHex(): String = joinToString("") { "%02X".format(it.toInt() and 0xff) }

    private fun ByteArray.toColonHex(): String = joinToString(":") { "%02X".format(it.toInt() and 0xff) }
}
