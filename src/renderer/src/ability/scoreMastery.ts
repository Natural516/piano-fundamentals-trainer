import type { PracticeRecordV2 } from '../records/practiceRecordV2'

export interface MeasureMastery {
  scoreId: string
  measureNumber: number
  attempts: number
  pitchAccuracy: number | null
  timingAccuracy: number | null
  interruptionRate: number | null
  lastPracticedAt: string
  bestTempoRatio: number | null
  recentTrend: 'up' | 'down' | 'flat' | 'unknown'
  evidenceRefs: Array<{ practiceRecordId: string }>
  confidence: 'low' | 'medium' | 'high'
}

export interface ScoreMasteryState {
  version: 1
  scores: Record<string, Record<number, MeasureMastery>>
  updatedAt: string
}

export interface WeakMeasureSummary {
  measure: number
  attempts: number
  pitchAccuracy: number | null
  evidenceRefs: Array<{ practiceRecordId: string }>
}

export const WEAK_MEASURE_SOLID_THRESHOLD = 85
export const WEAK_MEASURE_DONE_THRESHOLD = 90

export function isMeasureWeak(measure: MeasureMastery): boolean {
  return measure.attempts > 0 &&
    measure.pitchAccuracy !== null &&
    measure.pitchAccuracy < WEAK_MEASURE_DONE_THRESHOLD &&
    (measure.pitchAccuracy < WEAK_MEASURE_SOLID_THRESHOLD || measure.recentTrend !== 'up')
}

export function computeScoreMastery(records: PracticeRecordV2[], now = new Date()): ScoreMasteryState {
  const scores: Record<string, Record<number, MeasureMastery>> = {}

  const chronological = [...records].sort((left, right) =>
    Date.parse(left.startedAt || left.endedAt) - Date.parse(right.startedAt || right.endedAt) ||
    Date.parse(left.endedAt) - Date.parse(right.endedAt)
  )

  for (const record of chronological) {
    if (record.practiceType !== 'score' || !record.scoreId) continue
    const measureFacts = record.perMeasureMetrics ?? []
    for (const facts of measureFacts) {
      const measure = facts.measureNumber
      const byMeasure = scores[record.scoreId] ?? {}
      const existing = byMeasure[measure] ?? {
        scoreId: record.scoreId,
        measureNumber: measure,
        attempts: 0,
        pitchAccuracy: null,
        timingAccuracy: null,
        interruptionRate: null,
        lastPracticedAt: '',
        bestTempoRatio: null,
        recentTrend: 'unknown',
        evidenceRefs: [],
        confidence: 'low'
      }
      const sessionAccuracy = facts.expectedJudgeableCount > 0 ? facts.pitchAccuracy : null
      const sessionInterruption = facts.expectedJudgeableCount > 0
        ? Math.round(facts.interruptionCount / facts.expectedJudgeableCount * 100)
        : null
      const sessionTimingAccuracy = facts.medianAbsTimingErrorMs === null
        ? null
        : Math.max(0, Math.round(100 - Math.min(180, facts.medianAbsTimingErrorMs) / 180 * 100))

      const previous = existing.attempts > 0
      byMeasure[measure] = {
        ...existing,
        attempts: existing.attempts + 1,
        pitchAccuracy: previous && existing.pitchAccuracy !== null && sessionAccuracy !== null
          ? Math.round((existing.pitchAccuracy + sessionAccuracy) / 2)
          : sessionAccuracy ?? existing.pitchAccuracy,
        timingAccuracy: previous && existing.timingAccuracy !== null && sessionTimingAccuracy !== null
          ? Math.round((existing.timingAccuracy + sessionTimingAccuracy) / 2)
          : sessionTimingAccuracy ?? existing.timingAccuracy,
        interruptionRate: previous && existing.interruptionRate !== null && sessionInterruption !== null
          ? Math.round((existing.interruptionRate + sessionInterruption) / 2)
          : sessionInterruption ?? existing.interruptionRate,
        lastPracticedAt: record.endedAt,
        bestTempoRatio: Math.max(existing.bestTempoRatio ?? 0, facts.tempoRatio) || null,
        recentTrend: previous ? inferTrend(existing, sessionAccuracy) : 'unknown',
        evidenceRefs: [...existing.evidenceRefs, ...(
          facts.evidenceRefs.length > 0
            ? facts.evidenceRefs.map(() => ({ practiceRecordId: record.id }))
            : [{ practiceRecordId: record.id }]
        )].slice(-20),
        confidence: existing.attempts + 1 < 3 ? 'low' : existing.attempts + 1 < 8 ? 'medium' : 'high'
      }
      scores[record.scoreId] = byMeasure
    }
  }

  return { version: 1, scores, updatedAt: now.toISOString() }
}

function inferTrend(existing: MeasureMastery, sessionAccuracy: number | null): 'up' | 'down' | 'flat' | 'unknown' {
  if (sessionAccuracy === null || existing.pitchAccuracy === null) return 'unknown'
  if (sessionAccuracy - existing.pitchAccuracy >= 8) return 'up'
  if (existing.pitchAccuracy - sessionAccuracy >= 8) return 'down'
  return 'flat'
}

export function getWeakestMeasures(mastery: ScoreMasteryState, scoreId: string, limit = 3): WeakMeasureSummary[] {
  const measures = Object.values(mastery.scores[scoreId] ?? {})
  return measures
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
