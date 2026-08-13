import type { PracticeDifficulty } from './practiceContentTypes'
import type { ChordInputStyle, ChordKeySignature, ChordTarget } from './chordTypes'
import { CHORD_QUALITY_NAMES } from './chordPatterns'
import { getMajorKeySignature } from './musicKeySignatures'
import { spellMidiPitch } from './musicPitchSpelling'

export interface ChordProgressionDefinition {
  id: string
  name: string
  degrees: number[]
  difficulty: PracticeDifficulty
}

export const CHORD_PROGRESSION_DEFINITIONS: ChordProgressionDefinition[] = [
  { id: 'I-IV-V-I', name: 'I–IV–V–I', degrees: [1, 4, 5, 1], difficulty: 'intermediate' },
  { id: 'I-V-vi-IV', name: 'I–V–vi–IV', degrees: [1, 5, 6, 4], difficulty: 'intermediate' },
  { id: 'ii-V-I', name: 'ii–V–I', degrees: [2, 5, 1], difficulty: 'intermediate' },
  { id: 'I-vi-IV-V', name: 'I–vi–IV–V', degrees: [1, 6, 4, 5], difficulty: 'intermediate' },
  { id: '4536251', name: '4536251', degrees: [4, 5, 3, 6, 2, 5, 1], difficulty: 'challenge' }
]

const MAJOR_SCALE_OFFSETS = [0, 2, 4, 5, 7, 9, 11]
const DEGREE_QUALITIES = ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'] as const

function getKeyRootMidi(keySignature: ChordKeySignature): number {
  const pitchClass = getMajorKeySignature(keySignature).tonicPitchClass
  const midi = 60 + pitchClass
  return midi > 65 ? midi - 12 : midi
}

export function getChordProgressionById(id: string): ChordProgressionDefinition {
  return CHORD_PROGRESSION_DEFINITIONS.find((progression) => progression.id === id) ?? CHORD_PROGRESSION_DEFINITIONS[0]
}

export function createProgressionTargets(
  progressionId: string,
  keySignature: ChordKeySignature,
  inputStyle: ChordInputStyle = 'block'
): ChordTarget[] {
  const progression = getChordProgressionById(progressionId)
  const key = getMajorKeySignature(keySignature)
  const keyRoot = getKeyRootMidi(keySignature)

  return progression.degrees.map((degree, index) => {
    const rootMidi = keyRoot + MAJOR_SCALE_OFFSETS[degree - 1]
    const quality = DEGREE_QUALITIES[degree - 1]
    const intervals = quality === 'major' ? [0, 4, 7] : quality === 'minor' ? [0, 3, 7] : [0, 3, 6]
    const notes = intervals.map((interval) => rootMidi + interval)
    const degreeLabel = progression.name === '4536251' ? `${degree}` : progression.name.split('–')[index] ?? `${degree}`
    const rootSpelling = key.scaleDegrees[degree - 1].spelling
    const qualityName = CHORD_QUALITY_NAMES[quality]
    const name = `${key.displayName} ${degreeLabel} 级 ${rootSpelling} ${qualityName}`

    return {
      id: `${keySignature}-${progression.id}-${index + 1}-${inputStyle}`,
      baseId: `${keySignature}-${degree}`,
      name,
      root: rootSpelling,
      quality,
      qualityName,
      inversion: 'root',
      inversionName: '原位',
      notes,
      noteNames: notes.map((note) => spellMidiPitch(note, keySignature, 'grand').spelling),
      label: `${progression.name} · ${degreeLabel}级 · ${name}`,
      keySignature,
      degree,
      inputStyle,
      sequenceNotes: inputStyle === 'arpeggio' ? [...notes, notes[1], notes[2]] : undefined
    }
  })
}
