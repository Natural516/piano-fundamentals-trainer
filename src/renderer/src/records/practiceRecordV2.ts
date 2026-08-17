import type { PracticeSessionRecord } from '../utils/practiceRecordTypes'

export interface PracticeErrorEvent {
  id: string
  type: string
  measure?: number | null
  beat?: number | null
  expected?: number | null
  actual?: number | null
  hand?: 'left' | 'right' | 'both' | null
  timingErrorMs?: number | null
  severity?: 'low' | 'medium' | 'high'
  sourceEventIds?: string[]
  aggregateCount?: number
  label?: string
}

export interface HandPracticeMetrics {
  expectedJudgeableCount: number
  correct: number
  wrong: number
  missed: number
  extra: number
}

export interface PerMeasurePracticeMetrics {
  measureNumber: number
  expectedJudgeableCount: number
  correct: number
  wrong: number
  missed: number
  extra: number
  pitchAccuracy: number
  early: number
  late: number
  averageSignedOffsetMs: number | null
  medianAbsTimingErrorMs: number | null
  maxAbsoluteOffsetMs: number | null
  interruptionCount: number
  tempoRatio: number
  handStats: Partial<Record<'left' | 'right' | 'both', HandPracticeMetrics>>
  evidenceRefs: EvidenceRef[]
}

export interface PracticeMetric {
  key: string
  value: number
  unit?: string
}

export interface EvidenceRef {
  practiceRecordId?: string
  sessionId?: string
  scoreId?: string | null
  measure?: number | null
  beat?: number | null
  hand?: 'left' | 'right' | 'both' | null
  metric?: string | null
  errorEventId?: string | null
}

export interface PracticeRecordV2 {
  id: string
  schemaVersion: 2
  practiceType: string
  sourceType: 'builtin' | 'musicxml' | 'mxl' | 'midi' | 'image' | 'manual'
  sourceId?: string | null
  startedAt: string
  endedAt: string
  durationMs: number
  tempo?: number | null
  mode?: string | null
  handMode?: string | null
  scoreId?: string | null
  segment?: string | null
  metrics: PracticeMetric[]
  errorEvents: PracticeErrorEvent[]
  evidenceRefs: EvidenceRef[]
  perMeasureMetrics?: PerMeasurePracticeMetrics[]
  metadata: Record<string, string | number | boolean | null>
}

const METRIC_MAP: Record<string, string> = {
  correct: 'correctCount',
  wrong: 'wrongCount',
  missing: 'missingCount',
  extra: 'extraCount',
  early: 'earlyCount',
  late: 'lateCount',
  accuracy: 'accuracy'
}

export function fromLegacyRecord(record: PracticeSessionRecord): PracticeRecordV2 {
  const metrics: PracticeMetric[] = []
  const pushMetric = (key: string, value: number | null | undefined, unit?: string): void => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      metrics.push({ key, value, unit })
    }
  }

  pushMetric(METRIC_MAP.correct, record.correctEvents)
  pushMetric(METRIC_MAP.wrong, record.wrongNoteCount)
  pushMetric(METRIC_MAP.missing, record.missingNoteCount)
  pushMetric(METRIC_MAP.extra, record.extraNoteCount)
  pushMetric(METRIC_MAP.early, record.earlyCount)
  pushMetric(METRIC_MAP.late, record.lateCount)
  pushMetric(METRIC_MAP.accuracy, record.accuracy, '%')
  pushMetric('averageOffsetMs', record.averageOffsetMs, 'ms')
  pushMetric('totalEvents', record.totalEvents)
  pushMetric('durationMs', record.durationMs, 'ms')

  for (const [key, value] of Object.entries(record.details ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      pushMetric(`detail.${key}`, value)
    }
  }

  const errorEvents: PracticeErrorEvent[] = (record.mistakes ?? []).map((mistake, index) => ({
    id: `${record.id}-error-${index}`,
    type: mistake.type ?? 'mistake',
    expected: null,
    aggregateCount: typeof mistake.count === 'number' ? mistake.count : undefined,
    label: mistake.label ?? mistake.type ?? 'mistake',
    severity: (mistake.count ?? 0) > 5 ? 'high' : (mistake.count ?? 0) > 2 ? 'medium' : 'low'
  }))

  return {
    id: record.id,
    schemaVersion: 2,
    practiceType: record.module,
    sourceType: record.moduleName.includes('曲谱') ? 'musicxml' : 'builtin',
    sourceId: record.contentId ?? null,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    durationMs: record.durationMs,
    tempo: record.bpm ?? null,
    mode: record.practiceMode ?? null,
    handMode: null,
    scoreId: record.contentId ?? null,
    segment: null,
    metrics,
    errorEvents,
    evidenceRefs: errorEvents.map((event) => ({
      practiceRecordId: record.id,
      errorEventId: event.id
    })),
    metadata: { ...record.settings, legacyTitle: record.title }
  }
}

export function serializePracticeRecordV2(record: PracticeRecordV2): string {
  return JSON.stringify(record, null, 2)
}

export function parsePracticeRecordV2(json: string): PracticeRecordV2 | null {
  try {
    const parsed = JSON.parse(json) as Partial<PracticeRecordV2>
    if (
      parsed &&
      typeof parsed.id === 'string' &&
      parsed.schemaVersion === 2 &&
      typeof parsed.practiceType === 'string' &&
      Array.isArray(parsed.metrics) &&
      Array.isArray(parsed.errorEvents) &&
      Array.isArray(parsed.evidenceRefs)
    ) {
      return parsed as PracticeRecordV2
    }
    return null
  } catch {
    return null
  }
}

export function exportRecordsToJson(records: PracticeSessionRecord[]): string {
  return JSON.stringify({
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    records: records.map(fromLegacyRecord)
  }, null, 2)
}

export function isUnobservableFromMidi(claim: string): boolean {
  const unobservable = /指法|手腕|手型|肌肉紧张|坐姿|放松|紧张/
  return unobservable.test(claim)
}
