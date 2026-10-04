const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { act } = require('react-test-renderer')
const { mounted, ui, current, declarations, read, text, contains, businessBytes } = require('./android-localization-shell-check.cjs')
const { createLocalizationInstance } = require('../prototype/android-tablet-v1/src/localization/localizationService.ts')
const { localizationResources } = require('../prototype/android-tablet-v1/src/localization/resources.ts')
const { APP_PREFERENCES_KEY } = require('../prototype/android-tablet-v1/src/localization/appPreferences.ts')
const practice = require('../prototype/android-tablet-v1/src/intervalPractice/index.ts')
const theory = require('../prototype/android-tablet-v1/src/musicTheory/intervals/index.ts')
const { ActivePracticeSessionHost } = require('../prototype/android-tablet-v1/src/activePracticeSession.ts')
const root = path.resolve(__dirname, '..')
const mainPath = 'prototype/android-tablet-v1/src/main.tsx'
const base = '4a6d22794f1846bc75c932377d87f02250098980'
const oldMain = execFileSync('git', ['show', base + ':' + mainPath], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n')
const previous = declarations(oldMain)
const tests = []
const test = (id, title, run) => tests.push({ id, title, run })
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const appAst = ts.createSourceFile(mainPath, current.get('App'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const appBody = appAst.statements[0].body
const variable = name => appBody.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(appAst) === name)).getText(appAst)
const loadEffect = appBody.statements.find(node => ts.isExpressionStatement(node) && node.getText(appAst).includes('intervalSettingsRepository.load()')).getText(appAst)
// Execute the production handlers/effect extracted by AST; do not rewrite Start/save/load semantics.
const handlers = new Function('setIntervalSettings', 'intervalSettingsRepository', 'activeSessionHost', 'intervalPersistence', 'intervalRuntime', 'intervalSettings', 'navigate', compile(variable('updateIntervalSettings') + '\n' + variable('startIntervalPractice') + '\nreturn { updateIntervalSettings, startIntervalPractice }'))
const runLoadEffect = new Function('useEffect', 'setIntervalSettings', 'setIntervalSettingsReady', 'intervalSettingsRepository', compile(loadEffect))
const activeAst = ts.createSourceFile('active.tsx', current.get('IntervalPracticeActiveScreen'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const activeMount = activeAst.statements[0].body.statements.find(node => ts.isExpressionStatement(node) && node.getText(activeAst).includes('midiRuntime.midiRouter.subscribe'))
const applyActiveInput = new Function('runtime', 'midiRuntime', 'transportReady', compile('return (' + activeMount.expression.arguments[0].getText(activeAst) + ')()'))

const startButton = h => h.renderer.root.findByProps({ className: 'primary-action is-wide interval-start-button' })
const switches = h => h.renderer.root.findAllByProps({ role: 'switch' })
const countSelect = h => h.renderer.root.findByType('select')
async function page(run, options = {}) {
  let state
  function PreparationOwner() {
    const [settings, setIntervalSettings] = React.useState(practice.DEFAULT_INTERVAL_PRACTICE_SETTINGS)
    const [, setIntervalSettingsReady] = React.useState(false)
    state.settings = settings
    state.actions = handlers(setIntervalSettings, state.repository, state.host, state.persistence, state.intervalRuntime, settings, ui.navigate)
    runLoadEffect(React.useEffect, setIntervalSettings, setIntervalSettingsReady, state.repository)
    return React.createElement(ui.IntervalPracticeSetupScreen, { settings, onStart: state.actions.startIntervalPractice, onSettingsChange: state.actions.updateIntervalSettings })
  }
  try {
  await mounted('interval-practice', async h => {
    await act(async () => { await state.loaded })
    await run({ ...h, ...state, getSettings: () => state.settings, getHandlers: () => state.actions, getStats: () => ({ loads: state.loadCalls, saves: state.saveCalls }) })
  }, {
    theme: options.theme,
    render({ backend, runtime }) {
      if (!state) {
        const initial = Object.freeze({ ...practice.DEFAULT_INTERVAL_PRACTICE_SETTINGS, ...options.settings })
        const raw = options.raw ?? JSON.stringify(initial)
        backend.values.set(practice.INTERVAL_PRACTICE_SETTINGS_STORAGE_KEY, raw)
        backend.values.set(practice.INTERVAL_REPORT_STORAGE_KEYS.reportIndex, '{"schemaVersion":1,"nextSequence":1,"recordIds":[]}')
        backend.values.set('piano.v1.interval.report.preserved-fixture', 'PRESERVED_HISTORY_BYTES')
        const repository = new practice.IntervalPracticeSettingsRepository(backend)
        const intervalRuntime = new practice.IntervalPracticeSessionRuntime({ clock: { now: () => 1000 }, scheduler: { schedule: () => 1, cancel() {} }, rng: () => 0.42 })
        const host = new ActivePracticeSessionHost()
        const persistence = new practice.IntervalReportPersistenceCoordinator(new practice.IntervalReportRepository(backend), { now: () => 1000 })
        state = { repository, intervalRuntime, host, persistence, settings: null, actions: null, loadCalls: 0, saveCalls: 0, raw }
        const originalLoad = repository.load.bind(repository), originalSave = repository.save.bind(repository)
        repository.load = () => { state.loadCalls++; state.loaded = originalLoad(); return state.loaded }
        repository.save = settings => { state.saveCalls++; state.saved = originalSave(settings); return state.saved }
      }
      return React.createElement(PreparationOwner)
    }
  })
  } finally { state?.intervalRuntime.destroy() }
}
async function roundTrip(h) {
  const before = { settings: h.getSettings(), bytes: businessBytes(h.backend), route: global.window.location.hash,
    midi: JSON.stringify(h.runtime.bluetoothSnapshot), ready: h.runtime.midiReady, source: h.runtime.midiSource,
    input: h.runtime.midiInput, boundary: h.runtime.midiBoundaryVersion, session: JSON.stringify(h.runtime.snapshot),
    interval: JSON.stringify(h.intervalRuntime.snapshot), host: h.host.current, native: [...h.plugin.calls],
    listeners: [...h.plugin.listeners], theme: h.themeManager.snapshot, stats: h.getStats(),
    backendWrites: h.backend.writes.length, onStart: startButton(h).props.onClick }
  for (const locale of ['en', 'zh-CN']) {
    await h.switchTo(locale)
    assert.equal(global.window.location.hash, before.route)
    assert.equal(h.getSettings(), before.settings)
    assert.deepEqual(businessBytes(h.backend), before.bytes)
    assert.ok(h.backend.writes.slice(before.backendWrites).every(write => write.key === APP_PREFERENCES_KEY))
    assert.equal(JSON.stringify(h.runtime.bluetoothSnapshot), before.midi)
    assert.equal(h.runtime.midiReady, before.ready); assert.equal(h.runtime.midiSource, before.source)
    assert.equal(h.runtime.midiInput, before.input); assert.equal(h.runtime.midiBoundaryVersion, before.boundary)
    assert.equal(JSON.stringify(h.runtime.snapshot), before.session)
    assert.equal(JSON.stringify(h.intervalRuntime.snapshot), before.interval); assert.deepEqual(h.host.current, before.host)
    assert.deepEqual(h.plugin.calls, before.native); assert.deepEqual([...h.plugin.listeners], before.listeners)
    assert.equal(h.themeManager.snapshot, before.theme); assert.deepEqual(h.pointerCalls, [])
    assert.deepEqual(h.getStats(), before.stats)
    assert.equal(h.backend.writes.filter(write => write.key === practice.INTERVAL_PRACTICE_SETTINGS_STORAGE_KEY).length, before.stats.saves)
    assert.equal(startButton(h).props.onClick, before.onStart)
    assert.deepEqual(h.lifecycle(), { mounts: 1, unmounts: 0 })
  }
}

test('IP1', 'actual zh-CN Preparation retains every existing label/description and default value', async () => page(async h => {
  for (const copy of ['音程练习', '练习准备', '设置本轮音程练习', '答案提示', '低音包含升降号', '练习题数', '开始练习', '26', 'F1 – G6']) contains(h.getText(), copy)
  assert.deepEqual(h.getSettings(), practice.DEFAULT_INTERVAL_PRACTICE_SETTINGS)
  assert.deepEqual(countSelect(h).findAllByType('option').map(text), ['10 题', '20 题', '50 题', '100 题', '无限练习'])
  assert.equal(switches(h)[0].props['aria-label'], '答案提示已关闭')
}))
test('IP2', 'actual en Preparation has explicit English copy including bass note and no root/ear-training redefinition', async () => page(async h => {
  await h.switchTo('en')
  for (const copy of ['Interval Practice', 'Practice preparation', 'Set up this interval session', 'Answer hint', 'Include accidentals in bass notes', 'Questions', 'Start practice', 'Unlimited practice']) contains(h.getText(), copy)
  assert.doesNotMatch(h.getText(), /[\u3400-\u9fff]|\broot\b|ear training|semitone quiz/i)
  assert.equal(countSelect(h).props['aria-label'], 'Interval practice question count')
}))
test('IP3', 'Answer hint toggles persist real booleans using the unchanged production update handler', async () => page(async h => {
  for (const locale of ['en', 'zh-CN']) {
    await h.switchTo(locale)
    await act(async () => { switches(h)[0].props.onClick(); await h.repository.load() })
    assert.equal(h.getSettings().answerHint, locale === 'en')
    assert.equal(switches(h)[0].props['aria-checked'], locale === 'en')
    assert.equal((await h.repository.load()).answerHint, locale === 'en')
  }
  const saved = JSON.parse(h.backend.values.get(practice.INTERVAL_PRACTICE_SETTINGS_STORAGE_KEY))
  assert.equal(typeof saved.answerHint, 'boolean'); assert.equal(saved.schemaVersion, 3)
}))
test('IP4', 'Bass-note accidentals retain boolean identity and do not alter the hint setting', async () => page(async h => {
  await h.switchTo('en')
  await act(async () => { switches(h)[1].props.onClick(); await h.repository.load() })
  assert.equal(h.getSettings().includeAccidentalRoots, true); assert.equal(h.getSettings().answerHint, false)
  assert.equal((await h.repository.load()).includeAccidentalRoots, true)
  assert.equal(switches(h)[1].props['aria-label'], 'Include accidentals in bass notes: On')
}))
test('IP5', '10/20/50/100/endless remain exact number/sentinel identities through the real select/repository', async () => page(async h => {
  assert.deepEqual(countSelect(h).findAllByType('option').map(node => node.props.value), [10, 20, 50, 100, 'endless'])
  for (const value of practice.INTERVAL_QUESTION_COUNT_OPTIONS) {
    await h.switchTo('en')
    await act(async () => { countSelect(h).props.onChange({ target: { value: String(value) } }); await h.repository.load() })
    assert.equal(h.getSettings().questionCount, value); assert.equal((await h.repository.load()).questionCount, value)
    await h.switchTo('zh-CN'); assert.equal(countSelect(h).props.value, value)
  }
}))
test('IP6', 'production Start/Back/control event expressions and selected values remain identical', () => {
  function events(source) {
    const ast = ts.createSourceFile('prep.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), result = []
    function visit(node) {
      if (ts.isJsxAttribute(node) && ['onStart', 'onClick', 'onChange', 'onBack', 'value', 'options', 'disabled', 'className', 'active'].includes(node.name.text)) result.push(node.getText(ast))
      ts.forEachChild(node, visit)
    }
    visit(ast); return result
  }
  assert.deepEqual(events(current.get('IntervalPracticeSetupScreen')), events(previous.get('IntervalPracticeSetupScreen')))
  assert.equal(current.get('App'), previous.get('App'))
})
test('IP7', 'single-mode Preparation has exactly two switches/one count selector/one CTA and no practice state controls', async () => page(async h => {
  assert.equal(switches(h).length, 2); assert.equal(h.renderer.root.findAllByType('select').length, 1)
  assert.equal(h.renderer.root.findAllByProps({ className: 'primary-action is-wide interval-start-button' }).length, 1)
  assert.doesNotMatch(current.get('IntervalPracticeSetupScreen'), /practiceMode|orderMode|sequentialStage|interval selector|skip|resume\(|scan\(|connect\(/)
  assert.equal(h.intervalRuntime.snapshot.status, 'IDLE'); assert.equal(h.host.current, null)
}))
test('IP8', 'MIDI ready plus valid settings still invokes real Start and original ACTIVE route without history writes', async () => page(async h => {
  await h.switchTo('en'); assert.equal(h.runtime.midiReady, true)
  const before = businessBytes(h.backend)
  await act(async () => startButton(h).props.onClick())
  assert.equal(global.window.location.hash, 'interval-active')
  assert.equal(h.host.current.module, 'interval'); assert.equal(h.intervalRuntime.snapshot.status, 'RUNNING')
  assert.deepEqual(h.intervalRuntime.snapshot.settings, h.getSettings())
  assert.deepEqual(businessBytes(h.backend), before)
}))
test('IP9', 'not-ready behavior stays current: CTA enabled, original ACTIVE transport effect suspends safely', async () => page(async h => {
  await act(async () => h.runtime.midiInput.disconnect())
  assert.equal(h.runtime.midiReady, false)
  assert.equal(startButton(h).props.disabled, undefined)
  await h.switchTo('en'); await act(async () => startButton(h).props.onClick())
  assert.equal(global.window.location.hash, 'interval-active')
  // Execute the existing ACTIVE mount input effect only, not a new Preparation gate or translated ACTIVE UI.
  const unsubscribe = applyActiveInput(h.intervalRuntime, h.runtime, h.runtime.midiReady)
  try { assert.equal(h.intervalRuntime.snapshot.status, 'SUSPENDED'); assert.equal(h.intervalRuntime.snapshot.transportReady, false) }
  finally { unsubscribe() }
}))
test('IP10', 'ready and disconnected Preparation locale round trips preserve active input/generation/epoch/readiness', async () => {
  await page(roundTrip)
  await page(async h => { await act(async () => h.runtime.midiInput.disconnect()); await roundTrip(h) })
})
test('IP11', 'locale round trip keeps exact Start handler identity and cannot create a session', async () => page(async h => {
  await roundTrip(h); assert.equal(h.host.current, null); assert.equal(h.intervalRuntime.snapshot.status, 'IDLE')
  assert.equal(h.runtime.snapshot.status, 'idle')
}))
test('IP12', 'B4.3 permits Interval flow/shared History presentation only; all other declarations remain frozen', () => {
  assert.deepEqual([...current.keys()], [...previous.keys()])
  const allowed = new Set(['SightSettingsRows', 'SightSettingsDrawer', 'SightReadyScreen', 'PracticeFocusHeader', 'SightFocusScreen', 'SightResultScreen', 'PersistenceErrorNotice', 'IntervalPracticeSetupScreen', 'IntervalPracticeActiveScreen', 'IntervalReportFacts', 'IntervalResultScreen', 'IntervalReportDetailScreen', 'HistoryRecord', 'HistoryScreen', 'HistoryTrendChart', 'IntervalPersistenceErrorNotice'])
  for (const [name, source] of current) if (!allowed.has(name)) assert.equal(source, previous.get(name), name)
})
test('IP13', 'all twenty setting combinations survive mounted locale round trips with zero business writes', async () => {
  for (const answerHint of [false, true]) for (const includeAccidentalRoots of [false, true]) for (const questionCount of practice.INTERVAL_QUESTION_COUNT_OPTIONS) {
    await page(roundTrip, { settings: { answerHint, includeAccidentalRoots, questionCount } })
  }
})
test('IP14', 'legacy V1/V2 settings load without rewriting, resetting fields or saving on locale changes', async () => {
  for (const schemaVersion of [1, 2]) await page(async h => {
    assert.equal(h.getSettings().answerHint, true); assert.equal(h.getSettings().questionCount, 'endless')
    await roundTrip(h); assert.equal(h.backend.values.get(practice.INTERVAL_PRACTICE_SETTINGS_STORAGE_KEY), h.raw)
  }, { raw: JSON.stringify({ schemaVersion, answerHint: true, includeAccidentalRoots: true, questionCount: 'endless', practiceMode: 'reproduction', orderMode: 'sequential', sequentialStage: 6 }) })
})
test('IP15', 'Hint ON/OFF and accidental-root descriptions match frozen actual Grand Staff/filter semantics', () => {
  const candidate = theory.INTERVAL_PRACTICE_CANDIDATES.majorThird.find(value => value.rootMidi === 60)
  for (const answerHint of [false, true]) {
    const state = { settings: { ...practice.DEFAULT_INTERVAL_PRACTICE_SETTINGS, answerHint }, scheduler: practice.createIntervalSchedulerState(), currentQuestion: candidate }
    const display = practice.presentIntervalPractice(state)
    assert.equal(display.notation.notes.length, answerHint ? 2 : 1); assert.equal(display.notation.notes[0].midiNumber, 60)
  }
  assert.ok(localizationResources.en.intervalPractice.answerHintDescription.includes('bass note and target note'))
  assert.doesNotMatch(localizationResources.en.intervalPractice.bassAccidentals, /root/i)
  for (const includeAccidentalRoots of [false, true]) {
    let state = practice.createIntervalSchedulerState(), sawAccidental = false, seed = 1
    for (let i = 0; i < 200; i++) {
      const next = practice.scheduleNextIntervalQuestion(state, { ...practice.DEFAULT_INTERVAL_PRACTICE_SETTINGS, includeAccidentalRoots }, () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296))
      state = next.scheduler; sawAccidental ||= next.question.root.accidental !== 0
      if (!includeAccidentalRoots) assert.equal(next.question.root.accidental, 0)
    }
    assert.equal(sawAccidental, includeAccidentalRoots)
  }
})
test('IP16', 'Preparation namespace has semantic/placeholder parity and explicit English keys with fallback disabled', () => {
  const zh = localizationResources['zh-CN'].intervalPractice, en = localizationResources.en.intervalPractice
  const semantic = keys => [...new Set(keys.map(key => key.replace(/_(one|other)$/, '')))].sort()
  assert.deepEqual(semantic(Object.keys(zh)), semantic(Object.keys(en)))
  const placeholders = value => [...value.matchAll(/{{\s*([^},\s]+).*?}}/g)].map(match => match[1]).sort()
  for (const [key, value] of Object.entries(zh)) for (const variant of key in en ? [key] : [key + '_one', key + '_other']) assert.deepEqual(placeholders(value), placeholders(en[variant]), key)
  const instance = createLocalizationInstance('en'); instance.options.fallbackLng = false
  for (const [key, value] of Object.entries(en)) {
    assert.ok(value.trim()); assert.equal(instance.exists(key, { ns: 'intervalPractice', lng: 'en', fallbackLng: false }), true)
    assert.doesNotMatch(value, /[\u3400-\u9fff]/)
  }
  assert.equal(instance.t('questions', { ns: 'intervalPractice', count: 1 }), '1 question')
  assert.equal(instance.t('questions', { ns: 'intervalPractice', count: 20 }), '20 questions')
  const preparation = require('../prototype/android-tablet-v1/src/localization/intervalPreparationResources.ts').intervalPreparationResources.en
  assert.ok(!('intervals' in en)); assert.doesNotMatch(Object.keys(preparation).join(' '), /active|result|history|perfectUnison/i)
})
test('IP17', 'switch names/checked facts, select options and Start accessible text stay bilingual and truthful', async () => page(async h => {
  for (const locale of ['en', 'zh-CN']) {
    await h.switchTo(locale)
    const t = h.service.i18n.getFixedT(locale, 'intervalPractice')
    assert.equal(switches(h)[0].props['aria-label'], t('switchLabel', { setting: t('answerHint'), state: t('disabled') }))
    assert.equal(switches(h)[0].props['aria-checked'], false)
    assert.equal(countSelect(h).props['aria-label'], t('questionCountLabel'))
    contains(text(startButton(h)), t('start'))
  }
}))
test('IP18', 'Light/Dark/external preparation shares identical app content without new theme assets/pointer writes', async () => {
  for (const id of ['light', 'dark', 'external']) await page(async h => {
    assert.equal(h.renderer.root.findAllByType('img').length, 0)
    await roundTrip(h)
    assert.equal(h.theme.id, id); assert.equal(h.theme.displayName, 'Original author name')
  }, { theme: { id, displayName: 'Original author name', capabilities: {} } })
})
test('IP19', '26 IDs/1575 candidates/digest/29..91 range/ascending within octave/low weights remain frozen', () => {
  assert.equal(theory.INTERVAL_TYPE_IDS.length, 26)
  const candidates = Object.values(theory.INTERVAL_PRACTICE_CANDIDATES).flat()
  assert.equal(candidates.length, 1575)
  assert.equal(createHash('sha256').update(JSON.stringify(candidates)).digest('hex'), 'c643be252f5ea57519490033662008b4716bd1f98df0266d3357e3be171f460e')
  for (const candidate of candidates) {
    assert.ok(candidate.rootMidi >= 29 && candidate.targetMidi <= 91)
    assert.ok(candidate.targetMidi >= candidate.rootMidi && candidate.targetMidi - candidate.rootMidi <= 12)
  }
  execFileSync('git', ['diff', '--exit-code', base, '--', 'prototype/android-tablet-v1/src/musicTheory/intervals', 'prototype/android-tablet-v1/src/intervalPractice'], { cwd: root })
})
test('IP20', 'domain scheduler judgement report/legacy validator remain locale-free and byte-frozen', () => {
  const dirs = ['prototype/android-tablet-v1/src/musicTheory', 'prototype/android-tablet-v1/src/intervalPractice']
  for (const dir of dirs) for (const file of execFileSync('git', ['ls-files', dir], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean)) {
    assert.doesNotMatch(read(file), /(?:from|import\(|require\()\s*['"][^'"]*(?:i18next|LocaleProvider|localization)/)
    // Chord RegisterWindow parameters are not the browser window. Audit the Interval domain for DOM access.
    if (file.startsWith('prototype/android-tablet-v1/src/intervalPractice/') || file.startsWith('prototype/android-tablet-v1/src/musicTheory/intervals/')) assert.doesNotMatch(read(file), /document\.|window\./)
  }
  execFileSync('git', ['diff', '--exit-code', base, '--', ...dirs, 'android', 'src', 'theme-packages', 'prototype/android-tablet-v1/src/theme', 'prototype/android-tablet-v1/src/localization/hubResources.ts', 'prototype/android-tablet-v1/src/localization/theoryQueryResources.ts', 'prototype/android-tablet-v1/src/localization/theoryQueryPresentation.ts'], { cwd: root })
})
test('IP21', 'only Preparation and English Interval report wrapping is added; preexisting CSS/notation/theme geometry is unchanged', () => {
  const oldCss = execFileSync('git', ['show', base + ':prototype/android-tablet-v1/src/styles.css'], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n')
  const css = read('prototype/android-tablet-v1/src/styles.css')
  const addition = css.match(/\n\/\* Preparation-only wrapping; ACTIVE and notation geometry stay unchanged\. \*\/[\s\S]*?(?=\n\.interval-ready-settings \{)/)
  assert.ok(addition)
  const reportWrapping = css.match(/\n\/\* Interval report English wrapping only; ACTIVE\/theme geometry is unchanged\. \*\/[\s\S]*?overflow-wrap: anywhere;\n\}/)
  assert.ok(reportWrapping)
  // B4.4 adds exactly this Sight-only display wrapping; no Interval style changes are permitted.
  const sightWrapping = `:where(.sight-ready-layout, .sight-result-layout) h1,
:where(.sight-ready-layout, .sight-result-layout) h2,
.sight-focus-frame .focus-prompt {
  min-width: 0;
  overflow-wrap: break-word;
}
.sight-focus-frame .focus-progress,
.sight-focus-frame .focus-actions,
.sight-result-layout .result-actions > button {
  min-width: 0;
}
.sight-ready-layout .ready-controls p,
.sight-result-layout .result-note p {
  line-height: 1.6;
}
.settings-group--sight .setting-row__copy small {
  overflow: visible;
  white-space: normal;
  line-height: 1.5;
}
`
  assert.ok(css.endsWith(sightWrapping))
  assert.equal(css.replace(addition[0], '').replace(reportWrapping[0] + '\n', '').slice(0, -sightWrapping.length), oldCss)
  assert.match(addition[0], /\.interval-ready-layout \.setting-row__copy small \{\s*white-space: normal;/)
})
test('IP22', 'runtime device name remains verbatim in reused B4.1 MIDI header without extra badge or native effects', async () => page(async h => {
  contains(h.getText(), 'Roland Roland Digital Piano')
  const before = [...h.plugin.calls]
  await h.switchTo('en'); contains(h.getText(), 'Roland Roland Digital Piano')
  assert.deepEqual(h.plugin.calls, before)
  assert.equal(h.renderer.root.findAllByType(ui.MidiStatusButton).length, 1)
  assert.doesNotMatch(current.get('IntervalPracticeSetupScreen'), /presentMidiStatus|presentLocalizedMidiStatus|useMidiUi|deviceName/)
}))

void (async () => {
  let passed = 0
  for (const item of tests) {
    try { await item.run(); passed++; console.log('PASS ' + item.id + ' ' + item.title) }
    catch (error) { console.error('FAIL ' + item.id + ' ' + item.title); console.error(error.stack || error) }
  }
  console.log('\n' + passed + '/' + tests.length + ' B4.3A Interval Preparation localization checks PASS')
  if (passed !== tests.length) process.exitCode = 1
})()
