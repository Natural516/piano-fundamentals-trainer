import {
  MIDI_HIGHEST_NOTE,
  MIDI_LOWEST_NOTE,
  getPianoKeyRange,
  type PianoKey
} from './midiNotes'

export type VirtualPianoRange = readonly [startMidiNumber: number, endMidiNumber: number]

export interface VirtualPianoBlackKey extends PianoKey {
  leftPercent: number
  whiteKeysBefore: number
}

export interface VirtualPianoLayout {
  range: VirtualPianoRange
  keys: readonly PianoKey[]
  whiteKeys: readonly PianoKey[]
  blackKeys: readonly VirtualPianoBlackKey[]
}

function clampMidiNumber(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(MIDI_HIGHEST_NOTE, Math.max(MIDI_LOWEST_NOTE, Math.round(value)))
}

export function createVirtualPianoLayout(
  range: VirtualPianoRange = [MIDI_LOWEST_NOTE, MIDI_HIGHEST_NOTE]
): VirtualPianoLayout {
  const first = clampMidiNumber(range[0], MIDI_LOWEST_NOTE)
  const second = clampMidiNumber(range[1], MIDI_HIGHEST_NOTE)
  const startMidiNumber = Math.min(first, second)
  const endMidiNumber = Math.max(first, second)
  const keys = getPianoKeyRange(startMidiNumber, endMidiNumber)
  const whiteKeys = keys.filter((key) => !key.isBlack)
  const blackKeys = keys
    .filter((key) => key.isBlack)
    .map((key) => {
      const whiteKeysBefore = keys.filter(
        (candidate) => candidate.midiNumber < key.midiNumber && !candidate.isBlack
      ).length
      return {
        ...key,
        whiteKeysBefore,
        leftPercent: (whiteKeysBefore / whiteKeys.length) * 100
      }
    })

  return {
    range: [startMidiNumber, endMidiNumber],
    keys,
    whiteKeys,
    blackKeys
  }
}
