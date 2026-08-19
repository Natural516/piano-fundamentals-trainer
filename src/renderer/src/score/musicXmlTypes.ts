export type ScoreClefSign = 'G' | 'F' | 'C' | 'percussion' | 'TAB' | 'none'
export type ScoreNoteType = 'note' | 'rest'

export interface ScoreTimeModification {
  actualNotes: number
  normalNotes: number
  normalType: string | null
}

export interface ScoreHarmonyModel {
  rootStep: string
  rootAlter: number
  kind: string
  kindText: string | null
  bassStep: string | null
  bassAlter: number
}

export interface ScoreClefModel {
  staff: number
  sign: ScoreClefSign
  line: number | null
}

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
  tieStart: boolean
  tieStop: boolean
  accidental: string | null
  isGrace?: boolean
  noteType?: string | null
  dotCount?: number
  timeModification?: ScoreTimeModification | null
}

export interface ScoreMeasure {
  stableMeasureId: string
  displayMeasureNumber: string
  sequenceIndex: number
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
  staves: number | null
  clefs: ScoreClefModel[]
  harmonies: ScoreHarmonyModel[]
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
  trainingProfile?: {
    profileVersion: 'Piano Training MusicXML Profile v1'
    trainingSafe: boolean
    supportedFeatures: string[]
    unsupportedFeatures: Array<{ code: string; message: string; measure?: string }>
    warnings: Array<{ code: string; message: string; measure?: string }>
    reasons: string[]
  }
}

export interface ScoreExpectedUnit {
  id: string
  onsetIndex: number
  expectedTick: number
  measure: number
  originalMeasure: number
  originalBeat: number
  practiceTick: number
  notes: ScoreNoteModel[]
  tieStart: boolean
  rest: boolean
  expectedMidi: number[]
  staff: number | null
  hand: 'left' | 'right' | 'both' | null
  sourceEventIds: string[]
}

export interface ScoreTimeline {
  units: ScoreExpectedUnit[]
}
