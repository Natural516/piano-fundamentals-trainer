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
      <div className="setting-row settings-language-row">
        <span className="setting-row__icon" aria-hidden="true">Aa</span>
        <div className="setting-row__copy">
          <strong id="app-language-label">{t('language')}</strong><small id="app-language-description">{t('languageDescription')}</small>
        </div>
        <div id="app-language-preference" className="settings-language-options" role="group"
          aria-labelledby="app-language-label" aria-describedby="app-language-description">
          {LANGUAGE_OPTIONS.map((option) => (
            <button key={option.id} type="button" value={option.id}
              className={`settings-theme-option settings-language-option${locale.resolvedLocale === option.id ? ' is-active' : ''}`}
              aria-pressed={locale.resolvedLocale === option.id}
              disabled={!locale.ready || locale.saving || !locale.writable}
              onClick={() => { void locale.changeLanguagePreference(option.id) }}>
              <strong>{option.label}</strong>
              {locale.resolvedLocale === option.id ? <span className="settings-theme-option__check" aria-hidden="true">✓</span> : null}
            </button>
          ))}
        </div>
      </div>
      <p className="settings-language__status" role="status">
        {!locale.ready ? t('loading') : locale.saving ? t('saving') : t('currentLanguage', { language })}
      </p>
      {locale.error ? <p className="settings-language__error" role="alert">{t(`errors.${locale.error}`)}</p> : null}
    </div>
  )
}
