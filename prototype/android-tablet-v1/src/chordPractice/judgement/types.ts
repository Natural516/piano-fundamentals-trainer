export type ChordJudgementSuspensionReason =
  | 'manual-pause'
  | 'background'
  | 'midi-disconnect'
  | 'screen-lock'

export type ChordJudgementResumeTarget =
  | 'ARPEGGIO_READY'
  | 'BLOCK_READY'
  | 'QUESTION_COMPLETE'

export type ChordArpeggioErrorReason =
  | 'ARPEGGIO_WRONG_PITCH'
  | 'ARPEGGIO_WRONG_ORDER'

export type ChordBlockErrorReason =
  | 'BLOCK_WRONG_PITCH'
  | 'BLOCK_INCOMPLETE'

export type ChordJudgementErrorReason = ChordArpeggioErrorReason | ChordBlockErrorReason

export type ChordJudgementState =
  | { readonly phase: 'ARPEGGIO_READY'; readonly expectedIndex: number }
  | { readonly phase: 'ARPEGGIO_ACTIVE'; readonly expectedIndex: number }
  | { readonly phase: 'ARPEGGIO_WRONG_WAIT_RELEASE'; readonly reason: ChordArpeggioErrorReason }
  | { readonly phase: 'WAIT_ALL_KEYS_UP_BEFORE_BLOCK' }
  | { readonly phase: 'BLOCK_READY' }
  | {
    readonly phase: 'BLOCK_CAPTURE'
    readonly captureStartTimestampMs: number
    readonly captureCloseTimestampMs: number
    readonly capturedTargetNotes: readonly number[]
  }
  | { readonly phase: 'BLOCK_WRONG_WAIT_RELEASE'; readonly reason: ChordBlockErrorReason }
  | { readonly phase: 'WAIT_ALL_KEYS_UP_AFTER_BLOCK' }
  | {
    readonly phase: 'SUSPENDED'
    readonly reason: ChordJudgementSuspensionReason
    readonly resumeTarget: ChordJudgementResumeTarget
  }
  | {
    readonly phase: 'RESUME_WAIT_ALL_KEYS_UP'
    readonly reason: ChordJudgementSuspensionReason
    readonly resumeTarget: ChordJudgementResumeTarget
  }
  | { readonly phase: 'QUESTION_COMPLETE' }
  | { readonly phase: 'STOPPED'; readonly disposition: 'UNSETTLED_DISCARDED' | 'SETTLED_COMPLETED' }

export type ChordJudgementInputEvent =
  | { readonly type: 'NOTE_ON'; readonly note: number; readonly timestampMs: number }
  | { readonly type: 'NOTE_OFF'; readonly note: number; readonly timestampMs: number }
  | {
    readonly type: 'CONTROL_CHANGE'
    readonly controller: number
    readonly value: number
    readonly timestampMs: number
  }
  | { readonly type: 'TIME_ADVANCE'; readonly timestampMs: number }
  | { readonly type: 'INPUT_STATE_RESET'; readonly timestampMs: number }
  | {
    readonly type: 'SUSPEND'
    readonly reason: ChordJudgementSuspensionReason
    readonly timestampMs: number
  }
  | { readonly type: 'RESUME'; readonly timestampMs: number }
  | { readonly type: 'STOP'; readonly timestampMs: number }

export type ChordJudgementSettledEvent =
  | {
    readonly type: 'ARPEGGIO_ERROR'
    readonly reason: ChordArpeggioErrorReason
    readonly timestampMs: number
  }
  | {
    readonly type: 'BLOCK_ERROR'
    readonly reason: ChordBlockErrorReason
    readonly timestampMs: number
  }
  | {
    readonly type: 'QUESTION_COMPLETED'
    readonly firstPassCompleted: boolean
    readonly timestampMs: number
  }

export interface ChordQuestionTimingFacts {
  readonly questionStartLatencyMs: number | null
  readonly arpeggioDurationMs: number | null
  readonly switchToBlockLatencyMs: number | null
  readonly blockLandingSpreadMs: number | null
}

export interface ChordJudgementFacts {
  readonly arpeggioErrors: number
  readonly blockErrors: number
  readonly totalErrors: number
  readonly questionCompleted: boolean
  readonly firstPassEligible: boolean
  readonly firstPassCompleted: boolean | null
  readonly timing: ChordQuestionTimingFacts
}

export interface ChordJudgementTarget {
  readonly arpeggioMidi: readonly number[]
  readonly blockMidi: readonly number[]
}

export interface ChordJudgementSnapshot {
  readonly state: ChordJudgementState
  readonly target: ChordJudgementTarget
  readonly heldNotes: readonly number[]
  readonly facts: ChordJudgementFacts
  readonly settledEvents: readonly ChordJudgementSettledEvent[]
  readonly lastTimestampMs: number
}
