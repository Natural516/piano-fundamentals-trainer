const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filename
  }).outputText
  module._compile(output, filename)
}

const { projectHistoryDashboard } = require('../prototype/android-tablet-v1/src/historyDashboardProjection.ts')

const at = (daysAgo, hour = 12) => {
  const date = new Date(2026, 8, 24, hour, 0, 0, 0)
  date.setDate(date.getDate() - daysAgo)
  return date.getTime()
}

const sight = (recordId, daysAgo, completed = 10) => ({
  recordId,
  endedAt: at(daysAgo),
  completed
})

const chord = (recordId, daysAgo, completedQuestions = 20) => ({
  recordId,
  endedAtEpochMs: at(daysAgo),
  completedQuestions
})

const now = at(0, 18)
const tests = []
const test = (id, title, check) => tests.push([id, title, check])

test('HDB01', 'empty History produces truthful zero summary and seven empty days', () => {
  const result = projectHistoryDashboard([], [], { now })
  assert.deepEqual(result.summary, { totalSessions: 0, totalCompletedQuestions: 0, currentStreakDays: 0 })
  assert.equal(result.trend.length, 7)
  assert.ok(result.trend.every((bucket) => bucket.sessions === 0 && bucket.completedQuestions === 0))
})

test('HDB02', 'summary combines real Sight and Chord activity counts', () => {
  const result = projectHistoryDashboard([sight('s1', 0, 8)], [chord('c1', 0, 12)], { now })
  assert.equal(result.summary.totalSessions, 2)
  assert.equal(result.summary.totalCompletedQuestions, 20)
})

test('HDB03', 'duplicate module record IDs are deduplicated', () => {
  const result = projectHistoryDashboard([sight('s1', 0, 8), sight('s1', 0, 8)], [], { now })
  assert.equal(result.summary.totalSessions, 1)
  assert.equal(result.summary.totalCompletedQuestions, 8)
})

test('HDB04', 'same record ID in different modules remains two records', () => {
  const result = projectHistoryDashboard([sight('same', 0, 8)], [chord('same', 0, 12)], { now })
  assert.equal(result.summary.totalSessions, 2)
})

test('HDB05', 'seven-day trend aggregates both modules by local natural day', () => {
  const result = projectHistoryDashboard([sight('s1', 2, 8)], [chord('c1', 2, 12)], { now, range: '7d' })
  assert.equal(result.trend.length, 7)
  const active = result.trend.find((bucket) => bucket.sessions > 0)
  assert.deepEqual({ sessions: active.sessions, completedQuestions: active.completedQuestions }, { sessions: 2, completedQuestions: 20 })
})

test('HDB06', 'module filter changes trend only and preserves global summary', () => {
  const result = projectHistoryDashboard([sight('s1', 0, 8)], [chord('c1', 0, 12)], { filter: 'sight', now })
  assert.equal(result.summary.totalSessions, 2)
  assert.equal(result.trend.at(-1).sessions, 1)
  assert.equal(result.trend.at(-1).completedQuestions, 8)
})

test('HDB07', 'thirty-day range contains exactly thirty local-day buckets', () => {
  const result = projectHistoryDashboard([], [], { now, range: '30d' })
  assert.equal(result.trend.length, 30)
})

test('HDB08', 'all range starts on the earliest filtered activity day', () => {
  const result = projectHistoryDashboard([sight('s1', 9)], [chord('c1', 3)], { now, range: 'all' })
  assert.equal(result.trend.length, 10)
  assert.equal(result.trend[0].sessions, 1)
})

test('HDB09', 'current streak counts today and prior consecutive local days', () => {
  const result = projectHistoryDashboard([sight('s1', 0), sight('s2', 1)], [chord('c1', 2)], { now })
  assert.equal(result.summary.currentStreakDays, 3)
})

test('HDB10', 'streak remains current when latest activity was yesterday', () => {
  const result = projectHistoryDashboard([sight('s1', 1), sight('s2', 2)], [], { now })
  assert.equal(result.summary.currentStreakDays, 2)
})

test('HDB11', 'a missing local day breaks the streak', () => {
  const result = projectHistoryDashboard([sight('s1', 0), sight('s2', 2)], [], { now })
  assert.equal(result.summary.currentStreakDays, 1)
})

test('HDB12', 'dashboard projection exposes activity facts and no mixed accuracy', () => {
  const result = projectHistoryDashboard([sight('s1', 0)], [chord('c1', 0)], { now })
  assert.equal(Object.hasOwn(result.summary, 'accuracy'), false)
  assert.equal(Object.hasOwn(result.summary, 'completionRate'), false)
})

let passed = 0
for (const [id, title, check] of tests) {
  try {
    check()
    passed += 1
    process.stdout.write(`PASS ${id} ${title}\n`)
  } catch (error) {
    process.stderr.write(`FAIL ${id} ${title}\n${error.stack || error}\n`)
  }
}

process.stdout.write(`\n${passed}/${tests.length} Android History Dashboard checks PASS\n`)
if (passed !== tests.length) process.exitCode = 1
