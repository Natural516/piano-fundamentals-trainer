import { getMajorKeySignature } from './musicKeySignatures'
import { spellMidiPitch } from './musicPitchSpelling'
import type {
  BaseTriad,
  ChordInversion,
  ChordInversionMode,
  ChordKeySignature,
  ChordQuality,
  ChordQualityFilter,
  ChordTarget
} from './chordTypes'

export const CHORD_INPUT_WINDOW_MS = 150

export const CHORD_QUESTION_COUNTS = [10, 20, 50] as const

export const CHORD_QUALITY_LABELS: Record<ChordQualityFilter, string> = {
  major: '大三和弦',
  minor: '小三和弦',
  both: '调内三和弦'
}

export const CHORD_INVERSION_MODE_LABELS: Record<ChordInversionMode, string> = {
  root: '只练原位',
  first: '只练第一转位',
  second: '只练第二转位',
  third: '只练第三转位',
  'root-first': '原位 + 第一转位',
  all: '全部转位',
  random: '随机转位'
}

export const CHORD_INVERSION_LABELS: Record<ChordInversion, string> = {
  root: '原位',
  first: '第一转位',
  second: '第二转位',
  third: '第三转位'
}

export const CHORD_QUALITY_NAMES: Record<ChordQuality, string> = {
  major: '大三和弦',
  minor: '小三和弦',
  diminished: '减三和弦',
  major7: '大七和弦',
  dominant7: '属七和弦',
  minor7: '小七和弦',
  'half-diminished7': '半减七和弦'
}

export const BASE_TRIADS: BaseTriad[] = [
  {
    id: 'c-major',
    root: 'C',
    name: 'C 大三和弦',
    quality: 'major',
    notes: [60, 64, 67],
    noteNames: ['C4', 'E4', 'G4']
  },
  {
    id: 'd-minor',
    root: 'D',
    name: 'D 小三和弦',
    quality: 'minor',
    notes: [62, 65, 69],
    noteNames: ['D4', 'F4', 'A4']
  },
  {
    id: 'e-minor',
    root: 'E',
    name: 'E 小三和弦',
    quality: 'minor',
    notes: [64, 67, 71],
    noteNames: ['E4', 'G4', 'B4']
  },
  {
    id: 'f-major',
    root: 'F',
    name: 'F 大三和弦',
    quality: 'major',
    notes: [65, 69, 72],
    noteNames: ['F4', 'A4', 'C5']
  },
  {
    id: 'g-major',
    root: 'G',
    name: 'G 大三和弦',
    quality: 'major',
    notes: [67, 71, 74],
    noteNames: ['G4', 'B4', 'D5']
  },
  {
    id: 'a-minor',
    root: 'A',
    name: 'A 小三和弦',
    quality: 'minor',
    notes: [69, 72, 76],
    noteNames: ['A4', 'C5', 'E5']
  }
]

const MAJOR_SCALE_OFFSETS = [0, 2, 4, 5, 7, 9, 11] as const
const DIATONIC_TRIAD_QUALITIES: readonly ChordQuality[] = [
  'major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'
]

function getKeyRootMidi(keySignature: ChordKeySignature): number {
  const pitchClass = getMajorKeySignature(keySignature).tonicPitchClass
  const midi = 60 + pitchClass
  return midi > 65 ? midi - 12 : midi
}

export function createDiatonicTriads(keySignature: ChordKeySignature): BaseTriad[] {
  const key = getMajorKeySignature(keySignature)
  const keyRootMidi = getKeyRootMidi(keySignature)

  return key.scaleDegrees.map((degree, index) => {
    const quality = DIATONIC_TRIAD_QUALITIES[index]
    const intervals = quality === 'major' ? [0, 4, 7] : quality === 'minor' ? [0, 3, 7] : [0, 3, 6]
    const rootMidi = keyRootMidi + MAJOR_SCALE_OFFSETS[index]
    const notes = intervals.map((interval) => rootMidi + interval)
    const qualityName = CHORD_QUALITY_NAMES[quality]

    return {
      id: `${keySignature}-${index + 1}-${quality}`,
      root: degree.spelling,
      name: `${degree.spelling} ${qualityName}`,
      quality,
      notes,
      noteNames: notes.map((note) => spellMidiPitch(note, keySignature, 'grand').spelling)
    }
  })
}

export function getEnabledInversions(mode: ChordInversionMode, noteCount = 3): ChordInversion[] {
  if (mode === 'root') {
    return ['root']
  }

  if (mode === 'first') return ['first']
  if (mode === 'second') return ['second']
  if (mode === 'third') return noteCount >= 4 ? ['third'] : ['root']

  if (mode === 'root-first') {
    return ['root', 'first']
  }

  return noteCount >= 4 ? ['root', 'first', 'second', 'third'] : ['root', 'first', 'second']
}

export function invertChordNotes(notes: number[], inversion: ChordInversion): number[] {
  const rotation = inversion === 'first' ? 1 : inversion === 'second' ? 2 : inversion === 'third' ? 3 : 0
  if (rotation <= 0 || rotation >= notes.length) return [...notes]
  return [...notes.slice(rotation), ...notes.slice(0, rotation).map((note) => note + 12)]
}

function createChordTarget(
  base: BaseTriad,
  inversion: ChordInversion,
  keySignature: ChordKeySignature
): ChordTarget {
  const notes = invertChordNotes(base.notes, inversion)
  const inversionName = CHORD_INVERSION_LABELS[inversion]

  return {
    id: `${base.id}-${inversion}`,
    baseId: base.id,
    name: base.name,
    root: base.root,
    quality: base.quality,
    qualityName: CHORD_QUALITY_NAMES[base.quality],
    inversion,
    inversionName,
    notes,
    noteNames: notes.map((note) => spellMidiPitch(note, keySignature, 'grand').spelling),
    label: `${base.name} · ${inversionName}`,
    keySignature
  }
}

export function getChordTargets(
  qualityFilter: ChordQualityFilter,
  inversionMode: ChordInversionMode,
  keySignature: ChordKeySignature = 'C'
): ChordTarget[] {
  const qualities: ChordQuality[] = qualityFilter === 'both' ? ['major', 'minor', 'diminished'] : [qualityFilter]
  const inversions = getEnabledInversions(inversionMode)

  return createDiatonicTriads(keySignature)
    .filter((triad) => qualities.includes(triad.quality))
    .flatMap((triad) => inversions.map((inversion) => createChordTarget(triad, inversion, keySignature)))
}

export function getRandomChordTarget(pool: ChordTarget[], previousTarget?: ChordTarget | null): ChordTarget {
  if (pool.length === 0) {
    return getChordTargets('both', 'root')[0]
  }

  if (pool.length === 1) {
    return pool[0]
  }

  let nextTarget = pool[Math.floor(Math.random() * pool.length)]
  let attempts = 0

  while (previousTarget && attempts < 12 && nextTarget.id === previousTarget.id) {
    nextTarget = pool[Math.floor(Math.random() * pool.length)]
    attempts += 1
  }

  return nextTarget
}
