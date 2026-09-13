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
const toolSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/intervalQueryTool.ts'), 'utf8')
const stylesSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/styles.css'), 'utf8')
const toolsSource = mainSource.slice(mainSource.indexOf('const THEORY_TOOLS'), mainSource.indexOf('function ChordGroupBadge'))
const screenSource = mainSource.slice(mainSource.indexOf('function IntervalQueryToolScreen'), mainSource.indexOf('function ChordGroupBadge'))
const {
  INTERVAL_QUERY_LETTERS,
  INTERVAL_QUERY_OCTAVES,
  INTERVAL_QUERY_VISIBLE_ACCIDENTALS,
  INTERVAL_QUERY_VISIBLE_PITCHES,
  formatIntervalNumberChinese,
  formatIntervalPitch,
  getEnharmonicIntervalReferences,
  getIntervalDirection,
  getIntervalNumber,
  getIntervalPitchSemitone,
  getIntervalQuality,
  getIntervalQueryResult
} = require('../prototype/android-tablet-v1/src/intervalQueryTool.ts')

const tests = []
const test = (id, title, callback) => tests.push({ id, title, callback })
const p = (letter, accidental, octave) => ({ letter, accidental, octave })
const query = (start, target) => getIntervalQueryResult(start, target)

test('IQ01', 'visible input domain contains 7 letters 3 accidentals and octaves 0 through 8', () => {
  assert.deepEqual(INTERVAL_QUERY_LETTERS, ['C', 'D', 'E', 'F', 'G', 'A', 'B'])
  assert.deepEqual(INTERVAL_QUERY_VISIBLE_ACCIDENTALS.map((item) => [item.value, item.label]), [[-1, '♭'], [0, ''], [1, '♯']])
  assert.deepEqual(INTERVAL_QUERY_VISIBLE_ACCIDENTALS.map((item) => [item.selectorLabel, item.accessibleLabel]), [['♭', '降号'], ['♮', '还原'], ['♯', '升号']])
  assert.deepEqual(INTERVAL_QUERY_OCTAVES, [0, 1, 2, 3, 4, 5, 6, 7, 8])
  assert.equal(INTERVAL_QUERY_VISIBLE_PITCHES.length, 189)
  assert.equal(new Set(INTERVAL_QUERY_VISIBLE_PITCHES.map(formatIntervalPitch)).size, 189)
})

test('IQ02', 'all 35721 ordered pairs resolve deterministically without invalid facts', () => {
  let count = 0
  for (const start of INTERVAL_QUERY_VISIBLE_PITCHES) {
    for (const target of INTERVAL_QUERY_VISIBLE_PITCHES) {
      const first = query(start, target)
      const second = query(start, target)
      assert.deepEqual(first, second)
      assert.ok(Number.isInteger(first.intervalNumber) && first.intervalNumber >= 1)
      assert.ok(Number.isInteger(first.semitoneDistance) && first.semitoneDistance >= 0)
      assert.ok(Number.isFinite(first.intervalNumber))
      assert.ok(Number.isFinite(first.semitoneDistance))
      assert.ok(first.intervalName.length > 2)
      assert.equal(first.enharmonicReferences.filter((item) => item.isCurrent).length, 1)
      assert.equal(first.enharmonicReferences.find((item) => item.isCurrent).intervalName, first.intervalName)
      assert.ok(first.enharmonicReferences.every((item) => item.semitoneDistance === first.semitoneDistance))
      count += 1
    }
  }
  assert.equal(count, 35721)
})

test('IQ03', 'A C4 to G4 is an ascending perfect fifth', () => {
  const result = query(p('C', 0, 4), p('G', 0, 4))
  assert.deepEqual([result.displayName, result.semitoneDistance, result.direction], ['纯五度', 7, 'ascending'])
})

test('IQ04', 'B G4 to C4 is a descending perfect fifth', () => {
  const result = query(p('G', 0, 4), p('C', 0, 4))
  assert.deepEqual([result.displayName, result.semitoneDistance, result.directionLabel], ['下行纯五度', 7, '下行'])
})

test('IQ05', 'C G4 to C5 is an ascending perfect fourth', () => {
  assert.deepEqual([query(p('G', 0, 4), p('C', 0, 5)).displayName, query(p('G', 0, 4), p('C', 0, 5)).semitoneDistance], ['纯四度', 5])
})

test('IQ06', 'D C-sharp4 to E-sharp4 preserves spelling as a major third', () => {
  const result = query(p('C', 1, 4), p('E', 1, 4))
  assert.deepEqual([result.startLabel, result.targetLabel, result.displayName, result.semitoneDistance], ['C♯4', 'E♯4', '大三度', 4])
})

test('IQ07', 'E C4 to C-sharp4 is an augmented unison rather than a minor second', () => {
  assert.deepEqual([query(p('C', 0, 4), p('C', 1, 4)).displayName, query(p('C', 0, 4), p('C', 1, 4)).semitoneDistance], ['增一度', 1])
})

test('IQ08', 'F C4 to D-flat4 is a minor second', () => {
  assert.deepEqual([query(p('C', 0, 4), p('D', -1, 4)).displayName, query(p('C', 0, 4), p('D', -1, 4)).semitoneDistance], ['小二度', 1])
})

test('IQ09', 'G C-sharp4 to D-flat4 is an enharmonic diminished second', () => {
  const result = query(p('C', 1, 4), p('D', -1, 4))
  assert.deepEqual([result.displayName, result.semitoneDistance, result.direction, result.soundingRelationshipLabel], ['减二度', 0, 'same', '等音同高'])
})

test('IQ10', 'H identical C4 pitches are the same written perfect unison', () => {
  const result = query(p('C', 0, 4), p('C', 0, 4))
  assert.deepEqual([result.displayName, result.semitoneDistance, result.soundingRelationshipLabel], ['纯一度', 0, '同音'])
})

test('IQ11', 'I C1 to C7 is a perfect 43rd spanning 72 semitones', () => {
  const result = query(p('C', 0, 1), p('C', 0, 7))
  assert.deepEqual([result.intervalNumber, result.intervalNumberLabel, result.displayName, result.semitoneDistance], [43, '四十三度', '纯四十三度', 72])
})

test('IQ12', 'J C4 to E5 is a major tenth', () => {
  assert.deepEqual([query(p('C', 0, 4), p('E', 0, 5)).displayName, query(p('C', 0, 4), p('E', 0, 5)).semitoneDistance], ['大十度', 16])
})

test('IQ13', 'K neighboring references for C4 to E4 use the same four semitones', () => {
  const refs = query(p('C', 0, 4), p('E', 0, 4)).enharmonicReferences
  assert.deepEqual(refs.map((item) => item.intervalName), ['倍增二度', '大三度', '减四度'])
  assert.deepEqual(refs.map((item) => item.semitoneDistance), [4, 4, 4])
})

test('IQ14', 'perfect-class quality multiplicity follows the frozen generic delta algorithm', () => {
  assert.equal(getIntervalQuality(4, 5), '纯')
  assert.equal(getIntervalQuality(4, 6), '增')
  assert.equal(getIntervalQuality(4, 7), '倍增')
  assert.equal(getIntervalQuality(4, 8), '三倍增')
  assert.equal(getIntervalQuality(5, 6), '减')
  assert.equal(getIntervalQuality(5, 5), '倍减')
})

test('IQ15', 'major-class quality multiplicity follows the frozen generic delta algorithm', () => {
  assert.equal(getIntervalQuality(3, 4), '大')
  assert.equal(getIntervalQuality(3, 3), '小')
  assert.equal(getIntervalQuality(3, 5), '增')
  assert.equal(getIntervalQuality(3, 6), '倍增')
  assert.equal(getIntervalQuality(3, 2), '减')
  assert.equal(getIntervalQuality(3, 1), '倍减')
})

test('IQ16', 'neighboring references use N minus one N and N plus one when valid', () => {
  assert.deepEqual(getEnharmonicIntervalReferences(5, 7).map((item) => [item.intervalNumber, item.intervalName, item.isCurrent]), [
    [4, '倍增四度', false],
    [5, '纯五度', true],
    [6, '减六度', false]
  ])
  assert.deepEqual(getEnharmonicIntervalReferences(1, 0).map((item) => item.intervalNumber), [1, 2])
})

test('IQ17', 'Chinese interval numbering covers the full visible range', () => {
  assert.equal(formatIntervalNumberChinese(1), '一度')
  assert.equal(formatIntervalNumberChinese(10), '十度')
  assert.equal(formatIntervalNumberChinese(21), '二十一度')
  assert.equal(formatIntervalNumberChinese(43), '四十三度')
  assert.equal(formatIntervalNumberChinese(63), '六十三度')
})

test('IQ18', 'direction comes only from sounding pitch while number comes only from written position', () => {
  assert.equal(getIntervalDirection(p('B', 1, 4), p('C', 0, 5)), 'same')
  assert.equal(getIntervalNumber(p('B', 1, 4), p('C', 0, 5)), 2)
  assert.equal(getIntervalPitchSemitone(p('B', 1, 4)), getIntervalPitchSemitone(p('C', 0, 5)))
})

test('IQ19', 'natural signs remain selector-only and are omitted from result pitch labels', () => {
  assert.equal(formatIntervalPitch(p('C', 0, 4)), 'C4')
  assert.equal(formatIntervalPitch(p('F', 1, 4)), 'F♯4')
  assert.equal(formatIntervalPitch(p('B', -1, 3)), 'B♭3')
  assert.doesNotMatch(query(p('C', 0, 4), p('G', 0, 4)).startLabel + query(p('C', 0, 4), p('G', 0, 4)).targetLabel, /♮/)
})

test('IQ20', 'Tools navigation opens and returns from the Interval Query route', () => {
  assert.match(mainSource, /\| 'interval-query-tool'/)
  assert.match(toolsSource, /title: '音程查询'[\s\S]*?screen: 'interval-query-tool'/)
  assert.match(mainSource, /case 'interval-query-tool': return <IntervalQueryToolScreen \/>/)
  assert.match(mainSource, /'interval-query-tool': 'tools'/)
  assert.match(screenSource, /<ProductFrame active="tools" onBack=\{\(\) => navigate\('tools'\)\}/)
})

test('IQ21', 'visible UI has two grouped pitch selectors and approved default C4 to G4', () => {
  assert.equal((screenSource.match(/<IntervalPitchSelector/g) ?? []).length, 2)
  assert.match(screenSource, /label="START"/)
  assert.match(screenSource, /label="TARGET"/)
  assert.match(screenSource, /useState<IntervalQueryLetter>\('C'\)/)
  assert.match(screenSource, /useState<IntervalQueryLetter>\('G'\)/)
  assert.equal((screenSource.match(/useState<IntervalQueryOctave>\(4\)/g) ?? []).length, 2)
  assert.match(mainSource, /aria-label=\{`\$\{label\} 变音记号`\}/)
  assert.match(mainSource, /<option aria-label=\{option\.accessibleLabel\}/)
})

test('IQ22', 'visible UI follows the frozen result hierarchy and exact product copy', () => {
  for (const copy of ['INTERVAL REFERENCE', 'INTERVAL RESULT', '音程查询', '选择起始音与目标音，查看音程名称、方向与等音程参考。', '结果信息', '方向', '度数', '性质', '半音数', 'ENHARMONIC INTERVALS', '等音程参考']) {
    assert.match(screenSource, new RegExp(copy))
  }
  assert.match(screenSource, /result\.displayName/)
  assert.match(screenSource, /result\.enharmonicReferences\.map/)
})

test('IQ23', 'music accidentals reuse the existing structured SVG accidental renderer', () => {
  assert.match(mainSource, /<ChordAccidentalGroup className="interval-query-pitch-token__accidental"/)
  assert.match(stylesSource, /\.interval-query-pitch-token__accidental/)
  assert.doesNotMatch(screenSource, /dangerouslySetInnerHTML|font-family:\s*Bravura/)
})

test('IQ24', 'query remains read-only with no MIDI persistence history or keep-awake path', () => {
  const combined = toolSource + screenSource
  assert.doesNotMatch(combined, /Midi|MIDI|Bluetooth|Preferences|Repository|Persistence|History|PracticeReport|Runtime|subscribe\(|handleMidi|setTimeout|setInterval|Math\.random|keepAwake/i)
})

test('IQ25', 'query UI contains no keyboard staff playback or practice affordance', () => {
  assert.doesNotMatch(screenSource, /VirtualPianoKeyboard|MusicStaffRenderer|播放|试听|开始练习|保存|收藏|最近查询|推荐|自动分析/)
})

test('IQ26', 'one full-width answer card and one compact reference card avoid desktop empty-canvas layout', () => {
  assert.match(screenSource, /interval-query-card interval-query-answer/)
  assert.match(screenSource, /interval-query-card interval-query-references/)
  assert.match(stylesSource, /\.interval-query-layout[\s\S]*?grid-template-rows:/)
  assert.doesNotMatch(stylesSource, /\.interval-query-layout[\s\S]{0,300}grid-template-columns:/)
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

console.log(`\nAndroid Interval Query Tool: ${tests.length - failed}/${tests.length} passed`)
if (failed > 0) process.exitCode = 1
