import {
  registerPlugin,
  type PluginListenerHandle
} from '@capacitor/core'
import type { SightReadingMidiEvent } from '../../../src/sightReading/midi'
import {
  AndroidMidiByteStreamParser,
  AndroidMidiInputRouter,
  toSightReadingMidiPayload
} from './androidBluetoothMidiCore'

export type AndroidBluetoothMidiConnectionState =
  | 'UNSUPPORTED'
  | 'PERMISSION_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'BLUETOOTH_OFF'
  | 'IDLE'
  | 'SCANNING'
  | 'DEVICE_FOUND'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'ERROR'

export type AndroidBluetoothPermissionState = 'UNSUPPORTED' | 'REQUIRED' | 'DENIED' | 'GRANTED'
export type AndroidBluetoothState = 'UNSUPPORTED' | 'OFF' | 'ON'

export interface AndroidBluetoothMidiDevice {
  id: string
  name: string
  address?: string
  manufacturer?: string
  product?: string
  source: 'bleScan' | 'midiManager'
  serviceUuids?: string[]
}

export interface NativeAndroidBluetoothMidiState {
  supported: boolean
  androidApiLevel: number
  scanServiceUuid: string
  permissionState: AndroidBluetoothPermissionState
  bluetoothState: AndroidBluetoothState
  connectionState: AndroidBluetoothMidiConnectionState
  discoveredDevices: AndroidBluetoothMidiDevice[]
  connectedDeviceId?: string
  connectedDeviceName?: string
  midiPortState: 'CLOSED' | 'OPEN' | 'SUSPENDED'
  receivedChunkCount: number
  receivedByteCount: number
  disconnectCount: number
  reconnectCount: number
  lastError?: string
}

export interface NativeAndroidMidiChunk {
  bytes: number[]
  nativeTimestampNanos: number
  callbackReceivedNanos: number
}

export interface AndroidBluetoothMidiPlugin {
  getState(): Promise<NativeAndroidBluetoothMidiState>
  requestMidiPermissions(): Promise<NativeAndroidBluetoothMidiState>
  startScan(): Promise<NativeAndroidBluetoothMidiState>
  stopScan(): Promise<NativeAndroidBluetoothMidiState>
  connect(options: { deviceId: string }): Promise<NativeAndroidBluetoothMidiState>
  disconnect(): Promise<NativeAndroidBluetoothMidiState>
  suspendDelivery(): Promise<NativeAndroidBluetoothMidiState>
  resumeDelivery(): Promise<NativeAndroidBluetoothMidiState>
  addListener(
    eventName: 'stateChanged',
    listener: (state: NativeAndroidBluetoothMidiState) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'deviceDiscovered',
    listener: (device: AndroidBluetoothMidiDevice) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'midiMessage',
    listener: (message: NativeAndroidMidiChunk) => void
  ): Promise<PluginListenerHandle>
}

export const NativeAndroidBluetoothMidi = registerPlugin<AndroidBluetoothMidiPlugin>('AndroidBluetoothMidi')

export interface AndroidBluetoothMidiDiagnostics {
  receivedMessageCount: number
  lastRawMessage: string
  lastNativeTimestampNanos: number | null
  lastNormalizedEvent: SightReadingMidiEvent | null
  lastChannel: number | null
  lastController: string
}

export interface AndroidBluetoothMidiSnapshot extends NativeAndroidBluetoothMidiState {
  diagnostics: AndroidBluetoothMidiDiagnostics
}

export interface AndroidBluetoothMidiAdapterCallbacks {
  onTransportLost(): void
  onTransportReady(): void
  onChange(): void
}

const unsupportedState: NativeAndroidBluetoothMidiState = {
  supported: false,
  androidApiLevel: 0,
  scanServiceUuid: '03B80E5A-EDE8-4B33-A751-6CE34EC4C700',
  permissionState: 'UNSUPPORTED',
  bluetoothState: 'UNSUPPORTED',
  connectionState: 'UNSUPPORTED',
  discoveredDevices: [],
  midiPortState: 'CLOSED',
  receivedChunkCount: 0,
  receivedByteCount: 0,
  disconnectCount: 0,
  reconnectCount: 0
}

export class AndroidBluetoothMidiAdapter {
  private readonly parser = new AndroidMidiByteStreamParser()
  private readonly listenerHandles: PluginListenerHandle[] = []
  private state: NativeAndroidBluetoothMidiState = unsupportedState
  private diagnosticsValue: AndroidBluetoothMidiDiagnostics = {
    receivedMessageCount: 0,
    lastRawMessage: '—',
    lastNativeTimestampNanos: null,
    lastNormalizedEvent: null,
    lastChannel: null,
    lastController: '—'
  }
  private started = false

  constructor(
    private readonly plugin: AndroidBluetoothMidiPlugin | null,
    private readonly router: AndroidMidiInputRouter,
    private readonly callbacks: AndroidBluetoothMidiAdapterCallbacks
  ) {}

  get snapshot(): AndroidBluetoothMidiSnapshot {
    return {
      ...this.state,
      discoveredDevices: this.state.discoveredDevices.map((device) => ({ ...device })),
      diagnostics: {
        ...this.diagnosticsValue,
        lastNormalizedEvent: this.diagnosticsValue.lastNormalizedEvent
          ? { ...this.diagnosticsValue.lastNormalizedEvent }
          : null
      }
    }
  }

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    if (!this.plugin) {
      this.callbacks.onChange()
      return
    }

    try {
      this.listenerHandles.push(
        await this.plugin.addListener('stateChanged', (state) => this.applyState(state)),
        await this.plugin.addListener('deviceDiscovered', (device) => this.applyDiscoveredDevice(device)),
        await this.plugin.addListener('midiMessage', (message) => this.handleNativeChunk(message))
      )
      this.applyState(await this.plugin.getState())
    } catch (error) {
      this.applyError(error)
    }
  }

  async requestPermissions(): Promise<void> {
    await this.perform(() => this.plugin?.requestMidiPermissions())
  }

  async scan(): Promise<void> {
    this.parser.reset()
    await this.perform(() => this.plugin?.startScan())
  }

  async stopScan(): Promise<void> {
    await this.perform(() => this.plugin?.stopScan())
  }

  async connect(deviceId: string): Promise<void> {
    this.parser.reset()
    this.router.advanceWatermark()
    await this.perform(() => this.plugin?.connect({ deviceId }))
  }

  async disconnect(): Promise<void> {
    this.parser.reset()
    this.router.advanceWatermark()
    await this.perform(() => this.plugin?.disconnect())
  }

  async suspendDelivery(): Promise<void> {
    this.parser.reset()
    this.router.advanceWatermark()
    await this.perform(() => this.plugin?.suspendDelivery())
  }

  async resumeDelivery(): Promise<void> {
    this.parser.reset()
    this.router.advanceWatermark()
    await this.perform(() => this.plugin?.resumeDelivery())
  }

  async refresh(): Promise<void> {
    await this.perform(() => this.plugin?.getState())
  }

  async dispose(): Promise<void> {
    this.parser.reset()
    for (const handle of this.listenerHandles.splice(0)) await handle.remove()
    this.started = false
  }

  /** Deterministic adapter seam used by tests; production receives the same shape from Capacitor. */
  receiveNativeChunk(message: NativeAndroidMidiChunk): void {
    this.handleNativeChunk(message)
  }

  private async perform(operation: () => Promise<NativeAndroidBluetoothMidiState> | undefined): Promise<void> {
    if (!this.plugin) return
    try {
      const result = await operation()
      if (result) this.applyState(result)
    } catch (error) {
      this.applyError(error)
    }
  }

  private applyState(next: NativeAndroidBluetoothMidiState): void {
    const wasConnected = this.state.connectionState === 'CONNECTED'
    const isConnected = next.connectionState === 'CONNECTED'
    this.state = {
      ...next,
      discoveredDevices: next.discoveredDevices ?? []
    }
    if (wasConnected !== isConnected) {
      this.parser.reset()
      this.router.advanceWatermark()
    }
    if (wasConnected && !isConnected) this.callbacks.onTransportLost()
    else if (!wasConnected && isConnected) this.callbacks.onTransportReady()
    this.callbacks.onChange()
  }

  private applyDiscoveredDevice(device: AndroidBluetoothMidiDevice): void {
    const devices = this.state.discoveredDevices.filter((candidate) => candidate.id !== device.id)
    this.state = {
      ...this.state,
      connectionState: this.state.connectionState === 'SCANNING' ? 'DEVICE_FOUND' : this.state.connectionState,
      discoveredDevices: [...devices, device]
    }
    this.callbacks.onChange()
  }

  private applyError(error: unknown): void {
    this.state = {
      ...this.state,
      connectionState: 'ERROR',
      lastError: error instanceof Error ? error.message : String(error)
    }
    this.callbacks.onTransportLost()
    this.callbacks.onChange()
  }

  private handleNativeChunk(message: NativeAndroidMidiChunk): void {
    const bytes = Array.isArray(message.bytes)
      ? message.bytes.filter((byte) => Number.isInteger(byte)).map((byte) => byte & 0xff)
      : []
    this.diagnosticsValue.lastRawMessage = bytes.length
      ? bytes.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')
      : '—'
    this.diagnosticsValue.lastNativeTimestampNanos = Number.isFinite(message.nativeTimestampNanos)
      ? message.nativeTimestampNanos
      : null

    for (const parsed of this.parser.push(bytes)) {
      const payload = toSightReadingMidiPayload(parsed)
      if (!payload) continue
      this.diagnosticsValue.receivedMessageCount += 1
      this.diagnosticsValue.lastChannel = parsed.channel + 1
      this.diagnosticsValue.lastController = payload.type === 'controlChange'
        ? `CC${payload.controllerNumber}=${payload.controllerValue}`
        : '—'
      const accepted = this.router.emit('bluetooth', payload)
      this.diagnosticsValue.lastNormalizedEvent = accepted
    }
    this.callbacks.onChange()
  }
}
