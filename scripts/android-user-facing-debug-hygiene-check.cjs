const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')
const ui = read('prototype', 'android-tablet-v1', 'src', 'main.tsx')
const css = read('prototype', 'android-tablet-v1', 'src', 'styles.css')
const packageJson = JSON.parse(read('package.json'))

function between(start, end) {
  const from = ui.indexOf(start)
  const to = ui.indexOf(end, from + start.length)
  assert.ok(from >= 0 && to > from, `missing section ${start}`)
  return ui.slice(from, to)
}

const midiPresentation = between('interface MidiStatusPresentation', 'const NOTE_POOL_LABELS')
const home = between('function HomeScreen', 'function PracticeHubScreen')
const practiceHub = between('function PracticeHubScreen', 'function IntervalPracticeSetupScreen')
const intervalReady = between('function IntervalPracticeSetupScreen', 'function IntervalPracticeActiveScreen')
const intervalActive = between('function IntervalPracticeActiveScreen', 'function ChordModeSelectScreen')
const chordPages = between('function ChordModeSelectScreen', 'function SightReadyScreen')
const sightReady = between('function SightReadyScreen', 'function useRemainingTime')
const sightActive = between('function SightFocusScreen', 'function SightResultScreen')
const history = between('function HistoryScreen', 'function ChordReportDetailScreen')
const settings = between('function SettingsScreen', 'function MidiScreen')
const midi = between('function MidiScreen', 'function updaterStatusCopy')
const update = between('function UpdateScreen', 'function ReviewDock')
const debugDock = between('function ReviewDock', 'function OrientationNotice')
const appMount = between('function App(', 'function AndroidAppBootstrap')

const normalUserSurface = [
  midiPresentation,
  home,
  practiceHub,
  intervalReady,
  intervalActive,
  chordPages,
  sightReady,
  sightActive,
  history,
  settings,
  midi,
  update
].join('\n')

const forbiddenVisibleArtifacts = [
  '目标 MIDI',
  'NOTE ON',
  'NOTE OFF',
  '发送 NOTE_ON',
  '模拟 MIDI 音高',
  '音程练习模拟 MIDI',
  '开发 MIDI',
  '开发模拟 MIDI',
  'DEBUG 模拟输入',
  'QA Debug',
  'DEVELOPMENT ONLY',
  'Human UI Review',
  '指定 MIDI note number',
  'BLUETOOTH MIDI DIAGNOSTICS',
  '<b>raw</b>',
  '<b>event id</b>',
  '<b>native ns</b>'
]

const leakedArtifacts = forbiddenVisibleArtifacts.filter((token) => normalUserSurface.includes(token))

const checks = [
  ['DH01', 'normal user-facing pages expose zero debug artifacts', () => {
    assert.deepEqual(leakedArtifacts, [])
    process.stdout.write('USER_FACING_DEBUG_ARTIFACT_COUNT=0\n')
  }],
  ['DH02', 'Interval ACTIVE has no embedded simulator or raw target MIDI controls', () => {
    for (const token of ['developmentMidiNumber', 'interval-midi-development', 'sendMidi(', 'sendVelocityZero(', '目标 MIDI', 'NOTE ON', 'NOTE OFF']) {
      assert.equal(intervalActive.includes(token), false, `Interval ACTIVE retains ${token}`)
    }
    assert.match(intervalActive, /<NotationPaper/)
    assert.doesNotMatch(intervalActive, /interval-progress-footer|chord-stage-prompt/)
    assert.match(intervalActive, /<MidiStatusButton compact/)
  }],
  ['DH03', 'Interval preparation contains only product settings and start action', () => {
    for (const label of ['答案提示', '低音包含升降号', '练习题数', '开始练习']) assert.match(intervalReady, new RegExp(label))
    assert.doesNotMatch(intervalReady, /练习方式|practiceMode/)
    assert.doesNotMatch(intervalReady, /DEBUG|NOTE ON|NOTE OFF|目标 MIDI|开发 MIDI|模拟 MIDI/)
  }],
  ['DH04', 'Sight and Chord product pages contain no developer-facing copy', () => {
    assert.doesNotMatch(sightReady, /DEBUG|DEVELOPMENT|开发 MIDI|模拟输入|NOTE ON|NOTE OFF/)
    assert.doesNotMatch(sightActive, /DEBUG|DEVELOPMENT|开发 MIDI|模拟输入|NOTE ON|NOTE OFF/)
    assert.doesNotMatch(chordPages, /DEBUG|DEVELOPMENT|开发 MIDI|模拟输入|NOTE ON|NOTE OFF/)
  }],
  ['DH05', 'development input is projected as human-readable MIDI readiness on product pages', () => {
    assert.match(midiPresentation, /runtime\.midiSource === 'development'/)
    assert.match(midiPresentation, /label: 'MIDI 输入就绪'/)
    assert.match(midiPresentation, /detail: '可以开始练习'/)
    assert.doesNotMatch(midiPresentation, /开发 MIDI|DEBUG|tone: 'development'/)
  }],
  ['DH06', 'Home Practice Tools History Settings MIDI and Update surfaces are debug-clean', () => {
    const surfaces = [home, practiceHub, chordPages, history, settings, midi, update]
    for (const surface of surfaces) {
      assert.doesNotMatch(surface, /QA Debug|DEVELOPMENT ONLY|Human UI Review|开发模拟 MIDI|目标 MIDI|NOTE ON|NOTE OFF|BLUETOOTH MIDI DIAGNOSTICS/)
    }
  }],
  ['DH07', 'QA simulator and diagnostics remain confined to the independent ReviewDock', () => {
    for (const token of ['Human UI Review', 'DEVELOPMENT ONLY', '开发模拟 MIDI', '指定 MIDI note number', '发送 NOTE_ON', 'BLUETOOTH MIDI DIAGNOSTICS', '<b>raw</b>', '<b>event id</b>']) {
      assert.match(debugDock, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
    assert.match(debugDock, /className={`review-dock/)
  }],
  ['DH08', 'Release projection does not mount the QA dock and does not rely on CSS hiding', () => {
    assert.match(ui, /const SHOW_DEVELOPMENT_TOOLS = import\.meta\.env\.DEV \|\| import\.meta\.env\.MODE === 'android-debug' \|\| __QA_BUILD__/)
    assert.match(appMount, /\{SHOW_DEVELOPMENT_TOOLS \? \([\s\S]*?<ReviewDock[\s\S]*?\) : null\}/)
    assert.doesNotMatch(css, /(?:android-release|release).*review-dock[\s\S]*?display\s*:\s*none/i)
  }],
  ['DH09', 'removing the Interval simulator collapses the obsolete layout row and CSS', () => {
    assert.match(css, /\.interval-focus-content \{[\s\S]*?grid-template-rows: 104px minmax\(0, 1fr\);/)
    assert.doesNotMatch(css, /\.interval-midi-development/)
    assert.doesNotMatch(css, /\.is-development/)
  }],
  ['DH10', 'the dedicated hygiene command is registered', () => {
    assert.equal(packageJson.scripts['test:android-user-facing-debug-hygiene'], 'node scripts/android-user-facing-debug-hygiene-check.cjs')
  }]
]

let passed = 0
for (const [id, title, check] of checks) {
  try {
    check()
    passed += 1
    process.stdout.write(`PASS ${id} ${title}\n`)
  } catch (error) {
    process.stderr.write(`FAIL ${id} ${title}\n${error.stack || error}\n`)
  }
}

process.stdout.write(`\n${passed}/${checks.length} Android user-facing debug hygiene checks PASS\n`)
if (passed !== checks.length) process.exitCode = 1
