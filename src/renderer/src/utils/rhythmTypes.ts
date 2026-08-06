import type { JudgementResult, PracticeReport, ToleranceLevel } from './practiceTypes'
import type { PracticeDifficulty } from './practiceContentTypes'

export type RhythmBeatType = 'note' | 'rest'
export type RhythmSubdivision = 'quarter' | 'eighth' | 'sixteenth' | 'triplet' | 'mixed'
export type RhythmCategory = 'basic' | 'dotted' | 'syncopation' | 'triplet' | 'polyrhythm' | 'mixed'

export interface RhythmBeat {
  position: number
  duration: number
  type: RhythmBeatType
  notes?: number[]
  hand?: 'left' | 'right' | 'both'
  symbol?: string
}

export interface RhythmPattern {
  id: string
  name: string
  description: string
  category: RhythmCategory
  difficulty: PracticeDifficulty
  subdivision: RhythmSubdivision
  lengthBeats?: number
  beats: RhythmBeat[]
}

export interface RhythmGridCell {
  id: string
  label: string
  position: number
  duration: number
  type: RhythmBeatType
  symbol?: string
}

export interface RhythmPracticeReport extends PracticeReport {
  extraInput: number
}

export interface RhythmDisplayResult {
  result: JudgementResult
  source: 'practice' | 'extra'
}

export type { ToleranceLevel }
