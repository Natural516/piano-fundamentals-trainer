import type { ToleranceLevel } from './practiceTypes'

export type CoordinationHand = 'left' | 'right'

export type CoordinationJudgementType =
  | 'correct'
  | 'wrong_note'
  | 'missing_note'
  | 'extra_note'
  | 'early'
  | 'late'
  | 'rest_error'

export interface CoordinationStep {
  position: number
  label: string
  leftNotes: number[]
  rightNotes: number[]
  leftNoteNames: string[]
  rightNoteNames: string[]
}

export interface CoordinationPattern {
  id: string
  name: string
  description: string
  bpmDefault: number
  steps: CoordinationStep[]
}

export interface CoordinationTimelineStep extends CoordinationStep {
  id: string
  measureIndex: number
  expectedTimeMs: number
}

export interface CoordinationStepResult {
  id: string
  targetId: string
  measureIndex: number
  position: number
  label: string
  type: CoordinationJudgementType
  expectedLeftNotes: number[]
  expectedRightNotes: number[]
  inputNotes: number[]
  missingNotes: number[]
  extraNotes: number[]
  timingOffsetMs?: number
  syncWarning: boolean
  syncOffsetMs?: number
  leftError: boolean
  rightError: boolean
  generalExtraCount: number
  timestamp: number
  message: string
}

export interface CoordinationPracticeReport {
  patternName: string
  bpm: number
  measureCount: number
  toleranceLevel: ToleranceLevel
  totalCells: number
  playableCells: number
  correct: number
  wrongNote: number
  missingNote: number
  extraNote: number
  restError: number
  early: number
  late: number
  syncWarning: number
  averageOffsetMs: number
  accuracy: number
  leftWrongCount: number
  rightWrongCount: number
  generalExtraCount: number
  hardestPosition: string
}

