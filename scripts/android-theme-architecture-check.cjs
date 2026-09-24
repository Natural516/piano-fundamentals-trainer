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
const history = main.slice(main.indexOf('function HistoryScreen'), main.indexOf('function ChordReportDetailScreen'))
const settings = main.slice(main.indexOf('function SettingsScreen'), main.indexOf('function MidiScreen'))
const chordActive = main.slice(main.indexOf('function ChordPracticeScreen'), main.indexOf('function SightReadyScreen'))
const sightActive = main.slice(main.indexOf('function SightFocusScreen'), main.indexOf('function SightResultScreen'))

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
      '--button-primary-bg', '--button-primary-text', '--practice-feedback-success',
      '--practice-feedback-danger', '--practice-feedback-warning'
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
    assert.equal((registry.match(/practiceActiveVisual: standardPracticeActiveVisual/g) ?? []).length, 2)
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
  ['THM07', 'Settings consumes its visual capability and development theme stays build-gated', () => {
    assert.match(settings, /theme\.capabilities\.settingsVisual/)
    assert.match(settings, /settingsVisual\.kind === 'hero-cards'/)
    assert.match(main, /SHOW_DEVELOPMENT_TOOLS[\s\S]*SETTINGS_THEME_OPTIONS[\s\S]*option\.id !== 'bocchi-dev'/)
    assert.doesNotMatch(settings, /theme\.id === 'bocchi-dev'|assets\/themes\/bocchi|导入主题|\.pttheme/)
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
  }],
  ['THM15', 'History dashboard structure is shared while Bocchi visuals stay theme-owned', () => {
    assert.match(history, /theme\.capabilities\.historyVisual/)
    assert.match(history, /historyVisual\.kind === 'dashboard'/)
    assert.doesNotMatch(history, /bocchi-dev|assets\/themes\/bocchi/)
    for (const asset of ['02_27_13.png', '02_32_25.png', '02_30_40.png', '02_34_11.png']) assert.match(registry, new RegExp(asset.replace('.', '\\.')))
    assert.doesNotMatch(registry, /02_47_09\.png/)
    assert.match(css, /:root\[data-theme='bocchi-dev'\] \.bocchi-history-preview/)
    assert.match(history, /已保存练习/)
    assert.match(history, /累计完成题数/)
    assert.match(history, /练习趋势/)
    assert.doesNotMatch(history, /混合正确率|combinedAccuracy/)
  }],
  ['THM16', 'Settings keeps product facts shared while Bocchi artwork stays theme-owned', () => {
    assert.match(settings, /theme\.capabilities\.settingsVisual/)
    assert.match(settings, /presentMidiStatus\(runtime\)/)
    assert.match(settings, /updater\.installed/)
    assert.doesNotMatch(settings, /assets\/themes\/bocchi|theme\.id === 'bocchi-dev'/)
    for (const asset of ['12_01_39.png', '12_38_35.png', '12_46_01.png', '12_47_56.png']) assert.match(registry, new RegExp(asset.replace('.', '\\.')))
    assert.doesNotMatch(registry, /11_44_01\.png/)
    assert.match(css, /:root\[data-theme='bocchi-dev'\] \.bocchi-settings-preview/)
  }],
  ['THM17', 'ACTIVE practice consumes one shared visual capability with isolated Bocchi decoration', () => {
    assert.match(sightActive, /theme\.capabilities\.practiceActiveVisual/)
    assert.match(sightActive, /practiceActiveVisual\.kind === 'decorated-focus'/)
    assert.doesNotMatch(sightActive, /bocchi-dev|assets\/themes\/bocchi/)
    assert.equal((registry.match(/practiceActiveVisual: standardPracticeActiveVisual/g) ?? []).length, 2)
    assert.match(registry, /practiceActiveVisual:\s*\{\s*kind: 'decorated-focus'/)
    assert.match(registry, /cornerCharacter: bocchiSightActiveCharacter/)
    assert.match(registry, /decorations: bocchiSightActiveDecorations/)
    assert.match(main, /decoratedFocus \? \([\s\S]*?focus-active-character/)
    assert.match(css, /\.bocchi-sight-active \.focus-stage \.notation-paper/)
    assert.doesNotMatch(css, /\.bocchi-sight-active \.music-staff-renderer/)
  }],
  ['THM18', 'Chord ACTIVE uses optional capability-owned artwork without theme-name coupling', () => {
    assert.match(chordActive, /theme\.capabilities\.practiceActiveVisual/)
    assert.match(chordActive, /practiceActiveVisual\.kind === 'decorated-focus'/)
    assert.match(chordActive, /practiceActiveVisual\.chordArtwork/)
    assert.doesNotMatch(chordActive, /bocchi-dev|assets\/themes\/bocchi/)
    assert.equal((registry.match(/practiceActiveVisual: standardPracticeActiveVisual/g) ?? []).length, 2)
    for (const asset of ['02_53_43.png', '03_00_49.png', '03_04_22.png']) assert.match(registry, new RegExp(asset.replace('.', '\\.')))
    assert.doesNotMatch(registry, /02_50_28\.png/)
    assert.match(registry, /chordArtwork:\s*\{[\s\S]*frameClassName: 'bocchi-chord-active'/)
    assert.match(chordActive, /chordArtwork \? \([\s\S]*data-chord-theme-asset="character"[\s\S]*data-chord-theme-asset="polaroid"/)
    assert.equal((chordActive.match(/data-chord-theme-asset="decoration"/g) ?? []).length, 3)
    assert.match(chordActive, /presentation\.semantic === 'success'[\s\S]*data-chord-theme-reward="success"/)
    assert.match(css, /:root\[data-theme='bocchi-dev'\] \.bocchi-chord-active \.chord-notation-card/)
    assert.doesNotMatch(css, /\.bocchi-chord-active \.chord-grand-staff/)
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
