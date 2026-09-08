import { getChordQuality, NATURAL_PITCH_CLASS } from './catalog'
import { invertChordTones, spellChord, writtenPitchToMidi } from './spelling'
import type { ChordQualityId, ClosePositionPlacement, RegisterWindow, WrittenPitch, WrittenPitchClass } from './types'

export function createClosePositionPlacement(
  root: WrittenPitchClass,
  qualityId: ChordQualityId,
  inversion: number,
  rootOctave: number
): ClosePositionPlacement {
  if (!Number.isInteger(rootOctave)) throw new RangeError('Root octave must be an integer')
  const chord = spellChord(root, qualityId)
  const inverted = invertChordTones(chord.tones, inversion)
  const writtenPitches = inverted.map((tone): WrittenPitch => {
    const octave = rootOctave + tone.octaveOffset
    const soundingMidi = writtenPitchToMidi({ letter: tone.letter, accidental: tone.accidental, octave })
    return Object.freeze({ letter: tone.letter, accidental: tone.accidental, octave, soundingMidi })
  })
  const soundingMidiNumbers = writtenPitches.map((pitch) => pitch.soundingMidi)
  for (let index = 1; index < soundingMidiNumbers.length; index += 1) {
    if (soundingMidiNumbers[index] <= soundingMidiNumbers[index - 1]) {
      throw new Error('Close-position MIDI pitches must be strictly ascending')
    }
  }
  return Object.freeze({
    root: Object.freeze({ ...root }),
    qualityId,
    inversion,
    rootOctave,
    writtenPitches: Object.freeze(writtenPitches),
    soundingMidiNumbers: Object.freeze(soundingMidiNumbers),
    lowestMidi: soundingMidiNumbers[0],
    highestMidi: soundingMidiNumbers[soundingMidiNumbers.length - 1]
  })
}

export function enumerateClosePositionPlacements(
  root: WrittenPitchClass,
  qualityId: ChordQualityId,
  inversion: number,
  window: RegisterWindow
): readonly ClosePositionPlacement[] {
  if (!Number.isInteger(window.minMidi) || !Number.isInteger(window.maxMidi) || window.minMidi > window.maxMidi) {
    throw new RangeError('Register window must contain ordered integer MIDI bounds')
  }
  const toneCount = getChordQuality(qualityId).semitones.length
  if (!Number.isInteger(inversion) || inversion < 0 || inversion >= toneCount) {
    throw new RangeError(`Inversion ${inversion} is outside 0..${toneCount - 1}`)
  }
  const semitones = getChordQuality(qualityId).semitones
  const relativeSoundingMidi = [
    ...semitones.slice(inversion),
    ...semitones.slice(0, inversion).map((value) => value + 12)
  ]
  const rootPitchOffset = NATURAL_PITCH_CLASS[root.letter] + root.accidental
  const minimumRootMidi = window.minMidi - relativeSoundingMidi[0]
  const maximumRootMidi = window.maxMidi - relativeSoundingMidi[relativeSoundingMidi.length - 1]
  const minimumRootOctave = Math.ceil((minimumRootMidi - rootPitchOffset) / 12) - 1
  const maximumRootOctave = Math.floor((maximumRootMidi - rootPitchOffset) / 12) - 1
  const placements: ClosePositionPlacement[] = []
  for (let rootOctave = minimumRootOctave; rootOctave <= maximumRootOctave; rootOctave += 1) {
    const placement = createClosePositionPlacement(root, qualityId, inversion, rootOctave)
    if (placement.lowestMidi >= window.minMidi && placement.highestMidi <= window.maxMidi) {
      placements.push(placement)
    }
  }
  placements.sort((left, right) => left.lowestMidi - right.lowestMidi || left.highestMidi - right.highestMidi)
  return Object.freeze(placements)
}
