import type { ChordQueryTypeDefinition } from '../chordQueryTool'
import { formatIntervalNumberChinese, type IntervalQueryResult } from '../intervalQueryTool'
import type { MidiTranslator } from './midiPresentation'

/** Display descriptor from numeric theory facts, never from a translated/legacy quality string. */
export function describeIntervalQuality(degree: number, semitones: number): { quality: 'perfect' | 'major' | 'minor' | 'augmented' | 'diminished'; multiplicity: number } {
  if (!Number.isInteger(degree) || degree < 1 || !Number.isInteger(semitones) || semitones < 0) throw new RangeError('Invalid interval facts')
  const simple = ((degree - 1) % 7) + 1
  const baseline = [0, 2, 4, 5, 7, 9, 11][simple - 1] + Math.floor((degree - 1) / 7) * 12
  const delta = semitones - baseline
  if ([1, 4, 5].includes(simple) && delta === 0) return { quality: 'perfect', multiplicity: 0 }
  if (![1, 4, 5].includes(simple)) {
    if (delta === 0) return { quality: 'major', multiplicity: 0 }
    if (delta === -1) return { quality: 'minor', multiplicity: 0 }
  }
  return delta > 0 ? { quality: 'augmented', multiplicity: delta }
    : { quality: 'diminished', multiplicity: -delta - ([1, 4, 5].includes(simple) ? 0 : 1) }
}

function ordinal(value: number): string {
  const lastTwo = value % 100
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[value % 10] ?? 'th'
  return `${value}${suffix}`
}

export function presentIntervalName(degree: number, semitones: number, t: MidiTranslator, locale: string): { name: string; degree: string; quality: string } {
  const descriptor = describeIntervalQuality(degree, semitones)
  const number = locale === 'zh-CN' ? formatIntervalNumberChinese(degree).slice(0, -1) : ordinal(degree)
  const degreeName = degree <= 13 ? t(`interval.degrees.${degree}`) : t('interval.degreeName', { number })
  const { quality, multiplicity } = descriptor
  const suffix = quality === 'augmented' ? 'Augmented' : 'Diminished'
  const key = multiplicity === 2 ? `doubly${suffix}` : multiplicity === 3 ? `triply${suffix}` : multiplicity > 3 ? `multiple${suffix}` : quality
  // The Chinese count is display-only; no presentation value feeds the query algorithm.
  const count = locale === 'zh-CN' && multiplicity > 3 ? formatIntervalNumberChinese(multiplicity).slice(0, -1) : multiplicity
  const qualityName = t(`interval.qualities.${key}`, { count })
  return { name: t('interval.name', { quality: qualityName, degree: degreeName }), degree: degreeName, quality: qualityName }
}

export function presentIntervalQuery(result: IntervalQueryResult, t: MidiTranslator, locale: string) {
  const names = presentIntervalName(result.intervalNumber, result.semitoneDistance, t, locale)
  return {
    ...names,
    displayName: result.direction === 'descending' ? t('interval.descendingName', { intervalName: names.name }) : names.name,
    direction: t(`interval.directions.${result.direction}`),
    relationship: result.soundingRelationship === 'different' ? null : t(`interval.relationships.${result.soundingRelationship}`)
  }
}

export function presentChordTypeOption(type: ChordQueryTypeDefinition, t: MidiTranslator): string {
  const chordName = t(`chord.types.${type.id}`)
  return type.suffix ? t('chord.selector', { suffix: type.suffix, chordName }) : chordName
}

export function presentQueryAccidental(value: number, t: MidiTranslator): string {
  return t(`accidentals.${value < 0 ? 'flat' : value > 0 ? 'sharp' : 'natural'}`)
}
