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
