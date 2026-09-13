const assert = require('node:assert/strict')
const fs = require('node:fs')
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

const {
  ChordReportPersistenceCoordinator,
  ChordReportRepository,
  CHORD_REPORT_STORAGE_KEYS
} = require('../prototype/android-tablet-v1/src/chordPractice/persistence.ts')
const {
  createChordPracticeReportDraft,
  isChordPracticeReportV1
} = require('../prototype/android-tablet-v1/src/chordPractice/report.ts')
const { ChordPracticeRuntime } = require('../prototype/android-tablet-v1/src/chordPractice/runtime/index.ts')
const { ActivePracticeSessionHost } = require('../prototype/android-tablet-v1/src/activePracticeSession.ts')

class FakePreferencesBackend {
  constructor(values = new Map(), failSetKey = null) {
    this.values = values
    this.failSetKey = failSetKey
    this.operations = []
  }
  async get({ key }) { this.operations.push(['get', key]); return { value: this.values.get(key) ?? null } }
  async set({ key, value }) {
    this.operations.push(['set', key])
    if (key === this.failSetKey) throw new Error(`blocked ${key}`)
    this.values.set(key, value)
  }
  async keys() { this.operations.push(['keys', '*']); return { keys: [...this.values.keys()] } }
}

const timing = (start, arpeggio, switching, spread) => ({
  questionStartLatencyMs: start,
  arpeggioDurationMs: arpeggio,
  switchToBlockLatencyMs: switching,
  blockLandingSpreadMs: spread
})

function snapshot(options = {}) {
  const completed = options.completed ?? 10
  const arpeggioErrors = options.arpeggioErrors ?? 1
  const blockErrors = options.blockErrors ?? 2
  const samples = options.timingSamples ?? Array.from({ length: completed }, (_, index) => timing(100 + index, 200 + index, 300 + index, 10 + index))
  return {
    status: options.status ?? 'SESSION_COMPLETE',
    questionCount: options.questionCount ?? 10,
    mode: options.mode ?? 'sequential',
    sequentialKey: options.mode === 'comprehensive' ? null : (options.sequentialKey ?? 'Eb'),
    activePracticeDurationMs: options.activePracticeDurationMs ?? 12_345,
    timingSamples: samples,
    counters: {
      completedQuestions: completed,
      firstPassCompletedQuestions: options.firstPass ?? Math.max(0, completed - 3),
      arpeggioErrors,
      blockErrors,
      totalErrors: options.totalErrors ?? arpeggioErrors + blockErrors,
      currentFirstPassStreak: 0,
      longestFirstPassStreak: options.longest ?? Math.min(4, completed)
    },
    judgement: options.judgement ?? null
  }
}

function index(nextSequence, recordIds) {
  return JSON.stringify({ schemaVersion: 1, nextSequence, recordIds })
}

function draft(options = {}) {
  const snap = snapshot(options)
  return createChordPracticeReportDraft(snap, {
    startedAtEpochMs: options.startedAtEpochMs ?? 1_000,
    endedAtEpochMs: options.endedAtEpochMs ?? 2_000,
    completionReason: options.completionReason ?? 'completed'
  })
}

async function save(options = {}, sessionId = 'chord-1', backend = new FakePreferencesBackend()) {
  const repository = new ChordReportRepository(backend)
  const result = await repository.saveForSession(sessionId, draft(options))
  return { backend, repository, result }
}

class FakeTime {
  constructor() { this.value = 0; this.nextId = 1 }
  now() { return this.value }
  schedule() { return this.nextId++ }
  cancel() {}
  advance(ms) { this.value += ms }
}

const tests = []
const test = (id, name, callback) => tests.push({ id, name, callback })

test('CP01', 'finite natural 10/10 saves one completed report', async () => {
  const { repository, result } = await save()
  assert.equal(result.success, true); assert.equal(repository.list().length, 1)
  assert.deepEqual([result.record.completionReason, result.record.completedQuestions, result.record.plannedQuestionCount], ['completed', 10, 10])
})

test('CP02', 'finite stopped 7/20 saves one stopped report', async () => {
  const { result } = await save({ completed: 7, firstPass: 5, questionCount: 20, completionReason: 'stopped' })
  assert.equal(result.success, true); assert.deepEqual([result.record.completionReason, result.record.completedQuestions, result.record.plannedQuestionCount], ['stopped', 7, 20])
})

test('CP03', 'endless End stores completed count with a null denominator', async () => {
  const { result } = await save({ completed: 42, firstPass: 36, questionCount: 'endless', completionReason: 'stopped' })
  assert.equal(result.success, true); assert.deepEqual([result.record.completedQuestions, result.record.plannedQuestionCount], [42, null])
})

test('CP04', 'zero-completed End creates no durable report', async () => {
  const backend = new FakePreferencesBackend(); const repository = new ChordReportRepository(backend)
  let now = 1000; const coordinator = new ChordReportPersistenceCoordinator(repository, { now: () => now })
  coordinator.beginSession('chord-1'); now = 2000
  const result = await coordinator.finalize('chord-1', snapshot({ completed: 0, firstPass: 0, arpeggioErrors: 0, blockErrors: 0, longest: 0, timingSamples: [], questionCount: 20, status: 'STOPPED' }), 'stopped')
  assert.equal(result, null); assert.equal(repository.list().length, 0); assert.equal(backend.operations.some(([op]) => op === 'set'), false)
})

test('CP05', 'partial current Arpeggio is discarded from durable facts', async () => {
  const { result } = await save({ completed: 7, firstPass: 7, questionCount: 20, completionReason: 'stopped', judgement: { state: { phase: 'ARPEGGIO_ACTIVE' } } })
  assert.equal(result.record.completedQuestions, 7); assert.equal(result.record.timingSummary.arpeggioDurationMs.sampleCount, 7)
})

test('CP06', 'completed Arpeggio plus incomplete Block is discarded', async () => {
  const { result } = await save({ completed: 7, firstPass: 6, questionCount: 20, completionReason: 'stopped', judgement: { state: { phase: 'BLOCK_CAPTURE' } } })
  assert.equal(result.record.completedQuestions, 7); assert.equal(result.record.timingSummary.blockLandingSpreadMs.sampleCount, 7)
})

test('CP07', 'first-pass counters remain factual', async () => {
  const { result } = await save({ firstPass: 6 }); assert.equal(result.record.firstPassCompleteQuestions, 6)
})

test('CP08', 'Arpeggio Block and total errors are preserved', async () => {
  const { result } = await save({ arpeggioErrors: 4, blockErrors: 5 }); assert.deepEqual([result.record.arpeggioErrors, result.record.blockErrors, result.record.totalErrors], [4, 5, 9])
})

test('CP09', 'longest first-pass streak is preserved', async () => {
  const { result } = await save({ firstPass: 8, longest: 5 }); assert.equal(result.record.longestFirstPassStreak, 5)
})

test('CP10', 'practice mode is captured from the Runtime snapshot', async () => {
  const { result } = await save({ mode: 'comprehensive' }); assert.equal(result.record.practiceMode, 'comprehensive')
})

test('CP11', 'Sequential key is captured from session facts', async () => {
  const { result } = await save({ sequentialKey: 'Cb' }); assert.equal(result.record.sequentialKey, 'Cb')
})

test('CP12', 'Comprehensive reports always use a null Sequential key', async () => {
  const { result } = await save({ mode: 'comprehensive' }); assert.equal(result.record.sequentialKey, null)
})

test('CP13', 'four timing medians and sample counts are persisted', async () => {
  const samples = [timing(20, 50, 90, 9), timing(10, 30, 70, 7), timing(30, 40, 80, 8)]
  const { result } = await save({ completed: 3, firstPass: 3, longest: 3, arpeggioErrors: 0, blockErrors: 0, timingSamples: samples, questionCount: 10, completionReason: 'stopped' })
  assert.deepEqual(Object.values(result.record.timingSummary).map((metric) => [metric.sampleCount, metric.medianMs]), [[3, 20], [3, 40], [3, 80], [3, 8]])
})

test('CP14', 'active practice duration excludes paused time', () => {
  const time = new FakeTime(); const runtime = new ChordPracticeRuntime({ clock: time, scheduler: time, rng: () => 0.1 })
  runtime.start({ mode: 'comprehensive', questionCount: 10 }); time.advance(100); runtime.pause('manual-pause'); time.advance(500)
  assert.equal(runtime.snapshot.activePracticeDurationMs, 100)
  runtime.resume(); time.advance(50); runtime.stop(); assert.equal(runtime.snapshot.activePracticeDurationMs, 150)
})

test('CP15', 'started and ended wall timestamps are valid session boundaries', async () => {
  let now = 10_000; const backend = new FakePreferencesBackend(); const repository = new ChordReportRepository(backend); const coordinator = new ChordReportPersistenceCoordinator(repository, { now: () => now })
  coordinator.beginSession('chord-1'); now = 20_000; const result = await coordinator.finalize('chord-1', snapshot(), 'completed')
  assert.deepEqual([result.record.startedAtEpochMs, result.record.endedAtEpochMs], [10_000, 20_000])
})

test('CP16', 'report body is written before index publication', async () => {
  const { backend } = await save(); const writes = backend.operations.filter(([op]) => op === 'set').map(([, key]) => key)
  assert.deepEqual(writes, [`${CHORD_REPORT_STORAGE_KEYS.reportPrefix}chord-report-1`, CHORD_REPORT_STORAGE_KEYS.reportIndex])
})

test('CP17', 'duplicate finalized-session callback creates exactly one report', async () => {
  const backend = new FakePreferencesBackend(); const repository = new ChordReportRepository(backend); const coordinator = new ChordReportPersistenceCoordinator(repository, { now: () => 1000 })
  coordinator.beginSession('chord-1'); const first = await coordinator.finalize('chord-1', snapshot(), 'completed'); const second = await coordinator.finalize('chord-1', snapshot(), 'completed')
  assert.equal(first.success, true); assert.equal(second, null); assert.equal(repository.list().length, 1)
})

test('CP18', 'durable record IDs are monotonic across repository reload', async () => {
  const backend = new FakePreferencesBackend(); const first = await save({}, 'chord-1', backend); const second = await save({}, 'chord-2', backend)
  assert.equal(first.result.record.recordId, 'chord-report-1'); assert.equal(second.result.record.recordId, 'chord-report-2')
})

test('CP19', 'malformed indexed report is skipped without deleting storage', async () => {
  const backend = new FakePreferencesBackend(new Map([[CHORD_REPORT_STORAGE_KEYS.reportIndex, index(2, ['chord-report-1'])], [`${CHORD_REPORT_STORAGE_KEYS.reportPrefix}chord-report-1`, '{bad']]))
  const result = await new ChordReportRepository(backend).initialize(); assert.equal(result.success, true); assert.deepEqual(result.diagnostics.invalidRecordIds, ['chord-report-1']); assert.equal(backend.values.has(`${CHORD_REPORT_STORAGE_KEYS.reportPrefix}chord-report-1`), true)
})

test('CP20', 'missing indexed report is skipped safely', async () => {
  const backend = new FakePreferencesBackend(new Map([[CHORD_REPORT_STORAGE_KEYS.reportIndex, index(2, ['chord-report-1'])]]))
  const result = await new ChordReportRepository(backend).initialize(); assert.deepEqual(result.diagnostics.missingRecordIds, ['chord-report-1']); assert.equal(result.records.length, 0)
})

test('CP21', 'wrong report schema is skipped safely', async () => {
  const invalid = { schemaVersion: 2, recordId: 'chord-report-1', module: 'chord' }
  const backend = new FakePreferencesBackend(new Map([[CHORD_REPORT_STORAGE_KEYS.reportIndex, index(2, ['chord-report-1'])], [`${CHORD_REPORT_STORAGE_KEYS.reportPrefix}chord-report-1`, JSON.stringify(invalid)]]))
  const result = await new ChordReportRepository(backend).initialize(); assert.deepEqual(result.diagnostics.invalidRecordIds, ['chord-report-1'])
})

test('CP22', 'index and records survive repository reload', async () => {
  const { backend } = await save(); const reloaded = new ChordReportRepository(backend); const result = await reloaded.initialize()
  assert.equal(result.success, true); assert.deepEqual(reloaded.list().map((record) => record.recordId), ['chord-report-1']); assert.equal(isChordPracticeReportV1(reloaded.list()[0]), true)
})

test('CP23', 'Chord settings remain byte-for-byte unchanged after report save', async () => {
  const settingsKey = 'piano.v1.chord.settings'; const raw = JSON.stringify({ schemaVersion: 1, sequentialKey: 'Gb', showChordTones: false }); const backend = new FakePreferencesBackend(new Map([[settingsKey, raw]]))
  await save({}, 'chord-1', backend); assert.equal(backend.values.get(settingsKey), raw)
})

test('CP24', 'Sight persistence keys are neither read nor written by Chord report save', async () => {
  const { backend } = await save(); assert.equal(backend.operations.some(([, key]) => String(key).startsWith('piano.v1.sightReading.')), false)
})

test('CP25', 'invalid error invariant fails deterministically before persistence', () => {
  assert.throws(() => draft({ totalErrors: 99 }), /error-counter invariant/)
})

test('CP26', 'index failure leaves an invisible orphan and reports failure honestly', async () => {
  const backend = new FakePreferencesBackend(new Map(), CHORD_REPORT_STORAGE_KEYS.reportIndex); const repository = new ChordReportRepository(backend)
  const result = await repository.saveForSession('chord-1', draft()); assert.equal(result.success, false); assert.equal(repository.list().length, 0); assert.equal(backend.values.has(`${CHORD_REPORT_STORAGE_KEYS.reportPrefix}chord-report-1`), true)
})

test('CP27', 'first wrong Arpeggio NOTE_ON remains the persisted start-latency sample', async () => {
  const samples = [timing(123, 200, 300, 10)]
  const { result } = await save({ completed: 1, firstPass: 0, longest: 0, arpeggioErrors: 1, blockErrors: 0, timingSamples: samples, questionCount: 10, completionReason: 'stopped' })
  assert.equal(result.record.timingSummary.questionStartLatencyMs.medianMs, 123)
})

test('CP28', 'temporary MIDI round trips save nothing and finite natural completion saves once', async () => {
  const backend = new FakePreferencesBackend(); const repository = new ChordReportRepository(backend); const coordinator = new ChordReportPersistenceCoordinator(repository, { now: () => 1000 }); const host = new ActivePracticeSessionHost()
  const session = host.begin('chord', 'chord-practice'); coordinator.beginSession(session.id)
  for (let count = 0; count < 3; count += 1) { host.rememberAuxiliaryReturn('chord-practice', 'midi'); assert.equal(host.consumeAuxiliaryReturn('midi', 'settings'), 'chord-practice') }
  assert.equal(repository.list().length, 0)
  if (host.finalize(session.id)) await coordinator.finalize(session.id, snapshot(), 'completed')
  await coordinator.finalize(session.id, snapshot(), 'completed')
  assert.equal(repository.list().length, 1); assert.equal(repository.list()[0].completionReason, 'completed')
})

test('CP29', 'temporary navigation followed by End saves one stopped partial report', async () => {
  const backend = new FakePreferencesBackend(); const repository = new ChordReportRepository(backend); const coordinator = new ChordReportPersistenceCoordinator(repository, { now: () => 1000 }); const host = new ActivePracticeSessionHost()
  const session = host.begin('chord', 'chord-practice'); coordinator.beginSession(session.id); host.rememberAuxiliaryReturn('chord-practice', 'midi'); host.consumeAuxiliaryReturn('midi', 'settings')
  if (host.end(session.id)) await coordinator.finalize(session.id, snapshot({ completed: 5, firstPass: 4, questionCount: 20, completionReason: 'stopped' }), 'stopped')
  assert.equal(repository.list().length, 1); assert.deepEqual([repository.list()[0].completedQuestions, repository.list()[0].plannedQuestionCount, repository.list()[0].completionReason], [5, 20, 'stopped'])
})

test('CP30', 'report-body failure never publishes an index entry', async () => {
  const bodyKey = `${CHORD_REPORT_STORAGE_KEYS.reportPrefix}chord-report-1`
  const backend = new FakePreferencesBackend(new Map(), bodyKey)
  const repository = new ChordReportRepository(backend)
  const result = await repository.saveForSession('chord-1', draft())
  assert.equal(result.success, false)
  assert.equal(backend.values.has(CHORD_REPORT_STORAGE_KEYS.reportIndex), false)
  assert.equal(repository.list().length, 0)
})

async function run() {
  let failed = 0
  for (const { id, name, callback } of tests) {
    try { await callback(); process.stdout.write(`PASS ${id} ${name}\n`) }
    catch (error) { failed += 1; process.stderr.write(`FAIL ${id} ${name}\n${error.stack || error}\n`) }
  }
  process.stdout.write(`\n${tests.length - failed}/${tests.length} Android Chord Persistence checks PASS\n`)
  process.exitCode = failed ? 1 : 0
}

void run()
