import { midiNumberToNoteName } from './midiNotes'
import { getMajorKeySignature, type MajorKeyId } from './musicKeySignatures'
import { spellMidiPitch } from './musicPitchSpelling'
import type { MusicNotationPitch } from './musicNotationTypes'
import type { SightReadingNotePoolMode } from './sightReadingSettings'
import { getStaffPosition } from './staffPosition'

export type SightReadingClef = 'treble' | 'bass'
export type SightReadingStaffMode = SightReadingClef | 'grand'
export type SightReadingRange = 'common' | 'extended'

export interface SightReadingNote {
  midiNumber: number
  noteName: string
  pitchClass: string
  octave: number
  clef: SightReadingClef
  staffPosition: number
  ledgerLines?: number
  label?: string
  notation: MusicNotationPitch
}

export interface SightReadingPoolOptions {
  staffMode: SightReadingStaffMode
  keySignature?: MajorKeyId
  notePoolMode?: SightReadingNotePoolMode
  /** Kept only so older callers can migrate without failing; fixed ranges ignore it. */
  range?: SightReadingRange
}

export const STAFF_MODE_LABELS: Record<SightReadingStaffMode, string> = {
  treble: '高音谱表',
  bass: '低音谱表',
  grand: '大谱表'
}

export const CLEF_LABELS: Record<SightReadingClef, string> = {
  treble: '高音谱号',
  bass: '低音谱号'
}

export const RANGE_LABELS: Record<SightReadingRange, string> = {
  common: '固定',
  extended: '固定'
}

export const SIGHT_READING_MIDI_RANGES: Record<SightReadingStaffMode, readonly [number, number]> = {
  treble: [60, 88],
  bass: [36, 64],
  grand: [36, 88]
}

function createNumberRange(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

export function isDiatonicMidiNumber(midiNumber: number, keySignature: MajorKeyId): boolean {
  const pitchClass = ((midiNumber % 12) + 12) % 12
  return getMajorKeySignature(keySignature).scaleDegrees.some((degree) => degree.pitchClass === pitchClass)
}

function createNotePool(
  staffMode: SightReadingStaffMode,
  keySignature: MajorKeyId,
  notePoolMode: SightReadingNotePoolMode
): SightReadingNote[] {
  const [start, end] = SIGHT_READING_MIDI_RANGES[staffMode]
  return createNumberRange(start, end)
    .filter((midiNumber) => notePoolMode === 'chromatic' || isDiatonicMidiNumber(midiNumber, keySignature))
    .map((midiNumber) => createSightReadingNote(staffMode, midiNumber, keySignature))
}

export function createSightReadingNote(
  staffMode: SightReadingStaffMode,
  midiNumber: number,
  keySignature: MajorKeyId
): SightReadingNote {
  const notation = spellMidiPitch(midiNumber, keySignature, staffMode)
  const staffPosition = getStaffPosition(notation.clef, midiNumber)

  return {
    midiNumber,
    noteName: notation.spelling,
    pitchClass: `${notation.letter}${notation.accidental ?? ''}`,
    octave: notation.octave,
    clef: notation.clef,
    staffPosition,
    ledgerLines: Math.max(0, Math.ceil(Math.abs(staffPosition) / 2) - 4),
    label: `${CLEF_LABELS[notation.clef]} ${notation.spelling}`,
    notation
  }
}

export function getSightReadingNotesForClef(
  clef: SightReadingClef,
  _range: SightReadingRange = 'extended',
  keySignature: MajorKeyId = 'C',
  notePoolMode: SightReadingNotePoolMode = 'chromatic'
): SightReadingNote[] {
  return createNotePool(clef, keySignature, notePoolMode)
}

export function getSightReadingNotes({
  staffMode,
  keySignature = 'C',
  notePoolMode = 'chromatic'
}: SightReadingPoolOptions): SightReadingNote[] {
  return createNotePool(staffMode, keySignature, notePoolMode)
}

export const SIGHT_READING_NOTES = getSightReadingNotes({ staffMode: 'treble' })
export const SIGHT_READING_NOTE_NUMBERS = SIGHT_READING_NOTES.map((note) => note.midiNumber)

export function getSightReadingNoteByMidi(
  midiNumber: number,
  clef?: SightReadingClef,
  _range: SightReadingRange = 'extended',
  keySignature: MajorKeyId = 'C',
  notePoolMode: SightReadingNotePoolMode = 'chromatic'
): SightReadingNote | null {
  const staffMode = clef ?? 'grand'
  const [start, end] = SIGHT_READING_MIDI_RANGES[staffMode]
  return midiNumber >= start && midiNumber <= end && (
    notePoolMode === 'chromatic' || isDiatonicMidiNumber(midiNumber, keySignature)
  )
    ? createSightReadingNote(staffMode, midiNumber, keySignature)
    : null
}

export function createShuffledSightReadingBag(
  notes: SightReadingNote[],
  previousMidiNumber: number | null,
  random: () => number
): SightReadingNote[] {
  const bag = [...notes]

  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[bag[index], bag[swapIndex]] = [bag[swapIndex], bag[index]]
  }

  if (bag.length > 1 && bag[0].midiNumber === previousMidiNumber) {
    const replacementIndex = bag.findIndex((note) => note.midiNumber !== previousMidiNumber)
    if (replacementIndex > 0) {
      ;[bag[0], bag[replacementIndex]] = [bag[replacementIndex], bag[0]]
    }
  }

  return bag
}

export function getMostMissedNote(
  errorCounts: Record<number, number>,
  keySignature?: MajorKeyId
): string {
  const entries = Object.entries(errorCounts)
    .map(([midiNumber, count]) => ({ midiNumber: Number(midiNumber), count }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count)

  if (entries.length === 0) return '暂无'
  if (!keySignature) return midiNumberToNoteName(entries[0].midiNumber)
  return spellMidiPitch(entries[0].midiNumber, keySignature, 'grand').spelling
}

export function getRangeDescription(staffMode: SightReadingStaffMode): string {
  const [start, end] = SIGHT_READING_MIDI_RANGES[staffMode]
  return `${midiNumberToNoteName(start)} - ${midiNumberToNoteName(end)}`
}
