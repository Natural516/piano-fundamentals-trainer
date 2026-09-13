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
const mainSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/main.tsx'), 'utf8')
const toolSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/chordQueryTool.ts'), 'utf8')
const stylesSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/styles.css'), 'utf8')
const screenSource = mainSource.slice(mainSource.indexOf('function ChordQueryToolScreen'), mainSource.indexOf('function ScaleKeySignatureToolScreen'))
const toolsSource = mainSource.slice(mainSource.indexOf('const THEORY_TOOLS'), mainSource.indexOf('function ChordGroupBadge'))
const {
  CHORD_QUERY_INPUT_ACCIDENTALS,
  CHORD_QUERY_KEYBOARD_RANGE,
  CHORD_QUERY_NOTE_LETTERS,
  CHORD_QUERY_TYPES,
  CHORD_QUERY_TYPE_GROUPS,
  CHORD_QUERY_WRITTEN_ROOTS,
  formatChordQueryAccidental,
  getChordQueryPitchClass,
  getChordQueryResult
} = require('../prototype/android-tablet-v1/src/chordQueryTool.ts')

const naturalPitchClasses = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor
const tests = []
const test = (id, title, callback) => tests.push({ id, title, callback })

test('CQ01', 'catalog contains exactly the approved 29 chord types', () => {
  assert.equal(CHORD_QUERY_TYPES.length, 29)
  assert.deepEqual(CHORD_QUERY_TYPES.map((item) => item.id), [
    'major', 'minor', 'diminished', 'augmented',
    'dominant7', 'minor7', 'major7', 'diminished7', 'halfDiminished7',
    'sus4', 'sus2', 'dominant7Sus4',
    'six', 'minorSix', 'add9', 'sixNine',
    'dominant9', 'minor9', 'major9',
    'dominant11', 'minor11', 'major11',
    'dominant13', 'minor13', 'major13',
    'dominantFlat5', 'dominantFlat9', 'dominantSharp9', 'power5'
  ])
})

test('CQ02', 'separate letter and accidental inputs produce exactly 21 written roots', () => {
  assert.deepEqual(CHORD_QUERY_NOTE_LETTERS, ['C', 'D', 'E', 'F', 'G', 'A', 'B'])
  assert.deepEqual(CHORD_QUERY_INPUT_ACCIDENTALS.map((item) => [item.value, item.label]), [[-1, '♭'], [0, '♮'], [1, '♯']])
  assert.equal(CHORD_QUERY_WRITTEN_ROOTS.length, 21)
  assert.equal(new Set(CHORD_QUERY_WRITTEN_ROOTS.map((item) => `${item.letter}:${item.accidental}`)).size, 21)
})

test('CQ03', 'all 609 written-root and chord-type combinations resolve', () => {
  const results = CHORD_QUERY_WRITTEN_ROOTS.flatMap((writtenRoot) =>
    CHORD_QUERY_TYPES.map((definition) => getChordQueryResult(writtenRoot, definition.id))
  )
  assert.equal(results.length, 609)
})

test('CQ04', 'every output preserves the required diatonic degree letter', () => {
  for (const writtenRoot of CHORD_QUERY_WRITTEN_ROOTS) {
    const rootIndex = CHORD_QUERY_NOTE_LETTERS.indexOf(writtenRoot.letter)
    for (const definition of CHORD_QUERY_TYPES) {
      const result = getChordQueryResult(writtenRoot, definition.id)
      result.pitches.forEach((pitch, index) => {
        const expectedLetter = CHORD_QUERY_NOTE_LETTERS[(rootIndex + definition.tones[index].degree - 1) % 7]
        assert.equal(pitch.letter, expectedLetter, `${result.symbol} ${pitch.degreeLabel}`)
      })
    }
  }
})

test('CQ05', 'every written pitch matches its required semitone target', () => {
  for (const writtenRoot of CHORD_QUERY_WRITTEN_ROOTS) {
    const rootPitchClass = getChordQueryPitchClass(writtenRoot)
    for (const definition of CHORD_QUERY_TYPES) {
      const result = getChordQueryResult(writtenRoot, definition.id)
      result.pitches.forEach((pitch) => {
        const writtenPitchClass = mod(naturalPitchClasses[pitch.letter] + pitch.accidentalOffset, 12)
        assert.equal(writtenPitchClass, mod(rootPitchClass + pitch.semitones, 12), `${result.symbol} ${pitch.label}`)
      })
    }
  }
})

test('CQ06', 'no supported query combination throws', () => {
  for (const writtenRoot of CHORD_QUERY_WRITTEN_ROOTS) {
    for (const definition of CHORD_QUERY_TYPES) {
      assert.doesNotThrow(() => getChordQueryResult(writtenRoot, definition.id))
    }
  }
})

test('CQ07', 'representative theoretical spellings are exact', () => {
  const result = (letter, accidental, typeId) => getChordQueryResult({ letter, accidental }, typeId)
  assert.deepEqual(result('C', 0, 'major').pitches.map((item) => item.label), ['C', 'E', 'G'])
  assert.deepEqual(result('F', 1, 'minor9').pitches.map((item) => item.label), ['F♯', 'A', 'C♯', 'E', 'G♯'])
  assert.deepEqual(result('C', 1, 'major7').pitches.map((item) => item.label), ['C♯', 'E♯', 'G♯', 'B♯'])
  assert.deepEqual(result('C', -1, 'major').pitches.map((item) => item.label), ['C♭', 'E♭', 'G♭'])
  assert.deepEqual(result('C', 0, 'diminished7').pitches.map((item) => item.label), ['C', 'E♭', 'G♭', 'B𝄫'])
  assert.deepEqual(result('G', 0, 'dominantFlat9').pitches.map((item) => item.label), ['G', 'B', 'D', 'F', 'A♭'])
})

test('CQ08', 'double and triple accidental output remains supported', () => {
  assert.equal(formatChordQueryAccidental(-2), '𝄫')
  assert.equal(formatChordQueryAccidental(2), '𝄪')
  assert.equal(formatChordQueryAccidental(-3), '𝄫♭')
  assert.equal(formatChordQueryAccidental(3), '𝄪♯')
  assert.ok(getChordQueryResult({ letter: 'C', accidental: -1 }, 'diminished7').pitches.some((item) => item.label === 'B𝄫♭'))
  assert.ok(getChordQueryResult({ letter: 'B', accidental: 1 }, 'dominantSharp9').pitches.some((item) => item.label === 'C𝄪♯'))
})

test('CQ09', 'natural roots omit the natural sign from displayed chord symbols', () => {
  for (const letter of CHORD_QUERY_NOTE_LETTERS) {
    const symbol = getChordQueryResult({ letter, accidental: 0 }, 'major').symbol
    assert.equal(symbol, letter)
    assert.doesNotMatch(symbol, /♮/)
  }
})

test('CQ10', 'user-facing symbols use Unicode accidentals rather than ASCII', () => {
  assert.equal(getChordQueryResult({ letter: 'F', accidental: 1 }, 'minor7').symbol, 'F♯m7')
  assert.equal(getChordQueryResult({ letter: 'E', accidental: -1 }, 'major9').symbol, 'E♭maj9')
  for (const writtenRoot of CHORD_QUERY_WRITTEN_ROOTS) {
    for (const definition of CHORD_QUERY_TYPES) {
      const result = getChordQueryResult(writtenRoot, definition.id)
      assert.doesNotMatch([result.symbol, ...result.pitches.map((item) => item.label)].join('|'), /[A-G][#b]/)
    }
  }
})

test('CQ11', 'theoretical note tokens use dedicated atomic structured markup', () => {
  assert.match(mainSource, /function ChordTheoreticalNoteToken/)
  assert.match(screenSource, /<ChordTheoreticalNoteToken accidental=\{pitch\.accidental\} label=\{pitch\.label\} letter=\{pitch\.letter\}/)
  assert.match(stylesSource, /\.chord-query-note-item[\s\S]*?white-space: nowrap;/)
  assert.match(stylesSource, /\.chord-theoretical-note-token[\s\S]*?white-space: nowrap;/)
  assert.match(stylesSource, /\.chord-accidental-group[\s\S]*?flex: 0 0 auto;[\s\S]*?white-space: nowrap;/)
  assert.match(stylesSource, /\.chord-accidental-glyph \+ \.chord-accidental-glyph[\s\S]*?margin-left: -\.09em;/)
})

test('CQ12', 'query theory and screen add no practice side effects', () => {
  assert.doesNotMatch(toolSource, /from ['"][^'"]*(midi|runtime|repository|persistence|history|practice|keepAwake)/i)
  assert.doesNotMatch(toolSource, /subscribe\(|handleMidi|PracticeSession|keepPracticeAwake|\.save\(|localStorage|Preferences|setTimeout|setInterval|Math\.random/)
  assert.doesNotMatch(screenSource, /subscribe\(|handleMidi|PracticeSession|keepPracticeAwake|\.save\(|History|Report|Stats/)
})

test('CQ13', 'deferred pure keyboard realization remains available without visible UI coupling', () => {
  assert.deepEqual(CHORD_QUERY_KEYBOARD_RANGE, [48, 83])
  assert.equal(CHORD_QUERY_KEYBOARD_RANGE[1] - CHORD_QUERY_KEYBOARD_RANGE[0] + 1, 36)
  assert.doesNotMatch(screenSource, /VirtualPianoKeyboard|result\.keyboard|targetNotes|range=\{\[48, 83\]\}/)
})

test('CQ14', 'virtual piano is completely absent from visible Chord Query UI', () => {
  assert.doesNotMatch(screenSource, /键盘构成示意|PIANO MAP|VirtualPianoKeyboard|keyboard-frame|keyboard-card|coming soon|即将推出|占位/)
  assert.doesNotMatch(stylesSource, /\.chord-query-keyboard-(?:frame|card)/)
})

test('CQ15', 'only one concrete realization key is emitted per chord member', () => {
  for (const writtenRoot of CHORD_QUERY_WRITTEN_ROOTS) {
    for (const definition of CHORD_QUERY_TYPES) {
      const result = getChordQueryResult(writtenRoot, definition.id)
      assert.equal(result.keyboard.midiNumbers.length, definition.tones.length)
      assert.equal(new Set(result.keyboard.midiNumbers).size, definition.tones.length)
    }
  }
})

test('CQ16', 'query screen has no visible keyboard highlighting policy', () => {
  assert.doesNotMatch(screenSource, /targetNotes|pressedNotes|is-target/)
  assert.doesNotMatch(screenSource, /pitchClass|% 12|filter\([^)]*noteName/)
})

test('CQ17', 'enharmonic C-flat text maps to the correct physical keys', () => {
  const result = getChordQueryResult({ letter: 'C', accidental: -1 }, 'major')
  assert.deepEqual(result.pitches.map((item) => item.label), ['C♭', 'E♭', 'G♭'])
  assert.deepEqual(result.keyboard.midiNumbers, [59, 63, 66])
})

test('CQ18', 'all 609 keyboard realizations fit inside C3 through B5', () => {
  for (const writtenRoot of CHORD_QUERY_WRITTEN_ROOTS) {
    for (const definition of CHORD_QUERY_TYPES) {
      const result = getChordQueryResult(writtenRoot, definition.id)
      assert.ok(result.keyboard.midiNumbers.every((midi) => midi >= 48 && midi <= 83), result.symbol)
    }
  }
})

test('CQ19', 'C13 uses the specified ascending concrete realization', () => {
  assert.deepEqual(getChordQueryResult({ letter: 'C', accidental: 0 }, 'dominant13').keyboard.midiNumbers, [48, 52, 55, 58, 62, 65, 69])
})

test('CQ20', 'B13 uses the specified ascending concrete realization', () => {
  assert.deepEqual(getChordQueryResult({ letter: 'B', accidental: 0 }, 'dominant13').keyboard.midiNumbers, [59, 63, 66, 69, 73, 76, 80])
})

test('CQ21', 'Tools navigation opens the dedicated Chord Query screen and returns to Tools', () => {
  assert.match(mainSource, /\| 'chord-query-tool'/)
  assert.match(toolsSource, /title: '和弦查询'[\s\S]*?screen: 'chord-query-tool'/)
  assert.match(mainSource, /case 'chord-query-tool': return <ChordQueryToolScreen \/>/)
  assert.match(mainSource, /'chord-query-tool': 'tools'/)
  assert.match(screenSource, /<ProductFrame active="tools" onBack=\{\(\) => navigate\('tools'\)\}/)
})

test('CQ22', 'one grouped selector contains the nine approved non-selectable categories', () => {
  assert.equal(CHORD_QUERY_TYPE_GROUPS.length, 9)
  assert.deepEqual(CHORD_QUERY_TYPE_GROUPS.map((group) => group.label), [
    '基础三和弦', '七和弦', '挂留和弦', '六和弦 / 加音', '九和弦', '十一和弦', '十三和弦', '变化属和弦', '其他'
  ])
  assert.match(screenSource, /<optgroup key=\{group\.id\} label=\{group\.label\}>/)
  assert.equal((screenSource.match(/<select/g) ?? []).length, 3)
})

test('CQ23', 'visible result contains only symbol Chinese name and theoretical notes', () => {
  for (const label of ['CHORD SYMBOL', '理论构成音']) assert.match(screenSource, new RegExp(label))
  assert.doesNotMatch(screenSource, /键盘构成示意|PIANO MAP|MusicStaffRenderer|formula|公式|指法|转位|播放|收藏|最近查询|推荐|伴奏|History|MIDI/)
})

test('CQ24', 'one full-width result card remains after virtual piano deferral', () => {
  assert.match(screenSource, /chord-query-card chord-query-answer/)
  assert.equal((screenSource.match(/<article/g) ?? []).length, 1)
  assert.doesNotMatch(screenSource, /chord-query-keyboard-card/)
  assert.match(stylesSource, /\.chord-query-layout[\s\S]*?grid-template-rows:/)
  assert.doesNotMatch(stylesSource, /\.chord-query-layout[\s\S]{0,300}grid-template-columns:/)
})

test('CQ25', 'chord symbols use one structured nowrap root accidental suffix unit', () => {
  const suffixStyle = stylesSource.match(/\.chord-symbol__suffix\s*\{([^}]*)\}/)?.[1] ?? ''
  assert.match(mainSource, /function ChordSymbol/)
  assert.match(mainSource, /className="chord-symbol"/)
  assert.match(mainSource, /className="chord-symbol__letter"/)
  assert.match(mainSource, /className="chord-symbol__accidental"/)
  assert.match(mainSource, /className="chord-symbol__suffix"/)
  assert.match(stylesSource, /\.chord-symbol \{[\s\S]*?display: inline-flex;[\s\S]*?white-space: nowrap;/)
  assert.match(stylesSource, /\.chord-symbol__accidental[\s\S]*?align-self: center;[\s\S]*?margin-left: -\.075em;/)
  assert.equal((stylesSource.match(/\.chord-symbol__suffix\s*\{/g) ?? []).length, 1)
  assert.match(suffixStyle, /display: inline-block;/)
  assert.match(suffixStyle, /align-self: baseline;/)
  assert.match(suffixStyle, /transform: translateY\(-[^)]+\);/)
  assert.doesNotMatch(suffixStyle, /vertical-align:\s*(?:sub|super)|position:\s*absolute/)
})

test('CQ26', 'Chord Query leaves Scale and Interval Query sibling tools implemented', () => {
  assert.match(toolsSource, /title: '音阶与调号'[\s\S]*?screen: 'scale-key-signature-tool'/)
  assert.match(toolsSource, /title: '音程查询'[\s\S]*?screen: 'interval-query-tool'/)
})

test('CQ27', 'representative chord symbols are supplied to the structured renderer without natural signs', () => {
  assert.match(screenSource, /<ChordSymbol[\s\S]*?accidental=\{result\.rootLabel\.slice\(1\)\}[\s\S]*?suffix=\{result\.type\.suffix\}/)
  assert.equal(getChordQueryResult({ letter: 'C', accidental: 0 }, 'dominant13').symbol, 'C13')
  assert.equal(getChordQueryResult({ letter: 'F', accidental: 1 }, 'minor9').symbol, 'F♯m9')
  assert.equal(getChordQueryResult({ letter: 'C', accidental: -1 }, 'diminished7').symbol, 'C♭dim7')
  assert.equal(getChordQueryResult({ letter: 'B', accidental: 1 }, 'augmented').symbol, 'B♯aug')
  assert.equal(getChordQueryResult({ letter: 'G', accidental: 0 }, 'dominantFlat9').symbol, 'G7(♭9)')
})

test('CQ28', 'music accidentals use reusable fixed SVG glyph boxes instead of prose font metrics', () => {
  assert.match(mainSource, /type ChordAccidentalGlyphName = 'natural' \| 'flat' \| 'sharp' \| 'double-flat' \| 'double-sharp'/)
  assert.match(mainSource, /function ChordAccidentalGlyph/)
  for (const accidental of ['flat', 'sharp', 'natural', 'double-flat', 'double-sharp']) {
    assert.match(mainSource, new RegExp(`data-accidental="${accidental}"`))
  }
  assert.match(stylesSource, /\.chord-accidental-glyph[\s\S]*?width: \.46em;[\s\S]*?height: 1em;/)
  assert.doesNotMatch(mainSource, /<span className="chord-accidental-glyph"[^>]*>\{glyph\}<\/span>/)
})

test('CQ29', 'double and triple accidentals remain atomic controlled visual groups', () => {
  assert.match(mainSource, /data-accidental-group=\{value\}/)
  assert.deepEqual(Array.from('𝄫♭'), ['𝄫', '♭'])
  assert.deepEqual(Array.from('𝄪♯'), ['𝄪', '♯'])
  assert.match(stylesSource, /\.chord-accidental-glyph\[data-accidental='double-flat'\][\s\S]*?width: \.66em;/)
  assert.match(stylesSource, /\.chord-accidental-glyph\[data-accidental='double-sharp'\][\s\S]*?width: \.58em;/)
  assert.match(stylesSource, /\.chord-accidental-glyph \+ \.chord-accidental-glyph[\s\S]*?margin-left: -\.09em;/)
  assert.equal(getChordQueryResult({ letter: 'C', accidental: -1 }, 'diminished7').pitches.at(-1).accidental, '𝄫♭')
  assert.equal(getChordQueryResult({ letter: 'B', accidental: 1 }, 'augmented').pitches.at(-1).accidental, '𝄪♯')
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

console.log(`\nAndroid Chord Query Tool: ${tests.length - failed}/${tests.length} passed`)
if (failed > 0) process.exitCode = 1
