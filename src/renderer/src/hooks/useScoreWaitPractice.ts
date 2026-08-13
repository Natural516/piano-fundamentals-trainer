import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ScoreDocument } from '../score/musicXmlTypes'
import { buildScoreTimeline } from '../score/scoreTimeline'
import { WaitScoreCore, type WaitStepResult } from '../score/waitScoreCore'
import { useMidiEventSubscription } from './useMidiEvents'

type ScoreWaitStatus = 'idle' | 'running' | 'finished'

export interface ScoreWaitReport {
  totalUnits: number
  correct: number
  wrong: number
  skipped: number
  accuracy: number
}

export interface UseScoreWaitPracticeResult {
  status: ScoreWaitStatus
  timelineUnits: number
  currentIndex: number
  expectedMidi: number[]
  feedback: 'correct' | 'wrong' | null
  results: WaitStepResult[]
  report: ScoreWaitReport
  isRunning: boolean
  start: () => void
  stop: () => void
  reset: () => void
}

export function useScoreWaitPractice(score: ScoreDocument | null): UseScoreWaitPracticeResult {
  const timeline = useMemo(() => (score ? buildScoreTimeline(score) : { units: [] }), [score])
  const coreRef = useRef<WaitScoreCore | null>(null)
  if (coreRef.current === null) {
    coreRef.current = new WaitScoreCore(timeline)
  }
  const [status, setStatus] = useState<ScoreWaitStatus>('idle')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [results, setResults] = useState<WaitStepResult[]>([])
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const statusRef = useRef(status)
  statusRef.current = status

  useEffect(() => {
    coreRef.current = new WaitScoreCore(timeline)
    setCurrentIndex(0)
    setResults([])
    setFeedback(null)
    setStatus('idle')
  }, [timeline])

  const sync = useCallback(() => {
    const core = coreRef.current
    if (!core) return
    setCurrentIndex(core.currentIndex)
    setResults([...core.results])
  }, [])

  const start = useCallback(() => {
    const core = coreRef.current
    if (!core) return
    core.reset()
    setResults([])
    setFeedback(null)
    setStatus('running')
    sync()
  }, [sync])

  const stop = useCallback(() => {
    setStatus('idle')
  }, [])

  const reset = useCallback(() => {
    coreRef.current?.reset()
    setStatus('idle')
    setFeedback(null)
    sync()
  }, [sync])

  useMidiEventSubscription((event) => {
    if (statusRef.current !== 'running' || event.type !== 'noteOn' || typeof event.midiNumber !== 'number') return

    const core = coreRef.current
    if (!core || core.isComplete) return
    const outcome = core.processNoteOn(event.midiNumber)
    setFeedback(outcome === 'wrong' ? 'wrong' : outcome === 'complete' ? 'correct' : null)
    sync()

    if (core.isComplete) {
      setStatus('finished')
    }
  })

  const core = coreRef.current
  const report: ScoreWaitReport = {
    totalUnits: timeline.units.length,
    correct: results.filter((entry) => entry.outcome === 'correct').length,
    wrong: results.filter((entry) => entry.outcome === 'wrong').length,
    skipped: results.filter((entry) => entry.outcome === 'skip').length,
    accuracy: timeline.units.length > 0
      ? Math.round((results.filter((entry) => entry.outcome === 'correct').length / timeline.units.length) * 100)
      : 0
  }

  return {
    status,
    timelineUnits: timeline.units.length,
    currentIndex,
    expectedMidi: core?.currentUnit?.expectedMidi ?? [],
    feedback,
    results,
    report,
    isRunning: status === 'running',
    start,
    stop,
    reset
  }
}
