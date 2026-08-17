import type { ScoreTimeline } from '../score/musicXmlTypes'
import type { PerMeasurePracticeMetrics } from './practiceRecordV2'

export interface PracticeFactForMetrics {
  outcome: string
  originalMeasure?: number
  measure?: number
  offsetMs?: number
  hand?: string | null
}

export interface PracticeSummaryMetrics {
  totalUnits: number
  judgeableUnitCount: number
  correct: number
  wrong: number
  missing: number
  extra: number
  skipped: number
  accuracy: number
  earlyCount: number
  lateCount: number
  averageSignedOffsetMs: number | null
  medianAbsoluteOffsetMs: number | null
  maxAbsoluteOffsetMs: number | null
  perMeasureMetrics: PerMeasurePracticeMetrics[]
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function emptyHandMetrics() {
  return { expectedJudgeableCount: 0, correct: 0, wrong: 0, missed: 0, extra: 0 }
}

export function buildPerMeasurePracticeMetrics(
  timeline: ScoreTimeline,
  facts: PracticeFactForMetrics[],
  tempoRatio: number,
  interruptionMeasures: number[] = []
): PerMeasurePracticeMetrics[] {
  const measures = new Map<number, PerMeasurePracticeMetrics>()
  const ensure = (measureNumber: number): PerMeasurePracticeMetrics => {
    const existing = measures.get(measureNumber)
    if (existing) return existing
    const created: PerMeasurePracticeMetrics = {
      measureNumber,
      expectedJudgeableCount: 0,
      correct: 0,
      wrong: 0,
      missed: 0,
      extra: 0,
      pitchAccuracy: 0,
      early: 0,
      late: 0,
      averageSignedOffsetMs: null,
      medianAbsTimingErrorMs: null,
      maxAbsoluteOffsetMs: null,
      interruptionCount: 0,
      tempoRatio,
      handStats: {},
      evidenceRefs: []
    }
    measures.set(measureNumber, created)
    return created
  }

  for (const unit of timeline.units) {
    const measure = ensure(unit.originalMeasure)
    if (unit.rest || unit.expectedMidi.length === 0) continue
    measure.expectedJudgeableCount += 1
    const hand = unit.hand ?? 'both'
    const handMetrics = measure.handStats[hand] ?? emptyHandMetrics()
    handMetrics.expectedJudgeableCount += 1
    measure.handStats[hand] = handMetrics
  }

  const offsets = new Map<number, number[]>()
  for (const fact of facts) {
    const measureNumber = fact.originalMeasure ?? fact.measure
    if (typeof measureNumber !== 'number') continue
    const measure = ensure(measureNumber)
    const hand = fact.hand === 'left' || fact.hand === 'right' || fact.hand === 'both' ? fact.hand : 'both'
    const handMetrics = measure.handStats[hand] ?? emptyHandMetrics()
    const isCorrectPitch = fact.outcome === 'correct' || fact.outcome === 'early' || fact.outcome === 'late'
    if (isCorrectPitch) {
      measure.correct += 1
      handMetrics.correct += 1
    } else if (fact.outcome === 'wrong') {
      measure.wrong += 1
      handMetrics.wrong += 1
    } else if (fact.outcome === 'missing') {
      measure.missed += 1
      handMetrics.missed += 1
    } else if (fact.outcome === 'extra') {
      measure.extra += 1
      handMetrics.extra += 1
    }
    if (fact.outcome === 'early') measure.early += 1
    if (fact.outcome === 'late') measure.late += 1
    measure.handStats[hand] = handMetrics
    if (typeof fact.offsetMs === 'number' && isCorrectPitch) {
      const list = offsets.get(measureNumber) ?? []
      list.push(fact.offsetMs)
      offsets.set(measureNumber, list)
    }
  }

  for (const measureNumber of interruptionMeasures) ensure(measureNumber).interruptionCount += 1

  for (const measure of measures.values()) {
    measure.pitchAccuracy = measure.expectedJudgeableCount > 0
      ? Math.round(Math.min(measure.correct, measure.expectedJudgeableCount) / measure.expectedJudgeableCount * 100)
      : 100
    const timing = offsets.get(measure.measureNumber) ?? []
    measure.averageSignedOffsetMs = timing.length > 0
      ? Math.round(timing.reduce((sum, value) => sum + value, 0) / timing.length)
      : null
    const absolute = timing.map(Math.abs)
    const medianAbsolute = median(absolute)
    measure.medianAbsTimingErrorMs = medianAbsolute === null ? null : Math.round(medianAbsolute)
    measure.maxAbsoluteOffsetMs = absolute.length > 0 ? Math.max(...absolute) : null
  }

  return [...measures.values()].sort((left, right) => left.measureNumber - right.measureNumber)
}

export function buildPracticeSummaryMetrics(
  timeline: ScoreTimeline,
  facts: PracticeFactForMetrics[],
  tempoRatio: number,
  interruptionMeasures: number[] = []
): PracticeSummaryMetrics {
  const judgeableUnitCount = timeline.units.filter((unit) => !unit.rest && unit.expectedMidi.length > 0).length
  const correct = facts.filter((fact) => fact.outcome === 'correct' || fact.outcome === 'early' || fact.outcome === 'late').length
  const timing = facts
    .filter((fact) => (fact.outcome === 'correct' || fact.outcome === 'early' || fact.outcome === 'late') && typeof fact.offsetMs === 'number')
    .map((fact) => fact.offsetMs as number)
  const absolute = timing.map(Math.abs)
  const medianAbsolute = median(absolute)
  return {
    totalUnits: timeline.units.length,
    judgeableUnitCount,
    correct,
    wrong: facts.filter((fact) => fact.outcome === 'wrong').length,
    missing: facts.filter((fact) => fact.outcome === 'missing').length,
    extra: facts.filter((fact) => fact.outcome === 'extra').length,
    skipped: facts.filter((fact) => fact.outcome === 'skip').length,
    accuracy: judgeableUnitCount > 0 ? Math.round(Math.min(correct, judgeableUnitCount) / judgeableUnitCount * 100) : 100,
    earlyCount: facts.filter((fact) => fact.outcome === 'early').length,
    lateCount: facts.filter((fact) => fact.outcome === 'late').length,
    averageSignedOffsetMs: timing.length > 0 ? Math.round(timing.reduce((sum, value) => sum + value, 0) / timing.length) : null,
    medianAbsoluteOffsetMs: medianAbsolute === null ? null : Math.round(medianAbsolute),
    maxAbsoluteOffsetMs: absolute.length > 0 ? Math.max(...absolute) : null,
    perMeasureMetrics: buildPerMeasurePracticeMetrics(timeline, facts, tempoRatio, interruptionMeasures)
  }
}
