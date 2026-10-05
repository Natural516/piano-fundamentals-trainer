const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const ui = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/main.tsx'), 'utf8')
const css = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/styles.css'), 'utf8')
const persistence = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/androidPersistenceCore.ts'), 'utf8')
const mainActivity = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/pianofundamentals/trainer/MainActivity.java'), 'utf8')
const version = fs.readFileSync(path.join(root, 'android/version.properties'), 'utf8')
const chordResources = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/localization/chordPracticeResources.ts'), 'utf8')

function between(start, end) {
  const from = ui.indexOf(start)
  const to = ui.indexOf(end, from + start.length)
  assert.ok(from >= 0 && to > from, `missing section ${start}`)
  return ui.slice(from, to)
}

const navigation = between('const productNavigation = [', 'const SHOW_DEVELOPMENT_TOOLS')
const home = between('function HomeScreen', 'function PracticeHubScreen')
const practice = between('function PracticeHubScreen', 'const THEORY_TOOLS')
const tools = between('const THEORY_TOOLS', 'function ChordGroupBadge')
const sightReady = between('function SightReadyScreen', 'function useRemainingTime')
const history = between('function HistoryScreen', 'function SettingRow')
const historyRecord = between('function HistoryRecord', 'function HistoryScreen')
const chordReport = between('function ChordReportDetailScreen', 'function SettingRow')
const settings = between('function SettingsScreen', 'function MidiScreen')
const updateScreen = between('function UpdateScreen', 'function ReviewDock')
const productUi = ui.slice(ui.indexOf('function HomeScreen'), ui.indexOf('function MidiScreen'))

const tests = [
  ['NAV01', 'bottom navigation order is Home Practice Tools History Settings', () => {
    const labels = [...navigation.matchAll(/label: '([^']+)'/g)].map((match) => match[1])
    assert.deepEqual(labels, ['首页', '练习', '工具', '记录', '设置'])
    assert.doesNotMatch(navigation, /label: '识谱'/)
  }],
  ['NAV02', 'Practice Hub routes to Sight Reading and the Chord-internal Mode Select', () => {
    assert.match(practice, /t\('sightTitle'\)/)
    assert.match(practice, /navigate\('sight-ready'\)/)
    assert.match(practice, /t\('chordTitle'\)/)
    assert.match(practice, /navigate\('chord-mode-select'\)/)
    assert.match(practice, /function ChordModeSelectScreen/)
  }],
  ['NAV03', 'Tools exposes three cards and opens Chord Scale and Interval screens', () => {
    for (const label of ['和弦查询', '自然大调音阶与调号', '音程查询']) assert.match(tools, new RegExp(label))
    assert.equal((tools.match(/title: '/g) ?? []).length, 3)
    assert.doesNotMatch(tools, /title: '音阶查询'|title: '调号参考'/)
    assert.doesNotMatch(tools, /开发中/)
    assert.match(tools, /navigate\(tool\.screen\)/)
    assert.match(ui, /case 'chord-query-tool': return <ChordQueryToolScreen theme=\{activeTheme\} \/>/)
    assert.match(ui, /'chord-query-tool': 'tools'/)
    assert.match(ui, /case 'scale-key-signature-tool': return <ScaleKeySignatureToolScreen theme=\{activeTheme\} \/>/)
    assert.match(ui, /'scale-key-signature-tool': 'tools'/)
    assert.match(ui, /case 'interval-query-tool': return <IntervalQueryToolScreen theme=\{activeTheme\} \/>/)
    assert.match(ui, /'interval-query-tool': 'tools'/)
    assert.equal(
      (tools.match(/<ProductFrame active="tools" className=\{decoratedReference\?\.frameClassName\} onBack=\{\(\) => navigate\('tools'\)\}/g) ?? []).length,
      3
    )
  }],
  ['NAV04', 'Home glance cards are Last Practice MIDI Input and Theory Tools', () => {
    for (const key of ['lastPractice', 'midiInput', 'theory']) assert.ok(home.includes(`t('${key}')`))
    assert.doesNotMatch(home, /<small>应用版本<\/small>/)
    assert.doesNotMatch(home, /85% 正确率|今天 09:42|· 20 题/)
    assert.match(home, /projectMixedPracticeHistory\(history\.records, chordHistory\.records\)\[0\]/)
    assert.match(home, /runtime\.refreshHistory\(\)/)
    const recentCall = /const recentDisplay = presentHomeRecentPractice\(recentPractice, t, recentChordDisplay\)\r?\n/
    assert.match(home, recentCall)
    for (const invalid of ['recentPractice, t', 'recentPractice, t, otherDisplay', 'recentPractice, t, recentChordDisplay, extra']) {
      assert.doesNotMatch(`const recentDisplay = presentHomeRecentPractice(${invalid})\n`, recentCall)
    }
    assert.match(fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/localization/hubResources.ts'), 'utf8'), /empty: '暂无练习记录'/)
  }],
  ['NAV05', 'global Settings contains only Device Appearance and About group headings', () => {
    const groups = [...settings.matchAll(/<div className="group-title"><span>([^<]+)<\/span>/g)].map((match) => match[1])
    assert.deepEqual(groups, ["{t('device')}", "{t('appearance')}", "{t('about')}"])
    assert.doesNotMatch(settings, /识谱练习设置|默认谱表|音符数量/)
  }],
  ['NAV06', 'Sight Reading owns its settings drawer while retaining the existing settings contract', () => {
    assert.match(sightReady, /setSettingsOpen\(true\)/)
    assert.match(sightReady, /<SightSettingsDrawer/)
    assert.match(persistence, /sightReadingSettings: 'piano\.v1\.sightReading\.settings'/)
    assert.match(ui, /runtime\.updateSettings\(changes\)/)
  }],
  ['NAV07', 'History presentation offers All Sight Chord and Interval filters with factual empty states', () => {
    for (const label of ["['all', 'all']", "['sight', 'sightBadge']", "['chord', 'chordBadge']", "['interval', 'intervalBadge']", 'emptyChord', 'emptyInterval']) assert.ok(history.includes(label))
    assert.match(history, /filter === 'chord' \? chordItems : mixedItems/)
    assert.match(history, /filter === 'interval' \? intervalItems : nonSightItems/)
    assert.match(history, /t\('recent'\)/)
    assert.match(history, /t\('trend'\)/)
    assert.match(ui, /history-module-badge">\{sightT\('historyModule'\)\}/)
    const sightResources = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/localization/sightReadingResources.ts'), 'utf8')
    assert.match(sightResources, /historyModule: '识谱'/)
    assert.match(sightResources, /historyModule: 'Sight Reading'/)
    assert.match(ui, /history-module-badge is-chord">\{chordT\('badge'\)\}/)
    assert.match(chordResources, /badge: '和弦'/)
    assert.match(chordResources, /badge: 'Chords'/)
    assert.doesNotMatch(history, /piano\.v1\.|Preferences\.|localStorage/)
  }],
  ['NAV08', 'submodule and Android Back paths follow the frozen Chord-internal hierarchy', () => {
    assert.match(ui, /'sight-ready': 'practice'/)
    assert.match(ui, /'sight-result': 'practice'/)
    assert.match(ui, /'chord-mode-select': 'practice'/)
    assert.match(ui, /'chord-practice': 'chord-mode-select'/)
    assert.match(ui, /aria-label=\{t\('backPractice'\)\}/)
    assert.match(chordResources, /backPractice: '返回练习'/)
    assert.match(chordResources, /backPractice: 'Back to practice'/)
  }],
  ['NAV09', 'QA channel and production version identities remain frozen', () => {
    assert.match(version, /^versionCode=15$/m)
    assert.match(version, /^versionName=1\.7\.0$/m)
    assert.match(ui, /if \(!__QA_BUILD__\) void updater\.initialize\(\)/)
    assert.match(settings, /description=\{t\('qaUpdateDescription'\)\}/)
    assert.match(fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/localization/shellResources.ts'), 'utf8'), /qaUpdateDescription: '与正式版独立安装；正式更新通道已关闭'/)
  }],
  ['NAV10', 'Chord History empty state contains no Sight Reading or fabricated metric', () => {
    assert.match(history, /filter === 'chord' \? 'emptyChord'/)
    assert.match(history, /filter === 'chord' \? 'emptyChordDetail'/)
    assert.doesNotMatch(history, /平均反应|总体正确率|Accuracy|Block Errors|Arpeggio Errors/)
  }],
  ['NAV11', 'normal product copy exposes no storage key or implementation-contract wording', () => {
    assert.doesNotMatch(productUi, /piano\.v1\.sightReading\.settings|persistence\/history|仅调整设置入口位置|不会在这里伪造记录|QA Static UI/)
    assert.match(productUi, /t\('nextSession'\)/)
    const sightResources = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/localization/sightReadingResources.ts'), 'utf8')
    assert.match(sightResources, /nextSession: '下一轮生效'/)
    assert.match(sightResources, /nextSession: 'Applies to the next session'/)
    assert.doesNotMatch(productUi, /下一轮生效 · 使用默认设置/)
  }],
  ['NAV12', 'all Sight Reading selects share one custom chevron centered 16.5px from the right edge', () => {
    assert.match(ui, /className="setting-select-wrap"/)
    assert.match(ui, /<Icon name="chevron-down" size=\{17\}/)
    assert.match(css, /\.setting-select-wrap > svg \{[\s\S]*?right: 8px;[\s\S]*?pointer-events: none;/)
    assert.match(css, /\.setting-select \{[\s\S]*?-webkit-appearance: none;[\s\S]*?appearance: none;/)
    assert.match(css, /padding: 0 38px 0 12px;/)
  }],
  ['NAV13', 'Android shared shell owns one modern immersive fullscreen policy', () => {
    assert.match(mainActivity, /WindowCompat\.setDecorFitsSystemWindows\(getWindow\(\), false\)/)
    assert.match(mainActivity, /WindowInsetsControllerCompat\.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE/)
    assert.match(mainActivity, /controller\.hide\(WindowInsetsCompat\.Type\.systemBars\(\)\)/)
    assert.doesNotMatch(mainActivity, /setOnApplyWindowInsetsListener|setPadding\(|SYSTEM_UI_FLAG_/)
  }],
  ['NAV14', 'MIDI page status is display-only and auxiliary self-reentry is guarded before context mutation', () => {
    const midiStatus = between('function MidiStatusButton', 'function ProductHeader')
    const midiScreen = between('function MidiScreen', 'function updaterStatusCopy')
    const openAuxiliary = ui.slice(ui.indexOf('const openAuxiliary'), ui.indexOf('const returnFromAuxiliary'))
    assert.match(midiStatus, /if \(!interactive\)/)
    assert.match(midiStatus, /role="status"/)
    assert.match(midiScreen, /midiStatusInteractive=\{false\}/)
    assert.match(openAuxiliary, /if \(origin === destination\) return/)
    assert.ok(openAuxiliary.indexOf('if (origin === destination) return') < openAuxiliary.indexOf('rememberAuxiliaryReturn'))
    assert.match(css, /\.midi-status\.is-display-only \{[\s\S]*?cursor: default;[\s\S]*?user-select: none;/)
  }],
  ['NAV15', 'Chord History card opens production report detail by durable record identity', () => {
    assert.match(historyRecord, /<button[\s\S]*?onOpenChordReport\(item\.recordId\)/)
    assert.match(ui, /navigate\('chord-report-detail'\)/)
    assert.match(ui, /resolveChordReportById\(chordPersistenceSnapshot\.records, selectedChordRecordId\)/)
    assert.match(chordReport, /title=\{t\('reportTitle'\)\}/)
    assert.match(chordResources, /reportTitle: '和弦练习报告'/)
    assert.match(chordResources, /reportTitle: 'Chord Practice report'/)
  }],
  ['NAV16', 'Chord report Back restores History while filter remains app-owned', () => {
    assert.match(ui, /const \[historyFilter, setHistoryFilter\] = useState<HistoryFilter>\('all'\)/)
    assert.match(ui, /setHistoryFilter\(filter\)[\s\S]*setSelectedChordRecordId\(recordId\)/)
    assert.match(ui, /setSelectedChordRecordId\(null\)[\s\S]*navigate\('history'\)/)
    assert.match(ui, /currentScreen === 'chord-report-detail'[\s\S]*closeChordReportDetail\(\)/)
  }],
  ['NAV17', 'Sight History remains non-interactive and no router framework is introduced', () => {
    const sightBranch = historyRecord.slice(historyRecord.lastIndexOf('  return ('))
    assert.match(sightBranch, /<article/)
    assert.doesNotMatch(sightBranch, /onClick|<button/)
    assert.doesNotMatch(ui, /react-router|RouterProvider|createBrowserRouter/)
  }],
  ['NAV18', 'Settings and Update share installed package metadata without fixed release copy', () => {
    assert.doesNotMatch(settings, /V\d+\.\d+\.\d+|versionCode \d+/)
    assert.match(settings, /updater\.installed \? `V\$\{updater\.installed\.versionName\}` : `V\$\{__ANDROID_VERSION_NAME__\}`/)
    assert.match(settings, /updater\.installed[\s\S]*?t\('versionCode', \{ code: updater\.installed\.versionCode \}\)[\s\S]*?t\('versionCode', \{ code: __ANDROID_VERSION_CODE__ \}\)/)
    assert.match(updateScreen, /snapshot\.installed \? `V\$\{snapshot\.installed\.versionName\} · \$\{snapshot\.installed\.versionCode\}` : t\('reading'\)/)
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

process.stdout.write(`\n${passed}/${tests.length} Android Navigation / IA V2 checks PASS\n`)
if (passed !== tests.length) process.exitCode = 1
