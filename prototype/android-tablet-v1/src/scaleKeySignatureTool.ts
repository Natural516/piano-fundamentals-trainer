import {
  getMajorKeySignature,
  type MajorKeyId
} from '../../../src/sightReading/musicKeySignatures'

export type ScaleTypeId = 'naturalMajor' | 'naturalMinor' | 'harmonicMinor' | 'melodicMinor'

export interface ScaleTypeDefinition {
  readonly id: ScaleTypeId
  readonly label: string
  readonly available: boolean
}

export interface ScaleNoteSequencePresentation {
  readonly ascending: readonly string[]
  readonly descending?: readonly string[]
}

export interface NaturalMajorToolResult {
  readonly keySignatureId: MajorKeyId
  readonly tonicLabel: string
  readonly title: string
  readonly notes: ScaleNoteSequencePresentation
  readonly relativeMinorTonicLabel: string
  readonly relativeMinorLabel: string
}

export const SCALE_TYPE_MODEL: readonly ScaleTypeDefinition[] = Object.freeze([
  Object.freeze({ id: 'naturalMajor', label: '自然大调', available: true }),
  Object.freeze({ id: 'naturalMinor', label: '自然小调', available: false }),
  Object.freeze({ id: 'harmonicMinor', label: '和声小调', available: false }),
  Object.freeze({ id: 'melodicMinor', label: '旋律小调', available: false })
])

export const AVAILABLE_SCALE_TYPE_OPTIONS = Object.freeze(
  SCALE_TYPE_MODEL.filter((item) => item.available)
)

export const NATURAL_MAJOR_TOOL_ROOT_IDS: readonly MajorKeyId[] = Object.freeze([
  'Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'
])

export function formatScaleToolNoteName(spelling: string): string {
  return spelling.replace(/#/g, '♯').replace(/b/g, '♭')
}

export function createScaleNoteSequence(
  ascending: readonly string[],
  descending?: readonly string[]
): ScaleNoteSequencePresentation {
  return Object.freeze({
    ascending: Object.freeze([...ascending]),
    ...(descending ? { descending: Object.freeze([...descending]) } : {})
  })
}

export function getNaturalMajorToolResult(keyId: MajorKeyId): NaturalMajorToolResult {
  const key = getMajorKeySignature(keyId)
  const writtenDegrees = key.scaleDegrees.map((degree) => formatScaleToolNoteName(degree.spelling))
  const tonic = writtenDegrees[0]
  const relativeMinor = writtenDegrees[5]

  return Object.freeze({
    keySignatureId: key.id,
    tonicLabel: tonic,
    title: `${tonic} 自然大调`,
    notes: createScaleNoteSequence([...writtenDegrees, tonic]),
    relativeMinorTonicLabel: relativeMinor,
    relativeMinorLabel: `${relativeMinor} 小调`
  })
}
