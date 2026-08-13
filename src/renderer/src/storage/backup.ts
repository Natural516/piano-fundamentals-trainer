import { toSafeAiSettingsExport } from '../ai/aiSettings'
import { PRACTICE_RECORD_STORAGE_KEY } from '../utils/practiceRecordStorage'
import { CURRICULUM_PROGRESS_STORAGE_KEY } from '../curriculum/curriculumProgress'
import { PRACTICE_SEGMENT_STORAGE_KEY } from '../score/practiceSegment'
import { PLAN_V2_STORAGE_KEY } from '../plan/planV2'
import { PIANO_AUDIO_MODE_STORAGE_KEY, PIANO_VOLUME_STORAGE_KEY } from '../audio/audioModeSettings'

export interface BackupDocument {
  schemaVersion: 1
  appVersion: string
  createdAt: string
  data: Record<string, string>
}

export const BACKUP_MIME_TYPE = 'application/json'

/**
 * Builds a unified backup. The AI API key is deliberately excluded from the
 * export (only a "configured" flag is kept).
 */
export function buildBackup(state: Record<string, string>, appVersion: string, now = new Date()): BackupDocument {
  const safeState: Record<string, string> = {}

  for (const [key, value] of Object.entries(state)) {
    if (key === 'ai-settings.v1') {
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
    data: safeState
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
    Object.values(candidate.data).every((entry) => typeof entry === 'string')
  )
}

export function collectCurrentStorageState(storage: Pick<Storage, 'getItem'> = window.localStorage): Record<string, string> {
  const keys = [
    PRACTICE_RECORD_STORAGE_KEY,
    CURRICULUM_PROGRESS_STORAGE_KEY,
    PRACTICE_SEGMENT_STORAGE_KEY,
    PLAN_V2_STORAGE_KEY,
    PIANO_AUDIO_MODE_STORAGE_KEY,
    PIANO_VOLUME_STORAGE_KEY,
    'piano-trainer.display-preferences.v1',
    'training-plan.v1',
    'sight-reading-settings.v4',
    'theme-mode'
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
  storage: Pick<Storage, 'setItem' | 'removeItem'> = window.localStorage
): { ok: boolean; message: string; restoredKeys: string[] } {
  if (!validateBackup(backup)) {
    return { ok: false, message: '备份结构无效，未修改任何现有数据', restoredKeys: [] }
  }

  const restoredKeys: string[] = []
  try {
    for (const [key, value] of Object.entries(backup.data)) {
      storage.setItem(key, value)
      restoredKeys.push(key)
    }
  } catch {
    return { ok: false, message: '恢复写入失败，现有数据可能部分被覆盖', restoredKeys }
  }

  return { ok: true, message: `已恢复 ${restoredKeys.length} 项数据`, restoredKeys }
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
