import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ScoreDocument } from '../score/musicXmlTypes'
import { buildScoreTimeline } from '../score/scoreTimeline'
import { buildSegmentTimeline, type ScoreSegmentOptions } from '../score/scoreTimeline'
import { WaitScoreCore } from '../score/waitScoreCore'
import { RealtimeScoreCore, type RealtimeStepResult } from '../score/realtimeScoreCore'
import { FollowScoreCore, type FollowStepResult } from '../score/followScoreCore'
import { useMidiEventSubscription } from './useMidiEvents'

export type ScorePracticeMode = 'wait' | 'realtime' | 'follow'

export interface ScorePracticeReport {
  totalUnits: number
  correct: number
  wrong: number
  missing: number
  extra: number
  skipped: number
  accuracy: number
}

export interface UseScorePracticeResult {
  status: 'idle' | 'running' | 'finished'
  mode: ScorePracticeMode
  timelineUnits: number
  currentIndex: number
  expectedMidi: number[]
  feedback: 'correct' | 'wrong' | null
  elapsedMs: number
  results: Array<RealtimeStepResult | FollowStepResult | { unitId: string; outcome: string; offsetMs?: number }>
  report: ScorePracticeReport
  isRunning: boolean
  start: () => void
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
  const timeline = useMemo(
    () => (score ? (options.segment ? buildSegmentTimeline(score, options.segment) : buildScoreTimeline(score)) : { units: [] }),
    [options.segment, score]
  )
  const loop = options.loop ?? false
  const countInMs = options.countInMs ?? 0
  const tempoRatio = Math.min(2, Math.max(0.25, options.tempoRatio ?? 1))
  const msPerTick = useMemo(() => {
    if (!score) return 500
    const divisions = score.parts[0]?.measures.find((measure) => measure.divisions !== null)?.divisions ?? 1
    const bpm = score.defaultTempoBpm ?? 60
    return 60000 / Math.max(1, bpm) / Math.max(1, divisions ?? 1) / tempoRatio
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

  const [status, setStatus] = useState<'idle' | 'running' | 'finished'>('idle')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [results, setResults] = useState<UseScorePracticeResult['results']>([])
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const statusRef = useRef(status)
  statusRef.current = status
  const startTimeRef = useRef(0)
  const tickerRef = useRef<number | null>(null)
  const lastEventIdRef = useRef<number | null>(null)

  useEffect(() => {
    waitCoreRef.current = new WaitScoreCore(timeline)
    realtimeCoreRef.current = new RealtimeScoreCore(timeline, { beatDurationMs: 500, msPerTick })
    followCoreRef.current = new FollowScoreCore(timeline, { beatDurationMs: 500, msPerTick })
    setCurrentIndex(0)
    setResults([])
    setFeedback(null)
    setElapsedMs(0)
    setStatus('idle')
  }, [msPerTick, timeline])

  const sync = useCallback(() => {
    const core = mode === 'wait'
      ? waitCoreRef.current
      : mode === 'realtime'
        ? realtimeCoreRef.current
        : followCoreRef.current
    if (!core) return
    setCurrentIndex(core.currentIndex)
    setResults([...core.results])
  }, [mode])

  const stopTicker = useCallback(() => {
    if (tickerRef.current !== null) {
      window.clearInterval(tickerRef.current)
      tickerRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    waitCoreRef.current?.reset()
    realtimeCoreRef.current?.reset()
    followCoreRef.current?.reset()
    setResults([])
    setFeedback(null)
    setElapsedMs(0)
    startTimeRef.current = performance.now() + countInMs
    setStatus('running')
    sync()

    if (mode !== 'wait') {
      tickerRef.current = window.setInterval(() => {
        if (statusRef.current !== 'running') return
        const elapsed = performance.now() - startTimeRef.current
        setElapsedMs(elapsed)
        if (mode === 'realtime') {
          realtimeCoreRef.current?.advanceTo(elapsed)
          sync()
          if (realtimeCoreRef.current?.isComplete) {
            if (loop) start()
            else {
              setStatus('finished')
              stopTicker()
            }
          }
        }
      }, 40)
    }
  }, [countInMs, mode, stopTicker, sync])

  const stop = useCallback(() => {
    stopTicker()
    setStatus('idle')
  }, [stopTicker])

  const reset = useCallback(() => {
    stopTicker()
    waitCoreRef.current?.reset()
    realtimeCoreRef.current?.reset()
    followCoreRef.current?.reset()
    setStatus('idle')
    setFeedback(null)
    setElapsedMs(0)
    sync()
  }, [stopTicker, sync])

  useMidiEventSubscription((event) => {
    if (statusRef.current !== 'running' || event.type !== 'noteOn' || typeof event.midiNumber !== 'number') return
    if (lastEventIdRef.current !== null && event.id <= lastEventIdRef.current) return
    lastEventIdRef.current = event.id
    const midiNumber = event.midiNumber

    if (mode === 'wait') {
      const core = waitCoreRef.current
      if (!core || core.isComplete) return
      const outcome = core.processNoteOn(midiNumber)
      setFeedback(outcome === 'wrong' ? 'wrong' : outcome === 'complete' ? 'correct' : null)
      sync()
      if (core.isComplete) {
        if (loop) start()
        else setStatus('finished')
      }
      return
    }

    if (mode === 'realtime') {
      const core = realtimeCoreRef.current
      if (!core || core.isComplete) return
      const elapsed = performance.now() - startTimeRef.current
      const outcome = core.processNoteOn(midiNumber, elapsed)
      setFeedback(outcome === 'wrong' ? 'wrong' : outcome === 'complete' ? 'correct' : outcome === 'correct' ? 'correct' : null)
      sync()
      if (core.isComplete) {
        if (loop) start()
        else {
          setStatus('finished')
          stopTicker()
        }
      }
      return
    }

    const core = followCoreRef.current
    if (!core || core.isComplete) return
    const elapsed = performance.now() - startTimeRef.current
    const outcome = core.observeNoteOn(midiNumber, elapsed)
    setFeedback(outcome === 'wrong' ? 'wrong' : outcome === 'complete' ? 'correct' : 'correct')
    sync()
    if (core.isComplete) {
      if (loop) start()
      else {
        setStatus('finished')
        stopTicker()
      }
    }
  })

  useEffect(() => stopTicker, [stopTicker])

  const report: ScorePracticeReport = {
    totalUnits: timeline.units.length,
    correct: results.filter((entry) => entry.outcome === 'correct').length,
    wrong: results.filter((entry) => entry.outcome === 'wrong').length,
    missing: results.filter((entry) => entry.outcome === 'missing').length,
    extra: results.filter((entry) => entry.outcome === 'extra').length,
    skipped: results.filter((entry) => entry.outcome === 'skip').length,
    accuracy: timeline.units.length > 0
      ? Math.round((results.filter((entry) => entry.outcome === 'correct').length / timeline.units.length) * 100)
      : 0
  }
  const core = mode === 'wait' ? waitCoreRef.current : mode === 'realtime' ? realtimeCoreRef.current : followCoreRef.current

  return {
    status,
    mode,
    timelineUnits: timeline.units.length,
    currentIndex,
    expectedMidi: core?.currentUnit?.expectedMidi ?? [],
    feedback,
    elapsedMs,
    results,
    report,
    isRunning: status === 'running',
    start,
    stop,
    reset
  }
}
