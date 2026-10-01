import type { DurableSightReadingReport } from './androidPersistenceCore'
import { projectSightReadingHistory, type AndroidHistoryItem } from './historyProjection'
import { projectChordHistory, type ChordHistoryItem } from './chordPractice/historyProjection'
import type { ChordPracticeReportV1 } from './chordPractice/report'
import { projectIntervalHistory, type IntervalHistoryItem } from './intervalPractice/historyProjection'
import type { IntervalPracticeReportV1 } from './intervalPractice/report'

export type MixedPracticeHistoryItem =
  | ({ readonly module: 'sight' } & AndroidHistoryItem)
  | ChordHistoryItem
  | IntervalHistoryItem

export function projectMixedPracticeHistory(
  sightRecords: readonly DurableSightReadingReport[],
  chordRecords: readonly ChordPracticeReportV1[],
  intervalRecords: readonly IntervalPracticeReportV1[] = []
): readonly MixedPracticeHistoryItem[] {
  const sightItems: MixedPracticeHistoryItem[] = projectSightReadingHistory(sightRecords).items.map((item) => ({
    module: 'sight' as const,
    ...item
  }))
  return Object.freeze([...sightItems, ...projectChordHistory(chordRecords), ...projectIntervalHistory(intervalRecords)].sort((left, right) => (
    right.endedAt - left.endedAt || left.recordId.localeCompare(right.recordId)
  )))
}
