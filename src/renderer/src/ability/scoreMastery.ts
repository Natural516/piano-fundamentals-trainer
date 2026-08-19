import type { PracticeRecordV2 } from '../records/practiceRecordV2'

export type MasteryTrend = 'up' | 'down' | 'flat' | 'unknown'
export type MasteryDerivedState = 'improving' | 'stable' | 'unstable' | 'insufficient_evidence'

export interface MeasureMasteryContext {
  contextKey: string
  handMode: string | null
  practiceMode: string | null
  tempo: number | null
  tempoRatio: number | null
  sampleCount: number
  recentAccuracy: number | null
  recentTiming: number | null
  interruptionRate: number | null
  recentTrend: MasteryTrend
  derivedState: MasteryDerivedState
  lastPracticedAt: string
  evidenceRefs: Array<{ practiceRecordId: string }>
}

export interface MeasureMastery {
  scoreId: string
  measureNumber: number
  attempts: number
  sampleCount: number
  pitchAccuracy: number | null
  recentAccuracy: number | null
  timingAccuracy: number | null
  recentTiming: number | null
  interruptionRate: number | null
  lastPracticedAt: string
  bestTempoRatio: number | null
  handMode: string | null
  practiceMode: string | null
  tempo: number | null
  tempoRatio: number | null
  recentTrend: MasteryTrend
  derivedState: MasteryDerivedState
  evidenceRefs: Array<{ practiceRecordId: string }>
  confidence: 'low' | 'medium' | 'high'
  contexts: MeasureMasteryContext[]
}

export interface ScoreMasteryState {
  version: 2
  scores: Record<string, Record<number, MeasureMastery>>
  updatedAt: string
}

export interface WeakMeasureSummary {
  measure: number
  attempts: number
  pitchAccuracy: number | null
  evidenceRefs: Array<{ practiceRecordId: string }>
}

interface MasterySample {
  recordId: string
  endedAt: string
  accuracy: number | null
  timing: number | null
  interruption: number | null
}

interface ContextBucket {
  scoreId: string
  measureNumber: number
  contextKey: string
  handMode: string | null
  practiceMode: string | null
  tempo: number | null
  tempoRatio: number | null
  samples: MasterySample[]
}

export const SCORE_MASTERY_RECENT_WINDOW = 10
export const WEAK_MEASURE_SOLID_THRESHOLD = 85
export const WEAK_MEASURE_DONE_THRESHOLD = 90

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function average(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return present.length > 0 ? round2(present.reduce((sum, value) => sum + value, 0) / present.length) : null
}

function confidenceFor(sampleCount: number): MeasureMastery['confidence'] {
  if (sampleCount < 3) return 'low'
  if (sampleCount < 8) return 'medium'
  return 'high'
}

function inferTrend(values: Array<number | null>): MasteryTrend {
  const present = values.filter((value): value is number => typeof value === 'number')
  if (present.length < 2) return 'unknown'
  const midpoint = Math.max(1, Math.floor(present.length / 2))
  const earlier = average(present.slice(0, midpoint))
  const later = average(present.slice(midpoint))
  if (earlier === null || later === null) return 'unknown'
  if (later - earlier >= 5) return 'up'
  if (earlier - later >= 5) return 'down'
  return 'flat'
}

function deriveState(sampleCount: number, accuracies: Array<number | null>, trend: MasteryTrend): MasteryDerivedState {
  if (sampleCount < 3) return 'insufficient_evidence'
  if (trend === 'up') return 'improving'
  const present = accuracies.filter((value): value is number => typeof value === 'number')
  if (trend === 'down' || (present.length > 1 && Math.max(...present) - Math.min(...present) >= 15)) return 'unstable'
  return 'stable'
}

function normalizeContextNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? round2(value) : null
}

function contextKeyFor(record: PracticeRecordV2): string {
  const ratio = normalizeContextNumber(record.metadata.tempoRatio)
  return [
    record.handMode ?? 'unknown-hand',
    record.mode ?? 'unknown-mode',
    ratio === null ? 'unknown-ratio' : `ratio:${ratio}`,
    typeof record.tempo === 'number' ? `tempo:${round2(record.tempo)}` : 'unknown-tempo'
  ].join('|')
}

function toContext(bucket: ContextBucket): MeasureMasteryContext {
  const recent = bucket.samples.slice(-SCORE_MASTERY_RECENT_WINDOW)
  const trend = inferTrend(recent.map((sample) => sample.accuracy))
  return {
    contextKey: bucket.contextKey,
    handMode: bucket.handMode,
    practiceMode: bucket.practiceMode,
    tempo: bucket.tempo,
    tempoRatio: bucket.tempoRatio,
    sampleCount: recent.length,
    recentAccuracy: average(recent.map((sample) => sample.accuracy)),
    recentTiming: average(recent.map((sample) => sample.timing)),
    interruptionRate: average(recent.map((sample) => sample.interruption)),
    recentTrend: trend,
    derivedState: deriveState(recent.length, recent.map((sample) => sample.accuracy), trend),
    lastPracticedAt: recent[recent.length - 1]?.endedAt ?? '',
    evidenceRefs: [...new Set(recent.map((sample) => sample.recordId))].map((practiceRecordId) => ({ practiceRecordId }))
  }
}

export function isMeasureWeak(measure: MeasureMastery): boolean {
  return measure.attempts > 0 &&
    measure.pitchAccuracy !== null &&
    measure.pitchAccuracy < WEAK_MEASURE_DONE_THRESHOLD &&
    (measure.pitchAccuracy < WEAK_MEASURE_SOLID_THRESHOLD || measure.recentTrend !== 'up')
}

export function computeScoreMastery(records: PracticeRecordV2[], now = new Date()): ScoreMasteryState {
  const buckets = new Map<string, ContextBucket>()
  const chronological = [...records].sort((left, right) =>
    Date.parse(left.startedAt || left.endedAt) - Date.parse(right.startedAt || right.endedAt) ||
    Date.parse(left.endedAt) - Date.parse(right.endedAt)
  )

  for (const record of chronological) {
    if (record.practiceType !== 'score' || !record.scoreId) continue
    const contextKey = contextKeyFor(record)
    for (const facts of record.perMeasureMetrics ?? []) {
      const bucketKey = `${record.scoreId}\u0000${facts.measureNumber}\u0000${contextKey}`
      const bucket = buckets.get(bucketKey) ?? {
        scoreId: record.scoreId,
        measureNumber: facts.measureNumber,
        contextKey,
        handMode: record.handMode ?? null,
        practiceMode: record.mode ?? null,
        tempo: normalizeContextNumber(record.tempo),
        tempoRatio: normalizeContextNumber(record.metadata.tempoRatio),
        samples: []
      }
      const timing = facts.medianAbsTimingErrorMs === null
        ? null
        : Math.max(0, round2(100 - Math.min(180, facts.medianAbsTimingErrorMs) / 180 * 100))
      bucket.samples.push({
        recordId: record.id,
        endedAt: record.endedAt,
        accuracy: facts.expectedJudgeableCount > 0 ? facts.pitchAccuracy : null,
        timing,
        interruption: facts.expectedJudgeableCount > 0
          ? round2(facts.interruptionCount / facts.expectedJudgeableCount * 100)
          : null
      })
      buckets.set(bucketKey, bucket)
    }
  }

  const contextsByMeasure = new Map<string, MeasureMasteryContext[]>()
  for (const bucket of buckets.values()) {
    const key = `${bucket.scoreId}\u0000${bucket.measureNumber}`
    const contexts = contextsByMeasure.get(key) ?? []
    contexts.push(toContext(bucket))
    contextsByMeasure.set(key, contexts)
  }

  const scores: Record<string, Record<number, MeasureMastery>> = {}
  for (const [key, contexts] of contextsByMeasure) {
    const [scoreId, measureText] = key.split('\u0000')
    const measureNumber = Number(measureText)
    const sortedContexts = [...contexts].sort((left, right) => Date.parse(right.lastPracticedAt) - Date.parse(left.lastPracticedAt))
    const current = sortedContexts[0]
    const bestTempoRatio = Math.max(...sortedContexts.map((context) => context.tempoRatio ?? 0)) || null
    const mastery: MeasureMastery = {
      scoreId,
      measureNumber,
      attempts: current.sampleCount,
      sampleCount: current.sampleCount,
      pitchAccuracy: current.recentAccuracy,
      recentAccuracy: current.recentAccuracy,
      timingAccuracy: current.recentTiming,
      recentTiming: current.recentTiming,
      interruptionRate: current.interruptionRate,
      lastPracticedAt: current.lastPracticedAt,
      bestTempoRatio,
      handMode: current.handMode,
      practiceMode: current.practiceMode,
      tempo: current.tempo,
      tempoRatio: current.tempoRatio,
      recentTrend: current.recentTrend,
      derivedState: current.derivedState,
      evidenceRefs: current.evidenceRefs,
      confidence: confidenceFor(current.sampleCount),
      contexts: sortedContexts
    }
    scores[scoreId] = { ...(scores[scoreId] ?? {}), [measureNumber]: mastery }
  }

  return { version: 2, scores, updatedAt: now.toISOString() }
}

export function getWeakestMeasures(mastery: ScoreMasteryState, scoreId: string, limit = 3): WeakMeasureSummary[] {
  return Object.values(mastery.scores[scoreId] ?? {})
    .filter(isMeasureWeak)
    .sort((left, right) => (left.pitchAccuracy ?? 0) - (right.pitchAccuracy ?? 0))
    .slice(0, limit)
    .map((measure) => ({
      measure: measure.measureNumber,
      attempts: measure.attempts,
      pitchAccuracy: measure.pitchAccuracy,
      evidenceRefs: measure.evidenceRefs
    }))
}
