const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { act } = require('react-test-renderer')
const { mounted, ui, current, declarations, read, text, contains, businessBytes } = require('./android-localization-shell-check.cjs')
const practice = require('../prototype/android-tablet-v1/src/intervalPractice/index.ts')
const { getCanonicalIntervalSnapshotName } = require('../prototype/android-tablet-v1/src/intervalPractice/legacySnapshot.ts')
const theory = require('../prototype/android-tablet-v1/src/musicTheory/intervals/index.ts')
const { ActivePracticeSessionHost } = require('../prototype/android-tablet-v1/src/activePracticeSession.ts')
const { PracticeKeepAwakeController, shouldKeepPracticeAwake } = require('../prototype/android-tablet-v1/src/practiceKeepAwake.ts')
const { APP_PREFERENCES_KEY } = require('../prototype/android-tablet-v1/src/localization/appPreferences.ts')
const { createLocalizationInstance } = require('../prototype/android-tablet-v1/src/localization/localizationService.ts')
const { localizationResources } = require('../prototype/android-tablet-v1/src/localization/resources.ts')
const display = require('../prototype/android-tablet-v1/src/localization/intervalPracticePresentation.ts')
const root = path.resolve(__dirname, '..'), base = '4a6d22794f1846bc75c932377d87f02250098980'
const baseline = file => execFileSync('git', ['show', base + ':' + file], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n')
const previous = declarations(baseline('prototype/android-tablet-v1/src/main.tsx'))
const tests = [], test = (id, title, run) => tests.push({ id, title, run })
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const app = ts.createSourceFile('app.tsx', current.get('App'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const variable = name => app.statements[0].body.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(app) === name)).getText(app)
// The unchanged production Start/finalization handlers, not test copies of their business logic.
const productionActions = new Function('useCallback', 'activeSessionHost', 'intervalRuntime', 'intervalPersistence', 'intervalSettings', 'navigate', compile([
  variable('startIntervalPractice'), variable('finalizeIntervalPractice'), variable('endIntervalPractice'), variable('completeIntervalPractice'),
  'return { startIntervalPractice, endIntervalPractice, completeIntervalPractice }'
].join('\n')))

class Timers {
  now = 1000; sequence = 0; pending = new Map(); operations = []
  schedule = (callback, delay) => { const id = ++this.sequence; this.pending.set(id, { callback, due: this.now + delay }); this.operations.push(['schedule', id, delay]); return id }
  cancel = id => { this.operations.push(['cancel', id]); this.pending.delete(id) }
  advance(ms) {
    const end = this.now + ms
    while (true) {
      const next = [...this.pending].sort((a, b) => a[1].due - b[1].due).find(([, task]) => task.due <= end)
      if (!next) break
      this.now = next[1].due; this.pending.delete(next[0]); next[1].callback()
    }
    this.now = end
  }
}
function legalRecord() {
  const q = theory.INTERVAL_PRACTICE_CANDIDATES.majorThird[0]
  const attempt = { questionId: 'real-v1-fixture', intervalId: 'majorThird', root: q.root, target: q.target, rootMidi: q.rootMidi, targetMidi: q.targetMidi, completed: true, firstTryCorrect: false, wrongAttemptCount: 2 }
  const draft = practice.buildIntervalPracticeReport({ settings: practice.DEFAULT_INTERVAL_PRACTICE_SETTINGS, completedQuestions: 1, attempts: [attempt] }, { startedAtEpochMs: 1750000000000, finishedAtEpochMs: 1750000060000, completionStatus: 'STOPPED' })
  const record = { ...practice.createIntervalPracticeReport('interval-report-1', draft), settings: { ...draft.settings, practiceMode: 'construction' }, extraLegacyField: 'preserve exactly' }
  assert.equal(practice.isIntervalPracticeReportV1(record), true)
  return record
}
async function flow(run, options = {}) {
  let ctx
  function FlowOwner() {
    const [screen, setScreen] = React.useState(options.screen ?? 'interval-practice')
    const [filter, setFilter] = React.useState('interval')
    const snapshot = ui.useIntervalPracticeRuntime(ctx.interval)
    const persistence = ui.useIntervalPersistence(ctx.persistence)
    ctx.screen = screen; ctx.setScreen = value => { ui.navigate(value); setScreen(value) }
    ctx.setFilter = setFilter; ctx.filter = filter
    React.useEffect(() => { ctx.ownerMounts++; return () => { ctx.ownerUnmounts++ } }, [])
    React.useEffect(() => { ctx.loaded = ctx.persistence.initialize() }, [])
    const enabled = shouldKeepPracticeAwake({ appForeground: true, screen, sightStatus: 'idle', sightPaused: false, chordStatus: 'IDLE', intervalStatus: snapshot.status })
    React.useEffect(() => { void ctx.awake.setEnabled(enabled) }, [enabled])
    if (screen === 'interval-practice') return React.createElement(ui.IntervalPracticeSetupScreen, { settings: ctx.settings, onStart: ctx.actions.startIntervalPractice, onSettingsChange: () => { throw Error('NOT_A_LOCALE_ACTION') } })
    if (screen === 'interval-active') return React.createElement(ui.IntervalPracticeActiveScreen, { runtime: ctx.interval, snapshot, midiRuntime: ctx.midi, theme: ctx.theme, onRequestEnd: ctx.actions.endIntervalPractice, onSessionComplete: ctx.actions.completeIntervalPractice })
    if (screen === 'interval-result') return persistence.latestReport ? React.createElement(ui.IntervalResultScreen, { report: persistence.latestReport }) : React.createElement('div')
    if (screen === 'interval-report-detail') return React.createElement(ui.IntervalReportDetailScreen, { report: options.unavailable ? null : persistence.records[0] ?? null, onBack: () => ctx.setScreen('history') })
    if (screen === 'history') return React.createElement(ui.HistoryScreen, { runtime: ctx.midi, intervalHistory: persistence, intervalPersistence: ctx.persistence, chordHistory: ctx.chordHistory, chordPersistence: ctx.chordPersistence, filter, onFilterChange: setFilter, onOpenIntervalReport: () => ctx.setScreen('interval-report-detail'), onOpenChordReport: () => { throw Error('OUT_OF_SCOPE') }, theme: ctx.theme })
    throw Error('UNEXPECTED_ROUTE ' + screen)
  }
  try {
    await mounted('interval-flow', async h => {
      await act(async () => { await ctx.loaded })
      await run({ ...h, ...ctx, state: () => ctx })
    }, {
      theme: options.theme,
      render({ backend, runtime, theme }) {
        if (!ctx) {
          const record = legalRecord(), raw = JSON.stringify(record, null, 2) + '\n'
          if (!options.emptyHistory) backend.values.set(practice.INTERVAL_REPORT_STORAGE_KEYS.reportPrefix + record.recordId, raw)
          backend.values.set(practice.INTERVAL_REPORT_STORAGE_KEYS.reportIndex, JSON.stringify({ schemaVersion: 1, nextSequence: options.emptyHistory ? 1 : 2, recordIds: options.emptyHistory ? [] : [record.recordId] }, null, 2))
          const settings = Object.freeze({ ...practice.DEFAULT_INTERVAL_PRACTICE_SETTINGS, ...options.settings })
          backend.values.set(practice.INTERVAL_PRACTICE_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
          const timers = new Timers(), interval = new practice.IntervalPracticeSessionRuntime({ clock: { now: () => timers.now }, scheduler: timers, rng: () => 0.42 })
          // Control the existing native fixture clock; all incoming bytes still traverse the production parser/provider/router.
          runtime.midiRouter.clock.now = () => timers.now
          const repository = new practice.IntervalReportRepository(backend), persistence = new practice.IntervalReportPersistenceCoordinator(repository, { now: () => 1750000060000 + timers.now })
          const awakeCalls = [], awake = new PracticeKeepAwakeController({ setEnabled: async value => { awakeCalls.push(value.enabled); return value } })
          const host = new ActivePracticeSessionHost()
          ctx = { settings, interval, timers, midi: runtime, theme: { ...theme, capabilities: { ...theme.capabilities, historyVisual: { kind: 'standard' } } }, host, persistence, repository, awake, awakeCalls, record, raw, ownerMounts: 0, ownerUnmounts: 0,
            chordHistory: { status: 'ready', records: [] }, chordPersistence: { refresh: async () => {} } }
          ctx.actions = productionActions(fn => fn, host, interval, persistence, settings, value => ctx.setScreen(value))
        }
        return React.createElement(FlowOwner)
      }
    })
  } finally { ctx?.interval.destroy(); await ctx?.awake.dispose() }
}
const click = async node => act(async () => node.props.onClick())
const byClass = (h, name) => h.renderer.root.findByProps({ className: name })
const phase = h => h.interval.snapshot.judgement?.state.phase
const question = h => h.interval.snapshot.question
async function start(h) { await click(byClass(h, 'primary-action is-wide interval-start-button')); assert.equal(h.state().screen, 'interval-active') }
async function note(h, pitch, on = true, velocity = 96) {
  await act(async () => h.plugin.listeners.get('midiMessage')({ bytes: [on ? 0x90 : 0x80, pitch, on ? velocity : 0], nativeTimestampNanos: h.timers.now * 1e6, callbackReceivedNanos: h.timers.now * 1e6, identity: h.plugin.state.activeInput, deliveryEpoch: h.plugin.state.deliveryEpoch }))
}
async function advance(h, ms) { await act(async () => h.timers.advance(ms)) }
async function correct(h) {
  const pitches = [...new Set([question(h).rootMidi, question(h).targetMidi])]
  for (const pitch of pitches) await note(h, pitch)
  assert.equal(phase(h), 'SUCCESS')
}
async function release(h) { for (const pitch of [...(h.interval.snapshot.judgement?.heldPitches ?? [])]) await note(h, pitch, false) }
async function roundTrip(h) {
  const before = {
    question: question(h), state: h.interval.snapshot.practiceState, settings: h.interval.snapshot.settings, facts: JSON.stringify(h.interval.snapshot),
    controller: h.runtime.controller, provider: h.runtime.midiInput, interval: h.interval, core: h.interval.midiRuntime.judgementValue,
    input: JSON.stringify(h.runtime.bluetoothSnapshot), boundary: h.runtime.midiBoundaryVersion, source: h.runtime.midiSource,
    native: [...h.plugin.calls], listeners: [...h.plugin.listeners], registrations: h.plugin.registrations,
    observers: [...h.runtime.midiRouter.observers], windowListeners: global.window.snapshot(), documentListeners: global.document.snapshot(), timerOperations: [...h.timers.operations], pending: [...h.timers.pending], now: h.timers.now,
    host: h.host.current, awakeCalls: [...h.awakeCalls], desired: h.awake.desiredEnabled, applied: h.awake.appliedEnabled,
    bytes: businessBytes(h.backend), writes: h.backend.writes.length, route: global.window.location.hash, screen: h.state().screen,
    persistence: h.persistence.snapshot, reports: h.repository.list(), theme: h.themeManager.snapshot,
    staff: h.renderer.root.findAllByProps({ 'data-test-staff': 'wiring-only' })[0]
  }
  for (const locale of ['en', 'zh-CN']) {
    await h.switchTo(locale)
    assert.equal(question(h), before.question); assert.equal(h.interval.snapshot.practiceState, before.state)
    assert.equal(h.interval.snapshot.settings, before.settings); assert.equal(JSON.stringify(h.interval.snapshot), before.facts)
    assert.equal(h.runtime.controller, before.controller); assert.equal(h.runtime.midiInput, before.provider)
    assert.equal(h.interval, before.interval); assert.equal(h.interval.midiRuntime.judgementValue, before.core)
    assert.equal(JSON.stringify(h.runtime.bluetoothSnapshot), before.input); assert.equal(h.runtime.midiBoundaryVersion, before.boundary); assert.equal(h.runtime.midiSource, before.source)
    assert.deepEqual(h.plugin.calls, before.native); assert.deepEqual([...h.plugin.listeners], before.listeners); assert.equal(h.plugin.registrations, before.registrations)
    assert.deepEqual([...h.runtime.midiRouter.observers], before.observers)
    assert.deepEqual(global.window.snapshot(), before.windowListeners); assert.deepEqual(global.document.snapshot(), before.documentListeners)
    assert.deepEqual(h.timers.operations, before.timerOperations); assert.deepEqual([...h.timers.pending], before.pending); assert.equal(h.timers.now, before.now)
    assert.deepEqual(h.host.current, before.host); assert.deepEqual(h.awakeCalls, before.awakeCalls)
    assert.equal(h.awake.desiredEnabled, before.desired); assert.equal(h.awake.appliedEnabled, before.applied)
    assert.deepEqual(businessBytes(h.backend), before.bytes)
    assert.ok(h.backend.writes.slice(before.writes).every(write => write.key === APP_PREFERENCES_KEY))
    assert.equal(global.window.location.hash, before.route); assert.equal(h.state().screen, before.screen)
    assert.equal(h.persistence.snapshot, before.persistence); assert.deepEqual(h.repository.list(), before.reports)
    assert.equal(h.themeManager.snapshot, before.theme); assert.deepEqual(h.pointerCalls, [])
    if (before.staff) assert.equal(h.renderer.root.findByProps({ 'data-test-staff': 'wiring-only' }), before.staff)
    assert.equal(h.state().ownerMounts, 1); assert.equal(h.state().ownerUnmounts, 0)
  }
}

test('E1', 'real Preparation zh/en still uses accepted B4.3A labels and stable settings', async () => flow(async h => {
  contains(h.getText(), '答案提示'); await h.switchTo('en'); contains(h.getText(), 'Answer hint'); await roundTrip(h)
}))
test('E2', 'real production Start enters original ACTIVE with unchanged route/session identity', async () => flow(async h => {
  await start(h); assert.equal(h.host.current.module, 'interval'); assert.equal(h.interval.snapshot.status, 'RUNNING'); assert.equal(h.renderer.root.findAllByType(ui.NotationPaper).length, 1)
}))
test('E3', 'ACTIVE title/prompt/progress/notation/controls are explicit English with octave intact', async () => flow(async h => {
  await start(h); contains(h.getText(), '请按出以'); await h.switchTo('en')
  const t = h.service.i18n.getFixedT('en', 'music'), q = question(h)
  contains(h.getText(), t('intervals.' + q.intervalType.id)); contains(h.getText(), 'as the bass note'); contains(h.getText(), practice.presentIntervalPractice(h.interval.snapshot.practiceState).rootLabel)
  assert.doesNotMatch(h.getText(), /[\u3400-\u9fff]/)
  assert.match(h.renderer.root.findByType(ui.NotationPaper).props.label, /[A-G].*\d/)
}))
test('E4', 'unanswered current question/facts/provider/controller/session remain identical on round trip', async () => flow(async h => { await start(h); await roundTrip(h) }))
test('E5', 'full wrong/release-gated retry is same question across locale; no retry button', async () => flow(async h => {
  await start(h); const q = question(h), wrong = q.targetMidi + 1 === q.rootMidi ? q.targetMidi + 2 : q.targetMidi + 1
  await note(h, q.rootMidi); await note(h, wrong); assert.equal(phase(h), 'WRONG_WAIT_RELEASE')
  await roundTrip(h); assert.equal(h.interval.snapshot.currentWrongAttemptCount, 1); assert.equal(question(h), q)
  await note(h, q.rootMidi, false); assert.equal(phase(h), 'WRONG_WAIT_RELEASE'); await note(h, wrong, false); assert.equal(phase(h), 'READY')
  await correct(h); await release(h); await advance(h, 800); assert.equal(h.interval.snapshot.completedQuestions, 1)
}))
test('E6', '800ms SUCCESS timer identity/deadline and release gate survive language round trip', async () => flow(async h => {
  await start(h); await correct(h); const q = question(h), due = h.interval.snapshot.judgement.state.successDeadlineTimestampMs
  await advance(h, 200); await roundTrip(h); assert.equal(h.interval.snapshot.judgement.state.successDeadlineTimestampMs, due)
  await advance(h, 599); assert.equal(question(h), q); assert.equal(h.interval.snapshot.completedQuestions, 0)
  await advance(h, 1); assert.equal(question(h), q); assert.equal(h.interval.snapshot.judgement.state.feedbackElapsed, true)
  await roundTrip(h); await release(h); assert.equal(h.interval.snapshot.completedQuestions, 1); assert.notEqual(question(h), q)
}))
test('E7', 'pause/resume and suspended transport locale identity remain stable', async () => flow(async h => {
  await start(h); const q = question(h)
  await click(h.renderer.root.findAllByProps({ className: 'outline-action' })[0]); assert.equal(h.interval.snapshot.status, 'SUSPENDED'); await roundTrip(h)
  await h.switchTo('en'); contains(h.getText(), 'Practice paused'); await click(h.renderer.root.findAllByProps({ className: 'outline-action' })[0]); assert.equal(question(h), q)
  await act(async () => h.runtime.midiInput.disconnect()); assert.equal(h.interval.snapshot.status, 'SUSPENDED'); await roundTrip(h)
  await h.switchTo('en'); contains(h.getText(), 'MIDI disconnected'); assert.equal(h.renderer.root.findAllByProps({ className: 'outline-action' })[0].props.disabled, true)
}))
test('E8', 'fixed progress uses settled success count and original denominator', async () => flow(async h => {
  await start(h); await correct(h); assert.equal(h.interval.snapshot.completedQuestions, 0); await release(h); await advance(h, 800)
  contains(h.getText(), '已完成 1 / 10'); await h.switchTo('en'); contains(h.getText(), 'Completed 1 / 10'); await roundTrip(h)
}, { settings: { questionCount: 10 } }))
test('E9', 'endless progress never manufactures denominator and uses real endless state', async () => flow(async h => {
  await start(h); await correct(h); await release(h); await advance(h, 800); await h.switchTo('en')
  const progress = byClass(h, 'interval-focus-prompt__identity').findByType('small'); assert.equal(text(progress), 'Completed 1'); await roundTrip(h)
}, { settings: { questionCount: 'endless' } }))
test('E10', 'real fixed-count completion produces Result in zh/en without added statistics', async () => flow(async h => {
  await start(h)
  for (let i = 0; i < 10; i++) { await correct(h); await release(h); await advance(h, 800) }
  await act(async () => { await h.persistence.flush() })
  assert.equal(h.state().screen, 'interval-result'); contains(h.getText(), '练习完成'); await h.switchTo('en'); contains(h.getText(), 'Practice complete'); contains(h.getText(), 'First-attempt accuracy')
  assert.doesNotMatch(h.getText(), /[\u3400-\u9fff]|Average reaction|Median/)
  assert.equal(h.persistence.snapshot.latestReport.completedQuestions, 10); await roundTrip(h)
}, { settings: { questionCount: 10 } }))
test('E11', 'STOPPED Result facts/object/timestamp/body/index remain unchanged through locale', async () => flow(async h => {
  await start(h); await correct(h); await release(h); await advance(h, 800); await click(h.renderer.root.findAllByProps({ className: 'outline-action' })[1])
  await h.switchTo('en'); contains(h.getText(), 'End this session?'); await click(h.renderer.root.findByProps({ className: 'early-end-dialog__actions' }).findAllByType('button')[1])
  await act(async () => { await h.persistence.flush() }); assert.equal(h.state().screen, 'interval-result')
  contains(h.getText(), 'Session ended'); await roundTrip(h)
}))
test('E12', 'real shared History Interval filter/row and Detail display bilingual, with stable IDs', async () => flow(async h => {
  contains(h.getText(), '音程练习'); await h.switchTo('en'); contains(h.getText(), 'Interval Practice'); contains(h.getText(), 'First-attempt accuracy')
  const row = h.renderer.root.findAllByType('button').find(n => n.props.className?.includes('history-row '))
  assert.equal(row.props['aria-label'], 'Open Interval Practice report'); await click(row)
  contains(h.getText(), 'Interval practice report'); contains(h.getText(), 'Major third'); assert.doesNotMatch(h.getText(), /大三度/); await roundTrip(h)
}, { screen: 'history' }))
test('E13', 'legal legacy V1 body/index raw bytes and canonical Chinese names survive History/Detail round trip', async () => flow(async h => {
  assert.equal(h.backend.values.get(practice.INTERVAL_REPORT_STORAGE_KEYS.reportPrefix + h.record.recordId), h.raw)
  await roundTrip(h); await act(async () => h.state().setScreen('interval-report-detail')); await roundTrip(h)
  assert.equal(h.backend.values.get(practice.INTERVAL_REPORT_STORAGE_KEYS.reportPrefix + h.record.recordId), h.raw)
  assert.equal(JSON.parse(h.raw).perIntervalStats[0].intervalName, '大三度')
}, { screen: 'history' }))
test('E14', 'English session still writes canonical Chinese V1 snapshot and strict validator rejects localized/mismatched names', async () => flow(async h => {
  await h.switchTo('en'); await start(h); await correct(h); await release(h); await advance(h, 800); await act(async () => h.actions.endIntervalPractice()); await h.persistence.flush()
  const saved = h.repository.list()[0]
  assert.equal(practice.isIntervalPracticeReportV1(saved), true)
  for (const row of saved.perIntervalStats) assert.equal(row.intervalName, getCanonicalIntervalSnapshotName(row.intervalId))
  const valid = legalRecord(); assert.equal(practice.isIntervalPracticeReportV1(valid), true)
  for (const name of ['小三度', 'Major third']) assert.equal(practice.isIntervalPracticeReportV1({ ...valid, perIntervalStats: [{ ...valid.perIntervalStats[0], intervalName: name }] }), false)
}))
test('E15', '26/1575/digest/range/low-weight and all Interval theory/domain sources are frozen', () => {
  const candidates = Object.values(theory.INTERVAL_PRACTICE_CANDIDATES).flat()
  assert.equal(theory.INTERVAL_TYPE_IDS.length, 26); assert.equal(candidates.length, 1575)
  assert.equal(createHash('sha256').update(JSON.stringify(candidates)).digest('hex'), 'c643be252f5ea57519490033662008b4716bd1f98df0266d3357e3be171f460e')
  for (const q of candidates) assert.ok(q.rootMidi >= 29 && q.targetMidi <= 91 && q.targetMidi - q.rootMidi <= 12)
  execFileSync('git', ['diff', '--exit-code', base, '--', 'prototype/android-tablet-v1/src/intervalPractice', 'prototype/android-tablet-v1/src/musicTheory', 'src', 'android', 'theme-packages'], { cwd: root })
})
test('E16', 'native parser/provider and keep-awake ownership do not change at any locale boundary', async () => flow(async h => {
  await start(h); await note(h, question(h).rootMidi); assert.equal(phase(h), 'COLLECTING'); assert.ok(h.interval.snapshot.judgement.heldPitches.length)
  assert.equal(h.awake.appliedEnabled, true); await roundTrip(h)
  const input = h.runtime.bluetoothSnapshot.activeInput; assert.equal(input.transport, 'usb'); assert.equal(input.portNumber, 3)
  await act(async () => h.interval.pause()); assert.equal(h.awake.desiredEnabled, false); await roundTrip(h)
}))
test('E17', 'Light/Dark/missing slot/external ACTIVE retains same art URLs and Theme pointer without empty images', async () => {
  for (const id of ['light', 'dark', 'old', 'bocchi']) await flow(async h => {
    await start(h); const images = h.renderer.root.findAllByType('img').map(n => n.props.src)
    assert.equal(images.length, id === 'bocchi' ? 5 : 0)
    for (const src of images) assert.equal(src, '/existing/active-border.png')
    await roundTrip(h); assert.deepEqual(h.renderer.root.findAllByType('img').map(n => n.props.src), images)
  }, { theme: { id, capabilities: { intervalPracticeVisual: id === 'bocchi' ? { kind: 'blue-notebook', assets: { activeBorder: '/existing/active-border.png' } } : undefined } } })
})
test('E18', 'no skip/next/retry button; original Back confirmation/cancel/end handlers remain intact', async () => flow(async h => {
  await start(h); await h.switchTo('en'); assert.doesNotMatch(h.getText(), /Next|Skip|Retry button/)
  await click(h.renderer.root.findByProps({ 'aria-label': 'Back to practice' })); assert.equal(h.interval.snapshot.status, 'SUSPENDED')
  await roundTrip(h); await h.switchTo('en'); contains(h.getText(), 'End this session?')
  await click(h.renderer.root.findByProps({ className: 'early-end-dialog__actions' }).findAllByType('button')[0]); assert.equal(h.interval.snapshot.status, 'RUNNING')
  assert.equal(h.renderer.root.findAllByProps({ role: 'dialog' }).length, 0)
}))
test('E19', 'scope freeze preserves Preparation and all unrelated main declarations/events/effects and legacy record branches', () => {
  const allowed = new Set(['IntervalPracticeSetupScreen', 'IntervalPracticeActiveScreen', 'IntervalReportFacts', 'IntervalResultScreen', 'IntervalReportDetailScreen', 'HistoryRecord', 'HistoryScreen', 'HistoryTrendChart', 'IntervalPersistenceErrorNotice'])
  assert.deepEqual([...current.keys()], [...previous.keys()])
  for (const [name, body] of current) if (!allowed.has(name)) assert.equal(body, previous.get(name), name)
  assert.equal(createHash('sha256').update(current.get('IntervalPracticeSetupScreen')).digest('hex'), '75ed16732bfdc17dfdfca0d0e714f2f15f6d75fdca83c15405c0c35ee6038918')
  function lifecycle(body) {
    const ast = ts.createSourceFile('body.tsx', body, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), items = []
    function visit(node) {
      if (ts.isCallExpression(node) && ['useEffect', 'useLayoutEffect', 'useState', 'useRef'].includes(node.expression.getText(ast))) items.push(node.getText(ast))
      if (ts.isJsxAttribute(node) && ['onClick', 'onBack', 'disabled', 'key', 'src', 'staffMode', 'keySignature', 'feedback'].includes(node.name.text)) items.push(node.getText(ast))
      ts.forEachChild(node, visit)
    }
    visit(ast); return items
  }
  for (const name of ['IntervalPracticeActiveScreen', 'IntervalReportFacts', 'IntervalResultScreen', 'IntervalReportDetailScreen', 'HistoryRecord', 'HistoryScreen', 'HistoryTrendChart', 'IntervalPersistenceErrorNotice']) assert.deepEqual(lifecycle(current.get(name)), lifecycle(previous.get(name)), name)
  const branch = body => body.slice(body.indexOf("if (item.module === 'chord')"), body.indexOf("if (item.module === 'interval')"))
  assert.equal(branch(current.get('HistoryRecord')), branch(previous.get('HistoryRecord')))
  const sight = body => body.slice(body.lastIndexOf('return ('))
  assert.equal(sight(current.get('HistoryRecord')), sight(previous.get('HistoryRecord')))
  // Preparation resources were added in B4.3: freeze the reviewed checkpoint content, not their absence in the old base.
  const preparationPath = 'prototype/android-tablet-v1/src/localization/intervalPreparationResources.ts'
  const preparationSnapshot = execFileSync('git', ['show', '1024a9f43b6e1a9401e2627eec98ca6e8d13d246:' + preparationPath], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n')
  assert.equal(createHash('sha256').update(preparationSnapshot).digest('hex'), 'bbf7f79543c99097c3322f78b75cd4ee25e50e360efabbd79b3c56d8fa0986bb')
  const assertPreparationFrozen = content => assert.equal(content, preparationSnapshot, 'Preparation resources must match the reviewed B4.3 checkpoint')
  assertPreparationFrozen(read(preparationPath))
  // In-memory mutations exercise the same guard without touching the product file.
  assert.throws(() => assertPreparationFrozen(preparationSnapshot.replace('音程练习', '未授权修改')), { name: 'AssertionError' })
  assert.throws(() => assertPreparationFrozen(preparationSnapshot + '\n// unauthorized content\n'), { name: 'AssertionError' })
  execFileSync('git', ['diff', '--exit-code', base, '--', 'prototype/android-tablet-v1/src/localization/hubResources.ts', 'prototype/android-tablet-v1/src/localization/shellResources.ts', 'prototype/android-tablet-v1/src/localization/theoryQueryResources.ts', 'prototype/android-tablet-v1/src/localization/theoryQueryPresentation.ts', 'prototype/android-tablet-v1/src/practiceKeepAwake.ts'], { cwd: root })
})
test('E20', 'resource semantics/placeholders/plural parity and explicit English exist without fallback', () => {
  const zh = localizationResources['zh-CN'].intervalPractice, en = localizationResources.en.intervalPractice
  const semantic = keys => [...new Set(keys.map(k => k.replace(/_(one|other)$/, '')))].sort()
  assert.deepEqual(semantic(Object.keys(zh)), semantic(Object.keys(en)))
  const instance = createLocalizationInstance('en'); instance.options.fallbackLng = false
  const slots = value => [...value.matchAll(/{{\s*(\w+)\s*}}/g)].map(m => m[1]).sort()
  for (const [key, value] of Object.entries(zh)) for (const variant of key in en ? [key] : [key + '_one', key + '_other']) {
    assert.deepEqual(slots(value), slots(en[variant]), key); assert.equal(instance.exists(variant, { ns: 'intervalPractice', fallbackLng: false }), true); assert.doesNotMatch(en[variant], /[\u3400-\u9fff]/)
  }
  for (const key of ['questions', 'endEndless', 'presented', 'fixedQuestions', 'recordCompletedEndless', 'recordsCount', 'recordsWarning', 'recordsError', 'savedSessions', 'sessionsUnit', 'daysUnit', 'questionsUnit']) {
    assert.ok(key in zh); assert.ok(key + '_one' in en && key + '_other' in en)
    assert.notEqual(instance.t(key, { ns: 'intervalPractice', count: 1 }), instance.t(key, { ns: 'intervalPractice', count: 2 }))
  }
  assert.ok(!('intervals' in en)); assert.ok(!('music' in en))
})
test('E21', '150ms inclusive capture survives bass-incomplete and target-incomplete locale round trips', async () => {
  for (const first of ['rootMidi', 'targetMidi']) await flow(async h => {
    await start(h); const q = question(h), other = first === 'rootMidi' ? 'targetMidi' : 'rootMidi'
    assert.notEqual(q.rootMidi, q.targetMidi)
    await note(h, q[first]); assert.equal(phase(h), 'COLLECTING'); await advance(h, 75); await roundTrip(h)
    // Send second key at the exact inclusive boundary, before the deadline callback is processed.
    h.timers.now += 75; await note(h, q[other]); assert.equal(phase(h), 'SUCCESS')
  })
})
test('E22', 'expired incomplete input is not wrong and cannot acquire extra errors during translation', async () => flow(async h => {
  await start(h); const q = question(h); await note(h, q.rootMidi); await advance(h, 150)
  assert.equal(h.interval.snapshot.currentWrongAttemptCount, 0); await roundTrip(h); assert.equal(question(h), q)
}))
test('E23', 'hint OFF/ON share one mounted Grand Staff and frozen notation props across locale', async () => {
  for (const answerHint of [false, true]) await flow(async h => {
    await start(h); const paper = h.renderer.root.findByType(ui.NotationPaper), notes = JSON.stringify(paper.props.notes)
    assert.equal(paper.props.notes.length, answerHint ? 2 : 1); assert.equal(paper.props.staffMode, 'grand')
    await roundTrip(h); assert.equal(h.renderer.root.findByType(ui.NotationPaper), paper); assert.equal(JSON.stringify(paper.props.notes), notes)
  }, { settings: { answerHint } })
})
test('E24', 'stable IntervalTypeId React rows remain mounted after locale switches', async () => flow(async h => {
  const before = h.renderer.root.findAll(node => node.type === 'article' && node.parent?.props.className === 'interval-performance-list')
  assert.equal(before.length, 1); await roundTrip(h)
  assert.deepEqual(h.renderer.root.findAll(node => node.type === 'article' && node.parent?.props.className === 'interval-performance-list'), before)
  const source = current.get('IntervalReportFacts'); assert.match(source, /key=\{entry.intervalId\}/); assert.doesNotMatch(source, /key=\{.*(?:label|intervalName)/)
}, { screen: 'interval-report-detail' }))
test('E25', 'date/time/percentage display preserves numeric facts and unknown null values', () => {
  assert.equal(display.formatIntervalReportAccuracy(null, 'en'), '—')
  for (const value of [0, 33.33333, 99.95, 100]) assert.equal(display.formatIntervalReportAccuracy(value, 'en'), display.formatIntervalReportAccuracy(value, 'zh-CN'))
  const timestamp = 1750000060000
  assert.match(display.formatIntervalHistoryTimestamp(timestamp, 'en'), /2025/)
  assert.doesNotMatch(display.formatIntervalHistoryTimestamp(timestamp, 'en'), /[\u3400-\u9fff]/)
  assert.match(display.formatIntervalHistoryTimestamp(timestamp, 'zh-CN'), /月/)
})
test('E26', 'unavailable Detail and persistence load/save errors are bilingual, with original retry/back handlers', async () => {
  await flow(async h => { await h.switchTo('en'); contains(h.getText(), 'Record unavailable'); await roundTrip(h) }, { screen: 'interval-report-detail', unavailable: true })
  for (const errorContext of ['load', 'save']) await flow(async h => {
    await act(async () => h.renderer.update(React.createElement(require('../prototype/android-tablet-v1/src/localization/LocaleProvider.tsx').LocaleProvider, { service: h.service }, React.createElement(ui.IntervalPersistenceErrorNotice, { coordinator: h.persistence, persistence: { status: 'error', errorContext } }))))
    await h.switchTo('en'); assert.doesNotMatch(h.getText(), /[\u3400-\u9fff]/); contains(h.getText(), errorContext === 'load' ? 'could not be read' : 'could not be saved')
  })
})

test('E27', 'zero-completed early Result keeps no-data/null accuracy truthful in both locales', async () => flow(async h => {
  await start(h); await act(async () => h.actions.endIntervalPractice()); await act(async () => h.persistence.flush())
  for (const locale of ['en', 'zh-CN']) {
    await h.switchTo(locale); contains(h.getText(), locale === 'en' ? 'No data' : '暂无数据'); contains(h.getText(), '—')
    assert.equal(h.persistence.snapshot.latestReport.firstTryAccuracy, null); assert.equal(h.persistence.snapshot.latestReport.completedQuestions, 0)
  }
  await roundTrip(h)
}))
test('E28', 'all 26 stable names and accidental/octave spellings project from facts with unchanged notation notes', () => {
  for (const locale of ['en', 'zh-CN']) {
    const instance = createLocalizationInstance(locale), t = instance.getFixedT(locale, 'intervalPractice'), music = instance.getFixedT(locale, 'music')
    for (const intervalId of theory.INTERVAL_TYPE_IDS) for (const answerHint of [false, true]) {
      const currentQuestion = theory.INTERVAL_PRACTICE_CANDIDATES[intervalId][0]
      const state = { settings: { ...practice.DEFAULT_INTERVAL_PRACTICE_SETTINGS, answerHint }, currentQuestion, scheduler: practice.createIntervalSchedulerState() }
      const original = practice.presentIntervalPractice(state), localized = display.presentLocalizedIntervalPractice(state, t, music)
      assert.equal(localized.intervalName, music('intervals.' + intervalId)); contains(localized.prompt, original.rootLabel)
      assert.match(original.rootLabel, /[A-G].*\d/); assert.deepEqual(localized.notation.notes, original.notation.notes)
      assert.equal(localized.notation.answerLabel, original.notation.answerLabel)
      if (locale === 'en') assert.doesNotMatch(localized.prompt + localized.notation.ariaLabel, /[\u3400-\u9fff]/)
    }
  }
})
test('E29', 'shared History filter/range remain selected across locale and chrome is bilingual without translating theme slogan', async () => flow(async h => {
  const filter = () => byClass(h, 'history-filter'), range = () => byClass(h, 'history-range-filter')
  await click(range().findAllByType('button')[1]); await click(filter().findAllByType('button')[0])
  const beforeFilter = h.state().filter, beforeRange = range().findAllByType('button').map(n => n.props.className)
  await roundTrip(h); assert.equal(h.state().filter, beforeFilter); assert.deepEqual(range().findAllByType('button').map(n => n.props.className), beforeRange)
  await h.switchTo('en'); contains(h.getText(), 'Recent practice'); contains(h.getText(), 'Practice trend'); contains(h.getText(), 'Last 30 days')
  // The approved theme-specific headline deliberately remains Chinese in this batch.
  contains(h.getText(), '每一次坚持')
}, { screen: 'history' }))

test('E30', 'shared empty History states remain truthful for every stable filter in both locales', async () => flow(async h => {
  const labels = { all: ['暂无练习记录', 'No practice records yet'], sight: ['暂无识谱练习记录', 'No sight-reading records yet'], chord: ['暂无和弦练习记录', 'No chord practice records yet'], interval: ['暂无音程练习记录', 'No interval practice records yet'] }
  for (const [filter, expected] of Object.entries(labels)) {
    await act(async () => h.state().setFilter(filter))
    for (const [index, locale] of ['zh-CN', 'en'].entries()) { await h.switchTo(locale); contains(h.getText(), expected[index]); assert.equal(h.repository.list().length, 0) }
  }
  await roundTrip(h)
}, { screen: 'history', emptyHistory: true }))

void (async () => {
  let passed = 0
  for (const item of tests) { try { await item.run(); passed++; console.log('PASS ' + item.id + ' ' + item.title) } catch (error) { console.error('FAIL ' + item.id + ' ' + item.title + '\n' + error.stack) } }
  console.log('\n' + passed + '/' + tests.length + ' B4.3 Complete Interval localization checks PASS')
  if (passed !== tests.length) process.exitCode = 1
})()
