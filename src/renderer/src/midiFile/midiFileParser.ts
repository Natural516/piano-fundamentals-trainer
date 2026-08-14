export type SmfEventType = 'noteOn' | 'noteOff' | 'meta' | 'sysex'

export interface SmfEvent {
  type: SmfEventType
  absoluteTick: number
  trackIndex: number
  trackName: string
  channel: number | null
  midiNumber?: number
  velocity?: number
  metaType?: number
  text?: string
}

export interface SmfTrack {
  index: number
  name: string
  events: SmfEvent[]
}

export interface SmfDocument {
  format: 0 | 1 | 2
  division: number
  tracks: SmfTrack[]
  mergedEvents: SmfEvent[]
}

function readUint32(data: Uint8Array, offset: number): number {
  return (
    data[offset] * 0x1000000 +
    data[offset + 1] * 0x10000 +
    data[offset + 2] * 0x100 +
    data[offset + 3]
  )
}

function readUint16(data: Uint8Array, offset: number): number {
  return data[offset] * 0x100 + data[offset + 1]
}

function readVariableLength(data: Uint8Array, offset: number): { value: number; nextOffset: number } {
  let value = 0
  let cursor = offset
  let byte = 0

  do {
    byte = data[cursor]
    cursor += 1
    value = value * 128 + (byte & 0x7f)
  } while (byte & 0x80)

  return { value, nextOffset: cursor }
}

/**
 * Standard MIDI File (SMF) parser supporting Format 0/1/2 headers, multiple
 * MTrk chunks, per-track running status (reset on meta/sysex), noteOn
 * velocity=0 → noteOff, meta/sysex skipping, and stable tick-ordered merging.
 */
export function parseMidiFile(bytes: Uint8Array): SmfDocument {
  if (bytes.length < 14 || String.fromCharCode(...bytes.slice(0, 4)) !== 'MThd') {
    throw new Error('Invalid SMF: missing MThd header')
  }

  const headerLength = readUint32(bytes, 4)
  if (headerLength < 6) {
    throw new Error('Invalid SMF: header too short')
  }
  const format = readUint16(bytes, 8) as 0 | 1 | 2
  const trackCount = readUint16(bytes, 10)
  const division = readUint16(bytes, 12)
  let cursor = 14
  const tracks: SmfTrack[] = []

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    if (cursor + 8 > bytes.length || String.fromCharCode(...bytes.slice(cursor, cursor + 4)) !== 'MTrk') {
      throw new Error(`Invalid SMF: missing MTrk at track ${trackIndex}`)
    }
    const trackLength = readUint32(bytes, cursor + 4)
    const trackEnd = cursor + 8 + trackLength
    let position = cursor + 8
    let absoluteTick = 0
    let runningStatus: number | null = null
    let trackName = `Track ${trackIndex + 1}`
    const events: SmfEvent[] = []

    while (position < trackEnd) {
      const delta = readVariableLength(bytes, position)
      absoluteTick += delta.value
      position = delta.nextOffset

      let statusByte = bytes[position]
      position += 1

      if (statusByte < 0x80) {
        if (runningStatus === null) {
          throw new Error(`Invalid SMF: running status without previous status at tick ${absoluteTick}`)
        }
        statusByte = runningStatus
        position -= 1
      } else if (statusByte < 0xf0) {
        runningStatus = statusByte
      } else {
        runningStatus = null
      }

      const command = statusByte & 0xf0

      if (command === 0x80 || command === 0x90) {
        const midiNumber = bytes[position]
        const velocity = bytes[position + 1]
        position += 2
        const channel = statusByte & 0x0f
        const type = command === 0x90 && velocity > 0 ? 'noteOn' : 'noteOff'
        events.push({
          type,
          absoluteTick,
          trackIndex,
          trackName,
          channel,
          midiNumber,
          velocity
        })
        continue
      }

      if (command === 0xa0 || command === 0xb0 || command === 0xe0) {
        position += 2
        continue
      }

      if (command === 0xc0 || command === 0xd0) {
        position += 1
        continue
      }

      if (statusByte === 0xff) {
        const metaType = bytes[position]
        position += 1
        const length = readVariableLength(bytes, position)
        position = length.nextOffset
        const metaBytes = bytes.slice(position, position + length.value)
        position += length.value
        if (metaType === 0x03) {
          trackName = new TextDecoder().decode(metaBytes) || trackName
        }
        events.push({
          type: 'meta',
          absoluteTick,
          trackIndex,
          trackName,
          channel: null,
          metaType
        })
        continue
      }

      if (statusByte === 0xf0 || statusByte === 0xf7) {
        const length = readVariableLength(bytes, position)
        position = length.nextOffset + length.value
        events.push({
          type: 'sysex',
          absoluteTick,
          trackIndex,
          trackName,
          channel: null
        })
        continue
      }

      // System real-time / other: skip one byte.
      position += 1
    }

    tracks.push({ index: trackIndex, name: trackName, events })
    cursor = trackEnd
  }

  const mergedEvents = tracks
    .flatMap((track) => track.events)
    .sort((left, right) => left.absoluteTick - right.absoluteTick || left.trackIndex - right.trackIndex)

  return { format, division, tracks, mergedEvents }
}
