/// <reference types="vite/client" />

interface Window {
  pianoApp?: {
    platform: string
    inflateRaw: (bytes: Uint8Array) => Promise<Uint8Array>
    secrets: {
      getAiApiKey: () => Promise<SecureSecretBridgeResult<string>>
      setAiApiKey: (value: string) => Promise<SecureSecretBridgeResult>
      deleteAiApiKey: () => Promise<SecureSecretBridgeResult>
      hasAiApiKey: () => Promise<SecureSecretBridgeResult>
    }
  }
}

interface SecureSecretBridgeResult<T = null> {
  success: boolean
  value?: T
  configured?: boolean
  reason?: string
  error?: string
}
