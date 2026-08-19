import type { MidiEventRecord } from '../types'

export interface RecordedMidiEvent {
  id: number
  type: 'noteOn' | 'noteOff' | 'controlChange'
  midiNumber?: number
  velocity?: number
  controllerNumber?: number
  value?: number
  sustainPedalDown?: boolean
  relativeTimeMs: number
}

export interface RecordingSession {
  id: string
  startedAtMs: number
  events: RecordedMidiEvent[]
}

export interface RecordingStats {
  durationMs: number
  noteOnCount: number
  lowestMidi: number | null
  highestMidi: number | null
  actualRange: number | null
  averageVelocity: number | null
  velocityRange: number | null
  pedalDownCount: number
  pedalDownDurationMs: number
  densityPerSecond: number | null
  leftRegionNoteOnCount: number
  rightRegionNoteOnCount: number
}

export interface RecordingSnapshotFact extends RecordingStats {
  factType: 'free_practice_snapshot'
  capturedAt: string
  notes: string | null
  midiEvents: RecordedMidiEvent[]
}

export interface PlaybackAction {
  timeMs: number
  type: 'noteOn' | 'noteOff' | 'controlChange'
  midiNumber?: number
  velocity?: number
  sustainPedalDown?: boolean
}

export function createRecordingSession(now: number): RecordingSession {
  return {
    id: `recording-${now}-${Math.random().toString(36).slice(2, 10)}`,
    startedAtMs: now,
    events: []
  }
}

export function appendRecordedEvent(session: RecordingSession, event: MidiEventRecord): RecordedMidiEvent | null {
  if (event.type !== 'noteOn' && event.type !== 'noteOff' && event.type !== 'controlChange') {
    return null
  }

  if (event.type === 'controlChange' && event.controllerNumber !== 64) {
    return null
  }

  const relativeTimeMs = Math.max(0, event.timestamp - session.startedAtMs)
  const record: RecordedMidiEvent = {
    id: event.id,
    type: event.type,
    relativeTimeMs
  }

  if (event.type === 'noteOn' || event.type === 'noteOff') {
    record.midiNumber = event.midiNumber
    record.velocity = event.type === 'noteOn' ? (event.velocity ?? 0) : 0
  } else {
    record.controllerNumber = event.controllerNumber
    record.value = event.value
    record.sustainPedalDown = event.sustainPedalDown
  }

  session.events.push(record)
  return record
}

export function summarizeRecording(session: RecordingSession, endedAtMs?: number): RecordingStats {
  const events = session.events
  const noteOns = events.filter((event) => event.type === 'noteOn' && typeof event.midiNumber === 'number')
  const midiNumbers = noteOns.map((event) => event.midiNumber as number)
  const velocities = noteOns.map((event) => event.velocity ?? 0)
  const endTime = Math.max(
    endedAtMs !== undefined ? Math.max(0, endedAtMs - session.startedAtMs) : 0,
    events.length > 0 ? events[events.length - 1].relativeTimeMs : 0
  )
  const pedalDowns = events.filter((event) => event.type === 'controlChange' && event.sustainPedalDown)
  const pedalUps = events.filter((event) => event.type === 'controlChange' && !event.sustainPedalDown)
  let pedalDownDurationMs = 0
  let pedalOpenSince: number | null = null

  for (const event of events) {
    if (event.type !== 'controlChange') continue
    if (event.sustainPedalDown) {
      pedalOpenSince = event.relativeTimeMs
    } else if (pedalOpenSince !== null) {
      pedalDownDurationMs += Math.max(0, event.relativeTimeMs - pedalOpenSince)
      pedalOpenSince = null
    }
  }
  if (pedalOpenSince !== null) {
    pedalDownDurationMs += Math.max(0, endTime - pedalOpenSince)
  }

  return {
    durationMs: endTime,
    noteOnCount: noteOns.length,
    lowestMidi: midiNumbers.length > 0 ? Math.min(...midiNumbers) : null,
    highestMidi: midiNumbers.length > 0 ? Math.max(...midiNumbers) : null,
    actualRange: midiNumbers.length > 0 ? Math.max(...midiNumbers) - Math.min(...midiNumbers) : null,
    averageVelocity: velocities.length > 0
      ? Math.round(velocities.reduce((sum, value) => sum + value, 0) / velocities.length)
      : null,
    velocityRange: velocities.length > 0 ? Math.max(...velocities) - Math.min(...velocities) : null,
    pedalDownCount: pedalDowns.length,
    pedalDownDurationMs,
    densityPerSecond: endTime > 0 ? Math.round((noteOns.length / endTime) * 1000 * 10) / 10 : null,
    leftRegionNoteOnCount: noteOns.filter((event) => (event.midiNumber as number) < 60).length,
    rightRegionNoteOnCount: noteOns.filter((event) => (event.midiNumber as number) >= 60).length
  }
}

export function createRecordingSnapshotFact(
  session: RecordingSession,
  capturedAtMs: number,
  notes: string
): RecordingSnapshotFact {
  return {
    factType: 'free_practice_snapshot',
    capturedAt: new Date(capturedAtMs).toISOString(),
    ...summarizeRecording(session, capturedAtMs),
    notes: notes.trim() || null,
    midiEvents: session.events.map((event) => ({ ...event }))
  }
}

export function createPlaybackTimeline(events: RecordedMidiEvent[]): PlaybackAction[] {
  return [...events]
    .sort((left, right) => left.relativeTimeMs - right.relativeTimeMs || left.id - right.id)
    .map((event) => ({
      timeMs: event.relativeTimeMs,
      type: event.type,
      ...(typeof event.midiNumber === 'number' ? { midiNumber: event.midiNumber } : {}),
      ...(typeof event.velocity === 'number' ? { velocity: event.velocity } : {}),
      ...(typeof event.sustainPedalDown === 'boolean' ? { sustainPedalDown: event.sustainPedalDown } : {})
    }))
}

export function getPlaybackDurationMs(events: RecordedMidiEvent[]): number {
  return events.length > 0 ? Math.max(...events.map((event) => event.relativeTimeMs)) : 0
}

export class PlaybackCursorCore {
  private readonly actions: PlaybackAction[]
  private cursor = 0
  private positionMs = 0

  constructor(events: RecordedMidiEvent[]) {
    this.actions = createPlaybackTimeline(events)
  }

  get durationMs(): number {
    return this.actions.length > 0 ? this.actions[this.actions.length - 1].timeMs : 0
  }

  get position(): number {
    return this.positionMs
  }

  seek(timeMs: number): void {
    const target = Math.min(this.durationMs, Math.max(0, timeMs))
    this.positionMs = target
    this.cursor = this.actions.findIndex((action) => action.timeMs >= target)
    if (this.cursor < 0) {
      this.cursor = this.actions.length
    }
  }

  advanceTo(timeMs: number): PlaybackAction[] {
    const target = Math.min(this.durationMs, Math.max(0, timeMs))
    const fired: PlaybackAction[] = []

    while (this.cursor < this.actions.length && this.actions[this.cursor].timeMs <= target) {
      fired.push(this.actions[this.cursor])
      this.cursor += 1
    }

    this.positionMs = target
    return fired
  }

  isFinished(): boolean {
    return this.cursor >= this.actions.length
  }
}
