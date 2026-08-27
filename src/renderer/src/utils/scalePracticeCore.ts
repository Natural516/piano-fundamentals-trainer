import type { MidiEventRecord } from '../types'
import { createJudgementResult, getToleranceMs, isSameNoteSet } from './judgement'
import type { JudgementResult, JudgementType, TargetEvent, ToleranceLevel } from './practiceTypes'

interface TargetFlags {
  wrongRecorded: boolean
  missingRecorded: boolean
}

interface PendingInput {
  notes: number[]
  firstRelativeTimeMs: number
  timestamp: number
}

const CHORD_INPUT_WINDOW_MS = 120

/**
 * Pure, time-axis driven judgment core for scale practice.
 *
 * Every target maps to one target time point with an early/late acceptance
 * window. A noteOn is consumed by the first suitable target whose window is
 * open; when a target's window truly ends without a valid match it is recorded
 * as missed and the cursor advances, so a late first note no longer cascades
 * into 8/8 misses.
 */
export class ScalePracticeCore {
  currentStepIndex = 0
  results: JudgementResult[] = []
  isComplete = false
  wrongNotes: number[] = []
  onChange: (() => void) | null = null

  private readonly targets: TargetEvent[]
  private readonly toleranceLevel: ToleranceLevel
  private targetFlags = new Map<string, TargetFlags>()
  private pendingInput: PendingInput | null = null
  private lastHandledEventId: number | null = null

  constructor(targets: TargetEvent[], toleranceLevel: ToleranceLevel) {
    this.targets = targets
    this.toleranceLevel = toleranceLevel
  }

  get latestResult(): JudgementResult | null {
    return this.results[this.results.length - 1] ?? null
  }

  get currentTarget(): TargetEvent | null {
    return this.targets[this.currentStepIndex] ?? null
  }

  reset(baselineEventId: number): void {
    this.currentStepIndex = 0
    this.results = []
    this.isComplete = false
    this.wrongNotes = []
    this.targetFlags = new Map(
      this.targets.map((target) => [target.id, { wrongRecorded: false, missingRecorded: false }])
    )
    this.pendingInput = null
    this.lastHandledEventId = baselineEventId
  }

  clearTransientInput(baselineEventId: number): void {
    this.pendingInput = null
    this.wrongNotes = []
    this.lastHandledEventId = Math.max(this.lastHandledEventId ?? 0, baselineEventId)
    this.onChange?.()
  }

  processMidiEvent(event: MidiEventRecord, practiceStartTimestampMs: number): void {
    if (this.isComplete) {
      return
    }

    if (event.type !== 'noteOn' || (event.velocity ?? 0) <= 0) {
      return
    }

    if (typeof event.midiNumber !== 'number') {
      return
    }

    if (this.lastHandledEventId !== null && event.id <= this.lastHandledEventId) {
      return
    }

    this.lastHandledEventId = event.id

    const relativeTimeMs = event.timestamp - practiceStartTimestampMs

    if (relativeTimeMs < 0) {
      return
    }

    const toleranceMs = getToleranceMs(this.toleranceLevel)

    while (this.currentStepIndex < this.targets.length) {
      const target = this.targets[this.currentStepIndex]
      const flags = this.targetFlags.get(target.id)
      const windowEndMs = target.timeMs + toleranceMs * 2

      if (relativeTimeMs > windowEndMs) {
        if (!flags?.missingRecorded) {
          this.recordTargetResult(target, 'missing_note', [], event.timestamp)
        }

        this.advanceStep()
        continue
      }

      if (relativeTimeMs < target.timeMs - toleranceMs * 2) {
        // Too early for this target; leave it unjudged so a later correct
        // input inside the window can still be matched.
        return
      }

      const isExpectedNote = target.notes.includes(event.midiNumber)

      if (!isExpectedNote) {
        if (!flags?.wrongRecorded) {
          this.pendingInput = null
          this.wrongNotes = [event.midiNumber]
          this.recordTargetResult(
            target,
            'wrong_note',
            [event.midiNumber],
            event.timestamp,
            Math.round(relativeTimeMs - target.timeMs)
          )
        }

        return
      }

      const currentPending = this.pendingInput
      const pendingInput = currentPending && relativeTimeMs - currentPending.firstRelativeTimeMs <= CHORD_INPUT_WINDOW_MS
        ? {
            notes: Array.from(new Set([...currentPending.notes, event.midiNumber])),
            firstRelativeTimeMs: currentPending.firstRelativeTimeMs,
            timestamp: event.timestamp
          }
        : {
            notes: [event.midiNumber],
            firstRelativeTimeMs: relativeTimeMs,
            timestamp: event.timestamp
          }

      this.pendingInput = pendingInput
      this.wrongNotes = []

      if (!isSameNoteSet(pendingInput.notes, target.notes)) {
        return
      }

      const offset = Math.round(pendingInput.firstRelativeTimeMs - target.timeMs)
      const hasPriorError = Boolean(flags?.wrongRecorded || flags?.missingRecorded)

      if (hasPriorError) {
        this.advanceStep()
        return
      }

      if (pendingInput.firstRelativeTimeMs < target.timeMs - toleranceMs) {
        this.recordTargetResult(target, 'early', pendingInput.notes, pendingInput.timestamp, offset)
      } else if (pendingInput.firstRelativeTimeMs > target.timeMs + toleranceMs) {
        this.recordTargetResult(target, 'late', pendingInput.notes, pendingInput.timestamp, offset)
      } else {
        this.recordTargetResult(target, 'correct', pendingInput.notes, pendingInput.timestamp, offset)
      }

      this.advanceStep()
      return
    }
  }

  advanceElapsed(practiceElapsedMs: number): void {
    if (this.isComplete) {
      return
    }

    const target = this.targets[this.currentStepIndex]

    if (!target) {
      return
    }

    const toleranceMs = getToleranceMs(this.toleranceLevel)
    const flags = this.targetFlags.get(target.id)

    if (!flags?.missingRecorded && practiceElapsedMs > target.timeMs + toleranceMs * 2) {
      this.recordTargetResult(target, 'missing_note', [], Date.now())
      this.advanceStep()
    }
  }

  private recordTargetResult(
    target: TargetEvent,
    type: JudgementType,
    inputNotes: number[],
    timestamp: number,
    timeOffsetMs?: number
  ): void {
    const flags = this.targetFlags.get(target.id)

    if (type === 'wrong_note') {
      if (flags?.wrongRecorded) {
        return
      }

      this.targetFlags.set(target.id, {
        ...(flags ?? { missingRecorded: false, wrongRecorded: false }),
        wrongRecorded: true
      })
    }

    if (type === 'missing_note') {
      if (flags?.missingRecorded) {
        return
      }

      this.targetFlags.set(target.id, {
        ...(flags ?? { missingRecorded: false, wrongRecorded: false }),
        missingRecorded: true
      })
    }

    this.results = [...this.results, createJudgementResult(type, target, inputNotes, timestamp, timeOffsetMs)]
    this.onChange?.()
  }

  private advanceStep(): void {
    this.pendingInput = null
    this.wrongNotes = []
    this.currentStepIndex += 1

    if (this.currentStepIndex >= this.targets.length) {
      this.isComplete = true
    }

    this.onChange?.()
  }
}
