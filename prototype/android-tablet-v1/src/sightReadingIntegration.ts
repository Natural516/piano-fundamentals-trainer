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
  createSightReadingSettingsStore,
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

export interface AndroidSightReadingRuntimeDependencies {
  clock: Clock
  scheduler: Scheduler
  random: () => number
  bluetoothPlugin?: AndroidBluetoothMidiPlugin | null
  initialMidiSource?: AndroidMidiInputSource
}

export type AndroidSightReadingUiState =
  | 'ready'
  | 'active'
  | 'correct'
  | 'wrong'
  | 'timeout'
  | 'result'

class InMemoryKeyValueAdapter {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

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
  private readonly settingsStore
  private settingsValue: SightReadingSettings
  private savedReport: SightReadingSessionReport | null = null
  private readonly listeners = new Set<() => void>()
  private midiResumeRequiredValue = false

  constructor(dependencies: AndroidSightReadingRuntimeDependencies) {
    const storage = new InMemoryKeyValueAdapter()
    this.settingsStore = createSightReadingSettingsStore(storage, ANDROID_SIGHT_READING_DEFAULTS)
    this.settingsValue = this.settingsStore.read().settings

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
      if (report && report !== this.savedReport) {
        const saved = saveSightReadingReport(report, this.reports)
        if (saved.success) this.savedReport = report
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

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  updateSettings(changes: Partial<SightReadingSettings>): SightReadingWriteResult {
    if (this.snapshot.status === 'running') {
      return { success: false, error: 'Settings are locked during a running session.' }
    }
    const next = migrateSightReadingSettings({ ...this.settingsValue, ...changes }, ANDROID_SIGHT_READING_DEFAULTS)
    const result = this.settingsStore.write(next)
    if (!result.success) return result
    this.settingsValue = next
    this.controller.reset(next)
    return result
  }

  start(): void {
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
    const target = this.snapshot.currentNote?.midiNumber
    return typeof target === 'number' ? this.midi.emitNoteOn(target) : null
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

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

export function createBrowserAndroidSightReadingRuntime(options?: { nativeBluetooth?: boolean }): AndroidSightReadingRuntime {
  const nativeBluetooth = options?.nativeBluetooth ?? false
  return new AndroidSightReadingRuntime({
    clock: { now: () => performance.now() },
    scheduler: {
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancel: (id) => window.clearTimeout(id)
    },
    random: () => Math.random(),
    bluetoothPlugin: nativeBluetooth ? NativeAndroidBluetoothMidi : null,
    initialMidiSource: nativeBluetooth ? 'bluetooth' : 'development'
  })
}
