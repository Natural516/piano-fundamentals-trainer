import type { MidiEventRecord } from '../types'

type MidiEventListener = (event: MidiEventRecord) => void

const listeners = new Set<MidiEventListener>()
let lastPublishedEventId = 0

/**
 * Per-event MIDI dispatch layer.
 *
 * The Web MIDI callback publishes every parsed record here synchronously.
 * Practice engines subscribe and process each event exactly once; React state
 * (recentEvents / latestEvent / activeNotes) stays reserved for display only.
 */
export function publishMidiEvent(event: MidiEventRecord): void {
  if (event.id > lastPublishedEventId) {
    lastPublishedEventId = event.id
  }

  const snapshot = Array.from(listeners)
  for (const listener of snapshot) {
    listener(event)
  }
}

export function subscribeMidiEvents(listener: MidiEventListener): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function getLastMidiEventId(): number {
  return lastPublishedEventId
}

export function resetMidiEventBusForTests(): void {
  listeners.clear()
  lastPublishedEventId = 0
}
