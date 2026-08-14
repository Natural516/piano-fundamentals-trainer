import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ScoreDocument, ScoreNoteModel, ScoreTimeline } from '../score/musicXmlTypes'
import { buildScoreTimeline } from '../score/scoreTimeline'
import { buildSegmentTimeline, type ScoreSegmentOptions } from '../score/scoreTimeline'
import { INTERNAL_PPQ } from '../score/scoreTimeV2'
import { buildPracticeSegment } from '../score/practiceSegmentBuilder'
import { WaitScoreCore } from '../score/waitScoreCore'
import { RealtimeScoreCore } from '../score/realtimeScoreCore'
import { FollowScoreCore } from '../score/followScoreCore'
import { useMidiEventSubscription } from './useMidiEvents'

export type ScorePracticeMode = 'wait' | 'realtime' | 'follow'
export type ScorePracticePhase = 'idle' | 'count-in' | 'running' | 'paused' | 'finished'

export interface ScorePracticeReport {
  totalUnits: number
  correct: number
  wrong: number
  missing: number
  extra: number
  skipped: number
  accuracy: number
}

export interface ScorePracticeFact {
  unitId: string
  outcome: string
  offsetMs?: number
  measure?: number
  beat?: number
  expectedMidi: number[]
  actualMidi: number | null
  hand?: string | null
  sourceEventIds: string[]
}

export interface UseScorePracticeResult {
  phase: ScorePracticePhase
  mode: ScorePracticeMode
  timelineUnits: number
  currentIndex: number
  expectedMidi: number[]
  feedback: 'correct' | 'wrong' | null
  elapsedMs: number
  loopIterations: number
  facts: ScorePracticeFact[]
  report: ScorePracticeReport
  isRunning: boolean
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
  const timeline = useMemo(() => {
    if (!score) return { units: [] }
    if (!options.segment) return buildScoreTimeline(score)
    const segment = buildPracticeSegment(score, options.segment)
    return buildSegmentTimelineFromSegment(segment)
  }, [options.segment, score])
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
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const startTimeRef = useRef(0)
  const pausedAtRef = useRef(0)
  const pausedTotalRef = useRef(0)
  const tickerRef = useRef<number | null>(null)
  const countInTimerRef = useRef<number | null>(null)
  const lastEventIdRef = useRef<number | null>(null)
  const loopIterationsRef = useRef(0)
  const completeLoopRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    waitCoreRef.current = new WaitScoreCore(timeline)
    realtimeCoreRef.current = new RealtimeScoreCore(timeline, { beatDurationMs: 500, msPerTick })
    followCoreRef.current = new FollowScoreCore(timeline, { beatDurationMs: 500, msPerTick })
    setCurrentIndex(0)
    setFacts([])
    setFeedback(null)
    setElapsedMs(0)
    setLoopIterations(0)
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
    pausedTotalRef.current = 0
    pausedAtRef.current = 0
    lastEventIdRef.current = null
    if (countInMs > 0) {
      setPhase('count-in')
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
    if (phaseRef.current !== 'running') return
    stopTicker()
    pausedAtRef.current = performance.now()
    setPhase('paused')
  }, [stopTicker])

  const resume = useCallback(() => {
    if (phaseRef.current !== 'paused') return
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

  useEffect(() => stopTicker, [stopTicker])

  const report: ScorePracticeReport = {
    totalUnits: timeline.units.length,
    correct: facts.filter((entry) => entry.outcome === 'correct').length,
    wrong: facts.filter((entry) => entry.outcome === 'wrong').length,
    missing: facts.filter((entry) => entry.outcome === 'missing').length,
    extra: facts.filter((entry) => entry.outcome === 'extra').length,
    skipped: facts.filter((entry) => entry.outcome === 'skip').length,
    accuracy: timeline.units.length > 0
      ? Math.round((facts.filter((entry) => entry.outcome === 'correct').length / timeline.units.length) * 100)
      : 0
  }
  const core = mode === 'wait' ? waitCoreRef.current : mode === 'realtime' ? realtimeCoreRef.current : followCoreRef.current

  return {
    phase,
    mode,
    timelineUnits: timeline.units.length,
    currentIndex,
    expectedMidi: core?.currentUnit?.expectedMidi ?? [],
    feedback,
    elapsedMs,
    loopIterations,
    facts,
    report,
    isRunning: phase === 'running',
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
  expectedMidi?: unknown
  actualMidi?: unknown
  hand?: unknown
  sourceEventIds?: unknown
}

function toFact(result: ScorePracticeFactLike): ScorePracticeFact {
  return {
    unitId: String(result.unitId ?? ''),
    outcome: String(result.outcome ?? ''),
    offsetMs: typeof result.offsetMs === 'number' ? result.offsetMs : undefined,
    measure: typeof result.measure === 'number' ? result.measure : undefined,
    beat: typeof result.beat === 'number' ? result.beat : undefined,
    expectedMidi: Array.isArray(result.expectedMidi) ? result.expectedMidi.map(Number) : [],
    actualMidi: typeof result.actualMidi === 'number' ? result.actualMidi : null,
    hand: typeof result.hand === 'string' ? result.hand : null,
    sourceEventIds: Array.isArray(result.sourceEventIds) ? result.sourceEventIds.map(String) : []
  }
}

function buildSegmentTimelineFromSegment(segment: ReturnType<typeof buildPracticeSegment>): ScoreTimeline {
  return {
    units: segment.expectedUnits.map((unit, index) => ({
      id: `seg-${unit.originalMeasure}-${unit.practiceTick}`,
      onsetIndex: index,
      expectedTick: unit.practiceTick,
      measure: unit.originalMeasure,
      notes: unit.events.map((event) => ({
        id: `seg-${index}-${event.midiPitch ?? 'rest'}`,
        type: (event.midiPitch === null ? 'rest' : 'note') as ScoreNoteModel['type'],
        midiNumber: event.midiPitch,
        step: '',
        alter: 0,
        octave: 4,
        duration: event.duration,
        voice: event.voice,
        staff: event.staff,
        isChordTone: event.type === 'chord',
        tieStart: event.tieStart,
        tieStop: event.tieStop,
        accidental: null
      })),
      tieStart: unit.tieStart,
      rest: unit.rest,
      expectedMidi: unit.expectedMidi
    }))
  }
}
