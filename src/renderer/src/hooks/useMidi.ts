import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ActiveMidiNote,
  MidiEventRecord,
  MidiInputDevice,
  MidiPermissionStatus,
  MidiSidebarStatus
} from '../types'
import {
  createMidiDeviceIdentity,
  getBoundMidiLifecycleState,
  readMidiDevicePreference,
  resolveMidiInput,
  shouldAcceptMidiInputEvent,
  writeMidiDevicePreference,
  type MidiDeviceIdentity,
  type MidiDeviceLifecycleState
} from '../midi/midiDeviceLifecycle'
import { publishMidiEvent, publishMidiPanic, type MidiPanicReason } from '../midi/midiEventBus'
import { midiRecoveryDiagnostics } from '../midi/midiRecoveryDiagnostics'
import { parseMidiMessage } from '../midi/midiMessages'
import { pianoLatencyDiagnostics } from '../audio/pianoLatencyDiagnostics'
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
type SyncReason = 'startup' | 'state-change' | 'manual-refresh' | 'system-resume'

export interface UseMidiResult {
  isSupported: boolean
  permissionStatus: MidiPermissionStatus
  permissionLabel: string
  inputs: MidiInputDevice[]
  selectedInputId: string
  selectedInput: MidiInputDevice | null
  lifecycleState: MidiDeviceLifecycleState
  activeNotes: ActiveMidiNote[]
  sustainPedalDown: boolean
  recentEvents: MidiEventRecord[]
  latestEvent: MidiEventRecord | null
  errorMessage: string
  sidebarStatus: MidiSidebarStatus
  refreshDevices: () => Promise<void>
  selectInput: (inputId: string) => void
  panic: () => void
}

function getRequestMidiAccess(): RequestMidiAccess | null {
  if (typeof navigator === 'undefined') return null
  const maybeNavigator = navigator as Navigator & { requestMIDIAccess?: RequestMidiAccess }
  return maybeNavigator.requestMIDIAccess?.bind(navigator) ?? null
}

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
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
  selectedInput: MidiInputDevice | null,
  lifecycleState: MidiDeviceLifecycleState
): MidiSidebarStatus {
  if (lifecycleState === 'CONNECTED' && selectedInput) {
    return { connectionState: 'connected', statusLabel: '已连接', deviceName: selectedInput.name }
  }
  if (lifecycleState === 'RECONNECTING') {
    return { connectionState: 'pending', statusLabel: '正在重连', deviceName: '等待原 MIDI 设备恢复' }
  }
  if (lifecycleState === 'CONNECTING' || lifecycleState === 'DETECTED') {
    return { connectionState: 'pending', statusLabel: '正在连接', deviceName: selectedInput?.name ?? '正在确认 MIDI 输入' }
  }
  if (lifecycleState === 'NEEDS_SELECTION' || inputs.length > 0) {
    return { connectionState: 'pending', statusLabel: '待选择', deviceName: '请选择 MIDI 输入设备' }
  }
  if (permissionStatus === 'denied') {
    return { connectionState: 'disconnected', statusLabel: '未连接', deviceName: 'MIDI 权限未授予' }
  }
  if (permissionStatus === 'unsupported') {
    return { connectionState: 'disconnected', statusLabel: '未连接', deviceName: 'Web MIDI 不支持' }
  }
  if (lifecycleState === 'ERROR') {
    return { connectionState: 'disconnected', statusLabel: '连接错误', deviceName: '请检查 MIDI 设备后重试' }
  }
  return { connectionState: 'disconnected', statusLabel: '未连接', deviceName: '未检测到 MIDI 设备' }
}

export function useMidi(): UseMidiResult {
  const midiAccessRef = useRef<MidiAccessLike | null>(null)
  const eventSequenceRef = useRef(0)
  const accessRequestGenerationRef = useRef(0)
  const selectedInputIdRef = useRef('')
  const preferredIdentityRef = useRef<MidiDeviceIdentity | null>(readMidiDevicePreference(getStorage()))
  const activeBindingRef = useRef<{ input: MidiInputLike; listener: MidiMessageHandler } | null>(null)
  const listenerGenerationRef = useRef(0)
  const hasConnectedRef = useRef(false)
  const reconnectPendingRef = useRef(false)
  const suspendedRef = useRef(false)
  const heldNotesRef = useRef(new Set<number>())
  const sustainPedalDownRef = useRef(false)
  const syncInputsRef = useRef<(access: MidiAccessLike, reason: SyncReason) => void>(() => undefined)

  const [isSupported, setIsSupported] = useState(() => getRequestMidiAccess() !== null)
  const [permissionStatus, setPermissionStatus] = useState<MidiPermissionStatus>('unknown')
  const [inputs, setInputs] = useState<MidiInputDevice[]>([])
  const [midiAccessVersion, setMidiAccessVersion] = useState(0)
  const [selectedInputId, setSelectedInputIdState] = useState('')
  const [lifecycleState, setLifecycleState] = useState<MidiDeviceLifecycleState>('CONNECTING')
  const [activeNotes, setActiveNotes] = useState<ActiveMidiNote[]>([])
  const [sustainPedalDown, setSustainPedalDown] = useState(false)
  const [recentEvents, setRecentEvents] = useState<MidiEventRecord[]>([])
  const [errorMessage, setErrorMessage] = useState('')

  const setSelectedInputId = useCallback((inputId: string) => {
    selectedInputIdRef.current = inputId
    setSelectedInputIdState(inputId)
  }, [])

  const selectedInput = useMemo(
    () => inputs.find((input) => input.id === selectedInputId) ?? null,
    [inputs, selectedInputId]
  )
  const latestEvent = recentEvents[0] ?? null

  const detachActiveInput = useCallback(() => {
    listenerGenerationRef.current += 1
    const binding = activeBindingRef.current
    if (binding && binding.input.onmidimessage === binding.listener) binding.input.onmidimessage = null
    activeBindingRef.current = null
  }, [])

  const clearTransientInput = useCallback((reason: MidiPanicReason) => {
    heldNotesRef.current.clear()
    sustainPedalDownRef.current = false
    setActiveNotes([])
    setSustainPedalDown(false)
    publishMidiPanic(reason)
  }, [])

  const handleMidiMessage = useCallback((event: MidiMessageEventLike, input: MidiInputLike) => {
    const nativeAudioPoc = window.pianoApp?.nativeAudioPoc
    const receivedAt = pianoLatencyDiagnostics.isEnabled || nativeAudioPoc?.enabled ? performance.now() : 0
    const deviceName = input.name || input.manufacturer || '未命名 MIDI 设备'
    const record = parseMidiMessage(event.data, deviceName, ++eventSequenceRef.current)
    if (!record) return

    if (record.type === 'noteOn') {
      pianoLatencyDiagnostics.markMidiReceived(record.id, receivedAt)
      if (nativeAudioPoc?.enabled) {
        nativeAudioPoc.noteOn(record.id, record.midiNumber ?? 0, record.velocity ?? 0, receivedAt)
      }
    }

    publishMidiEvent(record)
    setRecentEvents((currentEvents) => [record, ...currentEvents].slice(0, 20))

    if (record.type === 'controlChange') {
      if (record.controllerNumber === 64) {
        const down = record.sustainPedalDown === true
        sustainPedalDownRef.current = down
        setSustainPedalDown(down)
      }
      if (record.controllerNumber === 120 || record.controllerNumber === 123) clearTransientInput('manual')
      return
    }

    const midiNumber = record.midiNumber
    if (typeof midiNumber !== 'number') return
    if (record.type === 'noteOn') heldNotesRef.current.add(midiNumber)
    else heldNotesRef.current.delete(midiNumber)

    setActiveNotes((currentNotes) => {
      const nextNotes = new Map(currentNotes.map((note) => [note.midiNumber, note]))
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
      return Array.from(nextNotes.values()).sort((left, right) => left.midiNumber - right.midiNumber)
    })
  }, [clearTransientInput])

  const syncInputs = useCallback((access: MidiAccessLike, reason: SyncReason) => {
    const availableInputs = Array.from(access.inputs.values())
      .filter((input) => input.state !== 'disconnected')
      .map(toDevice)
    setInputs(availableInputs)

    if (suspendedRef.current) return
    const currentInputId = selectedInputIdRef.current
    if (currentInputId && availableInputs.some((input) => input.id === currentInputId)) {
      setLifecycleState('CONNECTED')
      return
    }

    if (currentInputId) {
      detachActiveInput()
      setSelectedInputId('')
      reconnectPendingRef.current = hasConnectedRef.current
      clearTransientInput('device-disconnected')
    }

    const resolution = resolveMidiInput(availableInputs, preferredIdentityRef.current)
    if (!resolution.device) {
      setLifecycleState(
        resolution.state === 'DISCONNECTED' && hasConnectedRef.current ? 'RECONNECTING' : resolution.state
      )
      return
    }

    if (reason === 'state-change' && hasConnectedRef.current) reconnectPendingRef.current = true
    const identity = createMidiDeviceIdentity(resolution.device)
    preferredIdentityRef.current = identity
    writeMidiDevicePreference(getStorage(), identity)
    setLifecycleState(reconnectPendingRef.current ? 'RECONNECTING' : resolution.state)
    setSelectedInputId(resolution.device.id)
  }, [clearTransientInput, detachActiveInput, setSelectedInputId])
  syncInputsRef.current = syncInputs

  const queryPermissionState = useCallback(async () => {
    if (typeof navigator === 'undefined') return
    const maybeNavigator = navigator as Navigator & {
      permissions?: { query?: (descriptor: Record<string, unknown>) => Promise<{ state: PermissionState }> }
    }
    try {
      const permission = await maybeNavigator.permissions?.query?.({ name: 'midi', sysex: false })
      if (permission?.state === 'granted' || permission?.state === 'denied' || permission?.state === 'prompt') {
        setPermissionStatus(permission.state)
      }
    } catch {
      // Chromium may expose Web MIDI without a queryable MIDI permission.
    }
  }, [])

  const requestAndSyncDevices = useCallback(async (reason: SyncReason) => {
    const requestGeneration = ++accessRequestGenerationRef.current
    const requestMidiAccess = getRequestMidiAccess()
    if (!requestMidiAccess) {
      detachActiveInput()
      setIsSupported(false)
      setPermissionStatus('unsupported')
      setInputs([])
      setSelectedInputId('')
      clearTransientInput('midi-error')
      setLifecycleState('ERROR')
      setErrorMessage('当前环境不支持 Web MIDI API，请使用支持 MIDI 的 Chromium / Electron 环境。')
      return
    }

    setIsSupported(true)
    setErrorMessage('')
    if (reason === 'system-resume' || !selectedInputIdRef.current) {
      setLifecycleState(hasConnectedRef.current ? 'RECONNECTING' : 'CONNECTING')
    }
    try {
      setPermissionStatus((current) => (current === 'granted' ? current : 'prompt'))
      const access = await requestMidiAccess({ sysex: false })
      if (requestGeneration !== accessRequestGenerationRef.current || suspendedRef.current) return
      if (midiAccessRef.current && midiAccessRef.current !== access) midiAccessRef.current.onstatechange = null
      midiAccessRef.current = access
      setMidiAccessVersion((version) => version + 1)
      access.onstatechange = () => syncInputsRef.current(access, 'state-change')
      setPermissionStatus('granted')
      syncInputsRef.current(access, reason)
    } catch (error) {
      if (requestGeneration !== accessRequestGenerationRef.current) return
      detachActiveInput()
      const errorName = error instanceof Error ? error.name : ''
      const denied = errorName === 'SecurityError' || errorName === 'NotAllowedError'
      setPermissionStatus(denied ? 'denied' : 'error')
      setInputs([])
      setSelectedInputId('')
      clearTransientInput('midi-error')
      setLifecycleState('ERROR')
      setErrorMessage(
        denied
          ? 'MIDI 权限未授予，请允许软件访问 MIDI 设备后重试。'
          : 'MIDI 初始化失败，请检查设备连接后重试。'
      )
    }
  }, [clearTransientInput, detachActiveInput, setSelectedInputId])

  const refreshDevices = useCallback(
    () => requestAndSyncDevices('manual-refresh'),
    [requestAndSyncDevices]
  )

  const selectInput = useCallback((inputId: string) => {
    const device = inputs.find((input) => input.id === inputId)
    if (!device) return
    if (inputId === selectedInputIdRef.current && lifecycleState === 'CONNECTED') return

    const wasConnected = hasConnectedRef.current
    detachActiveInput()
    if (wasConnected) clearTransientInput('device-changed')
    const identity = createMidiDeviceIdentity(device)
    preferredIdentityRef.current = identity
    writeMidiDevicePreference(getStorage(), identity)
    reconnectPendingRef.current = false
    setLifecycleState('CONNECTING')
    setSelectedInputId(inputId)
  }, [clearTransientInput, detachActiveInput, inputs, lifecycleState, setSelectedInputId])

  const panic = useCallback(() => clearTransientInput('manual'), [clearTransientInput])

  useEffect(() => {
    void (async () => {
      await queryPermissionState()
      await requestAndSyncDevices('startup')
    })()
    return () => {
      accessRequestGenerationRef.current += 1
      detachActiveInput()
      if (midiAccessRef.current) midiAccessRef.current.onstatechange = null
    }
  }, [detachActiveInput, queryPermissionState, requestAndSyncDevices])

  useEffect(() => {
    const access = midiAccessRef.current
    if (!access || !selectedInputId || suspendedRef.current) return
    const input = Array.from(access.inputs.values()).find((candidate) => candidate.id === selectedInputId)
    if (!input || input.state === 'disconnected') return

    detachActiveInput()
    const generation = listenerGenerationRef.current
    const listener: MidiMessageHandler = (event) => {
      if (!shouldAcceptMidiInputEvent(
        selectedInputIdRef.current,
        input.id,
        generation,
        listenerGenerationRef.current,
        suspendedRef.current
      )) return
      handleMidiMessage(event, input)
    }
    activeBindingRef.current = { input, listener }
    input.onmidimessage = listener
    if (reconnectPendingRef.current) clearTransientInput('device-reconnected')
    reconnectPendingRef.current = false
    hasConnectedRef.current = true
    setLifecycleState(getBoundMidiLifecycleState(selectedInputIdRef.current, input.id))

    return () => {
      if (input.onmidimessage === listener) input.onmidimessage = null
      if (activeBindingRef.current?.listener === listener) activeBindingRef.current = null
    }
  }, [clearTransientInput, detachActiveInput, handleMidiMessage, midiAccessVersion, selectedInputId])

  useEffect(() => window.pianoApp?.midiLifecycle?.onPowerEvent((event) => {
    if (event === 'suspend') {
      accessRequestGenerationRef.current += 1
      suspendedRef.current = true
      detachActiveInput()
      setSelectedInputId('')
      reconnectPendingRef.current = hasConnectedRef.current
      clearTransientInput('system-suspend')
      setLifecycleState(hasConnectedRef.current ? 'RECONNECTING' : 'DISCONNECTED')
      return
    }

    suspendedRef.current = false
    clearTransientInput('system-resume')
    void requestAndSyncDevices('system-resume')
  }), [clearTransientInput, detachActiveInput, requestAndSyncDevices, setSelectedInputId])

  useEffect(() => {
    midiRecoveryDiagnostics.updateDevice({
      selectedInputId: selectedInput?.id ?? preferredIdentityRef.current?.id ?? '',
      selectedInputName: selectedInput?.name ?? preferredIdentityRef.current?.name ?? '',
      selectedManufacturer: selectedInput?.manufacturer ?? preferredIdentityRef.current?.manufacturer ?? '',
      lifecycleState,
      heldNoteCount: activeNotes.length,
      sustainPedalDown
    })
  }, [activeNotes.length, lifecycleState, selectedInput, sustainPedalDown])

  return {
    isSupported,
    permissionStatus,
    permissionLabel: getPermissionLabel(permissionStatus),
    inputs,
    selectedInputId,
    selectedInput,
    lifecycleState,
    activeNotes,
    sustainPedalDown,
    recentEvents,
    latestEvent,
    errorMessage,
    sidebarStatus: createSidebarStatus(permissionStatus, inputs, selectedInput, lifecycleState),
    refreshDevices,
    selectInput,
    panic
  }
}
