import type { DurableSightReadingReport } from './androidPersistenceCore'
import type { ChordPracticeReportV1 } from './chordPractice/report'
import { projectChordHistory } from './chordPractice/historyProjection'
import { formatHistoryPercentage, projectSightReadingHistory } from './historyProjection'

export interface PracticeHubRecentResult {
  readonly module: 'sight' | 'chord'
  readonly recordId: string
  readonly endedAt: number
  readonly summary: string
}

export interface PracticeHubRecentSummary {
  readonly sight: PracticeHubRecentResult | null
  readonly chord: PracticeHubRecentResult | null
}

export function projectPracticeHubRecentSummary(
  sightRecords: readonly DurableSightReadingReport[],
  chordRecords: readonly ChordPracticeReportV1[]
): PracticeHubRecentSummary {
  const latestSight = projectSightReadingHistory(sightRecords).items[0] ?? null
  const latestChord = projectChordHistory(chordRecords)[0] ?? null
  return Object.freeze({
    sight: latestSight
      ? Object.freeze({
          module: 'sight' as const,
          recordId: latestSight.recordId,
          endedAt: latestSight.endedAt,
          summary: `上次练习 · ${formatHistoryPercentage(latestSight.accuracy)}% 正确率`
        })
      : null,
    chord: latestChord
      ? Object.freeze({
          module: 'chord' as const,
          recordId: latestChord.recordId,
          endedAt: latestChord.endedAt,
          summary: `上次练习 · ${formatHistoryPercentage(latestChord.firstPassCompletionRate)}% 完成率`
        })
      : null
  })
}
