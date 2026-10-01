import type { PreferencesBackend } from '../androidPersistenceCore'
import type { IntervalSessionSnapshot } from './sessionRuntime'
import {
  INTERVAL_REPORT_SCHEMA_VERSION,
  buildIntervalPracticeReport,
  createIntervalPracticeReport,
  freezeIntervalPracticeReport,
  isIntervalPracticeReportV1,
  type IntervalPracticeReportDraft,
  type IntervalPracticeReportV1
} from './report'

export const INTERVAL_REPORT_STORAGE_KEYS = Object.freeze({
  reportPrefix: 'piano.v1.interval.report.',
  reportIndex: 'piano.v1.interval.reportIndex'
})

interface IntervalReportIndexV1 {
  readonly schemaVersion: typeof INTERVAL_REPORT_SCHEMA_VERSION
  readonly nextSequence: number
  readonly recordIds: readonly string[]
}

export interface IntervalReportLoadDiagnostics {
  readonly missingRecordIds: readonly string[]
  readonly invalidRecordIds: readonly string[]
}

export type IntervalReportLoadResult =
  | { readonly success: true; readonly records: readonly IntervalPracticeReportV1[]; readonly diagnostics: IntervalReportLoadDiagnostics }
  | { readonly success: false; readonly records: readonly IntervalPracticeReportV1[]; readonly diagnostics: IntervalReportLoadDiagnostics; readonly error: string }

export type IntervalReportSaveResult =
  | { readonly success: true; readonly record: IntervalPracticeReportV1; readonly created: boolean }
  | { readonly success: false; readonly error: string }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseIndex(raw: string | null): IntervalReportIndexV1 {
  if (raw === null) return Object.freeze({ schemaVersion: 1, nextSequence: 1, recordIds: Object.freeze([]) })
  const parsed: unknown = JSON.parse(raw)
  if (!isObject(parsed) || parsed.schemaVersion !== INTERVAL_REPORT_SCHEMA_VERSION
    || !Number.isInteger(parsed.nextSequence) || Number(parsed.nextSequence) < 1
    || !Array.isArray(parsed.recordIds)
    || !parsed.recordIds.every((id) => typeof id === 'string' && /^interval-report-[1-9]\d*$/.test(id))) {
    throw new Error('Interval report index is malformed or has an unsupported schema')
  }
  return Object.freeze({
    schemaVersion: INTERVAL_REPORT_SCHEMA_VERSION,
    nextSequence: Number(parsed.nextSequence),
    recordIds: Object.freeze([...new Set(parsed.recordIds as string[])])
  })
}

export class IntervalReportRepository {
  private readonly records = new Map<string, IntervalPracticeReportV1>()
  private readonly savedSessions = new Map<string, IntervalPracticeReportV1>()
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly backend: PreferencesBackend) {}

  list(): readonly IntervalPracticeReportV1[] {
    return Object.freeze([...this.records.values()].sort((left, right) => (
      right.finishedAtEpochMs - left.finishedAtEpochMs || sequenceOf(right.recordId) - sequenceOf(left.recordId)
    )))
  }

  async initialize(): Promise<IntervalReportLoadResult> {
    await this.writeQueue
    const diagnostics = { missingRecordIds: [] as string[], invalidRecordIds: [] as string[] }
    try {
      const index = parseIndex((await this.backend.get({ key: INTERVAL_REPORT_STORAGE_KEYS.reportIndex })).value)
      const loaded = new Map<string, IntervalPracticeReportV1>()
      for (const recordId of index.recordIds) {
        const raw = (await this.backend.get({ key: this.reportKey(recordId) })).value
        if (raw === null) {
          diagnostics.missingRecordIds.push(recordId)
          continue
        }
        try {
          const parsed: unknown = JSON.parse(raw)
          if (!isIntervalPracticeReportV1(parsed) || parsed.recordId !== recordId) diagnostics.invalidRecordIds.push(recordId)
          else loaded.set(recordId, freezeIntervalPracticeReport(parsed))
        } catch {
          diagnostics.invalidRecordIds.push(recordId)
        }
      }
      this.records.clear()
      for (const [id, record] of loaded) this.records.set(id, record)
      return { success: true, records: this.list(), diagnostics }
    } catch (error) {
      return { success: false, records: this.list(), diagnostics, error: `Unable to load Interval reports: ${String(error)}` }
    }
  }

  async saveForSession(sessionId: string, draft: IntervalPracticeReportDraft): Promise<IntervalReportSaveResult> {
    if (!sessionId) return { success: false, error: 'Interval logical session identity is missing' }
    let result: IntervalReportSaveResult = { success: false, error: 'Interval report save did not run' }
    const operation = this.writeQueue.then(async () => {
      const existing = this.savedSessions.get(sessionId)
      if (existing) {
        result = { success: true, record: existing, created: false }
        return
      }
      try {
        const index = parseIndex((await this.backend.get({ key: INTERVAL_REPORT_STORAGE_KEYS.reportIndex })).value)
        let sequence = index.nextSequence
        while ((await this.backend.get({ key: this.reportKey(`interval-report-${sequence}`) })).value !== null) sequence += 1
        const recordId = `interval-report-${sequence}`
        const record = createIntervalPracticeReport(recordId, draft)
        const serializedRecord = JSON.stringify(record)
        await this.backend.set({ key: this.reportKey(recordId), value: serializedRecord })
        if ((await this.backend.get({ key: this.reportKey(recordId) })).value !== serializedRecord) throw new Error('Interval report body read-back failed')
        const nextIndex: IntervalReportIndexV1 = Object.freeze({
          schemaVersion: INTERVAL_REPORT_SCHEMA_VERSION,
          nextSequence: sequence + 1,
          recordIds: Object.freeze([...index.recordIds, recordId])
        })
        const serializedIndex = JSON.stringify(nextIndex)
        await this.backend.set({ key: INTERVAL_REPORT_STORAGE_KEYS.reportIndex, value: serializedIndex })
        if ((await this.backend.get({ key: INTERVAL_REPORT_STORAGE_KEYS.reportIndex })).value !== serializedIndex) throw new Error('Interval report index read-back failed')
        this.records.set(recordId, record)
        this.savedSessions.set(sessionId, record)
        result = { success: true, record, created: true }
      } catch (error) {
        result = { success: false, error: `Unable to save Interval report: ${String(error)}` }
      }
    })
    this.writeQueue = operation.catch(() => {})
    await operation
    return result
  }

  async flush(): Promise<void> { await this.writeQueue }
  private reportKey(recordId: string): string { return `${INTERVAL_REPORT_STORAGE_KEYS.reportPrefix}${recordId}` }
}

function sequenceOf(recordId: string): number { return Number(recordId.slice('interval-report-'.length)) }

export interface IntervalPersistenceSnapshot {
  readonly status: 'loading' | 'ready' | 'saving' | 'error'
  readonly records: readonly IntervalPracticeReportV1[]
  readonly latestReport: IntervalPracticeReportDraft | null
  readonly warning: string | null
  readonly error: string | null
  readonly errorContext: 'load' | 'save' | null
  readonly pendingSaveCount: number
}

export class IntervalReportPersistenceCoordinator {
  private readonly listeners = new Set<() => void>()
  private readonly sessionStarts = new Map<string, number>()
  private readonly pendingDrafts = new Map<string, IntervalPracticeReportDraft>()
  private readonly savedSessions = new Set<string>()
  private snapshotValue: IntervalPersistenceSnapshot = Object.freeze({
    status: 'loading', records: [], latestReport: null, warning: null, error: null, errorContext: null, pendingSaveCount: 0
  })

  constructor(
    private readonly repository: IntervalReportRepository,
    private readonly wallClock: { now(): number } = { now: () => Date.now() }
  ) {}

  get snapshot(): IntervalPersistenceSnapshot { return this.snapshotValue }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  beginSession(sessionId: string): void { if (!this.sessionStarts.has(sessionId)) this.sessionStarts.set(sessionId, this.wallClock.now()) }

  async initialize(): Promise<IntervalReportLoadResult> {
    this.update({ status: 'loading', error: null, errorContext: null })
    const result = await this.repository.initialize()
    this.update({
      status: result.success ? 'ready' : 'error',
      records: result.records,
      warning: result.diagnostics.missingRecordIds.length + result.diagnostics.invalidRecordIds.length > 0
        ? '部分音程记录无法读取，其他有效记录仍可正常显示。' : null,
      error: result.success ? null : result.error,
      errorContext: result.success ? null : 'load'
    })
    return result
  }

  async finalize(
    sessionId: string,
    snapshot: IntervalSessionSnapshot,
    completionStatus: IntervalPracticeReportDraft['completionStatus']
  ): Promise<IntervalReportSaveResult | null> {
    if (this.savedSessions.has(sessionId)) return null
    let draft = this.pendingDrafts.get(sessionId)
    if (!draft) {
      const finishedAtEpochMs = this.wallClock.now()
      try {
        draft = buildIntervalPracticeReport(snapshot, {
          startedAtEpochMs: this.sessionStarts.get(sessionId) ?? finishedAtEpochMs,
          finishedAtEpochMs,
          completionStatus
        })
        this.pendingDrafts.set(sessionId, draft)
      } catch (error) {
        this.update({ status: 'error', error: String(error), errorContext: 'save' })
        return { success: false, error: String(error) }
      }
    }
    this.update({ latestReport: draft, status: 'saving', error: null, errorContext: null, pendingSaveCount: this.pendingDrafts.size })
    return this.savePendingSession(sessionId, draft)
  }

  async retryPending(): Promise<readonly IntervalReportSaveResult[]> {
    const results: IntervalReportSaveResult[] = []
    for (const [sessionId, draft] of [...this.pendingDrafts]) results.push(await this.savePendingSession(sessionId, draft))
    if (results.length === 0 && this.snapshotValue.errorContext === 'load') await this.initialize()
    return Object.freeze(results)
  }

  async refresh(): Promise<IntervalReportLoadResult> { return this.initialize() }
  async flush(): Promise<void> { await this.repository.flush() }

  private async savePendingSession(sessionId: string, draft: IntervalPracticeReportDraft): Promise<IntervalReportSaveResult> {
    const result = await this.repository.saveForSession(sessionId, draft)
    if (result.success) {
      this.pendingDrafts.delete(sessionId)
      this.savedSessions.add(sessionId)
    }
    this.update({
      status: result.success ? 'ready' : 'error',
      records: this.repository.list(),
      error: result.success ? null : result.error,
      errorContext: result.success ? null : 'save',
      pendingSaveCount: this.pendingDrafts.size
    })
    return result
  }

  private update(changes: Partial<IntervalPersistenceSnapshot>): void {
    this.snapshotValue = Object.freeze({ ...this.snapshotValue, ...changes })
    for (const listener of this.listeners) listener()
  }
}
