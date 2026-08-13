import type { MidiEventRecord } from '../types'
import { midiNumberToNoteName } from '../utils/midiNotes'

/**
 * Parses a raw Web MIDI message into the application's event record shape.
 * Kept pure so the Web MIDI entry chain is covered by automated tests.
 */
export function parseMidiMessage(
  data: Uint8Array | number[],
  deviceName: string,
  eventId: number,
  timestamp = Date.now()
): MidiEventRecord | null {
  const [statusByte, data1, data2 = 0] = Array.from(data)

  if (!Number.isFinite(statusByte) || !Number.isFinite(data1)) {
    return null
  }

  const command = statusByte & 0xf0

  if (command === 0x90 || command === 0x80) {
    const midiNumber = data1
    const velocity = data2
    const type = command === 0x90 && velocity > 0 ? 'noteOn' : 'noteOff'

    return {
      id: eventId,
      type,
      midiNumber,
      noteName: midiNumberToNoteName(midiNumber),
      velocity,
      timestamp,
      deviceName
    }
  }

  if (command === 0xb0 && data1 === 64) {
    const value = data2

    return {
      id: eventId,
      type: 'controlChange',
      controllerNumber: 64,
      controllerName: '延音踏板',
      value,
      sustainPedalDown: value >= 64,
      timestamp,
      deviceName
    }
  }

  return null
}
