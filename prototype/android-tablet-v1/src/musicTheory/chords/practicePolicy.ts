import { CHORD_QUALITY_IDS } from './catalog'
import { spellChord } from './spelling'
import { NOTE_LETTERS } from './types'
import type { ChordPracticeWeights, ChordQualityId, RegisterWindow, WrittenPitchClass } from './types'

export const CHORD_PRACTICE_ROOTS: readonly WrittenPitchClass[] = Object.freeze(
  NOTE_LETTERS.flatMap((letter) => [-1, 0, 1].map((accidental) => Object.freeze({ letter, accidental })))
)

export const CHORD_PRACTICE_DEFAULT_REGISTER_WINDOW: RegisterWindow = Object.freeze({
  minMidi: 48,
  maxMidi: 96
})

export const CHORD_PRACTICE_DEFAULT_WEIGHTS: ChordPracticeWeights = Object.freeze({
  family: Object.freeze({ triad: 0.5, seventh: 0.5 }),
  qualityWithinFamily: Object.freeze({
    triad: Object.freeze({ major: 0.25, minor: 0.25, diminished: 0.25, augmented: 0.25 }),
    seventh: Object.freeze({ major7: 0.20, dominant7: 0.20, minor7: 0.20, halfDiminished7: 0.20, diminished7: 0.20 })
  })
})

export function getPracticeAccidentalLimit(qualityId: ChordQualityId): number {
  return qualityId === 'diminished7' ? 2 : 1
}

export function isChordPracticeLegal(root: WrittenPitchClass, qualityId: ChordQualityId): boolean {
  const accidentalLimit = getPracticeAccidentalLimit(qualityId)
  return spellChord(root, qualityId).tones.every((tone) => Math.abs(tone.accidental) <= accidentalLimit)
}

export function getLegalPracticeRoots(qualityId: ChordQualityId): readonly WrittenPitchClass[] {
  return Object.freeze(CHORD_PRACTICE_ROOTS.filter((root) => isChordPracticeLegal(root, qualityId)))
}

export const CHORD_PRACTICE_LEGAL_ROOTS: Readonly<Record<ChordQualityId, readonly WrittenPitchClass[]>> = Object.freeze(
  Object.fromEntries(CHORD_QUALITY_IDS.map((qualityId) => [qualityId, getLegalPracticeRoots(qualityId)])) as Record<ChordQualityId, readonly WrittenPitchClass[]>
)
