import type {
  ScoreDocument,
  ScoreExpectedUnit,
  ScoreNoteModel,
  ScoreTimeline
} from './musicXmlTypes'

/**
 * Builds expected units from a score. Notes sharing the same onset (chord /
 * simultaneous voices) inside a measure are grouped into one unit; rests are
 * units that auto-advance; tie starts keep their pitch sounding.
 */
export function buildScoreTimeline(score: ScoreDocument): ScoreTimeline {
  const units: ScoreExpectedUnit[] = []
  let onsetCounter = 0

  for (const part of score.parts) {
    for (const measure of part.measures) {
      const grouped = new Map<number, ScoreNoteModel[]>()
      let currentOnset = -1

      for (const note of measure.notes) {
        if (note.isGrace) continue
        if (note.isChordTone) {
          if (currentOnset < 0) currentOnset = onsetCounter
        } else {
          currentOnset = onsetCounter
          onsetCounter += 1
        }

        const list = grouped.get(currentOnset) ?? []
        list.push(note)
        grouped.set(currentOnset, list)
      }

      const onsets = [...grouped.keys()].sort((left, right) => left - right)

      for (const onset of onsets) {
        const notes = grouped.get(onset) ?? []
        const expectedMidi = notes
          .filter((note) => note.type === 'note' && note.midiNumber !== null && note.tie !== 'stop' && note.tie !== 'continue')
          .map((note) => note.midiNumber as number)
          .sort((left, right) => left - right)
        const rest = notes.every((note) => note.type === 'rest')
        const tieStart = notes.some((note) => note.tie === 'start')

        units.push({
          id: `${part.id}-m${measure.number}-o${onset}`,
          onsetIndex: onset,
          notes,
          tieStart,
          rest,
          expectedMidi: [...new Set(expectedMidi)]
        })
      }
    }
  }

  return { units }
}
