import type { ScoreDocument, ScoreNoteModel } from '../score/musicXmlTypes'
import { buildScoreTimeline } from '../score/scoreTimeline'

export interface PlaybackEvent {
  timeMs: number
  type: 'noteOn' | 'noteOff'
  midiNumber: number
  velocity: number
}

export interface PlaybackPlan {
  scoreId: string
  title: string
  startMeasure: number
  endMeasure: number
  handMode: 'left' | 'right' | 'both'
  tempoRatio: number
  loop: boolean
  msPerTick: number
  events: PlaybackEvent[]
  durationMs: number
}

export interface PlaybackPlanOptions {
  startMeasure?: number
  endMeasure?: number
  handMode?: 'left' | 'right' | 'both'
  tempoRatio?: number
  loop?: boolean
}

function noteMidi(note: ScoreNoteModel): number | null {
  return note.type === 'note' ? note.midiNumber : null
}

/**
 * Builds a correct-playback plan strictly from the ScoreModel. AI only
 * chooses measures / hand / tempo; the notes come from the score.
 */
export function buildPlaybackPlan(score: ScoreDocument, options: PlaybackPlanOptions = {}): PlaybackPlan | null {
  const divisions = score.parts[0]?.measures.find((measure) => measure.divisions !== null)?.divisions ?? 1
  const bpm = score.defaultTempoBpm ?? 60
  const baseMsPerTick = 60000 / Math.max(1, bpm) / Math.max(1, divisions)
  const tempoRatio = Math.min(2, Math.max(0.25, options.tempoRatio ?? 1))
  const msPerTick = baseMsPerTick / tempoRatio
  const startMeasure = Math.max(1, options.startMeasure ?? 1)
  const endMeasure = Math.max(startMeasure, options.endMeasure ?? score.parts[0]?.measures.length ?? startMeasure)
  const handMode = options.handMode ?? 'both'
  const loop = Boolean(options.loop)

  const timeline = buildScoreTimeline(score)
  const events: PlaybackEvent[] = []

  for (const unit of timeline.units) {
    const measureNumber = Number(unit.id.split('-')[1].replace('m', '')) || 1
    if (measureNumber < startMeasure || measureNumber > endMeasure) continue

    const filteredNotes = unit.notes.filter((note) => {
      if (handMode === 'both') return true
      const staff = note.staff ?? 1
      return handMode === 'right' ? staff === 1 : staff === 2
    })

    for (const note of filteredNotes) {
      const midiNumber = noteMidi(note)
      if (midiNumber === null) continue
      events.push({
        timeMs: unit.expectedTick * msPerTick,
        type: 'noteOn',
        midiNumber,
        velocity: 90
      })
      events.push({
        timeMs: (unit.expectedTick + Math.max(1, note.duration)) * msPerTick,
        type: 'noteOff',
        midiNumber,
        velocity: 0
      })
    }
  }

  events.sort((left, right) => left.timeMs - right.timeMs || left.type.localeCompare(right.type))

  return {
    scoreId: score.title,
    title: score.title,
    startMeasure,
    endMeasure,
    handMode,
    tempoRatio,
    loop,
    msPerTick,
    events,
    durationMs: events.length > 0 ? events[events.length - 1].timeMs : 0
  }
}

export function createPlaybackSchedule(plan: PlaybackPlan): PlaybackEvent[] {
  return plan.events
}

export interface PlaybackBackend {
  play: (plan: PlaybackPlan) => void
  stop: () => void
  panic: () => void
  setSustain: (down: boolean) => void
}

export interface ExternalMidiOutAdapter {
  readonly isSupported: boolean
  sendNoteOn: (midiNumber: number, velocity: number) => void
  sendNoteOff: (midiNumber: number) => void
  sendControlChange: (controller: number, value: number) => void
  panic: () => void
}

export const UNSUPPORTED_EXTERNAL_MIDI_OUT: ExternalMidiOutAdapter = {
  isSupported: false,
  sendNoteOn: () => undefined,
  sendNoteOff: () => undefined,
  sendControlChange: () => undefined,
  panic: () => undefined
}
