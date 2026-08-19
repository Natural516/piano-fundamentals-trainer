import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ScoreDocument } from '../score/musicXmlTypes'
import { buildScoreTimeline } from '../score/scoreTimeline'
import { buildSegmentTimeline, type ScoreSegmentOptions } from '../score/scoreTimeline'
import { INTERNAL_PPQ } from '../score/scoreTimeV2'
import { WaitScoreCore } from '../score/waitScoreCore'
import { RealtimeScoreCore } from '../score/realtimeScoreCore'
import { FollowScoreCore } from '../score/followScoreCore'
import { useMidiEventSubscription } from './useMidiEvents'
import { buildPracticeSummaryMetrics } from '../records/practiceMetrics'
import type { PerMeasurePracticeMetrics } from '../records/practiceRecordV2'

export type ScorePracticeMode = 'wait' | 'realtime' | 'follow'
export type ScorePracticePhase = 'idle' | 'count-in' | 'running' | 'paused' | 'finished'

export interface ScorePracticeReport {
  totalUnits: number
  judgeableUnitCount: number
  correct: number
  wrong: number
  missing: number
  extra: number
  skipped: number
  accuracy: number
  completionAccuracy: number
  errorCount: number
  isPerfect: boolean
  earlyCount: number
  lateCount: number
  averageSignedOffsetMs: number | null
  medianAbsoluteOffsetMs: number | null
  maxAbsoluteOffsetMs: number | null
  perMeasureMetrics: PerMeasurePracticeMetrics[]
}

export interface ScorePracticeFact {
  unitId: string
  outcome: string
  offsetMs?: number
  measure?: number
  beat?: number
  originalMeasure?: number
  originalBeat?: number
  practiceTick?: number
  expectedMidi: number[]
  actualMidi: number | null
  hand?: string | null
  staff?: number | null
  sourceEventIds: string[]
}

export interface UseScorePracticeResult {
  phase: ScorePracticePhase
  mode: ScorePracticeMode
  timelineUnits: number
  currentIndex: number
  currentMeasure: number | null
  currentSourceEventIds: string[]
  expectedMidi: number[]
  feedback: 'correct' | 'wrong' | null
  elapsedMs: number
  loopIterations: number
  facts: ScorePracticeFact[]
  report: ScorePracticeReport
  isRunning: boolean
  sessionActive: boolean
  start: () => void
  pause: () => void
  resume: () => void
  stop: () => void
  reset: () => void
}

export interface ScorePracticeOptions {
  segment?: ScoreSegmentOptions
  loop?: boolean
  countInMs?: number
  tempoRatio?: number
}

export function useScorePractice(
  score: ScoreDocument | null,
  mode: ScorePracticeMode = 'wait',
  options: ScorePracticeOptions = {}
): UseScorePracticeResult {
  const segmentStartMeasure = options.segment?.startMeasure
  const segmentEndMeasure = options.segment?.endMeasure
  const segmentHandMode = options.segment?.handMode
  const timeline = useMemo(() => {
    if (!score) return { units: [] }
    if (segmentStartMeasure === undefined && segmentEndMeasure === undefined && segmentHandMode === undefined) {
      return buildScoreTimeline(score)
    }
    return buildSegmentTimeline(score, {
      startMeasure: segmentStartMeasure,
      endMeasure: segmentEndMeasure,
      handMode: segmentHandMode
    })
  }, [score, segmentEndMeasure, segmentHandMode, segmentStartMeasure])
  const loop = options.loop ?? false
  const countInMs = options.countInMs ?? 0
  const tempoRatio = Math.min(2, Math.max(0.25, options.tempoRatio ?? 1))

  const msPerTick = useMemo(() => {
    if (!score) return 500
    const bpm = score.defaultTempoBpm ?? 60
    return 60000 / Math.max(1, bpm) / INTERNAL_PPQ / tempoRatio
  }, [score, tempoRatio])

  const waitCoreRef = useRef<WaitScoreCore | null>(null)
  const realtimeCoreRef = useRef<RealtimeScoreCore | null>(null)
  const followCoreRef = useRef<FollowScoreCore | null>(null)
  if (waitCoreRef.current === null) waitCoreRef.current = new WaitScoreCore(timeline)
  if (realtimeCoreRef.current === null) {
    realtimeCoreRef.current = new RealtimeScoreCore(timeline, { beatDurationMs: 500, msPerTick })
  }
  if (followCoreRef.current === null) {
    followCoreRef.current = new FollowScoreCore(timeline, { beatDurationMs: 500, msPerTick })
  }

  const [phase, setPhase] = useState<ScorePracticePhase>('idle')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [facts, setFacts] = useState<ScorePracticeFact[]>([])
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [loopIterations, setLoopIterations] = useState(0)
  const [interruptionMeasures, setInterruptionMeasures] = useState<number[]>([])
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const startTimeRef = useRef(0)
  const pausedAtRef = useRef(0)
  const pausedTotalRef = useRef(0)
  const tickerRef = useRef<number | null>(null)
  const countInTimerRef = useRef<number | null>(null)
  const countInEndsAtRef = useRef(0)
  const countInRemainingRef = useRef(0)
  const pausedFromCountInRef = useRef(false)
  const lastEventIdRef = useRef<number | null>(null)
  const loopIterationsRef = useRef(0)
  const completeLoopRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    if (tickerRef.current !== null) {
      window.clearInterval(tickerRef.current)
      tickerRef.current = null
    }
    if (countInTimerRef.current !== null) {
      window.clearTimeout(countInTimerRef.current)
      countInTimerRef.current = null
    }
    waitCoreRef.current = new WaitScoreCore(timeline)
    realtimeCoreRef.current = new RealtimeScoreCore(timeline, { beatDurationMs: 500, msPerTick })
    followCoreRef.current = new FollowScoreCore(timeline, { beatDurationMs: 500, msPerTick })
    setCurrentIndex(0)
    setFacts([])
    setFeedback(null)
    setElapsedMs(0)
    setLoopIterations(0)
    setInterruptionMeasures([])
    countInRemainingRef.current = 0
    pausedFromCountInRef.current = false
    pausedTotalRef.current = 0
    pausedAtRef.current = 0
    lastEventIdRef.current = null
    loopIterationsRef.current = 0
    setPhase('idle')
  }, [msPerTick, timeline])

  const sync = useCallback(() => {
    const core = mode === 'wait'
      ? waitCoreRef.current
      : mode === 'realtime'
        ? realtimeCoreRef.current
        : followCoreRef.current
    if (!core) return
    setCurrentIndex(core.currentIndex)
    setFacts(core.results.map(toFact))
  }, [mode])

  const stopTicker = useCallback(() => {
    if (tickerRef.current !== null) {
      window.clearInterval(tickerRef.current)
      tickerRef.current = null
    }
  }, [])

  const startTicker = useCallback(() => {
    stopTicker()
    if (mode === 'wait') return
    tickerRef.current = window.setInterval(() => {
      if (phaseRef.current !== 'running') return
      const elapsed = performance.now() - startTimeRef.current - pausedTotalRef.current
      setElapsedMs(elapsed)
      if (mode === 'realtime') {
        realtimeCoreRef.current?.advanceTo(elapsed)
        sync()
        if (realtimeCoreRef.current?.isComplete) {
          completeLoopRef.current()
        }
      }
    }, 40)
  }, [mode, stopTicker, sync])

  const beginRun = useCallback(() => {
    waitCoreRef.current?.reset()
    realtimeCoreRef.current?.reset()
    followCoreRef.current?.reset()
    setFacts([])
    setFeedback(null)
    setElapsedMs(0)
    setInterruptionMeasures([])
    pausedTotalRef.current = 0
    pausedAtRef.current = 0
    pausedFromCountInRef.current = false
    lastEventIdRef.current = null
    if (countInMs > 0) {
      setPhase('count-in')
      countInRemainingRef.current = countInMs
      countInEndsAtRef.current = performance.now() + countInMs
      if (countInTimerRef.current !== null) window.clearTimeout(countInTimerRef.current)
      countInTimerRef.current = window.setTimeout(() => {
        startTimeRef.current = performance.now()
        setPhase('running')
        startTicker()
      }, countInMs)
    } else {
      startTimeRef.current = performance.now()
      setPhase('running')
      startTicker()
    }
    sync()
  }, [countInMs, startTicker, sync])

  const completeLoop = useCallback(() => {
    if (loop) {
      loopIterationsRef.current += 1
      setLoopIterations(loopIterationsRef.current)
      beginRun()
    } else {
      setPhase('finished')
      stopTicker()
    }
  }, [beginRun, loop])
  completeLoopRef.current = completeLoop

  const start = useCallback(() => {
    beginRun()
  }, [beginRun])

  const pause = useCallback(() => {
    if (phaseRef.current !== 'running' && phaseRef.current !== 'count-in') return
    if (phaseRef.current === 'count-in') {
      if (countInTimerRef.current !== null) {
        window.clearTimeout(countInTimerRef.current)
        countInTimerRef.current = null
      }
      countInRemainingRef.current = Math.max(0, countInEndsAtRef.current - performance.now())
      pausedFromCountInRef.current = true
      setPhase('paused')
      return
    }
    const core = mode === 'wait'
      ? waitCoreRef.current
      : mode === 'realtime'
        ? realtimeCoreRef.current
        : followCoreRef.current
    const measure = core?.currentUnit?.originalMeasure
    if (typeof measure === 'number') setInterruptionMeasures((current) => [...current, measure])
    stopTicker()
    pausedAtRef.current = performance.now()
    setPhase('paused')
  }, [mode, stopTicker])

  const resume = useCallback(() => {
    if (phaseRef.current !== 'paused') return
    if (pausedFromCountInRef.current) {
      pausedFromCountInRef.current = false
      const remaining = countInRemainingRef.current
      setPhase('count-in')
      countInEndsAtRef.current = performance.now() + remaining
      countInTimerRef.current = window.setTimeout(() => {
        countInTimerRef.current = null
        startTimeRef.current = performance.now()
        setPhase('running')
        startTicker()
      }, remaining)
      return
    }
    pausedTotalRef.current += performance.now() - pausedAtRef.current
    setPhase('running')
    startTicker()
  }, [startTicker])

  const stop = useCallback(() => {
    if (countInTimerRef.current !== null) {
      window.clearTimeout(countInTimerRef.current)
      countInTimerRef.current = null
    }
    stopTicker()
    pausedFromCountInRef.current = false
    countInRemainingRef.current = 0
    setPhase('idle')
  }, [stopTicker])

  const reset = useCallback(() => {
    stop()
    waitCoreRef.current?.reset()
    realtimeCoreRef.current?.reset()
    followCoreRef.current?.reset()
    setFeedback(null)
    setElapsedMs(0)
    loopIterationsRef.current = 0
    setLoopIterations(0)
    sync()
  }, [stop, sync])

  useMidiEventSubscription((event) => {
    if (phaseRef.current !== 'running' || event.type !== 'noteOn' || typeof event.midiNumber !== 'number') return
    if (lastEventIdRef.current !== null && event.id <= lastEventIdRef.current) return
    lastEventIdRef.current = event.id
    const midiNumber = event.midiNumber
    const sourceEventId = String(event.id)

    if (mode === 'wait') {
      const core = waitCoreRef.current
      if (!core || core.isComplete) return
      const outcome = core.processNoteOn(midiNumber, sourceEventId)
      setFeedback(outcome === 'wrong' ? 'wrong' : outcome === 'complete' ? 'correct' : null)
      sync()
      if (core.isComplete) completeLoop()
      return
    }

    if (mode === 'realtime') {
      const core = realtimeCoreRef.current
      if (!core || core.isComplete) return
      const elapsed = performance.now() - startTimeRef.current - pausedTotalRef.current
      const outcome = core.processNoteOn(midiNumber, elapsed, sourceEventId)
      setFeedback(outcome === 'wrong' ? 'wrong' : outcome === 'complete' ? 'correct' : outcome === 'correct' ? 'correct' : null)
      sync()
      if (core.isComplete) completeLoop()
      return
    }

    const core = followCoreRef.current
    if (!core || core.isComplete) return
    const elapsed = performance.now() - startTimeRef.current - pausedTotalRef.current
    const outcome = core.observeNoteOn(midiNumber, elapsed)
    setFeedback(outcome === 'wrong' ? 'wrong' : outcome === 'complete' ? 'correct' : 'correct')
    sync()
    if (core.isComplete) completeLoop()
  })

  useEffect(() => () => {
    stopTicker()
    if (countInTimerRef.current !== null) window.clearTimeout(countInTimerRef.current)
  }, [stopTicker])

  const report: ScorePracticeReport = buildPracticeSummaryMetrics(timeline, facts, tempoRatio, interruptionMeasures)
  const core = mode === 'wait' ? waitCoreRef.current : mode === 'realtime' ? realtimeCoreRef.current : followCoreRef.current

  return {
    phase,
    mode,
    timelineUnits: timeline.units.length,
    currentIndex,
    currentMeasure: core?.currentUnit?.measure ?? null,
    currentSourceEventIds: core?.currentUnit?.sourceEventIds ?? [],
    expectedMidi: core?.currentUnit?.expectedMidi ?? [],
    feedback,
    elapsedMs,
    loopIterations,
    facts,
    report,
    isRunning: phase === 'running',
    sessionActive: phase === 'count-in' || phase === 'running' || phase === 'paused',
    start,
    pause,
    resume,
    stop,
    reset
  }
}

interface ScorePracticeFactLike {
  unitId?: unknown
  outcome: unknown
  offsetMs?: unknown
  measure?: unknown
  beat?: unknown
  originalMeasure?: unknown
  originalBeat?: unknown
  practiceTick?: unknown
  expectedMidi?: unknown
  actualMidi?: unknown
  hand?: unknown
  staff?: unknown
  sourceEventIds?: unknown
}

function toFact(result: ScorePracticeFactLike): ScorePracticeFact {
  return {
    unitId: String(result.unitId ?? ''),
    outcome: String(result.outcome ?? ''),
    offsetMs: typeof result.offsetMs === 'number' ? result.offsetMs : undefined,
    measure: typeof result.measure === 'number' ? result.measure : undefined,
    beat: typeof result.beat === 'number' ? result.beat : undefined,
    originalMeasure: typeof result.originalMeasure === 'number'
      ? result.originalMeasure
      : typeof result.measure === 'number' ? result.measure : undefined,
    originalBeat: typeof result.originalBeat === 'number'
      ? result.originalBeat
      : typeof result.beat === 'number' ? result.beat : undefined,
    practiceTick: typeof result.practiceTick === 'number' ? result.practiceTick : undefined,
    expectedMidi: Array.isArray(result.expectedMidi) ? result.expectedMidi.map(Number) : [],
    actualMidi: typeof result.actualMidi === 'number' ? result.actualMidi : null,
    hand: typeof result.hand === 'string' ? result.hand : null,
    staff: typeof result.staff === 'number' ? result.staff : null,
    sourceEventIds: Array.isArray(result.sourceEventIds) ? result.sourceEventIds.map(String) : []
  }
}
