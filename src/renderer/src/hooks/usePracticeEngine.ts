import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getLastMidiEventId } from '../midi/midiEventBus'
import type { MidiEventRecord } from '../types'
import {
  CHORD_GROUP_WINDOW_MS,
  createJudgementResult,
  getToleranceMs,
  isInEarlyWindow,
  isInLateWindow,
  isInOnTimeWindow,
  judgeChordTarget,
  judgeRestTarget,
  judgeSingleNoteTarget,
  summarizeJudgements
} from '../utils/judgement'
import type {
  JudgementResult,
  MidiInputEvent,
  PracticeReport,
  TargetEvent,
  ToleranceLevel
} from '../utils/practiceTypes'
import type { UseMetronomeResult } from './useMetronome'
import { useMidiEventSubscription } from './useMidiEvents'

interface PendingChordInput {
  targetId: string
  firstRelativeTimeMs: number
  timestamp: number
  notes: number[]
}

interface UsePracticeEngineOptions {
  targets: TargetEvent[]
  metronome: UseMetronomeResult
  toleranceLevel: ToleranceLevel
}

export interface UsePracticeEngineResult {
  results: JudgementResult[]
  latestResult: JudgementResult | null
  currentTarget: TargetEvent | null
  report: PracticeReport
  isComplete: boolean
  reset: () => void
}

function toPracticeMidiEvent(event: MidiEventRecord): MidiInputEvent {
  return {
    type: event.type,
    midiNumber: event.midiNumber,
    noteName: event.noteName,
    velocity: event.velocity,
    controller: event.controllerNumber,
    value: event.value,
    timestamp: event.timestamp,
    deviceName: event.deviceName
  }
}

function sortTargets(targets: TargetEvent[]): TargetEvent[] {
  return [...targets].sort((a, b) => a.timeMs - b.timeMs)
}

export function usePracticeEngine({
  targets,
  metronome,
  toleranceLevel
}: UsePracticeEngineOptions): UsePracticeEngineResult {
  const sortedTargets = useMemo(() => sortTargets(targets), [targets])
  const targetKey = useMemo(
    () => sortedTargets.map((target) => `${target.id}:${target.timeMs}:${target.type}:${target.notes.join('.')}`).join('|'),
    [sortedTargets]
  )
  const toleranceMs = getToleranceMs(toleranceLevel)
  const [results, setResults] = useState<JudgementResult[]>([])
  const resultsRef = useRef<JudgementResult[]>([])
  const finalizedTargetIdsRef = useRef<Set<string>>(new Set())
  const pendingChordRef = useRef<PendingChordInput | null>(null)
  const lastMidiEventIdRef = useRef<number | null>(null)

  const reset = useCallback(() => {
    pendingChordRef.current = null
    finalizedTargetIdsRef.current = new Set()
    resultsRef.current = []
    lastMidiEventIdRef.current = getLastMidiEventId()
    setResults([])
  }, [])

  const addResult = useCallback((result: JudgementResult) => {
    if (finalizedTargetIdsRef.current.has(result.targetId)) {
      return
    }

    finalizedTargetIdsRef.current.add(result.targetId)
    resultsRef.current = [...resultsRef.current, result]
    setResults(resultsRef.current)

    if (pendingChordRef.current?.targetId === result.targetId) {
      pendingChordRef.current = null
    }
  }, [])

  const finalizePendingChord = useCallback(() => {
    const pendingChord = pendingChordRef.current

    if (!pendingChord) {
      return
    }

    const target = sortedTargets.find((candidate) => candidate.id === pendingChord.targetId)

    if (!target || finalizedTargetIdsRef.current.has(target.id)) {
      pendingChordRef.current = null
      return
    }

    addResult(judgeChordTarget(target, pendingChord.notes, pendingChord.firstRelativeTimeMs, pendingChord.timestamp, toleranceMs))
  }, [addResult, sortedTargets, toleranceMs])

  const currentTarget = useMemo(() => {
    const elapsed = metronome.practiceElapsedMs

    return sortedTargets.find((target) => {
      if (finalizedTargetIdsRef.current.has(target.id)) {
        return false
      }

      const targetEndMs = target.timeMs + (target.durationMs ?? metronome.beatDurationMs)
      return elapsed <= targetEndMs + toleranceMs * 2
    }) ?? null
  }, [metronome.beatDurationMs, metronome.practiceElapsedMs, sortedTargets, toleranceMs, results])

  useEffect(() => {
    reset()
  }, [reset, targetKey, toleranceLevel])

  const metronomeStateRef = useRef({
    status: metronome.status,
    isCountingIn: metronome.isCountingIn,
    practiceStartTimestampMs: metronome.practiceStartTimestampMs
  })
  metronomeStateRef.current = {
    status: metronome.status,
    isCountingIn: metronome.isCountingIn,
    practiceStartTimestampMs: metronome.practiceStartTimestampMs
  }
  const sortedTargetsRef = useRef(sortedTargets)
  sortedTargetsRef.current = sortedTargets
  const toleranceMsRef = useRef(toleranceMs)
  toleranceMsRef.current = toleranceMs

  const handleMidiEvent = useCallback((event: MidiEventRecord) => {
    if (event.type !== 'noteOn' || (event.velocity ?? 0) <= 0) {
      return
    }

    const metronomeState = metronomeStateRef.current
    if (!metronomeState.practiceStartTimestampMs || metronomeState.isCountingIn || metronomeState.status !== 'running') {
      return
    }

    const midiEvent = toPracticeMidiEvent(event)
    if (lastMidiEventIdRef.current !== null && event.id <= lastMidiEventIdRef.current) {
      return
    }

    if (typeof midiEvent.midiNumber !== 'number') {
      return
    }

    lastMidiEventIdRef.current = event.id
    const activeTargets = sortedTargetsRef.current
    const activeToleranceMs = toleranceMsRef.current

    const relativeTimeMs = midiEvent.timestamp - metronomeState.practiceStartTimestampMs

    if (relativeTimeMs < 0) {
      return
    }

    const pendingChord = pendingChordRef.current

    if (pendingChord && relativeTimeMs - pendingChord.firstRelativeTimeMs > CHORD_GROUP_WINDOW_MS) {
      finalizePendingChord()
    }

    for (const target of activeTargets) {
      if (finalizedTargetIdsRef.current.has(target.id)) {
        continue
      }

      const restResult = judgeRestTarget(target, midiEvent, relativeTimeMs)

      if (restResult) {
        addResult(restResult)
        return
      }
    }

    const chordTarget = activeTargets.find((target) => {
      if (target.type !== 'chord' || finalizedTargetIdsRef.current.has(target.id)) {
        return false
      }

      return (
        isInOnTimeWindow(target, relativeTimeMs, activeToleranceMs) ||
        isInEarlyWindow(target, relativeTimeMs, activeToleranceMs) ||
        isInLateWindow(target, relativeTimeMs, activeToleranceMs)
      )
    })

    if (chordTarget) {
      if (!isInOnTimeWindow(chordTarget, relativeTimeMs, activeToleranceMs)) {
        if (chordTarget.notes.includes(midiEvent.midiNumber)) {
          addResult(judgeChordTarget(chordTarget, [midiEvent.midiNumber], relativeTimeMs, midiEvent.timestamp, activeToleranceMs))
        }
        return
      }

      const activePendingChord = pendingChordRef.current

      if (activePendingChord?.targetId === chordTarget.id) {
        activePendingChord.notes = [...activePendingChord.notes, midiEvent.midiNumber]
        activePendingChord.timestamp = midiEvent.timestamp
      } else {
        pendingChordRef.current = {
          targetId: chordTarget.id,
          firstRelativeTimeMs: relativeTimeMs,
          timestamp: midiEvent.timestamp,
          notes: [midiEvent.midiNumber]
        }
      }

      return
    }

    const noteTarget = activeTargets.find((target) => {
      if (target.type !== 'note' || finalizedTargetIdsRef.current.has(target.id)) {
        return false
      }

      return (
        isInOnTimeWindow(target, relativeTimeMs, activeToleranceMs) ||
        isInEarlyWindow(target, relativeTimeMs, activeToleranceMs) ||
        isInLateWindow(target, relativeTimeMs, activeToleranceMs)
      )
    })

    if (noteTarget) {
      const result = judgeSingleNoteTarget(noteTarget, midiEvent, relativeTimeMs, activeToleranceMs)

      if (result) {
        addResult(result)
      }
    }
  }, [addResult, finalizePendingChord])

  useMidiEventSubscription(handleMidiEvent)

  useEffect(() => {
    if (metronome.status !== 'running' || metronome.isCountingIn) {
      return
    }

    const elapsed = metronome.practiceElapsedMs
    const pendingChord = pendingChordRef.current

    if (pendingChord && elapsed - pendingChord.firstRelativeTimeMs >= CHORD_GROUP_WINDOW_MS) {
      finalizePendingChord()
    }

    for (const target of sortedTargets) {
      if (finalizedTargetIdsRef.current.has(target.id)) {
        continue
      }

      if (target.type === 'rest') {
        const restEndMs = target.timeMs + (target.durationMs ?? metronome.beatDurationMs)

        if (elapsed >= restEndMs) {
          addResult(createJudgementResult('correct', target, [], Date.now()))
        }
        continue
      }

      if (elapsed > target.timeMs + toleranceMs * 2) {
        addResult(createJudgementResult('missing_note', target, [], Date.now()))
      }
    }
  }, [
    addResult,
    finalizePendingChord,
    metronome.beatDurationMs,
    metronome.isCountingIn,
    metronome.practiceElapsedMs,
    metronome.status,
    sortedTargets,
    toleranceMs
  ])

  const report = useMemo(
    () => summarizeJudgements(results, sortedTargets.length),
    [results, sortedTargets.length]
  )
  const latestResult = results[results.length - 1] ?? null
  const isComplete = sortedTargets.length > 0 && results.length >= sortedTargets.length

  return {
    results,
    latestResult,
    currentTarget,
    report,
    isComplete,
    reset
  }
}
