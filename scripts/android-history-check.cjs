const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      },
      fileName: filename
    }).outputText
    module._compile(output, filename)
  }
}

const {
  ANDROID_PERSISTENCE_KEYS,
  initializeAndroidPersistence
} = require('../prototype/android-tablet-v1/src/androidPersistenceCore.ts')
const {
  formatHistoryPercentage,
  projectSightReadingHistory
} = require('../prototype/android-tablet-v1/src/historyProjection.ts')
const { AndroidSightReadingRuntime } = require('../prototype/android-tablet-v1/src/sightReadingIntegration.ts')

class FakePreferencesBackend {
  constructor(values = new Map()) {
    this.values = values
    this.operations = []
  }

  async get({ key }) {
    this.operations.push(['get', key])
    return { value: this.values.get(key) ?? null }
  }

  async set({ key, value }) {
    this.operations.push(['set', key])
    this.values.set(key, value)
  }

  async keys() {
    this.operations.push(['keys', '*'])
    return { keys: [...this.values.keys()] }
  }
}

function record(options = {}) {
  const completionState = options.completionState ?? 'completed'
  const plannedQuestionCount = options.plannedQuestionCount ?? 10
  const completed = options.completed ?? (completionState === 'completed' ? plannedQuestionCount : 3)
  const correct = options.correct ?? Math.max(0, completed - 2)
  const wrong = options.wrong ?? (completed > 0 ? 1 : 0)
  const timeout = options.timeout ?? Math.max(0, completed - correct - wrong)
  const endedAt = options.endedAt ?? 20_000
  const durationMs = options.durationMs ?? 5_000
  const averageReactionMs = options.averageReactionMs === undefined ? 500 : options.averageReactionMs
  const fastestReactionMs = options.fastestReactionMs === undefined ? (averageReactionMs === null ? null : 200) : options.fastestReactionMs
  const slowestReactionMs = options.slowestReactionMs === undefined ? (averageReactionMs === null ? null : 900) : options.slowestReactionMs
  return {
    schemaVersion: 1,
    recordId: options.recordId ?? 'record-1',
    practiceType: 'sightReading',
    completionState,
    partialEvidence: completionState === 'stopped',
    startedAt: endedAt - durationMs,
    endedAt,
    durationMs,
    settings: {
      schemaVersion: 1,
      staffMode: options.staffMode ?? 'grand',
      keySignature: options.keySignature ?? 'C',
      notePoolMode: options.notePoolMode ?? 'diatonic',
      questionCount: plannedQuestionCount,
      answerTimeLimitMs: 5000,
      noteNameVisible: options.noteNameVisible ?? false
    },
    plannedQuestionCount,
    completed,
    correct,
    wrong,
    timeout,
    accuracy: completed > 0 ? correct / completed * 100 : 0,
    averageReactionMs,
    fastestReactionMs,
    slowestReactionMs,
    bestStreak: options.bestStreak ?? correct,
    targetNoteErrors: {
      wrong: [{ noteName: 'D4', count: wrong }],
      timeout: [{ noteName: 'E4', count: timeout }]
    },
    mostWrongNote: wrong > 0 ? 'D4' : '暂无',
    mostTimedOutNote: timeout > 0 ? 'E4' : '暂无',
    weakestNote: wrong + timeout > 0 ? 'D4' : '暂无',
    clefStats: {
      treble: { total: completed, correct, wrong, timeout, accuracy: completed > 0 ? correct / completed * 100 : 0 },
      bass: { total: 0, correct: 0, wrong: 0, timeout: 0, accuracy: 0 }
    }
  }
}

function runtimeDependencies(reportRepository) {
  return {
    clock: { now: () => 0 },
    scheduler: { schedule: () => 1, cancel: () => {} },
    random: () => 0.5,
    reportRepository
  }
}

const repositoryRoot = path.resolve(__dirname, '..')
const mainSource = fs.readFileSync(path.join(repositoryRoot, 'prototype', 'android-tablet-v1', 'src', 'main.tsx'), 'utf8')
const projectionSource = fs.readFileSync(path.join(repositoryRoot, 'prototype', 'android-tablet-v1', 'src', 'historyProjection.ts'), 'utf8')
const historySource = mainSource.slice(mainSource.indexOf('function HistoryScreen'), mainSource.indexOf('function SettingRow'))

const tests = []
const test = (name, callback) => tests.push({ name, callback })

test('HIS01 empty repository projects a real empty state with no Mock rows', () => {
  const history = projectSightReadingHistory([])
  assert.equal(history.items.length, 0)
  assert.equal(history.summary.totalSessions, 0)
  assert.match(historySource, /暂无真实练习记录/)
  assert.doesNotMatch(historySource, /今天 09:42|共 18 条记录|historyItems/)
})

test('HIS02 one COMPLETED report projects its durable facts', () => {
  const history = projectSightReadingHistory([record({ recordId: 'complete', correct: 8, wrong: 1, timeout: 1 })])
  assert.equal(history.items.length, 1)
  assert.equal(history.items[0].statusLabel, '已完成')
  assert.deepEqual(
    [history.items[0].completed, history.items[0].correct, history.items[0].wrong, history.items[0].timeout],
    [10, 8, 1, 1]
  )
})

test('HIS03 one STOPPED report is neutral early-ended evidence', () => {
  const history = projectSightReadingHistory([record({ recordId: 'stopped', completionState: 'stopped', completed: 3, correct: 2, wrong: 1, timeout: 0 })])
  assert.equal(history.items[0].completionState, 'stopped')
  assert.equal(history.items[0].statusLabel, '提前结束')
  assert.equal(history.items[0].completed, 3)
})

test('HIS04 COMPLETED and STOPPED reports both display', () => {
  const history = projectSightReadingHistory([
    record({ recordId: 'complete' }),
    record({ recordId: 'stopped', completionState: 'stopped' })
  ])
  assert.deepEqual(new Set(history.items.map((item) => item.completionState)), new Set(['completed', 'stopped']))
})

test('HIS05 newest endedAt sorts first', () => {
  const history = projectSightReadingHistory([
    record({ recordId: 'older', endedAt: 1000 }),
    record({ recordId: 'newer', endedAt: 2000 })
  ])
  assert.deepEqual(history.items.map((item) => item.recordId), ['newer', 'older'])
})

test('HIS06 equal endedAt uses deterministic recordId order', () => {
  const history = projectSightReadingHistory([
    record({ recordId: 'z-last', endedAt: 2000 }),
    record({ recordId: 'a-first', endedAt: 2000 })
  ])
  assert.deepEqual(history.items.map((item) => item.recordId), ['a-first', 'z-last'])
})

test('HIS07 completed and planned question counts remain distinct', () => {
  const item = projectSightReadingHistory([
    record({ completionState: 'stopped', completed: 4, correct: 3, wrong: 1, timeout: 0, plannedQuestionCount: 10 })
  ]).items[0]
  assert.equal(item.completed, 4)
  assert.equal(item.plannedQuestionCount, 10)
})

test('HIS08 correct wrong and timeout facts are preserved', () => {
  const item = projectSightReadingHistory([record({ correct: 6, wrong: 3, timeout: 1 })]).items[0]
  assert.deepEqual([item.correct, item.wrong, item.timeout], [6, 3, 1])
})

test('HIS09 nullable reaction remains null and renders a neutral summary', () => {
  const history = projectSightReadingHistory([record({ averageReactionMs: null, fastestReactionMs: null, slowestReactionMs: null })])
  assert.equal(history.items[0].averageReactionMs, null)
  assert.equal(history.summary.averageReactionMs, null)
  assert.match(historySource, /averageReactionMs === null \? '—'/)
})

test('HIS10 overall accuracy uses weighted question totals', () => {
  const history = projectSightReadingHistory([
    record({ recordId: 'one', completionState: 'stopped', completed: 1, correct: 1, wrong: 0, timeout: 0 }),
    record({ recordId: 'ten', completed: 10, correct: 0, wrong: 10, timeout: 0 })
  ])
  assert.equal(formatHistoryPercentage(history.summary.overallAccuracy), '9.1')
  assert.notEqual(history.summary.overallAccuracy, 50)
})

test('HIS11 aggregate reaction uses correct plus wrong sample weighting', () => {
  const history = projectSightReadingHistory([
    record({ recordId: 'one', completionState: 'stopped', completed: 1, correct: 1, wrong: 0, timeout: 0, averageReactionMs: 100 }),
    record({ recordId: 'nine', completionState: 'stopped', completed: 9, correct: 8, wrong: 1, timeout: 0, averageReactionMs: 900 })
  ])
  assert.equal(history.summary.averageReactionMs, 820)
})

test('HIS12 fastest slowest and best streak aggregates are mathematically correct', () => {
  const history = projectSightReadingHistory([
    record({ recordId: 'a', fastestReactionMs: 180, slowestReactionMs: 800, bestStreak: 3 }),
    record({ recordId: 'b', fastestReactionMs: 120, slowestReactionMs: 1100, bestStreak: 7 })
  ])
  assert.deepEqual(
    [history.summary.fastestReactionMs, history.summary.slowestReactionMs, history.summary.bestStreak],
    [120, 1100, 7]
  )
})

test('HIS13 settings summary derives only from the stored snapshot', () => {
  const item = projectSightReadingHistory([record({ staffMode: 'bass', keySignature: 'Gb', notePoolMode: 'chromatic', noteNameVisible: true })]).items[0]
  assert.equal(item.title, '低音谱表 · G♭ 大调')
  assert.equal(item.settingsSummary, '含临时变音 · 显示音名')
})

test('HIS14 C-flat enharmonic spelling renders as C-flat major', () => {
  const item = projectSightReadingHistory([record({ keySignature: 'Cb' })]).items[0]
  assert.equal(item.title, '大谱表 · C♭ 大调')
})

test('HIS15 one malformed report does not block valid repository records', async () => {
  const valid = record({ recordId: 'valid' })
  const backend = new FakePreferencesBackend(new Map([
    [ANDROID_PERSISTENCE_KEYS.schemaVersion, '1'],
    [`${ANDROID_PERSISTENCE_KEYS.sightReadingReportPrefix}valid`, JSON.stringify(valid)],
    [`${ANDROID_PERSISTENCE_KEYS.sightReadingReportPrefix}broken`, '{bad json'],
    [ANDROID_PERSISTENCE_KEYS.sightReadingReportIndex, JSON.stringify({ schemaVersion: 1, recordIds: ['valid', 'broken'] })]
  ]))
  const persistence = await initializeAndroidPersistence(backend)
  assert.equal(persistence.reportLoad.success, true)
  assert.deepEqual(projectSightReadingHistory(persistence.reportLoad.records).items.map((item) => item.recordId), ['valid'])
  assert.deepEqual(persistence.reportLoad.diagnostics.invalidRecordKeys, [`${ANDROID_PERSISTENCE_KEYS.sightReadingReportPrefix}broken`])
})

test('HIS16 a report absent from durable repository is never fabricated', async () => {
  const persistence = await initializeAndroidPersistence(new FakePreferencesBackend())
  assert.equal(projectSightReadingHistory(persistence.reports.list()).items.length, 0)
  assert.doesNotMatch(historySource, /sample session|示例练习|演示记录/)
})

test('HIS17 duplicate recordId produces one History row', () => {
  const duplicate = record({ recordId: 'same' })
  const history = projectSightReadingHistory([duplicate, { ...duplicate }])
  assert.deepEqual(history.items.map((item) => item.recordId), ['same'])
})

async function refreshScenario(completionState) {
  const backend = new FakePreferencesBackend()
  const runtimePersistence = await initializeAndroidPersistence(backend)
  const runtime = new AndroidSightReadingRuntime(runtimeDependencies(runtimePersistence.reports))
  assert.equal(runtime.historySnapshot.records.length, 0)

  const external = await initializeAndroidPersistence(backend)
  const durable = record({ recordId: `new-${completionState}`, completionState })
  assert.equal((await external.reports.save(durable)).success, true)
  assert.equal(runtime.historySnapshot.records.length, 0)
  await runtime.refreshHistory()
  return runtime.historySnapshot.records
}

test('HIS18 repository refresh reveals a newly durable COMPLETED report', async () => {
  const records = await refreshScenario('completed')
  assert.deepEqual(records.map((item) => item.recordId), ['new-completed'])
})

test('HIS19 repository refresh reveals a newly durable STOPPED report', async () => {
  const records = await refreshScenario('stopped')
  assert.equal(records[0].completionState, 'stopped')
})

test('HIS20 A4.1 schemaVersion 1 records display without rewrite', async () => {
  const durable = record({ recordId: 'a4-1-existing', keySignature: 'Cb' })
  const reportKey = `${ANDROID_PERSISTENCE_KEYS.sightReadingReportPrefix}${durable.recordId}`
  const raw = JSON.stringify(durable)
  const backend = new FakePreferencesBackend(new Map([
    [ANDROID_PERSISTENCE_KEYS.schemaVersion, '1'],
    [reportKey, raw],
    [ANDROID_PERSISTENCE_KEYS.sightReadingReportIndex, JSON.stringify({ schemaVersion: 1, recordIds: [durable.recordId] })]
  ]))
  const persistence = await initializeAndroidPersistence(backend)
  assert.equal(projectSightReadingHistory(persistence.reports.list()).items[0].recordId, 'a4-1-existing')
  assert.equal(backend.values.get(reportKey), raw)
  assert.deepEqual(backend.operations.filter(([operation]) => operation === 'set'), [])
})

test('HIS21 no History Mock dataset survives the production path', () => {
  assert.doesNotMatch(mainSource, /const historyItems/)
  assert.doesNotMatch(historySource, /今天 09:42|昨天 20:16|8 月 26 日 18:30|共 18 条记录|近 7 天/)
  assert.match(mainSource, /projectSightReadingHistory\(history\.records\)/)
})

test('HIS22 History presentation does not manipulate persistence keys', () => {
  assert.doesNotMatch(projectionSource, /ANDROID_PERSISTENCE_KEYS|CapacitorPreferencesBackend|Preferences\.|localStorage/)
  assert.doesNotMatch(historySource, /piano\.v1|ANDROID_PERSISTENCE_KEYS|Preferences|localStorage/)
})

test('HIS23 History introduces no delete edit or session-recovery action', () => {
  assert.doesNotMatch(historySource, /删除|编辑|继续上次|恢复练习|onClick=|<button/)
  assert.match(historySource, /<article className=/)
})

test('HIS24 durable report and History projection semantics remain unchanged', () => {
  const reportSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'sightReading', 'report.ts'), 'utf8')
  assert.doesNotMatch(reportSource, /interval|noteMode/)
  assert.doesNotMatch(projectionSource, /interval|noteMode/)
})

async function run() {
  let failed = 0
  for (const { name, callback } of tests) {
    try {
      await callback()
      process.stdout.write(`PASS ${name}\n`)
    } catch (error) {
      failed += 1
      process.stderr.write(`FAIL ${name}\n${error.stack || error}\n`)
    }
  }
  process.stdout.write(`\n${tests.length - failed}/${tests.length} Android History checks PASS\n`)
  process.exitCode = failed ? 1 : 0
}

void run()
