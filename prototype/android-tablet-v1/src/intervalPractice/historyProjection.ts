import type { IntervalPracticeReportV1 } from './report'

export interface IntervalHistoryItem {
  readonly module: 'interval'
  readonly recordId: string
  readonly endedAt: number
  readonly completionStatus: IntervalPracticeReportV1['completionStatus']
  readonly statusLabel: '已完成' | '提前结束'
  readonly modeSummary: '音程练习'
  readonly completedQuestions: number
  readonly configuredQuestionCount: number | null
  readonly firstTryAccuracy: number | null
  readonly retriedCorrectCount: number
  readonly totalWrongAttempts: number
}

export function projectIntervalHistory(records: readonly IntervalPracticeReportV1[]): readonly IntervalHistoryItem[] {
  const unique = new Map<string, IntervalPracticeReportV1>()
  for (const record of records) if (!unique.has(record.recordId)) unique.set(record.recordId, record)
  return Object.freeze([...unique.values()]
    .sort((left, right) => right.finishedAtEpochMs - left.finishedAtEpochMs || left.recordId.localeCompare(right.recordId))
    .map((record) => Object.freeze({
      module: 'interval' as const,
      recordId: record.recordId,
      endedAt: record.finishedAtEpochMs,
      completionStatus: record.completionStatus,
      statusLabel: record.completionStatus === 'COMPLETED' ? '已完成' as const : '提前结束' as const,
      modeSummary: '音程练习' as const,
      completedQuestions: record.completedQuestions,
      configuredQuestionCount: record.settings.configuredQuestionCount,
      firstTryAccuracy: record.firstTryAccuracy,
      retriedCorrectCount: record.retriedCorrectCount,
      totalWrongAttempts: record.totalWrongAttempts
    })))
}

export function resolveIntervalReportById(records: readonly IntervalPracticeReportV1[], recordId: string | null): IntervalPracticeReportV1 | null {
  return recordId ? records.find((record) => record.recordId === recordId) ?? null : null
}
