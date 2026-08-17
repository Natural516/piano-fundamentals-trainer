/// <reference types="vite/client" />

interface Window {
  pianoApp?: {
    platform: string
    inflateRaw: (bytes: Uint8Array) => Promise<Uint8Array>
  }
}
