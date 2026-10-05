import { getIntervalNumber, getIntervalPitchSemitone, getIntervalQueryResult } from '../../intervalQueryTool'
import { NOTE_LETTERS } from '../chords/types'
import type { NoteLetter, WrittenPitchClass } from '../chords/types'
import { INTERVAL_TYPES, getIntervalType } from './catalog'
import { buildInterval, createIntervalSpelledNote, isIntervalPracticeAccidental } from './spelling'
import type {
  IntervalPracticeAccidental,
  IntervalPracticeQuestion,
  IntervalPracticeZone,
  IntervalSpelledNote,
  IntervalTypeDefinition,
  IntervalTypeId
} from './types'

export const INTERVAL_PRACTICE_MIN_MIDI = 29 // F1
export const INTERVAL_PRACTICE_MAX_MIDI = 91 // G6

export const INTERVAL_ZONE_MIDI_RANGES: Readonly<Record<IntervalPracticeZone, { readonly minMidi: number; readonly maxMidi: number }>> = Object.freeze({
  LOW_EXTENSION: Object.freeze({ minMidi: 29, maxMidi: 35 }), // F1..B1
  CORE: Object.freeze({ minMidi: 36, maxMidi: 85 }), // C2..C#6/Db6, closing the written C6..D6 semitone gap
  HIGH_EXTENSION: Object.freeze({ minMidi: 86, maxMidi: 91 }) // D6..G6
})

const COMMON_SHARP_ROOTS: readonly NoteLetter[] = Object.freeze(['C', 'D', 'F', 'G', 'A'])
const COMMON_FLAT_ROOTS: readonly NoteLetter[] = Object.freeze(['D', 'E', 'G', 'A', 'B'])

/** Naturals plus the ten conventional black-key spellings; uncommon B#/Cb/E#/Fb roots are omitted. */
export const INTERVAL_PRACTICE_ROOT_PITCH_CLASSES: readonly WrittenPitchClass[] = Object.freeze([
  ...NOTE_LETTERS.map((letter) => Object.freeze({ letter, accidental: 0 as const })),
  ...COMMON_SHARP_ROOTS.map((letter) => Object.freeze({ letter, accidental: 1 as const })),
  ...COMMON_FLAT_ROOTS.map((letter) => Object.freeze({ letter, accidental: -1 as const }))
])

export function getIntervalPracticeZone(midi: number): IntervalPracticeZone {
  if (!Number.isInteger(midi) || midi < INTERVAL_PRACTICE_MIN_MIDI || midi > INTERVAL_PRACTICE_MAX_MIDI) {
    throw new RangeError(`MIDI note ${midi} is outside the V1 interval-practice range`)
  }
  if (midi <= INTERVAL_ZONE_MIDI_RANGES.LOW_EXTENSION.maxMidi) return 'LOW_EXTENSION'
  if (midi <= INTERVAL_ZONE_MIDI_RANGES.CORE.maxMidi) return 'CORE'
  return 'HIGH_EXTENSION'
}

export const INTERVAL_PRACTICE_ROOTS: readonly IntervalSpelledNote[] = Object.freeze(
  Array.from({ length: 6 }, (_, index) => index + 1).flatMap((octave) =>
    INTERVAL_PRACTICE_ROOT_PITCH_CLASSES.map(({ letter, accidental }) =>
      createIntervalSpelledNote(letter, accidental as IntervalPracticeAccidental, octave)
    )
  ).filter(({ soundingMidi }) => soundingMidi >= INTERVAL_PRACTICE_MIN_MIDI && soundingMidi <= INTERVAL_PRACTICE_MAX_MIDI)
)

export function validateIntervalPracticeQuestion(question: IntervalPracticeQuestion): readonly string[] {
  const errors: string[] = []
  const { intervalType, root, target, rootMidi, targetMidi } = question
  if (rootMidi !== root.soundingMidi || targetMidi !== target.soundingMidi) errors.push('redundant MIDI fields do not match spelled notes')
  if (!Number.isInteger(rootMidi) || !Number.isInteger(targetMidi)) errors.push('MIDI values must be integers')
  if (rootMidi < INTERVAL_PRACTICE_MIN_MIDI || rootMidi > INTERVAL_PRACTICE_MAX_MIDI) errors.push('root is outside F1..G6')
  if (targetMidi < INTERVAL_PRACTICE_MIN_MIDI || targetMidi > INTERVAL_PRACTICE_MAX_MIDI) errors.push('target is outside F1..G6')
  if (!isIntervalPracticeAccidental(root.accidental) || !isIntervalPracticeAccidental(target.accidental)) errors.push('unsupported accidental')
  if (targetMidi - rootMidi !== intervalType.semitones) errors.push('semitone distance mismatch')
  if (getIntervalNumber(root, target) !== intervalType.degree) errors.push('diatonic degree mismatch')
  const queryResult = getIntervalQueryResult(root, target)
  const catalogType = getIntervalType(intervalType.id)
  // Degree + semitones uniquely distinguish the 26 types, including enharmonic spellings.
  // Verify actual pitch coordinates/direction too; display names and quality text are irrelevant.
  if (intervalType.degree !== catalogType.degree || intervalType.semitones !== catalogType.semitones
    || queryResult.intervalNumber !== catalogType.degree || queryResult.semitoneDistance !== catalogType.semitones
    || queryResult.direction !== (catalogType.semitones === 0 ? 'same' : 'ascending')
    || getIntervalPitchSemitone(root) !== rootMidi || getIntervalPitchSemitone(target) !== targetMidi) {
    errors.push('Interval Query identity mismatch')
  }
  if (question.zone !== getIntervalPracticeZone(rootMidi)) errors.push('root zone mismatch')
  return Object.freeze(errors)
}

export function getLegalIntervalCandidates(interval: IntervalTypeId | IntervalTypeDefinition): readonly IntervalPracticeQuestion[] {
  const intervalType = typeof interval === 'string' ? getIntervalType(interval) : interval
  const candidates = INTERVAL_PRACTICE_ROOTS.flatMap((root): IntervalPracticeQuestion[] => {
    const construction = buildInterval(root, intervalType)
    if (!construction.eligible) return []
    const target = construction.target
    if (target.soundingMidi < INTERVAL_PRACTICE_MIN_MIDI || target.soundingMidi > INTERVAL_PRACTICE_MAX_MIDI) return []
    const question: IntervalPracticeQuestion = Object.freeze({
      intervalType,
      root,
      target,
      rootMidi: root.soundingMidi,
      targetMidi: target.soundingMidi,
      zone: getIntervalPracticeZone(root.soundingMidi)
    })
    const errors = validateIntervalPracticeQuestion(question)
    if (errors.length > 0) {
      throw new Error(`Generated invalid ${intervalType.id} candidate: ${errors.join('; ')}`)
    }
    return [question]
  })
  return Object.freeze(candidates)
}

export const INTERVAL_PRACTICE_CANDIDATES: Readonly<Record<IntervalTypeId, readonly IntervalPracticeQuestion[]>> = Object.freeze(
  Object.fromEntries(INTERVAL_TYPES.map((interval) => [interval.id, getLegalIntervalCandidates(interval)])) as Record<IntervalTypeId, readonly IntervalPracticeQuestion[]>
)
