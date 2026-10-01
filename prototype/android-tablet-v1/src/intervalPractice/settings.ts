import type { PreferencesBackend } from '../androidPersistenceCore'
import { CHORD_QUESTION_COUNT_OPTIONS } from '../musicTheory/chords'
import type { IntervalPracticeSettings, IntervalQuestionCount } from './types'

export const INTERVAL_PRACTICE_SETTINGS_STORAGE_KEY = 'piano.v1.interval-practice.settings' as const
export const INTERVAL_PRACTICE_SETTINGS_SCHEMA_VERSION = 3 as const
export const INTERVAL_QUESTION_COUNT_OPTIONS: readonly IntervalQuestionCount[] = CHORD_QUESTION_COUNT_OPTIONS

export const DEFAULT_INTERVAL_PRACTICE_SETTINGS: IntervalPracticeSettings = Object.freeze({
  schemaVersion: INTERVAL_PRACTICE_SETTINGS_SCHEMA_VERSION,
  answerHint: false,
  includeAccidentalRoots: false,
  questionCount: 20
})

export function isIntervalQuestionCount(value: unknown): value is IntervalQuestionCount {
  return INTERVAL_QUESTION_COUNT_OPTIONS.includes(value as IntervalQuestionCount)
}

/** Wide-read V1/V2/V3; retired mode/order/stage never drive behavior. No storage migration. */
export function parseIntervalPracticeSettings(raw: string | null): IntervalPracticeSettings {
  if (raw === null) return DEFAULT_INTERVAL_PRACTICE_SETTINGS
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return DEFAULT_INTERVAL_PRACTICE_SETTINGS
    const candidate = value as Record<string, unknown>
    if (typeof candidate.answerHint !== 'boolean') {
      return DEFAULT_INTERVAL_PRACTICE_SETTINGS
    }
    return Object.freeze({
      schemaVersion: INTERVAL_PRACTICE_SETTINGS_SCHEMA_VERSION,
      answerHint: candidate.answerHint,
      includeAccidentalRoots: typeof candidate.includeAccidentalRoots === 'boolean'
        ? candidate.includeAccidentalRoots
        : DEFAULT_INTERVAL_PRACTICE_SETTINGS.includeAccidentalRoots,
      questionCount: isIntervalQuestionCount(candidate.questionCount)
        ? candidate.questionCount
        : DEFAULT_INTERVAL_PRACTICE_SETTINGS.questionCount
    })
  } catch {
    return DEFAULT_INTERVAL_PRACTICE_SETTINGS
  }
}

export class IntervalPracticeSettingsRepository {
  constructor(private readonly backend: PreferencesBackend) {}

  async load(): Promise<IntervalPracticeSettings> {
    return parseIntervalPracticeSettings((await this.backend.get({ key: INTERVAL_PRACTICE_SETTINGS_STORAGE_KEY })).value)
  }

  async save(settings: IntervalPracticeSettings): Promise<void> {
    // Explicit projection prevents obsolete fields from leaking into new writes.
    const current = { schemaVersion: INTERVAL_PRACTICE_SETTINGS_SCHEMA_VERSION, answerHint: settings.answerHint, includeAccidentalRoots: settings.includeAccidentalRoots, questionCount: settings.questionCount }
    await this.backend.set({ key: INTERVAL_PRACTICE_SETTINGS_STORAGE_KEY, value: JSON.stringify(current) })
  }
}
