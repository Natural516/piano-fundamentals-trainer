import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MidiEventRecord } from '../types'
import {
  COORDINATION_GROUP_WINDOW_MS,
  COORDINATION_MEASURE_OPTIONS,
  COORDINATION_PATTERNS,
  COORDINATION_STEPS_PER_MEASURE,
  COORDINATION_SYNC_THRESHOLD_MS,
  createCoordinationTimeline,
  getCoordinationPattern
} from '../utils/coordinationPatterns'
import type {
  CoordinationHand,
  CoordinationJudgementType,
  CoordinationPattern,
  CoordinationPracticeReport,
  CoordinationStepResult,
  CoordinationTimelineStep
} from '../utils/coordinationTypes'
import { getToleranceMs } from '../utils/judgement'
import type { ToleranceLevel } from '../utils/practiceTypes'
import { useMetronome } from './useMetronome'
import { useMetronomeSound } from './useMetronomeSound'

interface GroupedInputEvent {
  midiNumber: number
  timestamp: number
  relativeTimeMs: number
}

interface PendingStepInput {
  firstRelativeTimeMs: number
  events: GroupedInputEvent[]
}

interface UseCoordinationPracticeResult {
  patterns: CoordinationPattern[]
  selectedPattern: CoordinationPattern
  selectedPatternId: string
  setSelectedPatternId: (patternId: string) => void
  bpm: number
  setBpm: (bpm: number) => void
  measureCount: number
  measureOptions: typeof COORDINATION_MEASURE_OPTIONS
  setMeasureCount: (measureCount: number) => void
  toleranceLevel: ToleranceLevel
  setToleranceLevel: (level: ToleranceLevel) => void
  metronome: ReturnType<typeof useMetronome>
  metronomeSound: ReturnType<typeof useMetronomeSound>
  timeline: CoordinationTimelineStep[]
  currentStep: CoordinationTimelineStep | null
  currentStepIndex: number
  currentMeasureIndex: number
  currentPosition: number
  currentMeasureResults: CoordinationStepResult[]
  latestResult: CoordinationStepResult | null
  recentResults: CoordinationStepResult[]
  report: CoordinationPracticeReport
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

function normalizeNotes(notes: number[]): number[] {
  return Array.from(new Set(notes)).sort((left, right) => left - right)
}

function getMissingNotes(expected: number[], input: number[]): number[] {
  const inputSet = new Set(input)
  return normalizeNotes(expected).filter((note) => !inputSet.has(note))
}

function getExtraNotes(expected: number[], input: number[]): number[] {
  const expectedSet = new Set(expected)
  return normalizeNotes(input).filter((note) => !expectedSet.has(note))
}

function distanceToClosest(note: number, targets: number[]): number {
  return targets.length > 0 ? Math.min(...targets.map((target) => Math.abs(note - target))) : Number.POSITIVE_INFINITY
}

function inferExtraNoteHand(note: number, step: CoordinationTimelineStep): CoordinationHand | null {
  const leftDistance = distanceToClosest(note, step.leftNotes)
  const rightDistance = distanceToClosest(note, step.rightNotes)

  if (Number.isFinite(leftDistance) && Number.isFinite(rightDistance)) {
    if (leftDistance === rightDistance) return null
    return leftDistance < rightDistance ? 'left' : 'right'
  }

  if (Number.isFinite(leftDistance)) {
    return note >= 60 && leftDistance > 6 ? 'right' : 'left'
  }

  if (Number.isFinite(rightDistance)) {
    return note <= 57 && rightDistance > 6 ? 'left' : 'right'
  }

  if (note <= 57) return 'left'
  if (note >= 60) return 'right'
  return null
}

function createResultMessage(
  type: CoordinationJudgementType,
  syncWarning: boolean,
  missingNotes: number[],
  extraNotes: number[]
): string {
  const baseMessage: Record<CoordinationJudgementType, string> = {
    correct: '当前格完成。',
    wrong_note: `目标音不完整，并出现错误音。缺少 ${missingNotes.join(', ')}，多出 ${extraNotes.join(', ')}。`,
    missing_note: `漏弹目标音：${missingNotes.join(', ')}。`,
    extra_note: `多弹了非目标音：${extraNotes.join(', ')}。`,
    early: '音高正确，但下键早于判定窗口。',
    late: '音高正确，但下键晚于判定窗口。',
    rest_error: '当前格应保持休止。'
  }

  return syncWarning ? `${baseMessage[type]} 音符正确，但双手下键不同步。` : baseMessage[type]
}

function createStepResult(
  step: CoordinationTimelineStep,
  events: GroupedInputEvent[],
  toleranceMs: number
): CoordinationStepResult {
  const expectedNotes = normalizeNotes([...step.leftNotes, ...step.rightNotes])
  const inputNotes = normalizeNotes(events.map((event) => event.midiNumber))
  const missingNotes = getMissingNotes(expectedNotes, inputNotes)
  const extraNotes = getExtraNotes(expectedNotes, inputNotes)
  const matchingEvents = events.filter((event) => expectedNotes.includes(event.midiNumber))
  const timingOffsetMs = matchingEvents.length > 0
    ? Math.round(
        matchingEvents.reduce((sum, event) => sum + event.relativeTimeMs - step.expectedTimeMs, 0) /
          matchingEvents.length
      )
    : undefined

  let type: CoordinationJudgementType

  if (expectedNotes.length === 0) {
    type = inputNotes.length === 0 ? 'correct' : 'rest_error'
  } else if (missingNotes.length > 0 && extraNotes.length > 0) {
    type = 'wrong_note'
  } else if (missingNotes.length > 0) {
    type = 'missing_note'
  } else if (extraNotes.length > 0) {
    type = 'extra_note'
  } else if ((timingOffsetMs ?? 0) < -toleranceMs) {
    type = 'early'
  } else if ((timingOffsetMs ?? 0) > toleranceMs) {
    type = 'late'
  } else {
    type = 'correct'
  }

  const leftEventTimes = events
    .filter((event) => step.leftNotes.includes(event.midiNumber))
    .map((event) => event.timestamp)
  const rightEventTimes = events
    .filter((event) => step.rightNotes.includes(event.midiNumber))
    .map((event) => event.timestamp)
  const syncOffsetMs = step.leftNotes.length > 0 && step.rightNotes.length > 0 && leftEventTimes.length > 0 && rightEventTimes.length > 0
    ? Math.abs(Math.min(...leftEventTimes) - Math.min(...rightEventTimes))
    : undefined
  const pitchComplete = expectedNotes.length > 0 && missingNotes.length === 0 && extraNotes.length === 0
  const syncWarning = pitchComplete && typeof syncOffsetMs === 'number' && syncOffsetMs > COORDINATION_SYNC_THRESHOLD_MS

  const missingLeft = getMissingNotes(step.leftNotes, inputNotes).length > 0
  const missingRight = getMissingNotes(step.rightNotes, inputNotes).length > 0
  let leftExtra = false
  let rightExtra = false
  let generalExtraCount = 0

  for (const note of extraNotes) {
    const hand = inferExtraNoteHand(note, step)

    if (hand === 'left') leftExtra = true
    else if (hand === 'right') rightExtra = true
    else generalExtraCount += 1
  }

  const timingError = type === 'early' || type === 'late'
  const leftError = missingLeft || leftExtra || (timingError && step.leftNotes.length > 0)
  const rightError = missingRight || rightExtra || (timingError && step.rightNotes.length > 0)

  return {
    id: `${step.id}-${type}-${Date.now()}`,
    targetId: step.id,
    measureIndex: step.measureIndex,
    position: step.position,
    label: `第 ${step.measureIndex + 1} 小节 ${step.label}`,
    type,
    expectedLeftNotes: step.leftNotes,
    expectedRightNotes: step.rightNotes,
    inputNotes,
    missingNotes,
    extraNotes,
    timingOffsetMs,
    syncWarning,
    syncOffsetMs,
    leftError,
    rightError,
    generalExtraCount,
    timestamp: events[events.length - 1]?.timestamp ?? Date.now(),
    message: createResultMessage(type, syncWarning, missingNotes, extraNotes)
  }
}

function createReport(
  results: CoordinationStepResult[],
  timeline: CoordinationTimelineStep[],
  patternName: string,
  bpm: number,
  measureCount: number,
  toleranceLevel: ToleranceLevel
): CoordinationPracticeReport {
  const count = (type: CoordinationJudgementType): number => results.filter((result) => result.type === type).length
  const offsets = results
    .map((result) => result.timingOffsetMs)
    .filter((offset): offset is number => typeof offset === 'number')
  const issueCounts = new Map<string, number>()

  for (const result of results) {
    if (result.type !== 'correct' || result.syncWarning) {
      issueCounts.set(result.label, (issueCounts.get(result.label) ?? 0) + 1)
    }
  }

  const hardest = [...issueCounts.entries()].sort((left, right) => right[1] - left[1])[0]
  const correct = count('correct')

  return {
    patternName,
    bpm,
    measureCount,
    toleranceLevel,
    totalCells: timeline.length,
    playableCells: timeline.filter((step) => step.leftNotes.length > 0 || step.rightNotes.length > 0).length,
    correct,
    wrongNote: count('wrong_note'),
    missingNote: count('missing_note'),
    extraNote: count('extra_note'),
    restError: count('rest_error'),
    early: count('early'),
    late: count('late'),
    syncWarning: results.filter((result) => result.syncWarning).length,
    averageOffsetMs: offsets.length > 0
      ? Math.round(offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length)
      : 0,
    accuracy: timeline.length > 0 ? Math.round((correct / timeline.length) * 100) : 0,
    leftWrongCount: results.filter((result) => result.leftError).length,
    rightWrongCount: results.filter((result) => result.rightError).length,
    generalExtraCount: results.reduce((sum, result) => sum + result.generalExtraCount, 0),
    hardestPosition: hardest?.[0] ?? '暂无'
  }
}

export function useCoordinationPractice(latestMidiEvent: MidiEventRecord | null): UseCoordinationPracticeResult {
  const metronome = useMetronome(60)
  const metronomeSound = useMetronomeSound(metronome)
  const [selectedPatternId, setSelectedPatternIdState] = useState(COORDINATION_PATTERNS[0].id)
  const [measureCount, setMeasureCountState] = useState(4)
  const [toleranceLevel, setToleranceLevelState] = useState<ToleranceLevel>('standard')
  const [results, setResults] = useState<CoordinationStepResult[]>([])
  const [isComplete, setIsComplete] = useState(false)

  const resultsRef = useRef<CoordinationStepResult[]>([])
  const finalizedTargetIdsRef = useRef(new Set<string>())
  const pendingInputsRef = useRef(new Map<string, PendingStepInput>())
  const lastMidiEventKeyRef = useRef('')

  const selectedPattern = useMemo(() => getCoordinationPattern(selectedPatternId), [selectedPatternId])
  const eighthNoteDurationMs = metronome.beatDurationMs / 2
  const timeline = useMemo(
    () => createCoordinationTimeline(selectedPattern, measureCount, eighthNoteDurationMs),
    [eighthNoteDurationMs, measureCount, selectedPattern]
  )

  const resetProgress = useCallback(() => {
    resultsRef.current = []
    finalizedTargetIdsRef.current = new Set()
    pendingInputsRef.current = new Map()
    lastMidiEventKeyRef.current = ''
    setResults([])
    setIsComplete(false)
  }, [])

  const finalizeStep = useCallback(
    (step: CoordinationTimelineStep) => {
      if (finalizedTargetIdsRef.current.has(step.id)) return

      const pending = pendingInputsRef.current.get(step.id)
      const result = createStepResult(step, pending?.events ?? [], getToleranceMs(toleranceLevel))

      finalizedTargetIdsRef.current.add(step.id)
      pendingInputsRef.current.delete(step.id)
      resultsRef.current = [...resultsRef.current, result]
      setResults(resultsRef.current)

      if (finalizedTargetIdsRef.current.size >= timeline.length) {
        setIsComplete(true)
        metronome.pause()
      }
    },
    [metronome, timeline.length, toleranceLevel]
  )

  const setSelectedPatternId = useCallback(
    (patternId: string) => {
      if (metronome.status !== 'idle') return
      const pattern = getCoordinationPattern(patternId)
      setSelectedPatternIdState(pattern.id)
      metronome.setBpm(pattern.bpmDefault)
      resetProgress()
    },
    [metronome, resetProgress]
  )

  const setBpm = useCallback(
    (nextBpm: number) => {
      if (metronome.status !== 'idle') return
      metronome.setBpm(Math.min(120, Math.max(40, nextBpm)))
    },
    [metronome]
  )

  const setMeasureCount = useCallback(
    (nextMeasureCount: number) => {
      if (metronome.status !== 'idle' || !COORDINATION_MEASURE_OPTIONS.includes(nextMeasureCount as 2 | 4 | 8)) return
      setMeasureCountState(nextMeasureCount)
      resetProgress()
    },
    [metronome.status, resetProgress]
  )

  const setToleranceLevel = useCallback(
    (level: ToleranceLevel) => {
      if (metronome.status !== 'idle') return
      setToleranceLevelState(level)
      resetProgress()
    },
    [metronome.status, resetProgress]
  )

  const start = useCallback(() => {
    void metronomeSound.prepare()

    if (metronome.status === 'paused' && !isComplete) {
      metronome.start()
      return
    }

    resetProgress()
    metronome.restart()
  }, [isComplete, metronome, metronomeSound, resetProgress])

  const pause = useCallback(() => metronome.pause(), [metronome])

  const stop = useCallback(() => {
    pendingInputsRef.current = new Map()
    metronome.stop()
  }, [metronome])

  const restart = useCallback(() => {
    void metronomeSound.prepare()
    resetProgress()
    metronome.restart()
  }, [metronome, metronomeSound, resetProgress])

  useEffect(() => {
    if (metronome.status !== 'running' || metronome.isCountingIn || isComplete) return

    const toleranceMs = getToleranceMs(toleranceLevel)

    for (const step of timeline) {
      if (finalizedTargetIdsRef.current.has(step.id)) continue

      const pending = pendingInputsRef.current.get(step.id)
      const shouldFinalizePending = pending
        ? metronome.practiceElapsedMs >= pending.firstRelativeTimeMs + COORDINATION_GROUP_WINDOW_MS
        : false
      const shouldFinalizeEmpty = !pending && metronome.practiceElapsedMs > step.expectedTimeMs + toleranceMs * 2

      if (shouldFinalizePending || shouldFinalizeEmpty) {
        finalizeStep(step)
      }
    }
  }, [finalizeStep, isComplete, metronome.isCountingIn, metronome.practiceElapsedMs, metronome.status, timeline, toleranceLevel])

  useEffect(() => {
    if (!latestMidiEvent || latestMidiEvent.type !== 'noteOn' || (latestMidiEvent.velocity ?? 0) <= 0) return
    if (!metronome.practiceStartTimestampMs || metronome.status !== 'running' || metronome.isCountingIn || isComplete) return
    if (typeof latestMidiEvent.midiNumber !== 'number') return

    const eventKey = `${latestMidiEvent.timestamp}-${latestMidiEvent.midiNumber}-${latestMidiEvent.velocity}-${latestMidiEvent.deviceName}`
    if (lastMidiEventKeyRef.current === eventKey) return
    lastMidiEventKeyRef.current = eventKey

    const relativeTimeMs = latestMidiEvent.timestamp - metronome.practiceStartTimestampMs
    if (relativeTimeMs < 0) return

    const toleranceMs = getToleranceMs(toleranceLevel)
    const candidate = timeline
      .filter((step) => {
        if (finalizedTargetIdsRef.current.has(step.id)) return false
        const pending = pendingInputsRef.current.get(step.id)
        if (pending && relativeTimeMs - pending.firstRelativeTimeMs > COORDINATION_GROUP_WINDOW_MS) return false
        return Math.abs(relativeTimeMs - step.expectedTimeMs) <= toleranceMs * 2
      })
      .sort(
        (left, right) =>
          Math.abs(relativeTimeMs - left.expectedTimeMs) - Math.abs(relativeTimeMs - right.expectedTimeMs)
      )[0]

    if (!candidate) return

    const pending = pendingInputsRef.current.get(candidate.id)
    if (pending?.events.some((event) => event.midiNumber === latestMidiEvent.midiNumber)) return

    const inputEvent: GroupedInputEvent = {
      midiNumber: latestMidiEvent.midiNumber,
      timestamp: latestMidiEvent.timestamp,
      relativeTimeMs
    }

    pendingInputsRef.current.set(candidate.id, {
      firstRelativeTimeMs: pending?.firstRelativeTimeMs ?? relativeTimeMs,
      events: [...(pending?.events ?? []), inputEvent]
    })
  }, [isComplete, latestMidiEvent, metronome.isCountingIn, metronome.practiceStartTimestampMs, metronome.status, timeline, toleranceLevel])

  const currentStepIndex = useMemo(() => {
    if (metronome.status === 'idle' || metronome.isCountingIn || isComplete || timeline.length === 0) return -1
    return Math.min(timeline.length - 1, Math.floor(metronome.practiceElapsedMs / eighthNoteDurationMs))
  }, [eighthNoteDurationMs, isComplete, metronome.isCountingIn, metronome.practiceElapsedMs, metronome.status, timeline.length])
  const currentStep = currentStepIndex >= 0 ? timeline[currentStepIndex] ?? null : null
  const currentMeasureIndex = currentStep?.measureIndex ?? (isComplete ? Math.max(0, measureCount - 1) : 0)
  const currentPosition = currentStep?.position ?? -1
  const currentMeasureResults = results.filter((result) => result.measureIndex === currentMeasureIndex)
  const latestResult = results[results.length - 1] ?? null
  const report = useMemo(
    () => createReport(results, timeline, selectedPattern.name, metronome.bpm, measureCount, toleranceLevel),
    [measureCount, metronome.bpm, results, selectedPattern.name, timeline, toleranceLevel]
  )

  return {
    patterns: COORDINATION_PATTERNS,
    selectedPattern,
    selectedPatternId,
    setSelectedPatternId,
    bpm: metronome.bpm,
    setBpm,
    measureCount,
    measureOptions: COORDINATION_MEASURE_OPTIONS,
    setMeasureCount,
    toleranceLevel,
    setToleranceLevel,
    metronome,
    metronomeSound,
    timeline,
    currentStep,
    currentStepIndex,
    currentMeasureIndex,
    currentPosition,
    currentMeasureResults,
    latestResult,
    recentResults: results.slice(-8).reverse(),
    report,
    targetNotes: currentStep ? normalizeNotes([...currentStep.leftNotes, ...currentStep.rightNotes]) : [],
    correctNotes: latestResult?.type === 'correct' || latestResult?.type === 'early' || latestResult?.type === 'late'
      ? normalizeNotes([...latestResult.expectedLeftNotes, ...latestResult.expectedRightNotes])
      : [],
    wrongNotes: latestResult && latestResult.type !== 'correct' ? latestResult.inputNotes : [],
    isRunning: metronome.status === 'running',
    isComplete,
    start,
    pause,
    stop,
    restart
  }
}
