export type MajorKeyId =
  | 'C'
  | 'C#'
  | 'Db'
  | 'D'
  | 'Eb'
  | 'E'
  | 'F'
  | 'F#'
  | 'Gb'
  | 'G'
  | 'Ab'
  | 'A'
  | 'Bb'
  | 'B'
  | 'Cb'
export type MusicAccidental = '#' | 'b' | null
export type KeySignatureAccidentalType = 'sharp' | 'flat' | 'none'

export interface MajorScaleDegree {
  degree: number
  letter: string
  accidental: MusicAccidental
  spelling: string
  pitchClass: number
}

export interface MajorKeySignature {
  id: MajorKeyId
  displayName: string
  vexFlowKey: string
  tonicPitchClass: number
  accidentalCount: number
  accidentalType: KeySignatureAccidentalType
  signatureOrder: readonly string[]
  scaleDegrees: readonly MajorScaleDegree[]
}

export const SHARP_SIGNATURE_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'] as const
export const FLAT_SIGNATURE_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'] as const

const PITCH_CLASS_BY_NATURAL: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
}

function createScaleDegrees(spellings: readonly string[]): MajorScaleDegree[] {
  return spellings.map((spelling, index) => {
    const letter = spelling[0]
    const accidental = spelling.includes('#') ? '#' : spelling.includes('b') ? 'b' : null
    const offset = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0

    return {
      degree: index + 1,
      letter,
      accidental,
      spelling,
      pitchClass: (PITCH_CLASS_BY_NATURAL[letter] + offset + 12) % 12
    }
  })
}

function defineMajorKey(
  id: MajorKeyId,
  tonicPitchClass: number,
  accidentalCount: number,
  accidentalType: KeySignatureAccidentalType,
  spellings: readonly string[]
): MajorKeySignature {
  const signatureOrder = accidentalType === 'sharp'
    ? SHARP_SIGNATURE_ORDER.slice(0, accidentalCount)
    : accidentalType === 'flat'
      ? FLAT_SIGNATURE_ORDER.slice(0, accidentalCount)
      : []

  return {
    id,
    displayName: `${id.replace('#', '♯').replace('b', '♭')} 大调`,
    vexFlowKey: id,
    tonicPitchClass,
    accidentalCount,
    accidentalType,
    signatureOrder,
    scaleDegrees: createScaleDegrees(spellings)
  }
}

export const MAJOR_KEY_SIGNATURES: readonly MajorKeySignature[] = [
  defineMajorKey('C', 0, 0, 'none', ['C', 'D', 'E', 'F', 'G', 'A', 'B']),
  defineMajorKey('G', 7, 1, 'sharp', ['G', 'A', 'B', 'C', 'D', 'E', 'F#']),
  defineMajorKey('D', 2, 2, 'sharp', ['D', 'E', 'F#', 'G', 'A', 'B', 'C#']),
  defineMajorKey('A', 9, 3, 'sharp', ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#']),
  defineMajorKey('E', 4, 4, 'sharp', ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#']),
  defineMajorKey('B', 11, 5, 'sharp', ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#']),
  defineMajorKey('F#', 6, 6, 'sharp', ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']),
  defineMajorKey('C#', 1, 7, 'sharp', ['C#', 'D#', 'E#', 'F#', 'G#', 'A#', 'B#']),
  defineMajorKey('F', 5, 1, 'flat', ['F', 'G', 'A', 'Bb', 'C', 'D', 'E']),
  defineMajorKey('Bb', 10, 2, 'flat', ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A']),
  defineMajorKey('Eb', 3, 3, 'flat', ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D']),
  defineMajorKey('Ab', 8, 4, 'flat', ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G']),
  defineMajorKey('Db', 1, 5, 'flat', ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C']),
  defineMajorKey('Gb', 6, 6, 'flat', ['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F']),
  defineMajorKey('Cb', 11, 7, 'flat', ['Cb', 'Db', 'Eb', 'Fb', 'Gb', 'Ab', 'Bb'])
] as const

export const MAJOR_KEY_DISPLAY_ORDER: readonly MajorKeyId[] = [
  'C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B', 'Cb'
]

export const MAJOR_KEY_DISPLAY_SIGNATURES: readonly MajorKeySignature[] =
  MAJOR_KEY_DISPLAY_ORDER.map((keyId) => getMajorKeySignature(keyId))

export const MAJOR_KEY_IDS = MAJOR_KEY_SIGNATURES.map((key) => key.id)

export function isMajorKeyId(value: unknown): value is MajorKeyId {
  return typeof value === 'string' && MAJOR_KEY_IDS.includes(value as MajorKeyId)
}

export function normalizeMajorKeyId(value: unknown): MajorKeyId {
  return isMajorKeyId(value) ? value : 'C'
}

export function getMajorKeySignature(value: unknown): MajorKeySignature {
  return MAJOR_KEY_SIGNATURES.find((key) => key.id === value) ?? MAJOR_KEY_SIGNATURES[0]
}

export function getScaleDegree(keyId: MajorKeyId, degree: number): MajorScaleDegree {
  const key = getMajorKeySignature(keyId)
  return key.scaleDegrees[Math.max(0, Math.min(6, degree - 1))]
}
