import type { MidiEventRecord } from '../types'

export type InternalPianoMidiAction =
  | { type: 'noteOn'; midiNumber: number; velocity: number }
  | { type: 'noteOff'; midiNumber: number }
  | { type: 'sustain'; down: boolean }
  | { type: 'panic' }

export function getInternalPianoMidiAction(
  event: MidiEventRecord,
  enabled: boolean
): InternalPianoMidiAction | null {
  if (!enabled) return null

  if (event.type === 'noteOn' && typeof event.midiNumber === 'number') {
    const velocity = Math.min(127, Math.max(0, event.velocity ?? 0))
    return velocity > 0
      ? { type: 'noteOn', midiNumber: event.midiNumber, velocity }
      : { type: 'noteOff', midiNumber: event.midiNumber }
  }

  if (event.type === 'noteOff' && typeof event.midiNumber === 'number') {
    return { type: 'noteOff', midiNumber: event.midiNumber }
  }

  if (event.type === 'controlChange' && event.controllerNumber === 64) {
    return { type: 'sustain', down: Boolean(event.sustainPedalDown) }
  }

  if (event.type === 'controlChange' && (event.controllerNumber === 120 || event.controllerNumber === 123)) {
    return { type: 'panic' }
  }

  return null
}
