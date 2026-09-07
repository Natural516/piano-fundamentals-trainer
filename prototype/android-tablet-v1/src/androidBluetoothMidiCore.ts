import {
  normalizeSightReadingMidiEvent,
  type SightReadingMidiEvent
} from '../../../src/sightReading/midi'
import type { Clock } from '../../../src/sightReading/controller'

export type AndroidMidiInputSource = 'bluetooth' | 'development'

export interface ParsedMidiMessage {
  status: number
  channel: number
  data1: number
  data2?: number
}

export interface RoutedMidiPayload {
  type: SightReadingMidiEvent['type']
  midiNumber?: number
  velocity?: number
  channel: number
  status: number
  controllerNumber?: number
  controllerValue?: number
}

/**
 * Android MidiReceiver.onSend() is a byte-stream callback, not a promise that
 * each invocation contains exactly one three-byte message. This parser keeps
 * running status and partial messages across callbacks and emits only complete
 * MIDI 1.0 channel messages.
 */
export class AndroidMidiByteStreamParser {
  private runningStatus: number | null = null
  private pendingStatus: number | null = null
  private pendingData: number[] = []
  private inSystemExclusive = false

  reset(): void {
    this.runningStatus = null
    this.pendingStatus = null
    this.pendingData = []
    this.inSystemExclusive = false
  }

  push(bytes: readonly number[]): ParsedMidiMessage[] {
    const messages: ParsedMidiMessage[] = []

    for (const rawByte of bytes) {
      const byte = rawByte & 0xff

      // System real-time bytes may be interleaved anywhere and do not cancel
      // running status. Sight Reading does not consume them.
      if (byte >= 0xf8) continue

      if (this.inSystemExclusive) {
        if (byte === 0xf7) this.inSystemExclusive = false
        continue
      }

      if (byte >= 0x80) {
        if (byte === 0xf0) {
          this.inSystemExclusive = true
          this.runningStatus = null
          this.pendingStatus = null
          this.pendingData = []
          continue
        }

        if (byte >= 0xf0) {
          this.runningStatus = null
          this.pendingStatus = null
          this.pendingData = []
          continue
        }

        this.runningStatus = byte
        this.pendingStatus = byte
        this.pendingData = []
        continue
      }

      const status = this.pendingStatus ?? this.runningStatus
      if (status === null) continue

      this.pendingStatus = status
      this.pendingData.push(byte)
      const needed = messageDataLength(status)
      if (this.pendingData.length < needed) continue

      messages.push({
        status,
        channel: status & 0x0f,
        data1: this.pendingData[0],
        ...(needed === 2 ? { data2: this.pendingData[1] } : {})
      })
      this.pendingData = []
      this.pendingStatus = this.runningStatus
    }

    return messages
  }
}

function messageDataLength(status: number): 1 | 2 {
  const command = status & 0xf0
  return command === 0xc0 || command === 0xd0 ? 1 : 2
}

export function toSightReadingMidiPayload(message: ParsedMidiMessage): RoutedMidiPayload | null {
  const command = message.status & 0xf0
  if (command === 0x80) {
    return {
      type: 'noteOff',
      midiNumber: message.data1,
      velocity: message.data2 ?? 0,
      channel: message.channel,
      status: message.status
    }
  }
  if (command === 0x90) {
    return {
      type: 'noteOn',
      midiNumber: message.data1,
      velocity: message.data2 ?? 0,
      channel: message.channel,
      status: message.status
    }
  }
  if (command === 0xb0) {
    return {
      type: 'controlChange',
      midiNumber: message.data1,
      velocity: message.data2 ?? 0,
      channel: message.channel,
      status: message.status,
      controllerNumber: message.data1,
      controllerValue: message.data2 ?? 0
    }
  }
  return null
}

/**
 * One process-wide event-id sequence and one explicit active source prevent
 * the real and development adapters from judging the same question together.
 */
export class AndroidMidiInputRouter {
  private eventId = 0
  private activeSourceValue: AndroidMidiInputSource
  private lastAcceptedEventValue: SightReadingMidiEvent | null = null

  constructor(
    private readonly clock: Clock,
    private readonly sink: (event: SightReadingMidiEvent) => void,
    initialSource: AndroidMidiInputSource
  ) {
    this.activeSourceValue = initialSource
  }

  get activeSource(): AndroidMidiInputSource {
    return this.activeSourceValue
  }

  get lastAcceptedEvent(): SightReadingMidiEvent | null {
    return this.lastAcceptedEventValue ? { ...this.lastAcceptedEventValue } : null
  }

  readWatermark = (): number => this.eventId

  setActiveSource(source: AndroidMidiInputSource): boolean {
    if (source === this.activeSourceValue) return false
    this.activeSourceValue = source
    // Source changes are lifecycle boundaries. Advancing the watermark makes
    // every event from the previous source stale without manufacturing input.
    this.eventId += 1
    this.lastAcceptedEventValue = null
    return true
  }

  advanceWatermark(): number {
    this.lastAcceptedEventValue = null
    return ++this.eventId
  }

  emit(source: AndroidMidiInputSource, payload: RoutedMidiPayload): SightReadingMidiEvent | null {
    if (source !== this.activeSourceValue) return null
    const event = normalizeSightReadingMidiEvent({
      id: ++this.eventId,
      type: payload.type,
      timestamp: this.clock.now(),
      midiNumber: payload.midiNumber,
      velocity: payload.velocity
    })
    this.lastAcceptedEventValue = event
    this.sink(event)
    return event
  }
}
