export type ChordPracticePhase = 'arpeggio' | 'block'
export type ChordQuestionCount = 10 | 20 | 50 | 100 | 'endless'

export const CHORD_PRACTICE_MODE_OPTIONS = Object.freeze(['sequential', 'comprehensive'] as const)

export const CHORD_SEQUENTIAL_SCOPE_CONTRACT = Object.freeze({
  10: Object.freeze({ bagSize: 7, triadInversions: Object.freeze([0]), seventhInversions: Object.freeze([]) }),
  20: Object.freeze({ bagSize: 7, triadInversions: Object.freeze([0]), seventhInversions: Object.freeze([]) }),
  50: Object.freeze({ bagSize: 14, triadInversions: Object.freeze([0]), seventhInversions: Object.freeze([0]) }),
  100: Object.freeze({ bagSize: 28, triadInversions: Object.freeze([0, 1, 2]), seventhInversions: Object.freeze([0]) }),
  endless: Object.freeze({ bagSize: 49, triadInversions: Object.freeze([0, 1, 2]), seventhInversions: Object.freeze([0, 1, 2, 3]) })
} as const)

export const CHORD_SEQUENTIAL_LEARNING_CONTRACT = Object.freeze({
  currentKeyChangesAutomatically: false,
  bagPositionPersistsAcrossSessions: false,
  wrongConsumesAnotherBagItem: false,
  delayedErrorReview: false,
  masteryAlgorithm: false
} as const)

export const CHORD_PRACTICE_PHASE_ORDER: readonly ChordPracticePhase[] = Object.freeze([
  'arpeggio',
  'block'
])

export const CHORD_PRACTICE_FLOW_CONTRACT = Object.freeze({
  initialPhase: 'arpeggio',
  arpeggioSuccessNext: 'wait-all-keys-up-to-block',
  blockSuccessNext: 'wait-all-keys-up-to-question-complete',
  arpeggioFailureAfterRelease: 'restart-same-question-at-arpeggio-first-note',
  blockFailureAfterRelease: 'restart-same-question-at-arpeggio-first-note'
} as const)

export const CHORD_BLOCK_CAPTURE_CONTRACT = Object.freeze({
  captureWindowMs: 150,
  calibrationStatus: 'FROZEN_FOR_CHORD_V1',
  startsOn: 'first-note-on',
  closesEarlyWhenAllExpectedNotesAppear: false,
  ignoresCc64ForJudgement: true,
  requiresPhysicalReleaseGate: true
} as const)

export const CHORD_QUESTION_SUCCESS_FEEDBACK_MS = 800 as const

export const CHORD_QUESTION_COUNT_OPTIONS: readonly ChordQuestionCount[] = Object.freeze([
  10,
  20,
  50,
  100,
  'endless'
])

export interface ChordReportFactsContract {
  readonly completedQuestions: number
  readonly firstPassCompleteQuestions: number
  readonly firstPassCompletionRate: number | null
  readonly totalErrors: number
  readonly arpeggioErrors: number
  readonly blockErrors: number
  readonly longestFirstPassStreak: number
}

export const CHORD_REPORT_PRODUCT_CONTRACT = Object.freeze({
  module: 'chord',
  completionRateLabel: '完成率',
  completionRateFormula: 'firstPassCompleteQuestions / completedQuestions',
  firstPassDefinition: 'arpeggio-and-block-both-succeed-on-first-attempt-with-no-failure',
  errorLabel: '错误',
  hasQuestionTimeout: false,
  reuseSightReadingAccuracy: false,
  finiteCompletion: 'natural-completion-or-end-and-save',
  infiniteCompletion: 'end-and-save-only',
  earlySaveScope: 'fully-settled-completed-questions-only',
  incompleteBlockQuestionCountsAsCompleted: false,
  infiniteCompletedCountUsesDenominator: false
} as const)

export const CHORD_HISTORY_CARD_PRODUCT_CONTRACT = Object.freeze({
  module: 'chord',
  chordRecordsMayOpenChordReportDetail: true,
  sightReadingRecordsRemainNonInteractive: true,
  leftSummaryFields: Object.freeze(['completed', 'errors', 'practice-duration'] as const),
  rightPrimaryMetric: 'first-pass-completion-rate',
  rightPrimaryMetricLabel: '完成率',
  finiteCompletedDisplay: 'completed/target',
  infiniteCompletedDisplay: 'completed-without-denominator'
} as const)

export const CHORD_REPORT_DETAIL_PRODUCT_CONTRACT = Object.freeze({
  sections: Object.freeze({
    performance: Object.freeze([
      'completed',
      'first-pass-complete',
      'first-pass-completion-rate',
      'total-errors',
      'arpeggio-errors',
      'block-errors',
      'longest-first-pass-streak'
    ] as const),
    proficiencySpeed: Object.freeze([
      'question-start-latency',
      'arpeggio-duration',
      'switch-to-block-latency',
      'block-landing-spread'
    ] as const),
    weaknesses: Object.freeze([
      'slowest-quality',
      'slowest-inversion',
      'most-error-quality'
    ] as const)
  }),
  productionNavigationImplemented: false,
  durableStorageImplemented: true
} as const)

export const CHORD_TIMING_METRIC_CONTRACTS = Object.freeze({
  questionStartLatency: Object.freeze({
    label: '开始弹奏用时',
    semantics: 'question-ready-to-first-arpeggio-stage-note-on-on-first-attempt',
    requiresCorrectness: false,
    retryReplacesSample: false,
    stopBeforeFirstArpeggioNoteOn: 'null'
  }),
  arpeggioDuration: Object.freeze({
    label: '分解弹奏用时',
    semantics: 'first-to-final-arpeggio-note-on-in-final-successful-complete-cycle'
  }),
  switchToBlockLatency: Object.freeze({
    label: '切换柱式用时',
    semantics: 'successful-arpeggio-release-gate-settled-to-first-block-note-on-in-final-successful-cycle'
  }),
  blockLandingSpread: Object.freeze({
    label: '同时落键差',
    semantics: 'first-to-last-target-block-note-on-in-successful-block-attempt'
  })
} as const)

export const CHORD_TIMING_PRIMARY_AGGREGATE = 'median' as const
export const CHORD_TIMING_EXCLUDES_PAUSED_TIME = true as const
export const CHORD_FAILURE_TIMING_CONTRACT = Object.freeze({
  questionStartLatencyRestartsAfterFailure: false,
  successfulCycleMetricsUseFinalSuccessfulCycle: true,
  failedAttemptTimingsExcludedFromPrimarySummary: true
} as const)
