import { midiNumberToNoteName } from './midiNotes'
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
}

export interface SightReadingPoolOptions {
  staffMode: SightReadingStaffMode
  range: SightReadingRange
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
  common: '常用',
  extended: '扩展'
}

const SIGHT_READING_RANGES: Record<SightReadingClef, Record<SightReadingRange, number[]>> = {
  treble: {
    common: [55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79],
    extended: [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84]
  },
  bass: {
    common: [41, 43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60],
    extended: [36, 38, 40, 41, 43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60]
  }
}

function createNote(clef: SightReadingClef, midiNumber: number): SightReadingNote {
  const noteName = midiNumberToNoteName(midiNumber)
  const pitchClass = noteName.replace(/\d/g, '')
  const octave = Number(noteName.match(/\d+$/)?.[0] ?? 4)
  const staffPosition = getStaffPosition(clef, midiNumber)

  return {
    midiNumber,
    noteName,
    pitchClass,
    octave,
    clef,
    staffPosition,
    ledgerLines: Math.max(0, Math.ceil(Math.abs(staffPosition) / 2) - 4),
    label: `${CLEF_LABELS[clef]} ${noteName}`
  }
}

export function getSightReadingNotesForClef(clef: SightReadingClef, range: SightReadingRange): SightReadingNote[] {
  return SIGHT_READING_RANGES[clef][range].map((midiNumber) => createNote(clef, midiNumber))
}

export function getSightReadingNotes({ staffMode, range }: SightReadingPoolOptions): SightReadingNote[] {
  if (staffMode !== 'grand') {
    return getSightReadingNotesForClef(staffMode, range)
  }

  const midiNumbers = Array.from(new Set([
    ...SIGHT_READING_RANGES.bass[range],
    ...SIGHT_READING_RANGES.treble[range]
  ])).sort((left, right) => left - right)

  return midiNumbers.map((midiNumber) => createNote(midiNumber >= 60 ? 'treble' : 'bass', midiNumber))
}

export const SIGHT_READING_NOTES = getSightReadingNotes({ staffMode: 'treble', range: 'common' })
export const SIGHT_READING_NOTE_NUMBERS = SIGHT_READING_NOTES.map((note) => note.midiNumber)

export function getSightReadingNoteByMidi(
  midiNumber: number,
  clef?: SightReadingClef,
  range: SightReadingRange = 'extended'
): SightReadingNote | null {
  const notes = clef
    ? getSightReadingNotesForClef(clef, range)
    : getSightReadingNotes({ staffMode: 'grand', range })

  return notes.find((note) => note.midiNumber === midiNumber) ?? null
}

export function createShuffledSightReadingBag(
  notes: SightReadingNote[],
  previousMidiNumber: number | null = null,
  random: () => number = Math.random
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

export function getMostMissedNote(errorCounts: Record<number, number>): string {
  const entries = Object.entries(errorCounts)
    .map(([midiNumber, count]) => ({ midiNumber: Number(midiNumber), count }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count)

  if (entries.length === 0) {
    return '暂无'
  }

  return midiNumberToNoteName(entries[0].midiNumber)
}

export function getRangeDescription(staffMode: SightReadingStaffMode, range: SightReadingRange): string {
  const notes = getSightReadingNotes({ staffMode, range })
  const first = notes[0]?.noteName ?? '-'
  const last = notes[notes.length - 1]?.noteName ?? '-'

  return `${first} - ${last}`
}
