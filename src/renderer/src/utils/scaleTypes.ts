import type { PracticeReport } from './practiceTypes'
import type { PracticeDifficulty } from './practiceContentTypes'

export type MajorScaleKey =
  | 'C'
  | 'G'
  | 'D'
  | 'A'
  | 'E'
  | 'B'
  | 'F#'
  | 'F'
  | 'Bb'
  | 'Eb'
  | 'Ab'
  | 'Db'

export type ScalePracticeMode =
  | 'right-ascending'
  | 'left-ascending'
  | 'right-up-down'
  | 'left-up-down'
  | 'both-ascending'
  | 'right-descending'
  | 'left-descending'
  | 'right-continuous'
  | 'left-continuous'
  | 'right-speed'

export type ScaleRange = 'one-octave' | 'two-octave'
export type ScaleNotesPerBeat = 1 | 2 | 4

export interface ScalePracticeModeDefinition {
  id: ScalePracticeMode
  name: string
  description: string
  difficulty: PracticeDifficulty
}

export interface ScaleSequenceOptions {
  range?: ScaleRange
  loopCount?: number
  notesPerBeat?: ScaleNotesPerBeat
}

export interface MajorScalePattern {
  key: MajorScaleKey
  name: string
  notes: number[]
  noteNames: string[]
  accidentals: string[]
}

export interface ScalePracticeStep {
  id: string
  index: number
  notes: number[]
  noteNames: string[]
  label: string
  hand: 'left' | 'right' | 'both'
}

export interface ScalePracticeReport extends PracticeReport {
  keyName: string
  modeName: string
  bpm: number
  targetBpm: number
  loopCount: number
  completedNotes: number
  range: ScaleRange
  notesPerBeat: ScaleNotesPerBeat
  totalNotes: number
  bestStreak: number
  mostMissedNote: string
}
