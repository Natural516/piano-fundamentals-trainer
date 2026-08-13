import type { ChordV2Identity, ChordV2Quality } from './chordV2Types'

interface QualityDefinition {
  intervals: number[]
  extensions: number[]
  alterations: number[]
}

const QUALITY_DEFINITIONS: Record<ChordV2Quality, QualityDefinition> = {
  major: { intervals: [0, 4, 7], extensions: [], alterations: [] },
  minor: { intervals: [0, 3, 7], extensions: [], alterations: [] },
  dim: { intervals: [0, 3, 6], extensions: [], alterations: [] },
  aug: { intervals: [0, 4, 8], extensions: [], alterations: [] },
  sus2: { intervals: [0, 2, 7], extensions: [], alterations: [] },
  sus4: { intervals: [0, 5, 7], extensions: [], alterations: [] },
  '6': { intervals: [0, 4, 7, 9], extensions: [], alterations: [] },
  m6: { intervals: [0, 3, 7, 9], extensions: [], alterations: [] },
  maj7: { intervals: [0, 4, 7, 11], extensions: [], alterations: [] },
  '7': { intervals: [0, 4, 7, 10], extensions: [], alterations: [] },
  m7: { intervals: [0, 3, 7, 10], extensions: [], alterations: [] },
  m7b5: { intervals: [0, 3, 6, 10], extensions: [], alterations: [] },
  dim7: { intervals: [0, 3, 6, 9], extensions: [], alterations: [] },
  add9: { intervals: [0, 4, 7], extensions: [2], alterations: [] },
  '9': { intervals: [0, 4, 7, 10], extensions: [2], alterations: [] },
  m9: { intervals: [0, 3, 7, 10], extensions: [2], alterations: [] },
  maj9: { intervals: [0, 4, 7, 11], extensions: [2], alterations: [] },
  '6/9': { intervals: [0, 4, 7, 9], extensions: [2], alterations: [] }
}

export function getQualityDefinition(quality: ChordV2Quality): QualityDefinition {
  return QUALITY_DEFINITIONS[quality]
}

export function getChordV2Identity(root: number, quality: ChordV2Quality): ChordV2Identity {
  const definition = getQualityDefinition(quality)
  const rootPitchClass = ((root % 12) + 12) % 12
  const requiredPitchClasses = Array.from(new Set(
    definition.intervals.map((interval) => (rootPitchClass + interval) % 12)
  )).sort((left, right) => left - right)
  const optionalPitchClasses = Array.from(new Set(
    [...definition.extensions, ...definition.alterations].map((interval) => (rootPitchClass + interval) % 12)
  )).sort((left, right) => left - right)

  return {
    root: rootPitchClass,
    quality,
    requiredPitchClasses,
    optionalPitchClasses,
    extensions: definition.extensions,
    alterations: definition.alterations
  }
}

export function getRootMidiPitch(rootPitchClass: number, registerLowest = 48): number {
  const normalized = ((rootPitchClass % 12) + 12) % 12
  return registerLowest + ((normalized - (registerLowest % 12) + 12) % 12)
}

export const STANDARD_SYMBOL_QUALITIES: Array<{ symbol: string; quality: ChordV2Quality }> = [
  { symbol: 'C', quality: 'major' },
  { symbol: 'Cm', quality: 'minor' },
  { symbol: 'Cdim', quality: 'dim' },
  { symbol: 'Caug', quality: 'aug' },
  { symbol: 'Csus2', quality: 'sus2' },
  { symbol: 'Csus4', quality: 'sus4' },
  { symbol: 'C6', quality: '6' },
  { symbol: 'Cm6', quality: 'm6' },
  { symbol: 'Cmaj7', quality: 'maj7' },
  { symbol: 'C7', quality: '7' },
  { symbol: 'Cm7', quality: 'm7' },
  { symbol: 'Cm7♭5', quality: 'm7b5' },
  { symbol: 'Cdim7', quality: 'dim7' },
  { symbol: 'Cadd9', quality: 'add9' },
  { symbol: 'C9', quality: '9' },
  { symbol: 'Cm9', quality: 'm9' },
  { symbol: 'Cmaj9', quality: 'maj9' },
  { symbol: 'C6/9', quality: '6/9' }
]

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const QUALITY_SYMBOL_SUFFIX: Record<ChordV2Quality, string> = {
  major: '',
  minor: 'm',
  dim: 'dim',
  aug: 'aug',
  sus2: 'sus2',
  sus4: 'sus4',
  '6': '6',
  m6: 'm6',
  maj7: 'maj7',
  '7': '7',
  m7: 'm7',
  m7b5: 'm7♭5',
  dim7: 'dim7',
  add9: 'add9',
  '9': '9',
  m9: 'm9',
  maj9: 'maj9',
  '6/9': '6/9'
}

export function formatChordSymbol(rootPitchClass: number, quality: ChordV2Quality, slashBass?: number): string {
  const normalizedRoot = ((rootPitchClass % 12) + 12) % 12
  const base = `${NOTE_NAMES[normalizedRoot]}${QUALITY_SYMBOL_SUFFIX[quality]}`
  return typeof slashBass === 'number' ? `${base}/${NOTE_NAMES[((slashBass % 12) + 12) % 12]}` : base
}

export function parseChordSymbol(symbol: string): { rootPitchClass: number; quality: ChordV2Quality; slashBass: number | null } | null {
  const trimmed = symbol.trim()
  const noteMatch = trimmed.match(/^([A-G](?:#|b)?)(.*)$/)
  if (!noteMatch) return null

  const rootIndex = NOTE_NAMES.indexOf(noteMatch[1])
  if (rootIndex < 0) return null

  const suffix = noteMatch[2]
  const fullEntry = STANDARD_SYMBOL_QUALITIES.find((candidate) =>
    candidate.symbol.replace(/^C/, '') === suffix
  )
  if (fullEntry) {
    return {
      rootPitchClass: rootIndex,
      quality: fullEntry.quality,
      slashBass: null
    }
  }

  // Slash chord: Cmaj7/G, C/E — split after the quality failed to match whole.
  const slashIndex = trimmed.indexOf('/')
  if (slashIndex > 0) {
    const basePart = trimmed.slice(0, slashIndex)
    const slashPart = trimmed.slice(slashIndex + 1)
    const baseMatch = basePart.match(/^([A-G](?:#|b)?)(.*)$/)
    const slashMatch = slashPart.match(/^([A-G](?:#|b)?)$/)
    if (!baseMatch || !slashMatch) return null

    const baseRoot = NOTE_NAMES.indexOf(baseMatch[1])
    const slashRoot = NOTE_NAMES.indexOf(slashMatch[1])
    if (baseRoot < 0 || slashRoot < 0) return null

    const baseEntry = STANDARD_SYMBOL_QUALITIES.find((candidate) =>
      candidate.symbol.replace(/^C/, '') === baseMatch[2]
    )
    if (!baseEntry) return null

    return {
      rootPitchClass: baseRoot,
      quality: baseEntry.quality,
      slashBass: slashRoot
    }
  }

  return null
}
