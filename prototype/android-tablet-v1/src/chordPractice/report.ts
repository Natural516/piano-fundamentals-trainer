import type { ChordQuestionTimingFacts } from './judgement'
import type { ChordPracticeMode, ChordRuntimeSnapshot } from './runtime'
import { isChordSequentialMajorKeyId, type ChordSequentialMajorKeyId } from '../musicTheory/chords'

export const CHORD_REPORT_SCHEMA_VERSION = 1 as const

export interface ChordTimingMetricSummary {
  readonly sampleCount: number
  readonly medianMs: number | null
}

export interface ChordTimingSummary {
  readonly questionStartLatencyMs: ChordTimingMetricSummary
  readonly arpeggioDurationMs: ChordTimingMetricSummary
  readonly switchToBlockLatencyMs: ChordTimingMetricSummary
  readonly blockLandingSpreadMs: ChordTimingMetricSummary
}

export interface ChordPracticeReportV1 {
  readonly schemaVersion: typeof CHORD_REPORT_SCHEMA_VERSION
  readonly recordId: string
  readonly module: 'chord'
  readonly startedAtEpochMs: number
  readonly endedAtEpochMs: number
  readonly completionReason: 'completed' | 'stopped'
  readonly practiceMode: ChordPracticeMode
  readonly sequentialKey: ChordSequentialMajorKeyId | null
  readonly plannedQuestionCount: 10 | 20 | 50 | 100 | null
  readonly completedQuestions: number
  readonly firstPassCompleteQuestions: number
  readonly arpeggioErrors: number
  readonly blockErrors: number
  readonly totalErrors: number
  readonly longestFirstPassStreak: number
  readonly practiceDurationMs: number
  readonly timingSummary: ChordTimingSummary
}

export type ChordPracticeReportDraft = Omit<ChordPracticeReportV1, 'schemaVersion' | 'recordId' | 'module'>

const isObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const isFiniteNonNegative = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
)

const isIntegerNonNegative = (value: unknown): value is number => (
  Number.isInteger(value) && Number(value) >= 0
)

const isPlannedQuestionCount = (value: unknown): value is ChordPracticeReportV1['plannedQuestionCount'] => (
  value === null || value === 10 || value === 20 || value === 50 || value === 100
)

function isTimingMetricSummary(value: unknown, completedQuestions: number): value is ChordTimingMetricSummary {
  if (!isObject(value) || !isIntegerNonNegative(value.sampleCount) || value.sampleCount !== completedQuestions) return false
  if (completedQuestions === 0) return value.medianMs === null
  return isFiniteNonNegative(value.medianMs)
}

function isTimingSummary(value: unknown, completedQuestions: number): value is ChordTimingSummary {
  return isObject(value)
    && isTimingMetricSummary(value.questionStartLatencyMs, completedQuestions)
    && isTimingMetricSummary(value.arpeggioDurationMs, completedQuestions)
    && isTimingMetricSummary(value.switchToBlockLatencyMs, completedQuestions)
    && isTimingMetricSummary(value.blockLandingSpreadMs, completedQuestions)
}

export function isChordPracticeReportV1(value: unknown): value is ChordPracticeReportV1 {
  if (!isObject(value) || value.schemaVersion !== CHORD_REPORT_SCHEMA_VERSION || value.module !== 'chord') return false
  if (typeof value.recordId !== 'string' || !/^chord-report-[1-9]\d*$/.test(value.recordId)) return false
  if (!isFiniteNonNegative(value.startedAtEpochMs) || !isFiniteNonNegative(value.endedAtEpochMs)
    || value.endedAtEpochMs < value.startedAtEpochMs) return false
  if (value.completionReason !== 'completed' && value.completionReason !== 'stopped') return false
  if (value.practiceMode !== 'sequential' && value.practiceMode !== 'comprehensive') return false
  if (value.practiceMode === 'sequential') {
    if (!isChordSequentialMajorKeyId(value.sequentialKey)) return false
  } else if (value.sequentialKey !== null) return false
  if (!isPlannedQuestionCount(value.plannedQuestionCount)) return false
  if (value.completionReason === 'completed' && (
    value.plannedQuestionCount === null || value.completedQuestions !== value.plannedQuestionCount
  )) return false
  if (!isIntegerNonNegative(value.completedQuestions) || value.completedQuestions < 1) return false
  if (value.plannedQuestionCount !== null && value.completedQuestions > value.plannedQuestionCount) return false
  if (!isIntegerNonNegative(value.firstPassCompleteQuestions)
    || value.firstPassCompleteQuestions > value.completedQuestions) return false
  if (!isIntegerNonNegative(value.arpeggioErrors) || !isIntegerNonNegative(value.blockErrors)
    || !isIntegerNonNegative(value.totalErrors)
    || value.totalErrors !== value.arpeggioErrors + value.blockErrors) return false
  if (!isIntegerNonNegative(value.longestFirstPassStreak)
    || value.longestFirstPassStreak > value.firstPassCompleteQuestions) return false
  if (!isFiniteNonNegative(value.practiceDurationMs)) return false
  return isTimingSummary(value.timingSummary, value.completedQuestions)
}

function summarizeMetric(samples: readonly ChordQuestionTimingFacts[], key: keyof ChordQuestionTimingFacts): ChordTimingMetricSummary {
  const values = samples
    .map((sample) => sample[key])
    .filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right)
  if (values.length === 0) return Object.freeze({ sampleCount: 0, medianMs: null })
  const middle = Math.floor(values.length / 2)
  const medianMs = values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2
  return Object.freeze({ sampleCount: values.length, medianMs })
}

export function summarizeChordTiming(samples: readonly ChordQuestionTimingFacts[]): ChordTimingSummary {
  return Object.freeze({
    questionStartLatencyMs: summarizeMetric(samples, 'questionStartLatencyMs'),
    arpeggioDurationMs: summarizeMetric(samples, 'arpeggioDurationMs'),
    switchToBlockLatencyMs: summarizeMetric(samples, 'switchToBlockLatencyMs'),
    blockLandingSpreadMs: summarizeMetric(samples, 'blockLandingSpreadMs')
  })
}

export function createChordPracticeReportDraft(
  snapshot: ChordRuntimeSnapshot,
  options: {
    readonly startedAtEpochMs: number
    readonly endedAtEpochMs: number
    readonly completionReason: ChordPracticeReportV1['completionReason']
  }
): ChordPracticeReportDraft {
  const counters = snapshot.counters
  if (counters.totalErrors !== counters.arpeggioErrors + counters.blockErrors) {
    throw new Error('Chord report facts violate the error-counter invariant')
  }
  if (snapshot.timingSamples.length !== counters.completedQuestions) {
    throw new Error('Chord report timing samples do not match completed questions')
  }
  const plannedQuestionCount = snapshot.questionCount === 'endless' ? null : snapshot.questionCount
  const draft: ChordPracticeReportDraft = {
    startedAtEpochMs: options.startedAtEpochMs,
    endedAtEpochMs: options.endedAtEpochMs,
    completionReason: options.completionReason,
    practiceMode: snapshot.mode,
    sequentialKey: snapshot.mode === 'sequential' ? snapshot.sequentialKey : null,
    plannedQuestionCount,
    completedQuestions: counters.completedQuestions,
    firstPassCompleteQuestions: counters.firstPassCompletedQuestions,
    arpeggioErrors: counters.arpeggioErrors,
    blockErrors: counters.blockErrors,
    totalErrors: counters.totalErrors,
    longestFirstPassStreak: counters.longestFirstPassStreak,
    practiceDurationMs: snapshot.activePracticeDurationMs,
    timingSummary: summarizeChordTiming(snapshot.timingSamples)
  }
  return Object.freeze(draft)
}

export function createChordPracticeReport(recordId: string, draft: ChordPracticeReportDraft): ChordPracticeReportV1 {
  return freezeChordPracticeReport({
    schemaVersion: CHORD_REPORT_SCHEMA_VERSION,
    recordId,
    module: 'chord',
    ...draft,
    timingSummary: Object.freeze({
      questionStartLatencyMs: Object.freeze({ ...draft.timingSummary.questionStartLatencyMs }),
      arpeggioDurationMs: Object.freeze({ ...draft.timingSummary.arpeggioDurationMs }),
      switchToBlockLatencyMs: Object.freeze({ ...draft.timingSummary.switchToBlockLatencyMs }),
      blockLandingSpreadMs: Object.freeze({ ...draft.timingSummary.blockLandingSpreadMs })
    })
  })
}

export function freezeChordPracticeReport(report: ChordPracticeReportV1): ChordPracticeReportV1 {
  if (!isChordPracticeReportV1(report)) throw new Error('Chord report cannot be persisted because its facts are invalid')
  return Object.freeze({
    ...report,
    timingSummary: Object.freeze({
      questionStartLatencyMs: Object.freeze({ ...report.timingSummary.questionStartLatencyMs }),
      arpeggioDurationMs: Object.freeze({ ...report.timingSummary.arpeggioDurationMs }),
      switchToBlockLatencyMs: Object.freeze({ ...report.timingSummary.switchToBlockLatencyMs }),
      blockLandingSpreadMs: Object.freeze({ ...report.timingSummary.blockLandingSpreadMs })
    })
  })
}
