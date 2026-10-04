import { useTranslation } from 'react-i18next'
import { useAppLocale } from './LocaleProvider'

/** Fixed autonyms: language choices are not translated interface copy. */
export const LANGUAGE_OPTIONS = [
  { id: 'zh-CN', label: '中文' },
  { id: 'en', label: 'English' }
] as const

/** Legacy system preferences display the resolved language without rewriting storage. */
export function LanguageSetting(): JSX.Element {
  const { t } = useTranslation('settings')
  const locale = useAppLocale()
  const language = LANGUAGE_OPTIONS[locale.resolvedLocale === 'zh-CN' ? 0 : 1].label
  return (
    <div className="settings-language">
      <div className="setting-row">
        <span className="setting-row__icon" aria-hidden="true">Aa</span>
        <label className="setting-row__copy" htmlFor="app-language-preference">
          <strong>{t('language')}</strong><small>{t('languageDescription')}</small>
        </label>
        <span className="setting-select-wrap">
          <select id="app-language-preference" className="setting-select" value={locale.resolvedLocale}
            disabled={!locale.ready || locale.saving || !locale.writable}
            onChange={(event) => {
              const value = event.target.value
              if (value === 'zh-CN' || value === 'en') void locale.changeLanguagePreference(value)
            }}>
            {LANGUAGE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </span>
      </div>
      <p className="settings-language__status" role="status">
        {!locale.ready ? t('loading') : locale.saving ? t('saving') : t('currentLanguage', { language })}
      </p>
      {locale.error ? <p className="settings-language__error" role="alert">{t(`errors.${locale.error}`)}</p> : null}
    </div>
  )
}
