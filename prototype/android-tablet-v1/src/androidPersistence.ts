import { Preferences } from '@capacitor/preferences'
import type { PreferencesBackend } from './androidPersistenceCore'

/** Android resolves this Capacitor plugin to native SharedPreferences storage. */
export const CapacitorPreferencesBackend: PreferencesBackend = {
  get: (options) => Preferences.get(options),
  set: (options) => Preferences.set(options),
  keys: () => Preferences.keys()
}
