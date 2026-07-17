export type ChordQuality = 'major' | 'minor'
export type ChordQualityFilter = ChordQuality | 'both'
export type ChordInversion = 'root' | 'first' | 'second'
export type ChordInversionMode = 'root' | 'root-first' | 'all'
export type ChordQuestionCount = 10 | 20 | 50
export type ChordPracticeStatus = 'idle' | 'running' | 'finished'
export type ChordJudgementType = 'correct' | 'missing_note' | 'extra_note' | 'wrong_note'

export interface BaseTriad {
  id: string
  root: string
  name: string
  quality: ChordQuality
  notes: number[]
  noteNames: string[]
}

export interface ChordTarget {
  id: string
  baseId: string
  name: string
  root: string
  quality: ChordQuality
  qualityName: string
  inversion: ChordInversion
  inversionName: string
  notes: number[]
  noteNames: string[]
  label: string
}

export interface ChordFeedback {
  type: ChordJudgementType
  target: ChordTarget
  inputNotes: number[]
  inputNoteNames: string[]
  missingNotes: number[]
  missingNoteNames: string[]
  extraNotes: number[]
  extraNoteNames: string[]
  message: string
}

export interface ChordPracticeReport {
  totalQuestions: number
  correct: number
  wrong: number
  missingNote: number
  extraNote: number
  wrongNote: number
  accuracy: number
  bestStreak: number
  mostMissedChord: string
  mostMissedNote: string
  averageAttempts: number
}
