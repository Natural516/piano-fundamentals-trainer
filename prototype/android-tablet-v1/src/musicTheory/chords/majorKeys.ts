import { NATURAL_PITCH_CLASS } from './catalog'
import { NOTE_LETTERS } from './types'
import type { ChordPracticeQuestionIdentity, ChordQualityId, WrittenPitchClass } from './types'

export const CHORD_SEQUENTIAL_MAJOR_KEY_IDS = [
  'C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'E', 'Ab', 'B', 'Db', 'Fs', 'Gb', 'Cs', 'Cb'
] as const

export type ChordSequentialMajorKeyId = (typeof CHORD_SEQUENTIAL_MAJOR_KEY_IDS)[number]

const MAJOR_SCALE_SEMITONES = [0, 2, 4, 5, 7, 9, 11] as const

const MAJOR_KEY_TONICS: Readonly<Record<ChordSequentialMajorKeyId, WrittenPitchClass>> = Object.freeze({
  C: Object.freeze({ letter: 'C', accidental: 0 }),
  G: Object.freeze({ letter: 'G', accidental: 0 }),
  F: Object.freeze({ letter: 'F', accidental: 0 }),
  D: Object.freeze({ letter: 'D', accidental: 0 }),
  Bb: Object.freeze({ letter: 'B', accidental: -1 }),
  A: Object.freeze({ letter: 'A', accidental: 0 }),
  Eb: Object.freeze({ letter: 'E', accidental: -1 }),
  E: Object.freeze({ letter: 'E', accidental: 0 }),
  Ab: Object.freeze({ letter: 'A', accidental: -1 }),
  B: Object.freeze({ letter: 'B', accidental: 0 }),
  Db: Object.freeze({ letter: 'D', accidental: -1 }),
  Fs: Object.freeze({ letter: 'F', accidental: 1 }),
  Gb: Object.freeze({ letter: 'G', accidental: -1 }),
  Cs: Object.freeze({ letter: 'C', accidental: 1 }),
  Cb: Object.freeze({ letter: 'C', accidental: -1 })
})

const TRIAD_QUALITIES: readonly ChordQualityId[] = Object.freeze([
  'major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'
])

const SEVENTH_QUALITIES: readonly ChordQualityId[] = Object.freeze([
  'major7', 'minor7', 'minor7', 'major7', 'dominant7', 'minor7', 'halfDiminished7'
])

export function isChordSequentialMajorKeyId(value: unknown): value is ChordSequentialMajorKeyId {
  return typeof value === 'string' && (CHORD_SEQUENTIAL_MAJOR_KEY_IDS as readonly string[]).includes(value)
}

export function getChordSequentialMajorScale(keyId: ChordSequentialMajorKeyId): readonly WrittenPitchClass[] {
  const tonic = MAJOR_KEY_TONICS[keyId]
  const tonicLetterIndex = NOTE_LETTERS.indexOf(tonic.letter)
  const tonicAbsolute = NATURAL_PITCH_CLASS[tonic.letter] + tonic.accidental
  return Object.freeze(MAJOR_SCALE_SEMITONES.map((semitones, degreeIndex) => {
    const unwrappedLetterIndex = tonicLetterIndex + degreeIndex
    const letter = NOTE_LETTERS[unwrappedLetterIndex % NOTE_LETTERS.length]
    const octaveOffset = Math.floor(unwrappedLetterIndex / NOTE_LETTERS.length)
    const naturalAbsolute = NATURAL_PITCH_CLASS[letter] + octaveOffset * 12
    return Object.freeze({ letter, accidental: tonicAbsolute + semitones - naturalAbsolute })
  }))
}

export function getChordSequentialKeyTonic(keyId: ChordSequentialMajorKeyId): WrittenPitchClass {
  return MAJOR_KEY_TONICS[keyId]
}

export function getDiatonicTriadIdentities(keyId: ChordSequentialMajorKeyId): readonly ChordPracticeQuestionIdentity[] {
  const scale = getChordSequentialMajorScale(keyId)
  return Object.freeze(scale.map((root, degreeIndex) => Object.freeze({
    root,
    qualityId: TRIAD_QUALITIES[degreeIndex],
    inversionIndex: 0
  })))
}

export function getDiatonicSeventhIdentities(keyId: ChordSequentialMajorKeyId): readonly ChordPracticeQuestionIdentity[] {
  const scale = getChordSequentialMajorScale(keyId)
  return Object.freeze(scale.map((root, degreeIndex) => Object.freeze({
    root,
    qualityId: SEVENTH_QUALITIES[degreeIndex],
    inversionIndex: 0
  })))
}
