import type {
  ScoreDocument,
  ScoreExpectedUnit,
  ScoreNoteModel,
  ScoreTimeline
} from './musicXmlTypes'
import { buildScoreTimeV2, mergeTiedPerformanceEvents } from './scoreTimeV2'
import { buildPracticeSegment } from './practiceSegmentBuilder'

/**
 * Builds expected units using integer score ticks (divisions * duration).
 * - per-voice tick cursors handle independent voices;
 * - <backup>/<forward> move cursors without emitting notes;
 * - chord tones share the previous note's onset in the same voice;
 * - multi-part measures merge by (measure number, onset tick) instead of
 *   being serialized part-by-part.
 */
export function buildScoreTimeline(score: ScoreDocument): ScoreTimeline {
  const { events } = buildScoreTimeV2(score)
  const performanceAttackEventIds = new Set(
    mergeTiedPerformanceEvents(events).map((event) => event.sourceEventIds[0])
  )
  const unitGroups = new Map<string, { expectedTick: number; onsetInMeasure: number; measure: number; notes: ScoreNoteModel[]; sourceEventIds: string[] }>()

  for (const event of events) {
    const note = score.parts[event.partIndex]?.measures[event.measureIndex]?.notes[event.noteIndex]
    if (!note) continue
    const unitKey = `${event.partIndex}-${event.measureNumber}:${event.onsetInMeasure}`
    const group = unitGroups.get(unitKey) ?? {
      expectedTick: event.absoluteOnset,
      onsetInMeasure: event.onsetInMeasure,
      measure: event.measureNumber,
      notes: [],
      sourceEventIds: []
    }
    group.notes.push(note)
    group.sourceEventIds.push(event.id)
    unitGroups.set(unitKey, group)
  }

  const units: ScoreExpectedUnit[] = [...unitGroups.entries()]
    .map(([, group]) => {
      const expectedMidi = group.notes
        .filter((note, index) => (
          note.type === 'note' &&
          note.midiNumber !== null &&
          performanceAttackEventIds.has(group.sourceEventIds[index])
        ))
        .map((note) => note.midiNumber as number)
        .sort((left, right) => left - right)

      return {
        id: `unit-${group.measure}-${group.expectedTick}`,
        onsetIndex: 0,
        expectedTick: group.expectedTick,
        measure: group.measure,
        originalMeasure: group.measure,
        originalBeat: group.onsetInMeasure / 480 + 1,
        practiceTick: group.expectedTick,
        notes: group.notes,
        tieStart: group.notes.some((note) => note.tieStart),
        rest: group.notes.every((note) => note.type === 'rest'),
        expectedMidi: [...new Set(expectedMidi)],
        staff: new Set(group.notes.map((note) => note.staff)).size === 1 ? group.notes[0]?.staff ?? null : null,
        hand: (() : 'left' | 'right' | 'both' | null => {
          const staffs = new Set(group.notes.filter((note) => note.midiNumber !== null).map((note) => note.staff))
          if (staffs.size === 0) return null
          if (staffs.size > 1) return 'both'
          return [...staffs][0] === 2 ? 'left' : 'right'
        })(),
        sourceEventIds: group.sourceEventIds
      }
    })
    .sort((left, right) => left.expectedTick - right.expectedTick)
    .map((unit, index) => ({ ...unit, onsetIndex: index }))

  return { units }
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
