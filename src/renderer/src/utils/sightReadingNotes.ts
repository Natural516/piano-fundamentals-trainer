// Compatibility path: the pure implementation is shared with Android Sight Reading.
export * from '../../../sightReading/sightReadingNotes'

import { createShuffledSightReadingBag as shuffle } from '../../../sightReading/sightReadingNotes'
import type { SightReadingNote } from '../../../sightReading/sightReadingNotes'

// Legacy callers keep their optional browser RNG; shared orchestration injects it explicitly.
export function createShuffledSightReadingBag(
  notes: SightReadingNote[],
  previousMidiNumber: number | null = null,
  random: () => number = Math.random
): SightReadingNote[] {
  return shuffle(notes, previousMidiNumber, random)
}
