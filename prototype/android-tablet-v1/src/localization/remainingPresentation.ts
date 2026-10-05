import { themeManagementResources } from './themeManagementResources'
import { updaterResources } from './updaterResources'

type Translator = (key: string, options?: Record<string, unknown>) => string

/** Errors are looked up only by stable codes, never by localized messages. */
export function presentThemeError(code: string, t: Translator, fallback = 'failed'): string {
  return Object.prototype.hasOwnProperty.call(themeManagementResources.en.errors, code)
    ? t(`errors.${code}`) : t(fallback)
}

export function formatThemeInstalledAt(value: string, locale: 'zh-CN' | 'en'): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale)
}

export function presentUpdaterError(code: string, t: Translator): string {
  return Object.prototype.hasOwnProperty.call(updaterResources.en.errors, code)
    ? t(`errors.${code}`) : t('states.error.detail')
}
