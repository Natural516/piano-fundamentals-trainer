const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const React = require('react')
const { act } = require('react-test-renderer')
const { mounted, current, declarations, read, text, contains, businessBytes, translator } = require('./android-localization-shell-check.cjs')
const { localizationResources } = require('../prototype/android-tablet-v1/src/localization/resources.ts')
const { presentHomeRecentPractice, formatHomeTimestamp } = require('../prototype/android-tablet-v1/src/localization/homePresentation.ts')
const { projectMixedPracticeHistory } = require('../prototype/android-tablet-v1/src/mixedHistoryProjection.ts')
const { createDurableSightReadingReport } = require('../prototype/android-tablet-v1/src/androidPersistenceCore.ts')
const { APP_PREFERENCES_KEY } = require('../prototype/android-tablet-v1/src/localization/appPreferences.ts')
const { createSightReadingSessionReport } = require('../src/sightReading/report.ts')
const { createSightReadingSessionCounters } = require('../src/sightReading/sightReadingSession.ts')
const { ANDROID_SIGHT_READING_DEFAULTS } = require('../src/sightReading/sightReadingSettings.ts')
const root = path.resolve(__dirname, '..')
const base = '57f43a9d1910be1578b43ac90e9d6a98a2850ac3'
const mainPath = 'prototype/android-tablet-v1/src/main.tsx'
const old = declarations(execFileSync('git', ['show', base + ':' + mainPath], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n'))
const tests = []
const test = (id, description, run) => tests.push({ id, description, run })
const clone = value => JSON.parse(JSON.stringify(value))
const buttons = h => h.renderer.root.findByProps({ className: 'home-practice-actions' }).findAllByType('button')
const cards = h => h.renderer.root.findAll(node => node.type === 'button' && String(node.props.className).startsWith('module-card'))
const tools = h => h.renderer.root.findAll(node => node.type === 'button' && String(node.props.className).startsWith('tool-card'))
const entryRoutes = ['sight-ready', 'chord-mode-select', 'interval-practice']
const zhModules = ['识谱练习', '和弦练习', '音程练习']
const enModules = ['Sight Reading', 'Chord Practice', 'Interval Practice']
const sight = createDurableSightReadingReport(createSightReadingSessionReport(ANDROID_SIGHT_READING_DEFAULTS, createSightReadingSessionCounters([]), [], 'stopped'), { recordId: 'real-sight-v1', startedAt: 100, endedAt: 200, settings: ANDROID_SIGHT_READING_DEFAULTS })
const chord = { schemaVersion: 1, recordId: 'real-chord-v1', module: 'chord', startedAtEpochMs: 100, endedAtEpochMs: 300,
  completionReason: 'stopped', practiceMode: 'sequential', sequentialKey: 'C', plannedQuestionCount: 20,
  completedQuestions: 3, firstPassCompleteQuestions: 2, arpeggioErrors: 1, blockErrors: 1, totalErrors: 2,
  longestFirstPassStreak: 1, practiceDurationMs: 200, timingSummary: Object.fromEntries(['questionStartLatencyMs', 'arpeggioDurationMs', 'switchToBlockLatencyMs', 'blockLandingSpreadMs'].map(key => [key, { sampleCount: 3, medianMs: 100 }])) }
const themed = {
  id: 'natural516.bocchi', source: 'external', displayName: '孤独摇滚', subtitle: '作者原文',
  capabilities: {
    homeVisual: { kind: 'single-image-hero', assets: { hero: 'signed-hero.png', headline: 'signed-headline.png', recentPractice: 'recent.png', midi: 'midi.png', tools: 'tools.png' }, memo: '一步一步，靠近喜欢的音乐。' },
    practiceVisual: { kind: 'hero-cards', assets: { hero: 'practice.png', sight: 'sight.png', chord: 'chord.png' } },
    intervalPracticeVisual: { kind: 'blue-notebook', assets: { hubCardCollage: 'approved-blue.png' } },
    toolsVisual: { kind: 'hero-cards', assets: { hero: 'tools.png', chord: 'chord-tool.png', interval: 'interval-tool.png', scale: 'scale-tool.png' } }
  }
}

test('H1', 'actual zh-CN Home key copy and three module entries', async () => mounted('home', async h => {
  for (const label of ['今日练习', '让眼睛先认出，', '再让手指弹出来。', '上次练习', '暂无练习记录', 'MIDI 输入', '基础知识查询']) contains(h.getText(), label)
  assert.deepEqual(buttons(h).map(button => text(button).trim()), zhModules)
  assert.equal(h.renderer.root.findByProps({ className: 'home-glance' }).props['aria-label'], '今日概览')
}))
test('H2', 'actual English Home resolves without Chinese fallback', async () => mounted('home', async h => {
  await h.switchTo('en')
  for (const label of ['Today’s practice', 'Read the notes,', 'then play them.', 'Last practice', 'No practice records yet', 'Connected: Roland Roland Digital Piano', 'Explore music theory']) contains(h.getText(), label)
  assert.deepEqual(buttons(h).map(button => text(button).trim()), enModules)
  assert.doesNotMatch(h.getText(), /[\u3400-\u9fff]/)
  assert.equal(h.renderer.root.findByProps({ className: 'home-glance' }).props['aria-label'], 'Today at a glance')
}))
test('H3', 'English Home buttons retain all three stable destinations and Interval readiness gate', async () => {
  await mounted('home', async h => {
    await h.switchTo('en')
    buttons(h).forEach((button, index) => { button.props.onClick(); assert.equal(global.window.location.hash, entryRoutes[index]) })
  })
  await mounted('home', async h => { assert.equal(buttons(h)[2].props.disabled, true) }, { ready: false })
})
test('H4', 'actual latest history renders the same record, metric, count and original Chord mode', async () => mounted('home', async h => {
  const records = clone(h.runtime.historySnapshot.records), chords = clone(h.chordHistory.records)
  const before = projectMixedPracticeHistory(records, chords)
  assert.equal(before[0].recordId, chord.recordId)
  contains(h.getText(), '66.7% 完成率'); contains(h.getText(), '完成 3/20')
  await h.switchTo('en')
  contains(h.getText(), '66.7% completion rate'); contains(h.getText(), '3/20 completed'); contains(h.getText(), '循序练习 · C 大调')
  assert.deepEqual(projectMixedPracticeHistory(h.runtime.historySnapshot.records, h.chordHistory.records), before)
  await h.switchTo('zh-CN'); contains(h.getText(), '完成 3/20')
}, { sightRecords: [sight], chordRecords: [chord] }))
test('H5', 'Home live locale round trip does not rewrite real durable Sight report/index/settings bytes', async () => mounted('home', async h => {
  const before = businessBytes(h.backend), writes = h.backend.writes.length, refresh = [...h.refreshCalls]
  await h.switchTo('en'); await h.switchTo('zh-CN')
  assert.deepEqual(businessBytes(h.backend), before)
  assert.deepEqual(h.backend.writes.slice(writes).map(write => write.key), [APP_PREFERENCES_KEY, APP_PREFERENCES_KEY])
  assert.deepEqual(h.refreshCalls, refresh)
}, { sightRecords: [sight] }))
test('H6', 'Home round trip preserves theme selection, artwork URLs and author metadata', async () => mounted('home', async h => {
  const original = h.themeManager.snapshot, urls = h.renderer.root.findAllByType('img').map(node => node.props.src)
  await h.switchTo('en'); await h.switchTo('zh-CN')
  assert.equal(h.themeManager.snapshot, original); assert.deepEqual(h.pointerCalls, [])
  assert.equal(h.theme.displayName, '孤独摇滚'); assert.equal(h.theme.subtitle, '作者原文')
  assert.deepEqual(h.renderer.root.findAllByType('img').map(node => node.props.src), urls)
}, { theme: themed }))
test('H7', 'Home has no settings summary, blank paragraph or per-question/staff settings in action cards', async () => mounted('home', async h => {
  assert.doesNotMatch(current.get('HomeScreen'), /homeSettingsSummary|home-training-summary|answerTimeLimitSeconds|STAFF_MODE_LABELS/)
  assert.equal(h.renderer.root.findByProps({ className: 'home-hero__copy' }).findAllByType('p').length, 0)
  for (const locale of ['en', 'zh-CN']) { await h.switchTo(locale); for (const button of buttons(h)) assert.doesNotMatch(text(button), /100|5秒|大谱表|Grand staff/) }
}))
test('H8', 'Bocchi visible headline image slot/source/accessibility structure stays frozen', async () => mounted('home', async h => {
  const image = () => h.renderer.root.findByProps({ className: 'themed-home-hero__headline' }).findByType('img')
  const original = { ...image().props }
  await h.switchTo('en'); assert.deepEqual(image().props, original)
  assert.equal(image().props.src, themed.capabilities.homeVisual.assets.headline)
  assert.ok(current.get('HomeScreen').includes('<img src={composedHome.assets.headline} alt="" aria-hidden="true" />'))
}, { theme: themed }))
test('H9', 'only Bocchi App-owned sr-only heading translates; visible memo is intentionally deferred', async () => mounted('home', async h => {
  await h.switchTo('en')
  assert.equal(text(h.renderer.root.findByProps({ className: 'themed-sr-only' })), 'Read the notes, then play them.')
  assert.equal(text(h.renderer.root.findByProps({ className: 'themed-home-hero__memo' })), themed.capabilities.homeVisual.memo)
  assert.equal(h.renderer.root.findByProps({ className: 'themed-home-hero__headline' }).findAllByType('img').length, 1)
}, { theme: themed }))

for (const [id, locale, labels] of [['P1', 'zh-CN', zhModules], ['P2', 'en', enModules]]) test(id, `${locale} actual Practice Hub categories/titles/descriptions/CTA`, async () => mounted('practice', async h => {
  await h.switchTo(locale)
  assert.deepEqual(cards(h).map(card => text(card.findByProps({ className: 'module-card__copy' }).findByType('strong'))), labels)
  contains(h.getText(), locale === 'en' ? 'Build from a given bass note · 26 interval types' : '指定低音构造 · 26 种音程')
  assert.equal(cards(h).filter(card => text(card).includes(locale === 'en' ? 'Start practice' : '开始练习')).length, 3)
}, { theme: themed }))
test('P3', 'stable card identities/order and themed art remain the same across locale changes', async () => mounted('practice', async h => {
  const before = cards(h).map(card => card.props.className), urls = h.renderer.root.findAllByType('img').map(image => image.props.src)
  await h.switchTo('en'); await h.switchTo('zh-CN')
  assert.deepEqual(cards(h).map(card => card.props.className), before)
  assert.deepEqual(h.renderer.root.findAllByType('img').map(image => image.props.src), urls)
}, { theme: themed }))
test('P4', 'actual English Hub CTA handlers enter original Preparation routes', async () => mounted('practice', async h => {
  await h.switchTo('en'); cards(h).forEach((card, index) => { card.props.onClick(); assert.equal(global.window.location.hash, entryRoutes[index]) })
}))
test('P5', 'Interval does not bypass Preparation and remains disabled until settings ready', async () => mounted('practice', async h => {
  await h.switchTo('en'); assert.equal(cards(h)[2].props.disabled, true)
  assert.doesNotMatch(current.get('PracticeHubScreen'), /navigate\('interval-active'\)|onStart/)
}, { ready: false }))
test('P6', 'no annotation/status pill wrapper in standard or themed actual rendered cards', async () => {
  for (const theme of [undefined, themed]) await mounted('practice', async h => {
    await h.switchTo('en')
    for (const card of cards(h)) assert.equal(card.findAll(node => /annotation|status-pill|module-card__recent/.test(String(node.props.className))).length, 0)
  }, { theme })
})
test('P7', 'Hub descriptions no longer depend on training settings or revive staff/count summary', () => {
  assert.doesNotMatch(current.get('PracticeHubScreen'), /sightConfigurationSummary|settings\.(?:staffMode|questionCount|noteMode)|STAFF_MODE_LABELS|固定大谱表/)
  for (const locale of ['zh-CN', 'en']) for (const key of ['sightDescription', 'chordDescription', 'intervalDescription']) assert.doesNotMatch(localizationResources[locale].practice[key], /100|5秒|每题|Grand staff|固定大谱表/)
})
test('P8', 'live Hub locale changes do not activate/install themes or refresh/start/rebuild runtime', async () => mounted('practice', async h => {
  const theme = h.themeManager.snapshot, calls = [...h.plugin.calls], refresh = [...h.refreshCalls], state = JSON.stringify(h.runtime.snapshot)
  await h.switchTo('en'); await h.switchTo('zh-CN')
  assert.equal(h.themeManager.snapshot, theme); assert.deepEqual(h.pointerCalls, []); assert.deepEqual(h.plugin.calls, calls)
  assert.deepEqual(h.refreshCalls, refresh); assert.equal(JSON.stringify(h.runtime.snapshot), state)
}, { theme: themed }))

for (const [id, locale, labels] of [['T1', 'zh-CN', ['和弦查询', '音程查询', '自然大调音阶与调号']], ['T2', 'en', ['Chord Lookup', 'Interval Lookup', 'Major Scale & Key Signature']]]) test(id, `${locale} Tools Hub entries and ordinary copy`, async () => mounted('tools', async h => {
  await h.switchTo(locale)
  assert.deepEqual(tools(h).map(card => text(card.findByType('strong'))), labels)
  if (locale === 'en') assert.doesNotMatch(h.getText(), /[\u3400-\u9fff]/)
}))
test('T3', 'three localized tool entries retain original metadata, IDs and destinations', async () => mounted('tools', async h => {
  assert.equal(current.get('THEORY_TOOLS'), old.get('THEORY_TOOLS'))
  await h.switchTo('en'); tools(h).forEach((card, index) => { card.props.onClick(); assert.equal(global.window.location.hash, ['chord-query-tool', 'interval-query-tool', 'scale-key-signature-tool'][index]) })
}))
test('T4', 'B4.2B/B4.3 permit Query/Interval flow and shared History chrome; other declarations remain frozen', () => {
  const allowed = new Set(['HomeScreen', 'PracticeHubScreen', 'ToolsHubScreen', 'ChordQueryToolScreen', 'ScaleKeySignatureToolScreen', 'IntervalQueryToolScreen', 'IntervalPitchSelector', 'SightSettingsRows', 'SightSettingsDrawer', 'SightReadyScreen', 'PracticeFocusHeader', 'SightFocusScreen', 'SightResultScreen', 'PersistenceErrorNotice', 'IntervalPracticeSetupScreen', 'IntervalPracticeActiveScreen', 'IntervalReportFacts', 'IntervalResultScreen', 'IntervalReportDetailScreen', 'HistoryRecord', 'HistoryScreen', 'HistoryTrendChart', 'IntervalPersistenceErrorNotice'])
  assert.deepEqual([...current.keys()], [...old.keys()])
  for (const [name, source] of current) if (!allowed.has(name)) assert.equal(source, old.get(name), name)
  execFileSync('git', ['diff', '--exit-code', base, '--', 'prototype/android-tablet-v1/src/musicTheory', 'prototype/android-tablet-v1/src/intervalQueryTool.ts', 'prototype/android-tablet-v1/src/scaleKeySignatureTool.ts'], { cwd: root })
})
test('T5', 'Tools locale switching does not invoke queries, native calls or navigation', async () => mounted('tools', async h => {
  const calls = [...h.plugin.calls], before = businessBytes(h.backend)
  await h.switchTo('en'); await h.switchTo('zh-CN')
  assert.equal(global.window.location.hash, '#tools'); assert.deepEqual(h.plugin.calls, calls); assert.deepEqual(businessBytes(h.backend), before)
  assert.doesNotMatch(current.get('ToolsHubScreen'), /getChordQuery|getNaturalMajorToolResult|getIntervalQuery|useEffect/)
}))
test('T6', 'Bocchi Tools visual slogan and Practice Hero slogans intentionally remain unchanged', async () => {
  await mounted('tools', async h => { await h.switchTo('en'); contains(h.getText(), '低音，也能让音乐更有重量。'); contains(h.getText(), 'Theory tools') }, { theme: themed })
  await mounted('practice', async h => { await h.switchTo('en'); contains(h.getText(), '每天一点练习，'); contains(h.getText(), '今天，也弹一点。'); contains(h.getText(), 'Start practice') }, { theme: themed })
})

test('R1', 'each entry page live round trip preserves route/MIDI/session/provider/history/theme and mount ownership', async () => {
  for (const page of ['home', 'practice', 'tools']) await mounted(page, async h => {
    const before = { input: clone(h.runtime.bluetoothSnapshot.activeInput), midi: JSON.stringify(h.runtime.bluetoothSnapshot), session: JSON.stringify(h.runtime.snapshot), history: JSON.stringify(h.runtime.historySnapshot), theme: h.themeManager.snapshot, provider: h.runtime.midiInput, calls: [...h.plugin.calls], listeners: [...h.plugin.listeners], count: h.plugin.registrations, bytes: businessBytes(h.backend) }
    for (const locale of ['en', 'zh-CN']) {
      await h.switchTo(locale); assert.equal(global.window.location.hash, '#' + page)
      assert.deepEqual(h.runtime.bluetoothSnapshot.activeInput, before.input); assert.equal(JSON.stringify(h.runtime.bluetoothSnapshot), before.midi)
      assert.equal(JSON.stringify(h.runtime.snapshot), before.session); assert.equal(JSON.stringify(h.runtime.historySnapshot), before.history)
      assert.equal(h.runtime.midiInput, before.provider); assert.equal(h.themeManager.snapshot, before.theme)
      assert.deepEqual(h.plugin.calls, before.calls); assert.deepEqual([...h.plugin.listeners], before.listeners); assert.equal(h.plugin.registrations, before.count)
      assert.deepEqual(businessBytes(h.backend), before.bytes); assert.deepEqual(h.pointerCalls, []); assert.deepEqual(h.lifecycle(), { mounts: 1, unmounts: 0 })
    }
  }, { sightRecords: [sight], chordRecords: [chord] })
})
test('R2', 'signed theme source/assets, native/domain/persistence/updater/version and B4.1 resources/helpers stay frozen', () => {
  execFileSync('git', ['diff', '--exit-code', base, '--', 'theme-packages', 'android', 'src', 'prototype/android-tablet-v1/src/theme', 'prototype/android-tablet-v1/src/chordPractice', 'prototype/android-tablet-v1/src/intervalPractice', 'prototype/android-tablet-v1/src/sightReadingIntegration.ts', 'prototype/android-tablet-v1/src/androidPersistenceCore.ts', 'prototype/android-tablet-v1/src/historyProjection.ts', 'prototype/android-tablet-v1/src/mixedHistoryProjection.ts', 'prototype/android-tablet-v1/src/localization/shellResources.ts', 'prototype/android-tablet-v1/src/localization/midiPresentation.ts'], { cwd: root })
})
test('R3', 'new namespaces have semantic/placeholder parity and explicit English no-fallback resolution', () => {
  let keys = 0
  for (const ns of ['home', 'practice', 'tools']) {
    const zh = localizationResources['zh-CN'][ns], en = localizationResources.en[ns]
    const semantic = values => [...new Set(Object.keys(values).map(key => key.replace(/_(one|other)$/, '')))].sort()
    assert.deepEqual(semantic(zh), semantic(en)); keys += Object.keys(zh).length
    for (const [key, value] of Object.entries(zh)) {
      const variants = Object.hasOwn(en, key) ? [key] : [key + '_one', key + '_other']
      const placeholders = text => [...text.matchAll(/{{(\w+)}}/g)].map(match => match[1]).sort()
      for (const variant of variants) {
        assert.ok(en[variant].trim()); assert.deepEqual(placeholders(value), placeholders(en[variant]))
        assert.doesNotMatch(en[variant], /[\u3400-\u9fff]/)
      }
    }
    const { createLocalizationInstance } = require('../prototype/android-tablet-v1/src/localization/localizationService.ts')
    const instance = createLocalizationInstance('en')
    for (const key of Object.keys(en)) assert.ok(instance.exists(key, { ns, lng: 'en', fallbackLng: false }))
  }
  assert.equal(keys, 58)
})
test('R4', 'Home-only date templates cover Today Yesterday date year invalid without changing timestamps', () => {
  const now = new Date(2026, 9, 4, 12).getTime(), today = new Date(2026, 9, 4, 9, 5).getTime(), yesterday = new Date(2026, 9, 3, 9, 5).getTime()
  assert.equal(formatHomeTimestamp(today, translator('zh-CN', 'home'), now), '今天 09:05')
  assert.equal(formatHomeTimestamp(today, translator('en', 'home'), now), 'Today 09:05')
  assert.equal(formatHomeTimestamp(yesterday, translator('en', 'home'), now), 'Yesterday 09:05')
  assert.equal(formatHomeTimestamp(new Date(2026, 8, 1, 9, 5).getTime(), translator('en', 'home'), now), '9/1 09:05')
  assert.equal(formatHomeTimestamp(new Date(2025, 8, 1, 9, 5).getTime(), translator('en', 'home'), now), '2025/9/1 09:05')
  assert.equal(formatHomeTimestamp(NaN, translator('en', 'home'), now), 'Time unknown')
})
test('R5', 'Home count plurals/null metrics and stable module facts work without display-string branching', () => {
  for (const count of [0, 1, 2, 20]) {
    const item = { module: 'interval', recordId: 'unchanged', endedAt: 100, completedQuestions: count, configuredQuestionCount: null, firstTryAccuracy: null, modeSummary: 'DO_NOT_PARSE' }
    const original = clone(item), display = presentHomeRecentPractice(item, translator('en', 'home'))
    contains(display.detail, 'Intervals'); contains(display.detail, `${count} ${count === 1 ? 'question' : 'questions'} completed`)
    assert.doesNotMatch(display.detail.split(' · ').at(-1), /\d+\/\d+|DO_NOT_PARSE/); assert.equal(display.title, '— first-try accuracy'); assert.deepEqual(item, original)
  }
  assert.doesNotMatch(read('prototype/android-tablet-v1/src/localization/homePresentation.ts'), /modeSummary\s*===|modeSummary\.includes|modeSummary\.replace/)
})
test('R6', 'loading recent-history display and local CSS retain functional structure without browser claims', async () => mounted('home', async h => {
  contains(h.getText(), '正在读取记录'); await h.switchTo('en'); contains(h.getText(), 'Loading practice records')
  const css = read('prototype/android-tablet-v1/src/styles.css')
  assert.match(css, /\.home-practice-actions \.primary-action \{[\s\S]*?white-space: normal;[\s\S]*?line-height: 1.25;/)
  assert.match(css, /\.practice-module-grid \.module-card__copy,[\s\S]*?\.tools-hub \.tool-card__copy \{[\s\S]*?min-width: 0;[\s\S]*?overflow-wrap: anywhere;/)
}, { historyStatus: 'loading' }))
test('R7', 'all entry handlers/disabled/key/value/event effects remain source-identical to B4.1', () => {
  const ts = require('typescript')
  const attributes = source => {
    const ast = ts.createSourceFile('entry.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), values = []
    const visit = node => { if (ts.isJsxAttribute(node) && ['onClick', 'onChange', 'disabled', 'key', 'value'].includes(node.name.getText(ast))) values.push(node.getText(ast)); if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') values.push(node.getText(ast)); ts.forEachChild(node, visit) }
    visit(ast); return values
  }
  for (const name of ['HomeScreen', 'PracticeHubScreen', 'ToolsHubScreen']) assert.deepEqual(attributes(current.get(name)), attributes(old.get(name)), name)
})

;(async () => {
  let passed = 0
  for (const { id, description, run } of tests) {
    try { await run(); passed++; console.log(`PASS ${id} ${description}`) }
    catch (error) { console.error(`FAIL ${id} ${description}\n${error.stack}`) }
  }
  console.log(`\n${passed}/${tests.length} B4.2A Home Hub Tools localization checks PASS`)
  if (passed !== tests.length) process.exitCode = 1
})()
