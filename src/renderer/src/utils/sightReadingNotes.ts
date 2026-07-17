import { midiNumberToNoteName } from './midiNotes'
import { getStaffPosition } from './staffPosition'

export type SightReadingClef = 'treble' | 'bass'
export type SightReadingClefMode = SightReadingClef | 'mixed'
export type SightReadingRange = 'basic' | 'common' | 'extended'

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
  clefMode: SightReadingClefMode
  range: SightReadingRange
}

export const CLEF_LABELS: Record<SightReadingClefMode, string> = {
  treble: '高音谱号',
  bass: '低音谱号',
  mixed: '双谱号随机'
}

export const RANGE_LABELS: Record<SightReadingRange, string> = {
  basic: '基础',
  common: '常用',
  extended: '扩展'
}

const SIGHT_READING_RANGES: Record<SightReadingClef, Record<SightReadingRange, number[]>> = {
  treble: {
    basic: [60, 62, 64, 65, 67, 69, 71, 72],
    common: [55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79],
    extended: [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84]
  },
  bass: {
    basic: [48, 50, 52, 53, 55, 57, 59, 60],
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

export function getSightReadingNotes({ clefMode, range }: SightReadingPoolOptions): SightReadingNote[] {
  if (clefMode === 'mixed') {
    return [
      ...getSightReadingNotesForClef('treble', range),
      ...getSightReadingNotesForClef('bass', range)
    ]
  }

  return getSightReadingNotesForClef(clefMode, range)
}

export const SIGHT_READING_NOTES = getSightReadingNotes({ clefMode: 'treble', range: 'basic' })
export const SIGHT_READING_NOTE_NUMBERS = SIGHT_READING_NOTES.map((note) => note.midiNumber)

export function getSightReadingNoteByMidi(
  midiNumber: number,
  clef?: SightReadingClef,
  range: SightReadingRange = 'extended'
): SightReadingNote | null {
  const notes = clef
    ? getSightReadingNotesForClef(clef, range)
    : getSightReadingNotes({ clefMode: 'mixed', range })

  return notes.find((note) => note.midiNumber === midiNumber) ?? null
}

export function getRandomSightReadingNote(
  options: SightReadingPoolOptions,
  previousNote?: SightReadingNote | null
): SightReadingNote {
  const clefMode = options.clefMode === 'mixed'
    ? (Math.random() > 0.5 ? 'treble' : 'bass')
    : options.clefMode
  const notes = getSightReadingNotesForClef(clefMode, options.range)

  if (notes.length === 1) {
    return notes[0]
  }

  let nextNote = notes[Math.floor(Math.random() * notes.length)]
  let attempts = 0

  while (
    attempts < 12 &&
    previousNote &&
    nextNote.midiNumber === previousNote.midiNumber &&
    nextNote.clef === previousNote.clef
  ) {
    nextNote = notes[Math.floor(Math.random() * notes.length)]
    attempts += 1
  }

  return nextNote
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

export function getRangeDescription(clefMode: SightReadingClefMode, range: SightReadingRange): string {
  if (clefMode === 'mixed') {
    return `${RANGE_LABELS[range]}：高音谱号 ${getRangeDescription('treble', range)} / 低音谱号 ${getRangeDescription('bass', range)}`
  }

  const notes = getSightReadingNotesForClef(clefMode, range)
  const first = notes[0]?.noteName ?? '-'
  const last = notes[notes.length - 1]?.noteName ?? '-'

  return `${first} - ${last}`
}
