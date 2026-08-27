import type { MidiDeviceLifecycleState } from './midiDeviceLifecycle'
import { practiceSessionRepository } from '../records/practiceSessionRepository'

const DIAGNOSTICS_STORAGE_KEY = 'piano-trainer.midi-recovery-diagnostics.v1'

export interface MidiRecoveryDiagnosticSnapshot {
  enabled: boolean
  selectedInputId: string
  selectedInputName: string
  selectedManufacturer: string
  lifecycleState: MidiDeviceLifecycleState
  lastConnectedAt: string | null
  lastDisconnectedAt: string | null
  sessionPage: string
  sessionState: string
  heldNoteCount: number
  sustainPedalDown: boolean
}

function isEnabled(): boolean {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).get('midiRecoveryDiagnostics') === '1'
      || window.localStorage.getItem(DIAGNOSTICS_STORAGE_KEY) === 'enabled'
  } catch {
    return false
  }
}

class MidiRecoveryDiagnostics {
  private snapshot: MidiRecoveryDiagnosticSnapshot = {
    enabled: isEnabled(),
    selectedInputId: '',
    selectedInputName: '',
    selectedManufacturer: '',
    lifecycleState: 'CONNECTING',
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    sessionPage: '',
    sessionState: 'INACTIVE',
    heldNoteCount: 0,
    sustainPedalDown: false
  }

  updateDevice(next: Pick<
    MidiRecoveryDiagnosticSnapshot,
    | 'selectedInputId'
    | 'selectedInputName'
    | 'selectedManufacturer'
    | 'lifecycleState'
    | 'heldNoteCount'
    | 'sustainPedalDown'
  >): void {
    const previousState = this.snapshot.lifecycleState
    this.snapshot = { ...this.snapshot, ...next }
    if (previousState !== 'CONNECTED' && next.lifecycleState === 'CONNECTED') {
      this.snapshot.lastConnectedAt = new Date().toISOString()
    }
    if (previousState === 'CONNECTED' && next.lifecycleState !== 'CONNECTED') {
      this.snapshot.lastDisconnectedAt = new Date().toISOString()
    }
    if (this.snapshot.enabled && previousState !== next.lifecycleState) {
      console.debug('[midi-recovery]', this.getSnapshot())
    }
  }

  updateSession(page: string, state: string): void {
    this.snapshot.sessionPage = page
    this.snapshot.sessionState = state
  }

  getSnapshot(): MidiRecoveryDiagnosticSnapshot {
    if (this.snapshot.sessionState === 'INACTIVE') return { ...this.snapshot }
    const latestSession = practiceSessionRepository.getRecoverable()
      .sort((left, right) => right.lastCheckpointAt.localeCompare(left.lastCheckpointAt))[0]
    return {
      ...this.snapshot,
      sessionState: latestSession?.state ?? this.snapshot.sessionState
    }
  }
}

export const midiRecoveryDiagnostics = new MidiRecoveryDiagnostics()

if (typeof window !== 'undefined' && midiRecoveryDiagnostics.getSnapshot().enabled) {
  Object.defineProperty(window, '__midiRecoveryDiagnostics', {
    configurable: true,
    value: { getSnapshot: () => midiRecoveryDiagnostics.getSnapshot() }
  })
}
