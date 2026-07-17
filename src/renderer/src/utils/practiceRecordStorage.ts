import {
  PRACTICE_MODULE_NAMES,
  type PracticeMistakeSummary,
  type PracticeModule,
  type PracticeSessionRecord,
  type TodayPracticeStats
} from './practiceRecordTypes'

export const PRACTICE_RECORD_STORAGE_KEY = 'piano-trainer.practice-records.v1'
export const PRACTICE_RECORDS_CHANGED_EVENT = 'piano-trainer:practice-records-changed'
export const MAX_PRACTICE_RECORDS = 200

export interface PracticeStorageResult {
  success: boolean
  message?: string
}

const modules = new Set<PracticeModule>(['sight-reading', 'rhythm', 'scale', 'chord', 'coordination'])

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function toNonNegativeInteger(value: unknown): number {
  return Math.max(0, Math.round(toFiniteNumber(value)))
}

function toDateString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback
}

function sanitizeScalarRecord(
  value: unknown,
  allowNull: boolean
): Record<string, string | number | boolean | null> {
  if (!isObject(value)) return {}

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string | number | boolean | null] => {
      const item = entry[1]
      return typeof item === 'string' || typeof item === 'boolean' ||
        (typeof item === 'number' && Number.isFinite(item)) || (allowNull && item === null)
    })
  )
}

function sanitizeMistakes(value: unknown): PracticeMistakeSummary[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!isObject(item) || typeof item.label !== 'string') return []
    const count = toNonNegativeInteger(item.count)
    if (count <= 0) return []

    return [{
      label: item.label,
      count,
      type: typeof item.type === 'string' ? item.type : undefined
    }]
  })
}

function normalizeRecord(value: unknown, index: number): PracticeSessionRecord | null {
  if (!isObject(value) || typeof value.id !== 'string' || !modules.has(value.module as PracticeModule)) {
    console.warn(`[practice-records] 已忽略无效记录（索引 ${index}）。`)
    return null
  }

  const module = value.module as PracticeModule
  const now = new Date().toISOString()
  const startedAt = toDateString(value.startedAt, now)
  const endedAt = toDateString(value.endedAt, startedAt)
  const totalEvents = toNonNegativeInteger(value.totalEvents)
  const correctEvents = Math.min(totalEvents, toNonNegativeInteger(value.correctEvents))
  const fallbackAccuracy = totalEvents > 0 ? Math.round((correctEvents / totalEvents) * 100) : 0

  return {
    id: value.id,
    schemaVersion: 1,
    module,
    moduleName: typeof value.moduleName === 'string' ? value.moduleName : PRACTICE_MODULE_NAMES[module],
    title: typeof value.title === 'string' ? value.title : PRACTICE_MODULE_NAMES[module],
    subtitle: typeof value.subtitle === 'string' ? value.subtitle : undefined,
    startedAt,
    endedAt,
    durationMs: toNonNegativeInteger(value.durationMs),
    status: value.status === 'stopped' ? 'stopped' : 'completed',
    totalEvents,
    correctEvents,
    accuracy: Math.min(100, Math.max(0, toFiniteNumber(value.accuracy, fallbackAccuracy))),
    wrongNoteCount: toNonNegativeInteger(value.wrongNoteCount),
    missingNoteCount: toNonNegativeInteger(value.missingNoteCount),
    extraNoteCount: toNonNegativeInteger(value.extraNoteCount),
    earlyCount: toNonNegativeInteger(value.earlyCount),
    lateCount: toNonNegativeInteger(value.lateCount),
    restErrorCount: toNonNegativeInteger(value.restErrorCount),
    syncWarningCount: toNonNegativeInteger(value.syncWarningCount),
    averageOffsetMs: typeof value.averageOffsetMs === 'number' && Number.isFinite(value.averageOffsetMs)
      ? Math.round(value.averageOffsetMs)
      : undefined,
    settings: sanitizeScalarRecord(value.settings, false) as Record<string, string | number | boolean>,
    details: sanitizeScalarRecord(value.details, true),
    mistakes: sanitizeMistakes(value.mistakes)
  }
}

function sortNewestFirst(records: PracticeSessionRecord[]): PracticeSessionRecord[] {
  return [...records].sort((left, right) => Date.parse(right.endedAt) - Date.parse(left.endedAt))
}

function notifyRecordsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PRACTICE_RECORDS_CHANGED_EVENT))
  }
}

export function readPracticeRecords(): PracticeSessionRecord[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = window.localStorage.getItem(PRACTICE_RECORD_STORAGE_KEY)
    if (!stored) return []

    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) {
      console.warn('[practice-records] 本地记录不是数组，已返回空记录。')
      return []
    }

    return sortNewestFirst(
      parsed.flatMap((record, index) => {
        const normalized = normalizeRecord(record, index)
        return normalized ? [normalized] : []
      })
    ).slice(0, MAX_PRACTICE_RECORDS)
  } catch (error) {
    console.warn('[practice-records] 读取本地练习记录失败，已返回空记录。', error)
    return []
  }
}

export function savePracticeRecord(record: PracticeSessionRecord): PracticeStorageResult {
  if (typeof window === 'undefined') return { success: false, message: '当前环境无法保存练习记录。' }

  try {
    const records = readPracticeRecords()
    if (records.some((candidate) => candidate.id === record.id)) return { success: true }

    const nextRecords = sortNewestFirst([record, ...records]).slice(0, MAX_PRACTICE_RECORDS)
    window.localStorage.setItem(PRACTICE_RECORD_STORAGE_KEY, JSON.stringify(nextRecords))
    notifyRecordsChanged()
    return { success: true }
  } catch (error) {
    console.warn('[practice-records] 保存练习记录失败。', error)
    return { success: false, message: '练习已完成，但记录保存失败，请检查本地存储权限。' }
  }
}

export function clearPracticeRecords(): PracticeStorageResult {
  if (typeof window === 'undefined') return { success: false, message: '当前环境无法清空练习记录。' }

  try {
    window.localStorage.removeItem(PRACTICE_RECORD_STORAGE_KEY)
    notifyRecordsChanged()
    return { success: true }
  } catch (error) {
    console.warn('[practice-records] 清空练习记录失败。', error)
    return { success: false, message: '无法清空本地练习记录，请检查本地存储权限。' }
  }
}

export function isLocalToday(dateString: string, now = new Date()): boolean {
  const date = new Date(dateString)
  if (!Number.isFinite(date.getTime())) return false

  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
}

export function calculateTodayPracticeStats(records: PracticeSessionRecord[], now = new Date()): TodayPracticeStats {
  const todayRecords = records.filter((record) => record.status === 'completed' && isLocalToday(record.endedAt, now))
  const durationMs = todayRecords.reduce((sum, record) => sum + record.durationMs, 0)
  const totalEvents = todayRecords.reduce((sum, record) => sum + record.totalEvents, 0)
  const correctEvents = todayRecords.reduce((sum, record) => sum + record.correctEvents, 0)

  return {
    durationMs,
    completedSessions: todayRecords.length,
    totalEvents,
    correctEvents,
    accuracy: totalEvents > 0 ? Math.round((correctEvents / totalEvents) * 100) : 0
  }
}

export function formatPracticeDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  if (totalSeconds < 60) return `${totalSeconds} 秒`

  const totalMinutes = Math.floor(totalSeconds / 60)
  if (totalMinutes < 60) return `${totalMinutes} 分钟`

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`
}

export function formatPracticeDateTime(dateString: string): string {
  const date = new Date(dateString)
  if (!Number.isFinite(date.getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function formatRelativePracticeTime(dateString: string, now = Date.now()): string {
  const timestamp = Date.parse(dateString)
  if (!Number.isFinite(timestamp)) return '时间未知'
  const diffSeconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (diffSeconds < 60) return '刚刚'
  const minutes = Math.floor(diffSeconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

