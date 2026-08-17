import { toSafeAiSettingsExport } from '../ai/aiSettings'
import { PRACTICE_RECORD_STORAGE_KEY } from '../utils/practiceRecordStorage'
import { CURRICULUM_PROGRESS_STORAGE_KEY } from '../curriculum/curriculumProgress'
import { PRACTICE_SEGMENT_STORAGE_KEY } from '../score/practiceSegment'
import { SCORE_IMPORT_STORAGE_KEY } from '../score/scoreImportRepository'
import { PLAN_V2_STORAGE_KEY } from '../plan/planV2'
import { PIANO_AUDIO_MODE_STORAGE_KEY, PIANO_VOLUME_STORAGE_KEY } from '../audio/audioModeSettings'
import { PRACTICE_RECORD_V2_MIGRATION_KEY, PRACTICE_RECORD_V2_STORAGE_KEY } from '../records/practiceRecordRepository'
import { DAILY_PLAN_V2_STORAGE_KEY, PLANNER_PREFERENCES_STORAGE_KEY } from '../plan/dailyPlanV2Storage'
import { TRAINING_PLAN_STORAGE_KEY } from '../utils/trainingPlanStorage'
import { SIGHT_READING_SETTINGS_STORAGE_KEY } from '../utils/sightReadingSettings'
import { DISPLAY_PREFERENCES_STORAGE_KEY, DISPLAY_PREFERENCES_STORAGE_KEYS } from '../utils/displayPreferences'
import { THEME_STORAGE_KEY } from '../utils/themeStorage'
import { AI_SETTINGS_STORAGE_KEY } from '../ai/aiTypes'
import { FIRST_RUN_STORAGE_KEY } from './firstRun'

export interface BackupDocument {
  schemaVersion: 1
  appVersion: string
  createdAt: string
  data: Record<string, string>
  includedKeys: string[]
}

export const BACKUP_MIME_TYPE = 'application/json'

/**
 * Builds a unified backup. The AI API key is deliberately excluded from the
 * export (only a "configured" flag is kept).
 */
export function buildBackup(state: Record<string, string>, appVersion: string, now = new Date()): BackupDocument {
  const safeState: Record<string, string> = {}

  for (const [key, value] of Object.entries(state)) {
    if (key === AI_SETTINGS_STORAGE_KEY) {
      const parsed = JSON.parse(value) as { config?: { apiKey?: string } }
      if (parsed.config?.apiKey) {
        safeState[key] = JSON.stringify({
          ...parsed,
          config: { ...parsed.config, apiKey: '' },
          apiKeyExported: false
        })
        continue
      }
    }
    safeState[key] = value
  }

  return {
    schemaVersion: 1,
    appVersion,
    createdAt: now.toISOString(),
    data: safeState,
    includedKeys: Object.keys(safeState)
  }
}

export function validateBackup(value: unknown): value is BackupDocument {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<BackupDocument>
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.appVersion === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.data === 'object' &&
    candidate.data !== null &&
    Object.values(candidate.data).every((entry) => typeof entry === 'string') &&
    (candidate.includedKeys === undefined || Array.isArray(candidate.includedKeys))
  )
}

export function collectCurrentStorageState(storage: Pick<Storage, 'getItem'> = window.localStorage): Record<string, string> {
  const keys = [
    PRACTICE_RECORD_STORAGE_KEY,
    CURRICULUM_PROGRESS_STORAGE_KEY,
    PRACTICE_SEGMENT_STORAGE_KEY,
    SCORE_IMPORT_STORAGE_KEY,
    PLAN_V2_STORAGE_KEY,
    PIANO_AUDIO_MODE_STORAGE_KEY,
    PIANO_VOLUME_STORAGE_KEY,
    DISPLAY_PREFERENCES_STORAGE_KEY,
    ...Object.values(DISPLAY_PREFERENCES_STORAGE_KEYS),
    TRAINING_PLAN_STORAGE_KEY,
    SIGHT_READING_SETTINGS_STORAGE_KEY,
    THEME_STORAGE_KEY,
    AI_SETTINGS_STORAGE_KEY,
    FIRST_RUN_STORAGE_KEY,
    PRACTICE_RECORD_V2_STORAGE_KEY,
    PRACTICE_RECORD_V2_MIGRATION_KEY,
    DAILY_PLAN_V2_STORAGE_KEY,
    PLANNER_PREFERENCES_STORAGE_KEY
  ]
  const state: Record<string, string> = {}

  for (const key of keys) {
    try {
      const value = storage.getItem(key)
      if (value !== null) state[key] = value
    } catch {
      // Skip unreadable keys.
    }
  }

  return state
}

/**
 * Restores a validated backup. Invalid input is rejected without touching
 * existing data; a valid backup only overwrites the keys it contains.
 */
export function restoreFromBackup(
  backup: unknown,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = window.localStorage
): { ok: boolean; message: string; restoredKeys: string[]; rollbackComplete: boolean; failedKeys: string[] } {
  if (!validateBackup(backup)) {
    return { ok: false, message: '备份结构无效，未修改任何现有数据', restoredKeys: [], rollbackComplete: true, failedKeys: [] }
  }

  const restoredKeys: string[] = []
  const previousValues = new Map<string, string | null>()
  for (const key of Object.keys(backup.data)) {
    try {
      previousValues.set(key, storage.getItem(key))
    } catch {
      previousValues.set(key, null)
    }
  }

  try {
    for (const [key, value] of Object.entries(backup.data)) {
      storage.setItem(key, value)
      restoredKeys.push(key)
    }
  } catch {
    // Rollback: restore the previous values (best effort).
    const failedKeys: string[] = []
    for (const [key, previous] of previousValues) {
      try {
        if (previous === null) storage.removeItem(key)
        else storage.setItem(key, previous)
      } catch {
        failedKeys.push(key)
      }
    }
    return {
      ok: false,
      message: failedKeys.length === 0 ? '恢复写入失败，已完整回滚' : '恢复写入失败，回滚不完整',
      restoredKeys,
      rollbackComplete: failedKeys.length === 0,
      failedKeys
    }
  }

  return { ok: true, message: `已恢复 ${restoredKeys.length} 项数据`, restoredKeys, rollbackComplete: true, failedKeys: [] }
}

export function exportBackupToFile(backup: BackupDocument): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: BACKUP_MIME_TYPE })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `piano-backup-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export { toSafeAiSettingsExport }
