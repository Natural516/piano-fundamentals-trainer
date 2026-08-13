import { formatChordSymbol } from '../chordV2/chordIdentity'
import { createArpeggioSequence, createDefaultVoicing } from '../chordV2/voicing'
import { voiceLeadingScore } from '../chordV2/harmony'
import type { VoicingSpec } from '../chordV2/chordV2Types'
import { buildProgression, getProgressionStepSymbol } from './progressions'
import type { ArrangementVariation, ProgressionId } from './progressionTypes'

export interface ArrangementOptions {
  registerLowest?: number
  registerHighest?: number
  maxSpacingSemitones?: number
}

export function validatePlayability(voicing: VoicingSpec, options: ArrangementOptions = {}): boolean {
  const highest = options.registerHighest ?? 88
  const maxSpacing = options.maxSpacingSemitones ?? 24
  const notes = [...voicing.exactNotes].sort((left, right) => left - right)

  if (notes.length === 0 || notes[0] < voicing.range.lowest || notes[notes.length - 1] > highest) {
    return false
  }

  for (let index = 1; index < notes.length; index += 1) {
    if (notes[index] - notes[index - 1] > maxSpacing) {
      return false
    }
  }

  return true
}

export function createArrangementVariation(
  progressionId: ProgressionId,
  keyPitchClass: number,
  random: () => number = Math.random
): ArrangementVariation {
  const progression = buildProgression(progressionId, keyPitchClass, { smoothBass: true })
  const steps = progression.steps.map((step, index) => {
    const useArpeggio = random() > 0.55
    const voicing = useArpeggio
      ? createDefaultVoicing(step.identity, {
          registerLowest: 60,
          registerHighest: 84,
          bassConstraint: step.bassConstraint ?? undefined,
          spacing: 'close'
        })
      : step.voicing
    const exactNotes = useArpeggio ? createArpeggioSequence(voicing, index % 2 === 0 ? 'up' : 'down') : voicing.exactNotes

    return {
      index,
      roman: step.roman,
      symbol: getProgressionStepSymbol(step),
      texture: useArpeggio ? 'arpeggio' as const : 'block' as const,
      exactNotes
    }
  })

  let totalScore = 0
  let playable = true
  for (let index = 0; index < progression.steps.length; index += 1) {
    const current = progression.steps[index]
    if (!validatePlayability(current.voicing)) {
      playable = false
    }
    if (index > 0) {
      totalScore += voiceLeadingScore(progression.steps[index - 1].identity, current.identity)
    }
  }

  return {
    progressionId,
    key: keyPitchClass,
    steps,
    voiceLeadingScore: totalScore,
    playable
  }
}

export function formatArrangementStep(step: ArrangementVariation['steps'][number]): string {
  return `${step.roman} ${step.symbol} · ${step.texture === 'arpeggio' ? '分解' : '柱式'} · [${step.exactNotes.join(', ')}]`
}
