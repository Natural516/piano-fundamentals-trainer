import type {
  ChordV2Identity,
  ChordV2JudgeMode,
  ChordV2Result,
  VoicingSpec
} from './chordV2Types'

export interface VoicingOptions {
  registerLowest?: number
  registerHighest?: number
  spacing?: 'close' | 'open'
  hands?: 'left' | 'right' | 'both'
  bassConstraint?: number | null
}

const DEFAULT_LOWEST = 48
const DEFAULT_HIGHEST = 84

function pitchClass(midiNumber: number): number {
  return ((midiNumber % 12) + 12) % 12
}

export function normalizeNotes(notes: number[]): number[] {
  return Array.from(new Set(notes)).sort((left, right) => left - right)
}

export function createDefaultVoicing(identity: ChordV2Identity, options: VoicingOptions = {}): VoicingSpec {
  const lowest = options.registerLowest ?? DEFAULT_LOWEST
  const highest = options.registerHighest ?? DEFAULT_HIGHEST
  const spacing = options.spacing ?? 'close'
  const hands = options.hands ?? 'both'
  const requiredPitchClasses = identity.requiredPitchClasses
  const bassPitchClass = pitchClass(options.bassConstraint ?? identity.root)

  // Place the bass (root or slash) in the lowest register octave.
  let bassMidi = lowest + ((bassPitchClass - pitchClass(lowest) + 12) % 12)
  if (bassMidi < lowest) bassMidi += 12
  if (bassMidi > highest) bassMidi -= 12

  const notes: number[] = [bassMidi]
  const remaining = requiredPitchClasses.filter((pc) => pc !== pitchClass(bassMidi))

  // Closed voicing: each remaining tone is the first occurrence above the previous note.
  let cursor = bassMidi
  for (const pc of remaining) {
    let candidate = cursor + 1 + (((pc - pitchClass(cursor + 1)) + 12) % 12)
    notes.push(candidate)
    cursor = candidate
  }

  // Doubling: add root an octave above the top to reach 4 voices for triads.
  const voiceCount = requiredPitchClasses.length >= 4 ? requiredPitchClasses.length : 4
  while (notes.length < voiceCount) {
    const top = notes[notes.length - 1]
    const doubled = top + 12 - (identity.requiredPitchClasses.length === 3 ? 7 : 5)
    notes.push(doubled)
  }

  if (spacing === 'open') {
    // Simple open-voicing heuristic: lower the middle voices by an octave when possible.
    const opened = [notes[0]]
    for (let index = 1; index < notes.length - 1; index += 1) {
      const lowered = notes[index] - 12
      opened.push(lowered > opened[opened.length - 1] ? lowered : notes[index])
    }
    opened.push(notes[notes.length - 1])
    notes.splice(0, notes.length, ...opened)
  }

  const finalNotes = normalizeNotes(notes.filter((note) => note >= lowest && note <= highest))
  const bassConstraint = finalNotes[0] ?? bassMidi

  return {
    identity,
    exactNotes: finalNotes,
    register: { lowest, highest },
    doublings: finalNotes.filter((note) => finalNotes.filter((candidate) => pitchClass(candidate) === pitchClass(note)).length > 1),
    spacing,
    hands,
    voiceCount: finalNotes.length,
    bassConstraint,
    requiredTones: requiredPitchClasses,
    optionalTones: identity.optionalPitchClasses,
    allowedOmissions: [],
    range: { lowest, highest }
  }
}

export function judgeVoicing(
  voicing: VoicingSpec,
  inputNotes: number[],
  mode: ChordV2JudgeMode
): ChordV2Result {
  const inputPitchClasses = new Set(normalizeNotes(inputNotes).map(pitchClass))
  const requiredSet = new Set(voicing.requiredTones)
  const optionalSet = new Set(voicing.optionalTones)

  if (mode === 'exact') {
    const inputSet = new Set(normalizeNotes(inputNotes))
    const expectedSet = new Set(voicing.exactNotes)
    const missingNotes = [...expectedSet].filter((note) => !inputSet.has(note))
    const extraNotes = normalizeNotes(inputNotes).filter((note) => !expectedSet.has(note))

    if (missingNotes.length === 0 && extraNotes.length === 0) {
      return { judgement: 'correct', missingNotes: [], extraNotes: [] }
    }
    if (missingNotes.length > 0) {
      return { judgement: 'missing', missingNotes, extraNotes }
    }
    return { judgement: 'extra', missingNotes, extraNotes }
  }

  const missingNotes = [...requiredSet].filter((pc) => !inputPitchClasses.has(pc))
  const extraNotes = normalizeNotes(inputNotes)
    .map(pitchClass)
    .filter((pc) => !requiredSet.has(pc) && !optionalSet.has(pc))

  if (mode === 'inversion' && inputNotes.length > 0) {
    const actualBassPitchClass = pitchClass(Math.min(...inputNotes))
    const expectedBassPitchClass = pitchClass(voicing.bassConstraint ?? voicing.identity.root)
    if (actualBassPitchClass !== expectedBassPitchClass) {
      return { judgement: 'wrong_bass', missingNotes, extraNotes }
    }
  }

  if (missingNotes.length === 0 && extraNotes.length === 0) {
    return { judgement: 'correct', missingNotes: [], extraNotes: [] }
  }
  if (missingNotes.length > 0) {
    return { judgement: 'missing', missingNotes, extraNotes }
  }
  return { judgement: 'extra', missingNotes, extraNotes }
}

export class ArpeggioStateMachine {
  private readonly sequence: number[]
  private index = 0

  constructor(sequence: number[]) {
    this.sequence = sequence
  }

  get progress(): number {
    return this.index
  }

  get isComplete(): boolean {
    return this.index >= this.sequence.length
  }

  reset(): void {
    this.index = 0
  }

  processNote(note: number): 'correct' | 'wrong' | 'complete' {
    if (this.isComplete) return 'complete'
    if (note !== this.sequence[this.index]) return 'wrong'
    this.index += 1
    return this.isComplete ? 'complete' : 'correct'
  }
}

export function createArpeggioSequence(voicing: VoicingSpec, direction: 'up' | 'down' | 'up-down'): number[] {
  const ascending = [...voicing.exactNotes].sort((left, right) => left - right)
  if (direction === 'up') return ascending
  if (direction === 'down') return [...ascending].reverse()
  return [...ascending, ...ascending.slice(0, -1).reverse()]
}
