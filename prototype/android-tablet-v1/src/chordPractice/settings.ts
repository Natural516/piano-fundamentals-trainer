import type { PreferencesBackend } from '../androidPersistenceCore'
import { isChordSequentialMajorKeyId, type ChordSequentialMajorKeyId } from '../musicTheory/chords'

export const CHORD_SETTINGS_STORAGE_KEY = 'piano.v1.chord.settings' as const
export const CHORD_SETTINGS_SCHEMA_VERSION = 1 as const

export interface ChordSettings {
  readonly schemaVersion: typeof CHORD_SETTINGS_SCHEMA_VERSION
  readonly sequentialKey: ChordSequentialMajorKeyId
  readonly showChordTones: boolean
}

export const DEFAULT_CHORD_SETTINGS: ChordSettings = Object.freeze({
  schemaVersion: CHORD_SETTINGS_SCHEMA_VERSION,
  sequentialKey: 'C',
  showChordTones: true
})

export function parseChordSettings(raw: string | null): ChordSettings {
  if (raw === null) return DEFAULT_CHORD_SETTINGS
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return DEFAULT_CHORD_SETTINGS
    const candidate = value as Record<string, unknown>
    if (candidate.schemaVersion !== CHORD_SETTINGS_SCHEMA_VERSION
      || !isChordSequentialMajorKeyId(candidate.sequentialKey)
      || typeof candidate.showChordTones !== 'boolean') return DEFAULT_CHORD_SETTINGS
    return Object.freeze({
      schemaVersion: CHORD_SETTINGS_SCHEMA_VERSION,
      sequentialKey: candidate.sequentialKey,
      showChordTones: candidate.showChordTones
    })
  } catch {
    return DEFAULT_CHORD_SETTINGS
  }
}

export class ChordSettingsRepository {
  constructor(private readonly backend: PreferencesBackend) {}

  async load(): Promise<ChordSettings> {
    return parseChordSettings((await this.backend.get({ key: CHORD_SETTINGS_STORAGE_KEY })).value)
  }

  async save(settings: ChordSettings): Promise<void> {
    await this.backend.set({ key: CHORD_SETTINGS_STORAGE_KEY, value: JSON.stringify(settings) })
  }
}
