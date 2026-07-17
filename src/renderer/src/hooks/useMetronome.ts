import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type MetronomeStatus = 'idle' | 'running' | 'paused'

export interface UseMetronomeResult {
  bpm: number
  setBpm: (bpm: number) => void
  status: MetronomeStatus
  isRunning: boolean
  isCountingIn: boolean
  elapsedMs: number
  practiceElapsedMs: number
  practiceStartTimestampMs: number | null
  beatDurationMs: number
  measureDurationMs: number
  beatsPerMeasure: number
  currentMeasure: number
  currentBeat: number
  countInBeat: number
  start: () => void
  pause: () => void
  stop: () => void
  restart: () => void
}

const DEFAULT_BPM = 60
const MIN_BPM = 40
const MAX_BPM = 200
const BEATS_PER_MEASURE = 4

function clampBpm(value: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value)))
}

export function useMetronome(initialBpm = DEFAULT_BPM): UseMetronomeResult {
  const [bpm, setBpmState] = useState(() => clampBpm(initialBpm))
  const [status, setStatus] = useState<MetronomeStatus>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const animationFrameRef = useRef<number | null>(null)
  const runStartedAtRef = useRef(0)
  const elapsedBeforeRunRef = useRef(0)
  const elapsedRef = useRef(0)

  const beatDurationMs = 60000 / bpm
  const measureDurationMs = beatDurationMs * BEATS_PER_MEASURE
  const countInDurationMs = measureDurationMs
  const isRunning = status === 'running'
  const isCountingIn = status !== 'idle' && elapsedMs < countInDurationMs
  const practiceElapsedMs = Math.max(0, elapsedMs - countInDurationMs)
  const practiceStartTimestampMs = status === 'idle' ? null : runStartedAtRef.current - elapsedBeforeRunRef.current + countInDurationMs

  const currentBeat = useMemo(() => {
    if (status === 'idle') {
      return 1
    }

    const positionMs = isCountingIn ? elapsedMs : practiceElapsedMs
    return Math.floor(positionMs / beatDurationMs) % BEATS_PER_MEASURE + 1
  }, [beatDurationMs, elapsedMs, isCountingIn, practiceElapsedMs, status])

  const currentMeasure = useMemo(() => {
    if (status === 'idle' || isCountingIn) {
      return 0
    }

    return Math.floor(practiceElapsedMs / measureDurationMs) + 1
  }, [isCountingIn, measureDurationMs, practiceElapsedMs, status])

  const countInBeat = useMemo(() => {
    if (!isCountingIn) {
      return 0
    }

    return Math.floor(elapsedMs / beatDurationMs) % BEATS_PER_MEASURE + 1
  }, [beatDurationMs, elapsedMs, isCountingIn])

  const setBpm = useCallback((nextBpm: number) => {
    setBpmState(clampBpm(nextBpm))
  }, [])

  const updateElapsed = useCallback(() => {
    const nextElapsed = elapsedBeforeRunRef.current + Date.now() - runStartedAtRef.current
    elapsedRef.current = nextElapsed
    setElapsedMs(nextElapsed)
    animationFrameRef.current = window.requestAnimationFrame(updateElapsed)
  }, [])

  const start = useCallback(() => {
    if (status === 'running') {
      return
    }

    runStartedAtRef.current = Date.now()
    elapsedBeforeRunRef.current = status === 'paused' ? elapsedRef.current : 0
    setStatus('running')
  }, [status])

  const pause = useCallback(() => {
    if (status !== 'running') {
      return
    }

    elapsedBeforeRunRef.current = elapsedRef.current
    setStatus('paused')
  }, [status])

  const stop = useCallback(() => {
    elapsedBeforeRunRef.current = 0
    elapsedRef.current = 0
    runStartedAtRef.current = 0
    setElapsedMs(0)
    setStatus('idle')
  }, [])

  const restart = useCallback(() => {
    elapsedBeforeRunRef.current = 0
    elapsedRef.current = 0
    runStartedAtRef.current = Date.now()
    setElapsedMs(0)
    setStatus('running')
  }, [])

  useEffect(() => {
    if (status !== 'running') {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      return
    }

    animationFrameRef.current = window.requestAnimationFrame(updateElapsed)

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [status, updateElapsed])

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  return {
    bpm,
    setBpm,
    status,
    isRunning,
    isCountingIn,
    elapsedMs,
    practiceElapsedMs,
    practiceStartTimestampMs,
    beatDurationMs,
    measureDurationMs,
    beatsPerMeasure: BEATS_PER_MEASURE,
    currentMeasure,
    currentBeat,
    countInBeat,
    start,
    pause,
    stop,
    restart
  }
}
