import type { PracticeReport } from './practiceTypes'

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
  totalNotes: number
  bestStreak: number
  mostMissedNote: string
}
