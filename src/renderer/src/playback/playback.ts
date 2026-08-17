import type { ScoreDocument } from '../score/musicXmlTypes'
import { INTERNAL_PPQ, mergeTiedPerformanceEvents } from '../score/scoreTimeV2'
import { buildPracticeSegment, eventToScoreV2Like } from '../score/practiceSegmentBuilder'

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

/**
 * Builds a correct-playback plan strictly from the ScoreModel. AI only
 * chooses measures / hand / tempo; the notes come from the score.
 */
export function buildPlaybackPlan(score: ScoreDocument, options: PlaybackPlanOptions = {}): PlaybackPlan | null {
  const bpm = score.defaultTempoBpm ?? 60
  const baseMsPerTick = 60000 / Math.max(1, bpm) / INTERNAL_PPQ
  const tempoRatio = Math.min(2, Math.max(0.25, options.tempoRatio ?? 1))
  const msPerTick = baseMsPerTick / tempoRatio
  const startMeasure = Math.max(1, options.startMeasure ?? 1)
  const endMeasure = Math.max(startMeasure, options.endMeasure ?? score.parts[0]?.measures.length ?? startMeasure)
  const handMode = options.handMode ?? 'both'
  const loop = Boolean(options.loop)

  const segment = buildPracticeSegment(score, { startMeasure, endMeasure, handMode })
  const tied = mergeTiedPerformanceEvents(segment.events.map(eventToScoreV2Like))
  const events: PlaybackEvent[] = tied.flatMap((tiedEvent) => [
    {
      timeMs: tiedEvent.attackTick * msPerTick,
      type: 'noteOn' as const,
      midiNumber: tiedEvent.midiPitch,
      velocity: 90
    },
    {
      timeMs: tiedEvent.releaseTick * msPerTick,
      type: 'noteOff' as const,
      midiNumber: tiedEvent.midiPitch,
      velocity: 0
    }
  ])

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
    durationMs: events.length > 0 ? Math.max(...events.map((event) => event.timeMs)) : 0
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

export interface PlaybackAudioLike {
  noteOn: (midiNumber: number, velocity: number) => void
  noteOff: (midiNumber: number) => void
  setSustain: (down: boolean) => void
  allNotesOff: () => void
}

export interface PlaybackClock {
  setTimeout: (callback: () => void, delayMs: number) => ReturnType<typeof globalThis.setTimeout>
  clearTimeout: (timer: ReturnType<typeof globalThis.setTimeout>) => void
}

export interface TeachingPlaybackController {
  play: (plan: PlaybackPlan) => void
  stop: () => void
  panic: () => void
  isPlaying: () => boolean
  activeVoiceCount: () => number
}

export function createTeachingPlaybackController(
  audio: PlaybackAudioLike,
  onPlayingChange: (playing: boolean) => void = () => undefined,
  clock: PlaybackClock = globalThis
): TeachingPlaybackController {
  let timers: Array<ReturnType<typeof globalThis.setTimeout>> = []
  let playing = false
  const activeNotes = new Set<number>()

  const setPlaying = (next: boolean): void => {
    playing = next
    onPlayingChange(next)
  }
  const clearTimers = (): void => {
    for (const timer of timers) clock.clearTimeout(timer)
    timers = []
  }
  const releaseAll = (): void => {
    for (const midiNumber of activeNotes) audio.noteOff(midiNumber)
    activeNotes.clear()
    audio.setSustain(false)
    audio.allNotesOff()
  }
  const stop = (): void => {
    clearTimers()
    releaseAll()
    setPlaying(false)
  }
  const play = (plan: PlaybackPlan): void => {
    if (playing || timers.length > 0 || activeNotes.size > 0) stop()
    else clearTimers()
    setPlaying(true)
    const scheduleIteration = (): void => {
      for (const event of plan.events) {
        timers.push(clock.setTimeout(() => {
          if (!playing) return
          if (event.type === 'noteOn') {
            activeNotes.add(event.midiNumber)
            audio.noteOn(event.midiNumber, event.velocity)
          } else {
            activeNotes.delete(event.midiNumber)
            audio.noteOff(event.midiNumber)
          }
        }, event.timeMs))
      }
      timers.push(clock.setTimeout(() => {
        if (!playing) return
        releaseAll()
        if (plan.loop) scheduleIteration()
        else setPlaying(false)
      }, plan.durationMs + 80))
    }
    scheduleIteration()
  }

  return {
    play,
    stop,
    panic: stop,
    isPlaying: () => playing,
    activeVoiceCount: () => activeNotes.size
  }
}

/**
 * Single-lifecycle playback scheduler. stop() clears every scheduled timer AND
 * sends All Notes Off + sustain off, so a long note never hangs after stop.
 */
export function createPlaybackScheduler(
  plan: PlaybackPlan,
  audio: PlaybackAudioLike
): { start: () => void; stop: () => void; isPlaying: () => boolean } {
  const controller = createTeachingPlaybackController(audio)
  return {
    start: () => controller.play(plan),
    stop: controller.stop,
    isPlaying: controller.isPlaying
  }
}
