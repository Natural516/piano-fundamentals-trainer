import type {
  ScoreDocument,
  ScoreExpectedUnit,
  ScoreNoteModel,
  ScoreTimeline
} from './musicXmlTypes'
import { buildScoreTimeV2 } from './scoreTimeV2'

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
  const unitGroups = new Map<string, { expectedTick: number; measure: number; notes: ScoreNoteModel[] }>()

  for (const event of events) {
    const note = score.parts[event.partIndex]?.measures[event.measureIndex]?.notes[event.noteIndex]
    if (!note) continue
    const unitKey = `${event.partIndex}-${event.measureNumber}:${event.onsetInMeasure}`
    const group = unitGroups.get(unitKey) ?? {
      expectedTick: event.absoluteOnset,
      measure: event.measureNumber,
      notes: []
    }
    group.notes.push(note)
    unitGroups.set(unitKey, group)
  }

  const units: ScoreExpectedUnit[] = [...unitGroups.entries()]
    .map(([, group]) => {
      const expectedMidi = group.notes
        .filter((note) => note.type === 'note' && note.midiNumber !== null && !(note.tieStop && !note.tieStart))
        .map((note) => note.midiNumber as number)
        .sort((left, right) => left - right)

      return {
        id: `unit-${group.measure}-${group.expectedTick}`,
        onsetIndex: 0,
        expectedTick: group.expectedTick,
        measure: group.measure,
        notes: group.notes,
        tieStart: group.notes.some((note) => note.tieStart),
        rest: group.notes.every((note) => note.type === 'rest'),
        expectedMidi: [...new Set(expectedMidi)]
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
  const full = buildScoreTimeline(score)
  const startMeasure = Math.max(1, options.startMeasure ?? 1)
  const endMeasure = Math.max(startMeasure, options.endMeasure ?? Number.MAX_SAFE_INTEGER)
  const handMode = options.handMode ?? 'both'

  const units = full.units
    .map((unit) => {
      const measureNumber = unit.measure
      if (measureNumber < startMeasure || measureNumber > endMeasure) return null
      const notes = unit.notes.filter((note) => {
        if (handMode === 'both') return true
        const staff = note.staff ?? 1
        return handMode === 'right' ? staff === 1 : staff === 2
      })
      if (notes.length === 0) return null
      const expectedMidi = notes
        .filter((note) => note.type === 'note' && note.midiNumber !== null && !(note.tieStop && !note.tieStart))
        .map((note) => note.midiNumber as number)
        .sort((left, right) => left - right)
      if (expectedMidi.length === 0 && !notes.every((note) => note.type === 'rest')) return null
      return {
        ...unit,
        notes,
        rest: notes.every((note) => note.type === 'rest'),
        tieStart: notes.some((note) => note.tieStart),
        expectedMidi: [...new Set(expectedMidi)]
      }
    })
    .filter((unit): unit is NonNullable<typeof unit> => unit !== null)
    .map((unit, index) => ({ ...unit, onsetIndex: index }))

  return { units }
}
