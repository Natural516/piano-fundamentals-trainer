export const MIDI_LOWEST_NOTE = 21
export const MIDI_HIGHEST_NOTE = 108

export const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export interface PianoKey {
  midiNumber: number
  noteName: string
  pitchClass: string
  octave: number
  isBlack: boolean
}

export function midiNumberToNoteName(midiNumber: number): string {
  if (!Number.isFinite(midiNumber)) {
    return '未知音符'
  }

  const pitchClass = NOTE_NAMES_SHARP[((midiNumber % 12) + 12) % 12]
  const octave = Math.floor(midiNumber / 12) - 1

  return `${pitchClass}${octave}`
}

export function isBlackMidiKey(midiNumber: number): boolean {
  return midiNumberToNoteName(midiNumber).includes('#')
}

export function getPianoKeyRange(
  startMidiNumber = MIDI_LOWEST_NOTE,
  endMidiNumber = MIDI_HIGHEST_NOTE
): PianoKey[] {
  const keys: PianoKey[] = []

  for (let midiNumber = startMidiNumber; midiNumber <= endMidiNumber; midiNumber += 1) {
    const noteName = midiNumberToNoteName(midiNumber)
    const pitchClass = NOTE_NAMES_SHARP[((midiNumber % 12) + 12) % 12]
    const octave = Math.floor(midiNumber / 12) - 1

    keys.push({
      midiNumber,
      noteName,
      pitchClass,
      octave,
      isBlack: pitchClass.includes('#')
    })
  }

  return keys
}
