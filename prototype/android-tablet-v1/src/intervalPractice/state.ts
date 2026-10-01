import { createIntervalSchedulerState, scheduleNextIntervalQuestion, type IntervalPracticeRng } from './scheduler'
import type {
  IntervalPracticeAction,
  IntervalPracticeSettings,
  IntervalPracticeState
} from './types'

function withNextQuestion(
  settings: IntervalPracticeSettings,
  scheduler: ReturnType<typeof createIntervalSchedulerState>,
  rng: IntervalPracticeRng
): IntervalPracticeState {
  const scheduled = scheduleNextIntervalQuestion(scheduler, settings, rng)
  return Object.freeze({ settings, scheduler: scheduled.scheduler, currentQuestion: scheduled.question })
}

export function createIntervalPracticeState(
  settings: IntervalPracticeSettings,
  rng: IntervalPracticeRng
): IntervalPracticeState {
  return withNextQuestion(settings, createIntervalSchedulerState(), rng)
}

export function reduceIntervalPracticeState(
  state: IntervalPracticeState,
  action: IntervalPracticeAction,
  rng: IntervalPracticeRng
): IntervalPracticeState {
  if (action.type === 'NEXT_QUESTION') {
    return withNextQuestion(state.settings, state.scheduler, rng)
  }

  const settings: IntervalPracticeSettings = Object.freeze({ ...state.settings, ...action.changes })
  const schedulingChanged = settings.includeAccidentalRoots !== state.settings.includeAccidentalRoots
  if (schedulingChanged) return withNextQuestion(settings, createIntervalSchedulerState(), rng)
  return Object.freeze({ ...state, settings })
}

export function createIntervalPracticeReducer(rng: IntervalPracticeRng) {
  return (state: IntervalPracticeState, action: IntervalPracticeAction): IntervalPracticeState =>
    reduceIntervalPracticeState(state, action, rng)
}
