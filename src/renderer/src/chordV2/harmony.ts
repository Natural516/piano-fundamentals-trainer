import type { ChordV2Identity, HarmonyContext } from './chordV2Types'

const MAJOR_SCALE_DEGREES = [0, 2, 4, 5, 7, 9, 11]

function pitchClass(midiNumber: number): number {
  return ((midiNumber % 12) + 12) % 12
}

/**
 * Harmonic function for diatonic chords in a major key.
 * I→tonic, IV→subdominant, V→dominant are [VERIFIED] from standard tonal
 * harmony. Other degrees return 'other' rather than guessing.
 */
export function getHarmonicFunction(
  keyPitchClass: number,
  rootPitchClass: number,
  _quality: ChordV2Identity['quality']
): HarmonyContext['function'] {
  const degree = MAJOR_SCALE_DEGREES.indexOf(((pitchClass(rootPitchClass) - pitchClass(keyPitchClass)) % 12 + 12) % 12)
  if (degree < 0) return 'other'

  if (degree === 0) return 'tonic'
  if (degree === 3) return 'subdominant'
  if (degree === 4) return 'dominant'
  return 'other'
}

export function getScaleDegree(keyPitchClass: number, rootPitchClass: number): number | null {
  const degree = MAJOR_SCALE_DEGREES.indexOf(((pitchClass(rootPitchClass) - pitchClass(keyPitchClass)) % 12 + 12) % 12)
  return degree < 0 ? null : degree + 1
}

export function createHarmonyContext(
  keyPitchClass: number,
  identity: ChordV2Identity,
  preceding: ChordV2Identity | null = null,
  next: ChordV2Identity | null = null
): HarmonyContext {
  return {
    key: keyPitchClass,
    scaleDegree: getScaleDegree(keyPitchClass, identity.root),
    function: getHarmonicFunction(keyPitchClass, identity.root, identity.quality),
    precedingChord: preceding,
    nextChord: next,
    secondaryFunction: null
  }
}

function octaveAdjustedDistance(left: number, right: number): number {
  const direct = Math.abs(left - right)
  return Math.min(direct, Math.abs(direct - 12), Math.abs(direct - 24))
}

/**
 * Voice-leading heuristic: fewer common tones lost and less total movement is
 * better. Lower score = smoother. [HEURISTIC] — never used for hard judgment.
 */
export function voiceLeadingScore(from: ChordV2Identity, to: ChordV2Identity): number {
  const fromTones = new Set(from.requiredPitchClasses)
  const commonTones = to.requiredPitchClasses.filter((pc) => fromTones.has(pc)).length
  const fromCount = from.requiredPitchClasses.length
  const toCount = to.requiredPitchClasses.length
  const commonScore = (fromCount + toCount - commonTones * 2) * 2

  const fromRoot = from.root
  const toRoot = to.root
  const bassMovement = octaveAdjustedDistance(fromRoot, toRoot)

  return commonScore + bassMovement
}
