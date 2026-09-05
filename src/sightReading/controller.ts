import { midiNumberToNoteName } from './midiNotes'
import { normalizeSightReadingMidiEvent, type SightReadingMidiEvent } from './midi'
import { createShuffledSightReadingBag, getSightReadingNotes, type SightReadingNote } from './sightReadingNotes'
import {
  createSightReadingDoubleQuestions,
  type SightReadingDoubleQuestion
} from './doubleNoteQuestions'
import { SightReadingSessionCore, type SightReadingOutcomeRecord } from './sightReadingSession'
import {
  getSightReadingAnswerTimeoutMs,
  getEffectiveSightReadingNotePoolMode,
  migrateSightReadingSettings,
  type SightReadingSettings
} from './sightReadingSettings'
import { calculateSightReadingAccuracy, createSightReadingSessionReport, type SightReadingSessionReport } from './report'

export interface Clock { now(): number }
export interface Scheduler {
  schedule(callback: () => void, delayMs: number): number
  cancel(id: number): void
}
export interface SightReadingDependencies {
  clock: Clock
  scheduler: Scheduler
  random: () => number
  readMidiWatermark: () => number | null
}

export const QUESTION_DISPLAY_DELAY_MS = 32
export const FEEDBACK_DURATION_MS = 350
export const DOUBLE_NOTE_CORRECT_FEEDBACK_DURATION_MS = 1200
export const DOUBLE_NOTE_WRONG_FEEDBACK_DURATION_MS = 1600

/** Single-note sequencing only. No React, browser, hardware API or persistence. */
export class SightReadingController {
  private settings: SightReadingSettings
  private notes: SightReadingNote[]
  private core: SightReadingSessionCore
  private status: 'idle' | 'running' | 'finished' | 'stopped' = 'idle'
  private report: SightReadingSessionReport | null = null
  private outcome: SightReadingOutcomeRecord | null = null
  private currentInput = ''
  private currentInputMidiNumber: number | null = null
  private bag: SightReadingNote[] = []
  private doubleQuestions: SightReadingDoubleQuestion[] = []
  private currentDoubleQuestion: SightReadingDoubleQuestion | null = null
  private doubleQuestionIndex = 0
  private previousMidiNumber: number | null = null
  private timer: number | null = null
  private timerGeneration = 0
  private advanceDeadline = 0
  private remainingAdvanceMs = 0
  private disconnected = false
  private listeners = new Set<() => void>()

  constructor(settings: SightReadingSettings, private readonly dependencies: SightReadingDependencies) {
    this.settings = migrateSightReadingSettings(settings)
    this.notes = getSightReadingNotes(this.settings)
    this.core = new SightReadingSessionCore(this.notes)
  }

  get snapshot() {
    const counters = this.core.counters
    return {
      status: this.status,
      phase: this.core.phase,
      isPaused: this.core.paused,
      currentNote: this.core.currentNote,
      currentTargetNotes: this.core.currentNotes,
      currentIntervalLabel: this.currentDoubleQuestion?.interval.label ?? null,
      currentInput: this.currentInput,
      currentInputMidiNumber: this.currentInputMidiNumber,
      result: this.outcome?.outcome ?? null,
      completedQuestions: counters.completed,
      correctCount: counters.correct,
      wrongCount: counters.wrong,
      timeoutCount: counters.timeout,
      currentStreak: counters.currentStreak,
      bestStreak: counters.bestStreak,
      accuracy: calculateSightReadingAccuracy(counters.correct, counters.completed),
      report: this.report
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  start(settings: SightReadingSettings = this.settings): void {
    this.initialize(settings)
    this.core.start(this.dependencies.clock.now(), this.dependencies.readMidiWatermark())
    this.status = 'running'
    this.displayNextQuestion()
    if (this.disconnected) this.pause()
  }

  reset(settings: SightReadingSettings = this.settings): void {
    this.initialize(settings)
    this.status = 'idle'
    this.notify()
  }

  handleMidi(event: SightReadingMidiEvent): void {
    if (this.status !== 'running' || this.disconnected) return
    const hadCapture = this.core.hasActiveDoubleCapture()
    const outcome = this.core.processMidiEvent(normalizeSightReadingMidiEvent(event))
    if (outcome) this.applyOutcome(outcome)
    else if (!hadCapture && this.core.hasActiveDoubleCapture()) {
      this.scheduleDoubleCapture(this.core.getRemainingCaptureMs(this.dependencies.clock.now()))
      this.notify()
    }
  }

  pause(): void {
    if (this.status !== 'running' || this.core.paused) return
    const now = this.dependencies.clock.now()
    this.core.pause(now)
    if (this.core.phase === 'feedback') this.remainingAdvanceMs = Math.max(0, this.advanceDeadline - now)
    this.clearTimer()
    this.notify()
  }

  resume(): void {
    if (this.status !== 'running' || !this.core.paused || this.disconnected) return
    this.core.resume(this.dependencies.clock.now(), this.dependencies.readMidiWatermark())
    if (this.core.phase === 'display') this.schedule(() => this.unlockQuestion(), QUESTION_DISPLAY_DELAY_MS)
    else if (this.core.phase === 'answering') {
      if (this.core.hasActiveDoubleCapture()) this.scheduleDoubleCapture(this.core.getRemainingCaptureMs(this.dependencies.clock.now()))
      else this.scheduleQuestionTimeout(this.core.remainingQuestionMs)
    }
    else if (this.core.phase === 'feedback') this.scheduleAdvance(this.remainingAdvanceMs)
    this.notify()
  }

  panic(): void {
    this.core.clearTransientInput(this.dependencies.readMidiWatermark())
    this.currentInput = ''
    this.currentInputMidiNumber = null
    if (this.settings.noteMode === 'double' && this.status === 'running' && !this.core.paused && this.core.phase === 'answering') {
      this.scheduleQuestionTimeout(this.core.getRemainingQuestionMs(this.dependencies.clock.now()))
    }
    this.notify()
  }

  /** Adapter supplies device events. Disconnect never creates a wrong/timeout outcome. */
  disconnect(): void {
    this.disconnected = true
    this.pause()
    this.panic()
  }

  /** Reconnect changes the watermark only; explicit resume is still required. */
  reconnect(): void {
    this.disconnected = false
    this.panic()
  }

  /** Android capability. Desktop legacy Stop continues to call reset(), not this. */
  stop(): SightReadingSessionReport | null {
    if (this.status !== 'running') return this.report
    return this.finish('stopped')
  }

  getRemainingTimeMs(): number {
    const answerTimeoutMs = getSightReadingAnswerTimeoutMs(this.settings)
    if (this.status !== 'running' || this.core.phase === 'display') return answerTimeoutMs
    return Math.min(answerTimeoutMs, this.core.getRemainingQuestionMs(this.dependencies.clock.now()))
  }

  dispose(): void {
    this.clearTimer()
    this.listeners.clear()
  }

  private initialize(settings: SightReadingSettings): void {
    this.clearTimer()
    this.settings = migrateSightReadingSettings(settings)
    this.notes = getSightReadingNotes({
      ...this.settings,
      notePoolMode: getEffectiveSightReadingNotePoolMode(this.settings)
    })
    this.core = new SightReadingSessionCore(this.notes, this.settings.noteMode)
    this.bag = []
    this.doubleQuestions = this.settings.noteMode === 'double'
      ? createSightReadingDoubleQuestions({
          keySignature: this.settings.keySignature,
          staffMode: this.settings.staffMode,
          questionCount: this.settings.questionCount,
          random: this.dependencies.random
        })
      : []
    this.currentDoubleQuestion = null
    this.doubleQuestionIndex = 0
    this.previousMidiNumber = null
    this.report = null
    this.outcome = null
    this.currentInput = ''
    this.currentInputMidiNumber = null
    this.remainingAdvanceMs = 0
  }

  private displayNextQuestion(): void {
    if (this.settings.noteMode === 'double') {
      const next = this.doubleQuestions[this.doubleQuestionIndex]
      if (!next) {
        this.finish('completed')
        return
      }
      this.doubleQuestionIndex += 1
      this.currentDoubleQuestion = next
      this.core.beginQuestion(next.notes)
      this.outcome = null
      this.currentInput = ''
      this.currentInputMidiNumber = null
      this.schedule(() => this.unlockQuestion(), QUESTION_DISPLAY_DELAY_MS)
      this.notify()
      return
    }
    if (this.bag.length === 0) {
      this.bag = createShuffledSightReadingBag(this.notes, this.previousMidiNumber, this.dependencies.random)
    }
    const next = this.bag.shift() as SightReadingNote
    this.previousMidiNumber = next.midiNumber
    this.core.beginQuestion(next)
    this.outcome = null
    this.currentInput = ''
    this.currentInputMidiNumber = null
    this.schedule(() => this.unlockQuestion(), QUESTION_DISPLAY_DELAY_MS)
    this.notify()
  }

  private unlockQuestion(): void {
    if (this.status !== 'running' || this.core.paused || this.core.phase !== 'display') return
    const answerTimeoutMs = getSightReadingAnswerTimeoutMs(this.settings)
    this.core.unlockQuestion(this.dependencies.clock.now(), this.dependencies.readMidiWatermark(), answerTimeoutMs)
    this.scheduleQuestionTimeout(answerTimeoutMs)
    this.notify()
  }

  private scheduleQuestionTimeout(delayMs: number): void {
    const delay = Math.max(0, delayMs)
    this.core.questionDeadlineMs = this.dependencies.clock.now() + delay
    this.core.remainingQuestionMs = delay
    this.schedule(() => {
      if (this.status !== 'running') return
      const outcome = this.core.recordTimeout()
      if (outcome) this.applyOutcome(outcome)
    }, delay)
  }

  private scheduleDoubleCapture(delayMs: number): void {
    const delay = Math.max(0, delayMs)
    this.schedule(() => {
      if (this.status !== 'running') return
      const outcome = this.core.settleDoubleCapture()
      if (outcome) this.applyOutcome(outcome)
    }, delay)
  }

  private applyOutcome(outcome: SightReadingOutcomeRecord): void {
    this.outcome = outcome
    this.currentInput = outcome.inputName || (outcome.inputMidiNumber !== null ? midiNumberToNoteName(outcome.inputMidiNumber) : '')
    this.currentInputMidiNumber = outcome.inputMidiNumber
    const feedbackDurationMs = this.settings.noteMode === 'double'
      ? outcome.outcome === 'correct'
        ? DOUBLE_NOTE_CORRECT_FEEDBACK_DURATION_MS
        : DOUBLE_NOTE_WRONG_FEEDBACK_DURATION_MS
      : FEEDBACK_DURATION_MS
    this.scheduleAdvance(feedbackDurationMs)
    this.notify()
  }

  private scheduleAdvance(delayMs: number): void {
    const delay = Math.max(0, delayMs)
    this.remainingAdvanceMs = delay
    this.advanceDeadline = this.dependencies.clock.now() + delay
    this.schedule(() => {
      if (this.status !== 'running' || this.core.paused) return
      const action = this.core.completeFeedback(this.settings.questionCount)
      if (action === 'finish') this.finish('completed')
      else if (action === 'next') this.displayNextQuestion()
    }, delay)
  }

  private finish(completionState: SightReadingSessionReport['completionState']): SightReadingSessionReport {
    this.clearTimer()
    this.report = createSightReadingSessionReport(this.settings, this.core.counters, this.notes, completionState)
    this.core.finish()
    this.status = completionState === 'completed' ? 'finished' : 'stopped'
    this.notify()
    return this.report
  }

  private schedule(callback: () => void, delay: number): void {
    this.clearTimer()
    const generation = this.timerGeneration
    this.timer = this.dependencies.scheduler.schedule(() => {
      if (generation !== this.timerGeneration) return
      this.timer = null
      callback()
    }, delay)
  }

  private clearTimer(): void {
    this.timerGeneration += 1
    if (this.timer !== null) this.dependencies.scheduler.cancel(this.timer)
    this.timer = null
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
