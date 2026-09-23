const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const main = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/main.tsx'), 'utf8')
const registry = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/theme/themeRegistry.ts'), 'utf8')
const css = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/styles.css'), 'utf8')
const architecture = fs.readFileSync(path.join(root, 'docs/agent/THEME_ARCHITECTURE.md'), 'utf8')

const home = main.slice(main.indexOf('function HomeScreen'), main.indexOf('function PracticeHubScreen'))
const practice = main.slice(main.indexOf('function PracticeHubScreen'), main.indexOf('function ChordModeSelectScreen'))
const tools = main.slice(main.indexOf('const THEORY_TOOLS'), main.indexOf('function ScaleNoteToken'))
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
    assert.equal((registry.match(/capabilities: \{ homeVisual: standardHomeVisual, practiceVisual: standardPracticeVisual, toolsVisual: standardToolsVisual \}/g) ?? []).length, 2)
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
  }],
  ['THM11', 'Practice consumes a visual capability without theme-name coupling', () => {
    assert.match(practice, /theme\.capabilities\.practiceVisual/)
    assert.match(practice, /practiceVisual\.kind === 'hero-cards'/)
    assert.doesNotMatch(practice, /bocchi-dev|assets\/themes\/bocchi/)
    assert.match(practice, /navigate\('sight-ready'\)/)
    assert.match(practice, /navigate\('chord-mode-select'\)/)
  }],
  ['THM12', 'Bocchi Practice uses A B and C while D remains reference-only', () => {
    for (const asset of ['20_53_32.png', '20_56_06.png', '20_57_50.png']) assert.match(registry, new RegExp(asset.replace('.', '\\.')))
    assert.doesNotMatch(registry, /21_03_05\.png/)
    assert.match(css, /:root\[data-theme='bocchi-dev'\] \.bocchi-practice-preview/)
    assert.equal((practice.match(/className=\{`module-card/g) ?? []).length, 2)
    assert.doesNotMatch(practice, /自由练习|节拍器/)
  }],
  ['THM13', 'Tools consumes a visual capability without theme-name coupling', () => {
    assert.match(tools, /theme\.capabilities\.toolsVisual/)
    assert.match(tools, /toolsVisual\.kind === 'hero-cards'/)
    assert.doesNotMatch(tools, /bocchi-dev|assets\/themes\/bocchi/)
    for (const route of ['chord-query-tool', 'interval-query-tool', 'scale-key-signature-tool']) assert.match(tools, new RegExp(route))
  }],
  ['THM14', 'Bocchi Tools uses one hero and three decorations while reference D stays inert', () => {
    for (const asset of ['00_05_48.png', '00_25_10.png', '00_27_04.png', '00_30_34.png']) assert.match(registry, new RegExp(asset.replace('.', '\\.')))
    assert.doesNotMatch(registry, /00_38_00\.png/)
    assert.match(css, /:root\[data-theme='bocchi-dev'\] \.bocchi-tools-preview/)
    assert.equal((tools.match(/screen: '/g) ?? []).length, 3)
    assert.doesNotMatch(tools, /搜索工具|最近使用|基础乐理|节拍器/)
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
