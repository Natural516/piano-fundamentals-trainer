import type { SightReadingRange, SightReadingStaffMode } from './sightReadingNotes'

export type SightReadingQuestionCount = 10 | 20 | 50 | 100

export interface SightReadingSettings {
  staffMode: SightReadingStaffMode
  range: SightReadingRange
  questionCount: SightReadingQuestionCount
  answerTimeLimitSeconds: number
  noteNameVisible: boolean
}

export const DEFAULT_SIGHT_READING_SETTINGS: SightReadingSettings = {
  staffMode: 'treble',
  range: 'common',
  questionCount: 20,
  answerTimeLimitSeconds: 5,
  noteNameVisible: true
}

const STORAGE_KEY = 'piano-trainer.sight-reading-settings.v2'
const LEGACY_STORAGE_KEYS = [
  'piano-trainer.sight-reading-settings.v1',
  'piano-trainer.sight-reading-settings'
]

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeSettings(value: unknown): SightReadingSettings {
  if (!isObject(value)) return DEFAULT_SIGHT_READING_SETTINGS

  const rawStaffMode = value.staffMode ?? value.clefMode ?? value.clef
  const staffMode: SightReadingStaffMode = rawStaffMode === 'bass'
    ? 'bass'
    : rawStaffMode === 'grand' || rawStaffMode === 'mixed'
      ? 'grand'
      : 'treble'
  const rawRange = value.rangeMode ?? value.range
  const range: SightReadingRange = rawRange === 'extended' ? 'extended' : 'common'
  const rawQuestionCount = Number(value.questionCount)
  const questionCount: SightReadingQuestionCount = rawQuestionCount === 10 || rawQuestionCount === 50 || rawQuestionCount === 100
    ? rawQuestionCount
    : 20
  const rawTimeLimit = Number(value.answerTimeLimitSeconds ?? value.timeLimitSeconds)
  const answerTimeLimitSeconds = Number.isInteger(rawTimeLimit) && rawTimeLimit >= 1 && rawTimeLimit <= 60
    ? rawTimeLimit
    : 5
  const rawNoteNameVisible = value.noteNameVisible ?? value.showNoteName

  return {
    staffMode,
    range,
    questionCount,
    answerTimeLimitSeconds,
    noteNameVisible: typeof rawNoteNameVisible === 'boolean' ? rawNoteNameVisible : true
  }
}

export function readSightReadingSettings(): SightReadingSettings {
  if (typeof window === 'undefined') return DEFAULT_SIGHT_READING_SETTINGS

  try {
    const currentValue = window.localStorage.getItem(STORAGE_KEY)
    const legacyValue = LEGACY_STORAGE_KEYS
      .map((key) => window.localStorage.getItem(key))
      .find((value) => value !== null)
    const stored = currentValue ?? legacyValue

    if (!stored) return DEFAULT_SIGHT_READING_SETTINGS

    const normalized = normalizeSettings(JSON.parse(stored))
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    return normalized
  } catch (error) {
    console.warn('[sight-reading] 读取练习设置失败，已使用默认设置。', error)
    return DEFAULT_SIGHT_READING_SETTINGS
  }
}

export function writeSightReadingSettings(settings: SightReadingSettings): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)))
  } catch (error) {
    console.warn('[sight-reading] 保存练习设置失败。', error)
  }
}
