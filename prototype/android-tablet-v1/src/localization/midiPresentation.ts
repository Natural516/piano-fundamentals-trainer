import type { AndroidSightReadingRuntime } from '../sightReadingIntegration'
import type { AndroidBluetoothMidiConnectionState } from '../androidBluetoothMidi'

export type MidiTranslator = (key: string, values?: Record<string, string | number>) => string

/** Presentation only: reads existing facts, never calls the input provider or exposes diagnostics. */
export function presentLocalizedMidiStatus(
  runtime: Pick<AndroidSightReadingRuntime, 'midiSource' | 'midiReady' | 'bluetoothSnapshot'>,
  t: MidiTranslator
): { label: string; detail: string; tone: 'connected' | 'busy' | 'idle' | 'error' } {
  if (runtime.midiSource === 'development') return { label: t('readyLabel'), detail: t('canStart'), tone: 'connected' }
  const midi = runtime.bluetoothSnapshot
  const name = midi.connectedDeviceName ?? t('device')
  const transport = midi.activeInput?.transport === 'usb' ? 'USB MIDI' : 'Bluetooth MIDI'
  const reasons: Record<string, string> = {
    NO_OUTPUT_PORT: 'noOutput', PORT_SELECTION_REQUIRED: 'needPort', INVALID_PORT: 'invalidPort',
    DEVICE_REMOVED: 'removed', OPEN_FAILED: 'openFailed', SCAN_FAILED: 'scanFailed', BLUETOOTH_OFF: 'bluetoothOffUsb'
  }
  if (midi.reasonCode && midi.connectionState !== 'CONNECTED') {
    return { label: t(midi.reasonCode === 'PORT_SELECTION_REQUIRED' ? 'selectInput' : 'notReady'), detail: t(reasons[midi.reasonCode] ?? 'retrySelection'), tone: 'idle' }
  }
  const states: Record<AndroidBluetoothMidiConnectionState, { label: string; detail: string; tone: 'connected' | 'busy' | 'idle' | 'error' }> = {
    UNSUPPORTED: { label: t('unsupportedLabel'), detail: t('unsupportedDetail'), tone: 'error' },
    PERMISSION_REQUIRED: { label: t('permissionLabel'), detail: t('permissionDetail'), tone: 'idle' },
    PERMISSION_DENIED: { label: t('deniedLabel'), detail: t('deniedDetail'), tone: 'error' },
    BLUETOOTH_OFF: { label: t('bluetoothOffLabel'), detail: t('bluetoothOffDetail'), tone: 'error' },
    IDLE: { label: t('idleLabel'), detail: t('idleDetail'), tone: 'idle' },
    SCANNING: { label: t('scanningLabel'), detail: t('scanningDetail'), tone: 'busy' },
    DEVICE_FOUND: { label: t('foundLabel'), detail: t('foundDetail'), tone: 'busy' },
    CONNECTING: { label: t('connecting'), detail: name, tone: 'busy' },
    CONNECTED: { label: t('connectedDevice', { deviceName: name }), detail: t('connectedDetail', { transport, readiness: t(runtime.midiReady ? 'canStart' : 'inputPaused') }), tone: runtime.midiReady ? 'connected' : 'idle' },
    DISCONNECTED: { label: t('disconnectedLabel'), detail: t('disconnectedDetail'), tone: 'error' },
    ERROR: { label: t('errorLabel'), detail: t('errorDetail'), tone: 'error' }
  }
  return states[midi.connectionState]
}

/** IDs stay stable; external names remain author-owned data. */
export function getSettingsThemeDisplayName(theme: { id: string; source?: string; displayName: string }, t: MidiTranslator): string {
  if (theme.source !== 'external' && (theme.id === 'light' || theme.id === 'dark')) return t(theme.id)
  return theme.displayName
}
