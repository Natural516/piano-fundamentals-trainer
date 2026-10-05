const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
// Fixed, reviewed B5 checkpoint; never silently use the current HEAD as a baseline.
const base = '9a6454a361dc0eba5016963add8b0f96c1046138'
const selectorPath = 'prototype/android-tablet-v1/src/localization/LanguageSetting.tsx'
const resourcesPath = 'prototype/android-tablet-v1/src/localization/resources.ts'
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')
const old = file => execFileSync('git', ['show', base + ':' + file], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n')
const optionsDeclaration = [
  '/** Fixed autonyms: language choices are not translated interface copy. */',
  'export const LANGUAGE_OPTIONS = [',
  "  { id: 'zh-CN', label: '中文' },",
  "  { id: 'en', label: 'English' }",
  '] as const',
  '',
  '/** Legacy system preferences display the resolved language without rewriting storage. */'
].join('\n')
const selectorEdits = [
  ["import { isLanguagePreference } from './locale'\n", ''],
  ['/** A real, small bilingual Settings surface; other product pages remain unchanged in B2. */', optionsDeclaration],
  ["const language = t(locale.resolvedLocale === 'zh-CN' ? 'chinese' : 'english')", "const language = LANGUAGE_OPTIONS[locale.resolvedLocale === 'zh-CN' ? 0 : 1].label"],
  ['value={locale.preference}', 'value={locale.resolvedLocale}'],
  ['if (isLanguagePreference(value))', "if (value === 'zh-CN' || value === 'en')"],
  [`            <option value="system">{t('system')}</option>
            <option value="zh-CN">{t('chinese')}</option>
            <option value="en">{t('english')}</option>`,
   '            {LANGUAGE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}']
]
// Explicit user-approved B7 control change, not a general presentation exemption.
const clickChoiceEdits = [
  [
    "<div className=\"setting-row\">",
    "<div className=\"setting-row settings-language-row\">"
  ],
  [
    "<label className=\"setting-row__copy\" htmlFor=\"app-language-preference\">\n          <strong>{t('language')}</strong><small>{t('languageDescription')}</small>\n        </label>\n        <span className=\"setting-select-wrap\">\n          <select id=\"app-language-preference\" className=\"setting-select\" value={locale.resolvedLocale}\n            disabled={!locale.ready || locale.saving || !locale.writable}\n            onChange={(event) => {\n              const value = event.target.value\n              if (value === 'zh-CN' || value === 'en') void locale.changeLanguagePreference(value)\n            }}>\n            {LANGUAGE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}\n          </select>\n        </span>",
    "<div className=\"setting-row__copy\">\n          <strong id=\"app-language-label\">{t('language')}</strong><small id=\"app-language-description\">{t('languageDescription')}</small>\n        </div>\n        <div id=\"app-language-preference\" className=\"settings-language-options\" role=\"group\"\n          aria-labelledby=\"app-language-label\" aria-describedby=\"app-language-description\">\n          {LANGUAGE_OPTIONS.map((option) => (\n            <button key={option.id} type=\"button\" value={option.id}\n              className={`settings-theme-option settings-language-option${locale.resolvedLocale === option.id ? ' is-active' : ''}`}\n              aria-pressed={locale.resolvedLocale === option.id}\n              disabled={!locale.ready || locale.saving || !locale.writable}\n              onClick={() => { void locale.changeLanguagePreference(option.id) }}>\n              <strong>{option.label}</strong>\n              {locale.resolvedLocale === option.id ? <span className=\"settings-theme-option__check\" aria-hidden=\"true\">✓</span> : null}\n            </button>\n          ))}\n        </div>"
  ]
]
const stylesPath = 'prototype/android-tablet-v1/src/styles.css'
// Exact native-acceptance repair: four History filters must occupy their own grid row.
// Restore only this approved declaration; the rest of the fixed B5 stylesheet stays frozen.
const historyFilterBefore = `.history-dashboard__recent .history-filter {
  position: absolute;
  z-index: 3;
  top: 14px;
  right: 126px;
  grid-template-columns: repeat(3, 65px);
  padding: 3px;
  border-radius: 12px;
}`
const historyFilterAfter = `.history-dashboard__recent .history-filter {
  position: relative;
  z-index: 3;
  min-width: 0;
  width: 100%;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 3px;
  border-radius: 12px;
}`
function restoreHistoryFilterCss(source) {
  assert.equal(source.split(historyFilterAfter).length - 1, 1, 'unique exact accepted History filter repair')
  assert.equal(source.split(historyFilterBefore).length - 1, 0, 'no obsolete overlaid History filter')
  return source.replace(historyFilterAfter, historyFilterBefore)
}
const clickChoiceCss = "/* Language choices reuse theme-card states; only this Settings row is affected. */\n.settings-language-row {\n  grid-template-columns: 44px minmax(0, 1fr) minmax(240px, .9fr);\n}\n.settings-language-options {\n  display: grid;\n  min-width: 0;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 8px;\n}\n.settings-language-option {\n  min-height: 64px;\n  grid-template-columns: minmax(0, 1fr);\n  padding: 12px 32px 12px 16px;\n}\n.settings-language-option strong {\n  font-size: 15px;\n}\n.settings-language-option:focus-visible {\n  outline: 2px solid var(--accent);\n  outline-offset: 3px;\n}\n.settings-language-option:disabled {\n  cursor: default;\n  opacity: .6;\n}\n@media (max-width: 1100px) {\n  .settings-language-row {\n    grid-template-columns: 44px minmax(0, 1fr);\n  }\n  .settings-language-options {\n    grid-column: 2;\n  }\n}\n"
function stripClickChoiceCss(source) {
  source = source.replaceAll('\r\n', '\n')
  if (!source.includes('/* Language choices reuse theme-card states;')) return source
  assert.equal(restoreHistoryFilterCss(source), old(stylesPath) + '\n' + clickChoiceCss, 'only exact language-row and History-filter CSS may change; global/staff geometry stays frozen')
  return old(stylesPath)
}

const resourceEdits = [
  ["      system: '跟随系统',\n      chinese: '简体中文',\n      english: 'English',\n", ''],
  ["      system: 'Follow system',\n      chinese: 'Simplified Chinese',\n      english: 'English',\n", '']
]
function approved(file, edits) {
  let expected = old(file)
  for (const [from, to] of edits) {
    assert.equal(expected.split(from).length - 1, 1, file + ': unique approved old boundary')
    expected = expected.replace(from, to)
  }
  return expected
}
function assertB6PresentationOnly() {
  let expected = approved(selectorPath, selectorEdits)
  for (const [from, to] of clickChoiceEdits) {
    assert.equal(expected.split(from).length - 1, 1, 'unique user-approved click-choice boundary')
    expected = expected.replace(from, to)
  }
  assert.equal(read(selectorPath), expected, 'only exact B6 autonyms plus user-approved B7 click choices may change')
  const exit = require('./android-practice-early-exit-contract.cjs')
  exit.assertEarlyExitDelta()
  assert.equal(exit.normalizeEarlyExitResources(read(resourcesPath)), approved(resourcesPath, resourceEdits), 'only six dead options and the exact bilingual exit namespace may change')
  assert.equal(restoreHistoryFilterCss(read(stylesPath)), old(stylesPath) + '\n' + clickChoiceCss, 'exact language row and History filter repair only; no global or staff geometry changes')
}
function restoreLegacySelector(source) {
  assertB6PresentationOnly()
  assert.equal(source.replaceAll('\r\n', '\n'), read(selectorPath))
  return old(selectorPath)
}
function assertB6ScopeFrozen() {
  assertB6PresentationOnly()
  const exit = require('./android-practice-early-exit-contract.cjs')
  const exitPaths = ['prototype/android-tablet-v1/src/main.tsx', 'prototype/android-tablet-v1/src/sightReadingIntegration.ts', 'prototype/android-tablet-v1/src/localization/localizationService.ts']
  for (const [file, normalize] of [[exitPaths[0], exit.normalizeEarlyExitMain], [exitPaths[1], exit.normalizeEarlyExitRuntime], [exitPaths[2], exit.normalizeEarlyExitService]]) assert.equal(normalize(read(file)), old(file), file + ': exact early-exit delta only')
  const english = require('./android-readme-english-presentation-contract.cjs')
  english.assertReadmeEnglishDelta()
  const englishPaths = ['prototype/android-tablet-v1/src/localization/homePresentation.ts', 'prototype/android-tablet-v1/src/localization/intervalFlowResources.ts']
  for (const file of englishPaths) assert.equal(english.normalize(file, read(file)), old(file), file + ': exact reviewed English presentation delta only')
  const candidate = require('./android-release-candidate-version-contract.cjs')
  assert.equal(candidate.normalizeCandidateVersion(read(candidate.VERSION_PATH)), old(candidate.VERSION_PATH), 'only the exact candidate version delta is allowed')
  execFileSync('git', ['diff', '--exit-code', base, '--', 'android', 'prototype', 'src', 'theme-api', 'theme-packages', 'capacitor.config.ts', 'package-lock.json', ':(exclude)' + candidate.VERSION_PATH,
    ':(exclude)' + selectorPath, ':(exclude)' + resourcesPath, ':(exclude)' + stylesPath, ...exitPaths.map(file => ':(exclude)' + file), ...englishPaths.map(file => ':(exclude)' + file), ...exit.reviewedAdditionPaths.map(file => ':(exclude)' + file)], { cwd: root })
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'android', 'prototype', 'src', 'theme-api', 'theme-packages'], { cwd: root, encoding: 'utf8' }).trim()
  const reviewedAdditions = new Set(exit.reviewedAdditionPaths)
  assert.deepEqual(untracked.split('\n').filter(Boolean).filter(file => !reviewedAdditions.has(file)), [], 'no unreviewed product source/resource additions')
}
module.exports = { base, root, selectorPath, resourcesPath, stylesPath, read, assertB6PresentationOnly, restoreLegacySelector, assertB6ScopeFrozen, stripClickChoiceCss }
