import { useEffect, useRef } from 'react'
import type { MidiEventRecord } from '../types'
import {
  getLastMidiEventId,
  subscribeMidiPanic,
  subscribeMidiEvents,
  type MidiPanicEvent,
  type MidiEventPriority
} from '../midi/midiEventBus'

/**
 * Subscribes a stable handler to the per-event MIDI dispatch layer.
 *
 * - Events published before this subscription are never replayed (baseline).
 * - The listener is removed on unmount and on StrictMode effect re-run.
 * - The handler is always the latest closure via a ref, so the hook never
 *   re-subscribes across renders.
 */
export function useMidiEventSubscription(
  handler: (event: MidiEventRecord) => void,
  priority: MidiEventPriority = 'normal'
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const baselineId = getLastMidiEventId()
    const listener = (event: MidiEventRecord): void => {
      if (event.id <= baselineId) {
        return
      }

      handlerRef.current(event)
    }

    return subscribeMidiEvents(listener, priority)
  }, [priority])
}

export function useMidiPanicSubscription(handler: (event: MidiPanicEvent) => void): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => subscribeMidiPanic((event) => handlerRef.current(event)), [])
}
