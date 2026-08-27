import { createConnection, type Socket } from 'node:net'
import { performance as nodePerformance } from 'node:perf_hooks'

const PACKET_BYTES = 40
const PACKET_MAGIC = 0x43335046
const PROTOCOL_VERSION = 1
const PACKET_TYPE_NOTE_ON = 1
const PACKET_TYPE_REPORT = 2
const PACKET_TYPE_SHUTDOWN = 3
const PACKET_POOL_SIZE = 4096
const UINT32_RANGE = 0x1_0000_0000

interface PacketSlot {
  buffer: Buffer
  busy: boolean
  release: () => void
}

export interface NativeAudioPocBridgeStatus {
  enabled: boolean
  connected: boolean
  sentEvents: number
  droppedEvents: number
  queueBackpressure: number
  reconnects: number
}

export interface NativeAudioPocBridge {
  enabled: boolean
  noteOn: (eventId: number, midiNumber: number, velocity: number, webMidiReceivedAtMs: number) => void
  requestReport: () => void
  status: () => NativeAudioPocBridgeStatus
  close: () => void
}

export function createNativeAudioPocBridge(): NativeAudioPocBridge {
  const pipePath = process.env.PIANO_NATIVE_AUDIO_POC_PIPE ?? ''
  const enabled = process.platform === 'win32'
    && process.env.PIANO_NATIVE_AUDIO_POC === '1'
    && pipePath.length > 0
  const slots: PacketSlot[] = Array.from({ length: PACKET_POOL_SIZE }, () => {
    const slot: PacketSlot = {
      buffer: Buffer.allocUnsafe(PACKET_BYTES),
      busy: false,
      release: () => { slot.busy = false }
    }
    return slot
  })
  let socket: Socket | null = null
  let connected = false
  let closed = false
  let nextSlot = 0
  let reconnectTimer: NodeJS.Timeout | null = null
  let sentEvents = 0
  let droppedEvents = 0
  let queueBackpressure = 0
  let reconnects = 0
  const qpcBaseNs = enabled ? Number(process.hrtime.bigint()) : 0
  const qpcBasePerformanceMs = nodePerformance.now()

  const scheduleReconnect = (): void => {
    if (!enabled || closed || reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, 250)
  }

  const connect = (): void => {
    if (!enabled || closed || connected || socket || !pipePath) return
    const candidate = createConnection(pipePath)
    socket = candidate
    candidate.once('connect', () => {
      connected = true
      reconnects += 1
    })
    candidate.on('error', () => candidate.destroy())
    candidate.once('close', () => {
      if (socket === candidate) socket = null
      connected = false
      scheduleReconnect()
    })
  }

  const acquireSlot = (): PacketSlot | null => {
    for (let offset = 0; offset < slots.length; offset += 1) {
      const index = (nextSlot + offset) % slots.length
      const slot = slots[index]
      if (slot.busy) continue
      slot.busy = true
      nextSlot = (index + 1) % slots.length
      return slot
    }
    return null
  }

  const writePacket = (
    type: number,
    eventId: number,
    midiNumber: number,
    velocity: number,
    webMidiToPipeWriteNs: number,
    pipeWriteQpcNs: number
  ): boolean => {
    if (!connected || !socket) return false
    const slot = acquireSlot()
    if (!slot) {
      queueBackpressure += 1
      return false
    }

    const packet = slot.buffer
    packet.writeUInt32LE(PACKET_MAGIC, 0)
    packet.writeUInt16LE(PROTOCOL_VERSION, 4)
    packet.writeUInt16LE(type, 6)
    packet.writeUInt32LE(eventId >>> 0, 8)
    packet.writeUInt32LE(Math.floor(eventId / UINT32_RANGE) >>> 0, 12)
    packet.writeDoubleLE(webMidiToPipeWriteNs, 16)
    packet.writeDoubleLE(pipeWriteQpcNs, 24)
    packet.writeUInt8(midiNumber & 0x7f, 32)
    packet.writeUInt8(velocity & 0x7f, 33)
    packet.fill(0, 34, PACKET_BYTES)

    try {
      socket.write(packet, slot.release)
      return true
    } catch {
      slot.release()
      return false
    }
  }

  if (enabled) connect()

  return {
    enabled,
    noteOn: (eventId, midiNumber, velocity, webMidiReceivedAtMs) => {
      const pipeWriteAtMs = performance.now()
      const webMidiToPipeWriteNs = Math.max(
        0,
        Math.round((pipeWriteAtMs - webMidiReceivedAtMs) * 1_000_000)
      )
      const pipeWriteQpcNs = qpcBaseNs
        + (nodePerformance.now() - qpcBasePerformanceMs) * 1_000_000
      if (writePacket(
        PACKET_TYPE_NOTE_ON,
        eventId,
        midiNumber,
        velocity,
        webMidiToPipeWriteNs,
        pipeWriteQpcNs
      )) {
        sentEvents += 1
      } else {
        droppedEvents += 1
      }
    },
    requestReport: () => {
      const now = nodePerformance.now()
      void writePacket(
        PACKET_TYPE_REPORT,
        0,
        0,
        0,
        0,
        qpcBaseNs + (now - qpcBasePerformanceMs) * 1_000_000
      )
    },
    status: () => ({
      enabled,
      connected,
      sentEvents,
      droppedEvents,
      queueBackpressure,
      reconnects
    }),
    close: () => {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = null
      if (connected) {
      const now = nodePerformance.now()
        void writePacket(
          PACKET_TYPE_SHUTDOWN,
          0,
          0,
          0,
          0,
          qpcBaseNs + (now - qpcBasePerformanceMs) * 1_000_000
        )
      }
      socket?.destroy()
      socket = null
      connected = false
    }
  }
}
