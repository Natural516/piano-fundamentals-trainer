import type { SightReadingMidiEvent } from '../../../../../src/sightReading/midi'
import { ChordJudgementCore, type ChordJudgementInputEvent, type ChordJudgementSettledEvent, type ChordJudgementSuspensionReason } from '../judgement'
import {
  CHORD_QUESTION_SUCCESS_FEEDBACK_MS,
  ChordSequentialShuffleBag,
  createChordPracticeQuestionFromIdentity,
  generateChordPracticeQuestion,
  getChordPracticeQuestionIdentity,
  type ChordPracticeQuestion,
  type ChordPracticeQuestionIdentity,
  type ChordQuestionCount,
  type ChordSequentialMajorKeyId
} from '../../musicTheory/chords'
import type {
  ChordRuntimeCounters,
  ChordRuntimeDependencies,
  ChordPracticeMode,
  ChordRuntimeSessionConfig,
  ChordRuntimeSnapshot,
  ChordRuntimeStatus
} from './types'

const EMPTY_COUNTERS: ChordRuntimeCounters = Object.freeze({
  completedQuestions: 0,
  firstPassCompletedQuestions: 0,
  arpeggioErrors: 0,
  blockErrors: 0,
  totalErrors: 0,
  currentFirstPassStreak: 0,
  longestFirstPassStreak: 0
})

function assertTimestamp(timestampMs: number): void {
  if (!Number.isFinite(timestampMs)) throw new RangeError('timestampMs must be finite')
}

function cloneMidiEvent(event: SightReadingMidiEvent | null): SightReadingMidiEvent | null {
  return event ? Object.freeze({ ...event }) : null
}

/**
 * Live, in-memory Chord session orchestration. Theory owns question creation,
 * Judgement owns one-question semantics, and this class owns only scheduling,
 * transport/lifecycle boundaries and ephemeral session facts.
 */
export class ChordPracticeRuntime {
  private readonly listeners = new Set<() => void>()
  private statusValue: ChordRuntimeStatus = 'IDLE'
  private questionValue: ChordPracticeQuestion | null = null
  private questionIdentityValue: ChordPracticeQuestionIdentity | null = null
  private judgementValue: ChordJudgementCore | null = null
  private questionGenerationValue = 0
  private questionCountValue: ChordQuestionCount = 20
  private modeValue: ChordPracticeMode = 'comprehensive'
  private sequentialKeyValue: ChordSequentialMajorKeyId | null = null
  private sequentialBagValue: ChordSequentialShuffleBag | null = null
  private countersValue: ChordRuntimeCounters = EMPTY_COUNTERS
  private readonly timingSamplesValue: Array<ChordRuntimeSnapshot['timingSamples'][number]> = []
  private activePracticeAccumulatedMsValue = 0
  private activePracticeSegmentStartedAtMsValue: number | null = null
  private physicalHeldNotes = new Set<number>()
  private transportReadyValue = true
  private resumeRequiredValue = false
  private suspensionReasonValue: ChordJudgementSuspensionReason | null = null
  private captureTimerId: number | null = null
  private captureTimerToken = 0
  private successTimerId: number | null = null
  private successTimerToken = 0
  private successFeedbackDeadlineMs: number | null = null
  private successFeedbackRemainingMs: number | null = null
  private successFeedbackElapsed = false
  private waitingForInterQuestionReleaseValue = false
  private receivedMidiEventCountValue = 0
  private forwardedMidiEventCountValue = 0
  private lastNormalizedEventValue: SightReadingMidiEvent | null = null

  constructor(private readonly dependencies: ChordRuntimeDependencies) {}

  get snapshot(): ChordRuntimeSnapshot {
    const now = this.dependencies.clock.now()
    const remaining = this.statusValue === 'SUCCESS_FEEDBACK' && this.successFeedbackDeadlineMs !== null
      ? Math.max(0, this.successFeedbackDeadlineMs - now)
      : this.successFeedbackRemainingMs
    return Object.freeze({
      status: this.statusValue,
      question: this.questionValue,
      questionIdentity: this.questionIdentityValue,
      questionGeneration: this.questionGenerationValue,
      questionIndex: this.countersValue.completedQuestions + (this.statusValue === 'SESSION_COMPLETE' ? 0 : 1),
      questionCount: this.questionCountValue,
      mode: this.modeValue,
      sequentialKey: this.sequentialKeyValue,
      judgement: this.judgementValue?.snapshot ?? null,
      counters: Object.freeze({ ...this.countersValue }),
      timingSamples: Object.freeze(this.timingSamplesValue.map((sample) => Object.freeze({ ...sample }))),
      activePracticeDurationMs: this.readActivePracticeDuration(now),
      successFeedbackRemainingMs: remaining,
      waitingForInterQuestionRelease: this.waitingForInterQuestionReleaseValue,
      suspensionReason: this.suspensionReasonValue,
      transportReady: this.transportReadyValue,
      resumeRequired: this.resumeRequiredValue,
      receivedMidiEventCount: this.receivedMidiEventCountValue,
      forwardedMidiEventCount: this.forwardedMidiEventCountValue,
      lastNormalizedEvent: cloneMidiEvent(this.lastNormalizedEventValue)
    })
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  start(configuration: ChordQuestionCount | ChordRuntimeSessionConfig): void {
    const config: ChordRuntimeSessionConfig = typeof configuration === 'object'
      ? configuration
      : { mode: 'comprehensive', questionCount: configuration }
    const questionCount = config.questionCount
    if (![10, 20, 50, 100, 'endless'].includes(questionCount)) throw new RangeError('Unsupported Chord question count')
    if (config.mode !== 'sequential' && config.mode !== 'comprehensive') throw new RangeError('Unsupported Chord practice mode')
    if (config.mode === 'sequential' && !config.sequentialKey) throw new RangeError('Sequential Chord practice requires a Major Key')
    this.invalidateAllTimers()
    this.questionCountValue = questionCount
    this.modeValue = config.mode
    this.sequentialKeyValue = config.mode === 'sequential' ? config.sequentialKey! : null
    this.sequentialBagValue = config.mode === 'sequential'
      ? new ChordSequentialShuffleBag(config.sequentialKey!, questionCount, this.dependencies.rng)
      : null
    this.countersValue = EMPTY_COUNTERS
    this.timingSamplesValue.splice(0)
    this.activePracticeAccumulatedMsValue = 0
    this.activePracticeSegmentStartedAtMsValue = this.dependencies.clock.now()
    this.physicalHeldNotes.clear()
    this.resumeRequiredValue = false
    this.suspensionReasonValue = null
    this.receivedMidiEventCountValue = 0
    this.forwardedMidiEventCountValue = 0
    this.lastNormalizedEventValue = null
    this.questionGenerationValue = 0
    this.questionValue = null
    this.questionIdentityValue = null
    this.judgementValue = null
    this.armNextQuestion(this.dependencies.clock.now())
  }

  handleMidi(event: SightReadingMidiEvent): void {
    this.receivedMidiEventCountValue += 1
    this.lastNormalizedEventValue = cloneMidiEvent(event)
    if (event.type === 'noteOn' && typeof event.midiNumber === 'number') this.physicalHeldNotes.add(event.midiNumber)
    if (event.type === 'noteOff' && typeof event.midiNumber === 'number') this.physicalHeldNotes.delete(event.midiNumber)

    if (this.statusValue === 'SUCCESS_FEEDBACK') {
      if (this.successFeedbackElapsed && this.physicalHeldNotes.size === 0) this.finishSuccessBoundary(event.timestamp)
      this.notify()
      return
    }
    if (this.statusValue === 'SUSPENDED' && this.judgementValue) {
      const phase = this.judgementValue.snapshot.state.phase
      if (phase === 'SUSPENDED' || phase === 'RESUME_WAIT_ALL_KEYS_UP') {
        const mapped = this.mapMidiEvent(event)
        if (mapped) {
          this.forwardedMidiEventCountValue += 1
          this.processCoreOnly(mapped)
          if (!['SUSPENDED', 'RESUME_WAIT_ALL_KEYS_UP'].includes(this.judgementValue.snapshot.state.phase)) {
            this.statusValue = 'RUNNING'
            this.suspensionReasonValue = null
            this.resumeRequiredValue = false
            this.openActivePracticeSegment(event.timestamp)
            this.syncCaptureTimer()
          }
        }
      }
      this.notify()
      return
    }
    if (this.statusValue !== 'RUNNING' || !this.judgementValue) {
      this.notify()
      return
    }

    const mapped = this.mapMidiEvent(event)
    if (!mapped) {
      this.notify()
      return
    }
    this.forwardedMidiEventCountValue += 1
    this.processJudgement(mapped)
  }

  pause(reason: ChordJudgementSuspensionReason = 'manual-pause', timestampMs = this.dependencies.clock.now()): void {
    assertTimestamp(timestampMs)
    if (this.statusValue === 'SUSPENDED' || this.statusValue === 'IDLE' || this.statusValue === 'STOPPED' || this.statusValue === 'SESSION_COMPLETE') return
    this.closeActivePracticeSegment(timestampMs)
    this.cancelCaptureTimer()
    if (this.statusValue === 'SUCCESS_FEEDBACK') {
      this.successFeedbackRemainingMs = Math.max(0, (this.successFeedbackDeadlineMs ?? timestampMs) - timestampMs)
      this.cancelSuccessTimer()
    } else {
      this.processCoreOnly({ type: 'SUSPEND', reason, timestampMs })
    }
    this.statusValue = 'SUSPENDED'
    this.suspensionReasonValue = reason
    this.resumeRequiredValue = true
    this.notify()
  }

  resume(timestampMs = this.dependencies.clock.now()): void {
    assertTimestamp(timestampMs)
    if (this.statusValue !== 'SUSPENDED' || !this.transportReadyValue) return
    if (this.judgementValue?.snapshot.state.phase === 'QUESTION_COMPLETE' && this.successFeedbackRemainingMs !== null) {
      this.statusValue = 'SUCCESS_FEEDBACK'
      this.openActivePracticeSegment(timestampMs)
      this.suspensionReasonValue = null
      this.resumeRequiredValue = false
      this.scheduleSuccessFeedback(timestampMs, this.successFeedbackRemainingMs)
      this.notify()
      return
    }
    this.processCoreOnly({ type: 'RESUME', timestampMs })
    const waitingForRelease = this.judgementValue?.snapshot.state.phase === 'RESUME_WAIT_ALL_KEYS_UP'
    this.statusValue = waitingForRelease ? 'SUSPENDED' : 'RUNNING'
    this.suspensionReasonValue = waitingForRelease ? this.suspensionReasonValue : null
    this.resumeRequiredValue = false
    if (!waitingForRelease) {
      this.openActivePracticeSegment(timestampMs)
      this.syncCaptureTimer()
    }
    this.notify()
  }

  handleTransportLost(timestampMs = this.dependencies.clock.now()): void {
    assertTimestamp(timestampMs)
    this.transportReadyValue = false
    if (this.statusValue === 'RUNNING' || this.statusValue === 'SUCCESS_FEEDBACK') {
      this.pause('midi-disconnect', timestampMs)
    }
    if (this.judgementValue && ['SUSPENDED', 'RESUME_WAIT_ALL_KEYS_UP'].includes(this.judgementValue.snapshot.state.phase)) {
      this.processCoreOnly({ type: 'INPUT_STATE_RESET', timestampMs })
    }
    this.physicalHeldNotes.clear()
    this.resumeRequiredValue = this.statusValue === 'SUSPENDED'
    this.notify()
  }

  handleTransportReady(): void {
    this.transportReadyValue = true
    this.notify()
  }

  stop(timestampMs = this.dependencies.clock.now()): void {
    assertTimestamp(timestampMs)
    if (this.statusValue === 'STOPPED' || this.statusValue === 'IDLE') return
    this.closeActivePracticeSegment(timestampMs)
    this.invalidateAllTimers()
    if (this.judgementValue && this.judgementValue.snapshot.state.phase !== 'STOPPED') {
      this.processCoreOnly({ type: 'STOP', timestampMs })
    }
    this.statusValue = 'STOPPED'
    this.resumeRequiredValue = false
    this.suspensionReasonValue = null
    this.notify()
  }

  dispose(): void {
    this.invalidateAllTimers()
    this.listeners.clear()
    this.statusValue = 'STOPPED'
  }

  private mapMidiEvent(event: SightReadingMidiEvent): ChordJudgementInputEvent | null {
    if (!Number.isFinite(event.timestamp)) return null
    if (event.type === 'noteOn' && Number.isInteger(event.midiNumber)) {
      return { type: 'NOTE_ON', note: event.midiNumber!, timestampMs: event.timestamp }
    }
    if (event.type === 'noteOff' && Number.isInteger(event.midiNumber)) {
      return { type: 'NOTE_OFF', note: event.midiNumber!, timestampMs: event.timestamp }
    }
    if (event.type === 'controlChange' && Number.isInteger(event.midiNumber) && Number.isInteger(event.velocity)) {
      return { type: 'CONTROL_CHANGE', controller: event.midiNumber!, value: event.velocity!, timestampMs: event.timestamp }
    }
    return null
  }

  private processJudgement(event: ChordJudgementInputEvent): void {
    const settled = this.processCoreOnly(event)
    this.applySettledEvents(settled, event.timestampMs)
    this.syncCaptureTimer()
    this.notify()
  }

  private processCoreOnly(event: ChordJudgementInputEvent): readonly ChordJudgementSettledEvent[] {
    if (!this.judgementValue) return []
    return this.judgementValue.process(event)
  }

  private applySettledEvents(events: readonly ChordJudgementSettledEvent[], timestampMs: number): void {
    for (const event of events) {
      if (event.type === 'ARPEGGIO_ERROR') {
        this.countersValue = Object.freeze({
          ...this.countersValue,
          arpeggioErrors: this.countersValue.arpeggioErrors + 1,
          totalErrors: this.countersValue.totalErrors + 1
        })
      } else if (event.type === 'BLOCK_ERROR') {
        this.countersValue = Object.freeze({
          ...this.countersValue,
          blockErrors: this.countersValue.blockErrors + 1,
          totalErrors: this.countersValue.totalErrors + 1
        })
      } else {
        this.completeCurrentQuestion(timestampMs, event.firstPassCompleted)
      }
    }
  }

  private completeCurrentQuestion(timestampMs: number, firstPassCompleted: boolean): void {
    if (!this.judgementValue || this.statusValue === 'SUCCESS_FEEDBACK') return
    const completedQuestions = this.countersValue.completedQuestions + 1
    const currentFirstPassStreak = firstPassCompleted ? this.countersValue.currentFirstPassStreak + 1 : 0
    this.countersValue = Object.freeze({
      ...this.countersValue,
      completedQuestions,
      firstPassCompletedQuestions: this.countersValue.firstPassCompletedQuestions + (firstPassCompleted ? 1 : 0),
      currentFirstPassStreak,
      longestFirstPassStreak: Math.max(this.countersValue.longestFirstPassStreak, currentFirstPassStreak)
    })
    this.timingSamplesValue.push(Object.freeze({ ...this.judgementValue.facts.timing }))
    this.cancelCaptureTimer()
    this.statusValue = 'SUCCESS_FEEDBACK'
    this.successFeedbackElapsed = false
    this.waitingForInterQuestionReleaseValue = false
    this.scheduleSuccessFeedback(timestampMs, CHORD_QUESTION_SUCCESS_FEEDBACK_MS)
  }

  private scheduleSuccessFeedback(startTimestampMs: number, durationMs: number): void {
    this.cancelSuccessTimer()
    this.successFeedbackRemainingMs = durationMs
    this.successFeedbackDeadlineMs = startTimestampMs + durationMs
    const token = ++this.successTimerToken
    const generation = this.questionGenerationValue
    this.successTimerId = this.dependencies.scheduler.schedule(() => {
      if (token !== this.successTimerToken || generation !== this.questionGenerationValue || this.statusValue !== 'SUCCESS_FEEDBACK') return
      this.successTimerId = null
      this.successFeedbackRemainingMs = 0
      this.successFeedbackElapsed = true
      if (this.physicalHeldNotes.size === 0) this.finishSuccessBoundary(this.successFeedbackDeadlineMs!)
      else {
        this.waitingForInterQuestionReleaseValue = true
        this.notify()
      }
    }, Math.max(0, this.successFeedbackDeadlineMs - this.dependencies.clock.now()))
  }

  private finishSuccessBoundary(timestampMs: number): void {
    if (!this.successFeedbackElapsed || this.physicalHeldNotes.size !== 0) return
    this.cancelSuccessTimer()
    this.successFeedbackDeadlineMs = null
    this.successFeedbackRemainingMs = null
    this.waitingForInterQuestionReleaseValue = false
    if (this.questionCountValue !== 'endless' && this.countersValue.completedQuestions >= this.questionCountValue) {
      this.closeActivePracticeSegment(timestampMs)
      this.statusValue = 'SESSION_COMPLETE'
      this.notify()
      return
    }
    this.armNextQuestion(timestampMs)
  }

  private armNextQuestion(questionReadyTimestampMs: number): void {
    const question = this.sequentialBagValue
      ? createChordPracticeQuestionFromIdentity({
          identity: this.sequentialBagValue.next(),
          rng: this.dependencies.rng
        })
      : generateChordPracticeQuestion({
          rng: this.dependencies.rng,
          ...(this.questionIdentityValue ? { previousQuestionIdentity: this.questionIdentityValue } : {})
        })
    this.questionGenerationValue += 1
    this.questionValue = question
    this.questionIdentityValue = getChordPracticeQuestionIdentity(question)
    this.judgementValue = new ChordJudgementCore(question, questionReadyTimestampMs)
    this.statusValue = 'RUNNING'
    this.successFeedbackElapsed = false
    this.successFeedbackDeadlineMs = null
    this.successFeedbackRemainingMs = null
    this.waitingForInterQuestionReleaseValue = false
    this.suspensionReasonValue = null
    this.resumeRequiredValue = false
    this.notify()
  }

  private syncCaptureTimer(): void {
    const state = this.judgementValue?.snapshot.state
    if (this.statusValue !== 'RUNNING' || state?.phase !== 'BLOCK_CAPTURE') {
      this.cancelCaptureTimer()
      return
    }
    this.cancelCaptureTimer()
    const token = ++this.captureTimerToken
    const generation = this.questionGenerationValue
    const closeTimestampMs = state.captureCloseTimestampMs
    this.captureTimerId = this.dependencies.scheduler.schedule(() => {
      if (token !== this.captureTimerToken || generation !== this.questionGenerationValue || this.statusValue !== 'RUNNING') return
      if (this.judgementValue?.snapshot.state.phase !== 'BLOCK_CAPTURE') return
      this.captureTimerId = null
      this.processJudgement({ type: 'TIME_ADVANCE', timestampMs: closeTimestampMs })
    }, Math.max(0, closeTimestampMs - this.dependencies.clock.now()))
  }

  private cancelCaptureTimer(): void {
    this.captureTimerToken += 1
    if (this.captureTimerId !== null) this.dependencies.scheduler.cancel(this.captureTimerId)
    this.captureTimerId = null
  }

  private cancelSuccessTimer(): void {
    this.successTimerToken += 1
    if (this.successTimerId !== null) this.dependencies.scheduler.cancel(this.successTimerId)
    this.successTimerId = null
  }

  private invalidateAllTimers(): void {
    this.cancelCaptureTimer()
    this.cancelSuccessTimer()
  }

  private readActivePracticeDuration(now: number): number {
    return this.activePracticeAccumulatedMsValue + (this.activePracticeSegmentStartedAtMsValue === null
      ? 0
      : Math.max(0, now - this.activePracticeSegmentStartedAtMsValue))
  }

  private closeActivePracticeSegment(timestampMs: number): void {
    if (this.activePracticeSegmentStartedAtMsValue === null) return
    this.activePracticeAccumulatedMsValue += Math.max(0, timestampMs - this.activePracticeSegmentStartedAtMsValue)
    this.activePracticeSegmentStartedAtMsValue = null
  }

  private openActivePracticeSegment(timestampMs: number): void {
    if (this.activePracticeSegmentStartedAtMsValue === null) this.activePracticeSegmentStartedAtMsValue = timestampMs
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
