import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  applyResolvedTheme,
  getSystemPrefersDark,
  readThemeMode,
  SYSTEM_THEME_QUERY,
  writeThemeMode
} from '../utils/themeStorage'
import { resolveTheme, type ResolvedTheme, type ThemeMode } from '../utils/themeTypes'

export interface UseThemeResult {
  mode: ThemeMode
  resolvedTheme: ResolvedTheme
  setMode: (mode: ThemeMode) => void
}

export function useTheme(): UseThemeResult {
  const [mode, setModeState] = useState<ThemeMode>(() => readThemeMode())
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => getSystemPrefersDark())
  const resolvedTheme = useMemo(() => resolveTheme(mode, systemPrefersDark), [mode, systemPrefersDark])

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode)
    writeThemeMode(nextMode)
  }, [])

  useEffect(() => {
    applyResolvedTheme(resolvedTheme)
  }, [resolvedTheme])

  useEffect(() => {
    if (mode !== 'system') {
      return
    }

    const mediaQuery = window.matchMedia(SYSTEM_THEME_QUERY)
    const handleChange = (event: MediaQueryListEvent): void => {
      setSystemPrefersDark(event.matches)
    }

    setSystemPrefersDark(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [mode])

  return { mode, resolvedTheme, setMode }
}
