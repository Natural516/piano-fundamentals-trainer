import type { IntervalQueryWrittenPitch } from '../../intervalQueryTool'
import type { WrittenPitch } from '../chords/types'

export const INTERVAL_TYPE_IDS = [
  'perfectUnison',
  'augmentedUnison',
  'diminishedSecond',
  'minorSecond',
  'majorSecond',
  'augmentedSecond',
  'diminishedThird',
  'minorThird',
  'majorThird',
  'augmentedThird',
  'diminishedFourth',
  'perfectFourth',
  'augmentedFourth',
  'diminishedFifth',
  'perfectFifth',
  'augmentedFifth',
  'diminishedSixth',
  'minorSixth',
  'majorSixth',
  'augmentedSixth',
  'diminishedSeventh',
  'minorSeventh',
  'majorSeventh',
  'augmentedSeventh',
  'diminishedOctave',
  'perfectOctave'
] as const

export type IntervalTypeId = (typeof INTERVAL_TYPE_IDS)[number]
export type IntervalPracticeAccidental = -1 | 0 | 1
export type IntervalPracticeZone = 'LOW_EXTENSION' | 'CORE' | 'HIGH_EXTENSION'

export interface IntervalTypeDefinition {
  readonly id: IntervalTypeId
  readonly chineseName: string
  readonly degree: number
  readonly semitones: number
}

/** A V1 written note whose sounding MIDI value is kept beside its notation spelling. */
export interface IntervalSpelledNote extends WrittenPitch, IntervalQueryWrittenPitch {
  readonly accidental: IntervalPracticeAccidental
}

/** The exact theoretical result, including accidentals that V1 deliberately cannot quiz. */
export interface TheoreticalIntervalTarget extends IntervalQueryWrittenPitch {
  readonly soundingMidi: number
}

export type IntervalConstructionResult =
  | {
      readonly eligible: true
      readonly target: IntervalSpelledNote
    }
  | {
      readonly eligible: false
      readonly reason: 'unsupported-accidental'
      readonly target: TheoreticalIntervalTarget
    }

export interface IntervalPracticeQuestion {
  readonly intervalType: IntervalTypeDefinition
  readonly root: IntervalSpelledNote
  readonly target: IntervalSpelledNote
  readonly rootMidi: number
  readonly targetMidi: number
  readonly zone: IntervalPracticeZone
}
