/// <reference types="vite/client" />

interface Window {
  pianoApp?: {
    platform: string
    inflateRaw: (bytes: Uint8Array) => Promise<Uint8Array>
    pianoSamples: {
      readFile: (relativePath: string) => Promise<PianoSampleBridgeResult>
    }
    nativeAudioPoc: {
      enabled: boolean
      noteOn: (
        eventId: number,
        midiNumber: number,
        velocity: number,
        webMidiReceivedAtMs: number
      ) => void
      requestReport: () => void
      status: () => NativeAudioPocBridgeStatus
    }
    midiLifecycle: {
      onPowerEvent: (callback: (event: 'suspend' | 'resume') => void) => () => void
    }
    secrets: {
      getAiApiKey: () => Promise<SecureSecretBridgeResult<string>>
      setAiApiKey: (value: string) => Promise<SecureSecretBridgeResult>
      deleteAiApiKey: () => Promise<SecureSecretBridgeResult>
      hasAiApiKey: () => Promise<SecureSecretBridgeResult>
    }
  }
}

interface NativeAudioPocBridgeStatus {
  enabled: boolean
  connected: boolean
  sentEvents: number
  droppedEvents: number
  queueBackpressure: number
  reconnects: number
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
