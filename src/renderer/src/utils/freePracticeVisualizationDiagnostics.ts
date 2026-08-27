import type { MidiEventRecord } from '../types'

export interface VisualizationLatencyPercentiles {
  p50: number | null
  p95: number | null
  p99: number | null
  max: number | null
}

export interface VisualizationLatencyReport {
  sampleCount: number
  midiToHandlerMs: VisualizationLatencyPercentiles
  handlerToStateUpdateMs: VisualizationLatencyPercentiles
  stateUpdateToCommitMs: VisualizationLatencyPercentiles
  totalSoftwareMs: VisualizationLatencyPercentiles
}

interface PendingVisualizationLatency {
  midiToHandlerMs: number
  handlerAt: number
  stateUpdateAt: number | null
}

interface CompletedVisualizationLatency {
  midiToHandlerMs: number
  handlerToStateUpdateMs: number
  stateUpdateToCommitMs: number
  totalSoftwareMs: number
}

function percentile(values: readonly number[], ratio: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]
}

function summarize(values: readonly number[]): VisualizationLatencyPercentiles {
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values.length > 0 ? Math.max(...values) : null
  }
}

export class FreePracticeVisualizationDiagnostics {
  private readonly pending = new Map<number, PendingVisualizationLatency>()
  private readonly samples: CompletedVisualizationLatency[] = []
  private reportedThousandSamples = false

  constructor(
    readonly enabled: boolean,
    private readonly maxSamples = 2000
  ) {}

  markHandler(event: MidiEventRecord, handlerAt: number, wallClockAt: number): void {
    if (!this.enabled || event.type !== 'noteOn' || (event.velocity ?? 0) <= 0) return
    this.pending.set(event.id, {
      midiToHandlerMs: Math.max(0, wallClockAt - event.timestamp),
      handlerAt,
      stateUpdateAt: null
    })
  }

  markStateUpdate(eventId: number, stateUpdateAt: number): void {
    const sample = this.pending.get(eventId)
    if (!sample) return
    sample.stateUpdateAt = stateUpdateAt
  }

  markCommit(eventId: number, commitAt: number): void {
    const committed = [...this.pending.entries()]
      .filter(([pendingEventId, pending]) => pendingEventId <= eventId && pending.stateUpdateAt != null)
      .sort(([left], [right]) => left - right)
    if (committed.length === 0) return

    for (const [pendingEventId, pending] of committed) {
      this.pending.delete(pendingEventId)
      const stateUpdateAt = pending.stateUpdateAt as number
      const handlerToStateUpdateMs = Math.max(0, stateUpdateAt - pending.handlerAt)
      const stateUpdateToCommitMs = Math.max(0, commitAt - stateUpdateAt)
      this.samples.push({
        midiToHandlerMs: pending.midiToHandlerMs,
        handlerToStateUpdateMs,
        stateUpdateToCommitMs,
        totalSoftwareMs: pending.midiToHandlerMs + handlerToStateUpdateMs + stateUpdateToCommitMs
      })
    }
    if (this.samples.length > this.maxSamples) this.samples.splice(0, this.samples.length - this.maxSamples)

    if (!this.reportedThousandSamples && this.samples.length >= 1000) {
      this.reportedThousandSamples = true
      console.info('[Free Practice visualization latency · 1000 noteOn]', this.getReport())
    }
  }

  getReport(): VisualizationLatencyReport {
    return {
      sampleCount: this.samples.length,
      midiToHandlerMs: summarize(this.samples.map((sample) => sample.midiToHandlerMs)),
      handlerToStateUpdateMs: summarize(this.samples.map((sample) => sample.handlerToStateUpdateMs)),
      stateUpdateToCommitMs: summarize(this.samples.map((sample) => sample.stateUpdateToCommitMs)),
      totalSoftwareMs: summarize(this.samples.map((sample) => sample.totalSoftwareMs))
    }
  }

  reset(): void {
    this.pending.clear()
    this.samples.length = 0
    this.reportedThousandSamples = false
  }
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

export const freePracticeVisualizationDiagnostics = new FreePracticeVisualizationDiagnostics(
  process.env.NODE_ENV !== 'production'
)

export function getVisualizationDiagnosticNow(): number {
  return now()
}

if (freePracticeVisualizationDiagnostics.enabled) {
  const diagnosticGlobal = globalThis as typeof globalThis & {
    __freePracticeVisualizationDiagnostics?: { getReport: () => VisualizationLatencyReport }
  }
  diagnosticGlobal.__freePracticeVisualizationDiagnostics = {
    getReport: () => freePracticeVisualizationDiagnostics.getReport()
  }
}
