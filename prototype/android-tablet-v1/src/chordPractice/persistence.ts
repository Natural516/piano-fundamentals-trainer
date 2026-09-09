import type { PreferencesBackend } from '../androidPersistenceCore'
import {
  CHORD_REPORT_SCHEMA_VERSION,
  createChordPracticeReport,
  createChordPracticeReportDraft,
  freezeChordPracticeReport,
  isChordPracticeReportV1,
  type ChordPracticeReportDraft,
  type ChordPracticeReportV1
} from './report'
import type { ChordRuntimeSnapshot } from './runtime'

export const CHORD_REPORT_STORAGE_KEYS = Object.freeze({
  reportPrefix: 'piano.v1.chord.report.',
  reportIndex: 'piano.v1.chord.reportIndex'
})

interface ChordReportIndexV1 {
  readonly schemaVersion: typeof CHORD_REPORT_SCHEMA_VERSION
  readonly nextSequence: number
  readonly recordIds: readonly string[]
}

export interface ChordReportLoadDiagnostics {
  readonly missingRecordIds: readonly string[]
  readonly invalidRecordIds: readonly string[]
}

export type ChordReportLoadResult =
  | { readonly success: true; readonly records: readonly ChordPracticeReportV1[]; readonly diagnostics: ChordReportLoadDiagnostics }
  | { readonly success: false; readonly records: readonly ChordPracticeReportV1[]; readonly diagnostics: ChordReportLoadDiagnostics; readonly error: string }

export type ChordReportSaveResult =
  | { readonly success: true; readonly record: ChordPracticeReportV1; readonly created: boolean }
  | { readonly success: false; readonly error: string }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseIndex(raw: string | null): ChordReportIndexV1 {
  if (raw === null) return Object.freeze({ schemaVersion: 1, nextSequence: 1, recordIds: Object.freeze([]) })
  const parsed: unknown = JSON.parse(raw)
  if (!isObject(parsed) || parsed.schemaVersion !== CHORD_REPORT_SCHEMA_VERSION
    || !Number.isInteger(parsed.nextSequence) || Number(parsed.nextSequence) < 1
    || !Array.isArray(parsed.recordIds)
    || !parsed.recordIds.every((id) => typeof id === 'string' && /^chord-report-[1-9]\d*$/.test(id))) {
    throw new Error('Chord report index is malformed or has an unsupported schema')
  }
  return Object.freeze({
    schemaVersion: CHORD_REPORT_SCHEMA_VERSION,
    nextSequence: Number(parsed.nextSequence),
    recordIds: Object.freeze([...new Set(parsed.recordIds as string[])])
  })
}

export class ChordReportRepository {
  private readonly records = new Map<string, ChordPracticeReportV1>()
  private readonly savedSessions = new Map<string, ChordPracticeReportV1>()
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly backend: PreferencesBackend) {}

  list(): readonly ChordPracticeReportV1[] {
    return Object.freeze([...this.records.values()].sort((left, right) => (
      right.endedAtEpochMs - left.endedAtEpochMs || sequenceOf(right.recordId) - sequenceOf(left.recordId)
    )))
  }

  async initialize(): Promise<ChordReportLoadResult> {
    await this.writeQueue
    const diagnostics = { missingRecordIds: [] as string[], invalidRecordIds: [] as string[] }
    try {
      const index = parseIndex((await this.backend.get({ key: CHORD_REPORT_STORAGE_KEYS.reportIndex })).value)
      const loaded = new Map<string, ChordPracticeReportV1>()
      for (const recordId of index.recordIds) {
        const raw = (await this.backend.get({ key: this.reportKey(recordId) })).value
        if (raw === null) {
          diagnostics.missingRecordIds.push(recordId)
          continue
        }
        try {
          const parsed: unknown = JSON.parse(raw)
          if (!isChordPracticeReportV1(parsed) || parsed.recordId !== recordId) {
            diagnostics.invalidRecordIds.push(recordId)
            continue
          }
          loaded.set(recordId, freezeChordPracticeReport(parsed))
        } catch {
          diagnostics.invalidRecordIds.push(recordId)
        }
      }
      this.records.clear()
      for (const [id, record] of loaded) this.records.set(id, record)
      return { success: true, records: this.list(), diagnostics }
    } catch (error) {
      return { success: false, records: this.list(), diagnostics, error: `Unable to load Chord reports: ${String(error)}` }
    }
  }

  async saveForSession(sessionId: string, draft: ChordPracticeReportDraft): Promise<ChordReportSaveResult> {
    if (!sessionId) return { success: false, error: 'Chord logical session identity is missing' }
    let result: ChordReportSaveResult = { success: false, error: 'Chord report save did not run' }
    const operation = this.writeQueue.then(async () => {
      const existing = this.savedSessions.get(sessionId)
      if (existing) {
        result = { success: true, record: existing, created: false }
        return
      }
      try {
        const index = parseIndex((await this.backend.get({ key: CHORD_REPORT_STORAGE_KEYS.reportIndex })).value)
        let sequence = index.nextSequence
        while ((await this.backend.get({ key: this.reportKey(`chord-report-${sequence}`) })).value !== null) sequence += 1
        const recordId = `chord-report-${sequence}`
        const record = createChordPracticeReport(recordId, draft)
        const serializedRecord = JSON.stringify(record)

        // Body first: a failed body write can never publish an index entry.
        await this.backend.set({ key: this.reportKey(recordId), value: serializedRecord })
        if ((await this.backend.get({ key: this.reportKey(recordId) })).value !== serializedRecord) {
          throw new Error('Chord report body read-back failed')
        }

        const nextIndex: ChordReportIndexV1 = Object.freeze({
          schemaVersion: CHORD_REPORT_SCHEMA_VERSION,
          nextSequence: sequence + 1,
          recordIds: Object.freeze([...index.recordIds, recordId])
        })
        const serializedIndex = JSON.stringify(nextIndex)
        await this.backend.set({ key: CHORD_REPORT_STORAGE_KEYS.reportIndex, value: serializedIndex })
        if ((await this.backend.get({ key: CHORD_REPORT_STORAGE_KEYS.reportIndex })).value !== serializedIndex) {
          throw new Error('Chord report index read-back failed')
        }

        this.records.set(recordId, record)
        this.savedSessions.set(sessionId, record)
        result = { success: true, record, created: true }
      } catch (error) {
        result = { success: false, error: `Unable to save Chord report: ${String(error)}` }
      }
    })
    this.writeQueue = operation.catch(() => {})
    await operation
    return result
  }

  async flush(): Promise<void> {
    await this.writeQueue
  }

  private reportKey(recordId: string): string {
    return `${CHORD_REPORT_STORAGE_KEYS.reportPrefix}${recordId}`
  }
}

function sequenceOf(recordId: string): number {
  return Number(recordId.slice('chord-report-'.length))
}

export interface ChordPersistenceSnapshot {
  readonly status: 'loading' | 'ready' | 'saving' | 'error'
  readonly records: readonly ChordPracticeReportV1[]
  readonly warning: string | null
  readonly error: string | null
  readonly errorContext: 'load' | 'save' | null
}

export class ChordReportPersistenceCoordinator {
  private readonly listeners = new Set<() => void>()
  private readonly sessionStarts = new Map<string, number>()
  private readonly finalizedSessions = new Set<string>()
  private snapshotValue: ChordPersistenceSnapshot = Object.freeze({ status: 'loading', records: [], warning: null, error: null, errorContext: null })

  constructor(
    private readonly repository: ChordReportRepository,
    private readonly wallClock: { now(): number } = { now: () => Date.now() }
  ) {}

  get snapshot(): ChordPersistenceSnapshot {
    return this.snapshotValue
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  beginSession(sessionId: string): void {
    if (!this.sessionStarts.has(sessionId)) this.sessionStarts.set(sessionId, this.wallClock.now())
  }

  async initialize(): Promise<ChordReportLoadResult> {
    this.update({ status: 'loading', error: null, errorContext: null })
    const result = await this.repository.initialize()
    this.update({
      status: result.success ? 'ready' : 'error',
      records: result.records,
      warning: result.diagnostics.missingRecordIds.length + result.diagnostics.invalidRecordIds.length > 0
        ? '部分和弦记录无法读取，其他有效记录仍可正常显示。'
        : null,
      error: result.success ? null : result.error,
      errorContext: result.success ? null : 'load'
    })
    return result
  }

  async finalize(
    sessionId: string,
    snapshot: ChordRuntimeSnapshot,
    completionReason: ChordPracticeReportV1['completionReason']
  ): Promise<ChordReportSaveResult | null> {
    if (this.finalizedSessions.has(sessionId)) return null
    this.finalizedSessions.add(sessionId)
    if (snapshot.counters.completedQuestions === 0) return null
    const endedAtEpochMs = this.wallClock.now()
    let draft: ChordPracticeReportDraft
    try {
      draft = createChordPracticeReportDraft(snapshot, {
        startedAtEpochMs: this.sessionStarts.get(sessionId) ?? endedAtEpochMs,
        endedAtEpochMs,
        completionReason
      })
    } catch (error) {
      const result: ChordReportSaveResult = { success: false, error: String(error) }
      this.update({ status: 'error', error: result.error, errorContext: 'save' })
      return result
    }
    this.update({ status: 'saving', error: null, errorContext: null })
    const result = await this.repository.saveForSession(sessionId, draft)
    this.update({
      status: result.success ? 'ready' : 'error',
      records: this.repository.list(),
      error: result.success ? null : result.error,
      errorContext: result.success ? null : 'save'
    })
    return result
  }

  async refresh(): Promise<ChordReportLoadResult> {
    return this.initialize()
  }

  async flush(): Promise<void> {
    await this.repository.flush()
  }

  private update(changes: Partial<ChordPersistenceSnapshot>): void {
    this.snapshotValue = Object.freeze({ ...this.snapshotValue, ...changes })
    for (const listener of this.listeners) listener()
  }
}
