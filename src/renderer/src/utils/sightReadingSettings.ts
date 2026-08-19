import { isMajorKeyId, type MajorKeyId } from './musicKeySignatures'
import type { SightReadingStaffMode } from './sightReadingNotes'

export type SightReadingQuestionCount = 10 | 20 | 50 | 100
export type SightReadingNoteCount = 1 | 2 | 3
export type SightReadingNotePoolMode = 'diatonic' | 'chromatic'

export const SIGHT_READING_NOTE_POOL_MODE_LABELS: Record<SightReadingNotePoolMode, string> = {
  diatonic: '仅调内音',
  chromatic: '包含临时变音'
}

export const SIGHT_READING_ANSWER_TIMEOUT_MS = 5000

export interface SightReadingSettings {
  staffMode: SightReadingStaffMode
  noteCount: SightReadingNoteCount
  questionCount: SightReadingQuestionCount
  keySignature: MajorKeyId
  notePoolMode: SightReadingNotePoolMode
  noteNameVisible: boolean
}

export const DEFAULT_SIGHT_READING_SETTINGS: SightReadingSettings = {
  staffMode: 'treble',
  noteCount: 1,
  questionCount: 20,
  keySignature: 'C',
  notePoolMode: 'diatonic',
  noteNameVisible: true
}

export const SIGHT_READING_SETTINGS_STORAGE_KEY = 'piano-trainer.sight-reading-settings.v4'
const STORAGE_KEY = SIGHT_READING_SETTINGS_STORAGE_KEY
const LEGACY_STORAGE_KEYS = [
  'piano-trainer.sight-reading-settings.v3',
  'piano-trainer.sight-reading-settings.v2',
  'piano-trainer.sight-reading-settings.v1',
  'piano-trainer.sight-reading-settings'
]

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function migrateSightReadingSettings(value: unknown): SightReadingSettings {
  if (!isObject(value)) return { ...DEFAULT_SIGHT_READING_SETTINGS }

  const rawStaffMode = value.staffMode ?? value.clefMode ?? value.clef
  const staffMode: SightReadingStaffMode = rawStaffMode === 'bass'
    ? 'bass'
    : rawStaffMode === 'grand' || rawStaffMode === 'mixed'
      ? 'grand'
      : 'treble'
  const rawQuestionCount = Number(value.questionCount)
  const questionCount: SightReadingQuestionCount = rawQuestionCount === 10 || rawQuestionCount === 50 || rawQuestionCount === 100
    ? rawQuestionCount
    : 20
  const rawNoteNameVisible = value.noteNameVisible ?? value.showNoteName
  const rawKeySignature = value.keySignature ?? value.key
  const notePoolMode: SightReadingNotePoolMode = value.notePoolMode === 'chromatic'
    ? 'chromatic'
    : 'diatonic'

  return {
    staffMode,
    noteCount: 1,
    questionCount,
    keySignature: isMajorKeyId(rawKeySignature) ? rawKeySignature : 'C',
    notePoolMode,
    noteNameVisible: typeof rawNoteNameVisible === 'boolean' ? rawNoteNameVisible : true
  }
}

export function readSightReadingSettings(): SightReadingSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SIGHT_READING_SETTINGS }

  try {
    const currentValue = window.localStorage.getItem(STORAGE_KEY)
    const legacyValue = LEGACY_STORAGE_KEYS
      .map((key) => window.localStorage.getItem(key))
      .find((value) => value !== null)
    const stored = currentValue ?? legacyValue

    if (!stored) return { ...DEFAULT_SIGHT_READING_SETTINGS }

    const normalized = migrateSightReadingSettings(JSON.parse(stored))
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    return normalized
  } catch (error) {
    console.warn('[sight-reading] 读取练习设置失败，已使用默认设置。', error)
    return { ...DEFAULT_SIGHT_READING_SETTINGS }
  }
}

export function writeSightReadingSettings(settings: SightReadingSettings): boolean {
  if (typeof window === 'undefined') return false

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrateSightReadingSettings(settings)))
    return true
  } catch (error) {
    console.warn('[sight-reading] 保存练习设置失败。', error)
    return false
  }
}
