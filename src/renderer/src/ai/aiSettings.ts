import type { AiProviderConfig, AiSettingsState } from './aiTypes'

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
    const raw = storage.getItem('ai-settings.v1')
    if (!raw) return createDefaultAiSettings()
    return sanitizeAiSettings(JSON.parse(raw))
  } catch {
    return createDefaultAiSettings()
  }
}

export function writeAiSettings(state: AiSettingsState, storage: Pick<Storage, 'setItem'> = window.localStorage): boolean {
  try {
    storage.setItem('ai-settings.v1', JSON.stringify(sanitizeAiSettings(state)))
    return true
  } catch {
    return false
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
