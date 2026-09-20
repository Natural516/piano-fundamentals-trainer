const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const main = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/main.tsx'), 'utf8')
const registry = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/theme/themeRegistry.ts'), 'utf8')
const css = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/styles.css'), 'utf8')
const architecture = fs.readFileSync(path.join(root, 'docs/agent/THEME_ARCHITECTURE.md'), 'utf8')

const home = main.slice(main.indexOf('function HomeScreen'), main.indexOf('function PracticeHubScreen'))
const settings = main.slice(main.indexOf('function SettingsScreen'), main.indexOf('function MidiScreen'))

const tests = [
  ['THM01', 'Light Dark and Bocchi are peer registry entries', () => {
    for (const id of ["light: {", "dark: {", "'bocchi-dev': {"]) assert.match(registry, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(registry, /source: 'development'/)
    assert.match(registry, /source: 'built-in'/)
  }],
  ['THM02', 'all registry themes provide the shared semantic token contract', () => {
    for (const token of [
      '--app-bg', '--surface', '--surface-soft', '--surface-elevated',
      '--text-primary', '--text-secondary', '--text-muted', '--accent', '--accent-soft',
      '--border', '--divider', '--shadow', '--nav-bg', '--nav-active-bg', '--nav-active-text',
      '--button-primary-bg', '--button-primary-text'
    ]) {
      assert.ok((registry.match(new RegExp(`'${token}'`, 'g')) ?? []).length >= 4, `${token} missing from type or a theme`)
    }
  }],
  ['THM03', 'Home consumes a visual capability instead of theme names', () => {
    assert.match(home, /theme\.capabilities\.homeVisual/)
    assert.match(home, /homeVisual\.kind === 'single-image-hero'/)
    assert.doesNotMatch(home, /bocchi-dev|assets\/themes\/bocchi/)
  }],
  ['THM04', 'Light and Dark use the standard Home without themed assets', () => {
    assert.equal((registry.match(/capabilities: \{ homeVisual: standardHomeVisual \}/g) ?? []).length, 2)
    assert.match(home, /!composedHome[\s\S]*?<NotationPaper/)
  }],
  ['THM05', 'Bocchi strong Home CSS is scoped to its active theme', () => {
    const selectors = css.split(/\r?\n/).filter((line) => line.trim().startsWith('.') && line.includes('bocchi-home'))
    assert.deepEqual(selectors, [], `unscoped Bocchi selectors:\n${selectors.join('\n')}`)
    assert.match(css, /:root\[data-theme='bocchi-dev'\] \.bocchi-home-preview/)
  }],
  ['THM06', 'approved Home keeps one composed Hero image and no foreground reconstruction', () => {
    assert.equal((home.match(/assets\.hero/g) ?? []).length, 1)
    assert.doesNotMatch(home, /foreground|overlap|bridge|mask|clipPath|clip-path/)
    assert.match(registry, /hero: bocchiHomeHero/)
  }],
  ['THM07', 'normal Settings still exposes only Light and Dark', () => {
    assert.match(settings, /onThemeChange\('light'\)/)
    assert.match(settings, /onThemeChange\('dark'\)/)
    assert.doesNotMatch(settings, /bocchi-dev|导入主题|\.pttheme/)
  }],
  ['THM08', 'development activation is explicit and release defaults to Light', () => {
    assert.match(registry, /new URLSearchParams\(search\)\.get\('theme'\)/)
    assert.match(registry, /if \(allowDevelopmentTheme\)[\s\S]*return 'bocchi-dev'[\s\S]*return 'light'/)
  }],
  ['THM09', 'external source is reserved without implementing an importer', () => {
    assert.match(registry, /ThemeSource = 'built-in' \| 'development' \| 'external'/)
    assert.doesNotMatch(main + registry, /FileReader|JSZip|\.pttheme|showOpenFilePicker/)
  }],
  ['THM10', 'architecture document freezes product and theme boundaries', () => {
    for (const phrase of ['Product layer', 'Peer themes', 'Single visual source', 'Future external-theme compatibility', 'Themes cannot alter business logic']) {
      assert.match(architecture, new RegExp(phrase))
    }
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

process.stdout.write(`\n${passed}/${tests.length} Android Theme Architecture checks PASS\n`)
if (passed !== tests.length) process.exitCode = 1
