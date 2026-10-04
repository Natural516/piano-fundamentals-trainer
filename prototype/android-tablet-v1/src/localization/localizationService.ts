import { createInstance, type i18n } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { AppPreferencesRepository, type LocalePreferenceError } from './appPreferences'
import { resolveLocale, type LanguagePreference, type ResolvedLocale } from './locale'
import { localizationResources } from './resources'

export interface LocaleSnapshot {
  preference: LanguagePreference
  resolvedLocale: ResolvedLocale
  ready: boolean
  saving: boolean
  writable: boolean
  error: LocalePreferenceError | null
}

export function createLocalizationInstance(locale: ResolvedLocale): i18n {
  const instance = createInstance()
  void instance.use(initReactI18next).init({
    lng: locale, supportedLngs: ['zh-CN', 'en'], fallbackLng: 'zh-CN',
    resources: localizationResources, ns: ['common', 'settings', 'music', 'navigation', 'midi', 'home', 'practice', 'tools', 'theoryQuery', 'intervalPractice', 'sightReading'], defaultNS: 'common',
    load: 'currentOnly', initAsync: false,
    interpolation: { escapeValue: false }, // React renders text nodes; no HTML insertion.
    react: { useSuspense: false },
    parseMissingKeyHandler: () => '—'
  })
  return instance
}

export function applyDocumentLocale(document: Pick<Document, 'documentElement' | 'title'>, locale: ResolvedLocale, instance: i18n): void {
  document.documentElement.lang = locale
  document.title = instance.t('appTitle', { ns: 'common', lng: locale })
}

/** Presentation-only service. It has no access to MIDI, sessions, theme, reports or updater. */
export class LocalizationService {
  readonly i18n: i18n
  private snapshot: LocaleSnapshot
  private readonly listeners = new Set<() => void>()
  private initialization: Promise<void> | null = null
  private writes: Promise<void> = Promise.resolve()

  constructor(private readonly repository: AppPreferencesRepository, private readonly readSystemLanguages: () => unknown) {
    const resolvedLocale = resolveLocale('system', this.systemLanguages())
    this.snapshot = { preference: 'system', resolvedLocale, ready: false, saving: false, writable: true, error: null }
    this.i18n = createLocalizationInstance(resolvedLocale)
  }

  private systemLanguages(): unknown {
    try { return this.readSystemLanguages() } catch { return undefined }
  }

  getSnapshot = (): LocaleSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private publish(next: LocaleSnapshot): void {
    if (this.i18n.language !== next.resolvedLocale) void this.i18n.changeLanguage(next.resolvedLocale)
    this.snapshot = Object.freeze(next)
    for (const listener of this.listeners) listener()
  }

  initialize = (): Promise<void> => {
    this.initialization ??= this.repository.load().then((loaded) => {
      this.publish({ ...this.snapshot, ...loaded, ready: true,
        resolvedLocale: resolveLocale(loaded.preference, this.systemLanguages()) })
    })
    return this.initialization
  }

  changeLanguagePreference = (preference: LanguagePreference): Promise<void> => {
    const operation = this.writes.then(async () => {
      await this.initialize()
      if (!this.snapshot.writable) return
      const previous = this.snapshot.preference
      this.publish({ ...this.snapshot, preference, resolvedLocale: resolveLocale(preference, this.systemLanguages()), saving: true, error: null })
      const error = await this.repository.save(preference)
      const retained = error ? previous : preference
      this.publish({ ...this.snapshot, preference: retained, resolvedLocale: resolveLocale(retained, this.systemLanguages()),
        saving: false, error, writable: error === 'futureSchema' ? false : this.snapshot.writable })
    })
    this.writes = operation
    return operation
  }

  refreshSystemLocale = (): void => {
    if (this.snapshot.preference !== 'system') return
    const resolvedLocale = resolveLocale('system', this.systemLanguages())
    if (resolvedLocale !== this.snapshot.resolvedLocale) this.publish({ ...this.snapshot, resolvedLocale })
  }
}
