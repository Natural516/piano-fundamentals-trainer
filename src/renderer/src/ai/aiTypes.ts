export interface AiProviderConfig {
  endpoint: string
  apiKey: string
  model: string
  temperature: number
  timeoutMs: number
  maxTokens: number
}

export interface AiSettingsState {
  version: 1
  enabled: boolean
  config: AiProviderConfig
}

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AiChatResponse {
  ok: boolean
  content: string
  error?: string
}

export interface AiCoachLayers {
  facts: string[]
  interpretation: string[]
  recommendation: string[]
}

export type AiRequestKind = 'weekly-review' | 'today-plan' | 'weakness-explain' | 'plan-adjust'

export const AI_SETTINGS_STORAGE_KEY = 'ai-settings.v1'
