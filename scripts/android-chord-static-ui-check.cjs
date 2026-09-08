const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      },
      fileName: filename
    }).outputText
    module._compile(output, filename)
  }
}

const root = path.resolve(__dirname, '..')
const mocks = require('../prototype/android-tablet-v1/src/chordPracticeMocks.ts')
const mainSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/main.tsx'), 'utf8')
const rendererSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/ChordGrandStaff.tsx'), 'utf8')
const mockSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/chordPracticeMocks.ts'), 'utf8')
const contractSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/musicTheory/chords/productContract.ts'), 'utf8')

const tests = []
const test = (id, title, callback) => tests.push({ id, title, callback })

test('CUI01', 'six required Human QA states are explicit and complete', () => {
  assert.deepEqual(mocks.CHORD_MOCK_STATES.map((state) => state.id), [
    'arpeggio-ready',
    'arpeggio-wrong',
    'wait-release-to-block',
    'block-ready',
    'block-wrong-restart',
    'question-correct'
  ])
  assert.equal(mocks.getChordMockState('arpeggio-ready').prompt, '请按谱面顺序弹奏分解和弦')
  assert.equal(mocks.getChordMockState('block-wrong-restart').prompt, '柱式错误 · 松开琴键后从分解重新开始')
  assert.equal(mocks.getChordMockState('question-correct').prompt, '正确')
})

test('CUI02', 'required triad seventh inversion and register QA cases exist', () => {
  const ids = new Set(mocks.CHORD_MOCK_CASES.map((item) => item.id))
  for (const id of [
    'c-major-root',
    'b-flat-half-diminished-third',
    'c-sharp-major-root',
    'c-flat-major-first',
    'd-flat-seven-low',
    'a-augmented-high-second'
  ]) assert.ok(ids.has(id), `missing ${id}`)
  assert.ok(mocks.CHORD_MOCK_CASES.some((item) => item.writtenPitches.length === 3))
  assert.ok(mocks.CHORD_MOCK_CASES.some((item) => item.writtenPitches.length === 4))
  assert.ok(mocks.CHORD_MOCK_CASES.some((item) => item.inversion === '第三转位'))
})

test('CUI03', 'every mock uses concrete ordered written pitch plus sounding MIDI identity', () => {
  for (const item of mocks.CHORD_MOCK_CASES) {
    assert.ok(item.writtenPitches.length >= 3 && item.writtenPitches.length <= 4)
    for (const pitch of item.writtenPitches) {
      assert.match(pitch.spelling, /^[A-G][♯♭♮]*\d$/)
      assert.ok(Number.isInteger(pitch.octave))
      assert.ok(Number.isInteger(pitch.soundingMidiNumber))
      assert.match(pitch.vexFlowKey, /^[a-g](?:#|b|bb)?\/\d$/)
      assert.ok(pitch.clef === 'treble' || pitch.clef === 'bass')
    }
  }
})

test('CUI04', 'theoretical spelling remains separate from enharmonic sounding pitch', () => {
  const sharpMajorSeven = mocks.getChordMockCase('c-sharp-major-seven-first')
  const bSharp = sharpMajorSeven.writtenPitches.find((pitch) => pitch.spelling === 'B♯4')
  assert.equal(bSharp?.soundingMidiNumber, 72)
  assert.equal(bSharp?.letter, 'B')
  assert.equal(bSharp?.vexFlowKey, 'b#/4')
  const cFlat = mocks.getChordMockCase('c-flat-major-first').writtenPitches.find((pitch) => pitch.spelling === 'C♭5')
  assert.equal(cFlat?.soundingMidiNumber, 71)
  assert.equal(cFlat?.vexFlowKey, 'cb/5')
})

test('CUI05', 'sharp flat natural and double accidental display contracts are represented', () => {
  const accidentals = new Set(mocks.CHORD_MOCK_CASES.flatMap((item) => item.writtenPitches.map((pitch) => pitch.accidental)))
  for (const accidental of ['#', 'b', 'n', 'bb', null]) assert.ok(accidentals.has(accidental))
  assert.match(rendererSource, /new Accidental\(pitch\.accidental\)/)
  assert.match(rendererSource, /pitches\.forEach\(\(pitch, index\)/)
})

test('CUI06', 'Chord renderer is one Grand Staff with left arpeggio and right block groups', () => {
  assert.match(rendererSource, /addClef\('treble'\)/)
  assert.match(rendererSource, /addClef\('bass'\)/)
  assert.match(rendererSource, /setType\('brace'\)/)
  assert.match(rendererSource, /const blockX/)
  assert.match(rendererSource, /const arpeggioStart/)
  assert.match(rendererSource, /const centerOwnershipBoundary/)
  assert.match(rendererSource, /const arpeggioEnd = centerOwnershipBoundary - groupSeparation/)
  assert.match(rendererSource, /const blockRegionStart = centerOwnershipBoundary \+ groupSeparation/)
  assert.match(rendererSource, /const blockX = \(blockRegionStart \+ blockRegionEnd\) \/ 2/)
  assert.match(rendererSource, /左侧分解和弦，右侧柱式和弦/)
  assert.ok(rendererSource.indexOf('pitches.forEach((pitch, index)') < rendererSource.lastIndexOf("drawAt(context, trebleStave, pitches.filter"))
  const chordUi = mainSource.slice(mainSource.indexOf('function ChordGroupBadge'), mainSource.indexOf('function SightReadyScreen'))
  assert.ok(chordUi.indexOf('label="分解"') < chordUi.indexOf('label="柱式"'))
  assert.doesNotMatch(rendererSource, /addKeySignature|addTimeSignature/)
})

test('CUI07', 'Chord page exposes only approved settings and compact practice facts', () => {
  for (const label of ['三和弦 + 七和弦', '全部转位', '随机音区', '分解 + 柱式']) assert.match(mainSource, new RegExp(label.replace('+', '\\+')))
  assert.match(mainSource, /\{ label: '无限', value: 'endless' \}/)
  assert.match(mainSource, /已完成 26/)
  assert.match(mainSource, /连续正确 4/)
  assert.doesNotMatch(mainSource.slice(mainSource.indexOf('function ChordSettingsDrawer'), mainSource.indexOf('function SightReadyScreen')), /Reaction Time|Best Streak|Most Missed|倒计时/)
})

test('CUI08', 'Chord static surface does not implement MIDI judgement generation persistence or theory logic', () => {
  assert.doesNotMatch(rendererSource + mockSource, /MidiManager|Bluetooth|handleMidi|PracticeSessionRepository|localStorage|Preferences|Math\.random|setTimeout|setInterval/)
  const chordUi = mainSource.slice(mainSource.indexOf('function ChordGroupBadge'), mainSource.indexOf('function SightReadyScreen'))
  assert.doesNotMatch(chordUi, /runtime\.(start|stop|handleMidi|sendMidi|updateSettings)|markCorrect|markWrong|advanceQuestion/)
})

test('CUI09', 'development-only selectors expose every state and QA case without entering product controls', () => {
  assert.match(mainSource, /active === 'chord-practice'/)
  assert.match(mainSource, /CHORD_MOCK_STATES\.map/)
  assert.match(mainSource, /CHORD_MOCK_CASES\.map/)
  assert.match(mainSource, /SHOW_DEVELOPMENT_TOOLS \? \(/)
})

test('CUI10', 'Android stable version remains 1.4.0 code 9', () => {
  const version = fs.readFileSync(path.join(root, 'android/version.properties'), 'utf8')
  assert.match(version, /^versionCode=9$/m)
  assert.match(version, /^versionName=1\.4\.0$/m)
})

test('CUI11', 'Grand Staff polish enlarges and raises notation while strengthening only secondary ink', () => {
  assert.match(rendererSource, /const RENDER_HEIGHT = 344/)
  assert.match(rendererSource, /const DRAWING_SCALE = 1\.33/)
  assert.match(rendererSource, /const SECONDARY_INK = '#747b77'/)
  assert.match(rendererSource, /new Stave\(staveX, 26, staveWidth\)\.addClef\('treble'\)/)
  assert.match(rendererSource, /new Stave\(staveX, 128, staveWidth\)\.addClef\('bass'\)/)
  assert.match(rendererSource, /note\.setLedgerLineStyle\(\{ fillStyle: style\.fillStyle, strokeStyle: style\.strokeStyle \}\)/)
  assert.match(rendererSource, /const GROUP_CENTER_BOUNDARY_RATIO = 0\.5/)
  assert.match(rendererSource, /const GROUP_SEPARATION_RATIO = 0\.13/)
  assert.match(rendererSource, /const ARPEGGIO_LEFT_PADDING_RATIO = 0\.12/)
  assert.match(rendererSource, /const BLOCK_RIGHT_PADDING_RATIO = 0\.08/)
})

test('CUI12', 'provisional block capture is frozen outside UI and static failures restart the same question from Arpeggio', () => {
  assert.match(contractSource, /captureWindowMs: 150/)
  assert.match(contractSource, /PROVISIONAL_FP30X_CALIBRATION_REQUIRED/)
  assert.doesNotMatch(mainSource + rendererSource + mockSource, /captureWindowMs|PROVISIONAL_FP30X_CALIBRATION_REQUIRED/)
  const arpeggioWrong = mocks.getChordMockState('arpeggio-wrong')
  assert.deepEqual([arpeggioWrong.arpeggio, arpeggioWrong.block], ['wrong', 'secondary'])
  const waitToBlock = mocks.getChordMockState('wait-release-to-block')
  assert.deepEqual([waitToBlock.arpeggio, waitToBlock.block], ['completed', 'secondary'])
  const blockReady = mocks.getChordMockState('block-ready')
  assert.deepEqual([blockReady.arpeggio, blockReady.block], ['completed', 'active'])
  const blockWrong = mocks.getChordMockState('block-wrong-restart')
  assert.deepEqual([blockWrong.arpeggio, blockWrong.block], ['completed', 'wrong'])
})

let failed = 0
for (const item of tests) {
  try {
    item.callback()
    console.log(`PASS ${item.id} ${item.title}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${item.id} ${item.title}`)
    console.error(error.stack || error)
  }
}
console.log(`\n${tests.length - failed}/${tests.length} Android Chord V1 static UI checks PASS`)
if (failed > 0) process.exitCode = 1
