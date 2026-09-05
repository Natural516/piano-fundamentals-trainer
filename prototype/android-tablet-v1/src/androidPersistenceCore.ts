import type { SightReadingSessionReport, SightReadingClefStats } from '../../../src/sightReading/report'
import { isMajorKeyId, type MajorKeyId } from '../../../src/sightReading/musicKeySignatures'
import {
  ANDROID_SIGHT_READING_DEFAULTS,
  SIGHT_READING_ANSWER_TIMEOUT_MS,
  type SightReadingQuestionCount,
  type SightReadingNoteMode,
  type SightReadingSettings,
  type SightReadingWriteResult
} from '../../../src/sightReading/sightReadingSettings'
import type { SightReadingStaffMode } from '../../../src/sightReading/sightReadingNotes'

export const ANDROID_PERSISTENCE_SCHEMA_VERSION = 1 as const
export const ANDROID_PERSISTENCE_KEYS = {
  schemaVersion: 'piano.v1.schemaVersion',
  sightReadingSettings: 'piano.v1.sightReading.settings',
  sightReadingReportPrefix: 'piano.v1.sightReading.report.',
  sightReadingReportIndex: 'piano.v1.sightReading.reportIndex'
} as const

export interface PreferencesBackend {
  get(options: { key: string }): Promise<{ value: string | null }>
  set(options: { key: string; value: string }): Promise<void>
  keys(): Promise<{ keys: string[] }>
}

export type PersistenceStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error'

export interface AndroidSightReadingSettingsDocument {
  schemaVersion: typeof ANDROID_PERSISTENCE_SCHEMA_VERSION
  staffMode: SightReadingStaffMode
  keySignature: MajorKeyId
  notePoolMode: 'diatonic' | 'chromatic'
  questionCount: SightReadingQuestionCount
  answerTimeLimitMs: typeof SIGHT_READING_ANSWER_TIMEOUT_MS
  noteNameVisible: boolean
  /** Optional in schema v1 so code-8 documents remain valid and load as single-note. */
  noteMode?: SightReadingNoteMode
}

export interface DurableSightReadingReport {
  schemaVersion: typeof ANDROID_PERSISTENCE_SCHEMA_VERSION
  recordId: string
  practiceType: 'sightReading'
  completionState: 'completed' | 'stopped'
  partialEvidence: boolean
  startedAt: number
  endedAt: number
  durationMs: number
  settings: AndroidSightReadingSettingsDocument
  plannedQuestionCount: SightReadingQuestionCount
  completed: number
  correct: number
  wrong: number
  timeout: number
  accuracy: number
  averageReactionMs: number | null
  fastestReactionMs: number | null
  slowestReactionMs: number | null
  bestStreak: number
  targetNoteErrors: {
    wrong: Array<{ noteName: string; count: number }>
    timeout: Array<{ noteName: string; count: number }>
  }
  mostWrongNote: string
  mostTimedOutNote: string
  weakestNote: string
  clefStats: {
    treble: SightReadingClefStats
    bass: SightReadingClefStats
  }
}

interface ReportIndexDocument {
  schemaVersion: typeof ANDROID_PERSISTENCE_SCHEMA_VERSION
  recordIds: string[]
}

export type SettingsLoadResult =
  | { success: true; settings: SightReadingSettings; source: 'default' | 'stored' }
  | { success: false; settings: SightReadingSettings; error: string }

export type ReportSaveResult =
  | { success: true; record: DurableSightReadingReport }
  | { success: false; record: DurableSightReadingReport; error: string }

export interface ReportReconciliationDiagnostics {
  recoveredOrphanIds: string[]
  removedStaleIds: string[]
  invalidRecordKeys: string[]
  indexRebuilt: boolean
}

export type ReportLoadResult =
  | { success: true; records: DurableSightReadingReport[]; diagnostics: ReportReconciliationDiagnostics }
  | { success: false; records: DurableSightReadingReport[]; diagnostics: ReportReconciliationDiagnostics; error: string }

const isObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)
const isFiniteNonNegative = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
)
const isIntegerNonNegative = (value: unknown): value is number => (
  Number.isInteger(value) && Number(value) >= 0
)
const isQuestionCount = (value: unknown): value is SightReadingQuestionCount => (
  value === 10 || value === 20 || value === 50 || value === 100
)
const defaultSettings = (): SightReadingSettings => ({ ...ANDROID_SIGHT_READING_DEFAULTS })

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown
}

function settingsDocumentToRuntime(document: AndroidSightReadingSettingsDocument): SightReadingSettings {
  const noteMode = document.noteMode === 'double' ? 'double' : 'single'
  return {
    staffMode: document.staffMode,
    noteCount: noteMode === 'double' ? 2 : 1,
    noteMode,
    questionCount: document.questionCount,
    keySignature: document.keySignature,
    notePoolMode: document.notePoolMode,
    noteNameVisible: document.noteNameVisible
  }
}

export function createSettingsDocument(
  settings: SightReadingSettings,
  includeNoteMode = true
): AndroidSightReadingSettingsDocument {
  if (!isSettingsValueValid(settings)) throw new Error('Android Sight Reading settings are invalid')
  const document: AndroidSightReadingSettingsDocument = {
    schemaVersion: ANDROID_PERSISTENCE_SCHEMA_VERSION,
    staffMode: settings.staffMode,
    keySignature: settings.keySignature,
    notePoolMode: settings.notePoolMode,
    questionCount: settings.questionCount,
    answerTimeLimitMs: SIGHT_READING_ANSWER_TIMEOUT_MS,
    noteNameVisible: settings.noteNameVisible
  }
  if (includeNoteMode) document.noteMode = settings.noteMode
  return document
}

function isSettingsValueValid(settings: SightReadingSettings): boolean {
  return (settings.staffMode === 'treble' || settings.staffMode === 'bass' || settings.staffMode === 'grand') &&
    isMajorKeyId(settings.keySignature) &&
    (settings.notePoolMode === 'diatonic' || settings.notePoolMode === 'chromatic') &&
    isQuestionCount(settings.questionCount) &&
    (settings.noteMode === 'single' || settings.noteMode === 'double') &&
    settings.noteCount === (settings.noteMode === 'double' ? 2 : 1) &&
    typeof settings.noteNameVisible === 'boolean'
}

function isSettingsDocument(value: unknown): value is AndroidSightReadingSettingsDocument {
  if (!isObject(value)) return false
  return value.schemaVersion === ANDROID_PERSISTENCE_SCHEMA_VERSION &&
    (value.staffMode === 'treble' || value.staffMode === 'bass' || value.staffMode === 'grand') &&
    isMajorKeyId(value.keySignature) &&
    (value.notePoolMode === 'diatonic' || value.notePoolMode === 'chromatic') &&
    isQuestionCount(value.questionCount) &&
    value.answerTimeLimitMs === SIGHT_READING_ANSWER_TIMEOUT_MS &&
    typeof value.noteNameVisible === 'boolean' &&
    (value.noteMode === undefined || value.noteMode === 'single' || value.noteMode === 'double')
}

function isNoteCountEntry(value: unknown): value is { noteName: string; count: number } {
  return isObject(value) && typeof value.noteName === 'string' && isIntegerNonNegative(value.count)
}

function isNullableMetric(value: unknown): value is number | null {
  return value === null || isFiniteNonNegative(value)
}

function isClefStats(value: unknown): value is SightReadingClefStats {
  if (!isObject(value)) return false
  return isIntegerNonNegative(value.total) && isIntegerNonNegative(value.correct) &&
    isIntegerNonNegative(value.wrong) && isIntegerNonNegative(value.timeout) &&
    isFiniteNonNegative(value.accuracy)
}

export function isDurableSightReadingReport(value: unknown): value is DurableSightReadingReport {
  if (!isObject(value) || value.schemaVersion !== ANDROID_PERSISTENCE_SCHEMA_VERSION) return false
  if (typeof value.recordId !== 'string' || value.recordId.trim().length === 0) return false
  if (value.practiceType !== 'sightReading') return false
  if (value.completionState !== 'completed' && value.completionState !== 'stopped') return false
  if (value.partialEvidence !== (value.completionState === 'stopped')) return false
  if (!isFiniteNonNegative(value.startedAt) || !isFiniteNonNegative(value.endedAt) || value.endedAt < value.startedAt) return false
  if (!isFiniteNonNegative(value.durationMs) || value.durationMs !== value.endedAt - value.startedAt) return false
  if (!isSettingsDocument(value.settings) || !isQuestionCount(value.plannedQuestionCount)) return false
  if (value.settings.questionCount !== value.plannedQuestionCount) return false
  if (!isIntegerNonNegative(value.completed) || !isIntegerNonNegative(value.correct) ||
    !isIntegerNonNegative(value.wrong) || !isIntegerNonNegative(value.timeout)) return false
  if (value.completed !== value.correct + value.wrong + value.timeout || value.completed > value.plannedQuestionCount) return false
  if (!isFiniteNonNegative(value.accuracy) || !isNullableMetric(value.averageReactionMs) ||
    !isNullableMetric(value.fastestReactionMs) || !isNullableMetric(value.slowestReactionMs) ||
    !isIntegerNonNegative(value.bestStreak)) return false
  if (!isObject(value.targetNoteErrors) || !Array.isArray(value.targetNoteErrors.wrong) ||
    !value.targetNoteErrors.wrong.every(isNoteCountEntry) || !Array.isArray(value.targetNoteErrors.timeout) ||
    !value.targetNoteErrors.timeout.every(isNoteCountEntry)) return false
  if (typeof value.mostWrongNote !== 'string' || typeof value.mostTimedOutNote !== 'string' || typeof value.weakestNote !== 'string') return false
  return isObject(value.clefStats) && isClefStats(value.clefStats.treble) && isClefStats(value.clefStats.bass)
}

export function createDurableSightReadingReport(
  report: SightReadingSessionReport,
  options: {
    recordId: string
    startedAt: number
    endedAt: number
    settings: SightReadingSettings
  }
): DurableSightReadingReport {
  if (!isQuestionCount(report.totalQuestions)) throw new Error('Sight Reading report has an unsupported planned question count')
  const record: DurableSightReadingReport = {
    schemaVersion: ANDROID_PERSISTENCE_SCHEMA_VERSION,
    recordId: options.recordId,
    practiceType: 'sightReading',
    completionState: report.completionState,
    partialEvidence: report.partialEvidence,
    startedAt: options.startedAt,
    endedAt: options.endedAt,
    durationMs: Math.max(0, options.endedAt - options.startedAt),
    // Durable report shape remains code-8-compatible: note mode and interval analytics
    // are intentionally not added to historical records in this phase.
    settings: createSettingsDocument(options.settings, false),
    plannedQuestionCount: report.totalQuestions,
    completed: report.completedQuestions,
    correct: report.correct,
    wrong: report.wrong,
    timeout: report.timeout,
    accuracy: report.accuracy,
    averageReactionMs: report.averageReactionMs,
    fastestReactionMs: report.fastestReactionMs,
    slowestReactionMs: report.slowestReactionMs,
    bestStreak: report.bestStreak,
    targetNoteErrors: {
      wrong: report.wrongNoteCounts.map((entry) => ({ ...entry })),
      timeout: report.timeoutNoteCounts.map((entry) => ({ ...entry }))
    },
    mostWrongNote: report.mostWrongNote,
    mostTimedOutNote: report.mostTimedOutNote,
    weakestNote: report.weakestNote,
    clefStats: { treble: { ...report.treble }, bass: { ...report.bass } }
  }
  if (!isDurableSightReadingReport(record)) throw new Error('Sight Reading report cannot be persisted because its facts are invalid')
  return record
}

export class AndroidPersistenceStore {
  private schemaReady = false

  constructor(readonly backend: PreferencesBackend) {}

  get canWrite(): boolean {
    return this.schemaReady
  }

  async ensureSchema(): Promise<SightReadingWriteResult> {
    try {
      const current = (await this.backend.get({ key: ANDROID_PERSISTENCE_KEYS.schemaVersion })).value
      if (current === null) {
        await this.backend.set({
          key: ANDROID_PERSISTENCE_KEYS.schemaVersion,
          value: String(ANDROID_PERSISTENCE_SCHEMA_VERSION)
        })
        const confirmed = (await this.backend.get({ key: ANDROID_PERSISTENCE_KEYS.schemaVersion })).value
        if (confirmed !== String(ANDROID_PERSISTENCE_SCHEMA_VERSION)) throw new Error('schema read-back failed')
        this.schemaReady = true
        return { success: true }
      }
      if (current !== String(ANDROID_PERSISTENCE_SCHEMA_VERSION)) {
        return { success: false, error: `Unsupported Android persistence schema: ${current}` }
      }
      this.schemaReady = true
      return { success: true }
    } catch (error) {
      return { success: false, error: `Android persistence schema unavailable: ${String(error)}` }
    }
  }
}

export class SightReadingSettingsRepository {
  private futureDocumentDetected = false

  constructor(private readonly store: AndroidPersistenceStore) {}

  async load(): Promise<SettingsLoadResult> {
    try {
      const stored = (await this.store.backend.get({ key: ANDROID_PERSISTENCE_KEYS.sightReadingSettings })).value
      if (stored === null) return { success: true, settings: defaultSettings(), source: 'default' }
      const parsed = parseJson(stored)
      if (isObject(parsed) && parsed.schemaVersion !== ANDROID_PERSISTENCE_SCHEMA_VERSION) {
        this.futureDocumentDetected = true
        return { success: false, settings: defaultSettings(), error: `Unsupported Sight Reading settings schema: ${String(parsed.schemaVersion)}` }
      }
      if (!isSettingsDocument(parsed)) {
        return { success: false, settings: defaultSettings(), error: 'Stored Sight Reading settings are malformed' }
      }
      return { success: true, settings: settingsDocumentToRuntime(parsed), source: 'stored' }
    } catch (error) {
      return { success: false, settings: defaultSettings(), error: `Unable to load Sight Reading settings: ${String(error)}` }
    }
  }

  async save(settings: SightReadingSettings): Promise<SightReadingWriteResult> {
    if (!this.store.canWrite) return { success: false, error: 'Android persistence schema is not writable' }
    if (this.futureDocumentDetected) return { success: false, error: 'Future Sight Reading settings schema was preserved and cannot be overwritten' }
    let document: AndroidSightReadingSettingsDocument
    try {
      document = createSettingsDocument(settings)
    } catch (error) {
      return { success: false, error: String(error) }
    }
    try {
      const value = JSON.stringify(document)
      await this.store.backend.set({ key: ANDROID_PERSISTENCE_KEYS.sightReadingSettings, value })
      const confirmed = (await this.store.backend.get({ key: ANDROID_PERSISTENCE_KEYS.sightReadingSettings })).value
      if (confirmed !== value) throw new Error('settings read-back failed')
      return { success: true }
    } catch (error) {
      return { success: false, error: `Unable to save Sight Reading settings: ${String(error)}` }
    }
  }
}

function parseIndex(value: string | null): { ids: string[]; malformed: boolean; futureSchema: boolean } {
  if (value === null) return { ids: [], malformed: false, futureSchema: false }
  try {
    const parsed = parseJson(value)
    if (!isObject(parsed)) return { ids: [], malformed: true, futureSchema: false }
    if (parsed.schemaVersion !== ANDROID_PERSISTENCE_SCHEMA_VERSION) return { ids: [], malformed: false, futureSchema: true }
    if (!Array.isArray(parsed.recordIds) || !parsed.recordIds.every((id) => typeof id === 'string' && id.length > 0)) {
      return { ids: [], malformed: true, futureSchema: false }
    }
    return { ids: [...new Set(parsed.recordIds)], malformed: false, futureSchema: false }
  } catch {
    return { ids: [], malformed: true, futureSchema: false }
  }
}

export class SightReadingReportRepository {
  private readonly records = new Map<string, DurableSightReadingReport>()

  constructor(private readonly store: AndroidPersistenceStore) {}

  list(): DurableSightReadingReport[] {
    return [...this.records.values()].sort((left, right) => left.endedAt - right.endedAt || left.recordId.localeCompare(right.recordId))
  }

  async initialize(): Promise<ReportLoadResult> {
    const diagnostics: ReportReconciliationDiagnostics = {
      recoveredOrphanIds: [],
      removedStaleIds: [],
      invalidRecordKeys: [],
      indexRebuilt: false
    }
    if (!this.store.canWrite) {
      return {
        success: false,
        records: this.list(),
        diagnostics,
        error: 'Android persistence schema is not available for report reconciliation'
      }
    }
    try {
      const keys = (await this.store.backend.keys()).keys
      const reportKeys = keys.filter((key) => key.startsWith(ANDROID_PERSISTENCE_KEYS.sightReadingReportPrefix))
      const discovered = new Map<string, DurableSightReadingReport>()
      for (const key of reportKeys) {
        const raw = (await this.store.backend.get({ key })).value
        try {
          const parsed = raw === null ? null : parseJson(raw)
          if (!isDurableSightReadingReport(parsed) || key !== this.reportKey(parsed.recordId)) {
            diagnostics.invalidRecordKeys.push(key)
            continue
          }
          discovered.set(parsed.recordId, parsed)
        } catch {
          diagnostics.invalidRecordKeys.push(key)
        }
      }

      const rawIndex = (await this.store.backend.get({ key: ANDROID_PERSISTENCE_KEYS.sightReadingReportIndex })).value
      const index = parseIndex(rawIndex)
      this.records.clear()
      for (const record of discovered.values()) this.records.set(record.recordId, record)
      if (index.futureSchema) {
        return {
          success: false,
          records: this.list(),
          diagnostics,
          error: 'Unsupported Sight Reading report-index schema; existing records were left untouched'
        }
      }

      const retainedIds = index.ids.filter((id) => discovered.has(id))
      diagnostics.removedStaleIds = index.ids.filter((id) => !discovered.has(id))
      diagnostics.recoveredOrphanIds = [...discovered.keys()].filter((id) => !retainedIds.includes(id))
      const reconciledIds = [...retainedIds, ...diagnostics.recoveredOrphanIds]
      const shouldRewrite = index.malformed || rawIndex === null ||
        diagnostics.removedStaleIds.length > 0 || diagnostics.recoveredOrphanIds.length > 0
      if (shouldRewrite) {
        await this.writeIndex(reconciledIds)
        diagnostics.indexRebuilt = true
      }
      return { success: true, records: this.list(), diagnostics }
    } catch (error) {
      return { success: false, records: this.list(), diagnostics, error: `Unable to reconcile Sight Reading reports: ${String(error)}` }
    }
  }

  async save(record: DurableSightReadingReport): Promise<ReportSaveResult> {
    if (!isDurableSightReadingReport(record)) {
      return { success: false, record, error: 'Durable Sight Reading report is invalid' }
    }
    if (!this.store.canWrite) return { success: false, record, error: 'Android persistence schema is not writable' }
    const key = this.reportKey(record.recordId)
    try {
      const serialized = JSON.stringify(record)
      await this.store.backend.set({ key, value: serialized })
      const confirmedRecord = (await this.store.backend.get({ key })).value
      if (confirmedRecord !== serialized) throw new Error('report read-back failed')
    } catch (error) {
      return { success: false, record, error: `Unable to write Sight Reading report: ${String(error)}` }
    }

    try {
      const rawIndex = (await this.store.backend.get({ key: ANDROID_PERSISTENCE_KEYS.sightReadingReportIndex })).value
      const index = parseIndex(rawIndex)
      if (index.futureSchema) throw new Error('unsupported future report-index schema')
      const recordIds = [...new Set([...index.ids, record.recordId])]
      await this.writeIndex(recordIds)
      const confirmedIndex = parseIndex((await this.store.backend.get({ key: ANDROID_PERSISTENCE_KEYS.sightReadingReportIndex })).value)
      if (confirmedIndex.futureSchema || confirmedIndex.malformed || !confirmedIndex.ids.includes(record.recordId)) {
        throw new Error('report index read-back failed')
      }
      this.records.set(record.recordId, record)
      return { success: true, record }
    } catch (error) {
      return { success: false, record, error: `Report written but index update failed: ${String(error)}` }
    }
  }

  private reportKey(recordId: string): string {
    return `${ANDROID_PERSISTENCE_KEYS.sightReadingReportPrefix}${recordId}`
  }

  private async writeIndex(recordIds: string[]): Promise<void> {
    const document: ReportIndexDocument = {
      schemaVersion: ANDROID_PERSISTENCE_SCHEMA_VERSION,
      recordIds: [...new Set(recordIds)]
    }
    await this.store.backend.set({
      key: ANDROID_PERSISTENCE_KEYS.sightReadingReportIndex,
      value: JSON.stringify(document)
    })
  }
}

export interface AndroidPersistenceRepositories {
  store: AndroidPersistenceStore
  settings: SightReadingSettingsRepository
  reports: SightReadingReportRepository
  settingsLoad: SettingsLoadResult
  reportLoad: ReportLoadResult
  schemaError: string | null
}

export async function initializeAndroidPersistence(backend: PreferencesBackend): Promise<AndroidPersistenceRepositories> {
  const store = new AndroidPersistenceStore(backend)
  const settings = new SightReadingSettingsRepository(store)
  const reports = new SightReadingReportRepository(store)
  const schema = await store.ensureSchema()
  if (!schema.success) {
    const diagnostics: ReportReconciliationDiagnostics = {
      recoveredOrphanIds: [], removedStaleIds: [], invalidRecordKeys: [], indexRebuilt: false
    }
    return {
      store,
      settings,
      reports,
      settingsLoad: { success: false, settings: defaultSettings(), error: schema.error },
      reportLoad: { success: false, records: [], diagnostics, error: schema.error },
      schemaError: schema.error
    }
  }
  const settingsLoad = await settings.load()
  const reportLoad = await reports.initialize()
  return { store, settings, reports, settingsLoad, reportLoad, schemaError: null }
}
