export function midiNumberToFrequency(midiNumber: number): number {
  return 440 * 2 ** ((midiNumber - 69) / 12)
}

export function normalizeMidiVelocity(velocity: number): number {
  if (!Number.isFinite(velocity)) {
    return 0
  }

  return Math.min(1, Math.max(0, velocity / 127))
}
