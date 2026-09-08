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
const hostSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/activePracticeSession.ts'), 'utf8')
const { ActivePracticeSessionHost } = require('../prototype/android-tablet-v1/src/activePracticeSession.ts')
const { ChordPracticeRuntime } = require('../prototype/android-tablet-v1/src/chordPractice/runtime/index.ts')
const { AndroidSightReadingRuntime } = require('../prototype/android-tablet-v1/src/sightReadingIntegration.ts')

class FakeTime {
  constructor(now = 0) { this.value = now; this.nextId = 0; this.jobs = new Map() }
  now = () => this.value
  schedule = (callback, delayMs) => { const id = ++this.nextId; this.jobs.set(id, { at: this.value + Math.max(0, delayMs), callback }); return id }
  cancel = (id) => { this.jobs.delete(id) }
  advance(ms) {
    const until = this.value + ms
    while (true) {
      const next = [...this.jobs.entries()].filter(([, job]) => job.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0]
      if (!next) break
      this.jobs.delete(next[0]); this.value = next[1].at; next[1].callback()
    }
    this.value = until
  }
  forceAll() { for (const [, job] of [...this.jobs]) job.callback() }
}

class MemoryReportRepository {
  constructor() { this.records = []; this.saveCalls = 0 }
  list() { return [...this.records] }
  async initialize() { return { success: true, records: this.list(), diagnostics: { recoveredOrphanIds: [], removedStaleIds: [], invalidRecordKeys: [], indexRebuilt: false } } }
  async save(record) {
    this.saveCalls += 1
    if (!this.records.some((item) => item.recordId === record.recordId)) this.records.push(record)
    return { success: true, record }
  }
}

function makeSight() {
  const time = new FakeTime(1_000)
  const reports = new MemoryReportRepository()
  let ids = 0
  const runtime = new AndroidSightReadingRuntime({
    clock: time,
    scheduler: time,
    random: () => 0.42,
    reportRepository: reports,
    wallClock: time,
    idGenerator: () => `active-session-${++ids}`
  })
  return { runtime, time, reports }
}

function answerSight(runtime, time) {
  time.advance(32)
  runtime.sendCorrect()
  time.advance(350)
}

function finishSight(runtime, time) {
  while (runtime.snapshot.status === 'running') answerSight(runtime, time)
}

function makeChord(config = { mode: 'sequential', questionCount: 20, sequentialKey: 'Eb' }) {
  const time = new FakeTime()
  const runtime = new ChordPracticeRuntime({ clock: time, scheduler: time, rng: () => 0.1 })
  runtime.start(config)
  return { runtime, time }
}

function chordTargets(runtime) { return runtime.snapshot.judgement.target }
function chordEvent(runtime, time, id, type, midiNumber, advance = 1) {
  time.advance(advance)
  runtime.handleMidi({ id, type, timestamp: time.now(), midiNumber, velocity: type === 'noteOn' ? 100 : 0 })
}
function completeArpeggio(runtime, time, idStart = 1) {
  let id = idStart
  for (const note of chordTargets(runtime).arpeggioMidi) {
    chordEvent(runtime, time, id++, 'noteOn', note)
    chordEvent(runtime, time, id++, 'noteOff', note)
  }
  assert.equal(runtime.snapshot.judgement.state.phase, 'BLOCK_READY')
  return id
}
function completeChord(runtime, time, idStart = 1) {
  let id = completeArpeggio(runtime, time, idStart)
  const notes = [...chordTargets(runtime).blockMidi]
  for (const note of notes) chordEvent(runtime, time, id++, 'noteOn', note)
  time.advance(150)
  for (const note of notes) chordEvent(runtime, time, id++, 'noteOff', note)
  assert.equal(runtime.snapshot.status, 'SUCCESS_FEEDBACK')
}

function requestAuxiliary(host, currentScreen, targetScreen, onOpen = () => {}) {
  if (currentScreen === targetScreen) return false
  host.rememberAuxiliaryReturn(currentScreen, targetScreen)
  onOpen()
  return true
}

const tests = []
const test = (id, title, callback) => tests.push({ id, title, callback })

test('APS01', 'process-local monotonic identity survives auxiliary return', () => {
  const host = new ActivePracticeSessionHost()
  const sight = host.begin('sight', 'sight-active')
  host.rememberAuxiliaryReturn('sight-active', 'midi')
  assert.equal(host.consumeAuxiliaryReturn('midi', 'settings'), 'sight-active')
  assert.equal(host.current.id, sight.id)
  const chord = host.begin('chord', 'chord-practice')
  assert.notEqual(chord.id, sight.id)
  assert.equal(chord.generation, sight.generation + 1)
})

test('APS02', 'return context preserves Sight, Chord and ordinary Settings origins', () => {
  const host = new ActivePracticeSessionHost()
  host.begin('sight', 'sight-active'); host.rememberAuxiliaryReturn('sight-active', 'midi')
  assert.equal(host.consumeAuxiliaryReturn('midi', 'settings'), 'sight-active')
  host.begin('chord', 'chord-practice'); host.rememberAuxiliaryReturn('chord-practice', 'midi')
  assert.equal(host.consumeAuxiliaryReturn('midi', 'settings'), 'chord-practice')
  host.end(host.current.id); host.rememberAuxiliaryReturn('settings', 'midi')
  assert.equal(host.consumeAuxiliaryReturn('midi', 'home'), 'settings')
})

test('APS03', 'stale return context cannot attach to a replacement session', () => {
  const host = new ActivePracticeSessionHost()
  host.begin('sight', 'sight-active'); host.rememberAuxiliaryReturn('sight-active', 'midi')
  host.begin('chord', 'chord-practice')
  assert.equal(host.consumeAuxiliaryReturn('midi', 'settings'), 'settings')
})

test('APS04', 'logical finalization and explicit end are exact-once', () => {
  const host = new ActivePracticeSessionHost()
  const session = host.begin('chord', 'chord-practice')
  assert.equal(host.finalize(session.id), true)
  assert.equal(host.finalize(session.id), false)
  assert.equal(host.end(session.id), false)
  assert.equal(host.end(session.id), false)
  assert.equal(host.current, null)
})

test('APS05', 'Chord temporary navigation after progress retains Runtime, bag position, question, counter, key and session identity', () => {
  const host = new ActivePracticeSessionHost()
  const session = host.begin('chord', 'chord-practice')
  const { runtime, time } = makeChord()
  completeChord(runtime, time)
  time.advance(800)
  const before = runtime.snapshot
  host.rememberAuxiliaryReturn('chord-practice', 'midi'); runtime.pause('manual-pause', time.now())
  assert.equal(host.consumeAuxiliaryReturn('midi', 'settings'), 'chord-practice')
  assert.equal(host.current.id, session.id)
  assert.equal(runtime.snapshot.question, before.question)
  assert.equal(runtime.snapshot.questionGeneration, before.questionGeneration)
  assert.equal(runtime.snapshot.counters.completedQuestions, before.counters.completedQuestions)
  assert.equal(runtime.snapshot.sequentialKey, 'Eb')
})

test('APS05A', 'Comprehensive navigation reattaches without a new generator session', () => {
  const host = new ActivePracticeSessionHost()
  const session = host.begin('chord', 'chord-practice')
  const { runtime, time } = makeChord({ mode: 'comprehensive', questionCount: 20 })
  const question = runtime.snapshot.question
  const generation = runtime.snapshot.questionGeneration
  for (let trip = 0; trip < 3; trip += 1) {
    host.rememberAuxiliaryReturn('chord-practice', 'midi')
    runtime.pause('manual-pause', time.now())
    assert.equal(host.consumeAuxiliaryReturn('midi', 'settings'), 'chord-practice')
  }
  assert.equal(host.current.id, session.id)
  assert.equal(runtime.snapshot.question, question)
  assert.equal(runtime.snapshot.questionGeneration, generation)
})

test('APS06', 'partial Arpeggio navigation causes no error and safely resumes same question at Arpeggio start', () => {
  const { runtime, time } = makeChord()
  const question = runtime.snapshot.question
  const first = chordTargets(runtime).arpeggioMidi[0]
  chordEvent(runtime, time, 1, 'noteOn', first)
  runtime.pause('manual-pause', time.now())
  chordEvent(runtime, time, 2, 'noteOff', first)
  runtime.resume(time.now())
  assert.equal(runtime.snapshot.question, question)
  assert.equal(runtime.snapshot.judgement.state.phase, 'ARPEGGIO_READY')
  assert.equal(runtime.snapshot.counters.totalErrors, 0)
})

test('APS07', 'Block-ready navigation causes no error and resumes same question at Block', () => {
  const { runtime, time } = makeChord()
  const question = runtime.snapshot.question
  completeArpeggio(runtime, time)
  runtime.pause('manual-pause', time.now()); runtime.resume(time.now())
  assert.equal(runtime.snapshot.question, question)
  assert.equal(runtime.snapshot.judgement.state.phase, 'BLOCK_READY')
  assert.equal(runtime.snapshot.counters.totalErrors, 0)
})

test('APS08', 'active Block capture navigation cancels stale capture without phantom Wrong', () => {
  const { runtime, time } = makeChord()
  let id = completeArpeggio(runtime, time)
  chordEvent(runtime, time, id, 'noteOn', chordTargets(runtime).blockMidi[0])
  runtime.pause('manual-pause', time.now())
  time.forceAll()
  assert.equal(runtime.snapshot.status, 'SUSPENDED')
  assert.equal(runtime.snapshot.counters.totalErrors, 0)
})

test('APS09', 'success-feedback navigation freezes remainder and counts completion once', () => {
  const host = new ActivePracticeSessionHost()
  const session = host.begin('chord', 'chord-practice')
  const { runtime, time } = makeChord()
  completeChord(runtime, time)
  assert.equal(runtime.snapshot.counters.completedQuestions, 1)
  time.advance(300); runtime.pause('manual-pause', time.now()); time.advance(5_000)
  runtime.resume(time.now()); time.advance(499)
  assert.equal(runtime.snapshot.counters.completedQuestions, 1)
  time.advance(1)
  assert.equal(runtime.snapshot.counters.completedQuestions, 1)
  assert.equal(host.finalize(session.id), true)
  assert.equal(host.finalize(session.id), false)
})

test('APS10', 'Sight temporary navigation retains question/progress and writes no report', async () => {
  const host = new ActivePracticeSessionHost()
  const session = host.begin('sight', 'sight-active')
  const { runtime, time, reports } = makeSight()
  runtime.start(); answerSight(runtime, time)
  const before = runtime.snapshot
  host.rememberAuxiliaryReturn('sight-active', 'midi'); runtime.pause(); time.advance(10_000)
  assert.equal(host.consumeAuxiliaryReturn('midi', 'settings'), 'sight-active')
  assert.equal(host.current.id, session.id)
  assert.equal(runtime.snapshot.currentNote, before.currentNote)
  assert.equal(runtime.snapshot.completedQuestions, before.completedQuestions)
  assert.equal(runtime.reports.list().length, 0)
  assert.equal(reports.saveCalls, 0)
})

test('APS11', 'Sight natural completion after one round trip persists exactly one normal record', async () => {
  const host = new ActivePracticeSessionHost()
  const session = host.begin('sight', 'sight-active')
  const { runtime, time, reports } = makeSight()
  runtime.start(); answerSight(runtime, time); runtime.pause(); time.advance(500); runtime.resume()
  finishSight(runtime, time)
  assert.equal(host.finalize(session.id), true)
  assert.equal(host.finalize(session.id), false)
  await runtime.flushPersistence()
  assert.equal(runtime.reports.list().length, 1)
  assert.equal(reports.records.length, 1)
  assert.equal(reports.saveCalls, 1)
  assert.equal(reports.records[0].completionState, 'completed')
})

test('APS12', 'Sight natural completion after repeated round trips still persists exactly once', async () => {
  const host = new ActivePracticeSessionHost()
  host.begin('sight', 'sight-active')
  const { runtime, time, reports } = makeSight()
  runtime.start(); answerSight(runtime, time)
  for (const auxiliary of ['midi', 'update', 'midi']) {
    host.rememberAuxiliaryReturn('sight-active', auxiliary)
    runtime.pause(); time.advance(100); assert.equal(host.consumeAuxiliaryReturn(auxiliary, 'settings'), 'sight-active'); runtime.resume()
  }
  finishSight(runtime, time); await runtime.flushPersistence()
  assert.equal(runtime.reports.list().length, 1)
  assert.equal(reports.records.length, 1)
  assert.equal(reports.saveCalls, 1)
})

test('APS13', 'Sight explicit Stop after temporary navigation persists exactly one partial record', async () => {
  const host = new ActivePracticeSessionHost()
  const session = host.begin('sight', 'sight-active')
  const { runtime, time, reports } = makeSight()
  runtime.start(); answerSight(runtime, time); runtime.pause(); time.advance(500); runtime.resume()
  const report = runtime.stop(); host.end(session.id); host.end(session.id)
  await runtime.flushPersistence()
  assert.equal(report.completionState, 'stopped')
  assert.equal(runtime.reports.list().length, 1)
  assert.equal(reports.records.length, 1)
  assert.equal(reports.saveCalls, 1)
})

test('APS14', 'App owns one persistent MIDI observer and Chord page unmount never stops Runtime', () => {
  assert.equal((mainSource.match(/midiRouter\.subscribe\(/g) ?? []).length, 1)
  const chordUi = mainSource.slice(mainSource.indexOf('function ChordPracticeScreen'), mainSource.indexOf('function SightReadyScreen'))
  assert.doesNotMatch(chordUi, /return \(\) => \{ runtime\.stop\(\) \}/)
  assert.match(mainSource, /useMemo\(\(\) => new ChordPracticeRuntime/)
  assert.match(mainSource, /chordRuntime\.pause\('manual-pause'\)/)
})

test('APS15', 'navigation is preserve-plus-suspend with explicit origin return and no automatic resume', () => {
  assert.match(mainSource, /activeSessionHost\.rememberAuxiliaryReturn\(origin, destination\)/)
  assert.match(mainSource, /activeSessionHost\.consumeAuxiliaryReturn\(screenRef\.current, fallback\)/)
  const openAuxiliary = mainSource.slice(mainSource.indexOf('const openAuxiliary'), mainSource.indexOf('const returnFromAuxiliary'))
  assert.match(openAuxiliary, /runtime\.pause\(\)/)
  assert.match(openAuxiliary, /chordRuntime\.pause\('manual-pause'\)/)
  assert.doesNotMatch(openAuxiliary, /\.stop\(|\.resume\(|INPUT_STATE_RESET/)
})

test('APS16', 'active host is in-memory only and does not alter durable contracts', () => {
  assert.doesNotMatch(hostSource, /Preferences|localStorage|sessionStorage|IndexedDB|PracticeSessionRepository/)
  assert.match(hostSource, /private generation = 0/)
  assert.match(hostSource, /finalizedSessionIds/)
  assert.doesNotMatch(hostSource, /Date\.now|randomUUID|Math\.random/)
})

test('APS17', 'Chord MIDI self-reentry is a no-op and preserves original return origin, session and Runtime', () => {
  const host = new ActivePracticeSessionHost()
  const session = host.begin('chord', 'chord-practice')
  const { runtime } = makeChord()
  const question = runtime.snapshot.question
  let openCallbacks = 0
  assert.equal(requestAuxiliary(host, 'chord-practice', 'midi', () => { openCallbacks += 1 }), true)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal(requestAuxiliary(host, 'midi', 'midi', () => { openCallbacks += 1 }), false)
  }
  assert.equal(host.consumeAuxiliaryReturn('midi', 'settings'), 'chord-practice')
  assert.equal(host.current.id, session.id)
  assert.equal(runtime.snapshot.question, question)
  assert.equal(openCallbacks, 1)
})

test('APS18', 'Sight MIDI self-reentry preserves origin/controller identity and writes no History', () => {
  const host = new ActivePracticeSessionHost()
  const session = host.begin('sight', 'sight-active')
  const { runtime, reports } = makeSight()
  const controller = runtime.controller
  requestAuxiliary(host, 'sight-active', 'midi')
  requestAuxiliary(host, 'midi', 'midi')
  assert.equal(host.consumeAuxiliaryReturn('midi', 'settings'), 'sight-active')
  assert.equal(host.current.id, session.id)
  assert.equal(runtime.controller, controller)
  assert.equal(runtime.reports.list().length, 0)
  assert.equal(reports.saveCalls, 0)
})

test('APS19', 'ordinary Settings origin survives three MIDI self-open attempts', () => {
  const host = new ActivePracticeSessionHost()
  requestAuxiliary(host, 'settings', 'midi')
  for (let attempt = 0; attempt < 3; attempt += 1) requestAuxiliary(host, 'midi', 'midi')
  assert.equal(host.consumeAuxiliaryReturn('midi', 'home'), 'settings')
})

test('APS20', 'production navigation guard precedes every side effect and MIDI-page status is display-only', () => {
  const openAuxiliary = mainSource.slice(mainSource.indexOf('const openAuxiliary'), mainSource.indexOf('const returnFromAuxiliary'))
  assert.ok(openAuxiliary.indexOf('if (origin === destination) return') < openAuxiliary.indexOf('activeSessionHost.rememberAuxiliaryReturn'))
  assert.ok(openAuxiliary.indexOf('if (origin === destination) return') < openAuxiliary.indexOf('runtime.pause()'))
  const status = mainSource.slice(mainSource.indexOf('function MidiStatusButton'), mainSource.indexOf('function ProductHeader'))
  assert.match(status, /if \(!interactive\)/)
  assert.match(status, /<div aria-label=\{status\.label\}[^>]+role="status">/)
  assert.match(status, /<button[^>]+onClick=\{\(\) => openAuxiliary\('midi'\)\}/)
  const midiScreen = mainSource.slice(mainSource.indexOf('function MidiScreen'), mainSource.indexOf('function updaterStatusCopy'))
  assert.match(midiScreen, /<ProductHeader midiStatusInteractive=\{false\}/)
  const practiceHeader = mainSource.slice(mainSource.indexOf('function PracticeFocusHeader'), mainSource.indexOf('function PracticeMetric'))
  assert.match(practiceHeader, /<MidiStatusButton compact \/>/)
})

;(async () => {
  let failed = 0
  for (const item of tests) {
    try { await item.callback(); console.log(`PASS ${item.id} ${item.title}`) }
    catch (error) { failed += 1; console.error(`FAIL ${item.id} ${item.title}`); console.error(error.stack || error) }
  }
  console.log(`\n${tests.length - failed}/${tests.length} Android active practice session groups PASS`)
  if (failed > 0) process.exitCode = 1
})()
