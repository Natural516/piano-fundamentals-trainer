import { getChordQuality, NATURAL_PITCH_CLASS } from './catalog'
import { NOTE_LETTERS } from './types'
import type {
  ChordQualityId,
  InvertedChordTone,
  SpelledChord,
  SpelledChordTone,
  WrittenPitch,
  WrittenPitchClass
} from './types'

const ACCIDENTAL_GLYPHS: Readonly<Record<number, string>> = Object.freeze({
  [-2]: '𝄫',
  [-1]: '♭',
  0: '',
  1: '♯',
  2: '𝄪'
})

function assertPitchClass(pitch: WrittenPitchClass): void {
  if (!NOTE_LETTERS.includes(pitch.letter)) throw new RangeError(`Invalid note letter: ${pitch.letter}`)
  if (!Number.isInteger(pitch.accidental)) throw new RangeError('Accidental must be an integer')
}

export function spellChord(root: WrittenPitchClass, qualityId: ChordQualityId): SpelledChord {
  assertPitchClass(root)
  const quality = getChordQuality(qualityId)
  const rootLetterIndex = NOTE_LETTERS.indexOf(root.letter)
  const rootSoundingAbsolute = NATURAL_PITCH_CLASS[root.letter] + root.accidental
  const tones = quality.semitones.map((semitonesFromRoot, index): SpelledChordTone => {
    const diatonicDegree = quality.diatonicDegrees[index]
    const diatonicOffset = diatonicDegree - 1
    const unwrappedLetterIndex = rootLetterIndex + diatonicOffset
    const targetLetter = NOTE_LETTERS[unwrappedLetterIndex % NOTE_LETTERS.length]
    const octaveOffset = Math.floor(unwrappedLetterIndex / NOTE_LETTERS.length)
    const targetNaturalAbsolute = NATURAL_PITCH_CLASS[targetLetter] + (octaveOffset * 12)
    const desiredSoundingAbsolute = rootSoundingAbsolute + semitonesFromRoot
    return Object.freeze({
      letter: targetLetter,
      accidental: desiredSoundingAbsolute - targetNaturalAbsolute,
      diatonicDegree,
      semitonesFromRoot,
      octaveOffset
    })
  })
  return Object.freeze({
    root: Object.freeze({ ...root }),
    quality,
    tones: Object.freeze(tones)
  })
}

export function invertChordTones(tones: readonly SpelledChordTone[], inversion: number): readonly InvertedChordTone[] {
  if (!Number.isInteger(inversion) || inversion < 0 || inversion >= tones.length) {
    throw new RangeError(`Inversion ${inversion} is outside 0..${tones.length - 1}`)
  }
  const inverted = tones.map((_, outputIndex): InvertedChordTone => {
    const sourceToneIndex = (outputIndex + inversion) % tones.length
    const tone = tones[sourceToneIndex]
    return Object.freeze({
      ...tone,
      sourceToneIndex,
      octaveOffset: tone.octaveOffset + (sourceToneIndex < inversion ? 1 : 0)
    })
  })
  return Object.freeze(inverted)
}

export function writtenPitchToMidi(pitch: Omit<WrittenPitch, 'soundingMidi'>): number {
  assertPitchClass(pitch)
  if (!Number.isInteger(pitch.octave)) throw new RangeError('Octave must be an integer')
  return (12 * (pitch.octave + 1)) + NATURAL_PITCH_CLASS[pitch.letter] + pitch.accidental
}

export function formatAccidental(accidental: number): string {
  if (!Number.isInteger(accidental)) throw new RangeError('Accidental must be an integer')
  const glyph = ACCIDENTAL_GLYPHS[accidental]
  if (glyph === undefined) throw new RangeError(`No display glyph for accidental ${accidental}`)
  return glyph
}

export function formatWrittenPitchClass(pitch: WrittenPitchClass): string {
  assertPitchClass(pitch)
  return `${pitch.letter}${formatAccidental(pitch.accidental)}`
}

export function formatWrittenPitch(pitch: WrittenPitchClass & { readonly octave: number }): string {
  if (!Number.isInteger(pitch.octave)) throw new RangeError('Octave must be an integer')
  return `${formatWrittenPitchClass(pitch)}${pitch.octave}`
}

export function formatChordSymbol(root: WrittenPitchClass, qualityId: ChordQualityId): string {
  return `${formatWrittenPitchClass(root)}${getChordQuality(qualityId).symbolSuffix}`
}

export function getChineseInversionLabel(inversion: number, toneCount: number): string {
  if (!Number.isInteger(inversion) || inversion < 0 || inversion >= toneCount || (toneCount !== 3 && toneCount !== 4)) {
    throw new RangeError(`Invalid inversion ${inversion} for ${toneCount} tones`)
  }
  return ['原位', '第一转位', '第二转位', '第三转位'][inversion]
}
