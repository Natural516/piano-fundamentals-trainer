import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { adaptExternalTheme, ThemeContractError, type ExternalThemeManifestV1 } from './runtimeThemeAdapter'
import { MappedThemeAssetResolver } from './themeAssetResolver'
import type { ExternalThemeDefinitionV1, RuntimeThemeDefinition, ThemePointer } from './themeTypes'

export interface InstalledThemeRecord {
  themeId: string
  version: string
  name: string
  subtitle: string
  installedAt: string
  trustKeyId: string | null
  trustLevel: string
  packageFormatVersion: number
  themeApiVersion: number
  minAppVersion: string
  maxAppVersionExclusive: string
  packageDigest: string
}

export interface ThemePackageInspection extends InstalledThemeRecord {
  transactionId: string
  signatureStatus: string
  preview: string | null
  manifestJson: string
  themeJson: string
}

type NativeResult = { status: 'ok' | 'error'; errorCode?: string }
type ThemePackagePluginApi = {
  pickThemePackage(): Promise<NativeResult & ThemePackageInspection>
  inspectThemePackage(options: { transactionId: string }): Promise<NativeResult & ThemePackageInspection>
  installThemePackage(options: { transactionId: string }): Promise<NativeResult & { theme: InstalledThemeRecord }>
  listInstalledThemes(): Promise<NativeResult & { themes: InstalledThemeRecord[] }>
  rebuildIndex(): Promise<NativeResult & { themes: InstalledThemeRecord[] }>
  loadInstalledTheme(options: { themeId: string; version: string }): Promise<NativeResult & { record: InstalledThemeRecord; manifestJson: string; themeJson: string }>
  verifyInstalledTheme(options: { themeId: string; version: string }): Promise<NativeResult & { integrity: string }>
  removeTheme(options: { themeId: string; version: string; active: boolean }): Promise<NativeResult>
  resolveThemeAsset(options: { themeId: string; version: string; relativePath: string }): Promise<NativeResult & { fileUri: string }>
  cleanupStaging(): Promise<NativeResult>
  addListener(eventName: 'themePackageProgress', listener: (event: { stage: string }) => void): Promise<PluginListenerHandle>
}

const NativeThemePackage = registerPlugin<ThemePackagePluginApi>('ThemePackage')

const POINTER_KEYS = {
  activeId: 'theme.activeThemeId', activeVersion: 'theme.activeThemeVersion',
  goodId: 'theme.lastKnownGoodThemeId', goodVersion: 'theme.lastKnownGoodThemeVersion',
  failedId: 'theme.failedThemeId', failedVersion: 'theme.failedThemeVersion', failedReason: 'theme.failedThemeReason',
  failedAt: 'theme.failedAt', failureCount: 'theme.consecutiveFailureCount', pending: 'theme.pendingActivation'
} as const

export const THEME_PACKAGE_ERRORS: Readonly<Record<string, string>> = {
  INVALID_THEME_PACKAGE: '不是有效主题包', INVALID_MANIFEST: '不是有效主题包', INVALID_THEME_SCHEMA: '主题文件损坏',
  PACKAGE_TOO_LARGE: '主题包太大', TOTAL_SIZE_EXCEEDED: '主题包解压后过大', FILE_TOO_LARGE: '主题文件过大',
  FORBIDDEN_FILE_TYPE: '主题包包含不允许的文件', UNSAFE_PATH: '主题包路径不安全', DUPLICATE_PATH: '主题包路径冲突',
  SIGNATURE_INVALID: '主题包签名无效', SIGNATURE_REQUIRED: '此版本要求主题包签名', SIGNER_NOT_TRUSTED: '主题包签名者不受信任', UNSIGNED_NOT_ALLOWED: '此版本不允许未签名主题包',
  APP_VERSION_INCOMPATIBLE: '主题版本与当前应用不兼容', THEME_VERSION_INCOMPATIBLE: '主题版本与当前应用不兼容', THEME_API_UNSUPPORTED: '主题接口版本不兼容',
  UNSUPPORTED_RECIPE: '主题使用了不支持的视觉配方', THEME_FILE_MISSING: '主题文件缺失', IMAGE_INVALID: '主题素材损坏',
  CHECKSUM_MISMATCH: '主题文件校验失败', INVALID_CHECKSUMS: '主题文件校验信息无效', ALREADY_INSTALLED: '此版本已安装',
  SAME_VERSION_DIFFERENT_PACKAGE: '同版本主题包内容不同，已拒绝覆盖', DOWNGRADE_BLOCKED: '禁止降级安装主题',
  PICKER_CANCELLED: '已取消选择', PRODUCTION_TRUST_NOT_CONFIGURED: '正式主题信任配置尚未完成',
  STORAGE_FULL: '设备空间不足', INSTALL_FAILED: '主题安装失败', THEME_LOAD_FAILED: '主题加载失败', VERIFY_FAILED: '主题验证失败'
}

function assertOk<T extends NativeResult>(result: T): T {
  if (result.status !== 'ok') throw new Error(result.errorCode ?? 'INSTALL_FAILED')
  return result
}

async function preference(key: string): Promise<string | null> { return (await Preferences.get({ key })).value }
async function setPreference(key: string, value: string): Promise<void> { await Preferences.set({ key, value }) }
async function removePreference(key: string): Promise<void> { await Preferences.remove({ key }) }

async function parseExternal(record: InstalledThemeRecord): Promise<RuntimeThemeDefinition> {
  const loaded = assertOk(await NativeThemePackage.loadInstalledTheme({ themeId: record.themeId, version: record.version }))
  const manifest = JSON.parse(loaded.manifestJson) as ExternalThemeManifestV1
  const definition = JSON.parse(loaded.themeJson) as ExternalThemeDefinitionV1
  const paths = [...new Set(Object.values(definition.capabilities).flatMap((capability) => Object.values(capability.assets)))]
  const entries = await Promise.all(paths.map(async (relativePath) => {
    const resolved = assertOk(await NativeThemePackage.resolveThemeAsset({ themeId: record.themeId, version: record.version, relativePath }))
    return [relativePath, Capacitor.convertFileSrc(resolved.fileUri)] as const
  }))
  return adaptExternalTheme(manifest, definition, new MappedThemeAssetResolver(Object.fromEntries(entries)), 'external')
}

async function preloadTheme(theme: RuntimeThemeDefinition): Promise<void> {
  const urls = new Set<string>()
  const collect = (value: unknown): void => {
    if (typeof value === 'string' && (value.includes('/_capacitor_file_') || value.startsWith('http'))) urls.add(value)
    else if (value && typeof value === 'object') Object.values(value).forEach(collect)
  }
  collect(theme.capabilities)
  for (const url of urls) {
    await new Promise<void>((resolve, reject) => {
      const image = new Image()
      image.onload = () => { image.src = ''; resolve() }
      image.onerror = () => { image.src = ''; reject(new Error('ASSET_RUNTIME_LOAD_FAILED')) }
      image.src = url
    })
  }
}

async function loadBrowserExternalThemeFromSource(): Promise<RuntimeThemeDefinition> {
  const base = new URL('/__theme_source__/bocchi/', window.location.origin)
  const [manifestResponse, themeResponse] = await Promise.all([
    fetch(new URL('manifest.json', base), { cache: 'no-store' }),
    fetch(new URL('theme.json', base), { cache: 'no-store' })
  ])
  if (!manifestResponse.ok || !themeResponse.ok) throw new Error('THEME_SOURCE_UNAVAILABLE')
  const manifest = await manifestResponse.json() as ExternalThemeManifestV1
  const definition = await themeResponse.json() as ExternalThemeDefinitionV1
  const paths = [...new Set(Object.values(definition.capabilities).flatMap((capability) => Object.values(capability.assets)))]
  const resolver = new MappedThemeAssetResolver(Object.fromEntries(paths.map((relativePath) => [relativePath, new URL(relativePath, base).href])))
  return adaptExternalTheme(manifest, definition, resolver, 'external')
}

export interface ThemeRuntimeSnapshot {
  ready: boolean
  activeTheme: RuntimeThemeDefinition | null
  installed: readonly InstalledThemeRecord[]
  inspection: ThemePackageInspection | null
  progressStage: string | null
  errorCode: string | null
  pendingActivation: boolean
}

export class ThemeRuntimeManager {
  private listeners = new Set<() => void>()
  private progressHandle: PluginListenerHandle | null = null
  private state: ThemeRuntimeSnapshot = { ready: false, activeTheme: null, installed: [], inspection: null, progressStage: null, errorCode: null, pendingActivation: false }

  constructor(private readonly fallback: RuntimeThemeDefinition, private readonly resolveBuiltIn: (id: string) => RuntimeThemeDefinition) {}
  get snapshot(): ThemeRuntimeSnapshot { return this.state }
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  private update(changes: Partial<ThemeRuntimeSnapshot>): void { this.state = { ...this.state, ...changes }; this.listeners.forEach((listener) => listener()) }

  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      const requested = new URLSearchParams(window.location.search).get('theme')
      if (import.meta.env.DEV && (requested === 'natural516.bocchi' || requested === 'bocchi-dev')) {
        try {
          const external = await loadBrowserExternalThemeFromSource()
          await preloadTheme(external)
          this.update({ ready: true, activeTheme: external })
        } catch (error) {
          this.update({ ready: true, activeTheme: this.fallback, errorCode: String(error) })
        }
        return
      }
      this.update({ ready: true, activeTheme: this.fallback })
      return
    }
    this.progressHandle = await NativeThemePackage.addListener('themePackageProgress', ({ stage }) => this.update({ progressStage: stage }))
    let attemptedId: string | null = null
    let attemptedVersion: string | null = null
    try {
      const listed = assertOk(await NativeThemePackage.listInstalledThemes()).themes ?? []
      this.update({ installed: listed })
      const activeId = await preference(POINTER_KEYS.activeId)
      const activeVersion = await preference(POINTER_KEYS.activeVersion)
      attemptedId = activeId
      attemptedVersion = activeVersion
      const failedId = await preference(POINTER_KEYS.failedId)
      const failedVersion = await preference(POINTER_KEYS.failedVersion)
      if (activeId === 'bocchi-dev') {
        const migrated = [...listed].filter((item) => item.themeId === 'natural516.bocchi').sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0]
        if (migrated) { await this.activateExternal(migrated); this.update({ ready: true }); return }
        await this.persistBuiltIn('light'); this.update({ activeTheme: this.fallback, ready: true }); return
      }
      if (activeId === 'light' || activeId === 'dark') this.update({ activeTheme: this.resolveBuiltIn(activeId), ready: true })
      else if (activeId && activeVersion && !(activeId === failedId && activeVersion === failedVersion)) {
        const record = listed.find((item) => item.themeId === activeId && item.version === activeVersion)
        if (!record) throw new Error('THEME_NOT_INSTALLED')
        const external = await parseExternal(record)
        await preloadTheme(external)
        this.update({ activeTheme: external, ready: true })
      } else this.update({ activeTheme: this.fallback, ready: true })
    } catch (error) {
      await this.recordFailure('BOOTSTRAP_FAILED', String(error), attemptedId, attemptedVersion)
      await this.persistBuiltIn('light')
      this.update({ activeTheme: this.fallback, ready: true, errorCode: 'BOOTSTRAP_FAILED' })
    }
  }

  async selectBuiltIn(id: 'light' | 'dark'): Promise<void> {
    const theme = this.resolveBuiltIn(id)
    this.update({ activeTheme: theme, pendingActivation: true, errorCode: null })
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    await this.persistBuiltIn(id)
    this.update({ pendingActivation: false })
  }

  async selectThemeId(id: string): Promise<void> {
    if (id === 'light' || id === 'dark') { await this.selectBuiltIn(id); return }
    if (id === 'bocchi-dev') {
      if (!Capacitor.isNativePlatform() && import.meta.env.DEV) {
        const external = await loadBrowserExternalThemeFromSource()
        await preloadTheme(external)
        this.update({ activeTheme: external, errorCode: null })
        return
      }
      await this.selectBuiltIn('light')
      return
    }
    const record = [...this.state.installed].filter((item) => item.themeId === id).sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0]
    if (!record) throw new Error('THEME_NOT_INSTALLED')
    await this.activateExternal(record)
  }

  async activateExternal(record: InstalledThemeRecord): Promise<void> {
    await setPreference(POINTER_KEYS.pending, JSON.stringify({ themeId: record.themeId, version: record.version }))
    this.update({ pendingActivation: true, errorCode: null })
    try {
      const external = await parseExternal(record)
      await preloadTheme(external)
      this.update({ activeTheme: external })
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(resolve, 160))))
      if (!document.getElementById('root')) throw new Error('THEME_ROOT_MISSING')
      await setPreference(POINTER_KEYS.activeId, record.themeId)
      await setPreference(POINTER_KEYS.activeVersion, record.version)
      await setPreference(POINTER_KEYS.goodId, record.themeId)
      await setPreference(POINTER_KEYS.goodVersion, record.version)
      await removePreference(POINTER_KEYS.pending)
      await this.clearFailure()
      this.update({ pendingActivation: false })
    } catch (error) {
      await this.recoverExternal('ACTIVATION_FAILED', String(error))
      throw error
    }
  }

  async inspectPackage(): Promise<ThemePackageInspection> {
    this.update({ inspection: null, progressStage: 'READING', errorCode: null })
    try {
      const inspection = assertOk(await NativeThemePackage.pickThemePackage())
      this.update({ progressStage: 'CHECKING_ASSETS' })
      const manifest = JSON.parse(inspection.manifestJson)
      const definition = JSON.parse(inspection.themeJson)
      adaptExternalTheme(manifest, definition, { resolveAsset: (_id, _version, path) => `pending://${path}` }, 'external')
      // Keep the real runtime/schema asset-check stage visible for one short
      // stable window after returning from Android's picker. Without this,
      // fast devices jump directly to confirmation before users can perceive
      // that validation is still in progress.
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 1000))
      this.update({ inspection, progressStage: 'READY_TO_INSTALL' })
      return inspection
    } catch (error) {
      const code = error instanceof ThemeContractError ? error.code : error instanceof Error ? error.message : 'INSTALL_FAILED'
      this.update({ errorCode: code, progressStage: null })
      throw error
    }
  }

  async installInspected(): Promise<InstalledThemeRecord> {
    const inspection = this.state.inspection
    if (!inspection) throw new Error('STAGING_TRANSACTION_NOT_FOUND')
    this.update({ progressStage: 'INSTALLING', errorCode: null })
    try {
      const result = assertOk(await NativeThemePackage.installThemePackage({ transactionId: inspection.transactionId }))
      const themes = assertOk(await NativeThemePackage.listInstalledThemes()).themes
      this.update({ installed: themes, inspection: null, progressStage: 'INSTALLED' })
      return result.theme
    } catch (error) {
      const code = error instanceof Error ? error.message : 'INSTALL_FAILED'
      this.update({ errorCode: code, progressStage: null })
      throw error
    }
  }

  async verify(record: InstalledThemeRecord): Promise<void> {
    assertOk(await NativeThemePackage.verifyInstalledTheme({ themeId: record.themeId, version: record.version }))
  }

  async remove(record: InstalledThemeRecord): Promise<void> {
    const active = this.state.activeTheme?.source === 'external' && this.state.activeTheme.id === record.themeId && this.state.activeTheme.version === record.version
    if (active) await this.selectBuiltIn('light')
    assertOk(await NativeThemePackage.removeTheme({ themeId: record.themeId, version: record.version, active: false }))
    const themes = assertOk(await NativeThemePackage.listInstalledThemes()).themes
    this.update({ installed: themes })
  }

  async cancelInspection(): Promise<void> {
    if (Capacitor.isNativePlatform()) assertOk(await NativeThemePackage.cleanupStaging())
    this.update({ inspection: null, progressStage: null, errorCode: null })
  }

  async recoverExternal(code: string, detail = ''): Promise<void> {
    await this.recordFailure(code, detail)
    await this.persistBuiltIn('light')
    this.update({ activeTheme: this.fallback, pendingActivation: false, errorCode: code })
  }

  private async persistBuiltIn(id: 'light' | 'dark'): Promise<void> {
    await setPreference(POINTER_KEYS.activeId, id); await setPreference(POINTER_KEYS.activeVersion, 'built-in')
    await setPreference(POINTER_KEYS.goodId, id); await setPreference(POINTER_KEYS.goodVersion, 'built-in')
    await removePreference(POINTER_KEYS.pending)
  }
  private async recordFailure(code: string, detail: string, failedId?: string | null, failedVersion?: string | null): Promise<void> {
    const current = this.state.activeTheme
    await setPreference(POINTER_KEYS.failedId, String(failedId ?? current?.id ?? 'unknown'))
    await setPreference(POINTER_KEYS.failedVersion, failedVersion ?? current?.version ?? 'unknown')
    await setPreference(POINTER_KEYS.failedReason, `${code}:${detail}`.slice(0, 500))
    await setPreference(POINTER_KEYS.failedAt, new Date().toISOString())
    const count = Number(await preference(POINTER_KEYS.failureCount) ?? '0') + 1
    await setPreference(POINTER_KEYS.failureCount, String(count))
  }
  private async clearFailure(): Promise<void> { await Promise.all(Object.values(POINTER_KEYS).filter((key) => key.includes('failed') || key.includes('Failure')).map(removePreference)) }
  async dispose(): Promise<void> { await this.progressHandle?.remove(); this.progressHandle = null }
}

export function themePointer(theme: RuntimeThemeDefinition): ThemePointer { return { themeId: String(theme.id), version: theme.version, source: theme.source } }
