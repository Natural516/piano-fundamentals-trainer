const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const React = require('react'), { act } = require('react-test-renderer')
const { mounted, ui, current, declarations, read, text, contains, businessBytes, translator } = require('./android-localization-shell-check.cjs')
const root = path.resolve(__dirname, '..'), base = 'ed14ca99e044fd5f3ed6f057c722f65d0ab58b58'
const oldFile = file => execFileSync('git', ['show', base + ':' + file], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n')
const previous = declarations(oldFile('prototype/android-tablet-v1/src/main.tsx'))
const { ChordPracticeRuntime } = require('../prototype/android-tablet-v1/src/chordPractice/runtime')
const { ChordReportRepository, ChordReportPersistenceCoordinator, CHORD_REPORT_STORAGE_KEYS } = require('../prototype/android-tablet-v1/src/chordPractice/persistence.ts')
const { ChordSettingsRepository, DEFAULT_CHORD_SETTINGS, CHORD_SETTINGS_STORAGE_KEY } = require('../prototype/android-tablet-v1/src/chordPractice/settings.ts')
const { createChordPracticeReport, isChordPracticeReportV1 } = require('../prototype/android-tablet-v1/src/chordPractice/report.ts')
const { projectChordHistory } = require('../prototype/android-tablet-v1/src/chordPractice/historyProjection.ts')
const { projectChordReportDetail } = require('../prototype/android-tablet-v1/src/chordPractice/reportDetailProjection.ts')
const { presentChordPractice } = require('../prototype/android-tablet-v1/src/chordPractice/presentation.ts')
const theory = require('../prototype/android-tablet-v1/src/musicTheory/chords')
const display = require('../prototype/android-tablet-v1/src/localization/chordPracticePresentation.ts')
const { chordPracticeResources: resources } = require('../prototype/android-tablet-v1/src/localization/chordPracticeResources.ts')
const { createLocalizationInstance } = require('../prototype/android-tablet-v1/src/localization/localizationService.ts')
const { APP_PREFERENCES_KEY } = require('../prototype/android-tablet-v1/src/localization/appPreferences.ts')
const { ActivePracticeSessionHost } = require('../prototype/android-tablet-v1/src/activePracticeSession.ts')
const { PracticeKeepAwakeController, shouldKeepPracticeAwake } = require('../prototype/android-tablet-v1/src/practiceKeepAwake.ts')
const tests = [], test = (id, title, run) => tests.push({ id, title, run })

class Time {
  value = 1000; sequence = 0; jobs = new Map(); operations = []
  now = () => this.value
  schedule = (callback, delay) => { const id = ++this.sequence; this.jobs.set(id, { callback, at: this.value + delay }); this.operations.push(['schedule', id, delay]); return id }
  cancel = id => { this.jobs.delete(id); this.operations.push(['cancel', id]) }
  advance(ms) {
    const end = this.value + ms
    while (true) {
      const next = [...this.jobs].sort((a,b) => a[1].at - b[1].at).find(([,job]) => job.at <= end)
      if (!next) break
      this.value = next[1].at; this.jobs.delete(next[0]); next[1].callback()
    }
    this.value = end
  }
}
function legacyRecord() {
  const timing = { sampleCount: 3, medianMs: 12.25 }
  return { ...createChordPracticeReport('chord-report-1', {
    startedAtEpochMs: 1750000000000, endedAtEpochMs: 1750000060000, completionReason: 'stopped',
    practiceMode: 'sequential', sequentialKey: 'Cb', plannedQuestionCount: 20, completedQuestions: 3,
    firstPassCompleteQuestions: 2, arpeggioErrors: 1, blockErrors: 2, totalErrors: 3, longestFirstPassStreak: 2, practiceDurationMs: 60000,
    timingSummary: Object.fromEntries(['questionStartLatencyMs','arpeggioDurationMs','switchToBlockLatencyMs','blockLandingSpreadMs'].map(id => [id, timing]))
  }), modeSummary: '旧显示文字 · 不得解析', extraLegacyField: 'retain exact bytes' }
}
const app = ts.createSourceFile('app.tsx', current.get('App'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const variable = name => app.statements[0].body.statements.find(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(app) === name)).getText(app)
const endFactory = new Function('useCallback','activeSessionHost','chordRuntime','chordPersistence','navigate', compile(variable('endChordPractice') + '\nreturn endChordPractice'))
const modeBody = current.get('App').match(/onSelectMode=\{\(mode\) => \{([^}]+)\}\}/)[1]
const selectFactory = new Function('activeSessionHost','setChordPracticeMode','navigate', 'return mode => {' + modeBody + '}')
const finalizeEffect = app.statements[0].body.statements.find(n => ts.isExpressionStatement(n) && ts.isCallExpression(n.expression) && n.expression.expression.getText(app) === 'useEffect' && n.expression.arguments[0].getText(app).includes('chordRuntime.subscribe')).getText(app)
const subscribeFactory = new Function('useEffect','activeSessionHost','chordRuntime','chordPersistence',compile(finalizeEffect))
async function flow(run, options = {}) {
  const time = new Time(), host = new ActivePracticeSessionHost(), awakeCalls = []
  const awake = new PracticeKeepAwakeController({ setEnabled: async value => { awakeCalls.push(value.enabled); return value } })
  let ctx, rngCalls = 0, subscription, route
  function Owner() {
    const [screen, setScreen] = React.useState(options.screen ?? 'chord-mode-select')
    const [mode, setMode] = React.useState('comprehensive')
    const [settings, setSettings] = React.useState(ctx.settings)
    const [count, setCount] = React.useState(options.count ?? 10)
    const snapshot = ui.useChordPracticeRuntime(ctx.chord)
    const persisted = React.useSyncExternalStore(cb => ctx.persistence.subscribe(cb), () => ctx.persistence.snapshot)
    ctx.state = () => ({ screen, mode, settings, count, snapshot, persisted })
    ctx.setMode = setMode; ctx.navigate = value => { global.window.location.hash = '#' + value; setScreen(value) }
    React.useEffect(() => {
      const ready = ctx.midi.midiReady
      if (ready) ctx.chord.handleTransportReady()
      else ctx.chord.handleTransportLost()
    }, [ctx.midi.midiReady, ctx.midi.midiBoundaryVersion])
    const enabled = shouldKeepPracticeAwake({ appForeground: true, screen, sightStatus: 'idle', sightPaused: false, chordStatus: snapshot.status, intervalStatus: 'IDLE' })
    React.useEffect(() => { void awake.setEnabled(enabled) }, [enabled])
    const updateSettings = changes => { const next = { ...settings, ...changes }; setSettings(next); void ctx.settingsRepo.save(next) }
    if (screen === 'chord-mode-select') return React.createElement(ui.ChordModeSelectScreen, { settingsReady: true, onSelectMode: ctx.select })
    if (screen === 'chord-report-detail') return React.createElement(ui.ChordReportDetailScreen, { report: options.missing ? null : persisted.records[0], onBack: () => ctx.navigate('history') })
    if (screen === 'history') return React.createElement(ui.HistoryScreen, { runtime: ctx.midi, chordHistory: persisted, chordPersistence: ctx.persistence, intervalHistory: ctx.intervalHistory, intervalPersistence: ctx.intervalPersistence, filter: 'chord', onFilterChange: () => {}, onOpenChordReport: () => ctx.navigate('chord-report-detail'), onOpenIntervalReport: () => { throw Error('OUT_OF_SCOPE') }, theme: ctx.theme })
    return React.createElement(ui.ChordPracticeScreen, { caseId: 'c-major-root', chordSettings: settings, mode, previewStateId: 'live', runtime: ctx.chord, midiRuntime: ctx.midi, onExplicitEnd: ctx.end, onChordSettingsChange: updateSettings, onQuestionCountChange: setCount, questionCount: count, theme: ctx.theme })
  }
  try {
    await mounted('chord-flow', async h => { await run({ ...h, ...ctx, state: () => ctx.state(), navigate: value => ctx.navigate(value), time, host, awake, awakeCalls, rng: () => rngCalls }) }, {
      runtimeDependencies: { clock: time, scheduler: time },
      beforeRender: async ({ backend, runtime }) => {
        const encode = value => JSON.stringify(value, null, 2) + '\n'
        const record = legacyRecord(); assert.equal(isChordPracticeReportV1(record), true)
        backend.values.set(CHORD_REPORT_STORAGE_KEYS.reportIndex, encode({ schemaVersion: 1, nextSequence: 2, recordIds: [record.recordId], extraIndex: 'keep' }))
        backend.values.set(CHORD_REPORT_STORAGE_KEYS.reportPrefix + record.recordId, encode(record))
        backend.values.set(CHORD_SETTINGS_STORAGE_KEY, encode({ ...DEFAULT_CHORD_SETTINGS, sequentialKey: options.key ?? 'Eb', extraSettings: 'keep' }))
        const repository = new ChordReportRepository(backend), settingsRepo = new ChordSettingsRepository(backend)
        const persistence = new ChordReportPersistenceCoordinator(repository, { now: () => 1750000100000 + time.now() })
        assert.equal((await persistence.initialize()).success, true)
        ctx = { chord: new ChordPracticeRuntime({ clock: time, scheduler: time, rng: () => { rngCalls++; return 0.42 } }), midi: runtime, persistence, repository, settingsRepo, settings: await settingsRepo.load() }
        ctx.intervalHistory = { status: 'ready', records: [] }
        ctx.intervalPersistence = { refresh: async () => {} }
        subscription = runtime.midiRouter.subscribe(event => ctx.chord.handleMidi(event))
        subscribeFactory(callback => { ctx.stopFinalization = callback() }, host, ctx.chord, persistence)
        ctx.select = selectFactory(host, mode => ctx.setMode(mode), screen => ctx.navigate(screen))
        ctx.end = endFactory(fn => fn, host, ctx.chord, persistence, screen => ctx.navigate(screen))
      },
      render({ theme }) {
        ctx.theme ??= options.theme ?? { ...theme, capabilities: { ...theme.capabilities, historyVisual: { kind: 'standard' }, practiceActiveVisual: { kind: 'standard' } } }
        return React.createElement(Owner)
      }
    })
  } finally { subscription?.(); ctx?.stopFinalization?.(); ctx?.chord.dispose(); await awake.dispose() }
}
const click = async node => act(async () => node.props.onClick())
async function start(h, mode = 'sequential') {
  await click(h.renderer.root.findAllByProps({ className: 'module-card chord-mode-card' })[mode === 'sequential' ? 0 : 1])
  assert.equal(h.state().screen, 'chord-practice'); assert.equal(h.chord.snapshot.status, 'RUNNING'); assert.equal(h.host.current.module, 'chord')
}
async function advance(h, ms) { await act(async () => h.time.advance(ms)) }
async function note(h, midi, on = true) {
  await act(async () => h.plugin.listeners.get('midiMessage')({
    bytes: [on ? 0x90 : 0x80, midi, on ? 96 : 0], nativeTimestampNanos: h.time.now()*1e6, callbackReceivedNanos: h.time.now()*1e6,
    identity: h.plugin.state.activeInput, deliveryEpoch: h.plugin.state.deliveryEpoch
  }))
}
async function arpeggio(h) {
  for (const pitch of h.chord.snapshot.judgement.target.arpeggioMidi) { await advance(h, 10); await note(h,pitch); await advance(h,1); await note(h,pitch,false) }
  assert.equal(h.chord.snapshot.judgement.state.phase, 'BLOCK_READY')
}
async function block(h, release = true) {
  const notes = [...h.chord.snapshot.judgement.target.blockMidi]
  for (const pitch of notes) await note(h,pitch)
  await advance(h,150)
  if (release) for (const pitch of notes) await note(h,pitch,false)
}
async function complete(h) {
  await start(h)
  for (let i=0;i<10;i++) { await arpeggio(h); await block(h); await advance(h,800) }
  assert.equal(h.chord.snapshot.status,'SESSION_COMPLETE')
  await act(async () => h.persistence.flush())
  assert.equal(h.persistence.snapshot.records.length,2)
}
async function roundTrip(h) {
  const chord = h.chord, midi = h.midi
  const before = { snapshot: JSON.stringify(chord.snapshot), question: chord.snapshot.question, questionIdentity: chord.snapshot.questionIdentity,
    judgement: chord.judgementValue, bag: chord.sequentialBagValue, held: [...chord.physicalHeldNotes],
    timer: [chord.captureTimerId,chord.captureTimerToken,chord.successTimerId,chord.successTimerToken,chord.successFeedbackDeadlineMs],
    jobs: [...h.time.jobs], timerOps: [...h.time.operations], rng: h.rng(), host: h.host.current,
    native: [...h.plugin.calls], listeners: [...h.plugin.listeners], registrations: h.plugin.registrations,
    provider: midi.midiInput, router: midi.midiRouter, observers: [...midi.midiRouter.observers],
    input: JSON.stringify(midi.bluetoothSnapshot), boundary: midi.midiBoundaryVersion, source: midi.midiSource,
    bytes: businessBytes(h.backend), writes: h.backend.writes.length,
    record: h.persistence.snapshot.records[0], records: JSON.stringify(h.persistence.snapshot.records), state: h.state(),
    route: global.window.location.hash, pointer: [...h.pointerCalls], theme: h.themeManager.snapshot, awake: [h.awake.desiredEnabled,h.awake.appliedEnabled,...h.awakeCalls],
    staff: h.renderer.root.findAllByProps({ 'data-test-chord-staff': 'wiring-only' })[0], lifecycle: h.lifecycle(),
    windows: global.window.snapshot(), documents: global.document.snapshot() }
  for (const locale of ['en','zh-CN']) {
    await h.switchTo(locale)
    assert.equal(h.chord,chord); assert.equal(JSON.stringify(chord.snapshot),before.snapshot)
    assert.equal(chord.snapshot.question,before.question); assert.equal(chord.snapshot.questionIdentity,before.questionIdentity)
    assert.equal(chord.judgementValue,before.judgement); assert.equal(chord.sequentialBagValue,before.bag); assert.deepEqual([...chord.physicalHeldNotes],before.held)
    assert.deepEqual([chord.captureTimerId,chord.captureTimerToken,chord.successTimerId,chord.successTimerToken,chord.successFeedbackDeadlineMs],before.timer)
    assert.deepEqual([...h.time.jobs],before.jobs); assert.deepEqual(h.time.operations,before.timerOps); assert.equal(h.rng(),before.rng); assert.deepEqual(h.host.current,before.host)
    assert.deepEqual(h.plugin.calls,before.native); assert.deepEqual([...h.plugin.listeners],before.listeners); assert.equal(h.plugin.registrations,before.registrations)
    assert.equal(midi.midiInput,before.provider); assert.equal(midi.midiRouter,before.router); assert.deepEqual([...midi.midiRouter.observers],before.observers)
    assert.equal(JSON.stringify(midi.bluetoothSnapshot),before.input); assert.equal(midi.midiBoundaryVersion,before.boundary); assert.equal(midi.midiSource,before.source)
    assert.deepEqual(businessBytes(h.backend),before.bytes); assert.ok(h.backend.writes.slice(before.writes).every(w=>w.key===APP_PREFERENCES_KEY))
    assert.equal(h.persistence.snapshot.records[0],before.record); assert.equal(JSON.stringify(h.persistence.snapshot.records),before.records)
    assert.deepEqual(h.state(),before.state); assert.equal(global.window.location.hash,before.route); assert.deepEqual(h.pointerCalls,before.pointer); assert.equal(h.themeManager.snapshot,before.theme)
    assert.deepEqual([h.awake.desiredEnabled,h.awake.appliedEnabled,...h.awakeCalls],before.awake); assert.deepEqual(h.lifecycle(),before.lifecycle)
    assert.deepEqual(global.window.snapshot(),before.windows); assert.deepEqual(global.document.snapshot(),before.documents)
    if (before.staff) assert.equal(h.renderer.root.findByProps({ 'data-test-chord-staff':'wiring-only' }),before.staff)
  }
}
test('CHORD-E1','actual mode select/help and settings drawer render both locales',async()=>flow(async h=>{
  contains(h.getText(),'循序练习'); await h.switchTo('en'); contains(h.getText(),'Progressive practice'); contains(h.getText(),'Mixed practice')
  await click(h.renderer.root.findByProps({ 'aria-label':'About chord practice modes' })); contains(h.getText(),'Diatonic triads in root position only'); assert.doesNotMatch(h.getText(),/[\u3400-\u9fff]/)
  await click(h.renderer.root.findByProps({ 'aria-label':'Close practice mode help' })); await roundTrip(h)
  await start(h); await h.switchTo('en'); await click(h.renderer.root.findByProps({ 'aria-label':'Practice settings' })); contains(h.getText(),'Choose the number'); await roundTrip(h)
}))
test('CHORD-E2','real mode/count/key/tone controls use only stable IDs and existing settings',async()=>flow(async h=>{
  await start(h); await click(h.renderer.root.findByProps({ 'aria-label':'练习设置' }))
  const select=h.renderer.root.findByType('select'), buttons=h.renderer.root.findByProps({ className:'chord-question-count' }).findAllByType('button')
  assert.equal(select.props.value,'Eb'); assert.deepEqual(select.findAllByType('option').map(n=>n.props.value),[...theory.CHORD_SEQUENTIAL_MAJOR_KEY_IDS])
  assert.deepEqual(buttons.map(n=>n.props.children),['10','20','50','100','无限']); await roundTrip(h)
  await click(buttons[4]); assert.equal(h.state().count,'endless'); assert.equal(h.chord.snapshot.questionCount,10)
  await act(async()=>select.props.onChange({target:{value:'Cb'}})); assert.equal(h.state().settings.sequentialKey,'Cb'); assert.equal(h.chord.snapshot.sequentialKey,'Eb')
  await click(h.renderer.root.findByProps({ 'aria-label':'显示构成音已开启' })); assert.equal(h.state().settings.showChordTones,false); await roundTrip(h)
}))
test('CHORD-E3','actual production mode-selection action enters original ACTIVE and automatic runtime Start',async()=>flow(async h=>{
  await start(h); assert.equal(h.chord.snapshot.mode,'sequential'); assert.equal(h.chord.snapshot.sequentialKey,'Eb')
  assert.ok(h.awake.desiredEnabled); await h.switchTo('en'); assert.doesNotMatch(h.getText(),/Next|Skip|Retry button/); await roundTrip(h)
}))
test('CHORD-E4','ACTIVE prompt/progress/inversion/aria are bilingual while real device name stays verbatim',async()=>flow(async h=>{
  await start(h); await h.switchTo('en'); contains(h.getText(),'Play the arpeggio'); contains(h.getText(),'Root position'); assert.equal(h.midi.bluetoothSnapshot.connectedDeviceName, 'Roland Roland Digital Piano'); assert.equal(h.renderer.root.findByType(ui.MidiStatusButton).props.compact, true); h.renderer.root.findByProps({ 'aria-label': 'Open MIDI devices' })
  assert.doesNotMatch(h.getText(),/[\u3400-\u9fff]/); assert.match(h.renderer.root.findByProps({'data-test-chord-staff':'wiring-only'}).props['aria-label'],/arpeggio on the left/)
  await roundTrip(h)
}))
test('CHORD-E5','live question/ref/judgement/bag/random generation remain identical during locale round trip',async()=>flow(async h=>{await start(h);await roundTrip(h)}))
test('CHORD-E6','both real modes and all count identities survive locale switching',async()=>{
  for(const mode of ['sequential','comprehensive']) for(const count of [10,20,50,100,'endless']) await flow(async h=>{await start(h,mode);assert.equal(h.chord.snapshot.mode,mode);assert.equal(h.chord.snapshot.questionCount,count);await roundTrip(h)}, {count})
})
test('CHORD-E7','nine quality IDs/roots/all eligible inversions share Query terminology without changing symbols',()=>{
  for(const quality of [...theory.TRIAD_QUALITY_IDS,...theory.SEVENTH_QUALITY_IDS]) for(let inversion=0;inversion<(theory.TRIAD_QUALITY_IDS.includes(quality)?3:4);inversion++){
    const question=theory.createChordPracticeQuestionFromIdentity({identity:{root:{letter:'C',accidental:1},qualityId:quality,inversionIndex:inversion},registerWindow:{minMidi:48,maxMidi:84},rng:()=>0.42})
    const before=JSON.stringify(question)
    for(const locale of ['zh-CN','en']){const label=display.presentChordQuestion(question,translator(locale,'chordPractice'),translator(locale,'theoryQuery'));assert.ok(label.includes(translator(locale,'theoryQuery')('chord.types.'+quality)));assert.ok(label.includes('C♯'))}
    assert.equal(JSON.stringify(question),before)
  }
})
test('CHORD-E8','actual voicing/arpeggio/block MIDI arrays and written spelling remain frozen',async()=>flow(async h=>{
  await start(h);const q=h.chord.snapshot.question, pitches=h.renderer.root.findByType(ui.ChordPracticeScreen).props
  await arpeggio(h);await roundTrip(h);assert.equal(h.chord.snapshot.question,q);assert.ok(pitches.runtime===h.chord)
  await h.switchTo('en');contains(h.getText(),q.chordSymbol)
}))
test('CHORD-E9','150ms block capture and 800ms success timers never restart or progress early on locale',async()=>flow(async h=>{
  await start(h);await arpeggio(h);const notes=[...h.chord.snapshot.judgement.target.blockMidi]
  await note(h,notes[0]);await advance(h,70);await roundTrip(h);for(const n of notes.slice(1))await note(h,n)
  await advance(h,79);assert.equal(h.chord.snapshot.judgement.state.phase,'BLOCK_CAPTURE');await advance(h,1)
  for(const n of notes)await note(h,n,false)
  assert.equal(h.chord.snapshot.status,'SUCCESS_FEEDBACK');await advance(h,300);await roundTrip(h);await advance(h,499);assert.equal(h.chord.snapshot.questionIndex,2);assert.equal(h.chord.snapshot.status,'SUCCESS_FEEDBACK')
  await advance(h,1);assert.equal(h.chord.snapshot.status,'RUNNING');assert.equal(h.chord.snapshot.counters.completedQuestions,1)
}))
test('CHORD-E10','manual pause / resume-required and held-key release gates preserve question',async()=>flow(async h=>{
  await start(h);await note(h,h.chord.snapshot.judgement.target.arpeggioMidi[0]);await click(h.renderer.root.findByProps({className:'outline-action',disabled:false}))
  assert.equal(h.chord.snapshot.status,'SUSPENDED');await roundTrip(h)
  await click(h.renderer.root.findByProps({className:'outline-action',disabled:false}));assert.equal(h.chord.snapshot.judgement.state.phase,'RESUME_WAIT_ALL_KEYS_UP');await roundTrip(h)
  for(const n of [...h.chord.physicalHeldNotes])await note(h,n,false);assert.equal(h.chord.snapshot.status,'RUNNING')
}))
test('CHORD-E11','real MIDI parser/router/provider, connection generations, disconnect/resume and session remain protected',async()=>flow(async h=>{
  await start(h);await act(async()=>h.plugin.disconnect());assert.equal(h.chord.snapshot.status,'SUSPENDED');await h.switchTo('en');contains(h.getText(),'MIDI disconnected');await roundTrip(h)
  await act(async()=>h.midi.midiInput.connect('usb-identity',3));assert.equal(h.chord.snapshot.status,'SUSPENDED');await roundTrip(h)
  await click(h.renderer.root.findByProps({className:'outline-action',disabled:false}));assert.equal(h.chord.snapshot.status,'RUNNING')
}))
test('CHORD-E12','real runtime completion and persisted report/detail render zh/en without invented Result route',async()=>flow(async h=>{
  await complete(h);contains(h.getText(),'本轮练习完成');await roundTrip(h)
  await act(async()=>h.navigate('chord-report-detail'));contains(h.getText(),'练习结果');await h.switchTo('en');contains(h.getText(),'First-pass success rate');assert.doesNotMatch(h.getText(),/[\u3400-\u9fff]/);await roundTrip(h)
}))
test('CHORD-E13','report counts/median/null/rounding facts are unchanged with stable metric IDs',()=>{
  const record=legacyRecord(), old=projectChordReportDetail(record)
  for(const locale of ['zh-CN','en']){const view=display.presentLocalizedChordReport(record,translator(locale,'chordPractice'),locale)
    assert.deepEqual(view.overviewMetrics.map(m=>[m.value,m.primary]),old.overviewMetrics.map(m=>[m.value,m.primary]))
    assert.deepEqual(view.errorRows.map(r=>r.value),old.errorRows.map(r=>r.value));assert.deepEqual(view.timingRows.map(r=>[r.id,r.medianMs,r.sampleCount]),old.timingRows.map(r=>[r.id,r.medianMs,r.sampleCount]))
    assert.equal(view.timingRows[3].value,'12.3 ms');assert.equal(view.overviewMetrics[2].value,'66.7%')
  }
})
test('CHORD-E14','first-pass rate is firstPass/completed, not planned completion or accuracy',()=>{
  const r=legacyRecord(), v=display.presentLocalizedChordReport(r,translator('en','chordPractice'),'en')
  assert.equal(v.completionRate,2/3*100);assert.equal(v.overviewMetrics.find(m=>m.id==='firstPassRate').label,'First-pass success rate')
  assert.match(resources.en.firstPassHelp,/both the arpeggio and block chord/);assert.doesNotMatch(v.overviewMetrics.map(m=>m.label).join(' '),/Completion rate|Accuracy/)
})
test('CHORD-E15','actual History row/detail rebuild mode/key only from structured V1 facts',async()=>flow(async h=>{
  await h.switchTo('en');const row=h.renderer.root.findByProps({className:'history-row is-stopped is-interactive'})
  contains(text(row),'Progressive practice · C♭ Major');contains(text(row),'First-pass success rate');assert.doesNotMatch(text(row),/旧显示文字|[\u3400-\u9fff]/)
  await click(row);assert.equal(h.state().screen,'chord-report-detail');await roundTrip(h)
},{screen:'history'}))
test('CHORD-E16','legacy summary without structured record remains byte-verbatim, never parsed or guessed',()=>{
  for(const summary of ['循序练习 · C 大调','综合随机','Custom old text · C♯','  循序练习 · C 大调  '])
    for(const locale of ['zh-CN','en'])assert.equal(display.presentChordHistorySummary(undefined,summary,translator(locale,'chordPractice')),summary)
  assert.doesNotMatch(read('prototype/android-tablet-v1/src/localization/chordPracticePresentation.ts'),/legacySummary\.(?:split|match|replace|includes)|modeSummary\.(?:split|match|replace|includes)/)
})
test('CHORD-E17','real legal legacy repository raw body/index/settings/extra fields are exact zero-write on locale',async()=>flow(async h=>{
  const bytes=businessBytes(h.backend);assert.ok(bytes.some(([k,v])=>k===CHORD_REPORT_STORAGE_KEYS.reportPrefix+'chord-report-1'&&v.includes('extraLegacyField')&&v.endsWith('\n')))
  await roundTrip(h);assert.deepEqual(businessBytes(h.backend),bytes)
},{screen:'history'}))
test('CHORD-E18','Result metric rows/History rows/staff never remount from locale-sensitive React keys',async()=>flow(async h=>{
  const rows=h.renderer.root.findByProps({className:'chord-report-metrics'}).findAllByType('div');await roundTrip(h)
  assert.deepEqual(h.renderer.root.findByProps({className:'chord-report-metrics'}).findAllByType('div'),rows)
  assert.doesNotMatch(current.get('ChordReportDetailScreen'),/key=\{(?:row|metric)\.label\}/)
},{screen:'chord-report-detail'}))
test('CHORD-E19','Light/Dark/decorated asset URLs and all Theme pointer bytes remain unchanged',async()=>{
  for(const id of ['light','dark','bocchi'])await flow(async h=>{
    await start(h);const images=h.renderer.root.findAllByType('img').map(n=>n.props.src);await roundTrip(h);assert.deepEqual(h.renderer.root.findAllByType('img').map(n=>n.props.src),images)
    assert.deepEqual(images,id==='bocchi'?['/existing/character.png','/existing/polaroid.png']:[])
  },{theme:{id,colorScheme:id==='dark'?'dark':'light',capabilities:{historyVisual:{kind:'standard'},practiceActiveVisual:id==='bocchi'?{kind:'decorated-focus',chordArtwork:{cornerCharacter:'/existing/character.png',polaroid:'/existing/polaroid.png',decorations:'/existing/decor.png'}}:{kind:'standard'}}}})
})
test('CHORD-E20','fixed checkpoint freeze protects Sight/Interval/domain/MIDI/native/theme and only narrow Chord display may change',()=>{
  const allowed=new Set(['ChordModeSelectScreen','ChordGroupBadge','ChordSettingsDrawer','ChordPracticeScreen','ChordReportDetailScreen','ChordPersistenceErrorNotice','HistoryRecord','HistoryScreen'])
  assert.deepEqual([...current.keys()],[...previous.keys()]);for(const [name,body]of current)if(!allowed.has(name))assert.equal(body,previous.get(name),name)
  const nonChord=body=>body.slice(body.indexOf("  if (item.module === 'interval')"))
  assert.equal(nonChord(current.get('HistoryRecord')),nonChord(previous.get('HistoryRecord')))
  const wiring='chordReport={chordHistory.records.find(record => record.recordId === item.recordId)} '
  assert.equal(current.get('HistoryScreen').replace(wiring,''),previous.get('HistoryScreen'))
  const files=execFileSync('git',['ls-tree','-r','--name-only',base,'--','src','android','theme-packages','prototype/android-tablet-v1/src/chordPractice','prototype/android-tablet-v1/src/intervalPractice','prototype/android-tablet-v1/src/musicTheory','prototype/android-tablet-v1/src/theme'],{cwd:root,encoding:'utf8'}).trim().split('\n')
  files.push(...['sightReadingIntegration.ts','androidBluetoothMidi.ts','androidBluetoothMidiCore.ts','androidPersistenceCore.ts','activePracticeSession.ts','practiceKeepAwake.ts','historyProjection.ts','mixedHistoryProjection.ts'].map(n=>'prototype/android-tablet-v1/src/'+n))
  files.push(...['sightReadingPresentation.ts','sightReadingResources.ts','intervalPracticePresentation.ts','intervalPreparationResources.ts','intervalFlowResources.ts','theoryQueryResources.ts','legacyPresentation.ts'].map(n=>'prototype/android-tablet-v1/src/localization/'+n))
  for(const file of files){const was=execFileSync('git',['show',base+':'+file],{cwd:root,maxBuffer:64*1024*1024}),now=fs.readFileSync(path.join(root,file))
    if(/\.(ts|tsx|kt|xml|gradle|properties|json|java|md|gitignore|bat|sh|html|css|txt)$/.test(file))assert.equal(now.toString().replaceAll('\r\n','\n'),was.toString().replaceAll('\r\n','\n'),file)
    else assert.equal(createHash('sha256').update(now).digest('hex'),createHash('sha256').update(was).digest('hex'),file)
  }
})
test('CHORD-E21','all existing feedback states preserve exact zh prompts/group semantics and explicit English state facts',()=>{
  const phases=['ARPEGGIO_READY','ARPEGGIO_ACTIVE','ARPEGGIO_WRONG_WAIT_RELEASE','WAIT_ALL_KEYS_UP_BEFORE_BLOCK','BLOCK_READY','BLOCK_CAPTURE','BLOCK_WRONG_WAIT_RELEASE','WAIT_ALL_KEYS_UP_AFTER_BLOCK','QUESTION_COMPLETE','SUSPENDED','RESUME_WAIT_ALL_KEYS_UP']
  for(const phase of phases)for(const resumeTarget of ['ARPEGGIO_READY','BLOCK_READY','QUESTION_COMPLETE']){
    const snap={status:'RUNNING',judgement:{state:{phase,resumeTarget}}},old=presentChordPractice(snap),zh=display.presentLocalizedChordPractice(snap,translator('zh-CN','chordPractice')),en=display.presentLocalizedChordPractice(snap,translator('en','chordPractice'))
    assert.deepEqual(zh,old);assert.deepEqual([en.semantic,en.arpeggio,en.block],[old.semantic,old.arpeggio,old.block]);assert.doesNotMatch(en.prompt+en.stageLabel,/[\u3400-\u9fff]/)
  }
})
test('CHORD-E22','namespace semantic/placeholder/plural parity with explicit English fallback disabled',()=>{
  const leaves=(v,p='')=>Object.entries(v).flatMap(([k,x])=>typeof x==='string'?[[p+k,x]]:leaves(x,p+k+'.'))
  const zh=leaves(resources['zh-CN']),en=leaves(resources.en), map=new Map(en)
  const keys=x=>[...new Set(x.map(([k])=>k.replace(/_(one|other)$/,'')))].sort()
  assert.deepEqual(keys(zh),keys(en));const instance=createLocalizationInstance('en');void instance.init({lng:'en',fallbackLng:false})
  const slots=x=>[...x.matchAll(/\{\{(\w+)\}\}/g)].map(m=>m[1]).sort()
  for(const[k,v]of en){assert.ok(v.trim());assert.doesNotMatch(v,/[\u3400-\u9fff]/);assert.equal(instance.exists(k,{ns:'chordPractice',fallbackLng:false}),true)}
  for(const[k,v]of zh)for(const key of map.has(k)?[k]:[k+'_one',k+'_other'])assert.deepEqual(slots(v),slots(map.get(key)),k)
  assert.equal(instance.t('samples',{ns:'chordPractice',count:1}),'1 sample');assert.equal(instance.t('samples',{ns:'chordPractice',count:2}),'2 samples')
  console.log('CHORD_RESOURCE_COUNTS='+zh.length+'/'+en.length)
})
test('CHORD-E23','AST freezes all Chord lifecycle/actions/notation props; only stable metric React keys change',()=>{
  const nodes=body=>{const ast=ts.createSourceFile('ui.tsx',body,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),values=[]
    function visit(n){if(ts.isCallExpression(n)&&['useEffect','useState','useRef','useChordPracticeRuntime'].includes(n.expression.getText(ast)))values.push(n.getText(ast))
      if(ts.isJsxAttribute(n)&&['onClick','onChange','onBack','disabled','pitches','symbol','arpeggioState','blockState'].includes(n.name.text))values.push(n.getText(ast));ts.forEachChild(n,visit)}
    visit(ast);return values}
  for(const name of ['ChordModeSelectScreen','ChordSettingsDrawer','ChordPracticeScreen','ChordReportDetailScreen','ChordPersistenceErrorNotice'])assert.deepEqual(nodes(current.get(name)),nodes(previous.get(name)),name)
  let renderer=read('prototype/android-tablet-v1/src/ChordGrandStaff.tsx')
  renderer=renderer.replace('  ariaLabel?: string\n','').replace('  symbol,\n  ariaLabel','  symbol').replace('aria-label={ariaLabel ?? ','aria-label={')
  renderer=renderer.replace('  fontErrorLabel?: string\n','').replace('  symbol,\n  fontErrorLabel','  symbol').replace('{fontErrorLabel ?? fontError}', '{fontError}')
  assert.equal(renderer,oldFile('prototype/android-tablet-v1/src/ChordGrandStaff.tsx'))
  const css=read('prototype/android-tablet-v1/src/styles.css'),old=oldFile('prototype/android-tablet-v1/src/styles.css')
  assert.ok(css.startsWith(old));assert.doesNotMatch(css.slice(old.length),/(?:^|\n)\s*(?:height|width|transform|position):|\.notation-paper|\.chord-grand-staff|--paper/)
})
test('CHORD-E24','wrong arpeggio/block and release gate keep same question/retry semantics and first-pass counters',async()=>flow(async h=>{
  await start(h);const question=h.chord.snapshot.question
  await note(h,20);assert.equal(h.chord.snapshot.judgement.state.phase,'ARPEGGIO_WRONG_WAIT_RELEASE');await roundTrip(h)
  await note(h,20,false);await arpeggio(h);await note(h,20);assert.equal(h.chord.snapshot.judgement.state.phase,'BLOCK_WRONG_WAIT_RELEASE');await roundTrip(h);await note(h,20,false)
  assert.equal(h.chord.snapshot.question,question);await arpeggio(h);await block(h);assert.equal(h.chord.snapshot.counters.firstPassCompletedQuestions,0);assert.equal(h.chord.snapshot.counters.totalErrors,2)
}))
test('CHORD-E25','early End/save original handler persists exactly once and no-progress End creates no report',async()=>{
  for(const progressed of [false,true])await flow(async h=>{
    await start(h);if(progressed){await arpeggio(h);await block(h);await advance(h,800)}
    await click(h.renderer.root.findAllByProps({className:'outline-action'}).at(-1));await act(async()=>h.persistence.flush())
    assert.equal(h.state().screen,'chord-mode-select');assert.equal(h.host.current,null);assert.equal(h.persistence.snapshot.records.length,progressed?2:1)
    await roundTrip(h)
  })
})
test('CHORD-E26','unavailable report and saved-result null timing presentation remain safe and bilingual',async()=>{
  await flow(async h=>{contains(h.getText(),'记录不可用');await h.switchTo('en');contains(h.getText(),'Record unavailable');await roundTrip(h)},{screen:'chord-report-detail',missing:true})
  const r=legacyRecord();const nullFacts={...r,timingSummary:Object.fromEntries(Object.keys(r.timingSummary).map(k=>[k,{sampleCount:0,medianMs:null}]))}
  assert.deepEqual(display.presentLocalizedChordReport(nullFacts,translator('en','chordPractice'),'en').timingRows.map(r=>r.value),['—','—','—','—'])
  // Defensive projection cases are not accepted durable fixtures; retain the original display-only guard.
  for(const medianMs of [-1,NaN,Infinity]) {
    const invalid={...r,timingSummary:Object.fromEntries(Object.keys(r.timingSummary).map(k=>[k,{sampleCount:0,medianMs}]))}
    assert.deepEqual(display.presentLocalizedChordReport(invalid,translator('en','chordPractice'),'en').timingRows.map(row=>row.value),projectChordReportDetail(invalid).timingRows.map(row=>row.value))
  }
})
test('CHORD-E27','real renderer font failure is localized without rebuilding font/notation effects or exposing raw errors',async()=>{
  const rendererSource=read('prototype/android-tablet-v1/src/ChordGrandStaff.tsx')
  const ast=ts.createSourceFile('renderer.tsx',rendererSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  const component=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text==='ChordGrandStaff').getText(ast).replace('export ', '')
  const compiled=ts.transpileModule(component+'\nreturn ChordGrandStaff',{fileName:'renderer.tsx',compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText
  let fontLoads=0
  const Renderer=new Function('React','useEffect','useMemo','useRef','useState','ensureMusicNotationFont',compiled)(React,React.useEffect,React.useMemo,React.useRef,React.useState,()=>{fontLoads++;return Promise.reject(Error('RAW_PRIVATE_FONT_ERROR'))})
  let rendered
  try {
    await act(async()=>{rendered=require('react-test-renderer').create(React.createElement(Renderer,{pitches:[],symbol:'C♯',arpeggioState:'active',blockState:'secondary',fontErrorLabel:translator('zh-CN','chordPractice')('fontFailed')}))})
    contains(text(rendered.toJSON()),'本地音乐字体加载失败。')
    await act(async()=>rendered.update(React.createElement(Renderer,{pitches:[],symbol:'C♯',arpeggioState:'active',blockState:'secondary',fontErrorLabel:translator('en','chordPractice')('fontFailed')})))
    contains(text(rendered.toJSON()),'The local music font could not be loaded.');assert.doesNotMatch(text(rendered.toJSON()),/RAW_PRIVATE_FONT_ERROR|[\u3400-\u9fff]/)
    assert.equal(rendered.root.findByProps({role:'alert'}).type,'span')
    await act(async()=>rendered.update(React.createElement(Renderer,{pitches:[],symbol:'C♯',arpeggioState:'active',blockState:'secondary',fontErrorLabel:translator('zh-CN','chordPractice')('fontFailed')})))
    contains(text(rendered.toJSON()),'本地音乐字体加载失败。');assert.equal(fontLoads,1)
    assert.match(current.get('ChordPracticeScreen'),/fontErrorLabel=\{t\('fontFailed'\)\}/)
  } finally {if(rendered)await act(async()=>rendered.unmount())}
})
void(async()=>{let passed=0;for(const item of tests){try{await item.run();passed++;console.log('PASS '+item.id+' '+item.title)}catch(error){console.error('FAIL '+item.id+' '+item.title+'\n'+error.stack)}}
  console.log('\n'+passed+'/'+tests.length+' B4.5 Complete Chord localization checks PASS');if(passed!==tests.length)process.exitCode=1
})()
