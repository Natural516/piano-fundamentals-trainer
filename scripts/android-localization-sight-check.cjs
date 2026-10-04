const { normalizeB46Main, assertFrozenDiff, assertRendererDisplayOnly, stripB46Css } = require('./android-localization-remaining-contract.cjs')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { act } = require('react-test-renderer')
const { mounted, ui, current, declarations, read, text, contains, businessBytes, translator } = require('./android-localization-shell-check.cjs')
const { ANDROID_SIGHT_READING_DEFAULTS } = require('../src/sightReading/sightReadingSettings.ts')
const { createSightReadingSessionCounters } = require('../src/sightReading/sightReadingSession.ts')
const { createSightReadingSessionReport } = require('../src/sightReading/report.ts')
const persistence = require('../prototype/android-tablet-v1/src/androidPersistenceCore.ts')
const { ActivePracticeSessionHost } = require('../prototype/android-tablet-v1/src/activePracticeSession.ts')
const { PracticeKeepAwakeController, shouldKeepPracticeAwake } = require('../prototype/android-tablet-v1/src/practiceKeepAwake.ts')
const { APP_PREFERENCES_KEY } = require('../prototype/android-tablet-v1/src/localization/appPreferences.ts')
const { createLocalizationInstance } = require('../prototype/android-tablet-v1/src/localization/localizationService.ts')
const { sightReadingResources } = require('../prototype/android-tablet-v1/src/localization/sightReadingResources.ts')
const display = require('../prototype/android-tablet-v1/src/localization/sightReadingPresentation.ts')
const { getSightNoteDisplayValue } = require('../prototype/android-tablet-v1/src/localization/legacyPresentation.ts')
const { getSightReadingPrompt } = require('../prototype/android-tablet-v1/src/sightReadingPresentation.ts')
const { SIGHT_READING_DOUBLE_INTERVALS } = require('../src/sightReading/doubleNoteQuestions.ts')
const root = path.resolve(__dirname, '..'), base = 'b4e2fcadf8d4293134c6ff73de5e94d0f9c6697d'
const oldFile = file => execFileSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n')
const previous = declarations(oldFile('prototype/android-tablet-v1/src/main.tsx'))
const tests = [], test = (id, title, run) => tests.push({ id, title, run })

class Timers {
  now = 1000; sequence = 0; pending = new Map(); operations = []; intervals = new Map(); intervalOperations = []
  schedule = (callback, delay) => { const id = ++this.sequence; this.pending.set(id, { callback, due: this.now + delay }); this.operations.push(['schedule', id, delay]); return id }
  cancel = id => { this.operations.push(['cancel', id]); this.pending.delete(id) }
  setInterval = (callback, delay) => { const id = ++this.sequence; this.intervals.set(id, { callback, delay, due: this.now + delay }); this.intervalOperations.push(['set', id, delay]); return id }
  clearInterval = id => { this.intervalOperations.push(['clear', id]); this.intervals.delete(id) }
  advance(ms) {
    const end = this.now + ms
    while (true) {
      const jobs = [...this.pending].map(([id, task]) => ({ id, task, interval: false }))
        .concat([...this.intervals].map(([id, task]) => ({ id, task, interval: true }))).sort((a, b) => a.task.due - b.task.due)
      const next = jobs.find(job => job.task.due <= end)
      if (!next) break
      this.now = next.task.due
      if (next.interval) next.task.due += next.task.delay
      else this.pending.delete(next.id)
      next.task.callback()
    }
    this.now = end
  }
}
function legacyRecord() {
  const record = persistence.createDurableSightReadingReport(createSightReadingSessionReport(ANDROID_SIGHT_READING_DEFAULTS, createSightReadingSessionCounters([]), [], 'stopped'), {
    recordId: 'sight-legacy-real-v1', startedAt: 1750000000000, endedAt: 1750000060000, settings: ANDROID_SIGHT_READING_DEFAULTS
  })
  return { ...record, extraLegacyField: 'do not normalize' }
}
// Extract the unchanged production Start/end handlers, rather than invent new runtime actions.
const app = ts.createSourceFile('app.tsx', current.get('App'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const variable = name => app.statements[0].body.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(app) === name)).getText(app)
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const actions = new Function('useCallback', 'activeSessionHost', 'runtime', 'navigate', compile([variable('startPractice'), variable('endSightPractice'), 'return { startPractice, endSightPractice }'].join('\n')))

async function flow(run, options = {}) {
  const timers = new Timers(), host = new ActivePracticeSessionHost(), awakeCalls = []
  const awake = new PracticeKeepAwakeController({ setEnabled: async value => { awakeCalls.push(value.enabled); return value } })
  let ctx
  function FlowOwner() {
    const [screen, setScreen] = React.useState(options.screen ?? 'sight-ready')
    ctx.screen = screen
    ctx.setScreen = value => { global.window.location.hash = '#' + value }
    React.useEffect(() => {
      let hash = '#' + screen
      Object.defineProperty(global.window.location, 'hash', { configurable: true, get: () => hash, set: value => { hash = value; setScreen(String(value).replace(/^#/, '')) } })
      ctx.ownerMounts++
      return () => { ctx.ownerUnmounts++ }
    }, [])
    const snapshot = ctx.runtime.snapshot
    React.useEffect(() => {
      if (!screen.startsWith('sight-') || screen === 'sight-ready' || screen === 'sight-early-end') return
      const expected = ui.getPracticeScreen(ctx.runtime)
      if (expected !== screen) ctx.setScreen(expected)
    }, [screen, snapshot.phase, snapshot.result, snapshot.status])
    const enabled = shouldKeepPracticeAwake({ appForeground: true, screen, sightStatus: snapshot.status, sightPaused: snapshot.isPaused, chordStatus: 'IDLE', intervalStatus: 'IDLE' })
    React.useEffect(() => { void awake.setEnabled(enabled) }, [enabled])
    if (screen === 'sight-ready') return React.createElement(ui.SightReadyScreen, { settings: ctx.runtime.settings, onStart: ctx.actions.startPractice, onSettingsChange: changes => ctx.runtime.updateSettings(changes) })
    if (screen === 'sight-result') return React.createElement(ui.SightResultScreen, { report: snapshot.report })
    if (screen === 'history') return React.createElement(ui.HistoryScreen, { runtime: ctx.runtime, ...ctx.historyProps, filter: 'sight', onFilterChange: () => {}, onOpenChordReport: () => { throw Error('OUT_OF_SCOPE') }, onOpenIntervalReport: () => { throw Error('OUT_OF_SCOPE') }, theme: ctx.theme })
    return React.createElement(ui.SightFocusScreen, { runtime: ctx.runtime, snapshot, settings: ctx.runtime.settings, theme: ctx.theme, screen, onStopAndSave: ctx.actions.endSightPractice })
  }
  try {
    await mounted('sight-flow', async h => {
      // The real repositories have already loaded these exact noncanonical V1 bytes.
      await run({ ...h, ...ctx, state: () => ctx, timers, host, awake, awakeCalls })
    }, {
      sightRecords: [legacyRecord()], rawSightEvidence: true, runtimeDependencies: { clock: { now: () => timers.now }, scheduler: timers, wallClock: { now: () => 1750000100000 + timers.now }, idGenerator: () => 'new-sight-real-runtime', initialSettings: { ...ANDROID_SIGHT_READING_DEFAULTS, questionCount: 10, ...options.settings } },
      windowTimers: { setInterval: timers.setInterval, clearInterval: timers.clearInterval },
      render({ runtime, theme }) {
        if (!ctx) {
          ctx = { runtime, theme: { ...theme, id: options.themeId ?? 'light', capabilities: { ...theme.capabilities, historyVisual: { kind: 'standard' }, practiceActiveVisual: options.decorated ? { kind: 'decorated-focus', frameClassName: 'existing-theme-class', assets: { decorations: '/existing/decor.png', cornerCharacter: '/existing/character.png' } } : { kind: 'standard' } } }, ownerMounts: 0, ownerUnmounts: 0 }
          ctx.actions = actions(fn => fn, host, runtime, value => ctx.setScreen(value))
          ctx.historyProps = { chordHistory: { status: 'ready', records: [] }, chordPersistence: { refresh: async () => {} }, intervalHistory: { status: 'ready', records: [] }, intervalPersistence: { refresh: async () => {} } }
        }
        return React.createElement(FlowOwner)
      }
    })
  } finally { await awake.dispose() }
}
const click = async node => act(async () => node.props.onClick())
const advance = async (h, ms) => act(async () => h.timers.advance(ms))
async function start(h) { await click(h.renderer.root.findByProps({ className: 'primary-action is-wide' })); assert.equal(h.state().screen, 'sight-active'); await advance(h, 32) }
async function note(h, pitch, on = true, velocity = 96) {
  await act(async () => h.plugin.listeners.get('midiMessage')({ bytes: [on ? 0x90 : 0x80, pitch, on ? velocity : 0], nativeTimestampNanos: h.timers.now * 1e6, callbackReceivedNanos: h.timers.now * 1e6, identity: h.plugin.state.activeInput, deliveryEpoch: h.plugin.state.deliveryEpoch }))
}
async function answer(h, correct = true) {
  const pitches = h.runtime.snapshot.currentTargetNotes.map(n => n.midiNumber)
  for (const pitch of correct ? pitches : [pitches[0] === 36 ? 37 : 36]) await note(h, pitch)
  if (h.runtime.settings.noteMode === 'double') await advance(h, 150)
  for (const pitch of correct ? pitches : [pitches[0] === 36 ? 37 : 36]) await note(h, pitch, false)
}
async function roundTrip(h) {
  const runtime = h.runtime, core = runtime.controller.core
  const before = {
    snapshot: JSON.stringify(runtime.snapshot), core, notes: runtime.snapshot.currentTargetNotes, note: runtime.snapshot.currentNote, report: runtime.snapshot.report,
    deadline: core.questionDeadlineMs, started: core.questionStartedAtMs, capture: core.captureDeadlineMs, timer: runtime.controller.timer, generation: runtime.controller.timerGeneration,
    settings: runtime.settings, sessionSettings: runtime.sessionSettings, remaining: runtime.getRemainingTimeMs(), counters: JSON.stringify(core.counters),
    native: [...h.plugin.calls], listeners: [...h.plugin.listeners], registrations: h.plugin.registrations, provider: runtime.midiInput, router: runtime.midiRouter,
    observers: [...runtime.midiRouter.observers], input: JSON.stringify(runtime.bluetoothSnapshot), boundary: runtime.midiBoundaryVersion, source: runtime.midiSource,
    timers: [...h.timers.operations], pending: [...h.timers.pending], intervalOperations: [...h.timers.intervalOperations], intervals: [...h.timers.intervals], host: h.host.current,
    awake: [h.awake.desiredEnabled, h.awake.appliedEnabled, ...h.awakeCalls], bytes: businessBytes(h.backend), writes: h.backend.writes.length,
    screen: h.state().screen, route: global.window.location.hash, theme: h.themeManager.snapshot,
    staff: h.renderer.root.findAllByProps({ 'data-test-staff': 'wiring-only' })[0], window: global.window.snapshot(), document: global.document.snapshot()
  }
  for (const locale of ['en', 'zh-CN']) {
    await h.switchTo(locale)
    assert.equal(h.runtime, runtime); assert.equal(runtime.controller.core, before.core); assert.equal(runtime.snapshot.currentTargetNotes, before.notes); assert.equal(runtime.snapshot.currentNote, before.note); assert.equal(runtime.snapshot.report, before.report)
    assert.equal(JSON.stringify(runtime.snapshot), before.snapshot); assert.deepEqual(runtime.settings, before.settings); assert.equal(runtime.sessionSettings, before.sessionSettings)
    assert.equal(core.questionDeadlineMs, before.deadline); assert.equal(core.questionStartedAtMs, before.started); assert.equal(core.captureDeadlineMs, before.capture)
    assert.equal(runtime.controller.timer, before.timer); assert.equal(runtime.controller.timerGeneration, before.generation); assert.equal(runtime.getRemainingTimeMs(), before.remaining); assert.equal(JSON.stringify(core.counters), before.counters)
    assert.equal(runtime.midiInput, before.provider); assert.equal(runtime.midiRouter, before.router); assert.deepEqual([...runtime.midiRouter.observers], before.observers)
    assert.deepEqual(h.plugin.calls, before.native); assert.deepEqual([...h.plugin.listeners], before.listeners); assert.equal(h.plugin.registrations, before.registrations)
    assert.equal(JSON.stringify(runtime.bluetoothSnapshot), before.input); assert.equal(runtime.midiBoundaryVersion, before.boundary); assert.equal(runtime.midiSource, before.source)
    assert.deepEqual(h.timers.operations, before.timers); assert.deepEqual([...h.timers.pending], before.pending); assert.deepEqual(h.timers.intervalOperations, before.intervalOperations); assert.deepEqual([...h.timers.intervals], before.intervals)
    assert.deepEqual(h.host.current, before.host); assert.deepEqual([h.awake.desiredEnabled, h.awake.appliedEnabled, ...h.awakeCalls], before.awake)
    assert.deepEqual(businessBytes(h.backend), before.bytes); assert.ok(h.backend.writes.slice(before.writes).every(w => w.key === APP_PREFERENCES_KEY))
    assert.equal(global.window.location.hash, before.route); assert.equal(h.state().screen, before.screen); assert.equal(h.themeManager.snapshot, before.theme); assert.deepEqual(h.pointerCalls, [])
    assert.deepEqual(global.window.snapshot(), before.window); assert.deepEqual(global.document.snapshot(), before.document)
    if (before.staff) assert.equal(h.renderer.root.findByProps({ 'data-test-staff': 'wiring-only' }), before.staff)
    assert.equal(h.state().ownerMounts, 1); assert.equal(h.state().ownerUnmounts, 0); assert.deepEqual(h.lifecycle(), { mounts: 1, unmounts: 0 })
  }
}
test('SIGHT-E1', 'mounted Preparation and settings drawer are bilingual without fallback or invented settings', async () => flow(async h => {
  contains(h.getText(), '识谱练习'); await h.switchTo('en'); contains(h.getText(), 'Sight Reading'); contains(h.getText(), 'Grand staff'); contains(h.getText(), 'C Major')
  await click(h.renderer.root.findByProps({ 'aria-label': 'Sight Reading settings' }))
  for (const label of ['Single notes', 'Note pairs', 'Show note names', 'Default staff', 'Time per question']) contains(h.getText(), label)
  assert.doesNotMatch(h.getText(), /[\u3400-\u9fff]/); await roundTrip(h)
}))
test('SIGHT-E2', 'actual select values and handlers preserve all settings IDs, counts and 15 keys', async () => flow(async h => {
  await click(h.renderer.root.findByProps({ 'aria-label': '识谱练习设置' }))
  const values = () => h.renderer.root.findAllByType('select').map(n => ({ value: n.props.value, options: n.findAllByType('option').map(o => o.props.value) }))
  const initial = values(); await roundTrip(h); assert.deepEqual(values(), initial)
  assert.equal(initial[1].options.length, 15); assert.deepEqual(initial[2].options, ['single', 'double']); assert.deepEqual(initial[4].options, ['10', '20', '50', '100'])
  await act(async () => h.renderer.root.findAllByType('select')[2].props.onChange({ target: { value: 'double' } }))
  assert.equal(h.runtime.settings.noteMode, 'double'); assert.equal(h.runtime.settings.noteCount, 2); contains(h.getText(), '双音固定调内'); contains(h.getText(), '7 秒')
}))
test('SIGHT-E3', 'actual production Start creates original ACTIVE/session, with no manual Next or Skip', async () => flow(async h => {
  await start(h); assert.equal(h.runtime.snapshot.phase, 'answering'); assert.equal(h.host.current.module, 'sight'); assert.equal(h.awake.desiredEnabled, true)
  await h.switchTo('en'); contains(h.getText(), 'Play this note'); assert.doesNotMatch(h.getText(), /Next|Skip|Retry/)
}))
test('SIGHT-E4', 'ACTIVE labels, progress and aria render both locales; notation never translates', async () => flow(async h => {
  await start(h); contains(h.getText(), '请弹出这个音'); await h.switchTo('en'); contains(h.getText(), 'Question 1'); contains(h.getText(), 'Pause')
  assert.equal(h.renderer.root.findByProps({ className: 'focus-time-track' }).props['aria-label'], 'Time remaining for this question')
  assert.doesNotMatch(h.getText(), /[\u3400-\u9fff]/); await roundTrip(h)
}, { settings: { noteNameVisible: true, keySignature: 'Gb' } }))
test('SIGHT-E5', 'same question/note array/staff instance remains owned across live locale switching', async () => flow(async h => { await start(h); await roundTrip(h) }))
test('SIGHT-E6', 'single first-note judgement and fixed 5000 ms remain unchanged', async () => flow(async h => {
  await start(h); assert.equal(h.runtime.getRemainingTimeMs(), 5000); await roundTrip(h); await answer(h); assert.equal(h.runtime.snapshot.result, 'correct'); assert.equal(h.runtime.snapshot.completedQuestions, 1)
  await roundTrip(h); await advance(h, 349); assert.equal(h.runtime.snapshot.phase, 'feedback'); await advance(h, 1); assert.equal(h.runtime.snapshot.phase, 'display')
}))
test('SIGHT-E7', 'pair identity/capture 150 ms/fixed 7000 ms/correct 1200 ms feedback remain intact', async () => flow(async h => {
  await start(h); assert.equal(h.runtime.snapshot.currentTargetNotes.length, 2); assert.equal(h.runtime.getRemainingTimeMs(), 7000); await roundTrip(h)
  await note(h, h.runtime.snapshot.currentTargetNotes[0].midiNumber); await advance(h, 70); await roundTrip(h)
  await note(h, h.runtime.snapshot.currentTargetNotes[1].midiNumber); await advance(h, 79); assert.equal(h.runtime.snapshot.result, null); await advance(h, 1)
  assert.equal(h.runtime.snapshot.result, 'correct'); await roundTrip(h); await h.switchTo('en'); contains(h.getText(), 'Correct ·'); assert.doesNotMatch(h.getText(), /[\u3400-\u9fff]/)
  await advance(h, 1199); assert.equal(h.runtime.snapshot.phase, 'feedback'); await advance(h, 1); assert.equal(h.runtime.snapshot.phase, 'display')
}, { settings: { noteMode: 'double', noteCount: 2 } }))
test('SIGHT-E8', 'elapsed deadline, remaining time and the mounted 100 ms UI timer do not restart', async () => flow(async h => {
  await start(h); await advance(h, 2100); assert.equal(h.runtime.getRemainingTimeMs(), 2900); assert.equal(h.timers.intervals.size, 1); await roundTrip(h)
}))
test('SIGHT-E9', 'near-timeout locale switch does not extend deadline or produce duplicate outcomes', async () => flow(async h => {
  await start(h); await advance(h, 4999); assert.equal(h.runtime.getRemainingTimeMs(), 1); await roundTrip(h); await advance(h, 1)
  assert.equal(h.runtime.snapshot.result, 'timeout'); assert.equal(h.runtime.snapshot.timeoutCount, 1); await roundTrip(h); await advance(h, 350); await advance(h, 32); assert.equal(h.runtime.snapshot.completedQuestions, 1)
}))
test('SIGHT-E10', 'correct/wrong/timeout feedback display switches but counters and scheduled progression remain fixed', async () => {
  for (const outcome of ['correct', 'wrong_note', 'timeout']) await flow(async h => {
    await start(h); if (outcome === 'timeout') await advance(h, 5000); else await answer(h, outcome === 'correct')
    assert.equal(h.runtime.snapshot.result, outcome); await roundTrip(h); await h.switchTo('en')
    contains(h.getText(), { correct: 'Correct', wrong_note: 'Incorrect note', timeout: 'Time expired' }[outcome]); await advance(h, 350); assert.equal(h.runtime.snapshot.phase, 'display')
  })
})
test('SIGHT-E11', 'paused remainder and explicit Resume preserve the original deadline semantics', async () => flow(async h => {
  await start(h); await advance(h, 1100); await click(h.renderer.root.findByProps({ className: 'outline-action' })); assert.equal(h.runtime.snapshot.isPaused, true)
  await roundTrip(h); await advance(h, 9000); assert.equal(h.runtime.snapshot.completedQuestions, 0); await h.switchTo('en'); contains(h.getText(), 'Practice paused')
  await click(h.renderer.root.findByProps({ className: 'outline-action' })); assert.equal(h.runtime.getRemainingTimeMs(), 3900); await roundTrip(h)
}))
test('SIGHT-E12', 'MIDI disconnect/recovery remains paused, input/generation/listeners/session unchanged by locale', async () => flow(async h => {
  await start(h); await act(async () => h.plugin.disconnect()); assert.equal(h.runtime.snapshot.isPaused, true); assert.equal(h.runtime.midiResumeRequired, true)
  await roundTrip(h); await h.switchTo('en'); contains(h.getText(), 'MIDI disconnected'); assert.equal(h.renderer.root.findByProps({ className: 'outline-action' }).props.disabled, true)
  await act(async () => h.runtime.midiInput.connect('usb-identity', 3)); assert.equal(h.runtime.snapshot.isPaused, true); contains(h.getText(), 'Select Resume'); await roundTrip(h)
}))
async function complete(h) {
  await start(h)
  for (let i = 0; i < 10; i++) { await answer(h); await advance(h, 350); if (i !== 9) await advance(h, 32) }
  await act(async () => h.runtime.flushPersistence()); assert.equal(h.state().screen, 'sight-result')
}
test('SIGHT-E13', 'real completed runtime Result is bilingual with truthful unchanged metrics/CTA', async () => flow(async h => {
  await complete(h); contains(h.getText(), '识谱练习结果'); await h.switchTo('en'); contains(h.getText(), 'Sight Reading result'); contains(h.getText(), 'Practice again'); contains(h.getText(), '100'); assert.doesNotMatch(h.getText(), /[\u3400-\u9fff]/)
}))
test('SIGHT-E14', 'Result object/body/index/time/statistics are unchanged and never resaved on locale', async () => flow(async h => { await complete(h); await roundTrip(h); assert.equal(h.runtime.historySnapshot.records.length, 2) }))
test('SIGHT-E15', 'exact legacy sentinel has bilingual semantic empty display; English V1 writer still writes 暂无', async () => flow(async h => {
  await complete(h); const report = h.runtime.snapshot.report
  for (const key of ['weakestNote', 'mostWrongNote', 'mostTimedOutNote']) assert.equal(report[key], '暂无')
  await h.switchTo('en'); contains(h.getText(), 'No data'); await roundTrip(h)
  const raw = h.backend.values.get(persistence.ANDROID_PERSISTENCE_KEYS.sightReadingReportPrefix + 'new-sight-real-runtime')
  assert.ok(raw); assert.equal(JSON.parse(raw).weakestNote, '暂无'); assert.doesNotMatch(raw, /No data/)
}))
test('SIGHT-E16', 'real note strings and unknown legacy text are displayed verbatim, never trimmed/normalized', () => {
  for (const locale of ['zh-CN', 'en']) for (const note of ['C4', 'F♯3', 'B♭2', ' 暂无 ', 'Old legal note text']) assert.equal(getSightNoteDisplayValue(note, translator(locale, 'common')), note)
  assert.equal(getSightNoteDisplayValue('暂无', translator('en', 'common')), 'No data')
})
test('SIGHT-E17', 'actual Sight History row is bilingual and remains a noninteractive record, no invented Detail', async () => flow(async h => {
  const row = () => h.renderer.root.findByProps({ className: 'history-row is-stopped' }); contains(text(row()), '识谱'); const node = row()
  await h.switchTo('en'); contains(text(row()), 'Sight Reading'); contains(text(row()), 'Grand staff'); contains(text(row()), 'C Major'); contains(text(row()), 'Ended early'); assert.doesNotMatch(text(row()), /[\u3400-\u9fff]/); assert.equal(row(), node)
}, { screen: 'history' }))
test('SIGHT-E18', 'legal legacy History raw body/index/timestamps/settings retain exact bytes across locale', async () => flow(async h => {
  const raw = businessBytes(h.backend); assert.ok(raw.some(([key, value]) => key.includes('report.') && value.includes('extraLegacyField')))
  await roundTrip(h); assert.deepEqual(businessBytes(h.backend), raw); assert.equal(h.runtime.historySnapshot.records.length, 1)
}, { screen: 'history' }))
test('SIGHT-E19', 'existing Light/Dark/decorated assets and theme pointers remain exact without new art', async () => {
  for (const themeId of ['light', 'dark', 'bocchi']) await flow(async h => {
    await start(h); const images = h.renderer.root.findAllByType('img').map(n => n.props.src); assert.deepEqual(images, themeId === 'bocchi' ? ['/existing/decor.png', '/existing/decor.png', '/existing/character.png'] : [])
    await roundTrip(h); assert.deepEqual(h.renderer.root.findAllByType('img').map(n => n.props.src), images)
  }, { themeId, decorated: themeId === 'bocchi' })
})
test('SIGHT-E20', 'Result/History metric and row instances persist; all React keys use stable identities', async () => {
  await flow(async h => { await complete(h); const metrics = h.renderer.root.findByProps({ className: 'result-metrics' }).findAllByType('div'); await roundTrip(h); assert.deepEqual(h.renderer.root.findByProps({ className: 'result-metrics' }).findAllByType('div'), metrics) })
  await flow(roundTrip, { screen: 'history' })
  assert.match(current.get('HistoryScreen'), /key=\{`\$\{item.module\}-\$\{item.recordId\}`\}/)
  assert.doesNotMatch(current.get('SightResultScreen'), /key=\{.*(?:label|displayName|noteName)/)
})
test('SIGHT-E21', 'pair WRONG/timeout 1600 ms feedback and input capture facts survive locale switching', async () => {
  for (const outcome of ['wrong_note', 'timeout']) await flow(async h => {
    await start(h); if (outcome === 'timeout') await advance(h, 7000); else await answer(h, false)
    assert.equal(h.runtime.snapshot.result, outcome); await roundTrip(h); await h.switchTo('en'); assert.doesNotMatch(h.getText(), /[\u3400-\u9fff]/)
    assert.ok(h.timers.operations.some(op => op[0] === 'schedule' && op[2] === 1600))
    const feedbackRemaining = h.runtime.controller.advanceDeadline - h.timers.now
    await advance(h, feedbackRemaining - 1); assert.equal(h.runtime.snapshot.phase, 'feedback'); await advance(h, 1); assert.equal(h.runtime.snapshot.phase, 'display')
  }, { settings: { noteMode: 'double', noteCount: 2 } })
})
test('SIGHT-E22', 'early-end confirmation/cancel/end keeps original handlers and saves partial report once', async () => flow(async h => {
  await start(h); await answer(h); await advance(h, 350); await advance(h, 32)
  await click(h.renderer.root.findByProps({ className: 'focus-back' })); assert.equal(h.state().screen, 'sight-early-end'); await roundTrip(h)
  await h.switchTo('en'); contains(h.getText(), 'End this session?'); await click(h.renderer.root.findByProps({ className: 'early-end-dialog__actions' }).findAllByType('button')[0]); assert.equal(h.runtime.snapshot.isPaused, false)
  await click(h.renderer.root.findByProps({ className: 'focus-back' })); await click(h.renderer.root.findByProps({ className: 'early-end-dialog__actions' }).findAllByType('button')[1]); await act(async () => h.runtime.flushPersistence())
  assert.equal(h.runtime.snapshot.status, 'stopped'); assert.equal(h.runtime.snapshot.report.completedQuestions, 1); assert.equal(h.runtime.snapshot.report.completionState, 'stopped'); assert.equal(h.host.current, null); assert.equal(h.state().screen, 'sight-ready'); assert.equal(h.runtime.historySnapshot.records.length, 2)
}))
test('SIGHT-E23', 'namespace semantic/placeholder parity; every English key explicit with fallback disabled', () => {
  const flat = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) => typeof child === 'string' ? [[prefix + key, child]] : flat(child, prefix + key + '.'))
  const zh = flat(sightReadingResources['zh-CN']), en = new Map(flat(sightReadingResources.en)), semantic = keys => [...new Set(keys.map(k => k.replace(/_(one|other)$/, '')))].sort()
  assert.equal(zh.length, 107); assert.equal(en.size, 116); assert.deepEqual(semantic(zh.map(([key]) => key)), semantic([...en.keys()]))
  const slots = value => [...value.matchAll(/{{\s*(\w+)\s*}}/g)].map(m => m[1]).sort(), instance = createLocalizationInstance('en'); instance.options.fallbackLng = false
  for (const [key, value] of en) { assert.ok(value.trim()); assert.doesNotMatch(value, /[\u3400-\u9fff]/); assert.equal(instance.exists(key, { ns: 'sightReading', lng: 'en', fallbackLng: false }), true) }
  for (const [key, value] of zh) for (const variant of en.has(key) ? [key] : [key + '_one', key + '_other']) assert.deepEqual(slots(value), slots(en.get(variant)), key)
  for (const count of [1, 2, 10]) assert.equal(instance.t('singleQuestions', { ns: 'sightReading', count }), `${count} ${count === 1 ? 'note' : 'notes'}`)
})
test('SIGHT-E24', 'all legacy Chinese prompts remain equivalent; pairs translate from pitch facts not Chinese labels', () => {
  const t = translator('zh-CN', 'sightReading'), music = translator('zh-CN', 'music')
  for (const interval of SIGHT_READING_DOUBLE_INTERVALS) for (const outcome of [null, 'correct', 'wrong_note', 'timeout']) {
    const notes = [{ midiNumber: 60 }, { midiNumber: 60 + interval.semitones }]
    const options = { notes, noteMode: 'double', outcome, paused: false, pausedPrompt: 'paused' }
    assert.equal(display.presentSightPrompt(options, t, music), getSightReadingPrompt({ ...options, intervalLabel: interval.label }))
    assert.doesNotMatch(display.presentSightPrompt(options, translator('en', 'sightReading'), translator('en', 'music')), /[\u3400-\u9fff]/)
  }
})
test('SIGHT-E25', 'scope freeze: domain/native/runtime/Interval and Chord branches/shared History stay exact', () => {
  const allowed = new Set(['ChordModeSelectScreen', 'ChordGroupBadge', 'ChordSettingsDrawer', 'ChordPracticeScreen', 'ChordReportDetailScreen', 'ChordPersistenceErrorNotice', 'HistoryScreen', 'SightSettingsRows', 'SightSettingsDrawer', 'SightReadyScreen', 'PracticeFocusHeader', 'SightFocusScreen', 'SightResultScreen', 'HistoryRecord', 'PersistenceErrorNotice'])
  assert.deepEqual([...current.keys()], [...previous.keys()]); for (const [name, body] of current) if (!allowed.has(name)) assert.equal(body, previous.get(name), name)
  // B4.5 changes Chord display only. Interval remains byte-frozen; CHORD-E20 also freezes the reviewed Sight display.
  const branches = body => body.slice(body.indexOf("if (item.module === 'interval')"), body.indexOf('  const sightPresentation'))
  const oldBranches = previous.get('HistoryRecord').slice(previous.get('HistoryRecord').indexOf("if (item.module === 'interval')"), previous.get('HistoryRecord').lastIndexOf('  return ('))
  assert.equal(branches(current.get('HistoryRecord')), oldBranches)
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', base, '--', 'src/sightReading', 'android', 'prototype/android-tablet-v1/src/intervalPractice', 'prototype/android-tablet-v1/src/chordPractice', 'prototype/android-tablet-v1/src/musicTheory', 'prototype/android-tablet-v1/src/theme'], { cwd: root, encoding: 'utf8' }).trim().split('\n')
  files.push(...['sightReadingIntegration.ts', 'sightReadingPresentation.ts', 'sightReadingFeedbackPresentation.ts', 'androidBluetoothMidi.ts', 'androidBluetoothMidiCore.ts', 'androidPersistenceCore.ts', 'historyProjection.ts', 'mixedHistoryProjection.ts', 'activePracticeSession.ts', 'practiceKeepAwake.ts'].map(n => 'prototype/android-tablet-v1/src/' + n))
  files.push(...['intervalPracticePresentation.ts', 'intervalPreparationResources.ts', 'intervalFlowResources.ts', 'legacyPresentation.ts', 'LegacyDisplayValues.tsx'].map(n => 'prototype/android-tablet-v1/src/localization/' + n))
  for (const file of files) {
    const raw = execFileSync('git', ['show', `${base}:${file}`], { cwd: root }); const fs = require('node:fs'), now = fs.readFileSync(path.join(root, file))
    // Source checkout line endings are not domain facts. Binary theme files remain byte-exact.
    if (/\.(?:ts|tsx|kt|xml|gradle|properties|json|java|md|gitignore|bat|sh)$/.test(file)) assert.equal(now.toString().replaceAll('\r\n', '\n'), raw.toString().replaceAll('\r\n', '\n'), file)
    else assert.equal(createHash('sha256').update(now).digest('hex'), createHash('sha256').update(raw).digest('hex'), file)
  }
  assert.doesNotMatch(read('src/sightReading/controller.ts'), /i18next|LocaleProvider|document\./)
})
test('SIGHT-E26', 'Sight lifecycle/actions/selected IDs/notation/key props byte frozen; only scoped CSS adds wrapping', () => {
  function protectedNodes(body) {
    const ast = ts.createSourceFile('ui.tsx', body, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), nodes = []
    function visit(n) {
      if (ts.isCallExpression(n) && ['useEffect', 'useState', 'useRemainingTime'].includes(n.expression.getText(ast))) nodes.push(n.getText(ast))
      if (ts.isJsxAttribute(n) && ['onClick', 'onChange', 'onBack', 'onSettingsChange', 'onStart', 'onStopAndSave', 'disabled', 'key', 'value', 'src', 'note', 'notes', 'staffMode', 'keySignature', 'feedback', 'noteFeedback'].includes(n.name.text)) nodes.push(n.getText(ast))
      ts.forEachChild(n, visit)
    } visit(ast); return nodes
  }
  for (const name of ['SightSettingsRows', 'SightSettingsDrawer', 'SightReadyScreen', 'PracticeFocusHeader', 'SightFocusScreen', 'SightResultScreen', 'PersistenceErrorNotice']) assert.deepEqual(protectedNodes(current.get(name)), protectedNodes(previous.get(name)), name)
  const css = stripB46Css(read('prototype/android-tablet-v1/src/styles.css')), original = oldFile('prototype/android-tablet-v1/src/styles.css')
  assert.ok(css.startsWith(original)); const addition = css.slice(original.length); assert.doesNotMatch(addition, /(?:^|\n)\s*(?:height|width|transform|position):|--paper|\.notation-paper|\.music-staff/)
  assert.match(addition, /sight-ready-layout/); assert.match(addition, /sight-result-layout/); assert.match(addition, /sight-focus-frame/)
  assert.match(addition, /\.settings-group--sight \.setting-row__copy small \{\s*overflow: visible;\s*white-space: normal;/)
})
test('SIGHT-E27', 'completed report with a real missed note keeps spelling/count/reaction facts across both locales', async () => flow(async h => {
  await start(h); const target = h.runtime.snapshot.currentNote.noteName
  await advance(h, 80); await answer(h, false); await advance(h, 350); await advance(h, 32)
  for (let i = 1; i < 10; i++) { await advance(h, 80); await answer(h); await advance(h, 350); if (i !== 9) await advance(h, 32) }
  await act(async () => h.runtime.flushPersistence()); assert.equal(h.state().screen, 'sight-result')
  assert.equal(h.runtime.snapshot.report.weakestNote, target); assert.equal(h.runtime.snapshot.report.wrong, 1); assert.equal(h.runtime.snapshot.report.averageReactionMs, 80)
  contains(h.getText(), target); contains(h.getText(), '0.08 秒'); await h.switchTo('en'); contains(h.getText(), target); contains(h.getText(), '0.08 s'); contains(h.getText(), '1 wrong answer or timeout'); await roundTrip(h)
}, { settings: { keySignature: 'Gb' } }))
void (async () => {
  let passed = 0
  for (const item of tests) { try { await item.run(); passed++; console.log('PASS ' + item.id + ' ' + item.title) } catch (error) { console.error('FAIL ' + item.id + ' ' + item.title + '\n' + error.stack) } }
  console.log(`\n${passed}/${tests.length} B4.4 Complete Sight Reading localization checks PASS`)
  if (passed !== tests.length) process.exitCode = 1
})()
