import { getMajorKeySignature } from '../../../src/sightReading/musicKeySignatures'
import { STAFF_MODE_LABELS } from '../../../src/sightReading/sightReadingNotes'
import type { DurableSightReadingReport } from './androidPersistenceCore'

export interface AndroidHistoryItem {
  recordId: string
  endedAt: number
  completionState: DurableSightReadingReport['completionState']
  statusLabel: '已完成' | '提前结束'
  title: string
  settingsSummary: string
  completed: number
  plannedQuestionCount: number
  correct: number
  wrong: number
  timeout: number
  accuracy: number
  averageReactionMs: number | null
  fastestReactionMs: number | null
  slowestReactionMs: number | null
  bestStreak: number
  durationMs: number
}

export interface AndroidHistorySummary {
  totalSessions: number
  totalCompletedQuestions: number
  totalCorrect: number
  totalWrong: number
  totalTimeout: number
  overallAccuracy: number | null
  averageReactionMs: number | null
  fastestReactionMs: number | null
  slowestReactionMs: number | null
  bestStreak: number
}

export interface AndroidHistoryProjection {
  items: AndroidHistoryItem[]
  summary: AndroidHistorySummary
}

const NOTE_POOL_LABELS = {
  diatonic: '调内音',
  chromatic: '含临时变音'
} as const

function finiteMinimum(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value))
  return finite.length > 0 ? Math.min(...finite) : null
}

function finiteMaximum(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value))
  return finite.length > 0 ? Math.max(...finite) : null
}

export function projectSightReadingHistory(records: readonly DurableSightReadingReport[]): AndroidHistoryProjection {
  const uniqueRecords = new Map<string, DurableSightReadingReport>()
  for (const record of records) {
    if (!uniqueRecords.has(record.recordId)) uniqueRecords.set(record.recordId, record)
  }

  const ordered = [...uniqueRecords.values()].sort((left, right) => (
    right.endedAt - left.endedAt || left.recordId.localeCompare(right.recordId)
  ))
  const items = ordered.map((record): AndroidHistoryItem => {
    const staffLabel = STAFF_MODE_LABELS[record.settings.staffMode]
    const keyLabel = getMajorKeySignature(record.settings.keySignature).displayName
    return {
      recordId: record.recordId,
      endedAt: record.endedAt,
      completionState: record.completionState,
      statusLabel: record.completionState === 'completed' ? '已完成' : '提前结束',
      title: `${staffLabel} · ${keyLabel}`,
      settingsSummary: `${NOTE_POOL_LABELS[record.settings.notePoolMode]} · ${record.settings.noteNameVisible ? '显示音名' : '隐藏音名'}`,
      completed: record.completed,
      plannedQuestionCount: record.plannedQuestionCount,
      correct: record.correct,
      wrong: record.wrong,
      timeout: record.timeout,
      accuracy: record.accuracy,
      averageReactionMs: record.averageReactionMs,
      fastestReactionMs: record.fastestReactionMs,
      slowestReactionMs: record.slowestReactionMs,
      bestStreak: record.bestStreak,
      durationMs: record.durationMs
    }
  })

  const totalCompletedQuestions = ordered.reduce((sum, record) => sum + record.completed, 0)
  const totalCorrect = ordered.reduce((sum, record) => sum + record.correct, 0)
  const totalWrong = ordered.reduce((sum, record) => sum + record.wrong, 0)
  const totalTimeout = ordered.reduce((sum, record) => sum + record.timeout, 0)
  let reactionWeightedTotal = 0
  let reactionSampleCount = 0
  for (const record of ordered) {
    if (record.averageReactionMs === null) continue
    const recordReactionSamples = record.correct + record.wrong
    reactionWeightedTotal += record.averageReactionMs * recordReactionSamples
    reactionSampleCount += recordReactionSamples
  }

  return {
    items,
    summary: {
      totalSessions: ordered.length,
      totalCompletedQuestions,
      totalCorrect,
      totalWrong,
      totalTimeout,
      overallAccuracy: totalCompletedQuestions > 0 ? totalCorrect / totalCompletedQuestions * 100 : null,
      averageReactionMs: reactionSampleCount > 0 ? reactionWeightedTotal / reactionSampleCount : null,
      fastestReactionMs: finiteMinimum(ordered.map((record) => record.fastestReactionMs)),
      slowestReactionMs: finiteMaximum(ordered.map((record) => record.slowestReactionMs)),
      bestStreak: ordered.reduce((best, record) => Math.max(best, record.bestStreak), 0)
    }
  }
}

export function formatHistoryTimestamp(endedAt: number, now = Date.now()): string {
  const date = new Date(endedAt)
  const current = new Date(now)
  if (!Number.isFinite(endedAt) || Number.isNaN(date.getTime()) || Number.isNaN(current.getTime())) return '时间未知'

  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const currentDay = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime()
  const dayDifference = Math.round((currentDay - dateDay) / 86_400_000)
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  if (dayDifference === 0) return `今天 ${time}`
  if (dayDifference === 1) return `昨天 ${time}`
  if (date.getFullYear() === current.getFullYear()) return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${time}`
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日 ${time}`
}

export function formatHistoryDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return '—'
  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds} 秒`
  return `${minutes} 分 ${String(seconds).padStart(2, '0')} 秒`
}

export function formatHistoryPercentage(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}
