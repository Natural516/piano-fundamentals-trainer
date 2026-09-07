import { getMajorKeySignature, type MajorKeyId, type MusicAccidental } from './musicKeySignatures'
import type { DisplayAccidental, MusicNotationPitch, MusicStaffClef, MusicStaffMode } from './musicNotationTypes'

const SHARP_CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const FLAT_CHROMATIC = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

function getAccidental(spelling: string): MusicAccidental {
  return spelling.includes('#') ? '#' : spelling.includes('b') ? 'b' : null
}

function getOctaveForSpelling(midiNumber: number, letter: string): number {
  const chromaticOctave = Math.floor(midiNumber / 12) - 1
  const pitchClass = ((midiNumber % 12) + 12) % 12
  if (letter === 'B' && pitchClass === 0) return chromaticOctave - 1
  if (letter === 'C' && pitchClass === 11) return chromaticOctave + 1
  return chromaticOctave
}

function getKeySignatureAccidental(keyId: MajorKeyId, letter: string): MusicAccidental {
  const degree = getMajorKeySignature(keyId).scaleDegrees.find((item) => item.letter === letter)
  return degree?.accidental ?? null
}

function getDisplayAccidental(
  keyId: MajorKeyId,
  letter: string,
  accidental: MusicAccidental
): DisplayAccidental {
  const signatureAccidental = getKeySignatureAccidental(keyId, letter)
  if (signatureAccidental === accidental) return null
  if (accidental === null && signatureAccidental !== null) return 'n'
  return accidental
}

export function getClefForMidi(staffMode: MusicStaffMode, midiNumber: number): MusicStaffClef {
  if (staffMode === 'grand') return midiNumber >= 60 ? 'treble' : 'bass'
  return staffMode
}

export function spellMidiPitch(
  midiNumber: number,
  keyId: MajorKeyId,
  staffMode: MusicStaffMode
): MusicNotationPitch {
  const key = getMajorKeySignature(keyId)
  const pitchClass = ((midiNumber % 12) + 12) % 12
  const scaleDegree = key.scaleDegrees.find((degree) => degree.pitchClass === pitchClass)
  const spelling = scaleDegree?.spelling ?? (
    key.accidentalType === 'flat' ? FLAT_CHROMATIC[pitchClass] : SHARP_CHROMATIC[pitchClass]
  )
  const letter = spelling[0]
  const accidental = getAccidental(spelling)
  const octave = getOctaveForSpelling(midiNumber, letter)

  return {
    midiNumber,
    letter,
    accidental,
    octave,
    spelling: `${spelling}${octave}`,
    vexFlowKey: `${letter.toLowerCase()}${accidental ?? ''}/${octave}`,
    displayAccidental: getDisplayAccidental(keyId, letter, accidental),
    clef: getClefForMidi(staffMode, midiNumber)
  }
}
