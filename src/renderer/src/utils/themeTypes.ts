export type ThemeMode = 'dark' | 'light' | 'system'
export type ResolvedTheme = Exclude<ThemeMode, 'system'>

export const DEFAULT_THEME_MODE: ThemeMode = 'dark'

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light' || value === 'system'
}

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === 'system') {
    return systemPrefersDark ? 'dark' : 'light'
  }

  return mode
}
