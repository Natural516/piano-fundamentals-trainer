import { DEFAULT_THEME_MODE, isThemeMode, resolveTheme, type ResolvedTheme, type ThemeMode } from './themeTypes'

export const THEME_STORAGE_KEY = 'piano-trainer.theme-mode.v1'
export const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)'

export function readThemeMode(storage: Pick<Storage, 'getItem'> = window.localStorage): ThemeMode {
  try {
    const storedMode = storage.getItem(THEME_STORAGE_KEY)
    return isThemeMode(storedMode) ? storedMode : DEFAULT_THEME_MODE
  } catch {
    return DEFAULT_THEME_MODE
  }
}

export function writeThemeMode(
  mode: ThemeMode,
  storage: Pick<Storage, 'setItem'> = window.localStorage
): boolean {
  try {
    storage.setItem(THEME_STORAGE_KEY, mode)
    return true
  } catch {
    return false
  }
}

export function getSystemPrefersDark(matchMedia: typeof window.matchMedia = window.matchMedia): boolean {
  return matchMedia(SYSTEM_THEME_QUERY).matches
}

export function applyResolvedTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme
}

export function initializeTheme(): { mode: ThemeMode; resolvedTheme: ResolvedTheme } {
  const mode = readThemeMode()
  const resolvedTheme = resolveTheme(mode, getSystemPrefersDark())
  applyResolvedTheme(resolvedTheme)

  return { mode, resolvedTheme }
}
