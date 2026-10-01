import type { MusicNotationPitch } from '../../../../src/sightReading/musicNotationTypes'
import type { ChordQuestionCount } from '../musicTheory/chords'
import type { IntervalPracticeQuestion, IntervalPracticeZone, IntervalSpelledNote, IntervalTypeId } from '../musicTheory/intervals'

export type IntervalQuestionCount = ChordQuestionCount

export interface IntervalPracticeSettings {
  readonly schemaVersion: 3
  readonly answerHint: boolean
  readonly includeAccidentalRoots: boolean
  readonly questionCount: IntervalQuestionCount
}

export interface ScheduledIntervalQuestion extends IntervalPracticeQuestion {
  readonly questionId: string
}

export interface IntervalSchedulerState {
  readonly intervalBag: readonly IntervalTypeId[]
  readonly zoneBag: readonly IntervalPracticeZone[]
  readonly recentRootMidis: readonly number[]
  readonly previousIntervalId: IntervalTypeId | null
  readonly issuedCount: number
}

export interface IntervalPracticeState {
  readonly settings: IntervalPracticeSettings
  readonly scheduler: IntervalSchedulerState
  readonly currentQuestion: ScheduledIntervalQuestion
}

export interface IntervalQuestionAttempt {
  readonly questionId: string
  readonly intervalId: IntervalTypeId
  readonly root: IntervalSpelledNote
  readonly target: IntervalSpelledNote
  readonly rootMidi: number
  readonly targetMidi: number
  readonly wrongAttemptCount: number
  readonly firstTryCorrect: boolean
  readonly completed: boolean
}

export type IntervalPracticeAction =
  | { readonly type: 'NEXT_QUESTION' }
  | { readonly type: 'UPDATE_SETTINGS'; readonly changes: Partial<Omit<IntervalPracticeSettings, 'schemaVersion'>> }

export interface IntervalNotationModel {
  readonly ariaLabel: string
  readonly notes: readonly MusicNotationPitch[]
  readonly answerLabel: string | null
  readonly targetVisible: boolean
  readonly unisonUsesSingleNotehead: boolean
}

export interface IntervalPracticePageModel {
  readonly questionId: string
  readonly intervalName: string
  readonly prompt: string
  readonly rootLabel: string
  readonly zone: IntervalPracticeZone
  readonly zoneLabel: string
  readonly notation: IntervalNotationModel
}
