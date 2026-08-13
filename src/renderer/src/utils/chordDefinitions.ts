import { CHORD_INVERSION_LABELS, CHORD_QUALITY_NAMES, getEnabledInversions, invertChordNotes } from './chordPatterns'
import { getMajorKeySignature } from './musicKeySignatures'
import { spellMidiPitch } from './musicPitchSpelling'
import type {
  ChordInversionMode,
  ChordKeySignature,
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
  degree?: number
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
  qualityFilter: SeventhChordQualityFilter = 'all',
  keySignature: ChordKeySignature = 'C'
): ChordTarget[] {
  const definitions = createDiatonicSeventhChordDefinitions(keySignature)
  const filteredDefinitions = qualityFilter === 'all'
    ? definitions
    : definitions.filter((definition) => definition.quality === qualityFilter)

  return filteredDefinitions.flatMap((definition) =>
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
        noteNames: notes.map((note) => spellMidiPitch(note, keySignature, 'grand').spelling),
        label: `${definition.root} ${qualityName} · ${inversionName}`,
        keySignature,
        degree: definition.degree,
        inputStyle: 'block'
      }
    })
  )
}

const MAJOR_SCALE_OFFSETS = [0, 2, 4, 5, 7, 9, 11] as const
const DIATONIC_SEVENTH_QUALITIES: readonly SeventhChordQuality[] = [
  'major7', 'minor7', 'minor7', 'major7', 'dominant7', 'minor7', 'half-diminished7'
]

function getKeyRootMidi(keySignature: ChordKeySignature): number {
  const pitchClass = getMajorKeySignature(keySignature).tonicPitchClass
  const midi = 60 + pitchClass
  return midi > 65 ? midi - 12 : midi
}

export function createDiatonicSeventhChordDefinitions(
  keySignature: ChordKeySignature
): SeventhChordDefinition[] {
  const key = getMajorKeySignature(keySignature)
  const keyRootMidi = getKeyRootMidi(keySignature)

  return key.scaleDegrees.map((degree, index) => {
    const quality = DIATONIC_SEVENTH_QUALITIES[index]
    const rootMidi = keyRootMidi + MAJOR_SCALE_OFFSETS[index]
    return {
      id: `${keySignature}-${index + 1}-${quality}`,
      root: degree.spelling,
      rootMidi,
      quality,
      notes: SEVENTH_INTERVALS[quality].map((interval) => rootMidi + interval),
      degree: index + 1
    }
  })
}
