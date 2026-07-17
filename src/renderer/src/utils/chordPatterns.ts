import { midiNumberToNoteName } from './midiNotes'
import type {
  BaseTriad,
  ChordInversion,
  ChordInversionMode,
  ChordQuality,
  ChordQualityFilter,
  ChordTarget
} from './chordTypes'

export const CHORD_INPUT_WINDOW_MS = 150

export const CHORD_QUESTION_COUNTS = [10, 20, 50] as const

export const CHORD_QUALITY_LABELS: Record<ChordQualityFilter, string> = {
  major: '大三和弦',
  minor: '小三和弦',
  both: '大三 + 小三'
}

export const CHORD_INVERSION_MODE_LABELS: Record<ChordInversionMode, string> = {
  root: '只练原位',
  'root-first': '原位 + 第一转位',
  all: '原位 + 第一转位 + 第二转位'
}

export const CHORD_INVERSION_LABELS: Record<ChordInversion, string> = {
  root: '原位',
  first: '第一转位',
  second: '第二转位'
}

export const CHORD_QUALITY_NAMES: Record<ChordQuality, string> = {
  major: '大三和弦',
  minor: '小三和弦'
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

function getEnabledInversions(mode: ChordInversionMode): ChordInversion[] {
  if (mode === 'root') {
    return ['root']
  }

  if (mode === 'root-first') {
    return ['root', 'first']
  }

  return ['root', 'first', 'second']
}

function invertNotes(notes: number[], inversion: ChordInversion): number[] {
  if (inversion === 'first') {
    return [notes[1], notes[2], notes[0] + 12]
  }

  if (inversion === 'second') {
    return [notes[2], notes[0] + 12, notes[1] + 12]
  }

  return [...notes]
}

function createChordTarget(base: BaseTriad, inversion: ChordInversion): ChordTarget {
  const notes = invertNotes(base.notes, inversion)
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
    noteNames: notes.map(midiNumberToNoteName),
    label: `${base.name} · ${inversionName}`
  }
}

export function getChordTargets(
  qualityFilter: ChordQualityFilter,
  inversionMode: ChordInversionMode
): ChordTarget[] {
  const qualities: ChordQuality[] = qualityFilter === 'both' ? ['major', 'minor'] : [qualityFilter]
  const inversions = getEnabledInversions(inversionMode)

  return BASE_TRIADS
    .filter((triad) => qualities.includes(triad.quality))
    .flatMap((triad) => inversions.map((inversion) => createChordTarget(triad, inversion)))
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
