import type { JudgementResult, PracticeReport, ToleranceLevel } from './practiceTypes'

export type RhythmBeatType = 'note' | 'rest'
export type RhythmSubdivision = 'quarter' | 'eighth'

export interface RhythmBeat {
  position: number
  duration: number
  type: RhythmBeatType
}

export interface RhythmPattern {
  id: string
  name: string
  description: string
  subdivision: RhythmSubdivision
  beats: RhythmBeat[]
}

export interface RhythmGridCell {
  id: string
  label: string
  position: number
  duration: number
  type: RhythmBeatType
}

export interface RhythmPracticeReport extends PracticeReport {
  extraInput: number
}

export interface RhythmDisplayResult {
  result: JudgementResult
  source: 'practice' | 'extra'
}

export type { ToleranceLevel }
