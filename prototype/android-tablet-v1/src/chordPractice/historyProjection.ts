import { formatWrittenPitchClass, getChordSequentialKeyTonic } from '../musicTheory/chords'
import type { ChordPracticeReportV1 } from './report'

export interface ChordHistoryItem {
  readonly module: 'chord'
  readonly recordId: string
  readonly endedAt: number
  readonly completionReason: ChordPracticeReportV1['completionReason']
  readonly statusLabel: '已完成' | '中途结束'
  readonly title: string
  readonly modeSummary: string
  readonly completedQuestions: number
  readonly plannedQuestionCount: number | null
  readonly firstPassCompleteQuestions: number
  readonly firstPassCompletionRate: number
  readonly totalErrors: number
  readonly practiceDurationMs: number
}

export function formatChordModeSummary(report: ChordPracticeReportV1): string {
  return report.practiceMode === 'sequential' && report.sequentialKey
    ? `循序练习 · ${formatWrittenPitchClass(getChordSequentialKeyTonic(report.sequentialKey))} 大调`
    : '综合随机'
}

export function calculateChordCompletionRate(report: Pick<ChordPracticeReportV1, 'completedQuestions' | 'firstPassCompleteQuestions'>): number {
  return report.completedQuestions === 0
    ? 0
    : report.firstPassCompleteQuestions / report.completedQuestions * 100
}

export function projectChordHistory(records: readonly ChordPracticeReportV1[]): readonly ChordHistoryItem[] {
  const unique = new Map<string, ChordPracticeReportV1>()
  for (const record of records) if (!unique.has(record.recordId)) unique.set(record.recordId, record)
  return Object.freeze([...unique.values()]
    .sort((left, right) => right.endedAtEpochMs - left.endedAtEpochMs || left.recordId.localeCompare(right.recordId))
    .map((record): ChordHistoryItem => {
      const modeSummary = formatChordModeSummary(record)
      return Object.freeze({
        module: 'chord',
        recordId: record.recordId,
        endedAt: record.endedAtEpochMs,
        completionReason: record.completionReason,
        statusLabel: record.completionReason === 'completed' ? '已完成' : '中途结束',
        title: '和弦练习',
        modeSummary,
        completedQuestions: record.completedQuestions,
        plannedQuestionCount: record.plannedQuestionCount,
        firstPassCompleteQuestions: record.firstPassCompleteQuestions,
        firstPassCompletionRate: calculateChordCompletionRate(record),
        totalErrors: record.totalErrors,
        practiceDurationMs: record.practiceDurationMs
      })
    }))
}
