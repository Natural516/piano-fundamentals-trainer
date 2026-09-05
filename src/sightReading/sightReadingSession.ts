import type { SightReadingMidiEvent } from './midi'
import type { SightReadingClef, SightReadingNote } from './sightReadingNotes'
import type { SightReadingNoteMode } from './sightReadingSettings'

export type SightReadingQuestionPhase = 'idle' | 'display' | 'answering' | 'feedback'
export type SightReadingRecordedOutcome = 'correct' | 'wrong_note' | 'timeout'

export function getSightReadingAnswerProgress(remainingTimeMs: number, totalTimeMs: number): number {
  if (totalTimeMs <= 0) return 0
  return Math.min(1, Math.max(0, remainingTimeMs / totalTimeMs))
}

export interface SightReadingSessionCounters {
  completed: number
  correct: number
  wrong: number
  timeout: number
  currentStreak: number
  bestStreak: number
  wrongNoteCounts: Record<number, number>
  timeoutNoteCounts: Record<number, number>
  reactionTimes: number[]
  clefTotals: Record<SightReadingClef, number>
  clefCorrect: Record<SightReadingClef, number>
  clefWrong: Record<SightReadingClef, number>
  clefTimeout: Record<SightReadingClef, number>
}

export interface SightReadingOutcomeRecord {
  outcome: SightReadingRecordedOutcome
  note: SightReadingNote
  reactionTimeMs: number | null
  inputName: string
  inputMidiNumber: number | null
}

export interface SightReadingReactionSummary {
  averageReactionMs: number | null
  fastestReactionMs: number | null
  slowestReactionMs: number | null
}

export type SightReadingFeedbackAction = 'none' | 'next' | 'finish'
export const DOUBLE_NOTE_CAPTURE_WINDOW_MS = 150

function createClefCounter(): Record<SightReadingClef, number> {
  return { treble: 0, bass: 0 }
}

function createEmptyNoteCounts(notes: SightReadingNote[]): Record<number, number> {
  return Object.fromEntries(
    Array.from(new Set(notes.map((note) => note.midiNumber))).map((midiNumber) => [midiNumber, 0])
  )
}

export function createSightReadingSessionCounters(notes: SightReadingNote[]): SightReadingSessionCounters {
  return {
    completed: 0,
    correct: 0,
    wrong: 0,
    timeout: 0,
    currentStreak: 0,
    bestStreak: 0,
    wrongNoteCounts: createEmptyNoteCounts(notes),
    timeoutNoteCounts: createEmptyNoteCounts(notes),
    reactionTimes: [],
    clefTotals: createClefCounter(),
    clefCorrect: createClefCounter(),
    clefWrong: createClefCounter(),
    clefTimeout: createClefCounter()
  }
}

export function getSightReadingReactionSummary(reactionTimes: number[]): SightReadingReactionSummary {
  if (reactionTimes.length === 0) {
    return {
      averageReactionMs: null,
      fastestReactionMs: null,
      slowestReactionMs: null
    }
  }

  const total = reactionTimes.reduce((sum, value) => sum + value, 0)

  return {
    averageReactionMs: Math.round(total / reactionTimes.length),
    fastestReactionMs: Math.min(...reactionTimes),
    slowestReactionMs: Math.max(...reactionTimes)
  }
}

function newerEventId(current: number | null, candidate: number | null): number | null {
  if (candidate === null) return current
  if (current === null) return candidate
  return Math.max(current, candidate)
}

export class SightReadingSessionCore {
  phase: SightReadingQuestionPhase = 'idle'
  paused = false
  inputLocked = true
  practiceStartedAtMs: number | null = null
  questionStartedAtMs: number | null = null
  questionDeadlineMs: number | null = null
  remainingQuestionMs = 0
  pauseStartedAtMs: number | null = null
  lastHandledEventId: number | null = null
  currentNote: SightReadingNote | null = null
  currentNotes: readonly SightReadingNote[] = []
  captureDeadlineMs: number | null = null
  remainingCaptureMs = 0
  counters: SightReadingSessionCounters
  private readonly observedTargetPitches = new Set<number>()
  private targetSetCompletedAtMs: number | null = null

  constructor(notes: SightReadingNote[], readonly noteMode: SightReadingNoteMode = 'single') {
    this.counters = createSightReadingSessionCounters(notes)
  }

  start(now: number, latestEventId: number | null): void {
    this.phase = 'idle'
    this.paused = false
    this.inputLocked = true
    this.practiceStartedAtMs = now
    this.questionStartedAtMs = null
    this.questionDeadlineMs = null
    this.remainingQuestionMs = 0
    this.pauseStartedAtMs = null
    this.lastHandledEventId = latestEventId
    this.currentNote = null
    this.currentNotes = []
    this.resetCapture()
  }

  beginQuestion(note: SightReadingNote | readonly [SightReadingNote, SightReadingNote]): void {
    this.phase = 'display'
    this.inputLocked = true
    this.questionStartedAtMs = null
    this.questionDeadlineMs = null
    this.remainingQuestionMs = 0
    this.currentNotes = 'midiNumber' in note ? [note] : note
    this.currentNote = this.currentNotes[0] ?? null
    this.resetCapture()
  }

  unlockQuestion(now: number, latestEventId: number | null, timeLimitMs: number): void {
    if (this.paused || this.phase !== 'display') return

    const safeTimeLimitMs = Math.max(0, timeLimitMs)
    this.questionStartedAtMs = now
    this.questionDeadlineMs = now + safeTimeLimitMs
    this.remainingQuestionMs = safeTimeLimitMs
    this.lastHandledEventId = newerEventId(this.lastHandledEventId, latestEventId)
    this.phase = 'answering'
    this.inputLocked = false
  }

  processMidiEvent(event: SightReadingMidiEvent): SightReadingOutcomeRecord | null {
    if (
      this.paused ||
      this.phase !== 'answering' ||
      this.inputLocked ||
      !this.currentNote ||
      event.type !== 'noteOn' ||
      (event.velocity ?? 0) <= 0 ||
      typeof event.midiNumber !== 'number'
    ) {
      return null
    }

    if (this.lastHandledEventId !== null && event.id <= this.lastHandledEventId) return null
    if (this.practiceStartedAtMs !== null && event.timestamp < this.practiceStartedAtMs) return null
    if (this.questionStartedAtMs === null || event.timestamp < this.questionStartedAtMs) return null

    this.lastHandledEventId = event.id
    this.remainingQuestionMs = this.getRemainingQuestionMs(event.timestamp)

    if (this.noteMode === 'double') {
      if (this.questionDeadlineMs !== null && event.timestamp > this.questionDeadlineMs) return null
      if (this.captureDeadlineMs !== null && event.timestamp > this.captureDeadlineMs) return null
      const targetNumbers = new Set(this.currentNotes.map((note) => note.midiNumber))
      if (!targetNumbers.has(event.midiNumber)) {
        const reactionTimeMs = Math.max(0, Math.round(event.timestamp - this.questionStartedAtMs))
        return this.recordOutcome('wrong_note', reactionTimeMs, event.noteName ?? '', event.midiNumber)
      }
      if (this.captureDeadlineMs === null) {
        this.captureDeadlineMs = Math.min(
          event.timestamp + DOUBLE_NOTE_CAPTURE_WINDOW_MS,
          this.questionDeadlineMs ?? event.timestamp + DOUBLE_NOTE_CAPTURE_WINDOW_MS
        )
        this.remainingCaptureMs = Math.max(0, this.captureDeadlineMs - event.timestamp)
      }
      this.observedTargetPitches.add(event.midiNumber)
      if (this.observedTargetPitches.size === targetNumbers.size && this.targetSetCompletedAtMs === null) {
        this.targetSetCompletedAtMs = event.timestamp
      }
      return null
    }

    const reactionTimeMs = Math.max(0, Math.round(event.timestamp - this.questionStartedAtMs))
    const outcome: SightReadingRecordedOutcome = event.midiNumber === this.currentNote.midiNumber
      ? 'correct'
      : 'wrong_note'

    return this.recordOutcome(outcome, reactionTimeMs, event.noteName ?? '', event.midiNumber)
  }

  recordTimeout(): SightReadingOutcomeRecord | null {
    if (this.paused || this.phase !== 'answering' || this.inputLocked || !this.currentNote) return null
    if (this.noteMode === 'double' && this.captureDeadlineMs !== null) return this.settleDoubleCapture()
    this.remainingQuestionMs = 0
    return this.recordOutcome('timeout', null, '', null)
  }

  settleDoubleCapture(): SightReadingOutcomeRecord | null {
    if (
      this.noteMode !== 'double' || this.paused || this.phase !== 'answering' ||
      this.inputLocked || !this.currentNote || this.captureDeadlineMs === null
    ) return null
    const settlementTime = this.captureDeadlineMs
    const complete = this.observedTargetPitches.size === this.currentNotes.length
    const decisiveTime = complete ? this.targetSetCompletedAtMs ?? settlementTime : settlementTime
    const reactionTimeMs = this.questionStartedAtMs === null
      ? 0
      : Math.max(0, Math.round(decisiveTime - this.questionStartedAtMs))
    const inputNotes = this.currentNotes
      .filter((note) => this.observedTargetPitches.has(note.midiNumber))
      .sort((left, right) => left.midiNumber - right.midiNumber)
    const inputName = inputNotes.map((note) => note.noteName).join(' + ')
    const inputMidiNumber = inputNotes.length > 0 ? inputNotes[inputNotes.length - 1].midiNumber : null
    this.remainingCaptureMs = 0
    return this.recordOutcome(complete ? 'correct' : 'wrong_note', reactionTimeMs, inputName, inputMidiNumber)
  }

  hasActiveDoubleCapture(): boolean {
    return this.noteMode === 'double' && this.captureDeadlineMs !== null && this.phase === 'answering'
  }

  getRemainingCaptureMs(now: number): number {
    if (!this.paused && this.hasActiveDoubleCapture() && this.captureDeadlineMs !== null) {
      return Math.max(0, this.captureDeadlineMs - now)
    }
    return Math.max(0, this.remainingCaptureMs)
  }

  getRemainingQuestionMs(now: number): number {
    if (!this.paused && this.phase === 'answering' && this.questionDeadlineMs !== null) {
      return Math.max(0, this.questionDeadlineMs - now)
    }
    return Math.max(0, this.remainingQuestionMs)
  }

  pause(now: number): void {
    if (this.paused) return

    this.paused = true
    this.pauseStartedAtMs = now
    this.inputLocked = true

    if (this.phase === 'answering') {
      this.remainingQuestionMs = Math.max(0, (this.questionDeadlineMs ?? now) - now)
      if (this.captureDeadlineMs !== null) {
        this.remainingCaptureMs = Math.max(0, this.captureDeadlineMs - now)
      }
    }
  }

  resume(now: number, latestEventId: number | null): void {
    if (!this.paused) return

    const pauseDuration = Math.max(0, now - (this.pauseStartedAtMs ?? now))
    this.paused = false
    this.pauseStartedAtMs = null
    this.lastHandledEventId = newerEventId(this.lastHandledEventId, latestEventId)

    if (this.phase === 'answering') {
      if (this.questionStartedAtMs !== null) this.questionStartedAtMs += pauseDuration
      this.questionDeadlineMs = now + this.remainingQuestionMs
      if (this.captureDeadlineMs !== null) this.captureDeadlineMs = now + this.remainingCaptureMs
      if (this.targetSetCompletedAtMs !== null) this.targetSetCompletedAtMs += pauseDuration
      this.inputLocked = false
    }
  }

  clearTransientInput(latestEventId: number | null): void {
    this.lastHandledEventId = newerEventId(this.lastHandledEventId, latestEventId)
    if (this.noteMode === 'double') this.resetCapture()
  }

  completeFeedback(questionCount: number): SightReadingFeedbackAction {
    if (this.phase !== 'feedback') return 'none'
    if (this.counters.completed >= questionCount) {
      this.finish()
      return 'finish'
    }

    this.phase = 'idle'
    this.inputLocked = true
    return 'next'
  }

  finish(): void {
    this.phase = 'idle'
    this.paused = false
    this.inputLocked = true
    this.practiceStartedAtMs = null
    this.questionStartedAtMs = null
    this.questionDeadlineMs = null
    this.remainingQuestionMs = 0
    this.pauseStartedAtMs = null
    this.currentNote = null
    this.currentNotes = []
    this.resetCapture()
  }

  private resetCapture(): void {
    this.captureDeadlineMs = null
    this.remainingCaptureMs = 0
    this.observedTargetPitches.clear()
    this.targetSetCompletedAtMs = null
  }

  private recordOutcome(
    outcome: SightReadingRecordedOutcome,
    reactionTimeMs: number | null,
    inputName: string,
    inputMidiNumber: number | null
  ): SightReadingOutcomeRecord {
    const note = this.currentNote as SightReadingNote
    const counters = this.counters

    this.inputLocked = true
    this.phase = 'feedback'
    this.questionDeadlineMs = null
    counters.completed += 1
    counters.clefTotals[note.clef] += 1

    if (outcome === 'correct') {
      counters.correct += 1
      counters.currentStreak += 1
      counters.bestStreak = Math.max(counters.bestStreak, counters.currentStreak)
      counters.clefCorrect[note.clef] += 1
    } else {
      counters.currentStreak = 0

      if (outcome === 'wrong_note') {
        counters.wrong += 1
        counters.wrongNoteCounts[note.midiNumber] = (counters.wrongNoteCounts[note.midiNumber] ?? 0) + 1
        counters.clefWrong[note.clef] += 1
      } else {
        counters.timeout += 1
        counters.timeoutNoteCounts[note.midiNumber] = (counters.timeoutNoteCounts[note.midiNumber] ?? 0) + 1
        counters.clefTimeout[note.clef] += 1
      }
    }

    if (reactionTimeMs !== null) counters.reactionTimes.push(reactionTimeMs)

    return {
      outcome,
      note,
      reactionTimeMs,
      inputName,
      inputMidiNumber
    }
  }
}
