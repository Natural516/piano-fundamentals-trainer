export const NOTE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const

export type NoteLetter = (typeof NOTE_LETTERS)[number]
export type ChordFamily = 'triad' | 'seventh'
export type ChordQualityId =
  | 'major'
  | 'minor'
  | 'diminished'
  | 'augmented'
  | 'major7'
  | 'dominant7'
  | 'minor7'
  | 'halfDiminished7'
  | 'diminished7'

export interface WrittenPitchClass {
  readonly letter: NoteLetter
  readonly accidental: number
}

export interface WrittenPitch extends WrittenPitchClass {
  readonly octave: number
  readonly soundingMidi: number
}

export interface ChordQualityDefinition {
  readonly id: ChordQualityId
  readonly family: ChordFamily
  readonly semitones: readonly number[]
  readonly diatonicDegrees: readonly number[]
  readonly chineseLabel: string
  readonly symbolSuffix: string
}

export interface SpelledChordTone extends WrittenPitchClass {
  readonly diatonicDegree: number
  readonly semitonesFromRoot: number
  readonly octaveOffset: number
}

export interface SpelledChord {
  readonly root: WrittenPitchClass
  readonly quality: ChordQualityDefinition
  readonly tones: readonly SpelledChordTone[]
}

export interface InvertedChordTone extends SpelledChordTone {
  readonly sourceToneIndex: number
}

export interface RegisterWindow {
  readonly minMidi: number
  readonly maxMidi: number
}

export interface ClosePositionPlacement {
  readonly root: WrittenPitchClass
  readonly qualityId: ChordQualityId
  readonly inversion: number
  readonly rootOctave: number
  readonly writtenPitches: readonly WrittenPitch[]
  readonly soundingMidiNumbers: readonly number[]
  readonly lowestMidi: number
  readonly highestMidi: number
}

export interface ChordPracticeWeights {
  readonly family: Readonly<Record<ChordFamily, number>>
  readonly qualityWithinFamily: {
    readonly triad: Readonly<Record<'major' | 'minor' | 'diminished' | 'augmented', number>>
    readonly seventh: Readonly<Record<'major7' | 'dominant7' | 'minor7' | 'halfDiminished7' | 'diminished7', number>>
  }
}

export interface ChordPracticeQuestion {
  readonly family: ChordFamily
  readonly qualityId: ChordQualityId
  readonly root: WrittenPitchClass
  readonly chordSymbol: string
  readonly chineseQualityLabel: string
  readonly inversionIndex: number
  readonly chineseInversionLabel: string
  readonly chordTones: readonly SpelledChordTone[]
  readonly voicing: ClosePositionPlacement
  readonly soundingMidiNumbers: readonly number[]
  readonly blockNotes: readonly WrittenPitch[]
  readonly arpeggioNotes: readonly WrittenPitch[]
  readonly register: {
    readonly window: RegisterWindow
    readonly lowestMidi: number
    readonly highestMidi: number
  }
}

export interface ChordPracticeQuestionIdentity {
  readonly root: WrittenPitchClass
  readonly qualityId: ChordQualityId
  readonly inversionIndex: number
}
