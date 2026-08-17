import type { PracticeRecordV2 } from './practiceRecordV2'
import { fromLegacyRecord, parsePracticeRecordV2 } from './practiceRecordV2'
import type { PracticeSessionRecord } from '../utils/practiceRecordTypes'
import type { StorageAdapter } from '../platform/adapters'

export const PRACTICE_RECORD_V2_STORAGE_KEY = 'piano-trainer.practice-records.v2'
export const PRACTICE_RECORD_V2_MIGRATION_KEY = 'piano-trainer.practice-records.v2.migration'
export const PRACTICE_RECORD_V2_MIGRATION_VERSION = 1
const MAX_RECORDS = 2000

type RepositoryListener = () => void

export interface PracticeRecordRepository {
  add: (record: PracticeRecordV2) => boolean
  list: () => PracticeRecordV2[]
  get: (id: string) => PracticeRecordV2 | null
  migrateLegacy: (legacyRecords: PracticeSessionRecord[]) => number
  clear: () => boolean
  version: () => number
  exportJson: () => string
  importJson: (json: string) => { ok: boolean; imported: number }
  subscribe: (listener: RepositoryListener) => () => void
}

export function createPracticeRecordRepository(storage: StorageAdapter): PracticeRecordRepository {
  const listeners = new Set<RepositoryListener>()
  let version = 0

  const notify = (): void => {
    version += 1
    for (const listener of listeners) {
      try {
        listener()
      } catch {
        // Listener errors must not break storage.
      }
    }
  }

  const readAll = (): PracticeRecordV2[] => {
    try {
      const raw = storage.getItem(PRACTICE_RECORD_V2_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as unknown[]
      if (!Array.isArray(parsed)) return []
      return parsed
        .map((entry) => parsePracticeRecordV2(JSON.stringify(entry)))
        .filter((record): record is PracticeRecordV2 => record !== null)
    } catch {
      return []
    }
  }

  const writeAll = (records: PracticeRecordV2[]): boolean => {
    try {
      storage.setItem(PRACTICE_RECORD_V2_STORAGE_KEY, JSON.stringify(records))
      notify()
      return true
    } catch {
      return false
    }
  }

  const add = (record: PracticeRecordV2): boolean => {
    const current = readAll()
    const next = [record, ...current.filter((entry) => entry.id !== record.id)].slice(0, MAX_RECORDS)
    return writeAll(next)
  }

  return {
    add,
    list: readAll,
    get(id) {
      return readAll().find((record) => record.id === id) ?? null
    },
    migrateLegacy(legacyRecords) {
      let marker: string | null = null
      try {
        marker = storage.getItem(PRACTICE_RECORD_V2_MIGRATION_KEY)
      } catch {
        // A failed marker read must not crash startup or discard legacy data.
      }
      if (marker === String(PRACTICE_RECORD_V2_MIGRATION_VERSION)) return 0
      const existingIds = new Set(readAll().map((record) => record.id))
      let migrated = 0
      let migrationFailed = false
      for (const legacy of legacyRecords) {
        if (existingIds.has(legacy.id)) continue
        if (add(fromLegacyRecord(legacy))) {
          existingIds.add(legacy.id)
          migrated += 1
        } else {
          migrationFailed = true
        }
      }
      if (!migrationFailed) {
        try {
          storage.setItem(PRACTICE_RECORD_V2_MIGRATION_KEY, String(PRACTICE_RECORD_V2_MIGRATION_VERSION))
        } catch {
          // Records remain intact and migration stays retryable if marker write fails.
        }
      }
      return migrated
    },
    clear() {
      try {
        storage.removeItem(PRACTICE_RECORD_V2_STORAGE_KEY)
        storage.removeItem(PRACTICE_RECORD_V2_MIGRATION_KEY)
        notify()
        return true
      } catch {
        return false
      }
    },
    version: () => version,
    exportJson() {
      return JSON.stringify({
        schemaVersion: 2,
        storageKey: PRACTICE_RECORD_V2_STORAGE_KEY,
        exportedAt: new Date().toISOString(),
        records: readAll()
      }, null, 2)
    },
    importJson(json) {
      try {
        const parsed = JSON.parse(json) as { records?: unknown[] }
        if (!Array.isArray(parsed.records)) return { ok: false, imported: 0 }
        let imported = 0
        for (const entry of parsed.records) {
          const record = parsePracticeRecordV2(JSON.stringify(entry))
          if (record && add(record)) imported += 1
        }
        return { ok: true, imported }
      } catch {
        return { ok: false, imported: 0 }
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

const browserStorage: StorageAdapter = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key)
}

export const practiceRecordRepository = createPracticeRecordRepository(browserStorage)
