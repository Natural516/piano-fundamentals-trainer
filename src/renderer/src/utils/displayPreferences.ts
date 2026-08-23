export interface DisplayPreferences {
  version: 2
  showVirtualKeyboard: boolean
}

export type DisplayPreferenceScope =
  | 'midi-test'
  | 'sight-reading'
  | 'rhythm'
  | 'scales'
  | 'chords'
  | 'coordination'
  | 'score-practice'
  | 'free-practice'

export const DISPLAY_PREFERENCES_STORAGE_KEY = 'piano-trainer.display-preferences.v1'
export const DISPLAY_PREFERENCES_CHANGED_EVENT = 'piano-trainer:display-preferences-changed'
export const DISPLAY_PREFERENCES_STORAGE_KEYS: Record<DisplayPreferenceScope, string> = {
  'midi-test': 'piano-trainer.display-preferences.v2.midi-test',
  'sight-reading': 'piano-trainer.display-preferences.v2.sight-reading',
  rhythm: 'piano-trainer.display-preferences.v2.rhythm',
  scales: 'piano-trainer.display-preferences.v2.scales',
  chords: 'piano-trainer.display-preferences.v2.chords',
  coordination: 'piano-trainer.display-preferences.v2.coordination',
  'score-practice': 'piano-trainer.display-preferences.v2.score-practice',
  'free-practice': 'piano-trainer.display-preferences.v2.free-practice'
}

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  version: 2,
  showVirtualKeyboard: false
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeDisplayPreferences(value: unknown): DisplayPreferences {
  if (!isObject(value)) return DEFAULT_DISPLAY_PREFERENCES
  return {
    version: 2,
    showVirtualKeyboard: typeof value.showVirtualKeyboard === 'boolean'
      ? value.showVirtualKeyboard
      : DEFAULT_DISPLAY_PREFERENCES.showVirtualKeyboard
  }
}

export function readDisplayPreferences(
  scope: DisplayPreferenceScope,
  storage: Pick<Storage, 'getItem'> = window.localStorage
): DisplayPreferences {
  try {
    const stored = storage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS[scope])
    return stored ? normalizeDisplayPreferences(JSON.parse(stored)) : DEFAULT_DISPLAY_PREFERENCES
  } catch {
    return DEFAULT_DISPLAY_PREFERENCES
  }
}

export function writeDisplayPreferences(
  scope: DisplayPreferenceScope,
  preferences: DisplayPreferences,
  storage: Pick<Storage, 'setItem'> = window.localStorage
): boolean {
  try {
    storage.setItem(DISPLAY_PREFERENCES_STORAGE_KEYS[scope], JSON.stringify(normalizeDisplayPreferences(preferences)))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(DISPLAY_PREFERENCES_CHANGED_EVENT, { detail: { scope } }))
    }
    return true
  } catch {
    return false
  }
}
