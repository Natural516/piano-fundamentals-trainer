export interface MidiInputAdapter {
  connect: () => Promise<boolean>
  disconnect: () => void
}

export interface MidiOutputAdapter {
  readonly isSupported: boolean
  sendNoteOn: (midiNumber: number, velocity: number) => void
  sendNoteOff: (midiNumber: number) => void
  sendControlChange: (controller: number, value: number) => void
  panic: () => void
}

export interface FileImportAdapter {
  readTextFile: (file: File) => Promise<string>
  readArrayBuffer: (file: File) => Promise<ArrayBuffer>
}

export interface StorageAdapter {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

/**
 * Secret storage abstraction. Production Electron must use the OS secret
 * store via IPC; the browser fallback is explicitly warned and used only in
 * development.
 */
export interface SecretStore {
  getSecret: (key: string) => Promise<string | null>
  setSecret: (key: string, value: string) => Promise<void>
  clearSecret: (key: string) => Promise<void>
}

export interface AudioBackend {
  playNote: (midiNumber: number, velocity: number) => void
  stopNote: (midiNumber: number) => void
  setSustain: (down: boolean) => void
  panic: () => void
}

export const localStorageStorageAdapter: StorageAdapter = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key)
}

export const browserFileImportAdapter: FileImportAdapter = {
  readTextFile: (file) => file.text(),
  readArrayBuffer: (file) => file.arrayBuffer()
}

export const browserSecretStore: SecretStore = {
  async getSecret(key) {
    try {
      return window.localStorage.getItem(`secret.${key}`)
    } catch {
      return null
    }
  },
  async setSecret(key, value) {
    try {
      window.localStorage.setItem(`secret.${key}`, value)
    } catch {
      // Browser storage may be unavailable; production should use IPC secret store.
    }
  },
  async clearSecret(key) {
    try {
      window.localStorage.removeItem(`secret.${key}`)
    } catch {
      // Ignore.
    }
  }
}

export const UNSUPPORTED_MIDI_OUTPUT_ADAPTER: MidiOutputAdapter = {
  isSupported: false,
  sendNoteOn: () => undefined,
  sendNoteOff: () => undefined,
  sendControlChange: () => undefined,
  panic: () => undefined
}
