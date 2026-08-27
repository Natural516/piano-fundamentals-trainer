import type { MidiInputDevice } from '../types'

export type MidiDeviceLifecycleState =
  | 'NO_DEVICE'
  | 'DETECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'RECONNECTING'
  | 'NEEDS_SELECTION'
  | 'ERROR'

export interface MidiDeviceIdentity {
  id: string
  name: string
  manufacturer: string
}

export interface MidiDeviceResolution {
  device: MidiInputDevice | null
  state: MidiDeviceLifecycleState
  match: 'exact-id' | 'manufacturer-name' | 'name' | 'single-device' | 'single-roland' | 'none'
}

export const MIDI_DEVICE_PREFERENCE_STORAGE_KEY = 'piano-midi-device-preference-v1'

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function uniqueMatch(
  inputs: MidiInputDevice[],
  predicate: (input: MidiInputDevice) => boolean
): MidiInputDevice[] {
  return inputs.filter(predicate)
}

export function createMidiDeviceIdentity(input: MidiInputDevice): MidiDeviceIdentity {
  return {
    id: input.id,
    name: input.name,
    manufacturer: input.manufacturer
  }
}

export function resolveMidiInput(
  inputs: MidiInputDevice[],
  preferred: MidiDeviceIdentity | null
): MidiDeviceResolution {
  if (inputs.length === 0) {
    return {
      device: null,
      state: preferred ? 'DISCONNECTED' : 'NO_DEVICE',
      match: 'none'
    }
  }

  if (preferred) {
    const exact = uniqueMatch(inputs, (input) => input.id === preferred.id)
    if (exact.length === 1) return { device: exact[0], state: 'DETECTED', match: 'exact-id' }

    const preferredName = normalized(preferred.name)
    const preferredManufacturer = normalized(preferred.manufacturer)
    if (preferredName && preferredManufacturer) {
      const manufacturerAndName = uniqueMatch(
        inputs,
        (input) => normalized(input.name) === preferredName
          && normalized(input.manufacturer) === preferredManufacturer
      )
      if (manufacturerAndName.length === 1) {
        return { device: manufacturerAndName[0], state: 'DETECTED', match: 'manufacturer-name' }
      }
      if (manufacturerAndName.length > 1) {
        return { device: null, state: 'NEEDS_SELECTION', match: 'none' }
      }
    }

    if (preferredName) {
      const byName = uniqueMatch(inputs, (input) => normalized(input.name) === preferredName)
      if (byName.length === 1) return { device: byName[0], state: 'DETECTED', match: 'name' }
      if (byName.length > 1) return { device: null, state: 'NEEDS_SELECTION', match: 'none' }
    }

    return { device: null, state: 'DISCONNECTED', match: 'none' }
  }

  if (inputs.length === 1) {
    return { device: inputs[0], state: 'DETECTED', match: 'single-device' }
  }

  const rolandInputs = inputs.filter((input) => (
    normalized(input.manufacturer).includes('roland') || normalized(input.name).includes('roland')
  ))
  if (rolandInputs.length === 1) {
    return { device: rolandInputs[0], state: 'DETECTED', match: 'single-roland' }
  }

  return { device: null, state: 'NEEDS_SELECTION', match: 'none' }
}

export function getBoundMidiLifecycleState(
  selectedInputId: string,
  boundInputId: string | null
): MidiDeviceLifecycleState {
  return selectedInputId && selectedInputId === boundInputId ? 'CONNECTED' : 'CONNECTING'
}

export function shouldAcceptMidiInputEvent(
  selectedInputId: string,
  incomingInputId: string,
  listenerGeneration: number,
  activeGeneration: number,
  suspended: boolean
): boolean {
  return !suspended
    && selectedInputId.length > 0
    && selectedInputId === incomingInputId
    && listenerGeneration === activeGeneration
}

export function readMidiDevicePreference(storage: Pick<Storage, 'getItem'> | null): MidiDeviceIdentity | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(MIDI_DEVICE_PREFERENCE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<MidiDeviceIdentity>
    if (typeof parsed.id !== 'string' || typeof parsed.name !== 'string' || typeof parsed.manufacturer !== 'string') {
      return null
    }
    return { id: parsed.id, name: parsed.name, manufacturer: parsed.manufacturer }
  } catch {
    return null
  }
}

export function writeMidiDevicePreference(
  storage: Pick<Storage, 'setItem'> | null,
  identity: MidiDeviceIdentity
): boolean {
  if (!storage) return false
  try {
    storage.setItem(MIDI_DEVICE_PREFERENCE_STORAGE_KEY, JSON.stringify(identity))
    return true
  } catch {
    return false
  }
}
