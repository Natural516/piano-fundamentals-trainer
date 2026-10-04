const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const React = require('react')
const { act } = require('react-test-renderer')
const { mounted, ui, current, declarations, read, text, contains, businessBytes, translator } = require('./android-localization-shell-check.cjs')
const { createLocalizationInstance } = require('../prototype/android-tablet-v1/src/localization/localizationService.ts')
const { localizationResources } = require('../prototype/android-tablet-v1/src/localization/resources.ts')
const { APP_PREFERENCES_KEY } = require('../prototype/android-tablet-v1/src/localization/appPreferences.ts')
const chord = require('../prototype/android-tablet-v1/src/chordQueryTool.ts')
const interval = require('../prototype/android-tablet-v1/src/intervalQueryTool.ts')
const scale = require('../prototype/android-tablet-v1/src/scaleKeySignatureTool.ts')
const keys = require('../src/sightReading/musicKeySignatures.ts')
const { presentChordTypeOption, presentIntervalName, presentIntervalQuery, describeIntervalQuality } = require('../prototype/android-tablet-v1/src/localization/theoryQueryPresentation.ts')
const root = require('node:path').resolve(__dirname, '..')
const base = 'ddba01c96db6dd5b4fba4736a34392e10e6fe8c5'
const tests = []
const test = (id, title, run) => tests.push({ id, title, run })
const zh = translator('zh-CN', 'theoryQuery'), en = translator('en', 'theoryQuery')
const p = (letter, accidental = 0, octave = 4) => ({ letter, accidental, octave })
const selections = h => h.renderer.root.findAllByType('select').map(node => node.props.value)
const select = async (h, index, value) => act(async () => h.renderer.root.findAllByType('select')[index].props.onChange({ target: { value: String(value) } }))
const queryFns = [[chord, 'getChordQueryResult'], [interval, 'getIntervalQueryResult'], [scale, 'getNaturalMajorToolResult']]
async function queryPage(page, run, options) {
  const results = [], originals = queryFns.map(([api, name]) => api[name])
  for (const [index, [api, name]] of queryFns.entries()) api[name] = (...args) => {
    const result = originals[index](...args)
    results.push({ name, args, result })
    return result
  }
  try { await mounted(page, h => run({ ...h, results, latest: () => results.at(-1).result }), options) }
  finally { queryFns.forEach(([api, name], index) => { api[name] = originals[index] }) }
}
async function roundTrip(h) {
  const before = { selection: selections(h), result: h.latest(), bytes: JSON.stringify(h.latest()), calls: h.results.length,
    route: global.window.location.hash, business: businessBytes(h.backend), writes: h.backend.writes.length,
    native: [...h.plugin.calls], listeners: [...h.plugin.listeners], generation: JSON.stringify(h.runtime.bluetoothSnapshot),
    session: JSON.stringify(h.runtime.snapshot), theme: h.themeManager.snapshot, provider: h.runtime.midiInput }
  for (const locale of ['en', 'zh-CN']) {
    await h.switchTo(locale)
    assert.deepEqual(selections(h), before.selection)
    assert.equal(h.latest(), before.result)
    assert.equal(JSON.stringify(h.latest()), before.bytes)
    assert.equal(h.results.length, before.calls, 'locale change must not execute any query')
    assert.equal(global.window.location.hash, before.route)
    assert.deepEqual(businessBytes(h.backend), before.business)
    assert.ok(h.backend.writes.slice(before.writes).every(write => write.key === APP_PREFERENCES_KEY))
    assert.deepEqual(h.plugin.calls, before.native); assert.deepEqual([...h.plugin.listeners], before.listeners)
    assert.equal(JSON.stringify(h.runtime.bluetoothSnapshot), before.generation)
    assert.equal(JSON.stringify(h.runtime.snapshot), before.session); assert.equal(h.runtime.midiInput, before.provider)
    assert.equal(h.themeManager.snapshot, before.theme); assert.deepEqual(h.pointerCalls, [])
    assert.deepEqual(h.lifecycle(), { mounts: 1, unmounts: 0 })
  }
}

test('CQ1', 'actual Chinese Chord Query labels/selectors/result/accessibility', async () => queryPage('chord-query-tool', async h => {
  for (const copy of ['和弦查询', '音名', '变音记号', '和弦类型', '大三和弦', '理论构成音']) contains(h.getText(), copy)
  assert.deepEqual(selections(h), ['C', 0, 'major'])
  assert.equal(h.renderer.root.findByProps({ className: 'chord-query-selectors' }).props['aria-label'], '和弦查询条件')
}))
test('CQ2', 'actual English Chord Query resolves all 29 options and nine optgroups explicitly', async () => queryPage('chord-query-tool', async h => {
  await h.switchTo('en')
  for (const copy of ['Chord Query', 'Note name', 'Accidental', 'Chord type', 'Major triad', 'Chord tones']) contains(h.getText(), copy)
  assert.doesNotMatch(h.getText(), /[\u3400-\u9fff]/)
  assert.equal(h.renderer.root.findAllByType('optgroup').length, 9)
  assert.equal(h.renderer.root.findAllByType('select')[2].findAllByType('option').length, 29)
  for (const option of h.renderer.root.findAllByType('select')[2].findAllByType('option')) assert.equal(text(option), presentChordTypeOption(chord.getChordQueryType(option.props.value), en))
  assert.equal(h.renderer.root.findByProps({ className: 'chord-query-selectors' }).props['aria-label'], 'Chord query conditions')
}))
test('CQ3', '29 stable IDs/type order/tones/suffixes and 609 combinations remain unchanged', () => {
  assert.equal(chord.CHORD_QUERY_TYPES.length, 29)
  assert.deepEqual(Object.keys(localizationResources.en.theoryQuery.chord.types), chord.CHORD_QUERY_TYPES.map(type => type.id))
  for (const type of chord.CHORD_QUERY_TYPES) {
    assert.equal(zh('chord.types.' + type.id), type.chineseName)
    assert.equal(presentChordTypeOption(type, zh), type.selectorLabel)
  }
  const results = chord.CHORD_QUERY_WRITTEN_ROOTS.flatMap(root => chord.CHORD_QUERY_TYPES.map(type => chord.getChordQueryResult(root, type.id)))
  assert.equal(results.length, 609)
  for (const result of results) {
    const before = JSON.stringify(result)
    for (const t of [zh, en]) {
      assert.ok(presentChordTypeOption(result.type, t))
      assert.equal(JSON.stringify(result), before)
      assert.equal(result.symbol, result.rootLabel + result.type.suffix)
    }
  }
})
test('CQ4', 'locale round trip leaves selected altered chord symbol and suffix exact', async () => queryPage('chord-query-tool', async h => {
  await select(h, 0, 'G'); await select(h, 2, 'dominantFlat9')
  assert.equal(h.latest().symbol, 'G7(♭9)')
  await roundTrip(h)
  assert.equal(h.renderer.root.findByType(ui.ChordSymbol).props.suffix, '7(♭9)')
  assert.equal(h.renderer.root.findByType(ui.ChordSymbol).props.label, 'G7(♭9)')
}))
test('CQ5', 'double/triple accidental theoretical spelling remains atomic after live locale switch', async () => queryPage('chord-query-tool', async h => {
  await select(h, 1, -1); await select(h, 2, 'diminished7')
  assert.deepEqual(h.latest().pitches.map(pitch => pitch.label), ['C♭', 'E𝄫', 'G𝄫', 'B𝄫♭'])
  const before = h.renderer.root.findAllByType(ui.ChordTheoreticalNoteToken).map(node => node.props.label)
  await roundTrip(h)
  assert.deepEqual(h.renderer.root.findAllByType(ui.ChordTheoreticalNoteToken).map(node => node.props.label), before)
}))
test('CQ6', 'every chord type can be selected by stable ID and survives locale switch', async () => queryPage('chord-query-tool', async h => {
  for (const type of chord.CHORD_QUERY_TYPES) {
    await select(h, 2, type.id)
    await h.switchTo('en')
    assert.equal(selections(h)[2], type.id); assert.equal(h.latest().type.id, type.id)
    contains(h.getText(), en('chord.types.' + type.id))
    await h.switchTo('zh-CN')
  }
}))
test('CQ7', 'Chord language switches do not navigate/write History/settings or rebuild MIDI', async () => queryPage('chord-query-tool', roundTrip))
test('CQ8', 'localized type strings are display only and never query lookup identities', () => {
  const source = current.get('ChordQueryToolScreen')
  assert.match(source, /getChordQueryResult\(root, chordType\)/)
  assert.match(source, /value=\{option.id\}/)
  assert.doesNotMatch(source, /selectorLabel|chineseName|chineseLabel|setChordType\(t\(|getChordQueryResult\([^,]+,\s*t\(/)
})

test('IQ1', 'actual Chinese Interval Query retains approved result and labels', async () => queryPage('interval-query-tool', async h => {
  for (const copy of ['音程查询', '起始音', '目标音', '纯五度', '方向', '度数', '性质', '半音数', '等音程参考']) contains(h.getText(), copy)
  assert.deepEqual(selections(h), ['C', 0, 4, 'G', 0, 4])
}))
test('IQ2', 'actual English Interval Query and accessible accidental options resolve', async () => queryPage('interval-query-tool', async h => {
  await h.switchTo('en')
  for (const copy of ['Interval Query', 'Starting note', 'Target note', 'Perfect fifth', 'Ascending', 'Degree', 'Quality', 'Semitones', 'Enharmonic interval references']) contains(h.getText(), copy)
  assert.doesNotMatch(h.getText(), /[\u3400-\u9fff]/)
  const accidentals = h.renderer.root.findAllByType('select')[1].findAllByType('option')
  assert.deepEqual(accidentals.map(node => node.props['aria-label']), ['Flat', 'Natural', 'Sharp'])
  assert.deepEqual(accidentals.map(text), ['♭', '♮', '♯'])
}))
test('IQ3', 'display descriptors come from numeric facts even if every old Chinese field is changed', () => {
  const fact = interval.getIntervalQueryResult(p('C'), p('E'))
  const altered = { ...fact, quality: 'not an identity', intervalName: 'not a name', intervalNumberLabel: 'not a degree', directionLabel: 'not direction', displayName: 'not a result' }
  assert.deepEqual(presentIntervalQuery(altered, en, 'en'), presentIntervalQuery(fact, en, 'en'))
  assert.deepEqual(describeIntervalQuality(3, 4), { quality: 'major', multiplicity: 0 })
})
test('IQ4', 'all 35721 ordered written pairs retain number/semitone/direction and Chinese legacy display', () => {
  let count = 0
  for (const start of interval.INTERVAL_QUERY_VISIBLE_PITCHES) for (const target of interval.INTERVAL_QUERY_VISIBLE_PITCHES) {
    const result = interval.getIntervalQueryResult(start, target), before = JSON.stringify(result)
    assert.equal(presentIntervalQuery(result, zh, 'zh-CN').displayName, result.displayName)
    for (const reference of result.enharmonicReferences) assert.equal(presentIntervalName(reference.intervalNumber, reference.semitoneDistance, zh, 'zh-CN').name, reference.intervalName)
    const display = presentIntervalQuery(result, en, 'en')
    assert.equal(display.direction, en('interval.directions.' + result.direction))
    assert.doesNotMatch(display.displayName, /[\u3400-\u9fff]/)
    assert.equal(JSON.stringify(result), before); count++
  }
  assert.equal(count, 35721)
})
test('IQ5', 'same sounding pitch never merges distinct written names/theoretical identities', async () => queryPage('interval-query-tool', async h => {
  await select(h, 1, 1); await select(h, 3, 'D'); await select(h, 4, -1)
  assert.equal(h.latest().soundingRelationship, 'enharmonic')
  assert.deepEqual([h.latest().startLabel, h.latest().targetLabel, h.latest().intervalNumber, h.latest().semitoneDistance], ['C♯4', 'D♭4', 2, 0])
  await h.switchTo('en'); contains(h.getText(), 'Diminished second'); contains(h.getText(), 'Enharmonic pitches'); contains(h.getText(), 'Same pitch')
  await roundTrip(h)
}))
test('IQ6', 'compound interval names and ordinal suffixes are generated beyond the 26 Practice names', () => {
  assert.equal(presentIntervalName(10, 16, en, 'en').name, 'Major tenth')
  assert.equal(presentIntervalName(43, 72, en, 'en').name, 'Perfect 43rd')
  assert.equal(presentIntervalName(63, 107, en, 'en').name, 'Major 63rd')
  for (const [degree, expected] of [[21, '21st'], [22, '22nd'], [23, '23rd'], [31, '31st'], [32, '32nd'], [33, '33rd'], [41, '41st']]) assert.equal(presentIntervalName(degree, 100, en, 'en').degree, expected)
})
test('IQ7', 'doubly/triply/higher augmented and diminished cases retain exact multiplicity', () => {
  assert.equal(presentIntervalName(4, 7, en, 'en').name, 'Doubly augmented fourth')
  assert.equal(presentIntervalName(5, 5, en, 'en').name, 'Doubly diminished fifth')
  assert.equal(presentIntervalName(4, 8, en, 'en').name, 'Triply augmented fourth')
  assert.equal(presentIntervalName(4, 9, en, 'en').name, '4-times augmented fourth')
  assert.equal(presentIntervalName(8, 0, en, 'en').name, '12-times diminished octave')
  for (let degree = 1; degree <= 64; degree++) for (let semitones = 0; semitones <= 110; semitones++) {
    assert.equal(presentIntervalName(degree, semitones, zh, 'zh-CN').quality, interval.getIntervalQuality(degree, semitones))
  }
})
test('IQ8', 'live descending compound query stays memoized and selection/result facts immutable', async () => queryPage('interval-query-tool', async h => {
  await select(h, 2, 5); await select(h, 3, 'C')
  await h.switchTo('en'); contains(h.getText(), 'Descending Perfect octave')
  await roundTrip(h)
}))
test('IQ9', 'B3 catalog 26 IDs and complete 1575 candidate digest remain frozen', () => {
  const { INTERVAL_TYPE_CATALOG } = require('../prototype/android-tablet-v1/src/musicTheory/intervals/catalog.ts')
  const { INTERVAL_PRACTICE_CANDIDATES } = require('../prototype/android-tablet-v1/src/musicTheory/intervals/candidates.ts')
  assert.equal(Object.keys(INTERVAL_TYPE_CATALOG).length, 26)
  const candidates = Object.values(INTERVAL_PRACTICE_CANDIDATES).flat()
  assert.equal(candidates.length, 1575)
  assert.equal(createHash('sha256').update(JSON.stringify(candidates)).digest('hex'), 'c643be252f5ea57519490033662008b4716bd1f98df0266d3357e3be171f460e')
  execFileSync('git', ['diff', '--exit-code', base, '--', 'prototype/android-tablet-v1/src/musicTheory/intervals'], { cwd: root })
})

test('K1', 'actual Chinese Scale Query keeps Major/relative minor labels and notes', async () => queryPage('scale-key-signature-tool', async h => {
  for (const copy of ['音阶与调号', '主音', '音阶类型', '自然大调', '音阶构成', '关系调', '相对小调', '调号']) contains(h.getText(), copy)
  assert.deepEqual(selections(h), ['C', 'naturalMajor'])
}))
test('K2', 'actual English Scale Query uses Major scale not Natural major scale', async () => queryPage('scale-key-signature-tool', async h => {
  await h.switchTo('en')
  for (const copy of ['Scale & Key Signature', 'Tonic', 'Scale type', 'Major scale', 'Scale notes', 'Relative minor', 'Key signature']) contains(h.getText(), copy)
  assert.doesNotMatch(h.getText(), /Natural major|[\u3400-\u9fff]/)
  assert.equal(h.renderer.root.findAllByType('select')[1].findAllByType('option').length, 1)
}))
test('K3', 'all 15 MajorKeyIds remain exact option values and order', async () => queryPage('scale-key-signature-tool', async h => {
  const values = () => h.renderer.root.findAllByType('select')[0].findAllByType('option').map(node => node.props.value)
  assert.deepEqual(values(), scale.NATURAL_MAJOR_TOOL_ROOT_IDS)
  await h.switchTo('en'); assert.deepEqual(values(), scale.NATURAL_MAJOR_TOOL_ROOT_IDS)
}))
test('K4', 'key signature count/type/order and grand staff input are preserved for all keys', async () => queryPage('scale-key-signature-tool', async h => {
  for (const id of scale.NATURAL_MAJOR_TOOL_ROOT_IDS) {
    await select(h, 0, id)
    const before = JSON.stringify(keys.getMajorKeySignature(id))
    await h.switchTo('en')
    assert.equal(JSON.stringify(keys.getMajorKeySignature(id)), before)
    const staff = h.renderer.root.find(node => typeof node.type === 'function' && node.type.name === 'MusicStaffRenderer')
    assert.equal(staff.props.keySignature, id); assert.equal(staff.props.staffMode, 'grand'); assert.deepEqual(staff.props.notes, [])
    assert.ok(staff.props.ariaLabel.includes(h.latest().tonicLabel))
    await h.switchTo('zh-CN')
  }
}))
test('K5', 'all scale pitch spelling survives locale round trip without enharmonic substitution', async () => queryPage('scale-key-signature-tool', async h => {
  for (const id of scale.NATURAL_MAJOR_TOOL_ROOT_IDS) {
    await select(h, 0, id)
    const before = h.latest().notes.ascending
    await h.switchTo('en')
    const tokens = h.renderer.root.findByProps({ className: 'scale-tool-note-sequence' }).findAllByType(ui.ScaleNoteToken).map(node => node.props.value)
    assert.deepEqual(tokens, before); assert.equal(h.latest().keySignatureId, id)
    await h.switchTo('zh-CN')
  }
}))
test('K6', 'existing relative-minor tonic keeps sixth scale degree and original facts', async () => queryPage('scale-key-signature-tool', async h => {
  await select(h, 0, 'F#')
  assert.equal(h.latest().relativeMinorTonicLabel, 'D♯')
  await roundTrip(h)
  assert.equal(h.latest().relativeMinorLabel, 'D♯ 小调')
}))
test('K7', 'locale switch cannot choose a different key or write History', async () => queryPage('scale-key-signature-tool', async h => {
  await select(h, 0, 'Cb'); await roundTrip(h); assert.equal(selections(h)[0], 'Cb')
}))
test('K8', 'written notation and edge-key names stay exact in accessibility and note tokens', async () => queryPage('scale-key-signature-tool', async h => {
  await select(h, 0, 'C#'); await h.switchTo('en')
  const label = h.renderer.root.findByProps({ className: 'scale-tool-note-sequence' }).props['aria-label']
  assert.equal(label, 'Scale notes for C♯ Major scale')
  assert.ok(h.latest().notes.ascending.includes('E♯')); assert.ok(h.latest().notes.ascending.includes('B♯'))
}))

test('R1', 'theory resources have semantic/placeholder parity and all English keys exist with fallback disabled', () => {
  const flatten = (value, prefix = '') => Object.entries(value).flatMap(([key, item]) => typeof item === 'string' ? [[prefix + key, item]] : flatten(item, prefix + key + '.'))
  const zhEntries = flatten(localizationResources['zh-CN'].theoryQuery), enEntries = flatten(localizationResources.en.theoryQuery)
  const semantic = entries => [...new Set(entries.map(([key]) => key.replace(/_(one|other)$/, '')))].sort()
  assert.deepEqual(semantic(zhEntries), semantic(enEntries))
  const english = new Map(enEntries), instance = createLocalizationInstance('en')
  instance.options.fallbackLng = false
  const placeholders = value => [...value.matchAll(/{{\s*([^},\s]+).*?}}/g)].map(match => match[1]).sort()
  for (const [key, value] of zhEntries) for (const variant of english.has(key) ? [key] : [key + '_one', key + '_other']) assert.deepEqual(placeholders(value), placeholders(english.get(variant)), key)
  for (const [key, value] of enEntries) {
    assert.ok(value.trim()); assert.equal(instance.exists(key, { ns: 'theoryQuery', lng: 'en', fallbackLng: false }), true)
    assert.doesNotMatch(value, /[\u3400-\u9fff]/)
  }
  assert.equal(instance.t('interval.semitoneCount', { ns: 'theoryQuery', count: 1 }), '1 semitone')
  assert.equal(instance.t('interval.semitoneCount', { ns: 'theoryQuery', count: 0 }), '0 semitones')
  assert.equal(instance.t('interval.semitoneCount', { ns: 'theoryQuery', count: 2 }), '2 semitones')
})
test('R2', 'theory/domain/query cores remain byte-frozen and contain no locale React or DOM dependency', () => {
  const files = ['prototype/android-tablet-v1/src/chordQueryTool.ts', 'prototype/android-tablet-v1/src/intervalQueryTool.ts', 'prototype/android-tablet-v1/src/scaleKeySignatureTool.ts', 'src/sightReading/musicKeySignatures.ts']
  execFileSync('git', ['diff', '--exit-code', base, '--', ...files, 'prototype/android-tablet-v1/src/musicTheory'], { cwd: root })
  for (const file of files) assert.doesNotMatch(read(file), /i18next|react-i18next|LocaleProvider|localization\/|document\.|window\./)
  for (const directory of ['prototype/android-tablet-v1/src/musicTheory', 'src/sightReading']) {
    const paths = execFileSync('git', ['ls-files', directory], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    for (const file of paths) assert.doesNotMatch(read(file), /(?:from|import\(|require\()\s*['"][^'"]*(?:react-i18next|i18next|LocaleProvider|localization)/)
  }
})
test('R3', 'only Query/Interval presentation and necessary shared History chrome may change; other declarations are frozen', () => {
  const old = declarations(execFileSync('git', ['show', base + ':prototype/android-tablet-v1/src/main.tsx'], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n'))
  const allowed = new Set(['ChordQueryToolScreen', 'ScaleKeySignatureToolScreen', 'IntervalQueryToolScreen', 'IntervalPitchSelector', 'IntervalPracticeSetupScreen', 'IntervalPracticeActiveScreen', 'IntervalReportFacts', 'IntervalResultScreen', 'IntervalReportDetailScreen', 'HistoryRecord', 'HistoryScreen', 'HistoryTrendChart', 'IntervalPersistenceErrorNotice'])
  assert.deepEqual([...current.keys()], [...old.keys()])
  for (const [name, value] of current) if (!allowed.has(name)) assert.equal(value, old.get(name), name)
  execFileSync('git', ['diff', '--exit-code', base, '--', 'android', 'src', 'theme-packages', 'prototype/android-tablet-v1/src/theme', 'prototype/android-tablet-v1/src/intervalPractice', 'prototype/android-tablet-v1/src/chordPractice', 'prototype/android-tablet-v1/src/localization/hubResources.ts', 'prototype/android-tablet-v1/src/localization/homePresentation.ts', 'prototype/android-tablet-v1/src/localization/shellResources.ts', 'prototype/android-tablet-v1/src/localization/midiPresentation.ts'], { cwd: root })
})
test('R4', 'selection/handlers/memo dependencies and navigation remain byte-identical to checkpoint', () => {
  const ts = require('typescript')
  const old = declarations(execFileSync('git', ['show', base + ':prototype/android-tablet-v1/src/main.tsx'], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n'))
  const structural = value => {
    const ast = ts.createSourceFile('query.tsx', value, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), result = []
    function visit(node) {
      if (ts.isJsxAttribute(node) && ['value', 'key', 'onChange', 'onBack', 'onLetterChange', 'onAccidentalChange', 'onOctaveChange', 'pitch'].includes(node.name.text)) result.push(node.getText(ast))
      if (ts.isCallExpression(node) && ['useState', 'useMemo'].includes(node.expression.getText(ast))) result.push(node.getText(ast))
      ts.forEachChild(node, visit)
    }
    visit(ast); return result
  }
  for (const name of ['ChordQueryToolScreen', 'ScaleKeySignatureToolScreen', 'IntervalQueryToolScreen', 'IntervalPitchSelector']) assert.deepEqual(structural(current.get(name)), structural(old.get(name)), name)
})
test('R5', 'Light Dark and decorated external query themes preserve bilingual functionality and assets', async () => {
  for (const page of ['chord-query-tool', 'interval-query-tool', 'scale-key-signature-tool']) for (const kind of ['light', 'dark', 'external']) {
    const visual = kind === 'external' ? { kind: 'decorated-reference', frameClassName: 'bocchi-tool-detail-preview', artwork: { chordQueryHero: 'signed-chord.png', sharedCompleteRyo: 'signed-ryo.png' }, assets: { decorations: 'signed-decorations.png', background: 'signed-background.png' } } : { kind: 'standard' }
    const theme = { id: kind, displayName: 'Author original', subtitle: '作者原文', capabilities: { toolDetailVisual: visual } }
    await queryPage(page, async h => {
      const assets = h.renderer.root.findAllByType('img').map(node => node.props.src)
      await roundTrip(h)
      assert.deepEqual(h.renderer.root.findAllByType('img').map(node => node.props.src), assets)
      assert.equal(h.theme.displayName, 'Author original'); assert.equal(h.theme.subtitle, '作者原文')
    }, { theme })
  }
})
test('R6', 'query local wrapping leaves notation geometry/tokens and shared shell unchanged', () => {
  const css = read('prototype/android-tablet-v1/src/styles.css')
  assert.match(css, /\.tool-detail-shell \.interval-query-reference-list span \{[\s\S]*?white-space: normal;[\s\S]*?overflow-wrap: anywhere;/)
  assert.doesNotMatch(read('prototype/android-tablet-v1/src/localization/theoryQueryPresentation.ts'), /changeLanguage|\.save\(|navigate\(|document\.|window\.|getChordQueryResult|getIntervalQueryResult/)
  execFileSync('git', ['diff', '--exit-code', base, '--', 'src/renderer'], { cwd: root })
})
test('R7', 'actual Back and bottom Tools navigation still use stable routes', async () => {
  for (const page of ['chord-query-tool', 'interval-query-tool', 'scale-key-signature-tool']) await queryPage(page, async h => {
    await h.switchTo('en')
    const back = h.renderer.root.findAllByType('button').find(button => button.props['aria-label'] === 'Back')
    assert.ok(back); await act(async () => back.props.onClick()); assert.equal(global.window.location.hash, 'tools')
  })
})

void (async () => {
  let passed = 0
  for (const item of tests) {
    try { await item.run(); passed++; console.log('PASS ' + item.id + ' ' + item.title) }
    catch (error) { console.error('FAIL ' + item.id + ' ' + item.title); console.error(error.stack || error) }
  }
  console.log('\n' + passed + '/' + tests.length + ' B4.2B Theory Query localization checks PASS')
  if (passed !== tests.length) process.exitCode = 1
})()
