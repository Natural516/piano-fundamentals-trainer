import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import {
  UPDATER_MANIFEST_MAX_BYTES,
  UPDATER_PACKAGE_ID,
  UpdaterController,
  UpdaterFailure,
  type InstallCapability,
  type InstalledPackageInfo,
  type NativeVerificationProgress,
  type NativeVerificationRequest,
  type UpdaterErrorCode,
  type UpdaterPorts,
  type VerifiedArtifactAuthorization,
  updaterFailureFromUnknown,
  validateUpdaterHttpsUrl
} from './updaterCore'

declare const __UPDATE_MANIFEST_URL__: string

interface NativeUpdaterResult {
  success: boolean
  errorCode?: UpdaterErrorCode
}

interface NativeInstalledPackageResult extends NativeUpdaterResult {
  packageId?: string
  versionCode?: number
  versionName?: string
}

interface NativeManifestResult extends NativeUpdaterResult {
  manifestText?: string
  finalUrl?: string
  redirectCount?: number
  byteCount?: number
}

interface NativeVerifiedArtifactResult extends NativeUpdaterResult {
  token?: string
  packageId?: typeof UPDATER_PACKAGE_ID
  versionCode?: number
  sizeBytes?: number
  sha256?: string
  signerSha256?: string[]
}

interface NativeInstallCapabilityResult extends NativeUpdaterResult {
  capability?: InstallCapability
  androidApiLevel?: number
}

interface NativeUpdaterProgressEvent extends NativeVerificationProgress {
  selectionId: string
}

interface AndroidUpdaterPlugin {
  getInstalledPackageInfo(): Promise<NativeInstalledPackageResult>
  fetchManifest(): Promise<NativeManifestResult>
  invalidateSelection(): Promise<NativeUpdaterResult>
  downloadAndVerify(request: NativeVerificationRequest): Promise<NativeVerifiedArtifactResult>
  cancelDownload(): Promise<NativeUpdaterResult>
  getInstallCapability(): Promise<NativeInstallCapabilityResult>
  openInstallSettings(): Promise<NativeUpdaterResult>
  installVerifiedArtifact(options: { token: string }): Promise<NativeUpdaterResult>
  addListener(
    eventName: 'progress',
    listener: (event: NativeUpdaterProgressEvent) => void
  ): Promise<PluginListenerHandle>
}

export const NativeAndroidUpdater = registerPlugin<AndroidUpdaterPlugin>('AndroidUpdater')

function requireSuccess<T extends NativeUpdaterResult>(result: T, fallback: UpdaterErrorCode): T {
  if (!result.success) throw new UpdaterFailure(result.errorCode ?? fallback)
  return result
}

export class HttpsManifestFetchAdapter {
  constructor(private readonly timeoutMs = 10_000) {}

  async fetchManifest(url: string): Promise<string> {
    const controller = new AbortController()
    const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      let currentUrl = validateUpdaterHttpsUrl(url)
      let response: Response | null = null
      for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
        const candidate = await fetch(currentUrl, {
          method: 'GET',
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'manual',
          headers: { Accept: 'application/json' },
          signal: controller.signal
        })
        if ([301, 302, 303, 307, 308].includes(candidate.status)) {
          if (redirectCount === 5) throw new UpdaterFailure('MANIFEST_NETWORK_ERROR')
          const location = candidate.headers.get('Location')
          if (!location) throw new UpdaterFailure('MANIFEST_NETWORK_ERROR')
          try {
            currentUrl = validateUpdaterHttpsUrl(new URL(location, currentUrl).toString())
          } catch {
            throw new UpdaterFailure('MANIFEST_NETWORK_ERROR')
          }
          continue
        }
        response = candidate
        break
      }
      if (!response) throw new UpdaterFailure('MANIFEST_NETWORK_ERROR')
      if (!response.ok) throw new UpdaterFailure('MANIFEST_NETWORK_ERROR')
      try {
        validateUpdaterHttpsUrl(response.url)
      } catch {
        throw new UpdaterFailure('MANIFEST_NETWORK_ERROR')
      }

      const declaredLength = Number(response.headers.get('Content-Length'))
      if (Number.isFinite(declaredLength) && declaredLength > UPDATER_MANIFEST_MAX_BYTES) {
        throw new UpdaterFailure('MANIFEST_INVALID')
      }
      const chunks: Uint8Array[] = []
      let size = 0
      if (response.body) {
        const reader = response.body.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (!value) continue
          size += value.byteLength
          if (size > UPDATER_MANIFEST_MAX_BYTES) {
            await reader.cancel()
            throw new UpdaterFailure('MANIFEST_INVALID')
          }
          chunks.push(value)
        }
      } else {
        const value = new Uint8Array(await response.arrayBuffer())
        size = value.byteLength
        if (size > UPDATER_MANIFEST_MAX_BYTES) throw new UpdaterFailure('MANIFEST_INVALID')
        chunks.push(value)
      }

      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      } catch {
        throw new UpdaterFailure('MANIFEST_INVALID')
      }
    } catch (error) {
      if (error instanceof UpdaterFailure) throw error
      throw new UpdaterFailure('MANIFEST_NETWORK_ERROR')
    } finally {
      globalThis.clearTimeout(timeout)
    }
  }
}

export class AndroidNativeManifestFetchAdapter {
  constructor(private readonly plugin: AndroidUpdaterPlugin) {}

  async fetchManifest(configuredUrl: string): Promise<string> {
    try {
      validateUpdaterHttpsUrl(configuredUrl)
      const result = requireSuccess(await this.plugin.fetchManifest(), 'MANIFEST_NETWORK_ERROR')
      if (typeof result.manifestText !== 'string' || typeof result.finalUrl !== 'string' ||
          !Number.isSafeInteger(result.redirectCount) || Number(result.redirectCount) < 0 ||
          !Number.isSafeInteger(result.byteCount) || Number(result.byteCount) < 0) {
        throw new UpdaterFailure('MANIFEST_NETWORK_ERROR')
      }
      validateUpdaterHttpsUrl(result.finalUrl)
      const actualBytes = new TextEncoder().encode(result.manifestText).byteLength
      if (actualBytes > UPDATER_MANIFEST_MAX_BYTES || actualBytes !== result.byteCount) {
        throw new UpdaterFailure('MANIFEST_INVALID')
      }
      return result.manifestText
    } catch (error) {
      throw updaterFailureFromUnknown(error, 'MANIFEST_NETWORK_ERROR')
    }
  }
}

export class AndroidNativeUpdaterPorts implements UpdaterPorts {
  private progressListener: PluginListenerHandle | null = null
  private progressCallback: ((progress: NativeVerificationProgress) => void) | null = null
  private progressSelectionId: string | null = null

  private readonly manifestFetcher: { fetchManifest(url: string): Promise<string> }

  constructor(
    private readonly plugin: AndroidUpdaterPlugin,
    manifestFetcher?: { fetchManifest(url: string): Promise<string> }
  ) {
    this.manifestFetcher = manifestFetcher ?? new AndroidNativeManifestFetchAdapter(plugin)
  }

  async getInstalledPackageInfo(): Promise<InstalledPackageInfo> {
    try {
      const result = requireSuccess(await this.plugin.getInstalledPackageInfo(), 'INSTALLED_PACKAGE_INFO_ERROR')
      if (!result.packageId || !result.versionCode || !result.versionName) {
        throw new UpdaterFailure('INSTALLED_PACKAGE_INFO_ERROR')
      }
      return {
        packageId: result.packageId,
        versionCode: result.versionCode,
        versionName: result.versionName
      }
    } catch (error) {
      throw updaterFailureFromUnknown(error, 'INSTALLED_PACKAGE_INFO_ERROR')
    }
  }

  fetchManifest(url: string): Promise<string> {
    return this.manifestFetcher.fetchManifest(url)
  }

  async invalidateSelection(): Promise<void> {
    try {
      requireSuccess(await this.plugin.invalidateSelection(), 'APK_ARCHIVE_INVALID')
    } catch (error) {
      throw updaterFailureFromUnknown(error, 'APK_ARCHIVE_INVALID')
    }
  }

  async downloadAndVerify(
    request: NativeVerificationRequest,
    onProgress: (progress: NativeVerificationProgress) => void
  ): Promise<VerifiedArtifactAuthorization> {
    this.progressCallback = onProgress
    this.progressSelectionId = request.selectionId
    await this.ensureProgressListener()
    try {
      const result = requireSuccess(await this.plugin.downloadAndVerify(request), 'DOWNLOAD_NETWORK_ERROR')
      if (!result.token || !result.packageId || !result.versionCode || !result.sizeBytes ||
          !result.sha256 || !Array.isArray(result.signerSha256)) {
        throw new UpdaterFailure('APK_ARCHIVE_INVALID')
      }
      return {
        token: result.token,
        packageId: result.packageId,
        versionCode: result.versionCode,
        sizeBytes: result.sizeBytes,
        sha256: result.sha256,
        signerSha256: [...result.signerSha256]
      }
    } catch (error) {
      throw updaterFailureFromUnknown(error, 'DOWNLOAD_NETWORK_ERROR')
    } finally {
      this.progressCallback = null
      this.progressSelectionId = null
    }
  }

  async cancelDownload(): Promise<void> {
    try {
      requireSuccess(await this.plugin.cancelDownload(), 'DOWNLOAD_NETWORK_ERROR')
    } catch (error) {
      throw updaterFailureFromUnknown(error, 'DOWNLOAD_NETWORK_ERROR')
    }
  }

  async getInstallCapability(): Promise<InstallCapability> {
    try {
      const result = requireSuccess(await this.plugin.getInstallCapability(), 'INSTALL_PLATFORM_UNSUPPORTED')
      if (result.capability !== 'READY' && result.capability !== 'PERMISSION_REQUIRED' && result.capability !== 'UNSUPPORTED') {
        throw new UpdaterFailure('INSTALL_PLATFORM_UNSUPPORTED')
      }
      return result.capability
    } catch (error) {
      throw updaterFailureFromUnknown(error, 'INSTALL_PLATFORM_UNSUPPORTED')
    }
  }

  async openInstallSettings(): Promise<void> {
    try {
      requireSuccess(await this.plugin.openInstallSettings(), 'INSTALL_LAUNCH_FAILED')
    } catch (error) {
      throw updaterFailureFromUnknown(error, 'INSTALL_LAUNCH_FAILED')
    }
  }

  async installVerifiedArtifact(token: string): Promise<void> {
    try {
      requireSuccess(await this.plugin.installVerifiedArtifact({ token }), 'INSTALL_LAUNCH_FAILED')
    } catch (error) {
      throw updaterFailureFromUnknown(error, 'INSTALL_LAUNCH_FAILED')
    }
  }

  async dispose(): Promise<void> {
    this.progressCallback = null
    this.progressSelectionId = null
    if (this.progressListener) await this.progressListener.remove()
    this.progressListener = null
  }

  private async ensureProgressListener(): Promise<void> {
    if (this.progressListener) return
    this.progressListener = await this.plugin.addListener('progress', (event) => {
      if (event.selectionId !== this.progressSelectionId) return
      this.progressCallback?.({
        stage: event.stage,
        receivedBytes: event.receivedBytes,
        totalBytes: event.totalBytes
      })
    })
  }
}

class BrowserUpdaterPorts implements UpdaterPorts {
  private readonly fetcher = new HttpsManifestFetchAdapter()

  async getInstalledPackageInfo(): Promise<InstalledPackageInfo> {
    return { packageId: UPDATER_PACKAGE_ID, versionCode: 4, versionName: '1.3.0' }
  }

  fetchManifest(url: string): Promise<string> {
    return this.fetcher.fetchManifest(url)
  }

  async invalidateSelection(): Promise<void> {}

  async downloadAndVerify(): Promise<VerifiedArtifactAuthorization> {
    throw new UpdaterFailure('INSTALL_PLATFORM_UNSUPPORTED')
  }

  async cancelDownload(): Promise<void> {}

  async getInstallCapability(): Promise<InstallCapability> {
    return 'UNSUPPORTED'
  }

  async openInstallSettings(): Promise<void> {
    throw new UpdaterFailure('INSTALL_PLATFORM_UNSUPPORTED')
  }

  async installVerifiedArtifact(): Promise<void> {
    throw new UpdaterFailure('INSTALL_PLATFORM_UNSUPPORTED')
  }
}

export function createAndroidUpdaterController(): UpdaterController {
  const ports: UpdaterPorts = Capacitor.isNativePlatform()
    ? new AndroidNativeUpdaterPorts(NativeAndroidUpdater)
    : new BrowserUpdaterPorts()
  return new UpdaterController(__UPDATE_MANIFEST_URL__, ports)
}
