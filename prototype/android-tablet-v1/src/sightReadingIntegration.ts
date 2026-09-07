import {
  SightReadingController,
  type Clock,
  type Scheduler
} from '../../../src/sightReading/controller'
import type { SightReadingMidiEvent } from '../../../src/sightReading/midi'
import {
  saveSightReadingReport,
  type SightReadingSessionReport
} from '../../../src/sightReading/report'
import {
  ANDROID_SIGHT_READING_DEFAULTS,
  migrateSightReadingSettings,
  type SightReadingSettings,
  type SightReadingWriteResult
} from '../../../src/sightReading/sightReadingSettings'
import {
  AndroidBluetoothMidiAdapter,
  NativeAndroidBluetoothMidi,
  type AndroidBluetoothMidiPlugin,
  type AndroidBluetoothMidiSnapshot
} from './androidBluetoothMidi'
import {
  AndroidMidiInputRouter,
  type AndroidMidiInputSource,
  type RoutedMidiPayload
} from './androidBluetoothMidiCore'
import { CapacitorPreferencesBackend } from './androidPersistence'
import {
  createDurableSightReadingReport,
  initializeAndroidPersistence,
  type DurableSightReadingReport,
  type PersistenceStatus,
  type ReportLoadResult,
  type SightReadingReportRepository as DurableReportRepository,
  type SightReadingSettingsRepository as DurableSettingsRepository
} from './androidPersistenceCore'

export interface AndroidSightReadingRuntimeDependencies {
  clock: Clock
  scheduler: Scheduler
  random: () => number
  bluetoothPlugin?: AndroidBluetoothMidiPlugin | null
  initialMidiSource?: AndroidMidiInputSource
  initialSettings?: SightReadingSettings
  initialSettingsPersisted?: boolean
  settingsRepository?: DurableSettingsRepository | null
  reportRepository?: DurableReportRepository | null
  initialSettingsError?: string | null
  initialReportsError?: string | null
  initialHistoryWarning?: string | null
  wallClock?: { now(): number }
  idGenerator?: () => string
}

export type AndroidSightReadingUiState =
  | 'ready'
  | 'active'
  | 'correct'
  | 'wrong'
  | 'timeout'
  | 'result'

export class InMemorySightReadingReportRepository {
  private readonly reports: SightReadingSessionReport[] = []

  save(report: SightReadingSessionReport): SightReadingWriteResult {
    this.reports.push(report)
    return { success: true }
  }

  list(): readonly SightReadingSessionReport[] {
    return [...this.reports]
  }

  latest(): SightReadingSessionReport | null {
    return this.reports[this.reports.length - 1] ?? null
  }
}

export class DevelopmentMidiAdapter {
  private readonly emittedEvents: SightReadingMidiEvent[] = []

  constructor(private readonly router: AndroidMidiInputRouter) {}

  events(): readonly SightReadingMidiEvent[] {
    return [...this.emittedEvents]
  }

  emitNoteOn(midiNumber: number, velocity = 100): SightReadingMidiEvent | null {
    return this.emit({ type: 'noteOn', midiNumber, velocity })
  }

  emitNoteOff(midiNumber: number, velocity = 0): SightReadingMidiEvent | null {
    return this.emit({ type: 'noteOff', midiNumber, velocity })
  }

  emitControlChange(controllerNumber: number, value: number): SightReadingMidiEvent | null {
    return this.emit({ type: 'controlChange', controllerNumber, controllerValue: value })
  }

  private emit(event: Omit<RoutedMidiPayload, 'channel' | 'status'>): SightReadingMidiEvent | null {
    const accepted = this.router.emit('development', {
      ...event,
      channel: 0,
      status: event.type === 'noteOff' ? 0x80 : event.type === 'controlChange' ? 0xb0 : 0x90
    })
    if (accepted) this.emittedEvents.push(accepted)
    return accepted
  }
}

type ControllerSnapshot = SightReadingController['snapshot']

export interface AndroidPersistenceSnapshot {
  settingsStatus: PersistenceStatus
  settingsError: string | null
  reportStatus: PersistenceStatus
  reportError: string | null
  durableReportCount: number
  pendingReportCount: number
}

export interface AndroidHistoryRepositorySnapshot {
  status: 'loading' | 'ready' | 'error'
  records: readonly DurableSightReadingReport[]
  warning: string | null
  error: string | null
}

function historyWarning(result: ReportLoadResult): string | null {
  return result.diagnostics.invalidRecordKeys.length > 0
    ? '部分练习记录无法读取，其他有效记录仍可正常显示。'
    : null
}

export function getAndroidSightReadingUiState(snapshot: ControllerSnapshot): AndroidSightReadingUiState {
  if (snapshot.status === 'finished') return 'result'
  if (snapshot.status !== 'running') return 'ready'
  if (snapshot.phase !== 'feedback') return 'active'
  if (snapshot.result === 'correct') return 'correct'
  if (snapshot.result === 'wrong_note') return 'wrong'
  if (snapshot.result === 'timeout') return 'timeout'
  return 'active'
}

export function formatReactionTime(reactionMs: number | null): string {
  return reactionMs === null ? '—' : `${(reactionMs / 1000).toFixed(2)} 秒`
}

export function getPrimaryErrorNote(report: SightReadingSessionReport): string | null {
  return report.weakestNote === '暂无' ? null : report.weakestNote
}

export class AndroidSightReadingRuntime {
  readonly reports = new InMemorySightReadingReportRepository()
  readonly midi: DevelopmentMidiAdapter
  readonly bluetooth: AndroidBluetoothMidiAdapter
  readonly controller: SightReadingController
  readonly midiRouter: AndroidMidiInputRouter
  private readonly settingsRepository: DurableSettingsRepository | null
  private readonly reportRepository: DurableReportRepository | null
  private readonly wallClock: { now(): number }
  private readonly idGenerator: () => string
  private settingsValue: SightReadingSettings
  private observedReport: SightReadingSessionReport | null = null
  private sessionStartedAt: number | null = null
  private sessionSettings: SightReadingSettings | null = null
  private readonly pendingReportRecords = new Map<string, DurableSightReadingReport>()
  private settingsWriteQueue: Promise<void> = Promise.resolve()
  private reportWriteQueue: Promise<void> = Promise.resolve()
  private settingsSaveGeneration = 0
  private persistenceValue: AndroidPersistenceSnapshot
  private historyStatusValue: AndroidHistoryRepositorySnapshot['status']
  private historyWarningValue: string | null
  private historyErrorValue: string | null
  private readonly listeners = new Set<() => void>()
  private midiResumeRequiredValue = false

  constructor(dependencies: AndroidSightReadingRuntimeDependencies) {
    this.settingsRepository = dependencies.settingsRepository ?? null
    this.reportRepository = dependencies.reportRepository ?? null
    this.wallClock = dependencies.wallClock ?? { now: () => Date.now() }
    this.idGenerator = dependencies.idGenerator ?? createProductionRecordId
    this.settingsValue = migrateSightReadingSettings(
      dependencies.initialSettings ?? ANDROID_SIGHT_READING_DEFAULTS,
      ANDROID_SIGHT_READING_DEFAULTS
    )
    this.persistenceValue = {
      settingsStatus: dependencies.initialSettingsError
        ? 'error'
        : dependencies.initialSettingsPersisted ? 'saved' : 'idle',
      settingsError: dependencies.initialSettingsError ?? null,
      reportStatus: dependencies.initialReportsError ? 'error' : this.reportRepository ? 'saved' : 'idle',
      reportError: dependencies.initialReportsError ?? null,
      durableReportCount: this.reportRepository?.list().length ?? 0,
      pendingReportCount: 0
    }
    this.historyStatusValue = dependencies.initialReportsError ? 'error' : 'ready'
    this.historyWarningValue = dependencies.initialHistoryWarning ?? null
    this.historyErrorValue = dependencies.initialReportsError ?? null

    let controller: SightReadingController
    this.midiRouter = new AndroidMidiInputRouter(
      dependencies.clock,
      (event) => controller.handleMidi(event),
      dependencies.initialMidiSource ?? 'development'
    )
    this.midi = new DevelopmentMidiAdapter(this.midiRouter)
    controller = new SightReadingController(this.settingsValue, {
      ...dependencies,
      readMidiWatermark: this.midiRouter.readWatermark
    })
    this.controller = controller
    this.bluetooth = new AndroidBluetoothMidiAdapter(
      dependencies.bluetoothPlugin ?? null,
      this.midiRouter,
      {
        onTransportLost: () => this.handleBluetoothTransportLost(),
        onTransportReady: () => this.handleBluetoothTransportReady(),
        onChange: () => this.notify()
      }
    )
    this.controller.subscribe(() => {
      const report = this.controller.snapshot.report
      if (report && report !== this.observedReport) {
        const saved = saveSightReadingReport(report, this.reports)
        if (saved.success) {
          this.observedReport = report
          this.queueDurableReport(report)
        }
      }
      this.notify()
    })
  }

  get settings(): SightReadingSettings {
    return { ...this.settingsValue }
  }

  get snapshot(): ControllerSnapshot {
    return this.controller.snapshot
  }

  get uiState(): AndroidSightReadingUiState {
    return getAndroidSightReadingUiState(this.snapshot)
  }

  get midiSource(): AndroidMidiInputSource {
    return this.midiRouter.activeSource
  }

  get midiResumeRequired(): boolean {
    return this.midiResumeRequiredValue
  }

  get bluetoothSnapshot(): AndroidBluetoothMidiSnapshot {
    return this.bluetooth.snapshot
  }

  get persistenceSnapshot(): AndroidPersistenceSnapshot {
    return { ...this.persistenceValue }
  }

  get historySnapshot(): AndroidHistoryRepositorySnapshot {
    return {
      status: this.historyStatusValue,
      records: this.reportRepository?.list() ?? [],
      warning: this.historyWarningValue,
      error: this.historyErrorValue
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  async updateSettings(changes: Partial<SightReadingSettings>): Promise<SightReadingWriteResult> {
    if (this.snapshot.status === 'running') {
      return { success: false, error: 'Settings are locked during a running session.' }
    }
    const next = migrateSightReadingSettings({ ...this.settingsValue, ...changes }, ANDROID_SIGHT_READING_DEFAULTS)
    this.settingsValue = next
    this.controller.reset(next)
    this.notify()
    if (!this.settingsRepository) return { success: true }

    const generation = ++this.settingsSaveGeneration
    this.persistenceValue.settingsStatus = 'saving'
    this.persistenceValue.settingsError = null
    this.notify()
    let result: SightReadingWriteResult = { success: false, error: 'Settings save did not run' }
    const operation = this.settingsWriteQueue.then(async () => {
      result = await this.settingsRepository!.save(next)
    })
    this.settingsWriteQueue = operation.catch(() => {})
    try {
      await operation
    } catch (error) {
      result = { success: false, error: String(error) }
    }
    if (generation === this.settingsSaveGeneration) {
      this.persistenceValue.settingsStatus = result.success ? 'saved' : 'error'
      this.persistenceValue.settingsError = result.success ? null : result.error
      this.notify()
    }
    return result
  }

  retrySettingsPersistence(): Promise<SightReadingWriteResult> {
    return this.updateSettings({})
  }

  async retryReportPersistence(): Promise<SightReadingWriteResult> {
    if (!this.reportRepository) return { success: true }
    if (this.pendingReportRecords.size === 0) {
      const result = await this.reportRepository.initialize()
      this.persistenceValue.reportStatus = result.success ? 'saved' : 'error'
      this.persistenceValue.reportError = result.success ? null : result.error
      this.persistenceValue.durableReportCount = result.records.length
      this.notify()
      return result.success ? { success: true } : { success: false, error: result.error }
    }
    for (const record of [...this.pendingReportRecords.values()]) this.enqueueDurableReportSave(record)
    await this.reportWriteQueue
    return this.pendingReportRecords.size === 0
      ? { success: true }
      : { success: false, error: this.persistenceValue.reportError ?? 'Unable to save Sight Reading report' }
  }

  async refreshHistory(): Promise<ReportLoadResult | null> {
    if (!this.reportRepository) return null
    this.historyStatusValue = 'loading'
    this.historyErrorValue = null
    this.notify()
    await this.reportWriteQueue
    const result = await this.reportRepository.initialize()
    this.historyStatusValue = result.success ? 'ready' : 'error'
    this.historyWarningValue = historyWarning(result)
    this.historyErrorValue = result.success ? null : result.error
    this.persistenceValue.durableReportCount = result.records.length
    this.notify()
    return result
  }

  async flushPersistence(): Promise<void> {
    await Promise.all([this.settingsWriteQueue, this.reportWriteQueue])
  }

  start(): void {
    this.sessionStartedAt = this.wallClock.now()
    this.sessionSettings = { ...this.settingsValue }
    this.controller.start(this.settingsValue)
    if (this.midiSource === 'bluetooth' && this.bluetoothSnapshot.connectionState !== 'CONNECTED') {
      this.midiResumeRequiredValue = true
      this.controller.disconnect()
    } else {
      this.midiResumeRequiredValue = false
    }
  }

  restart(): void {
    this.start()
  }

  pause(): void {
    this.controller.pause()
  }

  resume(): void {
    if (this.midiSource === 'bluetooth') {
      if (this.bluetoothSnapshot.connectionState !== 'CONNECTED') return
      this.controller.reconnect()
    } else if (this.midiResumeRequiredValue) {
      this.controller.reconnect()
    }
    this.controller.resume()
    this.midiResumeRequiredValue = false
    this.notify()
  }

  stop(): SightReadingSessionReport | null {
    return this.controller.stop()
  }

  sendCorrect(): SightReadingMidiEvent | null {
    const targets = this.snapshot.currentTargetNotes.map((note) => note.midiNumber)
    if (targets.length === 0) return null
    let event: SightReadingMidiEvent | null = null
    for (const target of targets) event = this.midi.emitNoteOn(target)
    return event
  }

  sendWrong(): SightReadingMidiEvent | null {
    const target = this.snapshot.currentNote?.midiNumber
    if (typeof target !== 'number') return null
    const wrongMidi = target >= 108 ? target - 1 : target + 1
    return this.midi.emitNoteOn(wrongMidi)
  }

  sendMidi(midiNumber: number): SightReadingMidiEvent | null {
    if (!Number.isInteger(midiNumber) || midiNumber < 0 || midiNumber > 127) return null
    return this.midi.emitNoteOn(midiNumber)
  }

  sendVelocityZero(midiNumber: number): SightReadingMidiEvent | null {
    if (!Number.isInteger(midiNumber) || midiNumber < 0 || midiNumber > 127) return null
    return this.midi.emitNoteOn(midiNumber, 0)
  }

  getRemainingTimeMs(): number {
    return this.controller.getRemainingTimeMs()
  }

  async startMidi(): Promise<void> {
    await this.bluetooth.start()
  }

  setMidiInputSource(source: AndroidMidiInputSource): void {
    if (!this.midiRouter.setActiveSource(source)) return
    this.midiResumeRequiredValue = this.snapshot.status === 'running'
    if (this.snapshot.status === 'running') {
      this.controller.disconnect()
      if (source === 'development' || this.bluetoothSnapshot.connectionState === 'CONNECTED') {
        this.controller.reconnect()
      }
    }
    this.notify()
  }

  async suspendForAppLifecycle(): Promise<void> {
    this.midiRouter.advanceWatermark()
    if (this.snapshot.status === 'running') {
      this.midiResumeRequiredValue = true
      this.controller.disconnect()
    }
    await this.bluetooth.suspendDelivery()
    this.notify()
  }

  async resumeFromAppLifecycle(): Promise<void> {
    await this.bluetooth.resumeDelivery()
    await this.bluetooth.refresh()
    if (this.snapshot.status === 'running') {
      if (this.midiSource === 'development' || this.bluetoothSnapshot.connectionState === 'CONNECTED') {
        this.controller.reconnect()
      }
    }
    this.notify()
  }

  async dispose(): Promise<void> {
    await this.bluetooth.dispose()
    this.controller.dispose()
  }

  private handleBluetoothTransportLost(): void {
    if (this.midiSource !== 'bluetooth' || this.snapshot.status !== 'running') return
    this.midiResumeRequiredValue = true
    this.controller.disconnect()
  }

  private handleBluetoothTransportReady(): void {
    if (this.midiSource !== 'bluetooth' || this.snapshot.status !== 'running') return
    this.controller.reconnect()
    this.midiResumeRequiredValue = true
    this.notify()
  }

  private queueDurableReport(report: SightReadingSessionReport): void {
    if (!this.reportRepository) return
    try {
      const endedAt = this.wallClock.now()
      const record = createDurableSightReadingReport(report, {
        recordId: this.idGenerator(),
        startedAt: this.sessionStartedAt ?? endedAt,
        endedAt,
        settings: this.sessionSettings ?? this.settingsValue
      })
      this.pendingReportRecords.set(record.recordId, record)
      this.persistenceValue.pendingReportCount = this.pendingReportRecords.size
      this.enqueueDurableReportSave(record)
    } catch (error) {
      this.persistenceValue.reportStatus = 'error'
      this.persistenceValue.reportError = String(error)
    }
  }

  private enqueueDurableReportSave(record: DurableSightReadingReport): void {
    if (!this.reportRepository) return
    this.persistenceValue.reportStatus = 'saving'
    this.persistenceValue.reportError = null
    this.reportWriteQueue = this.reportWriteQueue.then(async () => {
      const result = await this.reportRepository!.save(record)
      if (result.success) {
        this.pendingReportRecords.delete(record.recordId)
        this.persistenceValue.reportStatus = this.pendingReportRecords.size === 0 ? 'saved' : 'saving'
        this.persistenceValue.reportError = null
        this.persistenceValue.durableReportCount = this.reportRepository!.list().length
      } else {
        this.persistenceValue.reportStatus = 'error'
        this.persistenceValue.reportError = result.error
      }
      this.persistenceValue.pendingReportCount = this.pendingReportRecords.size
      this.notify()
    }).catch((error) => {
      this.persistenceValue.reportStatus = 'error'
      this.persistenceValue.reportError = String(error)
      this.persistenceValue.pendingReportCount = this.pendingReportRecords.size
      this.notify()
    })
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

function createProductionRecordId(): string {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
    return `sr-${[...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')}`
  }
  throw new Error('Secure record ID generation is unavailable')
}

export async function createBrowserAndroidSightReadingRuntime(options?: { nativeBluetooth?: boolean }): Promise<AndroidSightReadingRuntime> {
  const nativeBluetooth = options?.nativeBluetooth ?? false
  const persistence = await initializeAndroidPersistence(CapacitorPreferencesBackend)
  return new AndroidSightReadingRuntime({
    clock: { now: () => performance.now() },
    scheduler: {
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancel: (id) => window.clearTimeout(id)
    },
    random: () => Math.random(),
    bluetoothPlugin: nativeBluetooth ? NativeAndroidBluetoothMidi : null,
    initialMidiSource: nativeBluetooth ? 'bluetooth' : 'development',
    initialSettings: persistence.settingsLoad.settings,
    initialSettingsPersisted: persistence.settingsLoad.success && persistence.settingsLoad.source === 'stored',
    settingsRepository: persistence.settings,
    reportRepository: persistence.reports,
    initialSettingsError: persistence.settingsLoad.success ? null : persistence.settingsLoad.error,
    initialReportsError: persistence.reportLoad.success ? null : persistence.reportLoad.error,
    initialHistoryWarning: historyWarning(persistence.reportLoad),
    wallClock: { now: () => Date.now() },
    idGenerator: createProductionRecordId
  })
}
