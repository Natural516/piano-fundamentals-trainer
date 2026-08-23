/// <reference types="vite/client" />

interface Window {
  pianoApp?: {
    platform: string
    inflateRaw: (bytes: Uint8Array) => Promise<Uint8Array>
    pianoSamples: {
      readFile: (relativePath: string) => Promise<PianoSampleBridgeResult>
    }
    secrets: {
      getAiApiKey: () => Promise<SecureSecretBridgeResult<string>>
      setAiApiKey: (value: string) => Promise<SecureSecretBridgeResult>
      deleteAiApiKey: () => Promise<SecureSecretBridgeResult>
      hasAiApiKey: () => Promise<SecureSecretBridgeResult>
    }
  }
}

interface PianoSampleBridgeResult {
  success: boolean
  bytes?: Uint8Array
  error?: string
}

interface SecureSecretBridgeResult<T = null> {
  success: boolean
  value?: T
  configured?: boolean
  reason?: string
  error?: string
}
