import type { ScoreDocument } from '../score/musicXmlTypes'
import { useScorePractice, type ScorePracticeMode, type UseScorePracticeResult } from './useScorePractice'

export type { ScorePracticeMode, UseScorePracticeResult }

/** Wait-mode convenience wrapper over the unified score practice hook. */
export function useScoreWaitPractice(score: ScoreDocument | null): UseScorePracticeResult {
  return useScorePractice(score, 'wait')
}
