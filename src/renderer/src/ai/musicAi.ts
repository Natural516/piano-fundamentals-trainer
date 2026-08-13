import { createArrangementVariation } from '../harmony/arrangement'
import { validatePlayability } from '../harmony/arrangement'
import { voiceLeadingScore } from '../chordV2/harmony'
import { getChordV2Identity } from '../chordV2/chordIdentity'
import type { ArrangementVariation, ProgressionId } from '../harmony/progressionTypes'

export interface MusicAiInput {
  progressionId: ProgressionId
  keyPitchClass: number
  variationIndex: number
}

/**
 * Music-AI candidate generation is deterministic + validated: generated
 * variations must pass playability and voice-leading checks before being
 * offered. [HEURISTIC] — never used for hard judgment.
 */
export function generatePracticeVariation(input: MusicAiInput): ArrangementVariation {
  const seed = (input.variationIndex * 0.37 + 0.13) % 1
  const variation = createArrangementVariation(input.progressionId, input.keyPitchClass, () => seed)
  return variation
}

export function validateGeneratedVariation(variation: ArrangementVariation): { valid: boolean; reasons: string[] } {
  const reasons: string[] = []
  const identities = variation.steps.map((step) => step.roman)

  if (variation.steps.length === 0) {
    reasons.push('变化为空')
  }
  if (!variation.playable) {
    reasons.push('存在不可演奏声部')
  }
  if (variation.voiceLeadingScore > 80) {
    reasons.push('声部连接评分过差')
  }
  if (new Set(identities).size === 0) {
    reasons.push('缺少和弦身份')
  }

  return { valid: reasons.length === 0, reasons }
}

export function validateMelodyCandidate(midiNotes: number[], range: { lowest: number; highest: number }): boolean {
  return midiNotes.length > 0 && midiNotes.every((note) => note >= range.lowest && note <= range.highest)
}

export function scoreVoiceLeadingBetweenVariants(left: ArrangementVariation, right: ArrangementVariation): number {
  const leftLast = left.steps[left.steps.length - 1]
  const rightFirst = right.steps[0]
  if (!leftLast || !rightFirst) return 0
  const from = getChordV2Identity(leftLast.exactNotes[0] ?? 0, 'major')
  const to = getChordV2Identity(rightFirst.exactNotes[0] ?? 0, 'major')
  return voiceLeadingScore(from, to)
}

export { validatePlayability }
