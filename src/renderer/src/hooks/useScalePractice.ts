import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getLastMidiEventId } from '../midi/midiEventBus'
import type { JudgementResult, ToleranceLevel } from '../utils/practiceTypes'
import {
  MAJOR_SCALE_PATTERNS,
  SCALE_PRACTICE_MODES,
  createScalePracticeSteps,
  createScaleTargets,
  getMajorScaleByKey,
  getScalePracticeModeName
} from '../utils/scalePatterns'
import { ScalePracticeCore } from '../utils/scalePracticeCore'
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
import { useMidiEventSubscription } from './useMidiEvents'

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
  reset: () => void
}

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

function buildScaleReport(
  results: JudgementResult[],
  targets: ReturnType<typeof createScaleTargets>,
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

export function useScalePractice(): UseScalePracticeResult {
  const metronome = useMetronome(60)
  const metronomeSound = useMetronomeSound(metronome)
  const [selectedKey, setSelectedKeyState] = useState<MajorScaleKey>('C')
  const [selectedMode, setSelectedModeState] = useState<ScalePracticeMode>('right-ascending')
  const [range, setRangeState] = useState<ScaleRange>('one-octave')
  const [loopCount, setLoopCountState] = useState(1)
  const [notesPerBeat, setNotesPerBeatState] = useState<ScaleNotesPerBeat>(1)
  const [toleranceLevel, setToleranceLevelState] = useState<ToleranceLevel>('standard')
  const [coreEpoch, setCoreEpoch] = useState(0)

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

  const core = useMemo(() => {
    const created = new ScalePracticeCore(targets, toleranceLevel)
    created.onChange = () => setCoreEpoch((value) => value + 1)
    created.reset(getLastMidiEventId())
    return created
  }, [targets, toleranceLevel])
  const coreRef = useRef(core)
  coreRef.current = core

  const metronomeRef = useRef({
    status: metronome.status,
    isCountingIn: metronome.isCountingIn,
    practiceStartTimestampMs: metronome.practiceStartTimestampMs
  })
  metronomeRef.current = {
    status: metronome.status,
    isCountingIn: metronome.isCountingIn,
    practiceStartTimestampMs: metronome.practiceStartTimestampMs
  }

  const resetProgress = useCallback(() => {
    const activeCore = coreRef.current
    if (!activeCore) return
    activeCore.reset(getLastMidiEventId())
    setCoreEpoch((value) => value + 1)
  }, [])

  const setSelectedKey = useCallback(
    (key: MajorScaleKey) => {
      if (metronome.status === 'running') return
      setSelectedKeyState(key)
      metronome.stop()
    },
    [metronome]
  )

  const setSelectedMode = useCallback(
    (mode: ScalePracticeMode) => {
      if (metronome.status === 'running') return
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
      if (metronome.status === 'running') return
      metronome.setBpm(bpm)
    },
    [metronome]
  )

  const setToleranceLevel = useCallback(
    (level: ToleranceLevel) => {
      if (metronome.status === 'running') return
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

  const reset = useCallback(() => {
    metronome.stop()
    resetProgress()
  }, [metronome, resetProgress])

  useMidiEventSubscription((event) => {
    const activeCore = coreRef.current
    const metronomeState = metronomeRef.current

    if (!activeCore || activeCore.isComplete) return
    if (metronomeState.status !== 'running' || metronomeState.isCountingIn) return
    if (metronomeState.practiceStartTimestampMs === null) return

    activeCore.processMidiEvent(event, metronomeState.practiceStartTimestampMs)
  })

  useEffect(() => {
    resetProgress()
  }, [resetProgress])

  useEffect(() => {
    const activeCore = coreRef.current
    if (!activeCore) return
    if (metronome.status === 'idle') return
    if (metronome.status !== 'running' || metronome.isCountingIn || activeCore.isComplete) return

    activeCore.advanceElapsed(metronome.practiceElapsedMs)
  }, [core, metronome.isCountingIn, metronome.practiceElapsedMs, metronome.status])

  const currentStepIndex = core.currentStepIndex
  const results = core.results
  const isComplete = core.isComplete
  const wrongNotes = core.wrongNotes
  const currentStep = isComplete ? null : steps[currentStepIndex] ?? null
  const latestResult = core.latestResult
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
    restart,
    reset
  }
}
