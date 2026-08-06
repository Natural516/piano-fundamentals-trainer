import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ActiveMidiNote,
  MidiEventRecord,
  MidiEventType,
  MidiInputDevice,
  MidiPermissionStatus,
  MidiSidebarStatus
} from '../types'
import { midiNumberToNoteName } from '../utils/midiNotes'

interface MidiMessageEventLike {
  data: Uint8Array | number[]
}

type MidiMessageHandler = (event: MidiMessageEventLike) => void

interface MidiInputLike {
  id: string
  name: string | null
  manufacturer: string | null
  state: string
  connection: string
  onmidimessage: MidiMessageHandler | null
}

interface MidiAccessLike {
  inputs: {
    values: () => IterableIterator<MidiInputLike>
  }
  onstatechange: (() => void) | null
}

type RequestMidiAccess = (options?: { sysex?: boolean }) => Promise<MidiAccessLike>

export interface UseMidiResult {
  isSupported: boolean
  permissionStatus: MidiPermissionStatus
  permissionLabel: string
  inputs: MidiInputDevice[]
  selectedInputId: string
  selectedInput: MidiInputDevice | null
  activeNotes: ActiveMidiNote[]
  recentEvents: MidiEventRecord[]
  latestEvent: MidiEventRecord | null
  errorMessage: string
  sidebarStatus: MidiSidebarStatus
  refreshDevices: () => Promise<void>
  selectInput: (inputId: string) => void
}

function getRequestMidiAccess(): RequestMidiAccess | null {
  if (typeof navigator === 'undefined') {
    return null
  }

  const maybeNavigator = navigator as Navigator & {
    requestMIDIAccess?: RequestMidiAccess
  }

  return maybeNavigator.requestMIDIAccess?.bind(navigator) ?? null
}

function toDevice(input: MidiInputLike): MidiInputDevice {
  return {
    id: input.id,
    name: input.name || input.manufacturer || '未命名 MIDI 设备',
    manufacturer: input.manufacturer || '',
    state: input.state || 'unknown',
    connection: input.connection || 'unknown'
  }
}

function getPermissionLabel(status: MidiPermissionStatus): string {
  const labels: Record<MidiPermissionStatus, string> = {
    unknown: '未知',
    prompt: '等待授权',
    granted: '已授权',
    denied: '未授予',
    unsupported: '不支持',
    error: '初始化失败'
  }

  return labels[status]
}

function createSidebarStatus(
  permissionStatus: MidiPermissionStatus,
  inputs: MidiInputDevice[],
  selectedInput: MidiInputDevice | null
): MidiSidebarStatus {
  if (selectedInput) {
    return {
      connectionState: 'connected',
      statusLabel: '已连接',
      deviceName: selectedInput.name
    }
  }

  if (inputs.length > 0) {
    return {
      connectionState: 'pending',
      statusLabel: '待选择',
      deviceName: inputs[0]?.name || '请选择 MIDI 输入设备'
    }
  }

  if (permissionStatus === 'denied') {
    return {
      connectionState: 'disconnected',
      statusLabel: '未连接',
      deviceName: 'MIDI 权限未授予'
    }
  }

  if (permissionStatus === 'unsupported') {
    return {
      connectionState: 'disconnected',
      statusLabel: '未连接',
      deviceName: 'Web MIDI 不支持'
    }
  }

  return {
    connectionState: 'disconnected',
    statusLabel: '未连接',
    deviceName: '未检测到 MIDI 设备'
  }
}

export function useMidi(): UseMidiResult {
  const midiAccessRef = useRef<MidiAccessLike | null>(null)
  const eventSequenceRef = useRef(0)
  const [isSupported, setIsSupported] = useState(() => getRequestMidiAccess() !== null)
  const [permissionStatus, setPermissionStatus] = useState<MidiPermissionStatus>('unknown')
  const [inputs, setInputs] = useState<MidiInputDevice[]>([])
  const [selectedInputId, setSelectedInputId] = useState('')
  const [activeNotes, setActiveNotes] = useState<ActiveMidiNote[]>([])
  const [recentEvents, setRecentEvents] = useState<MidiEventRecord[]>([])
  const [errorMessage, setErrorMessage] = useState('')

  const selectedInput = useMemo(
    () => inputs.find((input) => input.id === selectedInputId) ?? null,
    [inputs, selectedInputId]
  )

  const latestEvent = recentEvents[0] ?? null

  const syncInputs = useCallback((access: MidiAccessLike) => {
    const availableInputs = Array.from(access.inputs.values())
      .filter((input) => input.state !== 'disconnected')
      .map(toDevice)

    setInputs(availableInputs)
    setSelectedInputId((currentInputId) => {
      if (!currentInputId) {
        return ''
      }

      if (availableInputs.some((input) => input.id === currentInputId)) {
        return currentInputId
      }

      setActiveNotes([])
      return ''
    })
  }, [])

  const queryPermissionState = useCallback(async () => {
    if (typeof navigator === 'undefined') {
      return
    }

    const maybeNavigator = navigator as Navigator & {
      permissions?: {
        query?: (descriptor: Record<string, unknown>) => Promise<{ state: PermissionState }>
      }
    }

    try {
      const permission = await maybeNavigator.permissions?.query?.({ name: 'midi', sysex: false })

      if (permission?.state === 'granted' || permission?.state === 'denied' || permission?.state === 'prompt') {
        setPermissionStatus(permission.state)
      }
    } catch {
      // Some Chromium versions expose Web MIDI but do not expose a queryable MIDI permission.
    }
  }, [])

  const refreshDevices = useCallback(async () => {
    const requestMidiAccess = getRequestMidiAccess()

    if (!requestMidiAccess) {
      setIsSupported(false)
      setPermissionStatus('unsupported')
      setInputs([])
      setSelectedInputId('')
      setActiveNotes([])
      setErrorMessage('当前环境不支持 Web MIDI API，请使用支持 MIDI 的 Chromium / Electron 环境。')
      return
    }

    setIsSupported(true)
    setErrorMessage('')

    try {
      setPermissionStatus((current) => (current === 'granted' ? current : 'prompt'))
      const access = await requestMidiAccess({ sysex: false })

      midiAccessRef.current = access
      access.onstatechange = () => syncInputs(access)

      setPermissionStatus('granted')
      syncInputs(access)
    } catch (error) {
      const errorName = error instanceof Error ? error.name : ''
      const denied = errorName === 'SecurityError' || errorName === 'NotAllowedError'

      setPermissionStatus(denied ? 'denied' : 'error')
      setInputs([])
      setSelectedInputId('')
      setActiveNotes([])
      setErrorMessage(
        denied
          ? 'MIDI 权限未授予，请允许软件访问 MIDI 设备后重试。'
          : 'MIDI 初始化失败，请检查设备连接后重试。'
      )
    }
  }, [syncInputs])

  const handleMidiMessage = useCallback((event: MidiMessageEventLike, input: MidiInputLike) => {
    const [statusByte, data1, data2 = 0] = Array.from(event.data)

    if (!Number.isFinite(statusByte) || !Number.isFinite(data1)) {
      return
    }

    const command = statusByte & 0xf0
    const deviceName = input.name || input.manufacturer || '未命名 MIDI 设备'
    const eventId = ++eventSequenceRef.current
    let record: MidiEventRecord | null = null

    if (command === 0x90 || command === 0x80) {
      const midiNumber = data1
      const velocity = data2
      const eventType: MidiEventType = command === 0x90 && velocity > 0 ? 'noteOn' : 'noteOff'
      const noteName = midiNumberToNoteName(midiNumber)

      record = {
        id: eventId,
        type: eventType,
        midiNumber,
        noteName,
        velocity,
        timestamp: Date.now(),
        deviceName
      }
    } else if (command === 0xb0 && data1 === 64) {
      const value = data2
      const sustainPedalDown = value >= 64

      record = {
        id: eventId,
        type: 'controlChange',
        controllerNumber: 64,
        controllerName: '延音踏板',
        value,
        sustainPedalDown,
        timestamp: Date.now(),
        deviceName
      }
    }

    if (!record) {
      return
    }

    setRecentEvents((currentEvents) => [record, ...currentEvents].slice(0, 20))

    if (record.type === 'controlChange') {
      return
    }

    setActiveNotes((currentNotes) => {
      const nextNotes = new Map(currentNotes.map((note) => [note.midiNumber, note]))
      const midiNumber = record.midiNumber

      if (typeof midiNumber !== 'number') {
        return currentNotes
      }

      if (record.type === 'noteOn') {
        nextNotes.set(midiNumber, {
          midiNumber,
          noteName: record.noteName || midiNumberToNoteName(midiNumber),
          velocity: record.velocity ?? 0,
          timestamp: record.timestamp,
          deviceName
        })
      } else {
        nextNotes.delete(midiNumber)
      }

      return Array.from(nextNotes.values()).sort((a, b) => a.midiNumber - b.midiNumber)
    })
  }, [])

  const selectInput = useCallback((inputId: string) => {
    setSelectedInputId(inputId)
    setActiveNotes([])
  }, [])

  useEffect(() => {
    void (async () => {
      await queryPermissionState()
      await refreshDevices()
    })()

    return () => {
      if (midiAccessRef.current) {
        midiAccessRef.current.onstatechange = null
      }
    }
  }, [queryPermissionState, refreshDevices])

  useEffect(() => {
    const access = midiAccessRef.current

    if (!access || !selectedInputId) {
      return
    }

    const input = Array.from(access.inputs.values()).find((midiInput) => midiInput.id === selectedInputId)

    if (!input || input.state === 'disconnected') {
      setActiveNotes([])
      return
    }

    const listener: MidiMessageHandler = (event) => handleMidiMessage(event, input)
    input.onmidimessage = listener

    return () => {
      if (input.onmidimessage === listener) {
        input.onmidimessage = null
      }
    }
  }, [handleMidiMessage, inputs, selectedInputId])

  return {
    isSupported,
    permissionStatus,
    permissionLabel: getPermissionLabel(permissionStatus),
    inputs,
    selectedInputId,
    selectedInput,
    activeNotes,
    recentEvents,
    latestEvent,
    errorMessage,
    sidebarStatus: createSidebarStatus(permissionStatus, inputs, selectedInput),
    refreshDevices,
    selectInput
  }
}
