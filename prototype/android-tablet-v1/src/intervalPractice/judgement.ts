import type { ScheduledIntervalQuestion } from './types'

export const INTERVAL_CAPTURE_WINDOW_MS = 150 as const
export const INTERVAL_SUCCESS_DURATION_MS = 800 as const

export type IntervalJudgementWrongReason = 'WRONG_PITCH_SET' | 'EXTRA_PITCH'

export type IntervalJudgementState =
  | { readonly phase: 'READY' }
  | {
      readonly phase: 'COLLECTING'
      readonly captureStartTimestampMs: number
      readonly captureCloseTimestampMs: number
      readonly collectedPitches: readonly number[]
    }
  | { readonly phase: 'WRONG_WAIT_RELEASE'; readonly reason: IntervalJudgementWrongReason }
  | {
      readonly phase: 'SUCCESS'
      readonly captureCloseTimestampMs: number
      readonly successDeadlineTimestampMs: number
      readonly feedbackElapsed: boolean
    }

export type IntervalJudgementInputEvent =
  | { readonly type: 'NOTE_ON'; readonly note: number; readonly timestampMs: number }
  | { readonly type: 'NOTE_OFF'; readonly note: number; readonly timestampMs: number }
  | { readonly type: 'TIME_ADVANCE'; readonly timestampMs: number }
  | { readonly type: 'INPUT_STATE_RESET'; readonly timestampMs: number }

export type IntervalJudgementSettledEvent =
  | {
      readonly type: 'QUESTION_WRONG_ATTEMPT'
      readonly questionId: string
      readonly reason: IntervalJudgementWrongReason
      readonly timestampMs: number
    }
  | {
      readonly type: 'QUESTION_CORRECT'
      readonly questionId: string
      readonly timestampMs: number
    }

export interface IntervalJudgementSnapshot {
  readonly questionId: string
  readonly state: IntervalJudgementState
  readonly expectedPitches: readonly number[]
  readonly requiredPhysicalPitchCount: 1 | 2
  readonly heldPitches: readonly number[]
  readonly settledEvents: readonly IntervalJudgementSettledEvent[]
  readonly lastTimestampMs: number
}

function assertTimestamp(timestampMs: number): void {
  if (!Number.isFinite(timestampMs)) throw new RangeError('timestampMs must be finite')
}

function assertMidiByte(note: number): void {
  if (!Number.isInteger(note) || note < 0 || note > 127) {
    throw new RangeError(`MIDI note must be an integer from 0 through 127; received ${note}`)
  }
}

function sorted(values: ReadonlySet<number>): readonly number[] {
  return Object.freeze([...values].sort((left, right) => left - right))
}

function freezeState(state: IntervalJudgementState): IntervalJudgementState {
  return state.phase === 'COLLECTING'
    ? Object.freeze({ ...state, collectedPitches: Object.freeze([...state.collectedPitches]) })
    : Object.freeze({ ...state })
}

function sameSet(left: ReadonlySet<number>, right: ReadonlySet<number>): boolean {
  if (left.size !== right.size) return false
  for (const pitch of left) if (!right.has(pitch)) return false
  return true
}

/**
 * One-question deterministic Interval judgement.
 * It owns no timer, MIDI transport, React state, scheduler, storage or question generation.
 */
export class IntervalJudgementCore {
  private stateValue: IntervalJudgementState = Object.freeze({ phase: 'READY' })
  private readonly expectedPitches: ReadonlySet<number>
  private readonly requiredPhysicalPitchCount: 1 | 2
  private readonly heldPitches = new Set<number>()
  private readonly attemptPitches = new Set<number>()
  private readonly settledEvents: IntervalJudgementSettledEvent[] = []
  private lastTimestampValue: number
  private correctEventEmitted = false

  constructor(readonly question: ScheduledIntervalQuestion, questionReadyTimestampMs: number) {
    assertTimestamp(questionReadyTimestampMs)
    assertMidiByte(question.rootMidi)
    assertMidiByte(question.targetMidi)
    this.expectedPitches = new Set([question.rootMidi, question.targetMidi])
    this.requiredPhysicalPitchCount = this.expectedPitches.size as 1 | 2
    this.lastTimestampValue = questionReadyTimestampMs
  }

  get snapshot(): IntervalJudgementSnapshot {
    return Object.freeze({
      questionId: this.question.questionId,
      state: freezeState(this.stateValue),
      expectedPitches: sorted(this.expectedPitches),
      requiredPhysicalPitchCount: this.requiredPhysicalPitchCount,
      heldPitches: sorted(this.heldPitches),
      settledEvents: Object.freeze(this.settledEvents.map((event) => Object.freeze({ ...event }))),
      lastTimestampMs: this.lastTimestampValue
    })
  }

  process(event: IntervalJudgementInputEvent): readonly IntervalJudgementSettledEvent[] {
    this.validateEvent(event)
    const firstNewEvent = this.settledEvents.length

    this.settleExpiredCaptureBefore(event)
    this.dispatch(event)
    this.settleAtExactCaptureBoundary(event)
    this.advanceSuccessFeedback(event)
    this.lastTimestampValue = event.timestampMs

    return Object.freeze(
      this.settledEvents.slice(firstNewEvent).map((settledEvent) => Object.freeze({ ...settledEvent }))
    )
  }

  private validateEvent(event: IntervalJudgementInputEvent): void {
    assertTimestamp(event.timestampMs)
    if (event.timestampMs < this.lastTimestampValue) {
      throw new RangeError(`Non-monotonic timestamp: ${event.timestampMs} < ${this.lastTimestampValue}`)
    }
    if (event.type === 'NOTE_ON' || event.type === 'NOTE_OFF') assertMidiByte(event.note)
  }

  private settleExpiredCaptureBefore(event: IntervalJudgementInputEvent): void {
    if (this.stateValue.phase !== 'COLLECTING') return
    const explicitClose = event.type === 'TIME_ADVANCE'
      && event.timestampMs >= this.stateValue.captureCloseTimestampMs
    if (event.timestampMs > this.stateValue.captureCloseTimestampMs || explicitClose) {
      this.expireIncompleteCapture()
    }
  }

  private settleAtExactCaptureBoundary(event: IntervalJudgementInputEvent): void {
    if (this.stateValue.phase !== 'COLLECTING') return
    if (event.timestampMs >= this.stateValue.captureCloseTimestampMs) this.expireIncompleteCapture()
  }

  private dispatch(event: IntervalJudgementInputEvent): void {
    if (event.type === 'INPUT_STATE_RESET') {
      this.heldPitches.clear()
      this.attemptPitches.clear()
      this.correctEventEmitted = false
      this.stateValue = Object.freeze({ phase: 'READY' })
      return
    }
    if (event.type === 'TIME_ADVANCE') return

    if (event.type === 'NOTE_OFF') {
      this.heldPitches.delete(event.note)
      this.attemptPitches.delete(event.note)
      if (this.stateValue.phase === 'COLLECTING' && this.attemptPitches.size === 0) {
        this.stateValue = Object.freeze({ phase: 'READY' })
      } else if (this.stateValue.phase === 'WRONG_WAIT_RELEASE' && this.heldPitches.size === 0) {
        this.attemptPitches.clear()
        this.stateValue = Object.freeze({ phase: 'READY' })
      }
      return
    }

    if (this.heldPitches.has(event.note)) return
    this.heldPitches.add(event.note)
    if (this.stateValue.phase === 'WRONG_WAIT_RELEASE') return

    if (this.stateValue.phase === 'SUCCESS') {
      if (event.timestampMs <= this.stateValue.captureCloseTimestampMs) {
        this.attemptPitches.add(event.note)
        if (this.attemptPitches.size > this.requiredPhysicalPitchCount) {
          this.fail('EXTRA_PITCH', event.timestampMs)
        }
      }
      return
    }

    if (this.stateValue.phase === 'READY') {
      this.attemptPitches.clear()
      this.attemptPitches.add(event.note)
      const captureCloseTimestampMs = event.timestampMs + INTERVAL_CAPTURE_WINDOW_MS
      if (this.requiredPhysicalPitchCount === 1) {
        if (this.expectedPitches.has(event.note)) {
          this.succeed(captureCloseTimestampMs, event.timestampMs)
        } else {
          this.fail('WRONG_PITCH_SET', event.timestampMs)
        }
        return
      }
      this.stateValue = freezeState({
        phase: 'COLLECTING',
        captureStartTimestampMs: event.timestampMs,
        captureCloseTimestampMs,
        collectedPitches: sorted(this.attemptPitches)
      })
      return
    }

    this.attemptPitches.add(event.note)
    if (this.attemptPitches.size > this.requiredPhysicalPitchCount) {
      this.fail('EXTRA_PITCH', event.timestampMs)
    } else if (this.attemptPitches.size === this.requiredPhysicalPitchCount) {
      if (sameSet(this.attemptPitches, this.expectedPitches)) {
        this.succeed(this.stateValue.captureCloseTimestampMs, event.timestampMs)
      } else {
        this.fail('WRONG_PITCH_SET', event.timestampMs)
      }
    } else {
      this.stateValue = freezeState({ ...this.stateValue, collectedPitches: sorted(this.attemptPitches) })
    }
  }

  private expireIncompleteCapture(): void {
    this.attemptPitches.clear()
    this.stateValue = Object.freeze({ phase: 'READY' })
  }

  private succeed(captureCloseTimestampMs: number, timestampMs: number): void {
    this.correctEventEmitted = false
    this.stateValue = Object.freeze({
      phase: 'SUCCESS',
      captureCloseTimestampMs,
      successDeadlineTimestampMs: timestampMs + INTERVAL_SUCCESS_DURATION_MS,
      feedbackElapsed: false
    })
  }

  private fail(reason: IntervalJudgementWrongReason, timestampMs: number): void {
    this.correctEventEmitted = false
    this.stateValue = Object.freeze({ phase: 'WRONG_WAIT_RELEASE', reason })
    this.settledEvents.push(Object.freeze({
      type: 'QUESTION_WRONG_ATTEMPT',
      questionId: this.question.questionId,
      reason,
      timestampMs
    }))
  }

  private advanceSuccessFeedback(event: IntervalJudgementInputEvent): void {
    if (this.stateValue.phase !== 'SUCCESS') return
    const feedbackElapsed = this.stateValue.feedbackElapsed
      || (event.type === 'TIME_ADVANCE' && event.timestampMs >= this.stateValue.successDeadlineTimestampMs)
    if (feedbackElapsed !== this.stateValue.feedbackElapsed) {
      this.stateValue = Object.freeze({ ...this.stateValue, feedbackElapsed: true })
    }
    if (!feedbackElapsed || this.heldPitches.size !== 0 || this.correctEventEmitted) return
    this.correctEventEmitted = true
    this.settledEvents.push(Object.freeze({
      type: 'QUESTION_CORRECT',
      questionId: this.question.questionId,
      timestampMs: event.timestampMs
    }))
  }
}
