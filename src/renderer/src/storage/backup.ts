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
    PLAN_V2_STORAGE_KEY,
    PIANO_AUDIO_MODE_STORAGE_KEY,
    PIANO_VOLUME_STORAGE_KEY,
    'piano-trainer.display-preferences.v1',
    'piano-trainer.display-preferences.v2.midi-test',
    'piano-trainer.display-preferences.v2.sight-reading',
    'piano-trainer.display-preferences.v2.rhythm',
    'piano-trainer.display-preferences.v2.scales',
    'piano-trainer.display-preferences.v2.chords',
    'piano-trainer.display-preferences.v2.coordination',
    'piano-trainer.display-preferences.v2.free-practice',
    'training-plan.v1',
    'sight-reading-settings.v4',
    'piano-trainer.sight-reading-settings.v3',
    'piano-trainer.sight-reading-settings.v2',
    'piano-trainer.sight-reading-settings.v1',
    'piano-trainer.sight-reading-settings',
    'piano-trainer.theme-mode.v1',
    'ai-settings.v1',
    'piano-trainer.first-run.v1'
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
  const previousValues = new Map<string, string | null>()
  const getItem = (storage as unknown as Pick<Storage, 'getItem'>).getItem
  for (const key of Object.keys(backup.data)) {
    try {
      previousValues.set(key, getItem(key))
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
    for (const [key, previous] of previousValues) {
      try {
        if (previous === null) storage.removeItem(key)
        else storage.setItem(key, previous)
      } catch {
        // Rollback is best-effort; the backup was already rejected.
      }
    }
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
