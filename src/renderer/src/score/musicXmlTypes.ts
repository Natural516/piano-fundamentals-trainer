export type ScoreClefSign = 'G' | 'F' | 'C' | 'percussion' | 'TAB' | 'none'
export type ScoreNoteType = 'note' | 'rest'
export type ScoreTieKind = 'start' | 'stop' | 'continue' | null

export interface ScoreNoteModel {
  id: string
  type: ScoreNoteType
  midiNumber: number | null
  step: string
  alter: number
  octave: number
  duration: number
  voice: string
  staff: number
  isChordTone: boolean
  tie: ScoreTieKind
  accidental: string | null
  isGrace?: boolean
}

export interface ScoreMeasure {
  number: number
  implicit: boolean
  notes: ScoreNoteModel[]
  timeEvents: Array<
    { kind: 'note'; noteIndex: number } |
    { kind: 'backup'; duration: number } |
    { kind: 'forward'; duration: number }
  >
  keySignature: number | null
  timeBeats: number | null
  timeBeatType: number | null
  tempoBpm: number | null
  divisions: number | null
}

export interface ScorePartModel {
  id: string
  name: string
  measures: ScoreMeasure[]
}

export interface ScoreDocument {
  title: string
  parts: ScorePartModel[]
  defaultTempoBpm: number | null
}

export interface ScoreExpectedUnit {
  id: string
  onsetIndex: number
  expectedTick: number
  notes: ScoreNoteModel[]
  tieStart: boolean
  rest: boolean
  expectedMidi: number[]
}

export interface ScoreTimeline {
  units: ScoreExpectedUnit[]
}
