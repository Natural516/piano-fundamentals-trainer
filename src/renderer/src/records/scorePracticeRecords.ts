import type { PracticeRecordV2 } from './practiceRecordV2'
import { parsePracticeRecordV2, serializePracticeRecordV2 } from './practiceRecordV2'

export const SCORE_PRACTICE_RECORD_STORAGE_KEY = 'score-practice-records.v1'
const MAX_RECORDS = 200

export function readScorePracticeRecords(storage: Pick<Storage, 'getItem'> = window.localStorage): PracticeRecordV2[] {
  try {
    const raw = storage.getItem(SCORE_PRACTICE_RECORD_STORAGE_KEY)
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

export function saveScorePracticeRecord(
  record: PracticeRecordV2,
  storage: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage
): boolean {
  try {
    const existing = readScorePracticeRecords(storage).filter((entry) => entry.id !== record.id)
    const next = [record, ...existing].slice(0, MAX_RECORDS)
    storage.setItem(SCORE_PRACTICE_RECORD_STORAGE_KEY, JSON.stringify(next))
    return true
  } catch {
    return false
  }
}

export { serializePracticeRecordV2 }
