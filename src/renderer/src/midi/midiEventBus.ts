import type { MidiEventRecord } from '../types'

type MidiEventListener = (event: MidiEventRecord) => void
export type MidiPanicReason =
  | 'device-disconnected'
  | 'device-changed'
  | 'device-reconnected'
  | 'system-suspend'
  | 'system-resume'
  | 'midi-error'
  | 'manual'

export interface MidiPanicEvent {
  sequence: number
  reason: MidiPanicReason
  timestamp: number
}

type MidiPanicListener = (event: MidiPanicEvent) => void
export type MidiEventPriority = 'audio' | 'normal'

const listeners = new Set<MidiEventListener>()
const audioListeners = new Set<MidiEventListener>()
const panicListeners = new Set<MidiPanicListener>()
let lastPublishedEventId = 0
let panicSequence = 0

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

  const audioSnapshot = Array.from(audioListeners)
  for (const listener of audioSnapshot) {
    listener(event)
  }

  const normalSnapshot = Array.from(listeners)
  for (const listener of normalSnapshot) {
    listener(event)
  }
}

export function subscribeMidiEvents(
  listener: MidiEventListener,
  priority: MidiEventPriority = 'normal'
): () => void {
  const target = priority === 'audio' ? audioListeners : listeners
  target.add(listener)

  return () => {
    target.delete(listener)
  }
}

export function getLastMidiEventId(): number {
  return lastPublishedEventId
}

/**
 * Synchronous transient-input reset. It never creates a MIDI event or a
 * practice fact; consumers clear held keys, sustain and partial chord state.
 */
export function publishMidiPanic(reason: MidiPanicReason): MidiPanicEvent {
  const event = {
    sequence: ++panicSequence,
    reason,
    timestamp: Date.now()
  }
  for (const listener of Array.from(panicListeners)) listener(event)
  return event
}

export function subscribeMidiPanic(listener: MidiPanicListener): () => void {
  panicListeners.add(listener)
  return () => panicListeners.delete(listener)
}

export function resetMidiEventBusForTests(): void {
  listeners.clear()
  audioListeners.clear()
  panicListeners.clear()
  lastPublishedEventId = 0
  panicSequence = 0
}
