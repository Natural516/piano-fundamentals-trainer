import type { PracticeRecordV2 } from './practiceRecordV2'
import {
  PRACTICE_MODULE_NAMES,
  type PracticeModule,
  type PracticeSessionRecord
} from '../utils/practiceRecordTypes'

const VIEW_MODULES = new Set<PracticeModule>([
  'sight-reading',
  'rhythm',
  'scale',
  'chord',
  'coordination',
  'score',
  'free-practice'
])

function metricValue(record: PracticeRecordV2, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const metric = record.metrics.find((entry) => entry.key === key)
    if (metric && Number.isFinite(metric.value)) return metric.value
  }
  return undefined
}

function metadataString(record: PracticeRecordV2, key: string): string | undefined {
  const value = record.metadata[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function metadataNumber(record: PracticeRecordV2, key: string): number | undefined {
  const value = record.metadata[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeModule(practiceType: string): PracticeModule {
  return VIEW_MODULES.has(practiceType as PracticeModule)
    ? practiceType as PracticeModule
    : 'free-practice'
}

function nonNegativeInteger(value: number | undefined): number {
  return Math.max(0, Math.round(value ?? 0))
}

export function toPracticeSessionRecordViewModel(record: PracticeRecordV2): PracticeSessionRecord {
  const module = normalizeModule(record.practiceType)
  const correctEvents = nonNegativeInteger(metricValue(record, 'correctCount', 'correct'))
  const wrongNoteCount = nonNegativeInteger(metricValue(record, 'wrongCount', 'wrong'))
  const missingNoteCount = nonNegativeInteger(metricValue(record, 'missingCount', 'missing'))
  const extraNoteCount = nonNegativeInteger(metricValue(record, 'extraCount', 'extra'))
  const inferredTotal = correctEvents + wrongNoteCount + missingNoteCount + extraNoteCount
  const totalEvents = nonNegativeInteger(metricValue(record, 'totalEvents') ?? (
    record.perMeasureMetrics?.reduce((sum, measure) => sum + measure.expectedJudgeableCount + measure.extra, 0) ?? inferredTotal
  ))
  const storedAccuracy = metricValue(record, 'accuracy')
  const accuracy = Math.min(100, Math.max(0, storedAccuracy ?? (
    totalEvents > 0 ? Math.round((correctEvents / totalEvents) * 100) : 0
  )))
  const legacyTitle = metadataString(record, 'legacyTitle')
  const legacySubtitle = metadataString(record, 'legacySubtitle')
  const legacyContentName = metadataString(record, 'legacyContentName')
  const sourceTitle = record.scoreId ?? record.sourceId ?? undefined
  const title = legacyTitle ?? sourceTitle ?? PRACTICE_MODULE_NAMES[module]
  const settings = Object.fromEntries(Object.entries(record.metadata).filter((entry): entry is [string, string | number | boolean] => (
    !entry[0].startsWith('legacy') &&
    (typeof entry[1] === 'string' || typeof entry[1] === 'boolean' ||
      (typeof entry[1] === 'number' && Number.isFinite(entry[1])))
  )))
  const details: Record<string, string | number | boolean | null> = Object.fromEntries(record.metrics.flatMap((metric) => (
    metric.key.startsWith('detail.') ? [[metric.key.slice('detail.'.length), metric.value]] : []
  )))
  if (record.segment) details.segment = record.segment

  return {
    id: record.id,
    schemaVersion: 1,
    module,
    moduleName: PRACTICE_MODULE_NAMES[module],
    title,
    subtitle: legacySubtitle ?? (record.segment ? `第 ${record.segment.replace('-', '–')} 小节` : undefined),
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    durationMs: nonNegativeInteger(record.durationMs),
    status: record.completionState === 'completed' || record.completionState === undefined ? 'completed' : 'stopped',
    totalEvents,
    correctEvents: Math.min(totalEvents, correctEvents),
    accuracy,
    wrongNoteCount,
    missingNoteCount,
    extraNoteCount,
    earlyCount: nonNegativeInteger(metricValue(record, 'earlyCount', 'early')),
    lateCount: nonNegativeInteger(metricValue(record, 'lateCount', 'late')),
    restErrorCount: nonNegativeInteger(metricValue(record, 'restErrorCount')),
    syncWarningCount: nonNegativeInteger(metricValue(record, 'syncWarningCount')),
    averageOffsetMs: metricValue(record, 'averageOffsetMs', 'averageSignedOffsetMs'),
    contentId: record.sourceId ?? undefined,
    contentName: legacyContentName ?? legacyTitle ?? record.sourceId ?? undefined,
    difficulty: metadataString(record, 'legacyDifficulty') ?? metadataString(record, 'difficulty'),
    bpm: record.tempo ?? undefined,
    loopCount: metadataNumber(record, 'legacyLoopCount') ?? metadataNumber(record, 'loopCount') ?? metadataNumber(record, 'iterationCount'),
    keySignature: metadataString(record, 'legacyKeySignature') ?? metadataString(record, 'keySignature') ?? metadataString(record, 'key'),
    practiceMode: record.mode ?? undefined,
    settings,
    details,
    mistakes: record.errorEvents.map((event) => ({
      label: event.label ?? event.type,
      count: nonNegativeInteger(event.aggregateCount ?? 1),
      type: event.type
    }))
  }
}

export function toPracticeSessionRecordViewModels(records: PracticeRecordV2[]): PracticeSessionRecord[] {
  return records
    .map(toPracticeSessionRecordViewModel)
    .sort((left, right) => Date.parse(right.endedAt) - Date.parse(left.endedAt))
}
