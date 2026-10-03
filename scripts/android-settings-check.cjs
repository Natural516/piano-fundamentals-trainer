const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const main = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/main.tsx'), 'utf8')
const registry = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/theme/themeRegistry.ts'), 'utf8')
const css = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/styles.css'), 'utf8')
const version = fs.readFileSync(path.join(root, 'android/version.properties'), 'utf8')
const externalTheme = fs.readFileSync(path.join(root, 'theme-packages/bocchi/theme.json'), 'utf8')
const externalLinks = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/externalLinks.ts'), 'utf8')
const externalUrlPlugin = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/pianofundamentals/trainer/ExternalUrlPlugin.kt'), 'utf8')

const settings = main.slice(main.indexOf('const SETTINGS_THEME_OPTIONS'), main.indexOf('function MidiScreen'))

const tests = [
  ['SET01', 'Settings keeps only the real Device Appearance and About groups', () => {
    const groups = [...settings.matchAll(/<div className="group-title"><span>([^<]+)<\/span>/g)].map((match) => match[1])
    assert.deepEqual(groups, ["{t('device')}", "{t('appearance')}", "{t('about')}"])
    assert.doesNotMatch(settings, /练习提醒|每题时间|答题计时|音效与反馈|默认谱表|音符数量/)
  }],
  ['SET02', 'MIDI card presents live runtime state and preserves the MIDI route', () => {
    assert.match(settings, /presentLocalizedMidiStatus\(runtime, midiT\)/)
    assert.match(settings, /runtime\.bluetoothSnapshot\.connectedDeviceName/)
    assert.match(settings, /openAuxiliary\('midi'\)/)
    assert.match(settings, /midiStatus\.detail/)
    assert.match(settings, /midiStatus\.label/)
  }],
  ['SET03', 'About reads installed package metadata without fixed release copy', () => {
    assert.match(settings, /updater\.installed \? `V\$\{updater\.installed\.versionName\}` : `V\$\{__ANDROID_VERSION_NAME__\}`/)
    assert.match(settings, /t\('versionCode', \{ code: updater\.installed\.versionCode \}\)/)
    assert.match(settings, /t\('versionCode', \{ code: __ANDROID_VERSION_CODE__ \}\)/)
    assert.doesNotMatch(settings, /V1\.5\.2|versionCode 12/)
  }],
  ['SET04', 'QA updater remains fail closed while production retains the real route', () => {
    assert.match(settings, /__QA_BUILD__ \? \(/)
    assert.match(settings, /description=\{t\('qaUpdateDescription'\)\}/)
    assert.match(fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/localization/shellResources.ts'), 'utf8'), /qaUpdateDescription: '与正式版独立安装；正式更新通道已关闭'/)
    assert.match(settings, /openAuxiliary\('update'\)/)
  }],
  ['SET04B', 'Open Source uses one app-owned canonical HTTPS URL and Android external ACTION_VIEW', () => {
    assert.match(settings, /onClick=\{\(\) => \{ void openSourceRepository\(\) \}\}/)
    assert.match(externalLinks, /APP_SOURCE_REPOSITORY_URL = 'https:\/\/github\.com\/Natural516\/piano-fundamentals-trainer'/)
    assert.match(externalLinks, /NativeExternalUrl\.openSourceRepository\(\)/)
    assert.match(externalUrlPlugin, /Intent\(Intent\.ACTION_VIEW, Uri\.parse\(SOURCE_REPOSITORY_URL\)\)/)
    assert.match(externalUrlPlugin, /Intent\.CATEGORY_BROWSABLE/)
    assert.doesNotMatch(externalLinks, /javascript:|file:|content:/)
  }],
  ['SET05', 'Theme selector binds built-in ids and renders installed external themes separately', () => {
    for (const id of ["id: 'light'", "id: 'dark'"]) assert.match(settings, new RegExp(id))
    assert.doesNotMatch(settings.slice(0, settings.indexOf('function SettingsThemeOption')), /bocchi-dev/)
    assert.match(settings, /active=\{theme\.id === option\.id\}/)
    assert.match(settings, /onSelect=\{\(\) => \{ void themeManager\.selectThemeId\(String\(option\.id\)\) \}\}/)
    assert.match(settings, /themeRuntime\.installed\.map/)
  }],
  ['SET06', 'Settings consumes a theme capability rather than importing themed assets', () => {
    assert.match(settings, /theme\.capabilities\.settingsVisual/)
    assert.match(settings, /settingsVisual\.kind === 'hero-cards'/)
    assert.doesNotMatch(settings, /assets\/themes\/bocchi/)
    assert.doesNotMatch(settings, /theme\.id === 'bocchi-dev'/)
  }],
  ['SET07', 'External Bocchi package owns one Settings Hero and three decorations', () => {
    for (const asset of ['assets/settings/hero.png', 'assets/settings/midi.png', 'assets/settings/theme.png', 'assets/settings/about.png']) {
      assert.match(externalTheme, new RegExp(asset.replaceAll('/', '\\/').replace('.', '\\.')))
    }
    assert.doesNotMatch(registry, /assets\/settings|createBocchiExternalDefinition|bocchiTokens/)
  }],
  ['SET08', 'Hero remains one single source without foreground reconstruction', () => {
    assert.equal((settings.match(/assets\.hero/g) ?? []).length, 1)
    assert.doesNotMatch(settings, /foreground|overlap|mask|clipPath|clip-path/)
  }],
  ['SET09', 'decorations are presentation-only and real values remain HTML', () => {
    assert.match(settings, /aria-hidden="true" className="settings-card__decoration"/)
    assert.match(settings, /title=\{t\('currentVersion'\)\}/)
    assert.match(settings, /<strong>\{t\('theme'\)\}<\/strong>/)
    assert.match(settings, /connected-label/)
  }],
  ['SET10', 'Bocchi Settings CSS is scoped to the active visual recipe', () => {
    assert.match(css, /:root\[data-theme-recipe-settings='settings-hero-cards-v1'\] \.bocchi-settings-preview/)
    assert.doesNotMatch(css, /:root\[data-theme='bocchi-dev'\] \.bocchi-settings-preview/)
    const unscoped = css.split(/\r?\n/).filter((line) => line.trim().startsWith('.bocchi-settings'))
    assert.deepEqual(unscoped, [], `unscoped selectors:\n${unscoped.join('\n')}`)
  }],
  ['SET11', 'Light and Dark use the standard Settings visual', () => {
    assert.equal((registry.match(/settingsVisual: standardSettingsVisual/g) ?? []).length, 2)
  }],
  ['SET12', 'Android release identity remains frozen', () => {
    assert.match(version, /^versionCode=14$/m)
    assert.match(version, /^versionName=1\.6\.0$/m)
  }],
  ['SET13', 'Language is an app-level appearance preference with a real bilingual Settings surface', () => {
    assert.match(settings, /useTranslation\('settings'\)/)
    assert.match(settings, /title=\{t\('title'\)\}/)
    assert.match(settings, /<LanguageSetting \/>/)
    const language = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/localization/LanguageSetting.tsx'), 'utf8')
    for (const value of ['system', 'zh-CN', 'en']) assert.ok(language.includes(`value="${value}"`))
    assert.match(language, /changeLanguagePreference\(value\)/)
    assert.match(language, /role="alert"/)
    assert.doesNotMatch(language, /String\(error\)|dangerouslySetInnerHTML|window\.location/)
  }]
]

let passed = 0
for (const [id, title, check] of tests) {
  try {
    check()
    passed += 1
    process.stdout.write(`PASS ${id} ${title}\n`)
  } catch (error) {
    process.stderr.write(`FAIL ${id} ${title}\n${error.stack || error}\n`)
  }
}

process.stdout.write(`\n${passed}/${tests.length} Android Settings checks PASS\n`)
if (passed !== tests.length) process.exitCode = 1
