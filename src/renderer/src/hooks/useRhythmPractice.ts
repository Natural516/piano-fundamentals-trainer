import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MidiEventRecord } from '../types'
import {
  createJudgementResult,
  getToleranceMs,
  isInEarlyWindow,
  isInLateWindow,
  isInOnTimeWindow,
  isInsideRest
} from '../utils/judgement'
import type { JudgementResult, PracticeReport, TargetEvent, ToleranceLevel } from '../utils/practiceTypes'
import {
  RHYTHM_BEATS_PER_MEASURE,
  RHYTHM_PATTERNS,
  createRhythmTargets,
  getRhythmGridCells,
  getRhythmPatternById
} from '../utils/rhythmPatterns'
import type { RhythmDisplayResult, RhythmGridCell, RhythmPattern, RhythmPracticeReport } from '../utils/rhythmTypes'
import { useMetronome } from './useMetronome'
import { useMetronomeSound } from './useMetronomeSound'
import { usePracticeEngine } from './usePracticeEngine'

interface UseRhythmPracticeResult {
  patterns: RhythmPattern[]
  selectedPattern: RhythmPattern
  selectedPatternId: string
  setSelectedPatternId: (patternId: string) => void
  bpm: number
  setBpm: (bpm: number) => void
  toleranceLevel: ToleranceLevel
  setToleranceLevel: (level: ToleranceLevel) => void
  metronome: ReturnType<typeof useMetronome>
  metronomeSound: ReturnType<typeof useMetronomeSound>
  targets: TargetEvent[]
  cells: RhythmGridCell[]
  currentCellIndex: number
  currentTarget: TargetEvent | null
  latestResult: RhythmDisplayResult | null
  recentResults: RhythmDisplayResult[]
  report: RhythmPracticeReport
  isRunning: boolean
  isComplete: boolean
  start: () => void
  pause: () => void
  stop: () => void
  restart: () => void
}

function buildRhythmReport(baseReport: PracticeReport, extraInput: number): RhythmPracticeReport {
  const totalAttempts = baseReport.totalTargets + extraInput

  return {
    ...baseReport,
    extraInput,
    accuracy: totalAttempts > 0 ? Math.round((baseReport.correct / totalAttempts) * 100) : 0
  }
}

function isTargetFinalized(results: JudgementResult[], targetId: string): boolean {
  return results.some((result) => result.targetId === targetId)
}

function createExtraInputResult(event: MidiEventRecord, relativeTimeMs: number): JudgementResult | null {
  if (typeof event.midiNumber !== 'number') {
    return null
  }

  const target: TargetEvent = {
    id: `extra-input-${event.timestamp}`,
    timeMs: relativeTimeMs,
    notes: [],
    durationMs: 0,
    type: 'rest',
    label: '非目标输入'
  }

  return createJudgementResult('extra_note', target, [event.midiNumber], event.timestamp)
}

export function useRhythmPractice(latestMidiEvent: MidiEventRecord | null): UseRhythmPracticeResult {
  const metronome = useMetronome(60)
  const metronomeSound = useMetronomeSound(metronome)
  const [selectedPatternId, setSelectedPatternIdState] = useState(RHYTHM_PATTERNS[0].id)
  const [toleranceLevel, setToleranceLevelState] = useState<ToleranceLevel>('standard')
  const [extraResults, setExtraResults] = useState<JudgementResult[]>([])
  const extraResultsRef = useRef<JudgementResult[]>([])
  const lastExtraEventIdRef = useRef<number | null>(null)

  const selectedPattern = useMemo(() => getRhythmPatternById(selectedPatternId), [selectedPatternId])
  const cells = useMemo(() => getRhythmGridCells(selectedPattern), [selectedPattern])
  const targets = useMemo(
    () => createRhythmTargets(selectedPattern, metronome.beatDurationMs),
    [metronome.beatDurationMs, selectedPattern]
  )
  const practice = usePracticeEngine({
    targets,
    latestMidiEvent,
    metronome,
    toleranceLevel
  })

  const resetExtraResults = useCallback(() => {
    extraResultsRef.current = []
    lastExtraEventIdRef.current = null
    setExtraResults([])
  }, [])

  const setSelectedPatternId = useCallback(
    (patternId: string) => {
      if (metronome.status === 'running') {
        return
      }

      setSelectedPatternIdState(patternId)
      resetExtraResults()
      metronome.stop()
    },
    [metronome, resetExtraResults]
  )

  const setBpm = useCallback(
    (bpm: number) => {
      if (metronome.status === 'running') {
        return
      }

      metronome.setBpm(bpm)
    },
    [metronome]
  )

  const setToleranceLevel = useCallback(
    (level: ToleranceLevel) => {
      if (metronome.status === 'running') {
        return
      }

      setToleranceLevelState(level)
      resetExtraResults()
    },
    [metronome.status, resetExtraResults]
  )

  const start = useCallback(() => {
    void metronomeSound.prepare()

    if (metronome.status === 'paused') {
      metronome.start()
      return
    }

    resetExtraResults()
    practice.reset()
    metronome.restart()
  }, [metronome, metronomeSound, practice, resetExtraResults])

  const pause = useCallback(() => {
    metronome.pause()
  }, [metronome])

  const stop = useCallback(() => {
    metronome.stop()
  }, [metronome])

  const restart = useCallback(() => {
    void metronomeSound.prepare()
    resetExtraResults()
    practice.reset()
    metronome.restart()
  }, [metronome, metronomeSound, practice, resetExtraResults])

  useEffect(() => {
    if (practice.isComplete && metronome.isRunning) {
      metronome.pause()
    }
  }, [metronome, practice.isComplete])

  useEffect(() => {
    if (!latestMidiEvent || latestMidiEvent.type !== 'noteOn' || (latestMidiEvent.velocity ?? 0) <= 0) {
      return
    }

    if (!metronome.practiceStartTimestampMs || metronome.isCountingIn || metronome.status !== 'running' || practice.isComplete) {
      return
    }

    if (typeof latestMidiEvent.midiNumber !== 'number') {
      return
    }

    if (lastExtraEventIdRef.current === latestMidiEvent.id) {
      return
    }

    lastExtraEventIdRef.current = latestMidiEvent.id

    const relativeTimeMs = latestMidiEvent.timestamp - metronome.practiceStartTimestampMs

    if (relativeTimeMs < 0) {
      return
    }

    const toleranceMs = getToleranceMs(toleranceLevel)
    const restTarget = targets.find((target) => isInsideRest(target, relativeTimeMs))

    if (restTarget) {
      return
    }

    const noteTarget = targets.find((target) => {
      if (target.type !== 'note') {
        return false
      }

      return (
        isInOnTimeWindow(target, relativeTimeMs, toleranceMs) ||
        isInEarlyWindow(target, relativeTimeMs, toleranceMs) ||
        isInLateWindow(target, relativeTimeMs, toleranceMs)
      )
    })

    if (noteTarget && !isTargetFinalized(practice.results, noteTarget.id)) {
      const isExpectedNote = noteTarget.notes.includes(latestMidiEvent.midiNumber)

      if (isExpectedNote || isInOnTimeWindow(noteTarget, relativeTimeMs, toleranceMs)) {
        return
      }
    }

    const finalTarget = targets[targets.length - 1]
    const exerciseEndMs = finalTarget ? finalTarget.timeMs + (finalTarget.durationMs ?? metronome.beatDurationMs) : 0

    if (relativeTimeMs > exerciseEndMs) {
      return
    }

    const result = createExtraInputResult(latestMidiEvent, relativeTimeMs)

    if (!result) {
      return
    }

    extraResultsRef.current = [...extraResultsRef.current, result]
    setExtraResults(extraResultsRef.current)
  }, [
    latestMidiEvent,
    metronome.beatDurationMs,
    metronome.isCountingIn,
    metronome.practiceStartTimestampMs,
    metronome.status,
    practice.isComplete,
    practice.results,
    targets,
    toleranceLevel
  ])

  const currentCellIndex = useMemo(() => {
    if (metronome.status === 'idle' || metronome.isCountingIn || cells.length === 0) {
      return -1
    }

    const patternLengthBeats = selectedPattern.lengthBeats ?? RHYTHM_BEATS_PER_MEASURE
    const beatPosition = (metronome.practiceElapsedMs / metronome.beatDurationMs) % patternLengthBeats
    const currentIndex = cells.findIndex((cell) => beatPosition >= cell.position && beatPosition < cell.position + cell.duration)

    return currentIndex >= 0 ? currentIndex : cells.length - 1
  }, [cells, metronome.beatDurationMs, metronome.isCountingIn, metronome.practiceElapsedMs, metronome.status, selectedPattern.lengthBeats])

  const displayResults = useMemo<RhythmDisplayResult[]>(
    () => [
      ...practice.results.map((result) => ({ result, source: 'practice' as const })),
      ...extraResults.map((result) => ({ result, source: 'extra' as const }))
    ].sort((left, right) => right.result.timestamp - left.result.timestamp),
    [extraResults, practice.results]
  )
  const report = useMemo(
    () => buildRhythmReport(practice.report, extraResults.length),
    [extraResults.length, practice.report]
  )

  return {
    patterns: RHYTHM_PATTERNS,
    selectedPattern,
    selectedPatternId,
    setSelectedPatternId,
    bpm: metronome.bpm,
    setBpm,
    toleranceLevel,
    setToleranceLevel,
    metronome,
    metronomeSound,
    targets,
    cells,
    currentCellIndex,
    currentTarget: practice.currentTarget,
    latestResult: displayResults[0] ?? null,
    recentResults: displayResults.slice(0, 8),
    report,
    isRunning: metronome.status === 'running',
    isComplete: practice.isComplete,
    start,
    pause,
    stop,
    restart
  }
}
