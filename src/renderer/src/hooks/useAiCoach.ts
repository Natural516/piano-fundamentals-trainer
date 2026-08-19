import { useCallback, useEffect, useRef, useState } from 'react'
import { createOpenAiCompatibleClient } from '../ai/aiProvider'
import { loadAiSettings, readAiSettings, writeAiSettings, type AiSettingsStorageResult } from '../ai/aiSettings'
import { buildCoachMessages, parseCoachResponse, validateCoachOutput, type CoachSnapshot } from '../ai/aiCoach'
import type { AiRequestKind, AiSettingsState } from '../ai/aiTypes'

export interface UseAiCoachResult {
  settings: AiSettingsState
  setSettings: (settings: AiSettingsState) => Promise<AiSettingsStorageResult>
  testConnection: () => Promise<string>
  requestCoach: (kind: AiRequestKind, snapshot: CoachSnapshot) => Promise<{
    ok: boolean
    layers: ReturnType<typeof parseCoachResponse>
    error?: string
  }>
}

export function useAiCoach(): UseAiCoachResult {
  const [settings, setSettingsState] = useState<AiSettingsState>(() => readAiSettings())
  const settingsRef = useRef(settings)
  const clientRef = useRef<ReturnType<typeof createOpenAiCompatibleClient> | null>(null)

  useEffect(() => {
    let active = true
    void loadAiSettings().then((loaded) => {
      if (!active) return
      settingsRef.current = loaded
      setSettingsState(loaded)
      clientRef.current = null
    })
    return () => {
      active = false
    }
  }, [])

  const ensureClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = createOpenAiCompatibleClient(settingsRef.current.config)
    }
    return clientRef.current
  }, [])

  const setSettings = useCallback(async (next: AiSettingsState) => {
    const saved = await writeAiSettings(next)
    if (!saved.success) return saved
    settingsRef.current = next
    setSettingsState(next)
    clientRef.current = null
    return saved
  }, [])

  const testConnection = useCallback(async () => {
    const response = await ensureClient().chat([
      { role: 'user', content: '回复 OK' }
    ])
    return response.ok ? `连接成功：${response.content.slice(0, 40)}` : response.error ?? '连接失败'
  }, [ensureClient])

  const requestCoach = useCallback(async (kind: AiRequestKind, snapshot: CoachSnapshot) => {
    if (!settingsRef.current.enabled) {
      return { ok: false, layers: { facts: [], interpretation: [], recommendation: [] }, error: 'AI 未启用' }
    }

    const response = await ensureClient().chat(buildCoachMessages(snapshot, kind))
    if (!response.ok) {
      return { ok: false, layers: { facts: [], interpretation: [], recommendation: [] }, error: response.error }
    }

    const layers = parseCoachResponse(response.content)
    if (!validateCoachOutput(layers)) {
      return { ok: false, layers, error: 'AI 输出包含不允许的声称' }
    }
    return { ok: true, layers }
  }, [ensureClient])

  return {
    settings,
    setSettings,
    testConnection,
    requestCoach
  }
}
