import type { AiProviderConfig, AiSettingsState } from './aiTypes'
import { AI_SETTINGS_STORAGE_KEY } from './aiTypes'

export interface AiSettingsStorageResult {
  success: boolean
  reason?: 'secret_write_failed' | 'metadata_write_failed'
  error?: string
}

export type AiSettingsSecurityErrorReason =
  | 'secret_bridge_unavailable'
  | 'secret_migration_failed'
  | 'secret_read_failed'
  | 'metadata_scrub_failed'

export interface AiSettingsLoadResult extends AiSettingsState {
  securityError?: {
    reason: AiSettingsSecurityErrorReason
    error: string
  }
}

interface SecretResult<T = null> {
  success: boolean
  value?: T
  configured?: boolean
  reason?: string
  error?: string
}

export interface AiSecretBridge {
  getAiApiKey: () => Promise<SecretResult<string>>
  setAiApiKey: (value: string) => Promise<SecretResult>
  deleteAiApiKey: () => Promise<SecretResult>
  hasAiApiKey: () => Promise<SecretResult>
}

function resolveSecretBridge(bridge?: AiSecretBridge): AiSecretBridge | null {
  if (bridge) return bridge
  if (typeof window === 'undefined') return null
  return window.pianoApp?.secrets ?? null
}

export function createDefaultAiSettings(): AiSettingsState {
  return {
    version: 1,
    enabled: false,
    config: {
      endpoint: '',
      apiKey: '',
      model: '',
      temperature: 0.4,
      timeoutMs: 30000,
      maxTokens: 800
    }
  }
}

export function sanitizeAiSettings(value: unknown): AiSettingsState {
  const base = createDefaultAiSettings()
  if (!value || typeof value !== 'object') return base
  const candidate = value as Partial<AiSettingsState>
  const config = candidate.config && typeof candidate.config === 'object'
    ? { ...base.config, ...candidate.config }
    : base.config

  return {
    version: 1,
    enabled: Boolean(candidate.enabled),
    config: {
      endpoint: typeof config.endpoint === 'string' ? config.endpoint : '',
      apiKey: typeof config.apiKey === 'string' ? config.apiKey : '',
      model: typeof config.model === 'string' ? config.model : '',
      temperature: Number.isFinite(config.temperature) ? Math.min(1.5, Math.max(0, config.temperature)) : 0.4,
      timeoutMs: Number.isFinite(config.timeoutMs) ? Math.min(120000, Math.max(1000, config.timeoutMs)) : 30000,
      maxTokens: Number.isFinite(config.maxTokens) ? Math.min(4000, Math.max(128, config.maxTokens)) : 800
    }
  }
}

export function readAiSettings(storage: Pick<Storage, 'getItem'> = window.localStorage): AiSettingsState {
  try {
    const raw = storage.getItem(AI_SETTINGS_STORAGE_KEY)
    if (!raw) return createDefaultAiSettings()
    const state = sanitizeAiSettings(JSON.parse(raw))
    return { ...state, config: { ...state.config, apiKey: '' } }
  } catch {
    return createDefaultAiSettings()
  }
}

export async function loadAiSettings(
  storage: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage,
  secretBridge?: AiSecretBridge
): Promise<AiSettingsLoadResult> {
  let parsed = createDefaultAiSettings()
  try {
    const raw = storage.getItem(AI_SETTINGS_STORAGE_KEY)
    if (raw) parsed = sanitizeAiSettings(JSON.parse(raw))
  } catch {
    parsed = createDefaultAiSettings()
  }
  const bridge = resolveSecretBridge(secretBridge)
  const metadata: AiSettingsState = { ...parsed, config: { ...parsed.config, apiKey: '' } }
  if (parsed.config.apiKey) {
    if (!bridge) {
      return {
        ...metadata,
        securityError: {
          reason: 'secret_bridge_unavailable',
          error: '安全凭据桥不可用，旧 API Key 尚未迁移且未被使用或删除。'
        }
      }
    }
    const migrated = await bridge.setAiApiKey(parsed.config.apiKey)
    if (!migrated.success) {
      return {
        ...metadata,
        securityError: {
          reason: 'secret_migration_failed',
          error: `旧 API Key 安全迁移失败（${migrated.error ?? migrated.reason ?? 'unknown'}），明文副本已保留但不会用于请求。`
        }
      }
    }
    try {
      storage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(metadata))
    } catch (error) {
      return {
        ...metadata,
        config: { ...metadata.config, apiKey: parsed.config.apiKey },
        securityError: {
          reason: 'metadata_scrub_failed',
          error: `API Key 已进入安全存储，但旧明文元数据清理失败：${error instanceof Error ? error.message : String(error)}`
        }
      }
    }
    return { ...metadata, config: { ...metadata.config, apiKey: parsed.config.apiKey } }
  }

  if (!bridge) {
    return {
      ...metadata,
      securityError: {
        reason: 'secret_bridge_unavailable',
        error: '安全凭据桥不可用，无法读取或保存 API Key。'
      }
    }
  }
  const stored = await bridge.getAiApiKey()
  if (!stored.success) {
    return {
      ...metadata,
      securityError: {
        reason: 'secret_read_failed',
        error: `安全凭据读取失败：${stored.error ?? stored.reason ?? 'unknown'}`
      }
    }
  }
  return {
    ...metadata,
    config: { ...metadata.config, apiKey: typeof stored.value === 'string' ? stored.value : '' }
  }
}

export async function writeAiSettings(
  state: AiSettingsState,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
  secretBridge?: AiSecretBridge
): Promise<AiSettingsStorageResult> {
  const sanitized = sanitizeAiSettings(state)
  const bridge = resolveSecretBridge(secretBridge)
  if (!bridge) {
    return {
      success: false,
      reason: 'secret_write_failed',
      error: 'secret_bridge_unavailable'
    }
  }
  const secretResult = sanitized.config.apiKey
    ? await bridge.setAiApiKey(sanitized.config.apiKey)
    : await bridge.deleteAiApiKey()
  if (!secretResult.success) {
    return {
      success: false,
      reason: 'secret_write_failed',
      error: secretResult.error ?? secretResult.reason ?? '安全凭据存储不可用'
    }
  }
  try {
    storage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify({
      ...sanitized,
      config: { ...sanitized.config, apiKey: '' }
    }))
    return { success: true }
  } catch (error) {
    return {
      success: false,
      reason: 'metadata_write_failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Backup-safe export: the API key is never included. Restore of the full
 * settings (with key) stays local-only.
 */
export function toSafeAiSettingsExport(state: AiSettingsState): Omit<AiSettingsState, 'config'> & {
  config: Omit<AiProviderConfig, 'apiKey'> & { apiKeyConfigured: boolean }
} {
  return {
    version: 1,
    enabled: state.enabled,
    config: {
      endpoint: state.config.endpoint,
      model: state.config.model,
      temperature: state.config.temperature,
      timeoutMs: state.config.timeoutMs,
      maxTokens: state.config.maxTokens,
      apiKeyConfigured: state.config.apiKey.length > 0
    }
  }
}
