import { CHORD_BLOCK_CAPTURE_CONTRACT } from '../../musicTheory/chords/productContract'
import type { ChordPracticeQuestion } from '../../musicTheory/chords/types'
import type {
  ChordArpeggioErrorReason,
  ChordBlockErrorReason,
  ChordJudgementFacts,
  ChordJudgementInputEvent,
  ChordJudgementResumeTarget,
  ChordJudgementSettledEvent,
  ChordJudgementSnapshot,
  ChordJudgementState,
  ChordJudgementSuspensionReason,
  ChordJudgementTarget,
  ChordQuestionTimingFacts
} from './types'

const EMPTY_TIMING: ChordQuestionTimingFacts = Object.freeze({
  questionStartLatencyMs: null,
  arpeggioDurationMs: null,
  switchToBlockLatencyMs: null,
  blockLandingSpreadMs: null
})

function assertTimestamp(timestampMs: number, label = 'timestampMs'): void {
  if (!Number.isFinite(timestampMs)) throw new RangeError(`${label} must be finite`)
}

function assertMidiByte(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 127) {
    throw new RangeError(`${label} must be an integer from 0 through 127; received ${value}`)
  }
}

function sortedNotes(notes: ReadonlySet<number>): readonly number[] {
  return Object.freeze([...notes].sort((left, right) => left - right))
}

function freezeState(state: ChordJudgementState): ChordJudgementState {
  if (state.phase === 'BLOCK_CAPTURE') {
    return Object.freeze({ ...state, capturedTargetNotes: Object.freeze([...state.capturedTargetNotes]) })
  }
  return Object.freeze({ ...state })
}

function sameNumberSet(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((note) => rightSet.has(note))
}

function createTarget(question: ChordPracticeQuestion): ChordJudgementTarget {
  const arpeggioMidi = Object.freeze(question.arpeggioNotes.map((note) => note.soundingMidi))
  const blockMidi = Object.freeze(question.blockNotes.map((note) => note.soundingMidi))
  if (arpeggioMidi.length !== 3 && arpeggioMidi.length !== 4) {
    throw new RangeError(`Chord judgement requires exactly 3 or 4 notes; received ${arpeggioMidi.length}`)
  }
  if (blockMidi.length !== arpeggioMidi.length || new Set(blockMidi).size !== blockMidi.length) {
    throw new RangeError('Block target must contain the same number of distinct notes as the Arpeggio target')
  }
  if (new Set(arpeggioMidi).size !== arpeggioMidi.length || !sameNumberSet(arpeggioMidi, blockMidi)) {
    throw new RangeError('Arpeggio and Block must use the same exact MIDI pitch set')
  }
  for (let index = 1; index < arpeggioMidi.length; index += 1) {
    if (arpeggioMidi[index] <= arpeggioMidi[index - 1]) {
      throw new RangeError('Arpeggio target must be strictly ascending by sounding MIDI pitch')
    }
  }
  arpeggioMidi.forEach((note) => assertMidiByte(note, 'target note'))
  return Object.freeze({ arpeggioMidi, blockMidi })
}

/**
 * One-question, pure deterministic Chord V1 judgement state machine.
 * It owns no clock, scheduler, MIDI transport, UI, storage, or question generator.
 */
export class ChordJudgementCore {
  readonly target: ChordJudgementTarget

  private stateValue: ChordJudgementState = freezeState({ phase: 'ARPEGGIO_READY', expectedIndex: 0 })
  private readonly heldNotes = new Set<number>()
  private readonly blockTargetSet: ReadonlySet<number>
  private readonly settledEvents: ChordJudgementSettledEvent[] = []
  private lastTimestampValue: number
  private totalExcludedSuspensionMs = 0
  private suspensionStartedTimestampMs: number | null = null

  private arpeggioErrorCount = 0
  private blockErrorCount = 0
  private firstPassEligibleValue = true
  private questionCompletedValue = false
  private firstPassCompletedValue: boolean | null = null

  private firstArpeggioAttemptOpen = true
  private questionStartLatencyMs: number | null = null
  private readonly questionReadyActiveTimestampMs: number
  private arpeggioAttemptStartActiveMs: number | null = null
  private cycleArpeggioDurationMs: number | null = null
  private arpeggioReleaseSettledActiveMs: number | null = null
  private blockFirstTargetActiveMs: number | null = null
  private blockLastRequiredTargetActiveMs: number | null = null
  private cycleSwitchToBlockLatencyMs: number | null = null
  private cycleBlockLandingSpreadMs: number | null = null
  private finalTiming: ChordQuestionTimingFacts = EMPTY_TIMING

  constructor(question: ChordPracticeQuestion, questionReadyTimestampMs: number) {
    assertTimestamp(questionReadyTimestampMs, 'questionReadyTimestampMs')
    this.target = createTarget(question)
    this.blockTargetSet = new Set(this.target.blockMidi)
    this.lastTimestampValue = questionReadyTimestampMs
    this.questionReadyActiveTimestampMs = questionReadyTimestampMs
  }

  get snapshot(): ChordJudgementSnapshot {
    const events = Object.freeze(this.settledEvents.map((event) => Object.freeze({ ...event })))
    return Object.freeze({
      state: freezeState(this.stateValue),
      target: this.target,
      heldNotes: sortedNotes(this.heldNotes),
      facts: this.facts,
      settledEvents: events,
      lastTimestampMs: this.lastTimestampValue
    })
  }

  get facts(): ChordJudgementFacts {
    return Object.freeze({
      arpeggioErrors: this.arpeggioErrorCount,
      blockErrors: this.blockErrorCount,
      totalErrors: this.arpeggioErrorCount + this.blockErrorCount,
      questionCompleted: this.questionCompletedValue,
      firstPassEligible: this.firstPassEligibleValue,
      firstPassCompleted: this.firstPassCompletedValue,
      timing: Object.freeze({ ...this.finalTiming, questionStartLatencyMs: this.questionStartLatencyMs })
    })
  }

  process(event: ChordJudgementInputEvent): readonly ChordJudgementSettledEvent[] {
    this.validateEvent(event)
    const firstNewEventIndex = this.settledEvents.length

    if (this.stateValue.phase === 'STOPPED') throw new Error('Cannot process events after STOPPED')
    if (this.stateValue.phase === 'QUESTION_COMPLETE' && event.type !== 'STOP') {
      throw new Error('Only STOP is valid after QUESTION_COMPLETE')
    }

    this.settleCaptureBeforeLaterEvent(event)
    this.dispatch(event)
    this.settleCaptureAtBoundary(event)
    this.lastTimestampValue = event.timestampMs

    return Object.freeze(
      this.settledEvents.slice(firstNewEventIndex).map((settledEvent) => Object.freeze({ ...settledEvent }))
    )
  }

  private validateEvent(event: ChordJudgementInputEvent): void {
    assertTimestamp(event.timestampMs)
    if (event.timestampMs < this.lastTimestampValue) {
      throw new RangeError(`Non-monotonic timestamp: ${event.timestampMs} < ${this.lastTimestampValue}`)
    }
    if (event.type === 'NOTE_ON' || event.type === 'NOTE_OFF') assertMidiByte(event.note, 'note')
    if (event.type === 'CONTROL_CHANGE') {
      assertMidiByte(event.controller, 'controller')
      assertMidiByte(event.value, 'control value')
    }
  }

  private settleCaptureBeforeLaterEvent(event: ChordJudgementInputEvent): void {
    if (this.stateValue.phase !== 'BLOCK_CAPTURE') return
    const isExplicitAdvanceAtClose = event.type === 'TIME_ADVANCE'
      && event.timestampMs >= this.stateValue.captureCloseTimestampMs
    if (event.timestampMs > this.stateValue.captureCloseTimestampMs || isExplicitAdvanceAtClose) {
      this.settleBlockCapture(this.stateValue.captureCloseTimestampMs)
    }
  }

  private settleCaptureAtBoundary(event: ChordJudgementInputEvent): void {
    if (this.stateValue.phase !== 'BLOCK_CAPTURE') return
    if (event.timestampMs >= this.stateValue.captureCloseTimestampMs) {
      this.settleBlockCapture(this.stateValue.captureCloseTimestampMs)
    }
  }

  private dispatch(event: ChordJudgementInputEvent): void {
    switch (event.type) {
      case 'NOTE_ON':
        this.heldNotes.add(event.note)
        this.handleNoteOn(event.note, event.timestampMs)
        return
      case 'NOTE_OFF':
        this.heldNotes.delete(event.note)
        this.handleReleaseGate(event.timestampMs)
        return
      case 'CONTROL_CHANGE':
      case 'TIME_ADVANCE':
        return
      case 'INPUT_STATE_RESET':
        this.resetInputState()
        return
      case 'SUSPEND':
        this.suspend(event.reason, event.timestampMs)
        return
      case 'RESUME':
        this.resume(event.timestampMs)
        return
      case 'STOP':
        this.stop()
    }
  }

  private handleNoteOn(note: number, timestampMs: number): void {
    const activeTimestampMs = this.toActiveTimestamp(timestampMs)
    switch (this.stateValue.phase) {
      case 'ARPEGGIO_READY':
      case 'ARPEGGIO_ACTIVE':
        this.handleArpeggioNoteOn(note, timestampMs, activeTimestampMs)
        return
      case 'BLOCK_READY':
        this.handleBlockReadyNoteOn(note, timestampMs, activeTimestampMs)
        return
      case 'BLOCK_CAPTURE':
        this.handleBlockCaptureNoteOn(note, timestampMs, activeTimestampMs)
        return
      case 'ARPEGGIO_WRONG_WAIT_RELEASE':
      case 'WAIT_ALL_KEYS_UP_BEFORE_BLOCK':
      case 'BLOCK_WRONG_WAIT_RELEASE':
      case 'WAIT_ALL_KEYS_UP_AFTER_BLOCK':
      case 'SUSPENDED':
      case 'RESUME_WAIT_ALL_KEYS_UP':
        return
      case 'QUESTION_COMPLETE':
      case 'STOPPED':
        throw new Error(`NOTE_ON is invalid in ${this.stateValue.phase}`)
    }
  }

  private handleArpeggioNoteOn(note: number, timestampMs: number, activeTimestampMs: number): void {
    const expectedIndex = this.stateValue.phase === 'ARPEGGIO_ACTIVE' ? this.stateValue.expectedIndex : 0
    const expectedNote = this.target.arpeggioMidi[expectedIndex]
    if (this.firstArpeggioAttemptOpen && this.questionStartLatencyMs === null) {
      this.questionStartLatencyMs = activeTimestampMs - this.questionReadyActiveTimestampMs
    }
    if (note !== expectedNote) {
      const reason: ChordArpeggioErrorReason = this.target.arpeggioMidi.includes(note)
        ? 'ARPEGGIO_WRONG_ORDER'
        : 'ARPEGGIO_WRONG_PITCH'
      this.failArpeggio(reason, timestampMs)
      return
    }

    if (expectedIndex === 0) {
      this.arpeggioAttemptStartActiveMs = activeTimestampMs
    }

    const nextIndex = expectedIndex + 1
    if (nextIndex < this.target.arpeggioMidi.length) {
      this.stateValue = freezeState({ phase: 'ARPEGGIO_ACTIVE', expectedIndex: nextIndex })
      return
    }

    if (this.arpeggioAttemptStartActiveMs === null) throw new Error('Arpeggio timing start is missing')
    this.cycleArpeggioDurationMs = activeTimestampMs - this.arpeggioAttemptStartActiveMs
    this.firstArpeggioAttemptOpen = false
    this.stateValue = freezeState({ phase: 'WAIT_ALL_KEYS_UP_BEFORE_BLOCK' })
  }

  private failArpeggio(reason: ChordArpeggioErrorReason, timestampMs: number): void {
    this.arpeggioErrorCount += 1
    this.firstPassEligibleValue = false
    this.firstArpeggioAttemptOpen = false
    this.clearCycleTiming()
    this.stateValue = freezeState({ phase: 'ARPEGGIO_WRONG_WAIT_RELEASE', reason })
    this.settledEvents.push(Object.freeze({ type: 'ARPEGGIO_ERROR', reason, timestampMs }))
  }

  private handleBlockReadyNoteOn(note: number, timestampMs: number, activeTimestampMs: number): void {
    if (!this.blockTargetSet.has(note)) {
      this.failBlock('BLOCK_WRONG_PITCH', timestampMs)
      return
    }
    this.blockFirstTargetActiveMs = activeTimestampMs
    this.blockLastRequiredTargetActiveMs = this.target.blockMidi.length === 1 ? activeTimestampMs : null
    this.stateValue = freezeState({
      phase: 'BLOCK_CAPTURE',
      captureStartTimestampMs: timestampMs,
      captureCloseTimestampMs: timestampMs + CHORD_BLOCK_CAPTURE_CONTRACT.captureWindowMs,
      capturedTargetNotes: [note]
    })
  }

  private handleBlockCaptureNoteOn(note: number, timestampMs: number, activeTimestampMs: number): void {
    const captureState = this.stateValue
    if (captureState.phase !== 'BLOCK_CAPTURE') throw new Error('Block capture state is required')
    if (!this.blockTargetSet.has(note)) {
      this.failBlock('BLOCK_WRONG_PITCH', timestampMs)
      return
    }
    const captured = new Set<number>(captureState.capturedTargetNotes)
    const wasComplete = captured.size === this.target.blockMidi.length
    captured.add(note)
    if (!wasComplete && captured.size === this.target.blockMidi.length) {
      this.blockLastRequiredTargetActiveMs = activeTimestampMs
    }
    this.stateValue = freezeState({ ...captureState, capturedTargetNotes: sortedNotes(captured) })
  }

  private settleBlockCapture(timestampMs: number): void {
    if (this.stateValue.phase !== 'BLOCK_CAPTURE') return
    const completeAndHeld = this.target.blockMidi.every((note) => this.heldNotes.has(note))
      && this.heldNotes.size === this.target.blockMidi.length
    if (!completeAndHeld) {
      this.failBlock('BLOCK_INCOMPLETE', timestampMs)
      return
    }
    if (
      this.blockFirstTargetActiveMs === null
      || this.blockLastRequiredTargetActiveMs === null
      || this.arpeggioReleaseSettledActiveMs === null
    ) {
      throw new Error('Successful Block timing candidates are incomplete')
    }
    this.cycleSwitchToBlockLatencyMs = this.blockFirstTargetActiveMs - this.arpeggioReleaseSettledActiveMs
    this.cycleBlockLandingSpreadMs = this.blockLastRequiredTargetActiveMs - this.blockFirstTargetActiveMs
    this.stateValue = freezeState({ phase: 'WAIT_ALL_KEYS_UP_AFTER_BLOCK' })
  }

  private failBlock(reason: ChordBlockErrorReason, timestampMs: number): void {
    this.blockErrorCount += 1
    this.firstPassEligibleValue = false
    this.clearCycleTiming()
    this.stateValue = freezeState({ phase: 'BLOCK_WRONG_WAIT_RELEASE', reason })
    this.settledEvents.push(Object.freeze({ type: 'BLOCK_ERROR', reason, timestampMs }))
  }

  private handleReleaseGate(timestampMs: number): void {
    if (this.heldNotes.size !== 0) return
    switch (this.stateValue.phase) {
      case 'ARPEGGIO_WRONG_WAIT_RELEASE':
        this.resetArpeggioAttempt()
        return
      case 'WAIT_ALL_KEYS_UP_BEFORE_BLOCK':
        this.arpeggioReleaseSettledActiveMs = this.toActiveTimestamp(timestampMs)
        this.stateValue = freezeState({ phase: 'BLOCK_READY' })
        return
      case 'BLOCK_WRONG_WAIT_RELEASE':
        this.resetArpeggioAttempt()
        return
      case 'WAIT_ALL_KEYS_UP_AFTER_BLOCK':
        this.completeQuestion(timestampMs)
        return
      case 'RESUME_WAIT_ALL_KEYS_UP': {
        const resumeTarget = this.stateValue.resumeTarget
        this.endSuspension(timestampMs)
        this.restoreAfterSuspension(resumeTarget, timestampMs)
        return
      }
      default:
        return
    }
  }

  private resetArpeggioAttempt(): void {
    this.clearCycleTiming()
    this.stateValue = freezeState({ phase: 'ARPEGGIO_READY', expectedIndex: 0 })
  }

  private completeQuestion(timestampMs: number): void {
    if (
      this.cycleArpeggioDurationMs === null
      || this.cycleSwitchToBlockLatencyMs === null
      || this.cycleBlockLandingSpreadMs === null
    ) {
      throw new Error('Cannot complete a question without final successful-cycle timing')
    }
    this.finalTiming = Object.freeze({
      questionStartLatencyMs: this.questionStartLatencyMs,
      arpeggioDurationMs: this.cycleArpeggioDurationMs,
      switchToBlockLatencyMs: this.cycleSwitchToBlockLatencyMs,
      blockLandingSpreadMs: this.cycleBlockLandingSpreadMs
    })
    this.questionCompletedValue = true
    this.firstPassCompletedValue = this.firstPassEligibleValue
    this.stateValue = freezeState({ phase: 'QUESTION_COMPLETE' })
    this.settledEvents.push(Object.freeze({
      type: 'QUESTION_COMPLETED',
      firstPassCompleted: this.firstPassEligibleValue,
      timestampMs
    }))
  }

  private suspend(reason: ChordJudgementSuspensionReason, timestampMs: number): void {
    if (this.stateValue.phase === 'SUSPENDED' || this.stateValue.phase === 'RESUME_WAIT_ALL_KEYS_UP') {
      throw new Error(`Cannot suspend while ${this.stateValue.phase}`)
    }
    if (this.stateValue.phase === 'QUESTION_COMPLETE' || this.stateValue.phase === 'STOPPED') {
      throw new Error(`Cannot suspend while ${this.stateValue.phase}`)
    }

    const resumeTarget = this.resolveResumeTarget()
    if (resumeTarget === 'ARPEGGIO_READY') {
      this.arpeggioAttemptStartActiveMs = null
      this.cycleArpeggioDurationMs = null
    }
    if (this.stateValue.phase !== 'WAIT_ALL_KEYS_UP_AFTER_BLOCK') this.clearBlockAttemptTiming()
    this.suspensionStartedTimestampMs = timestampMs
    this.stateValue = freezeState({ phase: 'SUSPENDED', reason, resumeTarget })
  }

  private resolveResumeTarget(): ChordJudgementResumeTarget {
    switch (this.stateValue.phase) {
      case 'ARPEGGIO_READY':
      case 'ARPEGGIO_ACTIVE':
      case 'ARPEGGIO_WRONG_WAIT_RELEASE':
      case 'BLOCK_WRONG_WAIT_RELEASE':
        return 'ARPEGGIO_READY'
      case 'WAIT_ALL_KEYS_UP_BEFORE_BLOCK':
      case 'BLOCK_READY':
      case 'BLOCK_CAPTURE':
        return 'BLOCK_READY'
      case 'WAIT_ALL_KEYS_UP_AFTER_BLOCK':
        return 'QUESTION_COMPLETE'
      default:
        throw new Error(`No resume target for ${this.stateValue.phase}`)
    }
  }

  private resume(timestampMs: number): void {
    if (this.stateValue.phase !== 'SUSPENDED') {
      throw new Error(`RESUME requires SUSPENDED; received ${this.stateValue.phase}`)
    }
    const { reason, resumeTarget } = this.stateValue
    if (this.heldNotes.size !== 0) {
      this.stateValue = freezeState({ phase: 'RESUME_WAIT_ALL_KEYS_UP', reason, resumeTarget })
      return
    }
    this.endSuspension(timestampMs)
    this.restoreAfterSuspension(resumeTarget, timestampMs)
  }

  private resetInputState(): void {
    if (this.stateValue.phase === 'SUSPENDED') {
      this.heldNotes.clear()
      return
    }
    if (this.stateValue.phase === 'RESUME_WAIT_ALL_KEYS_UP') {
      const { reason, resumeTarget } = this.stateValue
      this.heldNotes.clear()
      this.stateValue = freezeState({ phase: 'SUSPENDED', reason, resumeTarget })
      return
    }
    throw new Error(`INPUT_STATE_RESET requires a suspended or resume-gated state; received ${this.stateValue.phase}`)
  }

  private restoreAfterSuspension(resumeTarget: ChordJudgementResumeTarget, timestampMs: number): void {
    if (resumeTarget === 'ARPEGGIO_READY') {
      this.stateValue = freezeState({ phase: 'ARPEGGIO_READY', expectedIndex: 0 })
      return
    }
    if (resumeTarget === 'BLOCK_READY') {
      if (this.cycleArpeggioDurationMs === null || this.arpeggioReleaseSettledActiveMs === null) {
        if (this.cycleArpeggioDurationMs === null) throw new Error('Cannot resume Block without settled Arpeggio')
        this.arpeggioReleaseSettledActiveMs = this.toActiveTimestamp(timestampMs)
      }
      this.stateValue = freezeState({ phase: 'BLOCK_READY' })
      return
    }
    this.completeQuestion(timestampMs)
  }

  private endSuspension(timestampMs: number): void {
    if (this.suspensionStartedTimestampMs === null) throw new Error('Suspension start is missing')
    this.totalExcludedSuspensionMs += timestampMs - this.suspensionStartedTimestampMs
    this.suspensionStartedTimestampMs = null
  }

  private stop(): void {
    const disposition = this.questionCompletedValue ? 'SETTLED_COMPLETED' : 'UNSETTLED_DISCARDED'
    this.stateValue = freezeState({ phase: 'STOPPED', disposition })
  }

  private clearCycleTiming(): void {
    this.arpeggioAttemptStartActiveMs = null
    this.cycleArpeggioDurationMs = null
    this.arpeggioReleaseSettledActiveMs = null
    this.clearBlockAttemptTiming()
  }

  private clearBlockAttemptTiming(): void {
    this.blockFirstTargetActiveMs = null
    this.blockLastRequiredTargetActiveMs = null
    this.cycleSwitchToBlockLatencyMs = null
    this.cycleBlockLandingSpreadMs = null
  }

  private toActiveTimestamp(timestampMs: number): number {
    const openSuspension = this.suspensionStartedTimestampMs === null
      ? 0
      : timestampMs - this.suspensionStartedTimestampMs
    return timestampMs - this.totalExcludedSuspensionMs - openSuspension
  }
}
