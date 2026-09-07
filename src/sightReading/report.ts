import { getMostMissedNote, type SightReadingStaffMode, type SightReadingNote, type SightReadingClef } from './sightReadingNotes'
import { getSightReadingReactionSummary, type SightReadingSessionCounters } from './sightReadingSession'
import { getMajorKeySignature, type MajorKeyId } from './musicKeySignatures'
import { getSightReadingAnswerTimeoutMs, type SightReadingSettings, type SightReadingNoteCount, type SightReadingNotePoolMode, type SightReadingWriteResult } from './sightReadingSettings'

export interface SightReadingClefStats {
  total: number
  correct: number
  wrong: number
  timeout: number
  accuracy: number
}

export interface SightReadingReport {
  totalQuestions: number
  completedQuestions: number
  correct: number
  wrong: number
  timeout: number
  accuracy: number
  bestStreak: number
  mostWrongNote: string
  mostTimedOutNote: string
  weakestNote: string
  averageReactionMs: number | null
  fastestReactionMs: number | null
  slowestReactionMs: number | null
  wrongNoteCounts: Array<{ noteName: string; count: number }>
  timeoutNoteCounts: Array<{ noteName: string; count: number }>
  staffMode: SightReadingStaffMode
  noteCount: SightReadingNoteCount
  keySignature: MajorKeyId
  keyName: string
  notePoolMode: SightReadingNotePoolMode
  answerTimeLimitSeconds: number
  treble: SightReadingClefStats
  bass: SightReadingClefStats
}

export function calculateSightReadingAccuracy(correct: number, completed: number): number {
  return completed > 0 ? Math.round((correct / completed) * 100) : 0
}

function calculateClefStats(
  clef: SightReadingClef,
  counters: SightReadingSessionCounters
): SightReadingClefStats {
  const total = counters.clefTotals[clef]
  const correct = counters.clefCorrect[clef]

  return {
    total,
    correct,
    wrong: counters.clefWrong[clef],
    timeout: counters.clefTimeout[clef],
    accuracy: calculateSightReadingAccuracy(correct, total)
  }
}

export function createSightReadingReport(
  settings: SightReadingSettings,
  counters: SightReadingSessionCounters,
  notes: SightReadingNote[]
): SightReadingReport {
  const uniqueNotes = Array.from(new Map(notes.map((note) => [note.midiNumber, note])).values())
  const reactionSummary = getSightReadingReactionSummary(counters.reactionTimes)
  const weakestNoteCounts = Object.fromEntries(uniqueNotes.map((note) => [
    note.midiNumber,
    (counters.wrongNoteCounts[note.midiNumber] ?? 0) + (counters.timeoutNoteCounts[note.midiNumber] ?? 0)
  ]))

  return {
    totalQuestions: settings.questionCount,
    completedQuestions: counters.completed,
    correct: counters.correct,
    wrong: counters.wrong,
    timeout: counters.timeout,
    accuracy: calculateSightReadingAccuracy(counters.correct, counters.completed),
    bestStreak: counters.bestStreak,
    mostWrongNote: getMostMissedNote(counters.wrongNoteCounts, settings.keySignature),
    mostTimedOutNote: getMostMissedNote(counters.timeoutNoteCounts, settings.keySignature),
    weakestNote: getMostMissedNote(weakestNoteCounts, settings.keySignature),
    ...reactionSummary,
    wrongNoteCounts: uniqueNotes.map((note) => ({
      noteName: note.noteName,
      count: counters.wrongNoteCounts[note.midiNumber] ?? 0
    })),
    timeoutNoteCounts: uniqueNotes.map((note) => ({
      noteName: note.noteName,
      count: counters.timeoutNoteCounts[note.midiNumber] ?? 0
    })),
    staffMode: settings.staffMode,
    noteCount: settings.noteCount,
    keySignature: settings.keySignature,
    keyName: getMajorKeySignature(settings.keySignature).displayName,
    notePoolMode: settings.notePoolMode,
    answerTimeLimitSeconds: getSightReadingAnswerTimeoutMs(settings) / 1000,
    treble: calculateClefStats('treble', counters),
    bass: calculateClefStats('bass', counters)
  }
}

export interface SightReadingSessionReport extends SightReadingReport {
  completionState: 'completed' | 'stopped'
  partialEvidence: boolean
}

/** A report, not a new persisted schema. The platform repository owns id/timing and record mapping. */
export function createSightReadingSessionReport(
  settings: SightReadingSettings,
  counters: SightReadingSessionCounters,
  notes: SightReadingNote[],
  completionState: SightReadingSessionReport['completionState']
): SightReadingSessionReport {
  return {
    ...createSightReadingReport(settings, counters, notes),
    completionState,
    partialEvidence: completionState === 'stopped'
  }
}

export interface SightReadingReportRepository {
  save(report: SightReadingSessionReport): SightReadingWriteResult
}

/** Explicit failure; callers retain the report for retry. No browser storage or fake success. */
export function saveSightReadingReport(
  report: SightReadingSessionReport,
  repository: SightReadingReportRepository
): SightReadingWriteResult {
  try {
    return repository.save(report)
  } catch (error) {
    return { success: false, error: String(error) }
  }
}
