import type { SightReadingMidiEvent } from '../../../../src/sightReading/midi'
import { IntervalPracticeMidiRuntime, type IntervalMidiRuntimeClock, type IntervalMidiRuntimeScheduler } from './midiRuntime'
import { createIntervalPracticeState, reduceIntervalPracticeState } from './state'
import type { IntervalPracticeRng } from './scheduler'
import type { IntervalJudgementSettledEvent, IntervalJudgementSnapshot } from './judgement'
import type { IntervalPracticeSettings, IntervalPracticeState, IntervalQuestionAttempt, IntervalQuestionCount, ScheduledIntervalQuestion } from './types'

function createPendingAttempt(question: ScheduledIntervalQuestion): IntervalQuestionAttempt {
  return Object.freeze({
    questionId: question.questionId,
    intervalId: question.intervalType.id,
    root: Object.freeze({ ...question.root }),
    target: Object.freeze({ ...question.target }),
    rootMidi: question.rootMidi,
    targetMidi: question.targetMidi,
    wrongAttemptCount: 0,
    firstTryCorrect: false,
    completed: false
  })
}

export type IntervalSessionStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'SUCCESS_FEEDBACK'
  | 'SUSPENDED'
  | 'SESSION_COMPLETE'
  | 'STOPPED'

export interface IntervalSessionSnapshot {
  readonly status: IntervalSessionStatus
  readonly transportReady: boolean
  readonly settings: IntervalPracticeSettings | null
  readonly practiceState: IntervalPracticeState | null
  readonly question: ScheduledIntervalQuestion | null
  readonly questionCount: IntervalQuestionCount | null
  readonly completedQuestions: number
  readonly attempts: readonly IntervalQuestionAttempt[]
  readonly currentWrongAttemptCount: number
  readonly judgement: IntervalJudgementSnapshot | null
}

export interface IntervalSessionRuntimeDependencies {
  readonly clock: IntervalMidiRuntimeClock
  readonly scheduler: IntervalMidiRuntimeScheduler
  readonly rng: IntervalPracticeRng
}

/** Owns Interval session lifecycle while delegating one-question timing to the proven MIDI adapter. */
export class IntervalPracticeSessionRuntime {
  private statusValue: Exclude<IntervalSessionStatus, 'SUCCESS_FEEDBACK'> = 'IDLE'
  private settingsValue: IntervalPracticeSettings | null = null
  private stateValue: IntervalPracticeState | null = null
  private completedQuestionsValue = 0
  private attemptsValue: readonly IntervalQuestionAttempt[] = Object.freeze([])
  private currentWrongAttemptCountValue = 0
  private transportReadyValue = true
  private readonly listeners = new Set<() => void>()
  private readonly midiRuntime: IntervalPracticeMidiRuntime

  constructor(private readonly dependencies: IntervalSessionRuntimeDependencies) {
    this.midiRuntime = new IntervalPracticeMidiRuntime({
      clock: dependencies.clock,
      scheduler: dependencies.scheduler,
      onQuestionCorrect: (questionId) => this.completeQuestion(questionId),
      onSettledEvent: (event) => this.captureSettledEvent(event)
    })
    this.midiRuntime.subscribe(() => this.notify())
  }

  get snapshot(): IntervalSessionSnapshot {
    const midi = this.midiRuntime.snapshot
    const status: IntervalSessionStatus = this.statusValue === 'RUNNING' && midi.judgement?.state.phase === 'SUCCESS'
      ? 'SUCCESS_FEEDBACK'
      : this.statusValue
    return Object.freeze({
      status,
      transportReady: this.transportReadyValue,
      settings: this.settingsValue,
      practiceState: this.stateValue,
      question: this.stateValue?.currentQuestion ?? null,
      questionCount: this.settingsValue?.questionCount ?? null,
      completedQuestions: this.completedQuestionsValue,
      attempts: this.attemptsValue,
      currentWrongAttemptCount: this.currentWrongAttemptCountValue,
      judgement: midi.judgement
    })
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  start(settings: IntervalPracticeSettings): void {
    this.settingsValue = Object.freeze({ ...settings })
    this.stateValue = createIntervalPracticeState(this.settingsValue, this.dependencies.rng)
    this.completedQuestionsValue = 0
    this.attemptsValue = Object.freeze([createPendingAttempt(this.stateValue.currentQuestion)])
    this.currentWrongAttemptCountValue = 0
    this.statusValue = this.transportReadyValue ? 'RUNNING' : 'SUSPENDED'
    if (this.statusValue === 'RUNNING') this.midiRuntime.activate(this.stateValue.currentQuestion)
    else this.midiRuntime.deactivate()
    this.notify()
  }

  pause(): void {
    if (this.statusValue !== 'RUNNING') return
    this.statusValue = 'SUSPENDED'
    this.midiRuntime.deactivate()
    this.notify()
  }

  resume(): void {
    if (this.statusValue !== 'SUSPENDED' || !this.transportReadyValue || !this.stateValue) return
    this.statusValue = 'RUNNING'
    this.midiRuntime.activate(this.stateValue.currentQuestion)
    this.notify()
  }

  stop(): void {
    if (this.statusValue === 'IDLE' || this.statusValue === 'STOPPED') return
    this.statusValue = 'STOPPED'
    this.midiRuntime.deactivate()
    this.notify()
  }

  destroy(): void {
    this.stop()
    this.listeners.clear()
  }

  setTransportReady(ready: boolean): void {
    if (ready === this.transportReadyValue) return
    this.transportReadyValue = ready
    this.midiRuntime.setTransportReady(ready)
    if (!ready && this.statusValue === 'RUNNING') {
      this.statusValue = 'SUSPENDED'
      this.midiRuntime.deactivate()
    }
    this.notify()
  }

  resetInputState(): void {
    this.midiRuntime.resetInputState()
  }

  handleMidi(event: SightReadingMidiEvent): void {
    if (this.statusValue !== 'RUNNING') return
    this.midiRuntime.handleMidi(event)
  }

  private completeQuestion(questionId: string): void {
    if (this.statusValue !== 'RUNNING' || !this.stateValue || !this.settingsValue) return
    if (this.stateValue.currentQuestion.questionId !== questionId) return
    this.attemptsValue = Object.freeze(this.attemptsValue.map((attempt) => attempt.questionId === questionId ? Object.freeze({
      ...attempt,
      wrongAttemptCount: this.currentWrongAttemptCountValue,
      firstTryCorrect: this.currentWrongAttemptCountValue === 0,
      completed: true
    }) : attempt))
    this.currentWrongAttemptCountValue = 0
    this.completedQuestionsValue += 1
    const target = this.settingsValue.questionCount
    if (target !== 'endless' && this.completedQuestionsValue >= target) {
      this.statusValue = 'SESSION_COMPLETE'
      this.midiRuntime.deactivate()
      this.notify()
      return
    }
    this.stateValue = reduceIntervalPracticeState(
      this.stateValue,
      { type: 'NEXT_QUESTION' },
      this.dependencies.rng
    )
    this.attemptsValue = Object.freeze([...this.attemptsValue, createPendingAttempt(this.stateValue.currentQuestion)])
    this.midiRuntime.activate(this.stateValue.currentQuestion)
    this.notify()
  }

  private captureSettledEvent(event: IntervalJudgementSettledEvent): void {
    if (event.type !== 'QUESTION_WRONG_ATTEMPT' || this.statusValue !== 'RUNNING' || !this.stateValue) return
    if (this.stateValue.currentQuestion.questionId !== event.questionId) return
    this.currentWrongAttemptCountValue += 1
    this.attemptsValue = Object.freeze(this.attemptsValue.map((attempt) => attempt.questionId === event.questionId && !attempt.completed
      ? Object.freeze({ ...attempt, wrongAttemptCount: this.currentWrongAttemptCountValue })
      : attempt))
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
