import type {
  ScoreDocument,
  ScoreExpectedUnit,
  ScoreTimeline
} from './musicXmlTypes'
import { buildPracticeSegment } from './practiceSegmentBuilder'

/**
 * Full-score timeline uses the same deterministic PracticeSegment attack
 * grouping as selected Wait / Realtime practice. There is no parser-order or
 * part/staff/voice-specific target path.
 */
export function buildScoreTimeline(score: ScoreDocument): ScoreTimeline {
  const measureNumbers = score.parts.flatMap((part) => part.measures.map((measure) => measure.number))
  if (measureNumbers.length === 0) return { units: [] }
  return buildSegmentTimeline(score, {
    startMeasure: Math.min(...measureNumbers),
    endMeasure: Math.max(...measureNumbers),
    handMode: 'both'
  })
}

export interface ScoreSegmentOptions {
  startMeasure?: number
  endMeasure?: number
  handMode?: 'left' | 'right' | 'both'
}

/**
 * Filters a score timeline to a practice segment (measure range + hand).
 * Notes outside the selected hand's staff are removed; units left empty are
 * dropped so the segment starts cleanly.
 */
export function buildSegmentTimeline(score: ScoreDocument, options: ScoreSegmentOptions = {}): ScoreTimeline {
  const segment = buildPracticeSegment(score, options)
  const units: ScoreExpectedUnit[] = segment.expectedUnits.map((unit, index) => ({
    id: `seg-${unit.originalMeasure}-${unit.practiceTick}`,
    onsetIndex: index,
    expectedTick: unit.practiceTick,
    measure: unit.originalMeasure,
    originalMeasure: unit.originalMeasure,
    originalBeat: unit.originalBeat,
    practiceTick: unit.practiceTick,
    notes: unit.events.map((event) => ({
      id: `seg-${index}-${event.midiPitch ?? 'rest'}`,
      type: event.midiPitch === null ? 'rest' : 'note',
      midiNumber: event.midiPitch,
      step: '',
      alter: 0,
      octave: 4,
      duration: event.duration,
      voice: event.voice,
      staff: event.staff,
      isChordTone: event.type === 'chord',
      tieStart: event.tieStart,
      tieStop: event.tieStop,
      accidental: null
    })),
    tieStart: unit.tieStart,
    rest: unit.rest,
    expectedMidi: unit.expectedMidi,
    staff: unit.staff,
    hand: unit.hand,
    sourceEventIds: unit.sourceEventIds
  }))
  return { units }
}
