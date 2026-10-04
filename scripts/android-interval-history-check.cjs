const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename
    }).outputText
    module._compile(output, filename)
  }
}

const practice = require('../prototype/android-tablet-v1/src/intervalPractice/index.ts')
const theory = require('../prototype/android-tablet-v1/src/musicTheory/intervals/index.ts')
const { projectMixedPracticeHistory } = require('../prototype/android-tablet-v1/src/mixedHistoryProjection.ts')
const { projectHistoryDashboard } = require('../prototype/android-tablet-v1/src/historyDashboardProjection.ts')
const tests = []
const test = (id, title, callback) => tests.push({ id, title, callback })

class Backend {
  constructor(values = new Map()) { this.values = values; this.failNextIntervalSet = false }
  async get({ key }) { return { value: this.values.get(key) ?? null } }
  async set({ key, value }) {
    if (this.failNextIntervalSet && key.startsWith(practice.INTERVAL_REPORT_STORAGE_KEYS.reportPrefix)) {
      this.failNextIntervalSet = false
      throw new Error('simulated quota failure')
    }
    this.values.set(key, value)
  }
  async keys() { return { keys: [...this.values.keys()] } }
}

const sessionSettings = Object.freeze({ ...practice.DEFAULT_INTERVAL_PRACTICE_SETTINGS, answerHint: false, includeAccidentalRoots: true, questionCount: 20 })
function attempt(intervalId, index, wrong = 0) {
  const q = theory.INTERVAL_PRACTICE_CANDIDATES[intervalId][index % theory.INTERVAL_PRACTICE_CANDIDATES[intervalId].length]
  return { questionId: `q-${index}`, intervalId, root: q.root, target: q.target, rootMidi: q.rootMidi, targetMidi: q.targetMidi, wrongAttemptCount: wrong, firstTryCorrect: wrong === 0, completed: true }
}
function sessionSnapshot(attempts = []) {
  return { status: 'STOPPED', transportReady: true, settings: sessionSettings, practiceState: null, question: null, questionCount: 20, completedQuestions: attempts.length, attempts, currentWrongAttemptCount: 0, judgement: null }
}
function draft(attempts = []) {
  return practice.buildIntervalPracticeReport(sessionSnapshot(attempts), { startedAtEpochMs: 100, finishedAtEpochMs: 200, completionStatus: 'STOPPED' })
}

test('IH01', 'Interval records round-trip without touching existing Sight or Chord keys', async () => {
  const oldSight = 'piano.v1.sightReading.report.legacy'
  const oldChord = 'piano.v1.chord.report.chord-report-1'
  const values = new Map([[oldSight, '{"legacy":true}'], [oldChord, '{"legacy":true}']])
  const backend = new Backend(values)
  const repository = new practice.IntervalReportRepository(backend)
  assert.equal((await repository.initialize()).success, true)
  const saved = await repository.saveForSession('session-a', draft([attempt('majorThird', 0, 2)]))
  assert.equal(saved.success, true)
  const reloaded = new practice.IntervalReportRepository(backend)
  const result = await reloaded.initialize()
  assert.equal(result.success, true)
  assert.equal(result.records.length, 1)
  assert.equal(practice.isIntervalPracticeReportV1(result.records[0]), true)
  assert.equal(values.get(oldSight), '{"legacy":true}')
  assert.equal(values.get(oldChord), '{"legacy":true}')
})

test('IH02', 'malformed Interval record is skipped safely while valid records remain', async () => {
  const backend = new Backend(new Map([
    [practice.INTERVAL_REPORT_STORAGE_KEYS.reportIndex, JSON.stringify({ schemaVersion: 1, nextSequence: 3, recordIds: ['interval-report-1', 'interval-report-2'] })],
    [`${practice.INTERVAL_REPORT_STORAGE_KEYS.reportPrefix}interval-report-1`, JSON.stringify(practice.createIntervalPracticeReport('interval-report-1', draft()))],
    [`${practice.INTERVAL_REPORT_STORAGE_KEYS.reportPrefix}interval-report-2`, '{bad-json']
  ]))
  const result = await new practice.IntervalReportRepository(backend).initialize()
  assert.equal(result.success, true)
  assert.equal(result.records.length, 1)
  assert.deepEqual(result.diagnostics.invalidRecordIds, ['interval-report-2'])
})

test('IH03', 'zero-question STOPPED follows Sight contract and is persisted safely', async () => {
  const backend = new Backend()
  const repository = new practice.IntervalReportRepository(backend)
  await repository.initialize()
  const result = await repository.saveForSession('zero-session', draft())
  assert.equal(result.success, true)
  assert.equal(result.record.completedQuestions, 0)
  assert.equal(result.record.firstTryAccuracy, null)
})

test('IH04', 'save failure retains the same session draft and retry creates one record only', async () => {
  const backend = new Backend()
  const repository = new practice.IntervalReportRepository(backend)
  const coordinator = new practice.IntervalReportPersistenceCoordinator(repository, { now: (() => { let n = 1000; return () => ++n })() })
  await coordinator.initialize()
  coordinator.beginSession('retry-session')
  backend.failNextIntervalSet = true
  const failed = await coordinator.finalize('retry-session', sessionSnapshot([attempt('majorSixth', 0, 1)]), 'STOPPED')
  assert.equal(failed.success, false)
  assert.equal(coordinator.snapshot.pendingSaveCount, 1)
  const retried = await coordinator.retryPending()
  assert.equal(retried[0].success, true)
  assert.equal(coordinator.snapshot.records.length, 1)
  assert.equal(coordinator.snapshot.pendingSaveCount, 0)
})

test('IH05', 'History list projection distinguishes Interval mode and stopped/completed state', () => {
  const stopped = practice.createIntervalPracticeReport('interval-report-1', draft([attempt('minorSecond', 0, 1)]))
  const completedDraft = practice.buildIntervalPracticeReport({ ...sessionSnapshot(Array.from({ length: 20 }, (_, index) => attempt('perfectFifth', index))), status: 'SESSION_COMPLETE' }, { startedAtEpochMs: 300, finishedAtEpochMs: 400, completionStatus: 'COMPLETED' })
  const completed = practice.createIntervalPracticeReport('interval-report-2', completedDraft)
  const items = practice.projectIntervalHistory([stopped, completed])
  assert.deepEqual(items.map((item) => [item.modeSummary, item.statusLabel]), [['音程练习', '已完成'], ['音程练习', '提前结束']])
  const mixed = projectMixedPracticeHistory([], [], [stopped, completed])
  assert.equal(mixed.every((item) => item.module === 'interval'), true)
  const dashboard = projectHistoryDashboard([], [], [stopped, completed], { now: 500, range: 'all', filter: 'interval' })
  assert.deepEqual(dashboard.summary, { totalSessions: 2, totalCompletedQuestions: 21, currentStreakDays: 1 })
})

test('IH06', 'Result and History detail expose shared facts without timing or debug artifacts', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../prototype/android-tablet-v1/src/main.tsx'), 'utf8')
  const result = source.slice(source.indexOf('function IntervalReportFacts'), source.indexOf('type HistoryFilter'))
  for (const key of ['completedQuestions', 'firstTryAccuracy', 'retriedCorrect', 'wrongAttempts', 'difficultIntervals', 'performance', 'sessionSettings']) assert.ok(result.includes(`t('${key}')`), key)
  assert.match(result, /<IntervalReportFacts report=\{report\}/)
  assert.doesNotMatch(result, /reaction|responseTime|fastest|slowest|timeout|raw MIDI|session id/i)
  assert.doesNotMatch(result, /<dd>\{entry\.intervalId\}|<span>\{entry\.intervalId\}/)
  assert.doesNotMatch(result, /DEBUG|NOTE ON|NOTE OFF|raw JSON/)
  assert.doesNotMatch(result, /practiceMode|音程复现|音程构造|<dt>练习方式/)
  const history = source.slice(source.indexOf('function HistoryRecord'), source.indexOf('function ChordReportDetailScreen'))
  assert.match(history, /history-module-badge is-interval/)
  assert.match(history, /item\.modeSummary/)
  assert.match(source, /options\.find\(\(option\) => String\(option\.value\) === event\.target\.value\)/)
})

test('IH07', 'legacy modes wide-read unchanged bytes and facts; new records never write the retired field', async () => {
  for (const practiceMode of ['reproduction', 'construction']) {
    const current = practice.createIntervalPracticeReport('interval-report-1', draft([attempt('majorThird', 0, 2)]))
    const legacy = { ...current, settings: { ...current.settings, practiceMode } }
    const raw = JSON.stringify(legacy)
    const key = `${practice.INTERVAL_REPORT_STORAGE_KEYS.reportPrefix}interval-report-1`
    const backend = new Backend(new Map([[key, raw], [practice.INTERVAL_REPORT_STORAGE_KEYS.reportIndex, JSON.stringify({ schemaVersion: 1, nextSequence: 2, recordIds: ['interval-report-1'] })]]))
    const repository = new practice.IntervalReportRepository(backend)
    const loaded = await repository.initialize()
    assert.equal(loaded.success, true)
    assert.deepEqual(loaded.records[0], legacy)
    assert.equal(backend.values.get(key), raw)
    assert.equal(practice.projectIntervalHistory(loaded.records)[0].modeSummary, '音程练习')
    const saved = await repository.saveForSession('new-session', { ...draft(), settings: legacy.settings })
    assert.equal(saved.success, true)
    assert.equal(Object.hasOwn(saved.record.settings, 'practiceMode'), false)
    assert.equal(backend.values.get(key), raw)
    assert.doesNotMatch(backend.values.get(`${practice.INTERVAL_REPORT_STORAGE_KEYS.reportPrefix}${saved.record.recordId}`), /practiceMode/)
  }
})

;(async () => {
  let failed = 0
  for (const item of tests) {
    try { await item.callback(); console.log(`PASS ${item.id} ${item.title}`) }
    catch (error) { failed += 1; console.error(`FAIL ${item.id} ${item.title}`); console.error(error.stack || error) }
  }
  console.log(`${tests.length - failed}/${tests.length} Android Interval History contract groups PASS`)
  if (failed > 0) process.exitCode = 1
})()
