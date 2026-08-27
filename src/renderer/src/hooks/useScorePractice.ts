import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ScoreDocument } from '../score/musicXmlTypes'
import { buildScoreTimeline } from '../score/scoreTimeline'
import { buildSegmentTimeline, type ScoreSegmentOptions } from '../score/scoreTimeline'
import { INTERNAL_PPQ, buildScoreTimeV2, scoreTickSpanToMilliseconds } from '../score/scoreTimeV2'
import { buildPracticeSegment } from '../score/practiceSegmentBuilder'
import { WaitScoreCore } from '../score/waitScoreCore'
import { RealtimeScoreCore } from '../score/realtimeScoreCore'
import { FollowScoreCore } from '../score/followScoreCore'
import { getLastMidiEventId } from '../midi/midiEventBus'
import { useMidiEventSubscription, useMidiPanicSubscription } from './useMidiEvents'
import { buildPracticeSummaryMetrics } from '../records/practiceMetrics'
import type { PerMeasurePracticeMetrics } from '../records/practiceRecordV2'
import { practiceSessionRepository } from '../records/practiceSessionRepository'

export type ScorePracticeMode = 'wait' | 'realtime' | 'follow'
export type ScorePracticePhase = 'idle' | 'count-in' | 'running' | 'paused' | 'finished' | 'stopped'

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

export interface ScorePracticeIteration {
  index: number
  completedAt: string
  facts: ScorePracticeFact[]
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
  sessionId: string | null
  iterations: ScorePracticeIteration[]
  completionState: 'completed' | 'stopped' | 'interrupted_device' | null
  interruptionReason: string | null
  sessionError: string | null
  facts: ScorePracticeFact[]
  report: ScorePracticeReport
  isRunning: boolean
  sessionActive: boolean
  start: () => void
  pause: () => void
  resume: () => void
  stop: () => void
  interruptDevice: () => void
  commitSession: () => boolean
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
  const tickToMs = useMemo(() => {
    if (!score) return (tick: number): number => tick * msPerTick
    const scoreTime = buildScoreTimeV2(score)
    const segment = buildPracticeSegment(score, {
      startMeasure: segmentStartMeasure,
      endMeasure: segmentEndMeasure,
      handMode: segmentHandMode
    })
    return (practiceTick: number): number => scoreTickSpanToMilliseconds(
      segment.sourceStartAbsoluteTick,
      segment.sourceStartAbsoluteTick + practiceTick,
      scoreTime.tempoMap,
      tempoRatio
    )
  }, [msPerTick, score, segmentEndMeasure, segmentHandMode, segmentStartMeasure, tempoRatio])

  const waitCoreRef = useRef<WaitScoreCore | null>(null)
  const realtimeCoreRef = useRef<RealtimeScoreCore | null>(null)
  const followCoreRef = useRef<FollowScoreCore | null>(null)
  if (waitCoreRef.current === null) waitCoreRef.current = new WaitScoreCore(timeline)
  if (realtimeCoreRef.current === null) {
    realtimeCoreRef.current = new RealtimeScoreCore(timeline, { beatDurationMs: 500, msPerTick, tickToMs })
  }
  if (followCoreRef.current === null) {
    followCoreRef.current = new FollowScoreCore(timeline, { beatDurationMs: 500, msPerTick, tickToMs })
  }

  const [phase, setPhase] = useState<ScorePracticePhase>('idle')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [facts, setFacts] = useState<ScorePracticeFact[]>([])
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [loopIterations, setLoopIterations] = useState(0)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [iterations, setIterations] = useState<ScorePracticeIteration[]>([])
  const [completionState, setCompletionState] = useState<'completed' | 'stopped' | 'interrupted_device' | null>(null)
  const [interruptionReason, setInterruptionReason] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
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
  const sessionIdRef = useRef<string | null>(null)
  const completedIterationsRef = useRef<ScorePracticeIteration[]>([])
  const lastCheckpointMeasureRef = useRef<number | null>(null)
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
    realtimeCoreRef.current = new RealtimeScoreCore(timeline, { beatDurationMs: 500, msPerTick, tickToMs })
    followCoreRef.current = new FollowScoreCore(timeline, { beatDurationMs: 500, msPerTick, tickToMs })
    setCurrentIndex(0)
    setFacts([])
    setFeedback(null)
    setElapsedMs(0)
    setLoopIterations(0)
    setSessionId(null)
    setIterations([])
    setCompletionState(null)
    setInterruptionReason(null)
    setSessionError(null)
    setInterruptionMeasures([])
    countInRemainingRef.current = 0
    pausedFromCountInRef.current = false
    pausedTotalRef.current = 0
    pausedAtRef.current = 0
    lastEventIdRef.current = null
    loopIterationsRef.current = 0
    sessionIdRef.current = null
    completedIterationsRef.current = []
    lastCheckpointMeasureRef.current = null
    setPhase('idle')
  }, [msPerTick, tickToMs, timeline])

  const sync = useCallback(() => {
    const core = mode === 'wait'
      ? waitCoreRef.current
      : mode === 'realtime'
        ? realtimeCoreRef.current
        : followCoreRef.current
    if (!core) return
    const currentFacts = core.results.map(toFact)
    const combinedFacts = [...completedIterationsRef.current.flatMap((iteration) => iteration.facts), ...currentFacts]
    setCurrentIndex(core.currentIndex)
    setFacts(combinedFacts)
    const currentMeasure = core.currentUnit?.originalMeasure ?? null
    if (
      sessionIdRef.current &&
      lastCheckpointMeasureRef.current !== null &&
      currentMeasure !== null &&
      currentMeasure !== lastCheckpointMeasureRef.current
    ) {
      practiceSessionRepository.checkpoint(sessionIdRef.current, { facts: combinedFacts, state: 'ACTIVE' })
    }
    lastCheckpointMeasureRef.current = currentMeasure
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
    stopTicker()
    waitCoreRef.current?.reset()
    realtimeCoreRef.current?.reset()
    followCoreRef.current?.reset()
    setFacts(completedIterationsRef.current.flatMap((iteration) => iteration.facts))
    setFeedback(null)
    setElapsedMs(0)
    pausedTotalRef.current = 0
    pausedAtRef.current = 0
    pausedFromCountInRef.current = false
    lastEventIdRef.current = null
    lastCheckpointMeasureRef.current = null
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
  }, [countInMs, startTicker, stopTicker, sync])

  const completeLoop = useCallback(() => {
    const core = mode === 'wait'
      ? waitCoreRef.current
      : mode === 'realtime'
        ? realtimeCoreRef.current
        : followCoreRef.current
    const iteration: ScorePracticeIteration = {
      index: completedIterationsRef.current.length + 1,
      completedAt: new Date().toISOString(),
      facts: core?.results.map(toFact) ?? []
    }
    completedIterationsRef.current = [...completedIterationsRef.current, iteration]
    setIterations(completedIterationsRef.current)
    const allFacts = completedIterationsRef.current.flatMap((entry) => entry.facts)
    setFacts(allFacts)
    if (sessionIdRef.current) {
      practiceSessionRepository.checkpoint(sessionIdRef.current, {
        facts: allFacts,
        completedIteration: iteration,
        state: loop ? 'ACTIVE' : 'COMPLETED',
        completionState: loop ? null : 'completed'
      })
    }
    if (loop) {
      loopIterationsRef.current += 1
      setLoopIterations(loopIterationsRef.current)
      beginRun()
    } else {
      if (sessionIdRef.current) {
        const finished = practiceSessionRepository.finish(sessionIdRef.current, 'completed', allFacts)
        if (!finished.success) setSessionError(finished.error ?? finished.reason ?? '练习会话完成状态保存失败')
      }
      setCompletionState('completed')
      setPhase('finished')
      stopTicker()
    }
  }, [beginRun, loop, mode, stopTicker])
  completeLoopRef.current = completeLoop

  const start = useCallback(() => {
    if (!score || timeline.units.length === 0) return
    if (score.trainingProfile?.trainingSafe !== true) {
      setSessionError('曲谱未通过 Piano Training MusicXML Profile v1，不能进入严格练习。')
      setPhase('idle')
      return
    }
    if (countInTimerRef.current !== null) {
      window.clearTimeout(countInTimerRef.current)
      countInTimerRef.current = null
    }
    stopTicker()
    completedIterationsRef.current = []
    setIterations([])
    setFacts([])
    loopIterationsRef.current = 0
    setLoopIterations(0)
    setCompletionState(null)
    setInterruptionReason(null)
    setSessionError(null)
    setInterruptionMeasures([])
    const created = practiceSessionRepository.start({
      practiceType: 'score',
      scoreId: score.title || null,
      exerciseId: score.title || null,
      mode,
      startMeasure: segmentStartMeasure ?? timeline.units[0]?.originalMeasure ?? null,
      endMeasure: segmentEndMeasure ?? timeline.units[timeline.units.length - 1]?.originalMeasure ?? null,
      handMode: segmentHandMode ?? 'both',
      tempo: score.defaultTempoBpm,
      tempoRatio
    })
    if (!created.success || !created.value) {
      setSessionError(created.error ?? created.reason ?? '无法创建练习会话')
      setPhase('idle')
      return
    }
    sessionIdRef.current = created.value.sessionId
    setSessionId(created.value.sessionId)
    beginRun()
  }, [beginRun, mode, score, segmentEndMeasure, segmentHandMode, segmentStartMeasure, stopTicker, tempoRatio, timeline.units])

  const pause = useCallback(() => {
    if (phaseRef.current !== 'running' && phaseRef.current !== 'count-in') return
    if (phaseRef.current === 'count-in') {
      if (countInTimerRef.current !== null) {
        window.clearTimeout(countInTimerRef.current)
        countInTimerRef.current = null
      }
      countInRemainingRef.current = Math.max(0, countInEndsAtRef.current - performance.now())
      pausedFromCountInRef.current = true
      if (sessionIdRef.current) {
        const paused = practiceSessionRepository.pause(
          sessionIdRef.current,
          completedIterationsRef.current.flatMap((iteration) => iteration.facts)
        )
        if (!paused.success) setSessionError(paused.error ?? paused.reason ?? '暂停检查点保存失败')
      }
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
    if (sessionIdRef.current) {
      const currentFacts = core?.results.map(toFact) ?? []
      const paused = practiceSessionRepository.pause(
        sessionIdRef.current,
        [...completedIterationsRef.current.flatMap((iteration) => iteration.facts), ...currentFacts]
      )
      if (!paused.success) setSessionError(paused.error ?? paused.reason ?? '暂停检查点保存失败')
    }
    setPhase('paused')
  }, [mode, stopTicker])

  const resume = useCallback(() => {
    if (phaseRef.current !== 'paused') return
    if (pausedFromCountInRef.current) {
      pausedFromCountInRef.current = false
      const remaining = countInRemainingRef.current
      setPhase('count-in')
      if (sessionIdRef.current) {
        const resumed = practiceSessionRepository.checkpoint(sessionIdRef.current, { state: 'ACTIVE' })
        if (!resumed.success) setSessionError(resumed.error ?? resumed.reason ?? '恢复检查点保存失败')
      }
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
    if (sessionIdRef.current) {
      const resumed = practiceSessionRepository.checkpoint(sessionIdRef.current, { state: 'ACTIVE' })
      if (!resumed.success) setSessionError(resumed.error ?? resumed.reason ?? '恢复检查点保存失败')
    }
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
    const core = mode === 'wait'
      ? waitCoreRef.current
      : mode === 'realtime'
        ? realtimeCoreRef.current
        : followCoreRef.current
    const currentFacts = core?.results.map(toFact) ?? []
    let nextIterations = completedIterationsRef.current
    if (currentFacts.length > 0) {
      nextIterations = [...nextIterations, {
        index: nextIterations.length + 1,
        completedAt: new Date().toISOString(),
        facts: currentFacts
      }]
      completedIterationsRef.current = nextIterations
      setIterations(nextIterations)
    }
    const allFacts = nextIterations.length > 0
      ? nextIterations.flatMap((iteration) => iteration.facts)
      : currentFacts
    setFacts(allFacts)
    const nextCompletionState = interruptionReason ? 'interrupted_device' : 'stopped'
    if (sessionIdRef.current) {
      const finished = practiceSessionRepository.finish(sessionIdRef.current, nextCompletionState, allFacts)
      if (!finished.success) setSessionError(finished.error ?? finished.reason ?? '停止状态保存失败')
    }
    setCompletionState(nextCompletionState)
    setPhase('stopped')
  }, [interruptionReason, mode, stopTicker])

  const interruptDevice = useCallback(() => {
    if (phaseRef.current !== 'running' && phaseRef.current !== 'count-in' && phaseRef.current !== 'paused') return
    if (phaseRef.current !== 'paused') pause()
    const core = mode === 'wait'
      ? waitCoreRef.current
      : mode === 'realtime'
        ? realtimeCoreRef.current
        : followCoreRef.current
    const currentFacts = core?.results.map(toFact) ?? []
    const allFacts = [...completedIterationsRef.current.flatMap((iteration) => iteration.facts), ...currentFacts]
    setInterruptionReason('midi_device_disconnected')
    setCompletionState('interrupted_device')
    if (sessionIdRef.current) {
      const interrupted = practiceSessionRepository.interruptDevice(sessionIdRef.current, allFacts)
      if (!interrupted.success) setSessionError(interrupted.error ?? interrupted.reason ?? '设备断线检查点保存失败')
    }
  }, [mode, pause])

  const commitSession = useCallback((): boolean => {
    if (!sessionIdRef.current) return false
    const committed = practiceSessionRepository.commit(sessionIdRef.current)
    if (!committed.success) {
      setSessionError(committed.error ?? committed.reason ?? '练习会话提交失败')
      return false
    }
    if (phaseRef.current === 'stopped') setPhase('idle')
    return true
  }, [])

  const reset = useCallback(() => {
    if (phaseRef.current === 'running' || phaseRef.current === 'count-in' || phaseRef.current === 'paused') stop()
    waitCoreRef.current?.reset()
    realtimeCoreRef.current?.reset()
    followCoreRef.current?.reset()
    setFeedback(null)
    setElapsedMs(0)
    loopIterationsRef.current = 0
    setLoopIterations(0)
    completedIterationsRef.current = []
    setIterations([])
    setFacts([])
    setCompletionState(null)
    setInterruptionReason(null)
    setSessionId(null)
    sessionIdRef.current = null
    setPhase('idle')
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

  useMidiPanicSubscription(() => {
    waitCoreRef.current?.clearTransientInput()
    realtimeCoreRef.current?.clearTransientInput()
    followCoreRef.current?.clearTransientInput()
    lastEventIdRef.current = getLastMidiEventId()
    setFeedback(null)
  })

  useEffect(() => () => {
    const core = mode === 'wait'
      ? waitCoreRef.current
      : mode === 'realtime'
        ? realtimeCoreRef.current
        : followCoreRef.current
    if (sessionIdRef.current && (phaseRef.current === 'running' || phaseRef.current === 'count-in' || phaseRef.current === 'paused')) {
      const currentFacts = core?.results.map(toFact) ?? []
      practiceSessionRepository.checkpoint(sessionIdRef.current, {
        facts: [...completedIterationsRef.current.flatMap((iteration) => iteration.facts), ...currentFacts],
        state: phaseRef.current === 'paused' ? 'PAUSED' : 'ACTIVE',
        interruptionReason: 'application_closed_before_commit'
      })
    }
    stopTicker()
    if (countInTimerRef.current !== null) window.clearTimeout(countInTimerRef.current)
  }, [mode, stopTicker])

  const reportIterationCount = Math.max(1, iterations.length)
  const report: ScorePracticeReport = buildPracticeSummaryMetrics(
    timeline,
    facts,
    tempoRatio,
    interruptionMeasures,
    reportIterationCount
  )
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
    sessionId,
    iterations,
    completionState,
    interruptionReason,
    sessionError,
    facts,
    report,
    isRunning: phase === 'running',
    sessionActive: phase === 'count-in' || phase === 'running' || phase === 'paused',
    start,
    pause,
    resume,
    stop,
    interruptDevice,
    commitSession,
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
