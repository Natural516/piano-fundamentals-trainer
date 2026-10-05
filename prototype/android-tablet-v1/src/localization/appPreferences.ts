import type { PreferencesBackend } from '../androidPersistenceCore'
import { isLanguagePreference, type LanguagePreference } from './locale'

export const APP_PREFERENCES_KEY = 'piano.v1.app.preferences'
export const APP_PREFERENCES_SCHEMA_VERSION = 1 as const
export type LocalePreferenceError = 'readFailed' | 'invalidDocument' | 'futureSchema' | 'writeFailed'
export interface AppPreferencesDocument {
  schemaVersion: typeof APP_PREFERENCES_SCHEMA_VERSION
  languagePreference: LanguagePreference
}
export interface AppPreferencesLoadResult {
  preference: LanguagePreference
  error: LocalePreferenceError | null
  writable: boolean
}

function inspect(raw: string | null): AppPreferencesLoadResult {
  if (raw === null) return { preference: 'system', error: null, writable: true }
  try {
    const value: unknown = JSON.parse(raw)
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const document = value as Record<string, unknown>
      if (typeof document.schemaVersion === 'number' && document.schemaVersion > APP_PREFERENCES_SCHEMA_VERSION) {
        return { preference: 'system', error: 'futureSchema', writable: false }
      }
      if (document.schemaVersion === APP_PREFERENCES_SCHEMA_VERSION && isLanguagePreference(document.languagePreference)) {
        return { preference: document.languagePreference, error: null, writable: true }
      }
    }
  } catch { /* A controlled code crosses the presentation boundary, never exception text. */ }
  return { preference: 'system', error: 'invalidDocument', writable: true }
}

/** Independent app-level key: never writes practice settings, reports, theme pointers or resolved locale. */
export class AppPreferencesRepository {
  constructor(private readonly backend: PreferencesBackend) {}

  async load(): Promise<AppPreferencesLoadResult> {
    try {
      return inspect((await this.backend.get({ key: APP_PREFERENCES_KEY })).value)
    } catch {
      return { preference: 'system', error: 'readFailed', writable: true }
    }
  }

  async save(preference: LanguagePreference): Promise<LocalePreferenceError | null> {
    if (!isLanguagePreference(preference)) return 'writeFailed'
    try {
      // Re-read before writing: future versions must not be downgraded, and other V1 app fields survive.
      const raw = (await this.backend.get({ key: APP_PREFERENCES_KEY })).value
      if (!inspect(raw).writable) return 'futureSchema'
      let retained: Record<string, unknown> = {}
      if (raw !== null) {
        try {
          const value = JSON.parse(raw)
          if (value && !Array.isArray(value) && value.schemaVersion === APP_PREFERENCES_SCHEMA_VERSION) retained = value
        } catch { /* A malformed own-key document may be replaced after an explicit user choice. */ }
      }
      await this.backend.set({ key: APP_PREFERENCES_KEY, value: JSON.stringify({
        ...retained, schemaVersion: APP_PREFERENCES_SCHEMA_VERSION, languagePreference: preference
      }) })
      return null
    } catch {
      return 'writeFailed'
    }
  }
}
