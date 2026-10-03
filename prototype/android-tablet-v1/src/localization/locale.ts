export type LanguagePreference = 'system' | 'zh-CN' | 'en'
export type ResolvedLocale = 'zh-CN' | 'en'

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'system' || value === 'zh-CN' || value === 'en'
}

/** Only the primary system language decides the UI language. No router/content detection. */
export function resolveSystemLocale(priority: unknown): ResolvedLocale {
  const primary = Array.isArray(priority) ? priority[0] : priority
  if (typeof primary !== 'string' || !primary.trim()) return 'en'
  try {
    const [canonical] = Intl.getCanonicalLocales(primary.trim())
    return canonical.toLowerCase().split('-')[0] === 'zh' ? 'zh-CN' : 'en'
  } catch {
    return 'en'
  }
}

export function resolveLocale(preference: LanguagePreference, systemLanguages: unknown): ResolvedLocale {
  return preference === 'system' ? resolveSystemLocale(systemLanguages) : preference
}
