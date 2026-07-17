export type TargetEventType = 'note' | 'chord' | 'rest'
export type TargetHand = 'left' | 'right' | 'both'

export interface TargetEvent {
  id: string
  timeMs: number
  notes: number[]
  durationMs?: number
  type: TargetEventType
  label?: string
  hand?: TargetHand
}

export interface MidiInputEvent {
  type: 'noteOn' | 'noteOff' | 'controlChange'
  midiNumber?: number
  noteName?: string
  velocity?: number
  controller?: number
  value?: number
  timestamp: number
  deviceName?: string
}

export type JudgementType =
  | 'correct'
  | 'wrong_note'
  | 'missing_note'
  | 'extra_note'
  | 'early'
  | 'late'
  | 'rest_error'

export type ToleranceLevel = 'loose' | 'standard' | 'strict'

export interface JudgementResult {
  id: string
  targetId: string
  type: JudgementType
  target: TargetEvent
  expectedNotes: number[]
  inputNotes: number[]
  timestamp: number
  timeOffsetMs?: number
  label: string
  message: string
}

export interface PracticeReport {
  totalTargets: number
  correct: number
  wrongNote: number
  missingNote: number
  extraNote: number
  early: number
  late: number
  restError: number
  averageOffsetMs: number
  accuracy: number
}

export interface TestExercise {
  id: string
  title: string
  description: string
  bpm: number
  targets: TargetEvent[]
}
