import type { ChordQualityDefinition, ChordQualityId, NoteLetter } from './types'

export const NATURAL_PITCH_CLASS: Readonly<Record<NoteLetter, number>> = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
})

function defineQuality(definition: ChordQualityDefinition): ChordQualityDefinition {
  return Object.freeze({
    ...definition,
    semitones: Object.freeze([...definition.semitones]),
    diatonicDegrees: Object.freeze([...definition.diatonicDegrees])
  })
}

export const CHORD_QUALITY_CATALOG: Readonly<Record<ChordQualityId, ChordQualityDefinition>> = Object.freeze({
  major: defineQuality({ id: 'major', family: 'triad', semitones: [0, 4, 7], diatonicDegrees: [1, 3, 5], chineseLabel: '大三和弦', symbolSuffix: '' }),
  minor: defineQuality({ id: 'minor', family: 'triad', semitones: [0, 3, 7], diatonicDegrees: [1, 3, 5], chineseLabel: '小三和弦', symbolSuffix: 'm' }),
  diminished: defineQuality({ id: 'diminished', family: 'triad', semitones: [0, 3, 6], diatonicDegrees: [1, 3, 5], chineseLabel: '减三和弦', symbolSuffix: 'dim' }),
  augmented: defineQuality({ id: 'augmented', family: 'triad', semitones: [0, 4, 8], diatonicDegrees: [1, 3, 5], chineseLabel: '增三和弦', symbolSuffix: 'aug' }),
  major7: defineQuality({ id: 'major7', family: 'seventh', semitones: [0, 4, 7, 11], diatonicDegrees: [1, 3, 5, 7], chineseLabel: '大七和弦', symbolSuffix: 'maj7' }),
  dominant7: defineQuality({ id: 'dominant7', family: 'seventh', semitones: [0, 4, 7, 10], diatonicDegrees: [1, 3, 5, 7], chineseLabel: '属七和弦', symbolSuffix: '7' }),
  minor7: defineQuality({ id: 'minor7', family: 'seventh', semitones: [0, 3, 7, 10], diatonicDegrees: [1, 3, 5, 7], chineseLabel: '小七和弦', symbolSuffix: 'm7' }),
  halfDiminished7: defineQuality({ id: 'halfDiminished7', family: 'seventh', semitones: [0, 3, 6, 10], diatonicDegrees: [1, 3, 5, 7], chineseLabel: '半减七和弦', symbolSuffix: 'm7♭5' }),
  diminished7: defineQuality({ id: 'diminished7', family: 'seventh', semitones: [0, 3, 6, 9], diatonicDegrees: [1, 3, 5, 7], chineseLabel: '减七和弦', symbolSuffix: 'dim7' })
})

export const TRIAD_QUALITY_IDS = Object.freeze([
  'major', 'minor', 'diminished', 'augmented'
] as const)

export const SEVENTH_QUALITY_IDS = Object.freeze([
  'major7', 'dominant7', 'minor7', 'halfDiminished7', 'diminished7'
] as const)

export const CHORD_QUALITY_IDS = Object.freeze([
  ...TRIAD_QUALITY_IDS,
  ...SEVENTH_QUALITY_IDS
] as const)

export function getChordQuality(qualityId: ChordQualityId): ChordQualityDefinition {
  const quality = CHORD_QUALITY_CATALOG[qualityId]
  if (!quality) throw new RangeError(`Unknown chord quality: ${qualityId}`)
  return quality
}

export function getInversionCount(qualityId: ChordQualityId): number {
  return getChordQuality(qualityId).semitones.length
}
