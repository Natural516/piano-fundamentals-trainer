export type PageId =
  | 'home'
  | 'records'
  | 'analytics'
  | 'badges'
  | 'settings'
  | 'sight-reading'
  | 'rhythm'
  | 'scales'
  | 'chords'
  | 'coordination'
  | 'free-practice'
  | 'midi-test'
  | 'metronome'
  | 'help'

export type VisualKind = 'staff' | 'metronome' | 'stairs' | 'rings' | 'hands' | 'pen'
export type AccentKind = 'violet' | 'blue' | 'cyan' | 'amber' | 'rose' | 'indigo'

export interface NavigationItem {
  id: PageId
  label: string
  glyph: string
}

export interface PracticeModule {
  id: PageId
  number: string
  title: string
  description: string
  visual: VisualKind
  accent: AccentKind
}

export interface QuickAction {
  id: PageId
  title: string
  description: string
  glyph: string
}

export type MidiEventType = 'noteOn' | 'noteOff' | 'controlChange'
export type MidiPermissionStatus = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported' | 'error'
export type MidiConnectionState = 'disconnected' | 'pending' | 'connected'

export interface MidiInputDevice {
  id: string
  name: string
  manufacturer: string
  state: string
  connection: string
}

export interface MidiEventRecord {
  type: MidiEventType
  timestamp: number
  deviceName: string
  midiNumber?: number
  noteName?: string
  velocity?: number
  controllerNumber?: number
  controllerName?: string
  value?: number
  sustainPedalDown?: boolean
}

export interface ActiveMidiNote {
  midiNumber: number
  noteName: string
  velocity: number
  timestamp: number
  deviceName: string
}

export interface MidiSidebarStatus {
  connectionState: MidiConnectionState
  statusLabel: string
  deviceName: string
}
