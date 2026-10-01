import { NOTE_LETTERS } from '../chords/types'
import { writtenPitchToMidi } from '../chords/spelling'
import type { NoteLetter } from '../chords/types'
import type {
  IntervalConstructionResult,
  IntervalPracticeAccidental,
  IntervalSpelledNote,
  IntervalTypeDefinition,
  TheoreticalIntervalTarget
} from './types'

export function isIntervalPracticeAccidental(value: number): value is IntervalPracticeAccidental {
  return value === -1 || value === 0 || value === 1
}

export function createIntervalSpelledNote(
  letter: NoteLetter,
  accidental: IntervalPracticeAccidental,
  octave: number
): IntervalSpelledNote {
  if (!Number.isInteger(octave)) throw new RangeError('Octave must be an integer')
  const soundingMidi = writtenPitchToMidi({ letter, accidental, octave })
  return Object.freeze({ letter, accidental, octave, soundingMidi })
}

function assertRoot(root: IntervalSpelledNote): void {
  if (!NOTE_LETTERS.includes(root.letter)) throw new RangeError(`Invalid note letter: ${root.letter}`)
  if (!isIntervalPracticeAccidental(root.accidental)) throw new RangeError('V1 root accidental must be flat, natural or sharp')
  if (!Number.isInteger(root.octave)) throw new RangeError('Root octave must be an integer')
  const expectedMidi = writtenPitchToMidi(root)
  if (!Number.isInteger(root.soundingMidi) || root.soundingMidi !== expectedMidi) {
    throw new RangeError(`Root sounding MIDI does not match its spelling; expected ${expectedMidi}`)
  }
}

/**
 * Builds an ascending interval from notation first: degree selects the target letter,
 * then semitone distance determines its accidental. V1 eligibility is reported
 * separately so an unsupported double accidental can never be silently respelled.
 */
export function buildInterval(
  root: IntervalSpelledNote,
  intervalType: IntervalTypeDefinition
): IntervalConstructionResult {
  assertRoot(root)
  const rootLetterIndex = NOTE_LETTERS.indexOf(root.letter)
  const targetLetterPosition = rootLetterIndex + intervalType.degree - 1
  const targetLetter = NOTE_LETTERS[targetLetterPosition % NOTE_LETTERS.length]
  const targetOctave = root.octave + Math.floor(targetLetterPosition / NOTE_LETTERS.length)
  const targetNaturalMidi = writtenPitchToMidi({ letter: targetLetter, accidental: 0, octave: targetOctave })
  const soundingMidi = root.soundingMidi + intervalType.semitones
  const accidental = soundingMidi - targetNaturalMidi
  const theoreticalTarget: TheoreticalIntervalTarget = Object.freeze({
    letter: targetLetter,
    accidental,
    octave: targetOctave,
    soundingMidi
  })

  if (!isIntervalPracticeAccidental(accidental)) {
    return Object.freeze({ eligible: false, reason: 'unsupported-accidental', target: theoreticalTarget })
  }

  return Object.freeze({
    eligible: true,
    target: Object.freeze({ ...theoreticalTarget, accidental })
  })
}
