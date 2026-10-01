const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { publicPathAudit } = require('./android-release-preflight.cjs')
const { validateContracts } = require('./theme-package-core.cjs')

const root = path.resolve(__dirname, '..')
const main = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/main.tsx'), 'utf8')
const registry = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/theme/themeRegistry.ts'), 'utf8')
const themeTypes = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/theme/themeTypes.ts'), 'utf8')
const recipes = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/theme/visualRecipeRegistry.ts'), 'utf8')
const adapter = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/theme/runtimeThemeAdapter.ts'), 'utf8')
const packageRuntime = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/theme/themePackageRuntime.ts'), 'utf8')
const css = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/styles.css'), 'utf8')
const architecturePath = path.join(root, 'docs/agent/THEME_ARCHITECTURE.md')
const externalTheme = fs.readFileSync(path.join(root, 'theme-packages/bocchi/theme.json'), 'utf8')

const home = main.slice(main.indexOf('function HomeScreen'), main.indexOf('function PracticeHubScreen'))
const practice = main.slice(main.indexOf('function PracticeHubScreen'), main.indexOf('type IntervalPracticeSettingChanges'))
const tools = main.slice(main.indexOf('const THEORY_TOOLS'), main.indexOf('function ScaleNoteToken'))
const history = main.slice(main.indexOf('function HistoryScreen'), main.indexOf('function ChordReportDetailScreen'))
const settings = main.slice(main.indexOf('function SettingsScreen'), main.indexOf('function MidiScreen'))
const chordActive = main.slice(main.indexOf('function ChordPracticeScreen'), main.indexOf('function SightReadyScreen'))
const sightActive = main.slice(main.indexOf('function SightFocusScreen'), main.indexOf('function SightResultScreen'))
const chordQuery = main.slice(main.indexOf('function ToolDetailShell'), main.indexOf('function ScaleKeySignatureToolScreen'))
const scaleKeySignature = main.slice(main.indexOf('function ScaleKeySignatureToolScreen'), main.indexOf('function IntervalPitchToken'))
const intervalQuery = main.slice(main.indexOf('function IntervalQueryToolScreen'), main.indexOf('function ChordGroupBadge'))

const tests = [
  ['THM01', 'built-in registry contains only Light and Dark while external themes use the runtime manager', () => {
    for (const id of ["light: {", "dark: {"]) assert.match(registry, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(registry, /BuiltInThemeRegistry/)
    assert.match(registry, /UnifiedRuntimeThemeRegistry/)
    assert.doesNotMatch(registry, /simulatedExternalBocchiTheme|createBocchiExternalDefinition|bocchiTokens/)
    assert.match(themeTypes, /ThemeSource = 'built-in' \| 'development' \| 'external'/)
  }],
  ['THM02', 'all registry themes provide the shared semantic token contract', () => {
    for (const token of [
      '--app-bg', '--surface', '--surface-soft', '--surface-elevated',
      '--text-primary', '--text-secondary', '--text-muted', '--accent', '--accent-soft',
      '--border', '--divider', '--shadow', '--nav-bg', '--nav-active-bg', '--nav-active-text',
      '--button-primary-bg', '--button-primary-text', '--practice-feedback-success',
      '--practice-feedback-danger', '--practice-feedback-warning'
    ]) {
      assert.ok(((registry + themeTypes + externalTheme).match(new RegExp(`['"]${token}['"]`, 'g')) ?? []).length >= 4, `${token} missing from type or a theme`)
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
    assert.match(css, /:root\[data-theme-recipe-home='home-scrapbook-single-hero-v1'\] \.bocchi-home-preview/)
    assert.doesNotMatch(css, /data-theme='bocchi-dev'/)
  }],
  ['THM06', 'approved Home keeps one composed Hero image and no foreground reconstruction', () => {
    assert.equal((home.match(/assets\.hero/g) ?? []).length, 1)
    assert.doesNotMatch(home, /foreground|overlap|bridge|mask|clipPath|clip-path/)
    assert.match(externalTheme, /"hero": "assets\/home\/hero\.png"/)
  }],
  ['THM07', 'Settings consumes its visual capability and delegates external packages to the runtime manager', () => {
    assert.match(settings, /theme\.capabilities\.settingsVisual/)
    assert.match(settings, /settingsVisual\.kind === 'hero-cards'/)
    assert.match(settings, /const visibleThemeOptions = SETTINGS_THEME_OPTIONS/)
    assert.match(settings, /themeManager\.selectThemeId\(String\(option\.id\)\)/)
    assert.match(settings, /themeRuntime\.installed/)
    assert.match(settings, /导入主题包/)
    assert.doesNotMatch(settings, /theme\.id === 'bocchi-dev'|assets\/themes\/bocchi|FileReader|JSZip|showOpenFilePicker/)
  }],
  ['THM08', 'development activation is explicit and release defaults to Light', () => {
    assert.match(registry, /new URLSearchParams\(search\)\.get\('theme'\)/)
    assert.match(registry, /allowDevelopmentTheme && \(requested === 'natural516\.bocchi' \|\| requested === 'bocchi-dev'\)[\s\S]*return 'light'/)
  }],
  ['THM09', 'external runtime uses the native Android package boundary and runtime adapter', () => {
    assert.match(themeTypes, /ExternalThemeDefinitionV1/)
    assert.match(adapter, /adaptExternalTheme/)
    assert.match(main, /ThemeRuntimeManager/)
    assert.match(packageRuntime, /registerPlugin<ThemePackagePluginApi>\('ThemePackage'\)/)
    assert.match(packageRuntime, /NativeThemePackage\.pickThemePackage\(\)/)
    assert.match(packageRuntime, /NativeThemePackage\.installThemePackage/)
    assert.doesNotMatch(main + registry + packageRuntime, /FileReader|JSZip|showOpenFilePicker/)
  }],
  ['THM10', 'source layout enforces the public boundary or private documentation supplement', () => {
    if (fs.existsSync(architecturePath)) {
      assert.ok(fs.existsSync(path.join(root, 'src/main/index.ts')), 'Internal documentation is only valid in the private source layout')
      const architecture = fs.readFileSync(architecturePath, 'utf8')
      for (const phrase of ['Product layer', 'Peer themes', 'Single visual source', 'Future external-theme compatibility', 'Themes cannot alter business logic']) {
        assert.match(architecture, new RegExp(phrase))
      }
      process.stdout.write('PRIVATE_TREE_DOCUMENTATION_SUPPLEMENT=PASS; public source contracts also execute\n')
    } else {
      const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
      publicPathAudit(paths)
      assert.equal(paths.some(file => file.startsWith('docs/agent/')), false)
      process.stdout.write('PUBLIC_SOURCE_LAYOUT=PASS; docs/agent excluded; no architecture suite skipped\n')
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
    for (const asset of ['assets/practice/hero.png', 'assets/practice/sight.png', 'assets/practice/chord.png']) assert.match(externalTheme, new RegExp(asset.replaceAll('/', '\\/').replace('.', '\\.')))
    assert.match(css, /:root\[data-theme-recipe-practice='practice-hero-cards-v1'\] \.bocchi-practice-preview/)
    assert.equal((practice.match(/<button className=\{`module-card/g) ?? []).length, 3)
    assert.equal((practice.match(/themed-practice-card is-/g) ?? []).length, 2)
    assert.match(practice, /interval-notebook-card/)
    assert.doesNotMatch(practice, /自由练习|节拍器/)
    assert.doesNotMatch(practice, /module-card__recent|sightRecentSummary|chordRecentSummary|暂无练习记录|MIDI 自动判题/)
    assert.doesNotMatch(css, /module-card__recent/)
    assert.equal((practice.match(/<span className="module-card__copy">/g) ?? []).length, 3)
    assert.equal((practice.match(/__action"><Icon name="play"/g) ?? []).length, 3)
    assert.match(practice, /指定低音构造 · 26 种音程/)
    assert.doesNotMatch(practice, /复现 \/ 构造/)
    assert.match(practice, /runtime\.refreshHistory\(\)/)
    assert.match(practice, /chordPersistence\.refresh\(\)/)
  }],
  ['THM13', 'Tools consumes a visual capability without theme-name coupling', () => {
    assert.match(tools, /theme\.capabilities\.toolsVisual/)
    assert.match(tools, /toolsVisual\.kind === 'hero-cards'/)
    assert.doesNotMatch(tools, /bocchi-dev|assets\/themes\/bocchi/)
    for (const route of ['chord-query-tool', 'interval-query-tool', 'scale-key-signature-tool']) assert.match(tools, new RegExp(route))
  }],
  ['THM14', 'Bocchi Tools uses one hero and three decorations while reference D stays inert', () => {
    for (const asset of ['assets/tools/hero.png', 'assets/tools/chord.png', 'assets/tools/interval.png', 'assets/tools/scale.png']) assert.match(externalTheme, new RegExp(asset.replaceAll('/', '\\/').replace('.', '\\.')))
    assert.match(css, /:root\[data-theme-recipe-tools='tools-studio-cards-v1'\] \.bocchi-tools-preview/)
    assert.equal((tools.match(/screen: '/g) ?? []).length, 3)
    assert.doesNotMatch(tools, /搜索工具|最近使用|基础乐理|节拍器/)
  }],
  ['THM15', 'History dashboard structure is shared while Bocchi visuals stay theme-owned', () => {
    assert.match(history, /theme\.capabilities\.historyVisual/)
    assert.match(history, /historyVisual\.kind === 'dashboard'/)
    assert.doesNotMatch(history, /bocchi-dev|assets\/themes\/bocchi/)
    for (const asset of ['assets/history/hero.png', 'assets/history/trend.png', 'assets/history/memo.png', 'assets/history/lower.png']) assert.match(externalTheme, new RegExp(asset.replaceAll('/', '\\/').replace('.', '\\.')))
    assert.match(css, /:root\[data-theme-recipe-history='history-journal-dashboard-v1'\] \.bocchi-history-preview/)
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
    for (const asset of ['assets/settings/hero.png', 'assets/settings/midi.png', 'assets/settings/theme.png', 'assets/settings/about.png']) assert.match(externalTheme, new RegExp(asset.replaceAll('/', '\\/').replace('.', '\\.')))
    assert.match(css, /:root\[data-theme-recipe-settings='settings-hero-cards-v1'\] \.bocchi-settings-preview/)
  }],
  ['THM17', 'ACTIVE practice consumes one shared visual capability with isolated Bocchi decoration', () => {
    assert.match(sightActive, /theme\.capabilities\.practiceActiveVisual/)
    assert.match(sightActive, /practiceActiveVisual\.kind === 'decorated-focus'/)
    assert.doesNotMatch(sightActive, /bocchi-dev|assets\/themes\/bocchi/)
    assert.equal((registry.match(/practiceActiveVisual: standardPracticeActiveVisual/g) ?? []).length, 2)
    assert.match(externalTheme, /"practiceActiveVisual"[\s\S]*"recipeId": "practice-decorated-focus-v1"/)
    assert.match(externalTheme, /"cornerCharacter": "assets\/practice-active\/sight-character\.png"/)
    assert.match(externalTheme, /"decorations": "assets\/practice-active\/sight-decorations\.png"/)
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
    for (const asset of ['assets/practice-active/chord-character.png', 'assets/practice-active/chord-decorations.png', 'assets/practice-active/chord-polaroid.png']) assert.match(externalTheme, new RegExp(asset.replaceAll('/', '\\/').replace('.', '\\.')))
    assert.match(adapter, /chordArtwork:\s*\{[\s\S]*frameClassName: 'bocchi-chord-active'/)
    assert.match(chordActive, /chordArtwork \? \([\s\S]*data-chord-theme-asset="character"[\s\S]*data-chord-theme-asset="polaroid"/)
    assert.equal((chordActive.match(/data-chord-theme-asset="decoration"/g) ?? []).length, 3)
    assert.match(chordActive, /presentation\.semantic === 'success'[\s\S]*data-chord-theme-reward="success"/)
    assert.match(css, /:root\[data-theme-recipe-practice-active='practice-decorated-focus-v1'\] \.bocchi-chord-active \.chord-notation-card/)
    assert.doesNotMatch(css, /\.bocchi-chord-active \.chord-grand-staff/)
  }],
  ['THM19', 'Tool Detail uses a shared capability with isolated Chord Query artwork', () => {
    assert.match(chordQuery, /function ToolDetailShell/)
    assert.match(chordQuery, /theme\.capabilities\.toolDetailVisual/)
    assert.match(chordQuery, /toolDetailVisual\.kind === 'decorated-reference'/)
    assert.doesNotMatch(chordQuery, /bocchi-dev|assets\/themes\/bocchi/)
    assert.equal((registry.match(/toolDetailVisual: standardToolDetailVisual/g) ?? []).length, 2)
    assert.match(externalTheme, /"toolDetailVisual"[\s\S]*"recipeId": "tool-reference-notebook-v1"/)
    assert.match(externalTheme, /"background": "assets\/tool-detail\/background\.png"/)
    assert.match(externalTheme, /"chordQueryHero": "assets\/tool-detail\/chord-query-hero\.png"/)
    assert.match(externalTheme, /"sharedCompleteRyo": "assets\/tool-detail\/shared-ryo\.png"/)
    assert.match(externalTheme, /"decorations": "assets\/tool-detail\/decorations\.png"/)
    assert.equal((chordQuery.match(/data-tool-detail-asset="background"/g) ?? []).length, 1)
    assert.equal((chordQuery.match(/data-tool-detail-asset="chord-query-hero"/g) ?? []).length, 1)
    assert.equal((chordQuery.match(/data-tool-detail-asset="decoration"/g) ?? []).length, 7)
    assert.match(chordQuery, /decoratedReference \? \([\s\S]*?tool-detail-artwork/)
    assert.match(chordQuery, /heroArtwork=\{decoratedReference\?\.artwork\.chordQueryHero\}/)
    assert.match(css, /bocchi-tool-detail-preview \.tool-detail-top\s*\{[\s\S]*?z-index: auto;/)
    assert.match(css, /bocchi-tool-detail-preview \.tool-detail-query-panel\s*\{[\s\S]*?z-index: 6;/)
    assert.match(css, /bocchi-tool-detail-preview \.tool-detail-artwork__chord-query-hero\s*\{[\s\S]*?top: 4px;[\s\S]*?width: 328px;/)
    assert.match(css, /\.tool-detail-top\.chord-query-header\s*\{[\s\S]*?grid-template-rows: 210px 108px;/)
    assert.match(css, /\.tool-detail-query-panel\s*\{[\s\S]*?margin: 0 28px;/)
    assert.doesNotMatch(css, /bocchi-tool-detail-preview \.chord-query-selectors\s*\{[\s\S]*?grid-template-columns:/)
    assert.match(css, /:root\[data-theme-recipe-tool-detail='tool-reference-notebook-v1'\] \.bocchi-tool-detail-preview/)
    assert.match(recipes, /'tool-reference-notebook-v1'/)
    assert.doesNotMatch(registry, /照片-1|chord-query-reference/)
  }],
  ['THM20', 'Scale Key Signature consumes shared Tool Detail capability with isolated page artwork', () => {
    assert.match(scaleKeySignature, /theme\.capabilities\.toolDetailVisual/)
    assert.match(scaleKeySignature, /toolDetailVisual\.kind === 'decorated-reference'/)
    assert.match(scaleKeySignature, /<ToolDetailShell/)
    assert.match(scaleKeySignature, /heroArtwork=\{decoratedReference\?\.artwork\.sharedCompleteRyo\}/)
    assert.match(scaleKeySignature, /heroKind="complete-ryo"/)
    assert.doesNotMatch(scaleKeySignature, /bocchi-dev|assets\/themes\/bocchi/)
    assert.equal((chordQuery.match(/data-tool-detail-asset="complete-ryo"/g) ?? []).length, 1)
    assert.match(css, /\.tool-detail-top\.scale-tool-header\s*\{[\s\S]*?grid-template-rows: 210px 108px;/)
    assert.match(css, /\.scale-tool-selectors\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/)
    assert.match(css, /\.scale-tool-results\s*\{[\s\S]*?grid-template-columns: minmax\(0, 44fr\) minmax\(0, 56fr\);/)
    assert.match(css, /\.scale-tool-layout \.tool-detail-artwork__complete-ryo\s*\{[\s\S]*?width: 315px;/)
    assert.match(css, /\.scale-key-signature-paper\s*\{[\s\S]*?background: #fff;/)
    assert.doesNotMatch(registry, /18_23_57|scale-key-signature-reference/)
  }],
  ['THM21', 'Interval Query consumes shared Tool Detail capability with page-specific geometry', () => {
    assert.match(intervalQuery, /theme\.capabilities\.toolDetailVisual/)
    assert.match(intervalQuery, /toolDetailVisual\.kind === 'decorated-reference'/)
    assert.match(intervalQuery, /<ToolDetailShell/)
    assert.match(intervalQuery, /heroArtwork=\{decoratedReference\?\.artwork\.sharedCompleteRyo\}/)
    assert.match(intervalQuery, /heroKind="complete-ryo"/)
    assert.doesNotMatch(intervalQuery, /bocchi-dev|assets\/themes\/bocchi|scale-key-signature\//)
    assert.match(css, /\.tool-detail-top\.interval-query-header\s*\{[\s\S]*?grid-template-rows: 210px 108px;/)
    assert.match(css, /\.interval-query-selectors\s*\{[\s\S]*?grid-template-columns: minmax\(0, 46fr\) 62px minmax\(0, 46fr\);/)
    assert.match(css, /\.interval-query-results\s*\{[\s\S]*?grid-template-columns: minmax\(0, 64fr\) minmax\(320px, 36fr\);/)
    assert.match(css, /\.interval-query-layout \.tool-detail-artwork__complete-ryo\s*\{[\s\S]*?width: 312px;/)
    assert.match(main, /case 'interval-query-tool': return <IntervalQueryToolScreen theme=\{activeTheme\} \/>/)
  }],
  ['THM22', 'real schemas reject unsafe theme parameters and unknown business inputs', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'theme-packages/bocchi/manifest.json'), 'utf8'))
    const definition = JSON.parse(externalTheme)
    validateContracts(manifest, definition)
    for (const mutate of [
      theme => { theme.capabilities.intervalPracticeVisual.parameters.captureWindowMs = 300 },
      theme => { theme.capabilities.intervalPracticeVisual.assets.resultHero = 'assets/result.png' },
      theme => { theme.capabilities.intervalPracticeVisual.assets.activeBorder = 'https://unsafe.invalid/theme.png' },
      theme => { theme.capabilities.intervalPracticeVisual.recipeId = 'unknown-recipe' }
    ]) {
      const unsafe = structuredClone(definition)
      mutate(unsafe)
      assert.throws(() => validateContracts(manifest, unsafe))
    }
    const old = structuredClone(definition)
    delete old.capabilities.intervalPracticeVisual
    validateContracts(manifest, old)
    for (const slots of [[], ['hubCardCollage'], ['activeBorder']]) {
      const optional = structuredClone(definition)
      optional.capabilities.intervalPracticeVisual.assets = Object.fromEntries(slots.map(slot => [slot, definition.capabilities.intervalPracticeVisual.assets[slot]]))
      validateContracts(manifest, optional)
    }
  }],
  ['THM23', 'Product owns Interval state and debug tools while native signing trust remains isolated', () => {
    const intervalActive = main.slice(main.indexOf('function IntervalPracticeActiveScreen'), main.indexOf('function ChordModeSelectScreen'))
    assert.match(intervalActive, /theme\.capabilities\.intervalPracticeVisual/)
    assert.match(intervalActive, /runtime/)
    assert.doesNotMatch(intervalActive, /目标 MIDI|开发 MIDI|NOTE ON|NOTE OFF|Human UI Review/)
    assert.match(main, /SHOW_DEVELOPMENT_TOOLS \? \([\s\S]*?<ReviewDock/)
    assert.match(packageRuntime, /NativeThemePackage\.installThemePackage/)
    const trust = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/pianofundamentals/trainer/ThemeTrustStore.kt'), 'utf8')
    assert.match(trust, /pft-theme-prod-2026-01/)
    assert.match(trust, /release/)
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
