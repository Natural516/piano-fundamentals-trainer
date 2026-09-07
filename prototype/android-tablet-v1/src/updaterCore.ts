export const UPDATER_SCHEMA_VERSION = 1 as const
export const UPDATER_PACKAGE_ID = 'com.pianofundamentals.trainer'
export const UPDATER_PINNED_SIGNER_SHA256 = '19:3D:A3:16:AE:F6:A2:2F:9C:15:D1:01:9E:25:87:E7:25:85:8A:70:8B:D0:07:7A:D8:58:98:CD:65:57:96:32'
export const UPDATER_MANIFEST_MAX_BYTES = 65_536
export const UPDATER_APK_MAX_BYTES = 268_435_456

export type UpdaterErrorCode =
  | 'MANIFEST_NETWORK_ERROR'
  | 'MANIFEST_INVALID'
  | 'MANIFEST_UNSUPPORTED_SCHEMA'
  | 'PACKAGE_ID_MISMATCH'
  | 'NO_UPDATE'
  | 'MANIFEST_OLDER_THAN_INSTALLED'
  | 'DOWNLOAD_NETWORK_ERROR'
  | 'DOWNLOAD_SIZE_MISMATCH'
  | 'APK_SHA256_MISMATCH'
  | 'APK_PACKAGE_MISMATCH'
  | 'APK_VERSION_MISMATCH'
  | 'APK_DOWNGRADE_REJECTED'
  | 'APK_SIGNER_MISMATCH'
  | 'APK_ARCHIVE_INVALID'
  | 'APK_SIGNER_INSPECTION_UNAVAILABLE'
  | 'INSTALL_PERMISSION_REQUIRED'
  | 'INSTALL_PLATFORM_UNSUPPORTED'
  | 'INSTALL_LAUNCH_FAILED'
  | 'UPDATER_CONFIGURATION_ERROR'
  | 'INSTALLED_PACKAGE_INFO_ERROR'

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'upToDate'
  | 'updateAvailable'
  | 'downloading'
  | 'verifying'
  | 'readyToInstall'
  | 'installPermissionRequired'
  | 'installerLaunched'
  | 'error'

export type UpdaterRetryAction = 'check' | 'download' | 'install' | null

export interface UpdaterManifestV1 {
  schemaVersion: 1
  packageId: typeof UPDATER_PACKAGE_ID
  versionCode: number
  versionName: string
  apkUrl: string
  apkSha256: string
  apkSizeBytes: number
  publishedAt: string
  releaseNotes: string[]
}

export interface InstalledPackageInfo {
  packageId: string
  versionCode: number
  versionName: string
}

export interface UpdaterProgress {
  receivedBytes: number
  totalBytes: number
  percent: number
}

export interface UpdaterSnapshot {
  status: UpdaterStatus
  installed: InstalledPackageInfo | null
  manifest: UpdaterManifestV1 | null
  progress: UpdaterProgress | null
  errorCode: UpdaterErrorCode | null
  errorMessage: string | null
  retryAction: UpdaterRetryAction
}

export interface NativeVerificationRequest {
  selectionId: string
  apkUrl: string
  expectedSize: number
  expectedSha256: string
  expectedPackageId: typeof UPDATER_PACKAGE_ID
  expectedVersionCode: number
  installedVersionCode: number
}

export interface NativeVerificationProgress {
  stage: 'downloading' | 'verifying'
  receivedBytes: number
  totalBytes: number
}

export interface VerifiedArtifactAuthorization {
  token: string
  packageId: typeof UPDATER_PACKAGE_ID
  versionCode: number
  sizeBytes: number
  sha256: string
  signerSha256: string[]
}

export type InstallCapability = 'READY' | 'PERMISSION_REQUIRED' | 'UNSUPPORTED'

export interface UpdaterPorts {
  getInstalledPackageInfo(): Promise<InstalledPackageInfo>
  fetchManifest(url: string): Promise<string>
  invalidateSelection(): Promise<void>
  downloadAndVerify(
    request: NativeVerificationRequest,
    onProgress: (progress: NativeVerificationProgress) => void
  ): Promise<VerifiedArtifactAuthorization>
  cancelDownload(): Promise<void>
  getInstallCapability(): Promise<InstallCapability>
  openInstallSettings(): Promise<void>
  installVerifiedArtifact(token: string): Promise<void>
}

const REQUIRED_MANIFEST_FIELDS = [
  'schemaVersion',
  'packageId',
  'versionCode',
  'versionName',
  'apkUrl',
  'apkSha256',
  'apkSizeBytes',
  'publishedAt',
  'releaseNotes'
] as const

const UPDATER_ERROR_MESSAGES: Record<UpdaterErrorCode, string> = {
  MANIFEST_NETWORK_ERROR: '暂时无法获取更新信息，请稍后重试。',
  MANIFEST_INVALID: '更新信息格式无效，未提供安装。',
  MANIFEST_UNSUPPORTED_SCHEMA: '此更新信息需要更高版本的应用支持。',
  PACKAGE_ID_MISMATCH: '更新包与当前应用不匹配。',
  NO_UPDATE: '当前已经是最新版本。',
  MANIFEST_OLDER_THAN_INSTALLED: '服务器没有比当前版本更新的安装包。',
  DOWNLOAD_NETWORK_ERROR: '更新包下载失败，请重新下载。',
  DOWNLOAD_SIZE_MISMATCH: '更新包大小校验失败，请重新下载。',
  APK_SHA256_MISMATCH: '更新包完整性校验失败，不能安装。',
  APK_PACKAGE_MISMATCH: '更新包不属于当前应用，不能安装。',
  APK_VERSION_MISMATCH: '更新包版本与更新信息不一致。',
  APK_DOWNGRADE_REJECTED: '不能安装相同或更旧的版本。',
  APK_SIGNER_MISMATCH: '更新包签名与永久信任身份不一致。',
  APK_ARCHIVE_INVALID: '下载的文件不是有效的 Android 安装包。',
  APK_SIGNER_INSPECTION_UNAVAILABLE: '无法确认更新包的当前签名，不能安装。',
  INSTALL_PERMISSION_REQUIRED: '需要在 Android 系统设置中允许此应用安装更新。',
  INSTALL_PLATFORM_UNSUPPORTED: '此 Android 设备无法使用受支持的系统安装流程。',
  INSTALL_LAUNCH_FAILED: '无法打开 Android 系统安装器，请稍后重试。',
  UPDATER_CONFIGURATION_ERROR: '更新服务尚未配置，其他功能仍可正常使用。',
  INSTALLED_PACKAGE_INFO_ERROR: '无法读取当前安装版本，已停止更新检查。'
}

export class UpdaterFailure extends Error {
  constructor(readonly code: UpdaterErrorCode) {
    super(UPDATER_ERROR_MESSAGES[code])
    this.name = 'UpdaterFailure'
  }
}

export function sanitizedUpdaterMessage(code: UpdaterErrorCode): string {
  return UPDATER_ERROR_MESSAGES[code]
}

class StrictJsonParser {
  private index = 0

  constructor(private readonly source: string) {}

  parse(): unknown {
    this.skipWhitespace()
    const result = this.parseValue()
    this.skipWhitespace()
    if (this.index !== this.source.length) this.fail()
    return result
  }

  private parseValue(): unknown {
    this.skipWhitespace()
    const char = this.source[this.index]
    if (char === '{') return this.parseObject()
    if (char === '[') return this.parseArray()
    if (char === '"') return this.parseString()
    if (char === '-' || (char >= '0' && char <= '9')) return this.parseNumber()
    if (this.source.startsWith('true', this.index)) return this.consumeLiteral('true', true)
    if (this.source.startsWith('false', this.index)) return this.consumeLiteral('false', false)
    if (this.source.startsWith('null', this.index)) return this.consumeLiteral('null', null)
    this.fail()
  }

  private parseObject(): Record<string, unknown> {
    this.index += 1
    this.skipWhitespace()
    const result: Record<string, unknown> = {}
    const keys = new Set<string>()
    if (this.source[this.index] === '}') {
      this.index += 1
      return result
    }
    while (this.index < this.source.length) {
      if (this.source[this.index] !== '"') this.fail()
      const key = this.parseString()
      if (keys.has(key)) throw new UpdaterFailure('MANIFEST_INVALID')
      keys.add(key)
      this.skipWhitespace()
      if (this.source[this.index] !== ':') this.fail()
      this.index += 1
      result[key] = this.parseValue()
      this.skipWhitespace()
      const separator = this.source[this.index]
      if (separator === '}') {
        this.index += 1
        return result
      }
      if (separator !== ',') this.fail()
      this.index += 1
      this.skipWhitespace()
    }
    this.fail()
  }

  private parseArray(): unknown[] {
    this.index += 1
    this.skipWhitespace()
    const result: unknown[] = []
    if (this.source[this.index] === ']') {
      this.index += 1
      return result
    }
    while (this.index < this.source.length) {
      result.push(this.parseValue())
      this.skipWhitespace()
      const separator = this.source[this.index]
      if (separator === ']') {
        this.index += 1
        return result
      }
      if (separator !== ',') this.fail()
      this.index += 1
      this.skipWhitespace()
    }
    this.fail()
  }

  private parseString(): string {
    const start = this.index
    this.index += 1
    let escaped = false
    while (this.index < this.source.length) {
      const char = this.source[this.index]
      if (escaped) {
        escaped = false
        this.index += 1
        continue
      }
      if (char === '\\') {
        escaped = true
        this.index += 1
        continue
      }
      if (char === '"') {
        this.index += 1
        try {
          return JSON.parse(this.source.slice(start, this.index)) as string
        } catch {
          this.fail()
        }
      }
      if (char.charCodeAt(0) < 0x20) this.fail()
      this.index += 1
    }
    this.fail()
  }

  private parseNumber(): number {
    const match = this.source.slice(this.index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)
    if (!match) this.fail()
    this.index += match[0].length
    const value = Number(match[0])
    if (!Number.isFinite(value)) this.fail()
    return value
  }

  private consumeLiteral<T>(literal: string, value: T): T {
    this.index += literal.length
    return value
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.source[this.index] ?? '')) this.index += 1
  }

  private fail(): never {
    throw new UpdaterFailure('MANIFEST_INVALID')
  }
}

export function normalizeSha256(value: string): string {
  return value.toUpperCase()
}

export function normalizeReleaseNotes(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 50) throw new UpdaterFailure('MANIFEST_INVALID')
  return value.map((note) => {
    if (typeof note !== 'string') throw new UpdaterFailure('MANIFEST_INVALID')
    const normalized = note.trim()
    if (!normalized || normalized.length > 2_000) throw new UpdaterFailure('MANIFEST_INVALID')
    return normalized
  })
}

export function validateUpdaterHttpsUrl(value: string): string {
  if (typeof value !== 'string' || !value || value.length > 2_048) {
    throw new UpdaterFailure('MANIFEST_INVALID')
  }
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) {
      throw new UpdaterFailure('MANIFEST_INVALID')
    }
    return url.toString()
  } catch (error) {
    if (error instanceof UpdaterFailure) throw error
    throw new UpdaterFailure('MANIFEST_INVALID')
  }
}

export function validateManifestEndpoint(value: string): string {
  try {
    return validateUpdaterHttpsUrl(value.trim())
  } catch {
    throw new UpdaterFailure('UPDATER_CONFIGURATION_ERROR')
  }
}

export function parseUpdaterManifest(source: string): UpdaterManifestV1 {
  let parsed: unknown
  try {
    parsed = new StrictJsonParser(source).parse()
  } catch (error) {
    if (error instanceof UpdaterFailure) throw error
    throw new UpdaterFailure('MANIFEST_INVALID')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new UpdaterFailure('MANIFEST_INVALID')
  }
  const object = parsed as Record<string, unknown>
  if (object.schemaVersion !== UPDATER_SCHEMA_VERSION) {
    throw new UpdaterFailure('MANIFEST_UNSUPPORTED_SCHEMA')
  }
  const keys = Object.keys(object)
  if (keys.length !== REQUIRED_MANIFEST_FIELDS.length ||
      keys.some((key) => !REQUIRED_MANIFEST_FIELDS.includes(key as typeof REQUIRED_MANIFEST_FIELDS[number])) ||
      REQUIRED_MANIFEST_FIELDS.some((key) => !(key in object))) {
    throw new UpdaterFailure('MANIFEST_INVALID')
  }
  if (object.packageId !== UPDATER_PACKAGE_ID) throw new UpdaterFailure('PACKAGE_ID_MISMATCH')
  if (!Number.isSafeInteger(object.versionCode) || Number(object.versionCode) < 1 || Number(object.versionCode) > 2_100_000_000) {
    throw new UpdaterFailure('MANIFEST_INVALID')
  }
  if (typeof object.versionName !== 'string') throw new UpdaterFailure('MANIFEST_INVALID')
  const versionName = object.versionName.trim()
  if (!versionName || versionName.length > 64) throw new UpdaterFailure('MANIFEST_INVALID')
  if (typeof object.apkUrl !== 'string') throw new UpdaterFailure('MANIFEST_INVALID')
  const apkUrl = validateUpdaterHttpsUrl(object.apkUrl)
  if (typeof object.apkSha256 !== 'string' || !/^[A-Fa-f0-9]{64}$/.test(object.apkSha256)) {
    throw new UpdaterFailure('MANIFEST_INVALID')
  }
  if (!Number.isSafeInteger(object.apkSizeBytes) || Number(object.apkSizeBytes) < 1 || Number(object.apkSizeBytes) > UPDATER_APK_MAX_BYTES) {
    throw new UpdaterFailure('MANIFEST_INVALID')
  }
  if (typeof object.publishedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(object.publishedAt) ||
      !Number.isFinite(Date.parse(object.publishedAt))) {
    throw new UpdaterFailure('MANIFEST_INVALID')
  }
  return {
    schemaVersion: 1,
    packageId: UPDATER_PACKAGE_ID,
    versionCode: Number(object.versionCode),
    versionName,
    apkUrl,
    apkSha256: normalizeSha256(object.apkSha256),
    apkSizeBytes: Number(object.apkSizeBytes),
    publishedAt: object.publishedAt,
    releaseNotes: normalizeReleaseNotes(object.releaseNotes)
  }
}

export function decideUpdaterVersion(
  installedVersionCode: number,
  manifestVersionCode: number
): 'UPDATE_AVAILABLE' | 'NO_UPDATE' | 'MANIFEST_OLDER_THAN_INSTALLED' {
  if (!Number.isSafeInteger(installedVersionCode) || installedVersionCode < 1) {
    throw new UpdaterFailure('INSTALLED_PACKAGE_INFO_ERROR')
  }
  if (manifestVersionCode > installedVersionCode) return 'UPDATE_AVAILABLE'
  if (manifestVersionCode === installedVersionCode) return 'NO_UPDATE'
  return 'MANIFEST_OLDER_THAN_INSTALLED'
}

const ALLOWED_TRANSITIONS: Record<UpdaterStatus, ReadonlySet<UpdaterStatus>> = {
  idle: new Set(['idle', 'checking', 'error']),
  checking: new Set(['upToDate', 'updateAvailable', 'error']),
  upToDate: new Set(['checking', 'error']),
  updateAvailable: new Set(['checking', 'downloading', 'error']),
  downloading: new Set(['updateAvailable', 'verifying', 'error']),
  verifying: new Set(['readyToInstall', 'error']),
  readyToInstall: new Set(['checking', 'installPermissionRequired', 'installerLaunched', 'error']),
  installPermissionRequired: new Set(['checking', 'readyToInstall', 'error']),
  installerLaunched: new Set(['idle', 'checking', 'error']),
  error: new Set(['checking', 'updateAvailable', 'readyToInstall', 'error'])
}

export class UpdaterController {
  private state: UpdaterSnapshot = {
    status: 'idle',
    installed: null,
    manifest: null,
    progress: null,
    errorCode: null,
    errorMessage: null,
    retryAction: null
  }
  private readonly listeners = new Set<() => void>()
  private verified: VerifiedArtifactAuthorization | null = null
  private selectionSequence = 0
  private downloadOperationSequence = 0

  constructor(
    private readonly manifestEndpoint: string,
    private readonly ports: UpdaterPorts
  ) {}

  get snapshot(): UpdaterSnapshot {
    return {
      ...this.state,
      installed: this.state.installed ? { ...this.state.installed } : null,
      manifest: this.state.manifest ? { ...this.state.manifest, releaseNotes: [...this.state.manifest.releaseNotes] } : null,
      progress: this.state.progress ? { ...this.state.progress } : null
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async initialize(): Promise<void> {
    try {
      const installed = await this.readInstalledPackageInfo()
      this.patch({ installed })
    } catch (error) {
      this.fail(error, null)
    }
  }

  async check(): Promise<void> {
    if (this.state.status === 'downloading' || this.state.status === 'verifying') return
    try {
      await this.ports.invalidateSelection()
      this.verified = null
      this.transition('checking', {
        manifest: null,
        progress: null,
        errorCode: null,
        errorMessage: null,
        retryAction: null
      })
      const endpoint = validateManifestEndpoint(this.manifestEndpoint)
      const installed = await this.readInstalledPackageInfo()
      this.patch({ installed })
      const manifest = parseUpdaterManifest(await this.ports.fetchManifest(endpoint))
      const decision = decideUpdaterVersion(installed.versionCode, manifest.versionCode)
      if (decision === 'UPDATE_AVAILABLE') {
        this.transition('updateAvailable', { manifest })
      } else {
        this.transition('upToDate', {
          manifest,
          errorCode: decision,
          errorMessage: sanitizedUpdaterMessage(decision)
        })
      }
    } catch (error) {
      this.fail(error, 'check')
    }
  }

  async download(): Promise<void> {
    const manifest = this.state.manifest
    const installed = this.state.installed
    if (!manifest || !installed || this.state.status !== 'updateAvailable') return
    const selectionId = `${manifest.versionCode}:${++this.selectionSequence}`
    const operation = ++this.downloadOperationSequence
    try {
      await this.ports.invalidateSelection()
      this.verified = null
      this.transition('downloading', {
        progress: { receivedBytes: 0, totalBytes: manifest.apkSizeBytes, percent: 0 },
        errorCode: null,
        errorMessage: null,
        retryAction: null
      })
      const verified = await this.ports.downloadAndVerify({
        selectionId,
        apkUrl: manifest.apkUrl,
        expectedSize: manifest.apkSizeBytes,
        expectedSha256: manifest.apkSha256,
        expectedPackageId: UPDATER_PACKAGE_ID,
        expectedVersionCode: manifest.versionCode,
        installedVersionCode: installed.versionCode
      }, (progress) => this.applyProgress(progress))
      if (operation !== this.downloadOperationSequence) return
      if (verified.packageId !== UPDATER_PACKAGE_ID || verified.versionCode !== manifest.versionCode) {
        throw new UpdaterFailure('APK_VERSION_MISMATCH')
      }
      this.verified = verified
      if ((this.state.status as UpdaterStatus) === 'downloading') this.transition('verifying')
      this.transition('readyToInstall', {
        progress: null,
        errorCode: null,
        errorMessage: null,
        retryAction: null
      })
    } catch (error) {
      if (operation !== this.downloadOperationSequence) return
      this.verified = null
      this.fail(error, 'download')
    }
  }

  async cancelDownload(): Promise<void> {
    if (this.state.status !== 'downloading') return
    this.downloadOperationSequence += 1
    await this.ports.cancelDownload()
    await this.ports.invalidateSelection()
    this.verified = null
    this.transition('updateAvailable', {
      progress: null,
      errorCode: null,
      errorMessage: null,
      retryAction: null
    })
  }

  async install(): Promise<void> {
    if (this.state.status !== 'readyToInstall' || !this.verified) return
    try {
      const capability = await this.ports.getInstallCapability()
      if (capability === 'PERMISSION_REQUIRED') {
        this.transition('installPermissionRequired', {
          errorCode: 'INSTALL_PERMISSION_REQUIRED',
          errorMessage: sanitizedUpdaterMessage('INSTALL_PERMISSION_REQUIRED')
        })
        return
      }
      if (capability === 'UNSUPPORTED') throw new UpdaterFailure('INSTALL_PLATFORM_UNSUPPORTED')
      await this.ports.installVerifiedArtifact(this.verified.token)
      this.verified = null
      this.transition('installerLaunched', {
        errorCode: null,
        errorMessage: null,
        retryAction: null
      })
    } catch (error) {
      await this.failInstall(error)
    }
  }

  async openInstallSettings(): Promise<void> {
    if (this.state.status !== 'installPermissionRequired') return
    try {
      await this.ports.openInstallSettings()
    } catch (error) {
      await this.failInstall(error)
    }
  }

  async refreshInstallPermission(): Promise<void> {
    if (this.state.status !== 'installPermissionRequired' || !this.verified) return
    try {
      const capability = await this.ports.getInstallCapability()
      if (capability === 'READY') {
        this.transition('readyToInstall', {
          errorCode: null,
          errorMessage: null
        })
      } else if (capability === 'UNSUPPORTED') {
        throw new UpdaterFailure('INSTALL_PLATFORM_UNSUPPORTED')
      }
    } catch (error) {
      await this.failInstall(error)
    }
  }

  async retry(): Promise<void> {
    const retry = this.state.retryAction
    if (retry === 'check') return this.check()
    if (retry === 'download' && this.state.manifest) {
      this.transition('updateAvailable')
      return this.download()
    }
    if (retry === 'install' && this.verified) {
      this.transition('readyToInstall')
      return this.install()
    }
  }

  async dispose(): Promise<void> {
    this.downloadOperationSequence += 1
    await Promise.allSettled([
      this.ports.cancelDownload(),
      this.ports.invalidateSelection()
    ])
    this.verified = null
    this.listeners.clear()
  }

  private async readInstalledPackageInfo(): Promise<InstalledPackageInfo> {
    const installed = await this.ports.getInstalledPackageInfo()
    if (installed.packageId !== UPDATER_PACKAGE_ID ||
        !Number.isSafeInteger(installed.versionCode) || installed.versionCode < 1 ||
        typeof installed.versionName !== 'string' || !installed.versionName.trim()) {
      throw new UpdaterFailure('INSTALLED_PACKAGE_INFO_ERROR')
    }
    return {
      packageId: installed.packageId,
      versionCode: installed.versionCode,
      versionName: installed.versionName.trim()
    }
  }

  private applyProgress(progress: NativeVerificationProgress): void {
    if (progress.stage === 'verifying' && this.state.status === 'downloading') {
      this.transition('verifying', { progress: null })
      return
    }
    if (progress.stage !== 'downloading' || this.state.status !== 'downloading') return
    const totalBytes = Math.max(1, progress.totalBytes)
    const receivedBytes = Math.max(0, Math.min(progress.receivedBytes, totalBytes))
    this.patch({
      progress: {
        receivedBytes,
        totalBytes,
        percent: Math.max(0, Math.min(100, receivedBytes / totalBytes * 100))
      }
    })
  }

  private fail(error: unknown, retryAction: UpdaterRetryAction): void {
    const code = error instanceof UpdaterFailure ? error.code : 'MANIFEST_NETWORK_ERROR'
    this.transition('error', {
      progress: null,
      errorCode: code,
      errorMessage: sanitizedUpdaterMessage(code),
      retryAction
    })
  }

  private async failInstall(error: unknown): Promise<void> {
    const code = error instanceof UpdaterFailure ? error.code : 'INSTALL_LAUNCH_FAILED'
    if (code === 'INSTALL_LAUNCH_FAILED') {
      this.fail(error, 'install')
      return
    }
    await this.ports.invalidateSelection().catch(() => undefined)
    this.verified = null
    this.fail(error, code === 'INSTALL_PLATFORM_UNSUPPORTED' ? null : 'download')
  }

  private patch(patch: Partial<UpdaterSnapshot>): void {
    this.state = { ...this.state, ...patch }
    this.emit()
  }

  private transition(status: UpdaterStatus, patch: Partial<UpdaterSnapshot> = {}): void {
    if (!ALLOWED_TRANSITIONS[this.state.status].has(status)) {
      throw new Error(`Illegal updater transition ${this.state.status} -> ${status}`)
    }
    this.state = { ...this.state, ...patch, status }
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

export function updaterFailureFromUnknown(error: unknown, fallback: UpdaterErrorCode): UpdaterFailure {
  if (error instanceof UpdaterFailure) return error
  if (error && typeof error === 'object') {
    const candidate = String((error as { code?: unknown }).code ?? '') as UpdaterErrorCode
    if (candidate in UPDATER_ERROR_MESSAGES) return new UpdaterFailure(candidate)
  }
  return new UpdaterFailure(fallback)
}
