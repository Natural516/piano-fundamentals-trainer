export const INTERVAL_QUERY_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
export type IntervalQueryLetter = typeof INTERVAL_QUERY_LETTERS[number]

export const INTERVAL_QUERY_VISIBLE_ACCIDENTALS = [
  { value: -1, label: '♭', selectorLabel: '♭', accessibleLabel: '降号' },
  { value: 0, label: '', selectorLabel: '♮', accessibleLabel: '还原' },
  { value: 1, label: '♯', selectorLabel: '♯', accessibleLabel: '升号' }
] as const
export type IntervalQueryVisibleAccidental = typeof INTERVAL_QUERY_VISIBLE_ACCIDENTALS[number]['value']

export const INTERVAL_QUERY_OCTAVES = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const
export type IntervalQueryOctave = typeof INTERVAL_QUERY_OCTAVES[number]

export interface IntervalQueryWrittenPitch {
  readonly letter: IntervalQueryLetter
  readonly accidental: number
  readonly octave: number
}

export type IntervalDirection = 'ascending' | 'descending' | 'same'
export type IntervalQuality = string
export type IntervalSoundingRelationship = 'different' | 'same-written' | 'enharmonic'

export interface EnharmonicIntervalReference {
  readonly intervalNumber: number
  readonly intervalNumberLabel: string
  readonly quality: IntervalQuality
  readonly intervalName: string
  readonly semitoneDistance: number
  readonly isCurrent: boolean
}

export interface IntervalQueryResult {
  readonly start: IntervalQueryWrittenPitch
  readonly target: IntervalQueryWrittenPitch
  readonly startLabel: string
  readonly targetLabel: string
  readonly direction: IntervalDirection
  readonly directionLabel: string
  readonly intervalNumber: number
  readonly intervalNumberLabel: string
  readonly quality: IntervalQuality
  readonly semitoneDistance: number
  readonly intervalName: string
  readonly displayName: string
  readonly soundingRelationship: IntervalSoundingRelationship
  readonly soundingRelationshipLabel: string | null
  readonly enharmonicReferences: readonly EnharmonicIntervalReference[]
}

const NATURAL_SEMITONES: Readonly<Record<IntervalQueryLetter, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
}

const SIMPLE_INTERVAL_BASELINES = [0, 2, 4, 5, 7, 9, 11] as const
const PERFECT_CLASS_INTERVALS = new Set([1, 4, 5])
const CHINESE_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const
const CHINESE_UNITS = ['', '十', '百', '千'] as const

export const INTERVAL_QUERY_VISIBLE_PITCHES: readonly IntervalQueryWrittenPitch[] = INTERVAL_QUERY_OCTAVES.flatMap((octave) =>
  INTERVAL_QUERY_LETTERS.flatMap((letter) =>
    INTERVAL_QUERY_VISIBLE_ACCIDENTALS.map(({ value: accidental }) => ({ letter, accidental, octave }))
  )
)

function assertInteger(name: string, value: number): void {
  if (!Number.isInteger(value)) throw new RangeError(`${name} must be an integer`)
}

function formatChineseInteger(value: number): string {
  assertInteger('Chinese integer', value)
  if (value < 0 || value > 9999) throw new RangeError('Chinese integer must be between 0 and 9999')
  if (value < 10) return CHINESE_DIGITS[value]

  const digits = String(value).split('').map(Number)
  const parts: string[] = []
  let pendingZero = false
  for (let index = 0; index < digits.length; index += 1) {
    const digit = digits[index]
    const unitIndex = digits.length - index - 1
    if (digit === 0) {
      pendingZero = parts.length > 0 && digits.slice(index + 1).some((item) => item !== 0)
      continue
    }
    if (pendingZero) {
      parts.push('零')
      pendingZero = false
    }
    const omitLeadingOne = digit === 1 && unitIndex === 1 && parts.length === 0
    if (!omitLeadingOne) parts.push(CHINESE_DIGITS[digit])
    parts.push(CHINESE_UNITS[unitIndex])
  }
  return parts.join('')
}

function formatQualityMultiplicity(count: number): string {
  assertInteger('Quality multiplicity', count)
  if (count < 1) throw new RangeError('Quality multiplicity must be positive')
  if (count === 1) return ''
  if (count === 2) return '倍'
  return `${formatChineseInteger(count)}倍`
}

export function formatIntervalAccidental(accidental: number): string {
  assertInteger('Accidental', accidental)
  if (accidental === 0) return ''
  if (accidental > 0) {
    const doubleSharps = Math.floor(accidental / 2)
    return `${'𝄪'.repeat(doubleSharps)}${accidental % 2 === 1 ? '♯' : ''}`
  }
  const absolute = Math.abs(accidental)
  const doubleFlats = Math.floor(absolute / 2)
  return `${'𝄫'.repeat(doubleFlats)}${absolute % 2 === 1 ? '♭' : ''}`
}

export function formatIntervalPitch(pitch: IntervalQueryWrittenPitch): string {
  return `${pitch.letter}${formatIntervalAccidental(pitch.accidental)}${pitch.octave}`
}

export function getIntervalPitchSemitone(pitch: IntervalQueryWrittenPitch): number {
  assertInteger('Octave', pitch.octave)
  assertInteger('Accidental', pitch.accidental)
  return ((pitch.octave + 1) * 12) + NATURAL_SEMITONES[pitch.letter] + pitch.accidental
}

export function getIntervalDiatonicCoordinate(pitch: IntervalQueryWrittenPitch): number {
  assertInteger('Octave', pitch.octave)
  return (pitch.octave * 7) + INTERVAL_QUERY_LETTERS.indexOf(pitch.letter)
}

export function getIntervalNumber(start: IntervalQueryWrittenPitch, target: IntervalQueryWrittenPitch): number {
  return Math.abs(getIntervalDiatonicCoordinate(target) - getIntervalDiatonicCoordinate(start)) + 1
}

export function getIntervalDirection(start: IntervalQueryWrittenPitch, target: IntervalQueryWrittenPitch): IntervalDirection {
  const delta = getIntervalPitchSemitone(target) - getIntervalPitchSemitone(start)
  if (delta > 0) return 'ascending'
  if (delta < 0) return 'descending'
  return 'same'
}

export function formatIntervalNumberChinese(intervalNumber: number): string {
  assertInteger('Interval number', intervalNumber)
  if (intervalNumber < 1) throw new RangeError('Interval number must be positive')
  return `${formatChineseInteger(intervalNumber)}度`
}

export function getIntervalQuality(intervalNumber: number, semitoneDistance: number): IntervalQuality {
  assertInteger('Interval number', intervalNumber)
  assertInteger('Semitone distance', semitoneDistance)
  if (intervalNumber < 1 || semitoneDistance < 0) throw new RangeError('Interval inputs must be non-negative and interval number must be positive')

  const simpleInterval = ((intervalNumber - 1) % 7) + 1
  const octaveCount = Math.floor((intervalNumber - 1) / 7)
  const baseline = SIMPLE_INTERVAL_BASELINES[simpleInterval - 1] + (octaveCount * 12)
  const delta = semitoneDistance - baseline

  if (PERFECT_CLASS_INTERVALS.has(simpleInterval)) {
    if (delta === 0) return '纯'
    if (delta > 0) return `${formatQualityMultiplicity(delta)}增`
    return `${formatQualityMultiplicity(Math.abs(delta))}减`
  }

  if (delta === 0) return '大'
  if (delta === -1) return '小'
  if (delta > 0) return `${formatQualityMultiplicity(delta)}增`
  return `${formatQualityMultiplicity(Math.abs(delta) - 1)}减`
}

export function getEnharmonicIntervalReferences(intervalNumber: number, semitoneDistance: number): readonly EnharmonicIntervalReference[] {
  const candidateNumbers = [intervalNumber - 1, intervalNumber, intervalNumber + 1].filter((value) => value >= 1)
  return candidateNumbers.map((candidate) => {
    const quality = getIntervalQuality(candidate, semitoneDistance)
    const intervalNumberLabel = formatIntervalNumberChinese(candidate)
    return {
      intervalNumber: candidate,
      intervalNumberLabel,
      quality,
      intervalName: `${quality}${intervalNumberLabel}`,
      semitoneDistance,
      isCurrent: candidate === intervalNumber
    }
  })
}

export function getIntervalQueryResult(start: IntervalQueryWrittenPitch, target: IntervalQueryWrittenPitch): IntervalQueryResult {
  const startSemitone = getIntervalPitchSemitone(start)
  const targetSemitone = getIntervalPitchSemitone(target)
  const semitoneDistance = Math.abs(targetSemitone - startSemitone)
  const direction = getIntervalDirection(start, target)
  const intervalNumber = getIntervalNumber(start, target)
  const intervalNumberLabel = formatIntervalNumberChinese(intervalNumber)
  const quality = getIntervalQuality(intervalNumber, semitoneDistance)
  const intervalName = `${quality}${intervalNumberLabel}`
  const sameWritten = start.letter === target.letter && start.accidental === target.accidental && start.octave === target.octave
  const soundingRelationship: IntervalSoundingRelationship = semitoneDistance !== 0
    ? 'different'
    : sameWritten ? 'same-written' : 'enharmonic'

  return {
    start: { ...start },
    target: { ...target },
    startLabel: formatIntervalPitch(start),
    targetLabel: formatIntervalPitch(target),
    direction,
    directionLabel: direction === 'ascending' ? '上行' : direction === 'descending' ? '下行' : '同高',
    intervalNumber,
    intervalNumberLabel,
    quality,
    semitoneDistance,
    intervalName,
    displayName: direction === 'descending' ? `下行${intervalName}` : intervalName,
    soundingRelationship,
    soundingRelationshipLabel: soundingRelationship === 'same-written'
      ? '同音'
      : soundingRelationship === 'enharmonic' ? '等音同高' : null,
    enharmonicReferences: getEnharmonicIntervalReferences(intervalNumber, semitoneDistance)
  }
}
