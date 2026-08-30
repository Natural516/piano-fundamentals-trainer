import {
  SightReadingController,
  type Clock,
  type Scheduler
} from '../../../src/sightReading/controller'
import {
  normalizeSightReadingMidiEvent,
  type SightReadingMidiEvent
} from '../../../src/sightReading/midi'
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

export interface AndroidSightReadingRuntimeDependencies {
  clock: Clock
  scheduler: Scheduler
  random: () => number
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
  private eventId = 0
  private readonly emittedEvents: SightReadingMidiEvent[] = []

  constructor(
    private readonly clock: Clock,
    private readonly sink: (event: SightReadingMidiEvent) => void
  ) {}

  readWatermark = (): number => this.eventId

  events(): readonly SightReadingMidiEvent[] {
    return [...this.emittedEvents]
  }

  emitNoteOn(midiNumber: number, velocity = 100): SightReadingMidiEvent {
    return this.emit({ type: 'noteOn', midiNumber, velocity })
  }

  emitNoteOff(midiNumber: number, velocity = 0): SightReadingMidiEvent {
    return this.emit({ type: 'noteOff', midiNumber, velocity })
  }

  private emit(event: Omit<SightReadingMidiEvent, 'id' | 'timestamp'>): SightReadingMidiEvent {
    const normalized = normalizeSightReadingMidiEvent({
      ...event,
      id: ++this.eventId,
      timestamp: this.clock.now()
    })
    this.emittedEvents.push(normalized)
    this.sink(normalized)
    return normalized
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
  readonly controller: SightReadingController
  private readonly settingsStore
  private settingsValue: SightReadingSettings
  private savedReport: SightReadingSessionReport | null = null
  private readonly listeners = new Set<() => void>()

  constructor(dependencies: AndroidSightReadingRuntimeDependencies) {
    const storage = new InMemoryKeyValueAdapter()
    this.settingsStore = createSightReadingSettingsStore(storage, ANDROID_SIGHT_READING_DEFAULTS)
    this.settingsValue = this.settingsStore.read().settings

    let controller: SightReadingController
    this.midi = new DevelopmentMidiAdapter(dependencies.clock, (event) => controller.handleMidi(event))
    controller = new SightReadingController(this.settingsValue, {
      ...dependencies,
      readMidiWatermark: this.midi.readWatermark
    })
    this.controller = controller
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
  }

  restart(): void {
    this.start()
  }

  pause(): void {
    this.controller.pause()
  }

  resume(): void {
    this.controller.resume()
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

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

export function createBrowserAndroidSightReadingRuntime(): AndroidSightReadingRuntime {
  return new AndroidSightReadingRuntime({
    clock: { now: () => performance.now() },
    scheduler: {
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancel: (id) => window.clearTimeout(id)
    },
    random: () => Math.random()
  })
}
