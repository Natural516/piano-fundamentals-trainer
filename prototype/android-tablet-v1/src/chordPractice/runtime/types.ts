import type { SightReadingMidiEvent } from '../../../../../src/sightReading/midi'
import type { ChordJudgementSnapshot, ChordJudgementSuspensionReason, ChordQuestionTimingFacts } from '../judgement'
import type { ChordPracticeQuestion, ChordPracticeQuestionIdentity, ChordSequentialMajorKeyId } from '../../musicTheory/chords'
import type { ChordQuestionCount } from '../../musicTheory/chords/productContract'

export interface ChordRuntimeClock {
  now(): number
}

export interface ChordRuntimeScheduler {
  schedule(callback: () => void, delayMs: number): number
  cancel(id: number): void
}

export interface ChordRuntimeDependencies {
  readonly clock: ChordRuntimeClock
  readonly scheduler: ChordRuntimeScheduler
  readonly rng: () => number
}

export type ChordRuntimeStatus = 'IDLE' | 'RUNNING' | 'SUCCESS_FEEDBACK' | 'SUSPENDED' | 'SESSION_COMPLETE' | 'STOPPED'
export type ChordPracticeMode = 'sequential' | 'comprehensive'

export interface ChordRuntimeSessionConfig {
  readonly mode: ChordPracticeMode
  readonly questionCount: ChordQuestionCount
  readonly sequentialKey?: ChordSequentialMajorKeyId
}

export interface ChordRuntimeCounters {
  readonly completedQuestions: number
  readonly firstPassCompletedQuestions: number
  readonly arpeggioErrors: number
  readonly blockErrors: number
  readonly totalErrors: number
  readonly currentFirstPassStreak: number
  readonly longestFirstPassStreak: number
}

export interface ChordRuntimeSnapshot {
  readonly status: ChordRuntimeStatus
  readonly question: ChordPracticeQuestion | null
  readonly questionIdentity: ChordPracticeQuestionIdentity | null
  readonly questionGeneration: number
  readonly questionIndex: number
  readonly questionCount: ChordQuestionCount
  readonly mode: ChordPracticeMode
  readonly sequentialKey: ChordSequentialMajorKeyId | null
  readonly judgement: ChordJudgementSnapshot | null
  readonly counters: ChordRuntimeCounters
  readonly timingSamples: readonly ChordQuestionTimingFacts[]
  /** Monotonic active session time; approved pause/suspension intervals are excluded. */
  readonly activePracticeDurationMs: number
  readonly successFeedbackRemainingMs: number | null
  readonly waitingForInterQuestionRelease: boolean
  readonly suspensionReason: ChordJudgementSuspensionReason | null
  readonly transportReady: boolean
  readonly resumeRequired: boolean
  readonly receivedMidiEventCount: number
  readonly forwardedMidiEventCount: number
  readonly lastNormalizedEvent: SightReadingMidiEvent | null
}
