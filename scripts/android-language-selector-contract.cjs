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
  assert.equal(read(selectorPath), approved(selectorPath, selectorEdits), 'only exact B6 autonyms/options/resolved selection may change')
  assert.equal(read(resourcesPath), approved(resourcesPath, resourceEdits), 'only six dead translated option resources may be removed')
}
function restoreLegacySelector(source) {
  assertB6PresentationOnly()
  assert.equal(source.replaceAll('\r\n', '\n'), read(selectorPath))
  return old(selectorPath)
}
function assertB6ScopeFrozen() {
  assertB6PresentationOnly()
  execFileSync('git', ['diff', '--exit-code', base, '--', 'android', 'prototype', 'src', 'theme-api', 'theme-packages', 'capacitor.config.ts', 'package-lock.json',
    ':(exclude)' + selectorPath, ':(exclude)' + resourcesPath], { cwd: root })
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'android', 'prototype', 'src', 'theme-api', 'theme-packages'], { cwd: root, encoding: 'utf8' }).trim()
  assert.equal(untracked, '', 'no unreviewed product source/resource additions')
}
module.exports = { base, root, selectorPath, resourcesPath, read, assertB6PresentationOnly, restoreLegacySelector, assertB6ScopeFrozen }
