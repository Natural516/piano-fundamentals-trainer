import type { ChordV2Identity, ChordV2InversionMode, ChordV2Quality, VoicingSpec } from './chordV2Types'
import { getQualityDefinition } from './chordIdentity'

export interface VoicingValidationResult {
  valid: boolean
  reasons: string[]
}

function pitchClass(midiNumber: number): number {
  return ((midiNumber % 12) + 12) % 12
}

export function isChordTonePitchClass(identity: ChordV2Identity, pc: number): boolean {
  const normalized = ((pc % 12) + 12) % 12
  return identity.requiredPitchClasses.includes(normalized) || identity.optionalPitchClasses.includes(normalized)
}

/**
 * Fail-closed voicing validator: every note in a voicing must belong to the
 * Chord Identity (required or explicit optional/extension pitch classes).
 * Used before a target enters UI / playback / judgment.
 */
export function validateVoicing(identity: ChordV2Identity, voicing: VoicingSpec, options: { maxHandSpan?: number } = {}): VoicingValidationResult {
  const reasons: string[] = []
  const maxHandSpan = options.maxHandSpan ?? 24
  const notes = [...voicing.exactNotes].sort((left, right) => left - right)

  if (notes.length === 0) {
    reasons.push('voicing 为空')
  }

  for (const note of notes) {
    if (!isChordTonePitchClass(identity, note)) {
      reasons.push(`非和弦音: MIDI ${note} (pitch class ${pitchClass(note)})`)
    }
    if (note < voicing.range.lowest || note > voicing.range.highest) {
      reasons.push(`超出音域: ${note}`)
    }
  }

  if (notes.length > 0 && notes[notes.length - 1] - notes[0] > maxHandSpan) {
    reasons.push(`手跨度过大: ${notes[notes.length - 1] - notes[0]} > ${maxHandSpan}`)
  }

  if (voicing.bassConstraint !== null && !isChordTonePitchClass(identity, voicing.bassConstraint)) {
    reasons.push(`非法低音: ${voicing.bassConstraint}`)
  }

  return { valid: reasons.length === 0, reasons }
}

export function assertValidVoicing(identity: ChordV2Identity, voicing: VoicingSpec): void {
  const result = validateVoicing(identity, voicing)
  if (!result.valid) {
    throw new Error(`Voicing validation failed: ${result.reasons.join('; ')}`)
  }
}

/**
 * Bass/inversion candidates for a root + quality.
 * - 'root': root only
 * - 'inversions': first/second (+ third for 7th chords), never the root
 * - 'all': root AND all inversions
 */
export function getBassCandidates(
  root: number,
  quality: ChordV2Quality,
  inversionMode: ChordV2InversionMode
): number[] {
  const definition = getQualityDefinition(quality)
  const inversions = definition.intervals.slice(1).map((offset) => (root + offset) % 12)
  if (inversionMode === 'root') return [root]
  if (inversionMode === 'inversions') return inversions
  return [root, ...inversions]
}
