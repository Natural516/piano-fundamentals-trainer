import { getChordV2Identity, formatChordSymbol } from '../chordV2/chordIdentity'
import { createDefaultVoicing, judgeVoicing } from '../chordV2/voicing'
import { voiceLeadingScore } from '../chordV2/harmony'
import type { ChordV2Identity } from '../chordV2/chordV2Types'
import type { ProgressionDefinition, ProgressionId, ProgressionModel, ProgressionStepModel } from './progressionTypes'

const ROMAN_DEGREES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
const FUNCTION_BY_DEGREE: Record<number, ProgressionStepModel['function']> = {
  1: 'tonic',
  4: 'subdominant',
  5: 'dominant'
}

/**
 * Diatonic progressions in major keys. 4536251 is the common pop progression
 * IV-V-iii-vi-ii-V-I; qualities are the standard diatonic ones (VERIFIED).
 */
export const PROGRESSION_DEFINITIONS: Record<ProgressionId, ProgressionDefinition> = {
  '4536251': {
    id: '4536251',
    name: '4536251',
    steps: [
      { degree: 4, quality: 'major' },
      { degree: 5, quality: 'major' },
      { degree: 3, quality: 'minor' },
      { degree: 6, quality: 'minor' },
      { degree: 2, quality: 'minor' },
      { degree: 5, quality: 'major' },
      { degree: 1, quality: 'major' }
    ]
  },
  'I-IV-V-I': {
    id: 'I-IV-V-I',
    name: 'I-IV-V-I',
    steps: [
      { degree: 1, quality: 'major' },
      { degree: 4, quality: 'major' },
      { degree: 5, quality: 'major' },
      { degree: 1, quality: 'major' }
    ]
  },
  'I-V-vi-IV': {
    id: 'I-V-vi-IV',
    name: 'I-V-vi-IV',
    steps: [
      { degree: 1, quality: 'major' },
      { degree: 5, quality: 'major' },
      { degree: 6, quality: 'minor' },
      { degree: 4, quality: 'major' }
    ]
  },
  'ii-V-I': {
    id: 'ii-V-I',
    name: 'ii-V-I',
    steps: [
      { degree: 2, quality: 'minor' },
      { degree: 5, quality: 'major' },
      { degree: 1, quality: 'major' }
    ]
  },
  'I-vi-IV-V': {
    id: 'I-vi-IV-V',
    name: 'I-vi-IV-V',
    steps: [
      { degree: 1, quality: 'major' },
      { degree: 6, quality: 'minor' },
      { degree: 4, quality: 'major' },
      { degree: 5, quality: 'major' }
    ]
  }
}

export function getProgressionDefinition(id: ProgressionId): ProgressionDefinition {
  return PROGRESSION_DEFINITIONS[id]
}

const MAJOR_SCALE_DEGREES = [0, 2, 4, 5, 7, 9, 11]

export function getDiatonicRoot(keyPitchClass: number, degree: number): number {
  const safeDegree = Math.min(7, Math.max(1, Math.round(degree)))
  return (keyPitchClass + MAJOR_SCALE_DEGREES[safeDegree - 1]) % 12
}

export function buildProgression(
  progressionId: ProgressionId,
  keyPitchClass: number,
  options: { smoothBass?: boolean; registerLowest?: number } = {}
): ProgressionModel {
  const definition = getProgressionDefinition(progressionId)
  const smoothBass = options.smoothBass ?? true
  const registerLowest = options.registerLowest ?? 48
  const steps: ProgressionStepModel[] = []
  let previousIdentity: ChordV2Identity | null = null

  definition.steps.forEach((step, index) => {
    const root = getDiatonicRoot(keyPitchClass, step.degree)
    const identity = getChordV2Identity(root, step.quality)
    const bassConstraint = smoothBass && previousIdentity
      ? pickSmoothBass(previousIdentity, identity, registerLowest)
      : root
    const voicing = createDefaultVoicing(identity, {
      registerLowest,
      registerHighest: 84,
      bassConstraint
    })

    steps.push({
      index,
      degree: step.degree,
      roman: ROMAN_DEGREES[step.degree - 1],
      function: FUNCTION_BY_DEGREE[step.degree] ?? 'other',
      identity,
      voicing,
      bassConstraint
    })
    previousIdentity = identity
  })

  return {
    id: progressionId,
    name: definition.name,
    key: keyPitchClass,
    steps
  }
}

function pickSmoothBass(previous: ChordV2Identity, current: ChordV2Identity, registerLowest: number): number {
  const candidates = current.requiredPitchClasses
  const ranked = candidates
    .map((pitchClass) => ({
      pitchClass,
      score: voiceLeadingScore(previous, { ...current, root: pitchClass })
    }))
    .sort((left, right) => left.score - right.score)
  return ranked[0]?.pitchClass ?? current.root
}

export function getProgressionStepSymbol(step: ProgressionStepModel): string {
  const bass = step.bassConstraint ?? step.identity.root
  return formatChordSymbol(
    step.identity.root,
    step.identity.quality,
    ((bass % 12) + 12) % 12 === step.identity.root ? undefined : bass
  )
}

export function judgeProgressionStep(step: ProgressionStepModel, inputNotes: number[]): 'correct' | 'wrong' {
  return judgeVoicing(step.voicing, inputNotes, 'inversion').judgement === 'correct' ? 'correct' : 'wrong'
}
