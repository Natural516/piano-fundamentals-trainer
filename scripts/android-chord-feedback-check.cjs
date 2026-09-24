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
const { presentChordPractice } = require('../prototype/android-tablet-v1/src/chordPractice/presentation.ts')
const registrySource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/theme/themeRegistry.ts'), 'utf8')
const presentationSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/chordPractice/presentation.ts'), 'utf8')
const rendererSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/ChordGrandStaff.tsx'), 'utf8')
const cssSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/styles.css'), 'utf8')
const contractSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/musicTheory/chords/productContract.ts'), 'utf8')
const judgementTypesSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/chordPractice/judgement/types.ts'), 'utf8')
const runtimeTypesSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/chordPractice/runtime/types.ts'), 'utf8')

const tests = []
const test = (id, title, callback) => tests.push({ id, title, callback })

function snapshot(phase, status = 'RUNNING') {
  return {
    status,
    judgement: phase ? { state: { phase } } : null
  }
}

test('CF01', 'Light and Dark expose the same standard shared Practice feedback tokens', () => {
  const lightPalette = registrySource.slice(registrySource.indexOf('const lightTokens'), registrySource.indexOf('const darkTokens'))
  const darkPalette = registrySource.slice(registrySource.indexOf('const darkTokens'), registrySource.indexOf('const bocchiTokens'))
  for (const [token, value] of [
    ['--practice-feedback-success', '#2c7b58'],
    ['--practice-feedback-danger', '#b34545'],
    ['--practice-feedback-warning', '#c17b2b']
  ]) {
    assert.match(lightPalette, new RegExp(`'${token}': '${value}'`))
    assert.match(darkPalette, new RegExp(`'${token}': '${value}'`))
    assert.match(cssSource, new RegExp(token))
  }
  assert.match(rendererSource, /--practice-feedback-success/)
  assert.match(rendererSource, /--practice-feedback-danger/)
  assert.doesNotMatch(rendererSource, /readThemeColor\(container, '--(?:success|danger)'/)
})

test('CF02', 'Arpeggio active remains neutral', () => {
  assert.deepEqual(presentChordPractice(snapshot('ARPEGGIO_READY')), {
    arpeggio: 'active',
    block: 'secondary',
    prompt: '请按谱面顺序弹奏分解和弦',
    semantic: 'neutral',
    stageLabel: '分解'
  })
})

test('CF03', 'Arpeggio wrong maps only the Arpeggio group to danger', () => {
  const result = presentChordPractice(snapshot('ARPEGGIO_WRONG_WAIT_RELEASE'))
  assert.deepEqual([result.arpeggio, result.block, result.semantic], ['wrong', 'secondary', 'danger'])
})

test('CF04', 'Arpeggio completion is success while its release transition is warning', () => {
  const result = presentChordPractice(snapshot('WAIT_ALL_KEYS_UP_BEFORE_BLOCK'))
  assert.deepEqual([result.arpeggio, result.block, result.semantic], ['completed', 'secondary', 'warning'])
})

test('CF05', 'Block active keeps completed Arpeggio success and Block neutral', () => {
  for (const phase of ['BLOCK_READY', 'BLOCK_CAPTURE']) {
    const result = presentChordPractice(snapshot(phase))
    assert.deepEqual([result.arpeggio, result.block, result.semantic], ['completed', 'active', 'neutral'])
  }
})

test('CF06', 'Block wrong preserves Arpeggio success while Block and card are danger', () => {
  const result = presentChordPractice(snapshot('BLOCK_WRONG_WAIT_RELEASE'))
  assert.deepEqual([result.arpeggio, result.block, result.semantic], ['completed', 'wrong', 'danger'])
  assert.match(cssSource, /\.chord-notation-card\.has-danger[\s\S]*--practice-feedback-danger/)
})

test('CF07', 'Block completion is group success while its release transition is warning', () => {
  const result = presentChordPractice(snapshot('WAIT_ALL_KEYS_UP_AFTER_BLOCK'))
  assert.deepEqual([result.arpeggio, result.block, result.semantic], ['completed', 'completed', 'warning'])
})

test('CF08', 'Question completion maps both groups and the card to success', () => {
  const result = presentChordPractice(snapshot('QUESTION_COMPLETE'))
  assert.deepEqual([result.arpeggio, result.block, result.semantic], ['completed', 'completed', 'success'])
  assert.match(cssSource, /\.chord-notation-card\.has-success[\s\S]*--practice-feedback-success/)
})

test('CF09', 'Chord presentation has no timeout mapping or per-note answer classification', () => {
  assert.doesNotMatch(presentationSource, /timeout|TIMEOUT/)
  assert.doesNotMatch(presentationSource + rendererSource, /matchedNotes|missingNotes|extraNotes|wrongNotes|heldNotes/)
})

test('CF10', 'Frozen judgement and timing contracts remain unchanged', () => {
  assert.match(contractSource, /captureWindowMs: 150/)
  assert.match(contractSource, /CHORD_QUESTION_SUCCESS_FEEDBACK_MS = 800/)
  assert.doesNotMatch(judgementTypesSource, /TIMEOUT|timeout/)
  assert.doesNotMatch(runtimeTypesSource, /TIMEOUT|timeout/)
})

test('CF11', 'Standard Chord ACTIVE surface follows Light and Dark theme tokens', () => {
  const baseStart = cssSource.indexOf('.chord-focus-frame {')
  const decoratedStart = cssSource.indexOf('.chord-focus-frame.is-decorated-focus', baseStart)
  const baseSurface = cssSource.slice(baseStart, decoratedStart)
  assert.match(baseSurface, /color-scheme:\s*inherit/)
  assert.match(baseSurface, /background:\s*var\(--app-bg\)/)
  assert.match(baseSurface, /color:\s*var\(--ink\)/)
  assert.doesNotMatch(baseSurface, /#111713|#18201b|#edf3ee/)
  assert.match(cssSource, /\.chord-focus-frame\.is-standard\[data-color-scheme='light'\] \.chord-progress-footer/)

  const lightPalette = registrySource.slice(registrySource.indexOf('const lightTokens'), registrySource.indexOf('const darkTokens'))
  const darkPalette = registrySource.slice(registrySource.indexOf('const darkTokens'), registrySource.indexOf('const bocchiTokens'))
  assert.match(lightPalette, /'--app-bg': '#f2f0e9'/)
  assert.match(lightPalette, /'--surface': '#fcfbf7'/)
  assert.match(lightPalette, /'--text-primary': '#17231e'/)
  assert.match(darkPalette, /'--app-bg': '#111713'/)
  assert.match(darkPalette, /'--surface': '#18201b'/)
  assert.match(darkPalette, /'--text-primary': '#edf3ee'/)
})

test('CF12', 'Notation stays white and decorated Chord ACTIVE keeps its existing dark shell', () => {
  assert.match(cssSource, /\.chord-notation-card\s*\{[\s\S]*?background:\s*var\(--paper\)/)
  assert.match(registrySource, /'--paper': '#ffffff'/)
  assert.match(cssSource, /\.chord-focus-frame\.is-decorated-focus\s*\{[\s\S]*?--app-bg:\s*#111713/)
  assert.match(cssSource, /\.chord-focus-frame\.is-decorated-focus\s*\{[\s\S]*?--surface:\s*#18201b/)
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

console.log(`\n${tests.length - failed}/${tests.length} Android Chord feedback groups PASS`)
if (failed > 0) process.exitCode = 1
