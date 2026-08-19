import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  PRACTICE_RECORDS_CHANGED_EVENT,
  PRACTICE_RECORD_STORAGE_KEY,
  calculateTodayPracticeStats,
  clearPracticeRecords,
  readPracticeRecords
} from '../utils/practiceRecordStorage'
import { PRACTICE_RECORD_V2_STORAGE_KEY, practiceRecordRepository } from '../records/practiceRecordRepository'
import type { PracticeSessionRecord, TodayPracticeStats } from '../utils/practiceRecordTypes'

export interface UsePracticeHistoryResult {
  records: PracticeSessionRecord[]
  recentRecords: PracticeSessionRecord[]
  todayStats: TodayPracticeStats
  errorMessage: string
  refresh: () => void
  clearAll: () => boolean
}

export function usePracticeHistory(): UsePracticeHistoryResult {
  const [records, setRecords] = useState<PracticeSessionRecord[]>(() => readPracticeRecords())
  const [errorMessage, setErrorMessage] = useState('')

  const refresh = useCallback(() => {
    setRecords(readPracticeRecords())
  }, [])

  useEffect(() => {
    const handleStorage = (event: StorageEvent): void => {
      if (event.key === PRACTICE_RECORD_STORAGE_KEY || event.key === PRACTICE_RECORD_V2_STORAGE_KEY) refresh()
    }

    const unsubscribe = practiceRecordRepository.subscribe(refresh)
    window.addEventListener(PRACTICE_RECORDS_CHANGED_EVENT, refresh)
    window.addEventListener('storage', handleStorage)
    return () => {
      unsubscribe()
      window.removeEventListener(PRACTICE_RECORDS_CHANGED_EVENT, refresh)
      window.removeEventListener('storage', handleStorage)
    }
  }, [refresh])

  const clearAll = useCallback(() => {
    const result = clearPracticeRecords()
    setErrorMessage(result.message ?? '')
    if (result.success) setRecords([])
    return result.success
  }, [])

  const todayStats = useMemo(() => calculateTodayPracticeStats(records), [records])

  return {
    records,
    recentRecords: records.slice(0, 5),
    todayStats,
    errorMessage,
    refresh,
    clearAll
  }
}
