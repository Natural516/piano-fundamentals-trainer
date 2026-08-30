import { isMajorKeyId, type MajorKeyId } from './musicKeySignatures'
import type { SightReadingStaffMode } from './sightReadingNotes'

export type SightReadingQuestionCount = 10 | 20 | 50 | 100
/** Retained for old desktop report types. Migration and V1 sessions always use 1. */
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

export const DEFAULT_SIGHT_READING_SETTINGS: Readonly<SightReadingSettings> = {
  staffMode: 'treble', noteCount: 1, questionCount: 20,
  keySignature: 'C', notePoolMode: 'diatonic', noteNameVisible: true
}

export const ANDROID_SIGHT_READING_DEFAULTS: Readonly<SightReadingSettings> = {
  ...DEFAULT_SIGHT_READING_SETTINGS, staffMode: 'grand', noteNameVisible: false
}

export const SIGHT_READING_SETTINGS_STORAGE_KEY = 'piano-trainer.sight-reading-settings.v4'
export const SIGHT_READING_LEGACY_STORAGE_KEYS = [
  'piano-trainer.sight-reading-settings.v3',
  'piano-trainer.sight-reading-settings.v2',
  'piano-trainer.sight-reading-settings.v1',
  'piano-trainer.sight-reading-settings'
] as const

export function migrateSightReadingSettings(
  value: unknown,
  defaults: Readonly<SightReadingSettings> = DEFAULT_SIGHT_READING_SETTINGS
): SightReadingSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ...defaults, noteCount: 1 }
  const raw = value as Record<string, unknown>
  const rawStaffMode = raw.staffMode ?? raw.clefMode ?? raw.clef
  const staffMode = rawStaffMode === 'bass' ? 'bass'
    : rawStaffMode === 'grand' || rawStaffMode === 'mixed' ? 'grand'
      : rawStaffMode === 'treble' ? 'treble' : defaults.staffMode
  const rawQuestionCount = Number(raw.questionCount)
  const questionCount = rawQuestionCount === 10 || rawQuestionCount === 20 || rawQuestionCount === 50 || rawQuestionCount === 100
    ? rawQuestionCount : defaults.questionCount
  const rawKeySignature = raw.keySignature ?? raw.key
  const rawNoteNameVisible = raw.noteNameVisible ?? raw.showNoteName
  return {
    staffMode, noteCount: 1, questionCount,
    keySignature: isMajorKeyId(rawKeySignature) ? rawKeySignature : defaults.keySignature,
    notePoolMode: raw.notePoolMode === 'chromatic' ? 'chromatic' : 'diatonic',
    noteNameVisible: typeof rawNoteNameVisible === 'boolean' ? rawNoteNameVisible : defaults.noteNameVisible
  }
}

export interface SightReadingSettingsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type SightReadingSettingsReadResult =
  | { success: true; settings: SightReadingSettings }
  | { success: false; settings: SightReadingSettings; error: string }
export type SightReadingWriteResult = { success: true } | { success: false; error: string }

/** No storage singleton: Android will supply its own adapter and defaults later. */
export function createSightReadingSettingsStore(
  storage: SightReadingSettingsStorage,
  defaults: Readonly<SightReadingSettings>,
  key = SIGHT_READING_SETTINGS_STORAGE_KEY,
  legacyKeys: readonly string[] = SIGHT_READING_LEGACY_STORAGE_KEYS
): { read(): SightReadingSettingsReadResult; write(settings: SightReadingSettings): SightReadingWriteResult } {
  return {
    read() {
      try {
        const current = storage.getItem(key)
        const legacy = legacyKeys.map((legacyKey) => storage.getItem(legacyKey)).find((value) => value !== null)
        const stored = current ?? legacy
        if (!stored) return { success: true, settings: { ...defaults, noteCount: 1 } }
        const settings = migrateSightReadingSettings(JSON.parse(stored), defaults)
        storage.setItem(key, JSON.stringify(settings))
        return { success: true, settings }
      } catch (error) {
        return { success: false, settings: { ...defaults, noteCount: 1 }, error: String(error) }
      }
    },
    write(settings) {
      try {
        storage.setItem(key, JSON.stringify(migrateSightReadingSettings(settings, defaults)))
        return { success: true }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    }
  }
}
