import { midiNumberToNoteName } from './midiNotes'
import type { SightReadingClef } from './sightReadingNotes'

const DIATONIC_PITCH_CLASS_INDEX: Record<string, number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6
}

const STAFF_ORIGIN: Record<SightReadingClef, { noteName: string; bottomLinePosition: number }> = {
  treble: { noteName: 'C4', bottomLinePosition: 2 },
  bass: { noteName: 'G2', bottomLinePosition: 0 }
}

function getDiatonicIndex(noteName: string): number {
  const pitchClass = noteName[0]
  const octave = Number(noteName.match(/\d+$/)?.[0] ?? 4)

  return octave * 7 + (DIATONIC_PITCH_CLASS_INDEX[pitchClass] ?? 0)
}

export function getStaffPosition(clef: SightReadingClef, midiNumber: number): number {
  return getDiatonicIndex(midiNumberToNoteName(midiNumber)) - getDiatonicIndex(STAFF_ORIGIN[clef].noteName)
}

export function getStaffBottomLinePosition(clef: SightReadingClef): number {
  return STAFF_ORIGIN[clef].bottomLinePosition
}
