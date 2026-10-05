import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { applyDocumentLocale, LocalizationService } from './localizationService'

const LocaleContext = createContext<LocalizationService | null>(null)

export function LocaleProvider({ service, children }: { service: LocalizationService; children: ReactNode }): JSX.Element {
  const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot)
  useEffect(() => { void service.initialize() }, [service])
  useEffect(() => { applyDocumentLocale(document, snapshot.resolvedLocale, service.i18n) }, [service, snapshot.resolvedLocale])
  useEffect(() => {
    const refresh = (): void => service.refreshSystemLocale()
    const visible = (): void => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('languagechange', refresh)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', visible)
    let disposed = false
    let removeNative: (() => void) | undefined
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => { if (isActive) refresh() })
        .then((handle) => {
          if (disposed) void handle.remove()
          else removeNative = () => { void handle.remove() }
        }).catch(() => { /* Browser events still provide safe refresh; no user-facing raw error. */ })
    }
    return () => {
      disposed = true
      window.removeEventListener('languagechange', refresh)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', visible)
      removeNative?.()
    }
  }, [service])
  return <LocaleContext.Provider value={service}><I18nextProvider i18n={service.i18n}>{children}</I18nextProvider></LocaleContext.Provider>
}

export function useAppLocale() {
  const service = useContext(LocaleContext)
  if (!service) throw new Error('LOCALE_PROVIDER_REQUIRED')
  const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot)
  return { ...snapshot, changeLanguagePreference: service.changeLanguagePreference, refreshSystemLocale: service.refreshSystemLocale }
}
