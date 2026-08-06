import { midiNumberToNoteName } from './midiNotes'
import { CHORD_INVERSION_LABELS, CHORD_QUALITY_NAMES, getEnabledInversions, invertChordNotes } from './chordPatterns'
import type {
  ChordInversionMode,
  ChordTarget,
  SeventhChordQuality,
  SeventhChordQualityFilter
} from './chordTypes'

export interface SeventhChordDefinition {
  id: string
  root: string
  rootMidi: number
  quality: SeventhChordQuality
  notes: number[]
}

const ROOTS = [
  { id: 'c', name: 'C', midi: 60 }, { id: 'cs', name: 'C#', midi: 61 },
  { id: 'd', name: 'D', midi: 62 }, { id: 'ds', name: 'D#', midi: 63 },
  { id: 'e', name: 'E', midi: 64 }, { id: 'f', name: 'F', midi: 65 },
  { id: 'fs', name: 'F#', midi: 66 }, { id: 'g', name: 'G', midi: 67 },
  { id: 'gs', name: 'G#', midi: 68 }, { id: 'a', name: 'A', midi: 69 },
  { id: 'as', name: 'A#', midi: 70 }, { id: 'b', name: 'B', midi: 71 }
] as const

const SEVENTH_INTERVALS: Record<SeventhChordDefinition['quality'], number[]> = {
  major7: [0, 4, 7, 11],
  dominant7: [0, 4, 7, 10],
  minor7: [0, 3, 7, 10],
  'half-diminished7': [0, 3, 6, 10]
}

export const SEVENTH_CHORD_QUALITY_LABELS: Record<SeventhChordQualityFilter, string> = {
  all: '全部七和弦',
  major7: CHORD_QUALITY_NAMES.major7,
  dominant7: CHORD_QUALITY_NAMES.dominant7,
  minor7: CHORD_QUALITY_NAMES.minor7,
  'half-diminished7': CHORD_QUALITY_NAMES['half-diminished7']
}

export const SEVENTH_CHORD_DEFINITIONS: SeventhChordDefinition[] = ROOTS.flatMap((root) =>
  (Object.keys(SEVENTH_INTERVALS) as SeventhChordDefinition['quality'][]).map((quality) => ({
    id: `${root.id}-${quality}`,
    root: root.name,
    rootMidi: root.midi,
    quality,
    notes: SEVENTH_INTERVALS[quality].map((interval) => root.midi + interval)
  }))
)

export function getSeventhChordTargets(
  inversionMode: ChordInversionMode,
  qualityFilter: SeventhChordQualityFilter = 'all'
): ChordTarget[] {
  const definitions = qualityFilter === 'all'
    ? SEVENTH_CHORD_DEFINITIONS
    : SEVENTH_CHORD_DEFINITIONS.filter((definition) => definition.quality === qualityFilter)

  return definitions.flatMap((definition) =>
    getEnabledInversions(inversionMode, 4).map((inversion) => {
      const notes = invertChordNotes(definition.notes, inversion)
      const qualityName = CHORD_QUALITY_NAMES[definition.quality]
      const inversionName = CHORD_INVERSION_LABELS[inversion]
      return {
        id: `${definition.id}-${inversion}`,
        baseId: definition.id,
        name: `${definition.root} ${qualityName}`,
        root: definition.root,
        quality: definition.quality,
        qualityName,
        inversion,
        inversionName,
        notes,
        noteNames: notes.map(midiNumberToNoteName),
        label: `${definition.root} ${qualityName} · ${inversionName}`,
        inputStyle: 'block'
      }
    })
  )
}
