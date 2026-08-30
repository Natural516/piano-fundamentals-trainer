/** Timestamps and Clock.now() must use the same time origin and milliseconds.
 * The input adapter owns a monotonically increasing id across reconnects.
 * Equal timestamps are not duplicates; identity is the event id.
 */
export interface SightReadingMidiEvent {
  id: number
  type: 'noteOn' | 'noteOff' | 'controlChange'
  timestamp: number
  midiNumber?: number
  velocity?: number
  /** Optional desktop display enrichment; never used for pitch judgement. */
  noteName?: string
}

export function normalizeSightReadingMidiEvent(event: SightReadingMidiEvent): SightReadingMidiEvent {
  return event.type === 'noteOn' && event.velocity === 0
    ? { ...event, type: 'noteOff' }
    : event
}
