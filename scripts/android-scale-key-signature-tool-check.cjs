const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename
    }).outputText
    module._compile(output, filename)
  }
}

const root = path.resolve(__dirname, '..')
const mainSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/main.tsx'), 'utf8')
const toolSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/scaleKeySignatureTool.ts'), 'utf8')
const stylesSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/styles.css'), 'utf8')
const toolsSource = mainSource.slice(mainSource.indexOf('const THEORY_TOOLS'), mainSource.indexOf('function ChordGroupBadge'))
const screenSource = mainSource.slice(mainSource.indexOf('function ScaleKeySignatureToolScreen'), mainSource.indexOf('function ChordGroupBadge'))
const {
  AVAILABLE_SCALE_TYPE_OPTIONS,
  NATURAL_MAJOR_TOOL_ROOT_IDS,
  SCALE_TYPE_MODEL,
  createScaleNoteSequence,
  getNaturalMajorToolResult
} = require('../prototype/android-tablet-v1/src/scaleKeySignatureTool.ts')

const tests = []
const test = (name, callback) => tests.push({ name, callback })

test('SK01 screen identity exists', () => assert.match(mainSource, /\| 'scale-key-signature-tool'/))
test('SK02 Tools contains merged Scale and Key Signature card', () => assert.match(toolsSource, /title: '音阶与调号'/))
test('SK03 separate Scale Query card is removed', () => assert.doesNotMatch(toolsSource, /title: '音阶查询'/))
test('SK04 separate Key Signature Reference card is removed', () => assert.doesNotMatch(toolsSource, /title: '调号参考'/))
test('SK05 Chord Query card remains alongside Scale and opens its own screen', () => {
  assert.match(toolsSource, /title: '和弦查询'[\s\S]*?screen: 'chord-query-tool'/)
  assert.match(mainSource, /case 'chord-query-tool': return <ChordQueryToolScreen \/>/)
})
test('SK06 Interval Query remains a distinct implemented sibling tool', () => assert.match(toolsSource, /title: '音程查询'[\s\S]*?screen: 'interval-query-tool'/))
test('SK07 available scale types expose only Natural Major', () => assert.deepEqual(AVAILABLE_SCALE_TYPE_OPTIONS.map((item) => [item.id, item.label]), [['naturalMajor', '自然大调']]))
test('SK08 future model represents Natural Minor', () => assert.ok(SCALE_TYPE_MODEL.some((item) => item.id === 'naturalMinor' && !item.available)))
test('SK09 future model represents Harmonic Minor', () => assert.ok(SCALE_TYPE_MODEL.some((item) => item.id === 'harmonicMinor' && !item.available)))
test('SK10 future model represents Melodic Minor', () => assert.ok(SCALE_TYPE_MODEL.some((item) => item.id === 'melodicMinor' && !item.available)))
test('SK11 future minor types are not rendered as options', () => {
  assert.match(screenSource, /AVAILABLE_SCALE_TYPE_OPTIONS\.map/)
  assert.doesNotMatch(screenSource, /自然小调|和声小调|旋律小调|即将推出|未开放/)
})
test('SK12 default selection is C Natural Major', () => {
  assert.match(screenSource, /useState<MajorKeyId>\('C'\)/)
  assert.match(screenSource, /useState<ScaleTypeId>\('naturalMajor'\)/)
})
test('SK13 C scale notes are correctly spelled', () => assert.deepEqual(getNaturalMajorToolResult('C').notes.ascending, ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C']))
test('SK14 C relative minor is A minor', () => assert.equal(getNaturalMajorToolResult('C').relativeMinorLabel, 'A 小调'))
test('SK15 E-flat scale and relative minor are correct', () => {
  const result = getNaturalMajorToolResult('Eb')
  assert.deepEqual(result.notes.ascending, ['E♭', 'F', 'G', 'A♭', 'B♭', 'C', 'D', 'E♭'])
  assert.equal(result.relativeMinorLabel, 'C 小调')
})
test('SK16 F-sharp scale preserves E-sharp and relative D-sharp', () => {
  const result = getNaturalMajorToolResult('F#')
  assert.deepEqual(result.notes.ascending, ['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯', 'F♯'])
  assert.equal(result.relativeMinorLabel, 'D♯ 小调')
})
test('SK17 C-flat scale preserves C-flat and F-flat', () => assert.deepEqual(getNaturalMajorToolResult('Cb').notes.ascending, ['C♭', 'D♭', 'E♭', 'F♭', 'G♭', 'A♭', 'B♭', 'C♭']))
test('SK18 all 15 written major identities remain distinct', () => assert.deepEqual(NATURAL_MAJOR_TOOL_ROOT_IDS, ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#']))
test('SK19 user-facing results never enharmonically canonicalize edge keys', () => {
  assert.equal(getNaturalMajorToolResult('Cb').title, 'C♭ 自然大调')
  assert.equal(getNaturalMajorToolResult('F#').title, 'F♯ 自然大调')
  assert.equal(getNaturalMajorToolResult('C#').title, 'C♯ 自然大调')
})
test('SK20 note-sequence model supports optional descending notes', () => assert.deepEqual(createScaleNoteSequence(['A', 'B'], ['B', 'A']), { ascending: ['A', 'B'], descending: ['B', 'A'] }))
test('SK21 Natural Major returns one sequence only', () => assert.equal('descending' in getNaturalMajorToolResult('Eb').notes, false))
test('SK22 complete scale is text only and never passed to staff', () => {
  assert.match(screenSource, /result\.notes\.ascending\.map/)
  assert.match(screenSource, /notes=\{\[\]\}/)
  assert.doesNotMatch(screenSource, /spellMidiPitch|vexFlowKey|MusicNotationPitch/)
})
test('SK23 graphical key-signature Grand Staff renderer is present', () => {
  assert.match(screenSource, /<MusicStaffRenderer/)
  assert.match(screenSource, /staffMode="grand"/)
  assert.match(screenSource, /keySignature=\{result\.keySignatureId\}/)
  assert.match(stylesSource, /\.scale-key-signature-paper/)
})
test('SK24 no textual accidental-count description exists', () => assert.doesNotMatch(screenSource, /[0-9]+个升降号|[0-9]+个升号|[0-9]+个降号/))
test('SK25 no textual accidental-name list exists', () => assert.doesNotMatch(screenSource, /升号：|降号：|B♭\s*\/\s*E♭/))
test('SK26 result does not duplicate a tonic metadata row', () => assert.doesNotMatch(screenSource, /<small>主音<\/small>|<dt>主音<\/dt>|主音：/))
test('SK27 result does not duplicate a mode metadata row', () => assert.doesNotMatch(screenSource, /<small>调式<\/small>|<dt>调式<\/dt>|调式：/))
test('SK28 tool has no persistence write or preference key', () => assert.doesNotMatch(toolSource + screenSource, /Preferences|Repository|\.save\(|localStorage|piano\.v1\./))
test('SK29 tool has no History write or report creation', () => assert.doesNotMatch(toolSource + screenSource, /History|PracticeReport|finalize|recordId/))
test('SK30 tool has no MIDI subscription or Runtime', () => assert.doesNotMatch(toolSource + screenSource, /Midi|MIDI|Runtime|subscribe\(/))
test('SK31 tool never acquires practice keep-awake', () => assert.doesNotMatch(toolSource + screenSource, /PracticeKeepAwake|setEnabled|keepPracticeAwake/))
test('SK32 Back returns to Tools and bottom Tools navigation remains active', () => {
  assert.match(screenSource, /<ProductFrame active="tools" onBack=\{\(\) => navigate\('tools'\)\}/)
  assert.match(mainSource, /'scale-key-signature-tool': 'tools'/)
})
test('SK33 Relative Key is no longer a standalone sibling card', () => {
  assert.doesNotMatch(screenSource, /scale-tool-card scale-tool-relative-card/)
})
test('SK34 Relative Key is integrated inside the scale information card', () => {
  const scaleCard = screenSource.slice(screenSource.indexOf('scale-tool-card scale-tool-scale-card'), screenSource.indexOf('scale-tool-card scale-tool-signature-card'))
  assert.match(scaleCard, /scale-tool-relative-section/)
  assert.match(scaleCard, />关系调</)
})
test('SK35 note labels use atomic non-wrapping token markup', () => {
  assert.match(mainSource, /function ScaleNoteToken/)
  assert.match(screenSource, /<ScaleNoteToken value=\{note\}/)
  assert.match(stylesSource, /\.scale-note-token[\s\S]*?white-space: nowrap/)
})
test('SK36 accidental characters remain attached to pitch letters', () => {
  assert.match(mainSource, /className="scale-note-token__accidental"/)
  for (const keyId of ['Eb', 'F#', 'C#', 'Cb']) {
    assert.ok(getNaturalMajorToolResult(keyId).notes.ascending.every((note) => !/^[A-G] [♭♯]/.test(note)))
  }
})
test('SK37 normal-user pitch results use no ASCII accidentals', () => {
  for (const keyId of NATURAL_MAJOR_TOOL_ROOT_IDS) {
    const result = getNaturalMajorToolResult(keyId)
    assert.doesNotMatch([result.title, result.relativeMinorLabel, ...result.notes.ascending].join('|'), /[A-G][#b]/)
  }
})
test('SK38 key-signature renderer still receives no scale notes', () => assert.match(screenSource, /notes=\{\[\]\}/))
test('SK39 Second Pass preserves the treble plus bass Grand Staff', () => assert.match(screenSource, /staffMode="grand"/))
test('SK40 natural-major theory output remains unchanged', () => {
  assert.deepEqual(getNaturalMajorToolResult('F#').notes.ascending, ['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯', 'F♯'])
  assert.deepEqual(getNaturalMajorToolResult('C#').notes.ascending, ['C♯', 'D♯', 'E♯', 'F♯', 'G♯', 'A♯', 'B♯', 'C♯'])
  assert.deepEqual(getNaturalMajorToolResult('Cb').notes.ascending, ['C♭', 'D♭', 'E♭', 'F♭', 'G♭', 'A♭', 'B♭', 'C♭'])
})
test('SK41 current available scale type remains Natural Major only', () => assert.deepEqual(AVAILABLE_SCALE_TYPE_OPTIONS.map((item) => item.id), ['naturalMajor']))
test('SK42 consolidation adds no persistence History MIDI or keep-awake behavior', () => {
  assert.doesNotMatch(toolSource + screenSource, /Preferences|Repository|History|PracticeReport|Midi|MIDI|Runtime|subscribe\(|PracticeKeepAwake|keepPracticeAwake/)
})
test('SK43 selected scale identity appears before the Scale Composition label', () => {
  const scaleCard = screenSource.slice(screenSource.indexOf('scale-tool-card scale-tool-scale-card'), screenSource.indexOf('scale-tool-card scale-tool-signature-card'))
  assert.ok(scaleCard.indexOf('<h2><ScaleNoteToken') < scaleCard.indexOf('>音阶构成</'))
})
test('SK44 Relative Key row keeps its factual label and projected written result', () => {
  assert.match(screenSource, /<small>相对小调<\/small>/)
  assert.match(screenSource, /<ScaleNoteToken value=\{result\.relativeMinorTonicLabel\}/)
  assert.match(screenSource, /<span>小调<\/span>/)
})
test('SK45 all 15 Natural Major note and relative-minor facts remain exact', () => {
  const expected = {
    Cb: [['C♭', 'D♭', 'E♭', 'F♭', 'G♭', 'A♭', 'B♭', 'C♭'], 'A♭ 小调'],
    Gb: [['G♭', 'A♭', 'B♭', 'C♭', 'D♭', 'E♭', 'F', 'G♭'], 'E♭ 小调'],
    Db: [['D♭', 'E♭', 'F', 'G♭', 'A♭', 'B♭', 'C', 'D♭'], 'B♭ 小调'],
    Ab: [['A♭', 'B♭', 'C', 'D♭', 'E♭', 'F', 'G', 'A♭'], 'F 小调'],
    Eb: [['E♭', 'F', 'G', 'A♭', 'B♭', 'C', 'D', 'E♭'], 'C 小调'],
    Bb: [['B♭', 'C', 'D', 'E♭', 'F', 'G', 'A', 'B♭'], 'G 小调'],
    F: [['F', 'G', 'A', 'B♭', 'C', 'D', 'E', 'F'], 'D 小调'],
    C: [['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'], 'A 小调'],
    G: [['G', 'A', 'B', 'C', 'D', 'E', 'F♯', 'G'], 'E 小调'],
    D: [['D', 'E', 'F♯', 'G', 'A', 'B', 'C♯', 'D'], 'B 小调'],
    A: [['A', 'B', 'C♯', 'D', 'E', 'F♯', 'G♯', 'A'], 'F♯ 小调'],
    E: [['E', 'F♯', 'G♯', 'A', 'B', 'C♯', 'D♯', 'E'], 'C♯ 小调'],
    B: [['B', 'C♯', 'D♯', 'E', 'F♯', 'G♯', 'A♯', 'B'], 'G♯ 小调'],
    'F#': [['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯', 'F♯'], 'D♯ 小调'],
    'C#': [['C♯', 'D♯', 'E♯', 'F♯', 'G♯', 'A♯', 'B♯', 'C♯'], 'A♯ 小调']
  }
  for (const keyId of NATURAL_MAJOR_TOOL_ROOT_IDS) {
    const result = getNaturalMajorToolResult(keyId)
    assert.deepEqual([result.notes.ascending, result.relativeMinorLabel], expected[keyId])
  }
})

let passed = 0
for (const { name, callback } of tests) {
  try {
    callback()
    passed += 1
    process.stdout.write(`PASS ${name}\n`)
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack || error}\n`)
  }
}

process.stdout.write(`\nAndroid Scale & Key Signature Tool: ${passed}/${tests.length} passed\n`)
if (passed !== tests.length) process.exitCode = 1
