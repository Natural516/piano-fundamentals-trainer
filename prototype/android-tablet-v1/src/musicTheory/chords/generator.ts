import { getChordQuality, getInversionCount, SEVENTH_QUALITY_IDS, TRIAD_QUALITY_IDS } from './catalog'
import { CHORD_PRACTICE_DEFAULT_REGISTER_WINDOW, CHORD_PRACTICE_DEFAULT_WEIGHTS, CHORD_PRACTICE_LEGAL_ROOTS } from './practicePolicy'
import { formatChordSymbol, getChineseInversionLabel, spellChord } from './spelling'
import type {
  ChordFamily,
  ChordPracticeQuestion,
  ChordPracticeQuestionIdentity,
  ChordPracticeWeights,
  ChordQualityId,
  RegisterWindow,
  WrittenPitchClass
} from './types'
import { enumerateClosePositionPlacements } from './voicing'

export type ChordPracticeRng = () => number

export interface GenerateChordPracticeQuestionOptions {
  readonly rng: ChordPracticeRng
  readonly registerWindow?: RegisterWindow
  readonly weights?: ChordPracticeWeights
  readonly previousQuestionIdentity?: ChordPracticeQuestionIdentity
}

interface RootInversionCandidate {
  readonly root: WrittenPitchClass
  readonly inversionIndex: number
}

function nextUnit(rng: ChordPracticeRng): number {
  const value = rng()
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError(`RNG must return a finite value in [0, 1); received ${value}`)
  }
  return value
}

function chooseWeighted<T extends string>(entries: readonly T[], weights: Readonly<Record<T, number>>, rng: ChordPracticeRng): T {
  const total = entries.reduce((sum, entry) => {
    const weight = weights[entry]
    if (!Number.isFinite(weight) || weight < 0) throw new RangeError(`Invalid weight for ${entry}`)
    return sum + weight
  }, 0)
  if (Math.abs(total - 1) > 1e-9) throw new RangeError(`Weights must sum to 1; received ${total}`)
  const target = nextUnit(rng)
  let cumulative = 0
  for (const entry of entries) {
    cumulative += weights[entry]
    if (target < cumulative) return entry
  }
  throw new Error('Weighted selection did not resolve a candidate')
}

function chooseIndex<T>(items: readonly T[], rng: ChordPracticeRng): T {
  if (items.length === 0) throw new RangeError('Cannot choose from an empty list')
  return items[Math.floor(nextUnit(rng) * items.length)]
}

function rootsMatch(left: WrittenPitchClass, right: WrittenPitchClass): boolean {
  return left.letter === right.letter && left.accidental === right.accidental
}

export function getChordPracticeQuestionIdentity(
  question: ChordPracticeQuestion
): ChordPracticeQuestionIdentity {
  return Object.freeze({
    root: Object.freeze({ ...question.root }),
    qualityId: question.qualityId,
    inversionIndex: question.inversionIndex
  })
}

export function isSameChordPracticeQuestionIdentity(
  left: ChordPracticeQuestionIdentity,
  right: ChordPracticeQuestionIdentity
): boolean {
  return left.qualityId === right.qualityId
    && left.inversionIndex === right.inversionIndex
    && rootsMatch(left.root, right.root)
}

export function generateChordPracticeQuestion(options: GenerateChordPracticeQuestionOptions): ChordPracticeQuestion {
  const weights = options.weights ?? CHORD_PRACTICE_DEFAULT_WEIGHTS
  const registerWindow = options.registerWindow
    ? Object.freeze({ ...options.registerWindow })
    : CHORD_PRACTICE_DEFAULT_REGISTER_WINDOW
  const family = chooseWeighted<ChordFamily>(['triad', 'seventh'], weights.family, options.rng)
  const qualityId: ChordQualityId = family === 'triad'
    ? chooseWeighted(TRIAD_QUALITY_IDS, weights.qualityWithinFamily.triad, options.rng)
    : chooseWeighted(SEVENTH_QUALITY_IDS, weights.qualityWithinFamily.seventh, options.rng)

  const previousIdentity = options.previousQuestionIdentity
  const candidates: readonly RootInversionCandidate[] = CHORD_PRACTICE_LEGAL_ROOTS[qualityId]
    .flatMap((root) => Array.from(
      { length: getInversionCount(qualityId) },
      (_, inversionIndex) => ({ root, inversionIndex })
    ))
    .filter((candidate) => !previousIdentity
      || qualityId !== previousIdentity.qualityId
      || candidate.inversionIndex !== previousIdentity.inversionIndex
      || !rootsMatch(candidate.root, previousIdentity.root))
  const candidate = chooseIndex(candidates, options.rng)
  const placements = enumerateClosePositionPlacements(
    candidate.root,
    qualityId,
    candidate.inversionIndex,
    registerWindow
  )
  const voicing = chooseIndex(placements, options.rng)
  const chord = spellChord(candidate.root, qualityId)
  const quality = getChordQuality(qualityId)
  return Object.freeze({
    family,
    qualityId,
    root: candidate.root,
    chordSymbol: formatChordSymbol(candidate.root, qualityId),
    chineseQualityLabel: quality.chineseLabel,
    inversionIndex: candidate.inversionIndex,
    chineseInversionLabel: getChineseInversionLabel(candidate.inversionIndex, quality.semitones.length),
    chordTones: chord.tones,
    voicing,
    soundingMidiNumbers: voicing.soundingMidiNumbers,
    blockNotes: voicing.writtenPitches,
    arpeggioNotes: voicing.writtenPitches,
    register: Object.freeze({
      window: registerWindow,
      lowestMidi: voicing.lowestMidi,
      highestMidi: voicing.highestMidi
    })
  })
}
