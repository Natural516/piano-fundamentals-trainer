import type { MusicNotationFeedback } from '../../../src/sightReading/musicNotationTypes'

export type PracticeFeedbackSemantic = 'neutral' | 'success' | 'danger' | 'warning'

export interface SightReadingFeedbackPresentation {
  semantic: PracticeFeedbackSemantic
  noteFeedback: MusicNotationFeedback
}

export function presentSightReadingFeedback(
  feedbackActive: boolean,
  outcome: MusicNotationFeedback
): SightReadingFeedbackPresentation {
  if (!feedbackActive || outcome === null) {
    return { semantic: 'neutral', noteFeedback: null }
  }

  if (outcome === 'correct') {
    return { semantic: 'success', noteFeedback: 'correct' }
  }

  if (outcome === 'wrong_note') {
    return { semantic: 'danger', noteFeedback: 'wrong_note' }
  }

  return { semantic: 'warning', noteFeedback: 'timeout' }
}
