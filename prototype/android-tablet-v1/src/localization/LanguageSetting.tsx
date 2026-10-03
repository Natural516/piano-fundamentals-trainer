import { useTranslation } from 'react-i18next'
import { useAppLocale } from './LocaleProvider'
import { isLanguagePreference } from './locale'

/** A real, small bilingual Settings surface; other product pages remain unchanged in B2. */
export function LanguageSetting(): JSX.Element {
  const { t } = useTranslation('settings')
  const locale = useAppLocale()
  const language = t(locale.resolvedLocale === 'zh-CN' ? 'chinese' : 'english')
  return (
    <div className="settings-language">
      <div className="setting-row">
        <span className="setting-row__icon" aria-hidden="true">Aa</span>
        <label className="setting-row__copy" htmlFor="app-language-preference">
          <strong>{t('language')}</strong><small>{t('languageDescription')}</small>
        </label>
        <span className="setting-select-wrap">
          <select id="app-language-preference" className="setting-select" value={locale.preference}
            disabled={!locale.ready || locale.saving || !locale.writable}
            onChange={(event) => {
              const value = event.target.value
              if (isLanguagePreference(value)) void locale.changeLanguagePreference(value)
            }}>
            <option value="system">{t('system')}</option>
            <option value="zh-CN">{t('chinese')}</option>
            <option value="en">{t('english')}</option>
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
