export type ChordQueryNoteLetter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'
export type ChordQueryInputAccidental = -1 | 0 | 1

export interface ChordQueryRoot {
  readonly letter: ChordQueryNoteLetter
  readonly accidental: ChordQueryInputAccidental
}

export interface ChordQueryToneDefinition {
  readonly degree: number
  readonly degreeLabel: string
  readonly semitones: number
}

export type ChordQueryGroupId =
  | 'basic-triads'
  | 'sevenths'
  | 'suspended'
  | 'sixths-added'
  | 'ninths'
  | 'elevenths'
  | 'thirteenths'
  | 'altered-dominants'
  | 'other'

export type ChordQueryTypeId =
  | 'major'
  | 'minor'
  | 'diminished'
  | 'augmented'
  | 'dominant7'
  | 'minor7'
  | 'major7'
  | 'diminished7'
  | 'halfDiminished7'
  | 'sus4'
  | 'sus2'
  | 'dominant7Sus4'
  | 'six'
  | 'minorSix'
  | 'add9'
  | 'sixNine'
  | 'dominant9'
  | 'minor9'
  | 'major9'
  | 'dominant11'
  | 'minor11'
  | 'major11'
  | 'dominant13'
  | 'minor13'
  | 'major13'
  | 'dominantFlat5'
  | 'dominantFlat9'
  | 'dominantSharp9'
  | 'power5'

export interface ChordQueryTypeDefinition {
  readonly id: ChordQueryTypeId
  readonly selectorLabel: string
  readonly suffix: string
  readonly chineseName: string
  readonly tones: readonly ChordQueryToneDefinition[]
}

export interface ChordQueryTypeGroup {
  readonly id: ChordQueryGroupId
  readonly label: string
  readonly types: readonly ChordQueryTypeDefinition[]
}

export interface ChordQueryWrittenPitch {
  readonly letter: ChordQueryNoteLetter
  readonly accidentalOffset: number
  readonly accidental: string
  readonly label: string
  readonly degree: number
  readonly degreeLabel: string
  readonly semitones: number
}

export interface ChordQueryKeyboardRealization {
  readonly range: readonly [48, 83]
  readonly rootMidiNumber: number
  readonly midiNumbers: readonly number[]
}

export interface ChordQueryResult {
  readonly root: ChordQueryRoot
  readonly rootLabel: string
  readonly type: ChordQueryTypeDefinition
  readonly symbol: string
  readonly chineseLabel: string
  readonly pitches: readonly ChordQueryWrittenPitch[]
  readonly keyboard: ChordQueryKeyboardRealization
}

export const CHORD_QUERY_NOTE_LETTERS: readonly ChordQueryNoteLetter[] = Object.freeze([
  'C', 'D', 'E', 'F', 'G', 'A', 'B'
])

export const CHORD_QUERY_INPUT_ACCIDENTALS: readonly {
  readonly value: ChordQueryInputAccidental
  readonly label: string
}[] = Object.freeze([
  Object.freeze({ value: -1, label: '♭' }),
  Object.freeze({ value: 0, label: '♮' }),
  Object.freeze({ value: 1, label: '♯' })
])

const tone = (degree: number, degreeLabel: string, semitones: number): ChordQueryToneDefinition =>
  Object.freeze({ degree, degreeLabel, semitones })

const type = (
  id: ChordQueryTypeId,
  selectorLabel: string,
  suffix: string,
  chineseName: string,
  tones: readonly ChordQueryToneDefinition[]
): ChordQueryTypeDefinition => Object.freeze({
  id,
  selectorLabel,
  suffix,
  chineseName,
  tones: Object.freeze([...tones])
})

export const CHORD_QUERY_TYPE_GROUPS: readonly ChordQueryTypeGroup[] = Object.freeze([
  Object.freeze({
    id: 'basic-triads',
    label: '基础三和弦',
    types: Object.freeze([
      type('major', '大三和弦', '', '大三和弦', [tone(1, '1', 0), tone(3, '3', 4), tone(5, '5', 7)]),
      type('minor', 'm · 小三和弦', 'm', '小三和弦', [tone(1, '1', 0), tone(3, '♭3', 3), tone(5, '5', 7)]),
      type('diminished', 'dim · 减三和弦', 'dim', '减三和弦', [tone(1, '1', 0), tone(3, '♭3', 3), tone(5, '♭5', 6)]),
      type('augmented', 'aug · 增三和弦', 'aug', '增三和弦', [tone(1, '1', 0), tone(3, '3', 4), tone(5, '♯5', 8)])
    ])
  }),
  Object.freeze({
    id: 'sevenths',
    label: '七和弦',
    types: Object.freeze([
      type('dominant7', '7 · 属七和弦', '7', '属七和弦', [tone(1, '1', 0), tone(3, '3', 4), tone(5, '5', 7), tone(7, '♭7', 10)]),
      type('minor7', 'm7 · 小七和弦', 'm7', '小七和弦', [tone(1, '1', 0), tone(3, '♭3', 3), tone(5, '5', 7), tone(7, '♭7', 10)]),
      type('major7', 'maj7 · 大七和弦', 'maj7', '大七和弦', [tone(1, '1', 0), tone(3, '3', 4), tone(5, '5', 7), tone(7, '7', 11)]),
      type('diminished7', 'dim7 · 减七和弦', 'dim7', '减七和弦', [tone(1, '1', 0), tone(3, '♭3', 3), tone(5, '♭5', 6), tone(7, '𝄫7', 9)]),
      type('halfDiminished7', 'm7(♭5) · 半减七和弦', 'm7(♭5)', '半减七和弦', [tone(1, '1', 0), tone(3, '♭3', 3), tone(5, '♭5', 6), tone(7, '♭7', 10)])
    ])
  }),
  Object.freeze({
    id: 'suspended',
    label: '挂留和弦',
    types: Object.freeze([
      type('sus4', 'sus4 · 挂四和弦', 'sus4', '挂四和弦', [tone(1, '1', 0), tone(4, '4', 5), tone(5, '5', 7)]),
      type('sus2', 'sus2 · 挂二和弦', 'sus2', '挂二和弦', [tone(1, '1', 0), tone(2, '2', 2), tone(5, '5', 7)]),
      type('dominant7Sus4', '7sus4 · 属七挂四和弦', '7sus4', '属七挂四和弦', [tone(1, '1', 0), tone(4, '4', 5), tone(5, '5', 7), tone(7, '♭7', 10)])
    ])
  }),
  Object.freeze({
    id: 'sixths-added',
    label: '六和弦 / 加音',
    types: Object.freeze([
      type('six', '6 · 六和弦', '6', '六和弦', [tone(1, '1', 0), tone(3, '3', 4), tone(5, '5', 7), tone(6, '6', 9)]),
      type('minorSix', 'm6 · 小六和弦', 'm6', '小六和弦', [tone(1, '1', 0), tone(3, '♭3', 3), tone(5, '5', 7), tone(6, '6', 9)]),
      type('add9', 'add9 · 加九和弦', 'add9', '加九和弦', [tone(1, '1', 0), tone(3, '3', 4), tone(5, '5', 7), tone(9, '9', 14)]),
      type('sixNine', '6/9 · 六九和弦', '6/9', '六九和弦', [tone(1, '1', 0), tone(3, '3', 4), tone(5, '5', 7), tone(6, '6', 9), tone(9, '9', 14)])
    ])
  }),
  Object.freeze({
    id: 'ninths',
    label: '九和弦',
    types: Object.freeze([
      type('dominant9', '9 · 属九和弦', '9', '属九和弦', [tone(1, '1', 0), tone(3, '3', 4), tone(5, '5', 7), tone(7, '♭7', 10), tone(9, '9', 14)]),
      type('minor9', 'm9 · 小九和弦', 'm9', '小九和弦', [tone(1, '1', 0), tone(3, '♭3', 3), tone(5, '5', 7), tone(7, '♭7', 10), tone(9, '9', 14)]),
      type('major9', 'maj9 · 大九和弦', 'maj9', '大九和弦', [tone(1, '1', 0), tone(3, '3', 4), tone(5, '5', 7), tone(7, '7', 11), tone(9, '9', 14)])
    ])
  }),
  Object.freeze({
    id: 'elevenths',
    label: '十一和弦',
    types: Object.freeze([
      type('dominant11', '11 · 属十一和弦', '11', '属十一和弦', [tone(1, '1', 0), tone(3, '3', 4), tone(5, '5', 7), tone(7, '♭7', 10), tone(9, '9', 14), tone(11, '11', 17)]),
      type('minor11', 'm11 · 小十一和弦', 'm11', '小十一和弦', [tone(1, '1', 0), tone(3, '♭3', 3), tone(5, '5', 7), tone(7, '♭7', 10), tone(9, '9', 14), tone(11, '11', 17)]),
      type('major11', 'maj11 · 大十一和弦', 'maj11', '大十一和弦', [tone(1, '1', 0), tone(3, '3', 4), tone(5, '5', 7), tone(7, '7', 11), tone(9, '9', 14), tone(11, '11', 17)])
    ])
  }),
  Object.freeze({
    id: 'thirteenths',
    label: '十三和弦',
    types: Object.freeze([
      type('dominant13', '13 · 属十三和弦', '13', '属十三和弦', [tone(1, '1', 0), tone(3, '3', 4), tone(5, '5', 7), tone(7, '♭7', 10), tone(9, '9', 14), tone(11, '11', 17), tone(13, '13', 21)]),
      type('minor13', 'm13 · 小十三和弦', 'm13', '小十三和弦', [tone(1, '1', 0), tone(3, '♭3', 3), tone(5, '5', 7), tone(7, '♭7', 10), tone(9, '9', 14), tone(11, '11', 17), tone(13, '13', 21)]),
      type('major13', 'maj13 · 大十三和弦', 'maj13', '大十三和弦', [tone(1, '1', 0), tone(3, '3', 4), tone(5, '5', 7), tone(7, '7', 11), tone(9, '9', 14), tone(11, '11', 17), tone(13, '13', 21)])
    ])
  }),
  Object.freeze({
    id: 'altered-dominants',
    label: '变化属和弦',
    types: Object.freeze([
      type('dominantFlat5', '7(♭5) · 属七降五和弦', '7(♭5)', '属七降五和弦', [tone(1, '1', 0), tone(3, '3', 4), tone(5, '♭5', 6), tone(7, '♭7', 10)]),
      type('dominantFlat9', '7(♭9) · 属七降九和弦', '7(♭9)', '属七降九和弦', [tone(1, '1', 0), tone(3, '3', 4), tone(5, '5', 7), tone(7, '♭7', 10), tone(9, '♭9', 13)]),
      type('dominantSharp9', '7(♯9) · 属七升九和弦', '7(♯9)', '属七升九和弦', [tone(1, '1', 0), tone(3, '3', 4), tone(5, '5', 7), tone(7, '♭7', 10), tone(9, '♯9', 15)])
    ])
  }),
  Object.freeze({
    id: 'other',
    label: '其他',
    types: Object.freeze([
      type('power5', '5 · 五度和弦', '5', '五度和弦', [tone(1, '1', 0), tone(5, '5', 7)])
    ])
  })
])

export const CHORD_QUERY_TYPES: readonly ChordQueryTypeDefinition[] = Object.freeze(
  CHORD_QUERY_TYPE_GROUPS.flatMap((group) => group.types)
)

export const CHORD_QUERY_WRITTEN_ROOTS: readonly ChordQueryRoot[] = Object.freeze(
  CHORD_QUERY_NOTE_LETTERS.flatMap((letter) =>
    CHORD_QUERY_INPUT_ACCIDENTALS.map(({ value }) => Object.freeze({ letter, accidental: value }))
  )
)

export const CHORD_QUERY_KEYBOARD_RANGE = Object.freeze([48, 83] as const)

const NATURAL_PITCH_CLASSES: Readonly<Record<ChordQueryNoteLetter, number>> = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
})

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

export function formatChordQueryAccidental(offset: number): string {
  if (!Number.isInteger(offset)) throw new TypeError('Accidental offset must be an integer.')
  if (offset === 0) return ''
  if (offset === -1) return '♭'
  if (offset === 1) return '♯'
  if (offset === -2) return '𝄫'
  if (offset === 2) return '𝄪'
  if (offset < 0) return `𝄫${'♭'.repeat(Math.abs(offset) - 2)}`
  return `𝄪${'♯'.repeat(offset - 2)}`
}

export function formatChordQueryRoot(root: ChordQueryRoot): string {
  return `${root.letter}${formatChordQueryAccidental(root.accidental)}`
}

export function getChordQueryType(typeId: ChordQueryTypeId): ChordQueryTypeDefinition {
  const definition = CHORD_QUERY_TYPES.find((item) => item.id === typeId)
  if (!definition) throw new RangeError(`Unknown Chord Query type: ${typeId}`)
  return definition
}

export function spellChordQueryTone(
  root: ChordQueryRoot,
  toneDefinition: ChordQueryToneDefinition
): ChordQueryWrittenPitch {
  const rootLetterIndex = CHORD_QUERY_NOTE_LETTERS.indexOf(root.letter)
  const targetLetterPosition = rootLetterIndex + toneDefinition.degree - 1
  const targetLetter = CHORD_QUERY_NOTE_LETTERS[mod(targetLetterPosition, 7)]
  const targetNaturalSemitone = NATURAL_PITCH_CLASSES[targetLetter] + 12 * Math.floor(targetLetterPosition / 7)
  const desiredSemitone = NATURAL_PITCH_CLASSES[root.letter] + root.accidental + toneDefinition.semitones
  const accidentalOffset = desiredSemitone - targetNaturalSemitone
  const accidental = formatChordQueryAccidental(accidentalOffset)

  return Object.freeze({
    letter: targetLetter,
    accidentalOffset,
    accidental,
    label: `${targetLetter}${accidental}`,
    degree: toneDefinition.degree,
    degreeLabel: toneDefinition.degreeLabel,
    semitones: toneDefinition.semitones
  })
}

export function getChordQueryPitchClass(root: ChordQueryRoot): number {
  return mod(NATURAL_PITCH_CLASSES[root.letter] + root.accidental, 12)
}

export function createChordQueryKeyboardRealization(
  root: ChordQueryRoot,
  definition: ChordQueryTypeDefinition
): ChordQueryKeyboardRealization {
  const [startMidi, endMidi] = CHORD_QUERY_KEYBOARD_RANGE
  const rootPitchClass = getChordQueryPitchClass(root)
  const maximumSpan = Math.max(...definition.tones.map((item) => item.semitones))
  let rootMidiNumber: number | null = null

  for (let candidate = startMidi; candidate <= endMidi - maximumSpan; candidate += 1) {
    if (candidate % 12 === rootPitchClass) {
      rootMidiNumber = candidate
      break
    }
  }

  if (rootMidiNumber === null) {
    throw new RangeError(`Chord ${formatChordQueryRoot(root)}${definition.suffix} cannot fit C3–B5.`)
  }

  return Object.freeze({
    range: CHORD_QUERY_KEYBOARD_RANGE,
    rootMidiNumber,
    midiNumbers: Object.freeze(definition.tones.map((item) => rootMidiNumber + item.semitones))
  })
}

export function getChordQueryResult(
  root: ChordQueryRoot,
  typeId: ChordQueryTypeId
): ChordQueryResult {
  const definition = getChordQueryType(typeId)
  const rootLabel = formatChordQueryRoot(root)

  return Object.freeze({
    root: Object.freeze({ ...root }),
    rootLabel,
    type: definition,
    symbol: `${rootLabel}${definition.suffix}`,
    chineseLabel: `${rootLabel} ${definition.chineseName}`,
    pitches: Object.freeze(definition.tones.map((item) => spellChordQueryTone(root, item))),
    keyboard: createChordQueryKeyboardRealization(root, definition)
  })
}
