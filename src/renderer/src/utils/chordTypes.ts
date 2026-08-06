import type { PracticeDifficulty } from './practiceContentTypes'

export type ChordQuality = 'major' | 'minor' | 'major7' | 'dominant7' | 'minor7' | 'half-diminished7'
export type ChordQualityFilter = 'major' | 'minor' | 'both'
export type SeventhChordQuality = Extract<ChordQuality, 'major7' | 'dominant7' | 'minor7' | 'half-diminished7'>
export type SeventhChordQualityFilter = SeventhChordQuality | 'all'
export type ChordInversion = 'root' | 'first' | 'second' | 'third'
export type ChordInversionMode = 'root' | 'first' | 'second' | 'third' | 'root-first' | 'all' | 'random'
export type ChordQuestionCount = 10 | 20 | 50
export type ChordPracticeStatus = 'idle' | 'running' | 'finished'
export type ChordJudgementType = 'correct' | 'missing_note' | 'extra_note' | 'wrong_note'
export type ChordContentCategory = 'triad' | 'seventh' | 'progression' | 'arpeggio' | '4536251'
export type ChordKeySignature = 'C' | 'G' | 'F'
export type ChordInputStyle = 'block' | 'arpeggio'

export interface ChordTrainingContent {
  id: string
  name: string
  description: string
  difficulty: PracticeDifficulty
  category: ChordContentCategory
  inputStyle: ChordInputStyle
  progressionId?: string
}

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
  keySignature?: ChordKeySignature
  degree?: number
  inputStyle?: ChordInputStyle
  sequenceNotes?: number[]
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
  contentName: string
  keySignature: string
  roundCount: number
}
