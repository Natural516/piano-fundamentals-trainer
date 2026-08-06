import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MidiEventRecord } from '../types'
import { createJudgementResult, getToleranceMs, isSameNoteSet } from '../utils/judgement'
import type { JudgementResult, JudgementType, TargetEvent, ToleranceLevel } from '../utils/practiceTypes'
import {
  MAJOR_SCALE_PATTERNS,
  SCALE_PRACTICE_MODES,
  createScalePracticeSteps,
  createScaleTargets,
  getMajorScaleByKey,
  getScalePracticeModeName
} from '../utils/scalePatterns'
import type {
  MajorScaleKey,
  MajorScalePattern,
  ScaleNotesPerBeat,
  ScalePracticeMode,
  ScalePracticeReport,
  ScalePracticeStep,
  ScaleRange
} from '../utils/scaleTypes'
import { useMetronome } from './useMetronome'
import { useMetronomeSound } from './useMetronomeSound'

interface TargetFlags {
  wrongRecorded: boolean
  missingRecorded: boolean
}

interface PendingInput {
  notes: number[]
  firstRelativeTimeMs: number
  timestamp: number
}

interface UseScalePracticeResult {
  scales: MajorScalePattern[]
  modes: typeof SCALE_PRACTICE_MODES
  selectedKey: MajorScaleKey
  selectedScale: MajorScalePattern
  setSelectedKey: (key: MajorScaleKey) => void
  selectedMode: ScalePracticeMode
  selectedModeName: string
  setSelectedMode: (mode: ScalePracticeMode) => void
  range: ScaleRange
  setRange: (range: ScaleRange) => void
  loopCount: number
  setLoopCount: (loopCount: number) => void
  notesPerBeat: ScaleNotesPerBeat
  setNotesPerBeat: (notesPerBeat: ScaleNotesPerBeat) => void
  bpm: number
  setBpm: (bpm: number) => void
  toleranceLevel: ToleranceLevel
  setToleranceLevel: (level: ToleranceLevel) => void
  metronome: ReturnType<typeof useMetronome>
  metronomeSound: ReturnType<typeof useMetronomeSound>
  steps: ScalePracticeStep[]
  currentStepIndex: number
  currentStep: ScalePracticeStep | null
  latestResult: JudgementResult | null
  recentResults: JudgementResult[]
  report: ScalePracticeReport
  targetNotes: number[]
  correctNotes: number[]
  wrongNotes: number[]
  isRunning: boolean
  isComplete: boolean
  start: () => void
  pause: () => void
  stop: () => void
  restart: () => void
}

const CHORD_INPUT_WINDOW_MS = 120

function createEmptyReport(
  keyName: string,
  modeName: string,
  bpm: number,
  totalNotes: number,
  completedNotes: number,
  range: ScaleRange,
  loopCount: number,
  notesPerBeat: ScaleNotesPerBeat
): ScalePracticeReport {
  return {
    keyName,
    modeName,
    bpm,
    targetBpm: bpm,
    loopCount,
    completedNotes,
    range,
    notesPerBeat,
    totalNotes,
    totalTargets: totalNotes,
    correct: 0,
    wrongNote: 0,
    missingNote: 0,
    extraNote: 0,
    early: 0,
    late: 0,
    restError: 0,
    averageOffsetMs: 0,
    accuracy: 0,
    bestStreak: 0,
    mostMissedNote: '暂无'
  }
}

function createTargetFlagMap(targets: TargetEvent[]): Record<string, TargetFlags> {
  return Object.fromEntries(targets.map((target) => [
    target.id,
    {
      wrongRecorded: false,
      missingRecorded: false
    }
  ]))
}

function buildScaleReport(
  results: JudgementResult[],
  targets: TargetEvent[],
  keyName: string,
  modeName: string,
  bpm: number,
  completedNotes: number,
  range: ScaleRange,
  loopCount: number,
  notesPerBeat: ScaleNotesPerBeat
): ScalePracticeReport {
  const report = createEmptyReport(
    keyName,
    modeName,
    bpm,
    targets.length,
    completedNotes,
    range,
    loopCount,
    notesPerBeat
  )
  const offsets = results
    .map((result) => result.timeOffsetMs)
    .filter((offset): offset is number => typeof offset === 'number')
  const firstResultByTarget = new Map<string, JudgementResult>()
  const errorCounts = new Map<string, number>()

  for (const result of results) {
    if (!firstResultByTarget.has(result.targetId)) {
      firstResultByTarget.set(result.targetId, result)
    }

    if (result.type === 'correct') report.correct += 1
    if (result.type === 'wrong_note') report.wrongNote += 1
    if (result.type === 'missing_note') report.missingNote += 1
    if (result.type === 'extra_note') report.extraNote += 1
    if (result.type === 'early') report.early += 1
    if (result.type === 'late') report.late += 1
    if (result.type === 'rest_error') report.restError += 1

    if (result.type === 'wrong_note' || result.type === 'missing_note') {
      const noteName = result.target.label || result.target.id
      errorCounts.set(noteName, (errorCounts.get(noteName) ?? 0) + 1)
    }
  }

  let currentStreak = 0

  for (const target of targets) {
    const firstResult = firstResultByTarget.get(target.id)

    if (!firstResult) {
      break
    }

    if (firstResult.type === 'correct') {
      currentStreak += 1
      report.bestStreak = Math.max(report.bestStreak, currentStreak)
    } else {
      currentStreak = 0
    }
  }

  const mostMissed = [...errorCounts.entries()].sort((left, right) => right[1] - left[1])[0]
  report.mostMissedNote = mostMissed ? mostMissed[0] : '暂无'
  report.averageOffsetMs = offsets.length > 0
    ? Math.round(offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length)
    : 0
  report.accuracy = targets.length > 0 ? Math.round((report.correct / targets.length) * 100) : 0

  return report
}

function isExpectedComplete(inputNotes: number[], targetNotes: number[]): boolean {
  return isSameNoteSet(inputNotes, targetNotes)
}

export function useScalePractice(latestMidiEvent: MidiEventRecord | null): UseScalePracticeResult {
  const metronome = useMetronome(60)
  const metronomeSound = useMetronomeSound(metronome)
  const [selectedKey, setSelectedKeyState] = useState<MajorScaleKey>('C')
  const [selectedMode, setSelectedModeState] = useState<ScalePracticeMode>('right-ascending')
  const [range, setRangeState] = useState<ScaleRange>('one-octave')
  const [loopCount, setLoopCountState] = useState(1)
  const [notesPerBeat, setNotesPerBeatState] = useState<ScaleNotesPerBeat>(1)
  const [toleranceLevel, setToleranceLevelState] = useState<ToleranceLevel>('standard')
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [results, setResults] = useState<JudgementResult[]>([])
  const [isComplete, setIsComplete] = useState(false)
  const [wrongNotes, setWrongNotes] = useState<number[]>([])

  const currentStepIndexRef = useRef(0)
  const resultsRef = useRef<JudgementResult[]>([])
  const targetFlagsRef = useRef<Record<string, TargetFlags>>({})
  const pendingInputRef = useRef<PendingInput | null>(null)
  const lastMidiEventIdRef = useRef<number | null>(null)

  const selectedScale = useMemo(() => getMajorScaleByKey(selectedKey), [selectedKey])
  const selectedModeName = useMemo(() => getScalePracticeModeName(selectedMode), [selectedMode])
  const sequenceOptions = useMemo(() => ({ range, loopCount, notesPerBeat }), [loopCount, notesPerBeat, range])
  const steps = useMemo(
    () => createScalePracticeSteps(selectedScale, selectedMode, sequenceOptions),
    [selectedMode, selectedScale, sequenceOptions]
  )
  const targets = useMemo(
    () => createScaleTargets(selectedScale, selectedMode, metronome.beatDurationMs, sequenceOptions),
    [metronome.beatDurationMs, selectedMode, selectedScale, sequenceOptions]
  )

  const resetProgress = useCallback(() => {
    currentStepIndexRef.current = 0
    resultsRef.current = []
    targetFlagsRef.current = createTargetFlagMap(targets)
    pendingInputRef.current = null
    lastMidiEventIdRef.current = null
    setCurrentStepIndex(0)
    setResults([])
    setWrongNotes([])
    setIsComplete(false)
  }, [targets])

  const addResult = useCallback((result: JudgementResult) => {
    resultsRef.current = [...resultsRef.current, result]
    setResults(resultsRef.current)
  }, [])

  const recordTargetResult = useCallback(
    (
      target: TargetEvent,
      type: JudgementType,
      inputNotes: number[],
      timestamp: number,
      timeOffsetMs?: number
    ) => {
      if (type === 'wrong_note') {
        const flags = targetFlagsRef.current[target.id]

        if (flags?.wrongRecorded) {
          return
        }

        targetFlagsRef.current = {
          ...targetFlagsRef.current,
          [target.id]: {
            ...(flags ?? { missingRecorded: false, wrongRecorded: false }),
            wrongRecorded: true
          }
        }
      }

      if (type === 'missing_note') {
        const flags = targetFlagsRef.current[target.id]

        if (flags?.missingRecorded) {
          return
        }

        targetFlagsRef.current = {
          ...targetFlagsRef.current,
          [target.id]: {
            ...(flags ?? { missingRecorded: false, wrongRecorded: false }),
            missingRecorded: true
          }
        }
      }

      addResult(createJudgementResult(type, target, inputNotes, timestamp, timeOffsetMs))
    },
    [addResult]
  )

  const advanceStep = useCallback(() => {
    pendingInputRef.current = null
    setWrongNotes([])

    const nextIndex = currentStepIndexRef.current + 1
    currentStepIndexRef.current = nextIndex
    setCurrentStepIndex(nextIndex)

    if (nextIndex >= targets.length) {
      setIsComplete(true)
      metronome.pause()
    }
  }, [metronome, targets.length])

  const setSelectedKey = useCallback(
    (key: MajorScaleKey) => {
      if (metronome.status === 'running') {
        return
      }

      setSelectedKeyState(key)
      metronome.stop()
    },
    [metronome]
  )

  const setSelectedMode = useCallback(
    (mode: ScalePracticeMode) => {
      if (metronome.status === 'running') {
        return
      }

      setSelectedModeState(mode)
      metronome.stop()
    },
    [metronome]
  )

  const setRange = useCallback((nextRange: ScaleRange) => {
    if (metronome.status === 'running') return
    setRangeState(nextRange)
    metronome.stop()
  }, [metronome])

  const setLoopCount = useCallback((nextLoopCount: number) => {
    if (metronome.status === 'running') return
    setLoopCountState(Math.min(20, Math.max(1, Math.round(nextLoopCount))))
    metronome.stop()
  }, [metronome])

  const setNotesPerBeat = useCallback((nextNotesPerBeat: ScaleNotesPerBeat) => {
    if (metronome.status === 'running') return
    if (![1, 2, 4].includes(nextNotesPerBeat)) return
    setNotesPerBeatState(nextNotesPerBeat)
    metronome.stop()
  }, [metronome])

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
    },
    [metronome.status]
  )

  const start = useCallback(() => {
    void metronomeSound.prepare()

    if (metronome.status === 'paused') {
      metronome.start()
      return
    }

    resetProgress()
    metronome.restart()
  }, [metronome, metronomeSound, resetProgress])

  const pause = useCallback(() => {
    metronome.pause()
  }, [metronome])

  const stop = useCallback(() => {
    metronome.stop()
  }, [metronome])

  const restart = useCallback(() => {
    void metronomeSound.prepare()
    resetProgress()
    metronome.restart()
  }, [metronome, metronomeSound, resetProgress])

  useEffect(() => {
    resetProgress()
  }, [resetProgress])

  useEffect(() => {
    if (metronome.status === 'idle') {
      pendingInputRef.current = null
      return
    }

    if (metronome.status !== 'running' || metronome.isCountingIn || isComplete) {
      return
    }

    const target = targets[currentStepIndexRef.current]

    if (!target) {
      return
    }

    const toleranceMs = getToleranceMs(toleranceLevel)
    const flags = targetFlagsRef.current[target.id]

    if (!flags?.missingRecorded && metronome.practiceElapsedMs > target.timeMs + toleranceMs * 2) {
      pendingInputRef.current = null
      recordTargetResult(target, 'missing_note', [], Date.now())
    }
  }, [
    isComplete,
    metronome.isCountingIn,
    metronome.practiceElapsedMs,
    metronome.status,
    recordTargetResult,
    targets,
    toleranceLevel
  ])

  useEffect(() => {
    if (!latestMidiEvent || latestMidiEvent.type !== 'noteOn' || (latestMidiEvent.velocity ?? 0) <= 0) {
      return
    }

    if (!metronome.practiceStartTimestampMs || metronome.isCountingIn || metronome.status !== 'running' || isComplete) {
      return
    }

    if (typeof latestMidiEvent.midiNumber !== 'number') {
      return
    }

    if (lastMidiEventIdRef.current === latestMidiEvent.id) {
      return
    }

    lastMidiEventIdRef.current = latestMidiEvent.id

    const target = targets[currentStepIndexRef.current]

    if (!target) {
      return
    }

    const relativeTimeMs = latestMidiEvent.timestamp - metronome.practiceStartTimestampMs

    if (relativeTimeMs < 0) {
      return
    }

    const inputNote = latestMidiEvent.midiNumber
    const isExpectedNote = target.notes.includes(inputNote)

    if (!isExpectedNote) {
      pendingInputRef.current = null
      setWrongNotes([inputNote])
      recordTargetResult(target, 'wrong_note', [inputNote], latestMidiEvent.timestamp, Math.round(relativeTimeMs - target.timeMs))
      return
    }

    const currentPending = pendingInputRef.current
    const pendingInput = currentPending && relativeTimeMs - currentPending.firstRelativeTimeMs <= CHORD_INPUT_WINDOW_MS
      ? {
          ...currentPending,
          notes: Array.from(new Set([...currentPending.notes, inputNote])),
          timestamp: latestMidiEvent.timestamp
        }
      : {
          notes: [inputNote],
          firstRelativeTimeMs: relativeTimeMs,
          timestamp: latestMidiEvent.timestamp
        }

    pendingInputRef.current = pendingInput
    setWrongNotes([])

    if (!isExpectedComplete(pendingInput.notes, target.notes)) {
      return
    }

    const flags = targetFlagsRef.current[target.id]
    const toleranceMs = getToleranceMs(toleranceLevel)
    const offset = Math.round(pendingInput.firstRelativeTimeMs - target.timeMs)

    if (pendingInput.firstRelativeTimeMs > target.timeMs + toleranceMs * 2) {
      if (!flags?.missingRecorded) {
        recordTargetResult(target, 'missing_note', [], pendingInput.timestamp)
      }

      advanceStep()
      return
    }

    const hasPriorError = Boolean(flags?.wrongRecorded || flags?.missingRecorded)

    if (hasPriorError) {
      advanceStep()
      return
    }

    if (pendingInput.firstRelativeTimeMs < target.timeMs - toleranceMs) {
      recordTargetResult(target, 'early', pendingInput.notes, pendingInput.timestamp, offset)
      advanceStep()
      return
    }

    if (pendingInput.firstRelativeTimeMs > target.timeMs + toleranceMs) {
      recordTargetResult(target, 'late', pendingInput.notes, pendingInput.timestamp, offset)
      advanceStep()
      return
    }

    recordTargetResult(target, 'correct', pendingInput.notes, pendingInput.timestamp, offset)
    advanceStep()
  }, [
    advanceStep,
    isComplete,
    latestMidiEvent,
    metronome.isCountingIn,
    metronome.practiceStartTimestampMs,
    metronome.status,
    recordTargetResult,
    targets,
    toleranceLevel
  ])

  const currentStep = isComplete ? null : steps[currentStepIndex] ?? null
  const latestResult = results[results.length - 1] ?? null
  const report = useMemo(
    () => buildScaleReport(
      results,
      targets,
      selectedScale.name,
      selectedModeName,
      metronome.bpm,
      Math.min(currentStepIndex, targets.length),
      range,
      loopCount,
      notesPerBeat
    ),
    [currentStepIndex, loopCount, metronome.bpm, notesPerBeat, range, results, selectedModeName, selectedScale.name, targets]
  )

  return {
    scales: MAJOR_SCALE_PATTERNS,
    modes: SCALE_PRACTICE_MODES,
    selectedKey,
    selectedScale,
    setSelectedKey,
    selectedMode,
    selectedModeName,
    setSelectedMode,
    range,
    setRange,
    loopCount,
    setLoopCount,
    notesPerBeat,
    setNotesPerBeat,
    bpm: metronome.bpm,
    setBpm,
    toleranceLevel,
    setToleranceLevel,
    metronome,
    metronomeSound,
    steps,
    currentStepIndex,
    currentStep,
    latestResult,
    recentResults: results.slice(-8).reverse(),
    report,
    targetNotes: currentStep?.notes ?? [],
    correctNotes: latestResult?.type === 'correct' || latestResult?.type === 'early' || latestResult?.type === 'late'
      ? latestResult.expectedNotes
      : [],
    wrongNotes,
    isRunning: metronome.status === 'running',
    isComplete,
    start,
    pause,
    stop,
    restart
  }
}
