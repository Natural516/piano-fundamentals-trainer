import {
  normalizeSightReadingMidiEvent,
  type SightReadingMidiEvent
} from '../../../../src/sightReading/midi'
import {
  IntervalJudgementCore,
  type IntervalJudgementInputEvent,
  type IntervalJudgementSnapshot,
  type IntervalJudgementSettledEvent
} from './judgement'
import type { ScheduledIntervalQuestion } from './types'

export interface IntervalMidiRuntimeClock {
  now(): number
}

export interface IntervalMidiRuntimeScheduler {
  schedule(callback: () => void, delayMs: number): number
  cancel(id: number): void
}

export interface IntervalMidiRuntimeDependencies {
  readonly clock: IntervalMidiRuntimeClock
  readonly scheduler: IntervalMidiRuntimeScheduler
  readonly onQuestionCorrect: (questionId: string) => void
  readonly onSettledEvent?: (event: IntervalJudgementSettledEvent) => void
}

export interface IntervalMidiRuntimeSnapshot {
  readonly active: boolean
  readonly transportReady: boolean
  readonly judgement: IntervalJudgementSnapshot | null
  readonly receivedMidiEventCount: number
  readonly forwardedMidiEventCount: number
  readonly lastNormalizedEvent: SightReadingMidiEvent | null
}

function cloneMidiEvent(event: SightReadingMidiEvent | null): SightReadingMidiEvent | null {
  return event ? Object.freeze({ ...event }) : null
}

/** Timer and normalized-MIDI adapter around the pure one-question core. */
export class IntervalPracticeMidiRuntime {
  private activeValue = false
  private transportReadyValue = true
  private judgementValue: IntervalJudgementCore | null = null
  private readonly listeners = new Set<() => void>()
  private captureTimerId: number | null = null
  private successTimerId: number | null = null
  private timerToken = 0
  private questionGeneration = 0
  private receivedMidiEventCountValue = 0
  private forwardedMidiEventCountValue = 0
  private lastNormalizedEventValue: SightReadingMidiEvent | null = null

  constructor(private readonly dependencies: IntervalMidiRuntimeDependencies) {}

  get snapshot(): IntervalMidiRuntimeSnapshot {
    return Object.freeze({
      active: this.activeValue,
      transportReady: this.transportReadyValue,
      judgement: this.judgementValue?.snapshot ?? null,
      receivedMidiEventCount: this.receivedMidiEventCountValue,
      forwardedMidiEventCount: this.forwardedMidiEventCountValue,
      lastNormalizedEvent: cloneMidiEvent(this.lastNormalizedEventValue)
    })
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  activate(question: ScheduledIntervalQuestion): void {
    this.activeValue = true
    this.ensureQuestion(question)
    this.notify()
  }

  deactivate(): void {
    this.activeValue = false
    this.invalidateTimers()
    this.judgementValue = null
    this.questionGeneration += 1
    this.notify()
  }

  ensureQuestion(question: ScheduledIntervalQuestion): void {
    if (!this.activeValue) return
    if (this.judgementValue?.snapshot.questionId === question.questionId) return
    this.invalidateTimers()
    this.questionGeneration += 1
    this.judgementValue = new IntervalJudgementCore(question, this.dependencies.clock.now())
    this.notify()
  }

  setTransportReady(ready: boolean): void {
    if (ready === this.transportReadyValue) return
    this.transportReadyValue = ready
    if (!ready && this.judgementValue) {
      this.invalidateTimers()
      const timestampMs = Math.max(this.dependencies.clock.now(), this.judgementValue.snapshot.lastTimestampMs)
      this.judgementValue.process({ type: 'INPUT_STATE_RESET', timestampMs })
    }
    this.notify()
  }

  resetInputState(): void {
    if (!this.judgementValue) return
    this.invalidateTimers()
    const timestampMs = Math.max(this.dependencies.clock.now(), this.judgementValue.snapshot.lastTimestampMs)
    this.judgementValue.process({ type: 'INPUT_STATE_RESET', timestampMs })
    this.notify()
  }

  handleMidi(sourceEvent: SightReadingMidiEvent): void {
    this.receivedMidiEventCountValue += 1
    const event = normalizeSightReadingMidiEvent(sourceEvent)
    this.lastNormalizedEventValue = cloneMidiEvent(event)
    if (!this.activeValue || !this.transportReadyValue || !this.judgementValue) {
      this.notify()
      return
    }
    const mapped = this.mapMidiEvent(event)
    if (!mapped) {
      this.notify()
      return
    }
    this.forwardedMidiEventCountValue += 1
    this.process(mapped)
  }

  private mapMidiEvent(event: SightReadingMidiEvent): IntervalJudgementInputEvent | null {
    if (!Number.isFinite(event.timestamp)) return null
    if (event.type === 'noteOn' && Number.isInteger(event.midiNumber)) {
      return { type: 'NOTE_ON', note: event.midiNumber!, timestampMs: event.timestamp }
    }
    if (event.type === 'noteOff' && Number.isInteger(event.midiNumber)) {
      return { type: 'NOTE_OFF', note: event.midiNumber!, timestampMs: event.timestamp }
    }
    return null
  }

  private process(event: IntervalJudgementInputEvent): void {
    if (!this.judgementValue) return
    const settled = this.judgementValue.process(event)
    this.applySettledEvents(settled)
    this.syncTimers()
    this.notify()
  }

  private applySettledEvents(events: readonly IntervalJudgementSettledEvent[]): void {
    for (const event of events) {
      this.dependencies.onSettledEvent?.(event)
      if (event.type !== 'QUESTION_CORRECT') continue
      this.dependencies.onQuestionCorrect(event.questionId)
    }
  }

  private syncTimers(): void {
    this.invalidateTimers()
    const state = this.judgementValue?.snapshot.state
    if (!state || !this.activeValue || !this.transportReadyValue) return
    const generation = this.questionGeneration
    const token = this.timerToken
    if (state.phase === 'COLLECTING') {
      const closeTimestampMs = state.captureCloseTimestampMs
      this.captureTimerId = this.dependencies.scheduler.schedule(() => {
        if (!this.isCurrentTimer(token, generation)) return
        this.captureTimerId = null
        this.process({ type: 'TIME_ADVANCE', timestampMs: closeTimestampMs })
      }, Math.max(0, closeTimestampMs - this.dependencies.clock.now()))
    } else if (state.phase === 'SUCCESS' && !state.feedbackElapsed) {
      const deadlineTimestampMs = state.successDeadlineTimestampMs
      this.successTimerId = this.dependencies.scheduler.schedule(() => {
        if (!this.isCurrentTimer(token, generation)) return
        this.successTimerId = null
        this.process({ type: 'TIME_ADVANCE', timestampMs: deadlineTimestampMs })
      }, Math.max(0, deadlineTimestampMs - this.dependencies.clock.now()))
    }
  }

  private isCurrentTimer(token: number, generation: number): boolean {
    return token === this.timerToken
      && generation === this.questionGeneration
      && this.activeValue
      && this.transportReadyValue
      && this.judgementValue !== null
  }

  private invalidateTimers(): void {
    this.timerToken += 1
    if (this.captureTimerId !== null) this.dependencies.scheduler.cancel(this.captureTimerId)
    if (this.successTimerId !== null) this.dependencies.scheduler.cancel(this.successTimerId)
    this.captureTimerId = null
    this.successTimerId = null
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
