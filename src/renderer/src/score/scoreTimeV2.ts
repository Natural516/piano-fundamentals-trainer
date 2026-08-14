import type { ScoreDocument, ScoreMeasure } from './musicXmlTypes'

export const INTERNAL_PPQ = 480

export interface EffectiveScoreAttributes {
  divisions: number
  fifths: number | null
  beats: number | null
  beatType: number | null
  staves: number
}

export interface ScoreEventV2 {
  id: string
  partIndex: number
  measureIndex: number
  measureNumber: number
  noteIndex: number
  onsetInMeasure: number
  absoluteOnset: number
  duration: number
  staff: number
  voice: string
  sourceDivisions: number
  writtenStep: string
  writtenAlter: number
  writtenOctave: number
  midiPitch: number | null
  tieStart: boolean
  tieStop: boolean
  type: 'note' | 'rest' | 'chord'
}

export interface ScoreTimeDocumentV2 {
  events: ScoreEventV2[]
  measureStartTicks: Array<{ partIndex: number; measureIndex: number; measureNumber: number; startTick: number }>
}

export class UnsupportedScoreFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedScoreFormatError'
  }
}

function toCanonicalTicks(duration: number, divisions: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  const safeDivisions = Math.max(1, divisions)
  return Math.round((duration * INTERNAL_PPQ) / safeDivisions)
}

function resolveAttributes(previous: EffectiveScoreAttributes, measure: ScoreMeasure): EffectiveScoreAttributes {
  return {
    divisions: measure.divisions ?? previous.divisions,
    fifths: measure.keySignature !== null ? measure.keySignature : previous.fifths,
    beats: measure.timeBeats !== null ? measure.timeBeats : previous.beats,
    beatType: measure.timeBeatType !== null ? measure.timeBeatType : previous.beatType,
    staves: previous.staves
  }
}

const DEFAULT_ATTRIBUTES: EffectiveScoreAttributes = {
  divisions: 1,
  fifths: null,
  beats: null,
  beatType: null,
  staves: 1
}

/**
 * Score Time Model V2.
 *
 * A single document cursor per part (NOT per voice) advances on every
 * non-chord note/rest; chord tones share the previous note's onset without
 * advancing. All durations are converted from source divisions to canonical
 * INTERNAL_PPQ ticks, so a whole note is always 4 quarter beats regardless of
 * mid-measure divisions changes. Attributes inherit across measures.
 */
export function buildScoreTimeV2(score: ScoreDocument): ScoreTimeDocumentV2 {
  const events: ScoreEventV2[] = []
  const measureStartTicks: ScoreTimeDocumentV2['measureStartTicks'] = []

  score.parts.forEach((part, partIndex) => {
    let attributes = { ...DEFAULT_ATTRIBUTES }
    let documentCursor = 0

    part.measures.forEach((measure, measureIndex) => {
      attributes = resolveAttributes(attributes, measure)
      const measureStartTick = documentCursor
      measureStartTicks.push({
        partIndex,
        measureIndex,
        measureNumber: measure.number,
        startTick: measureStartTick
      })
      let lastNoteOnset: number | null = null

      for (const event of measure.timeEvents) {
        if (event.kind === 'backup') {
          documentCursor = Math.max(0, documentCursor - toCanonicalTicks(event.duration, attributes.divisions))
          continue
        }
        if (event.kind === 'forward') {
          documentCursor += toCanonicalTicks(event.duration, attributes.divisions)
          continue
        }

        const note = measure.notes[event.noteIndex]
        if (!note) continue
        const onsetInMeasure: number = note.isChordTone && lastNoteOnset !== null
          ? lastNoteOnset
          : documentCursor - measureStartTick
        const duration = toCanonicalTicks(note.duration, attributes.divisions)

        if (!note.isChordTone) {
          documentCursor = measureStartTick + onsetInMeasure + duration
          lastNoteOnset = onsetInMeasure
        }

        events.push({
          id: `ev-p${partIndex}-m${measure.number}-o${onsetInMeasure}-${event.noteIndex}`,
          partIndex,
          measureIndex,
          measureNumber: measure.number,
          noteIndex: event.noteIndex,
          onsetInMeasure,
          absoluteOnset: measureStartTick + onsetInMeasure,
          duration,
          staff: note.staff ?? 1,
          voice: note.voice,
          sourceDivisions: attributes.divisions,
          writtenStep: note.step,
          writtenAlter: note.alter,
          writtenOctave: note.octave,
          midiPitch: note.midiNumber,
          tieStart: note.tieStart,
          tieStop: note.tieStop,
          type: note.type === 'rest' ? 'rest' : note.isChordTone ? 'chord' : 'note'
        })
      }
    })
  })

  return { events, measureStartTicks }
}

export interface TiedPerformanceEvent {
  midiPitch: number
  attackTick: number
  releaseTick: number
  measureNumber: number
  staff: number
}

/**
 * Merges a tie chain into performance events: one attack per chain and one
 * release at the end. Notated notes remain separate in the display model.
 */
export function mergeTiedPerformanceEvents(events: ScoreEventV2[]): TiedPerformanceEvent[] {
  const byPitch = new Map<string, TiedPerformanceEvent>()

  for (const event of events) {
    if (event.type === 'rest' || event.midiPitch === null) continue
    const key = `${event.midiPitch}:${event.staff}:${event.partIndex}`
    const existing = byPitch.get(key)

    if (existing && event.tieStop && event.absoluteOnset >= existing.attackTick) {
      byPitch.set(key, {
        ...existing,
        releaseTick: event.absoluteOnset + event.duration
      })
    } else {
      byPitch.set(key, {
        midiPitch: event.midiPitch,
        attackTick: event.absoluteOnset,
        releaseTick: event.absoluteOnset + event.duration,
        measureNumber: event.measureNumber,
        staff: event.staff
      })
    }
  }

  return [...byPitch.values()].sort((left, right) => left.attackTick - right.attackTick)
}
