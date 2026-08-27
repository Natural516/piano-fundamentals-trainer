const DIAGNOSTICS_STORAGE_KEY = 'piano-trainer.latency-diagnostics.v1'
const MAX_SAMPLES = 256

export interface PianoLatencySample {
  eventId: number
  midiToSamplerMs: number
  samplerToSourceStartMs: number
  totalSoftwareDispatchMs: number
  baseLatencyMs: number | null
  outputLatencyMs: number | null
  sampleRate: number
  contextState: AudioContextState
}

export interface PianoLatencySummary {
  count: number
  midiToSamplerMs: number | null
  samplerToSourceStartMs: number | null
  totalSoftwareDispatchMs: number | null
  baseLatencyMs: number | null
  outputLatencyMs: number | null
  sampleRate: number | null
  contextState: AudioContextState | null
}

interface PendingLatencySample {
  midiReceivedAt: number
  samplerEnteredAt?: number
}

function isDiagnosticsEnabled(): boolean {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return false

  try {
    const query = new URLSearchParams(window.location.search)
    return query.get('pianoLatencyDiagnostics') === '1'
      || window.localStorage.getItem(DIAGNOSTICS_STORAGE_KEY) === 'enabled'
  } catch {
    return false
  }
}

function getNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return round(values.reduce((total, value) => total + value, 0) / values.length)
}

class PianoLatencyDiagnostics {
  private readonly enabled = isDiagnosticsEnabled()
  private readonly pending = new Map<number, PendingLatencySample>()
  private readonly samples: PianoLatencySample[] = []

  get isEnabled(): boolean {
    return this.enabled
  }

  markMidiReceived(eventId: number, receivedAt = getNow()): void {
    if (!this.enabled) return
    this.pending.set(eventId, { midiReceivedAt: receivedAt })
    if (this.pending.size > MAX_SAMPLES) {
      const oldestEventId = this.pending.keys().next().value
      if (typeof oldestEventId === 'number') this.pending.delete(oldestEventId)
    }
  }

  markSamplerEntry(eventId: number | undefined): void {
    if (!this.enabled || typeof eventId !== 'number') return
    const sample = this.pending.get(eventId)
    if (!sample) return
    sample.samplerEnteredAt = getNow()
  }

  markSourceStart(eventId: number | undefined, audioContext: AudioContext): void {
    if (!this.enabled || typeof eventId !== 'number') return
    const pending = this.pending.get(eventId)
    if (!pending || typeof pending.samplerEnteredAt !== 'number') return

    const sourceStartedAt = getNow()
    const contextWithOutputLatency = audioContext as AudioContext & { outputLatency?: number }
    const sample: PianoLatencySample = {
      eventId,
      midiToSamplerMs: round(pending.samplerEnteredAt - pending.midiReceivedAt),
      samplerToSourceStartMs: round(sourceStartedAt - pending.samplerEnteredAt),
      totalSoftwareDispatchMs: round(sourceStartedAt - pending.midiReceivedAt),
      baseLatencyMs: Number.isFinite(audioContext.baseLatency)
        ? round(audioContext.baseLatency * 1_000)
        : null,
      outputLatencyMs: Number.isFinite(contextWithOutputLatency.outputLatency)
        ? round((contextWithOutputLatency.outputLatency ?? 0) * 1_000)
        : null,
      sampleRate: audioContext.sampleRate,
      contextState: audioContext.state
    }

    this.pending.delete(eventId)
    this.samples.push(sample)
    if (this.samples.length > MAX_SAMPLES) this.samples.shift()
    console.debug('[piano-latency]', sample)
  }

  getSnapshot(): { enabled: boolean; samples: PianoLatencySample[]; summary: PianoLatencySummary } {
    const last = this.samples.at(-1)
    return {
      enabled: this.enabled,
      samples: this.samples.map((sample) => ({ ...sample })),
      summary: {
        count: this.samples.length,
        midiToSamplerMs: average(this.samples.map((sample) => sample.midiToSamplerMs)),
        samplerToSourceStartMs: average(this.samples.map((sample) => sample.samplerToSourceStartMs)),
        totalSoftwareDispatchMs: average(this.samples.map((sample) => sample.totalSoftwareDispatchMs)),
        baseLatencyMs: last?.baseLatencyMs ?? null,
        outputLatencyMs: last?.outputLatencyMs ?? null,
        sampleRate: last?.sampleRate ?? null,
        contextState: last?.contextState ?? null
      }
    }
  }

  reset(): void {
    if (!this.enabled) return
    this.pending.clear()
    this.samples.length = 0
  }
}

export const pianoLatencyDiagnostics = new PianoLatencyDiagnostics()

if (typeof window !== 'undefined' && pianoLatencyDiagnostics.isEnabled) {
  Object.defineProperty(window, '__pianoLatencyDiagnostics', {
    configurable: true,
    value: {
      getSnapshot: () => pianoLatencyDiagnostics.getSnapshot(),
      reset: () => pianoLatencyDiagnostics.reset()
    }
  })
}
