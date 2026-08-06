import { useCallback, useEffect, useState } from 'react'
import {
  DISPLAY_PREFERENCES_CHANGED_EVENT,
  DISPLAY_PREFERENCES_STORAGE_KEYS,
  readDisplayPreferences,
  writeDisplayPreferences,
  type DisplayPreferences,
  type DisplayPreferenceScope
} from '../utils/displayPreferences'

export interface UseDisplayPreferencesResult extends DisplayPreferences {
  setShowVirtualKeyboard: (visible: boolean) => void
}

export function useDisplayPreferences(scope: DisplayPreferenceScope): UseDisplayPreferencesResult {
  const [preferences, setPreferences] = useState<DisplayPreferences>(() => readDisplayPreferences(scope))

  useEffect(() => {
    const refresh = (): void => setPreferences(readDisplayPreferences(scope))
    const handlePreferenceChange = (event: Event): void => {
      const detail = (event as CustomEvent<{ scope?: DisplayPreferenceScope }>).detail
      if (detail?.scope === scope) refresh()
    }
    const handleStorage = (event: StorageEvent): void => {
      if (event.key === DISPLAY_PREFERENCES_STORAGE_KEYS[scope]) refresh()
    }

    window.addEventListener(DISPLAY_PREFERENCES_CHANGED_EVENT, handlePreferenceChange)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener(DISPLAY_PREFERENCES_CHANGED_EVENT, handlePreferenceChange)
      window.removeEventListener('storage', handleStorage)
    }
  }, [scope])

  const setShowVirtualKeyboard = useCallback((visible: boolean) => {
    const next = { ...readDisplayPreferences(scope), showVirtualKeyboard: visible }
    if (writeDisplayPreferences(scope, next)) setPreferences(next)
  }, [scope])

  return { ...preferences, setShowVirtualKeyboard }
}
