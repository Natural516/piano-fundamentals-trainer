import type {
  ScoreDocument,
  ScoreExpectedUnit,
  ScoreNoteModel,
  ScoreTimeline
} from './musicXmlTypes'

function voiceKey(note: ScoreNoteModel): string {
  return `${note.voice}-s${note.staff}`
}

/**
 * Builds expected units using integer score ticks (divisions * duration).
 * - per-voice tick cursors handle independent voices;
 * - <backup>/<forward> move cursors without emitting notes;
 * - chord tones share the previous note's onset in the same voice;
 * - multi-part measures merge by (measure number, onset tick) instead of
 *   being serialized part-by-part.
 */
export function buildScoreTimeline(score: ScoreDocument): ScoreTimeline {
  const unitGroups = new Map<string, { expectedTick: number; notes: ScoreNoteModel[]; tieStart: boolean; rest: boolean }>()

  for (const part of score.parts) {
    let measureStartTick = 0

    for (const measure of part.measures) {
      const voiceCursors = new Map<string, number>()
      let lastNoteOnset: number | null = null

      for (const event of measure.timeEvents) {
        if (event.kind === 'backup') {
          for (const [key, cursor] of voiceCursors) {
            voiceCursors.set(key, Math.max(0, cursor - event.duration))
          }
          continue
        }

        if (event.kind === 'forward') {
          for (const [key, cursor] of voiceCursors) {
            voiceCursors.set(key, cursor + event.duration)
          }
          continue
        }

        const note = measure.notes[event.noteIndex]
        if (!note) continue

        const key = voiceKey(note)
        const cursor = voiceCursors.get(key) ?? 0
        const onset: number = note.isChordTone
          ? lastNoteOnset ?? cursor
          : cursor

        if (!note.isChordTone) {
          voiceCursors.set(key, onset + note.duration)
          lastNoteOnset = onset
        }

        const unitKey = `${measure.number}:${onset}`
        const group = unitGroups.get(unitKey) ?? {
          expectedTick: measureStartTick + onset,
          notes: [],
          tieStart: false,
          rest: true
        }
        group.notes.push(note)
        group.tieStart = group.tieStart || note.tie === 'start'
        group.rest = group.rest && note.type === 'rest'
        unitGroups.set(unitKey, group)
      }

      const measureLength = Math.max(
        0,
        ...voiceCursors.values()
      )
      measureStartTick += measureLength
    }
  }

  const units: ScoreExpectedUnit[] = [...unitGroups.entries()]
    .map(([unitKey, group]) => {
      const expectedMidi = group.notes
        .filter((note) => note.type === 'note' && note.midiNumber !== null && note.tie !== 'stop' && note.tie !== 'continue')
        .map((note) => note.midiNumber as number)
        .sort((left, right) => left - right)

      return {
        id: `unit-${unitKey}`,
        onsetIndex: 0,
        expectedTick: group.expectedTick,
        measure: Number(unitKey.split(':')[0]) || 1,
        notes: group.notes,
        tieStart: group.tieStart,
        rest: group.rest,
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
        .filter((note) => note.type === 'note' && note.midiNumber !== null && note.tie !== 'stop' && note.tie !== 'continue')
        .map((note) => note.midiNumber as number)
        .sort((left, right) => left - right)
      if (expectedMidi.length === 0 && !notes.every((note) => note.type === 'rest')) return null
      return {
        ...unit,
        notes,
        rest: notes.every((note) => note.type === 'rest'),
        tieStart: notes.some((note) => note.tie === 'start'),
        expectedMidi: [...new Set(expectedMidi)]
      }
    })
    .filter((unit): unit is NonNullable<typeof unit> => unit !== null)
    .map((unit, index) => ({ ...unit, onsetIndex: index }))

  return { units }
}
