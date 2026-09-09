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
const projectionSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/chordPractice/reportDetailProjection.ts'), 'utf8')
const reportSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/chordPractice/report.ts'), 'utf8')
const policySource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/practiceKeepAwake.ts'), 'utf8')
const detailSource = mainSource.slice(mainSource.indexOf('function ChordReportDetailScreen'), mainSource.indexOf('function SettingRow'))
const historyRecordSource = mainSource.slice(mainSource.indexOf('function HistoryRecord'), mainSource.indexOf('function HistoryScreen'))
const {
  formatChordReportDuration,
  projectChordReportDetail,
  resolveChordReportById
} = require('../prototype/android-tablet-v1/src/chordPractice/reportDetailProjection.ts')
const {
  CHORD_REPORT_SCHEMA_VERSION,
  isChordPracticeReportV1
} = require('../prototype/android-tablet-v1/src/chordPractice/report.ts')
const {
  CHORD_REPORT_STORAGE_KEYS,
  ChordReportRepository
} = require('../prototype/android-tablet-v1/src/chordPractice/persistence.ts')

class FakePreferencesBackend {
  constructor(values = new Map()) { this.values = values; this.operations = [] }
  async get({ key }) { this.operations.push(['get', key]); return { value: this.values.get(key) ?? null } }
  async set({ key, value }) { this.operations.push(['set', key]); this.values.set(key, value) }
}

function report(options = {}) {
  const completedQuestions = options.completedQuestions ?? 20
  const plannedQuestionCount = options.plannedQuestionCount === undefined ? 20 : options.plannedQuestionCount
  const metric = (medianMs) => ({ sampleCount: completedQuestions, medianMs })
  return {
    schemaVersion: 1,
    recordId: options.recordId ?? 'chord-report-1',
    module: 'chord',
    startedAtEpochMs: options.startedAtEpochMs ?? new Date(2026, 8, 8, 10, 0).getTime(),
    endedAtEpochMs: options.endedAtEpochMs ?? new Date(2026, 8, 8, 10, 10).getTime(),
    completionReason: options.completionReason ?? 'completed',
    practiceMode: options.practiceMode ?? 'sequential',
    sequentialKey: options.practiceMode === 'comprehensive' ? null : (options.sequentialKey ?? 'Eb'),
    plannedQuestionCount,
    completedQuestions,
    firstPassCompleteQuestions: options.firstPassCompleteQuestions ?? 17,
    arpeggioErrors: options.arpeggioErrors ?? 1,
    blockErrors: options.blockErrors ?? 2,
    totalErrors: options.totalErrors ?? 3,
    longestFirstPassStreak: options.longestFirstPassStreak ?? 8,
    practiceDurationMs: options.practiceDurationMs ?? 522_000,
    timingSummary: {
      questionStartLatencyMs: metric(options.questionStartLatencyMs ?? 842),
      arpeggioDurationMs: metric(options.arpeggioDurationMs ?? 1260),
      switchToBlockLatencyMs: metric(options.switchToBlockLatencyMs ?? 410),
      blockLandingSpreadMs: metric(options.blockLandingSpreadMs ?? 36)
    }
  }
}

const tests = []
const test = (name, callback) => tests.push({ name, callback })

test('CRD01 finite completed 20/20 projects factual completion', () => {
  const view = projectChordReportDetail(report(), new Date(2026, 8, 8, 12).getTime())
  assert.deepEqual([view.statusLabel, view.completionValue], ['已完成', '20 / 20'])
})

test('CRD02 finite stopped 7/20 projects neutral partial completion', () => {
  const view = projectChordReportDetail(report({ completionReason: 'stopped', completedQuestions: 7, firstPassCompleteQuestions: 5 }), Date.now())
  assert.deepEqual([view.statusLabel, view.completionValue], ['中途结束', '7 / 20'])
})

test('CRD03 endless stopped completion has no denominator', () => {
  const view = projectChordReportDetail(report({ completionReason: 'stopped', plannedQuestionCount: null, completedQuestions: 42, firstPassCompleteQuestions: 35 }), Date.now())
  assert.deepEqual([view.statusLabel, view.completionValue], ['手动结束', '42'])
  assert.doesNotMatch(view.completionValue, /∞|\/|--/)
})

test('CRD04 Sequential uses the persisted E-flat key', () => {
  assert.equal(projectChordReportDetail(report({ sequentialKey: 'Eb' }), Date.now()).modeIdentity, '循序练习 · E♭ 大调')
})

test('CRD05 Comprehensive has no key row or fake key identity', () => {
  const view = projectChordReportDetail(report({ practiceMode: 'comprehensive' }), Date.now())
  assert.equal(view.modeIdentity, '综合随机')
  assert.equal(view.sessionRows.some((row) => row.label === '调性'), false)
})

test('CRD06 17 of 20 first-pass completion is 85 percent', () => {
  const view = projectChordReportDetail(report({ firstPassCompleteQuestions: 17 }), Date.now())
  assert.deepEqual([view.completionRate, view.completionRateValue], [85, '85%'])
})

test('CRD07 metric label is completion rate and never accuracy', () => {
  const labels = projectChordReportDetail(report(), Date.now()).overviewMetrics.map((item) => item.label)
  assert.ok(labels.includes('完成率'))
  assert.equal(labels.some((label) => /正确率|准确率|总体正确率/.test(label)), false)
})

test('CRD08 first-pass count is displayed as its persisted fact', () => {
  const metric = projectChordReportDetail(report({ firstPassCompleteQuestions: 13 }), Date.now()).overviewMetrics.find((item) => item.label === '首次通过')
  assert.equal(metric.value, '13')
})

test('CRD09 error breakdown preserves Arpeggio Block and total facts', () => {
  assert.deepEqual(projectChordReportDetail(report(), Date.now()).errorRows, [
    { label: '分解错误', value: '1' },
    { label: '柱式错误', value: '2' },
    { label: '总错误', value: '3' }
  ])
})

test('CRD10 detail does not recompute or replace validated totalErrors', () => {
  assert.doesNotMatch(projectionSource, /arpeggioErrors\s*\+\s*report\.blockErrors|blockErrors\s*\+\s*report\.arpeggioErrors/)
  assert.match(projectionSource, /value: String\(report\.totalErrors\)/)
})

test('CRD11 longest first-pass streak is displayed factually', () => {
  const metric = projectChordReportDetail(report({ longestFirstPassStreak: 6 }), Date.now()).overviewMetrics.find((item) => item.label === '最长连对')
  assert.equal(metric.value, '6')
})

test('CRD12 duration below one hour uses MM:SS', () => assert.equal(formatChordReportDuration(522_000), '08:42'))
test('CRD13 duration at least one hour uses H:MM:SS', () => assert.equal(formatChordReportDuration(3_858_000), '1:04:18'))
test('CRD14 question-start median is displayed in seconds with two decimals', () => {
  assert.equal(projectChordReportDetail(report(), Date.now()).timingRows[0].value, '0.84 秒')
  assert.equal(projectChordReportDetail(report({ questionStartLatencyMs: 80 }), Date.now()).timingRows[0].value, '0.08 秒')
})
test('CRD15 Arpeggio-duration median is displayed in seconds with two decimals', () => {
  assert.equal(projectChordReportDetail(report(), Date.now()).timingRows[1].value, '1.26 秒')
  assert.equal(projectChordReportDetail(report({ arpeggioDurationMs: 2500 }), Date.now()).timingRows[1].value, '2.50 秒')
})
test('CRD16 switch-to-Block median is displayed in seconds with two decimals', () => assert.equal(projectChordReportDetail(report(), Date.now()).timingRows[2].value, '0.41 秒'))
test('CRD17 Block landing spread median is displayed', () => assert.equal(projectChordReportDetail(report(), Date.now()).timingRows[3].value, '36 ms'))

test('CRD18 timing UI explicitly identifies median aggregation', () => {
  assert.match(detailSource, /<span className="eyebrow">中位数<\/span>/)
})

test('CRD19 timing sample counts survive projection', () => {
  const rows = projectChordReportDetail(report(), Date.now()).timingRows
  assert.deepEqual(rows.map((row) => [row.sampleCount, row.sampleLabel]), Array(4).fill(null).map(() => [20, '20 个样本']))
})

test('CRD20 measured landing spread never substitutes the 150ms capture window', () => {
  const row = projectChordReportDetail(report({ blockLandingSpreadMs: 36 }), Date.now()).timingRows[3]
  assert.deepEqual([row.value, row.medianMs], ['36 ms', 36])
  assert.doesNotMatch(projectionSource, /captureWindow|150/)
})

test('CRD21 selected report resolves only by exact durable recordId', () => {
  const records = [report({ recordId: 'chord-report-1' }), report({ recordId: 'chord-report-2' })]
  assert.equal(resolveChordReportById(records, 'chord-report-2').recordId, 'chord-report-2')
  assert.equal(resolveChordReportById(records, 'chord-report-9'), null)
})

test('CRD22 All filter is retained across open and Back navigation', () => {
  assert.match(mainSource, /openChordReportDetail[\s\S]*setHistoryFilter\(filter\)/)
  assert.match(mainSource, /filter=\{historyFilter\}/)
})

test('CRD23 Chord filter is retained by the same app-owned filter contract', () => {
  assert.match(mainSource, /type HistoryFilter = 'all' \| 'sight' \| 'chord'/)
  assert.match(mainSource, /onOpenChordReport\(recordId, filter\)/)
})

test('CRD24 Sight History card remains a non-interactive article', () => {
  const sightBranch = historyRecordSource.slice(historyRecordSource.lastIndexOf('  return ('))
  assert.match(sightBranch, /<article/)
  assert.doesNotMatch(sightBranch, /onClick|<button/)
})

test('CRD25 Chord History card is a real accessible button', () => {
  assert.match(historyRecordSource, /item\.module === 'chord'[\s\S]*?<button/)
  assert.match(historyRecordSource, /aria-label=\{`打开\$\{item\.modeSummary\}练习报告`\}/)
  assert.match(historyRecordSource, /type="button"/)
})

test('CRD26 missing selected report renders a safe unavailable state', () => {
  assert.match(detailSource, /记录不可用/)
  assert.match(detailSource, /这条练习记录无法读取。/)
  assert.match(detailSource, /返回记录/)
  assert.doesNotMatch(detailSource, /repository|recordId|Preferences|schema/)
})

test('CRD27 opening and projecting a report performs zero persistence writes', async () => {
  const durable = report()
  const backend = new FakePreferencesBackend(new Map([
    [CHORD_REPORT_STORAGE_KEYS.reportIndex, JSON.stringify({ schemaVersion: 1, nextSequence: 2, recordIds: [durable.recordId] })],
    [`${CHORD_REPORT_STORAGE_KEYS.reportPrefix}${durable.recordId}`, JSON.stringify(durable)]
  ]))
  const repository = new ChordReportRepository(backend)
  await repository.initialize()
  projectChordReportDetail(resolveChordReportById(repository.list(), durable.recordId), Date.now())
  assert.deepEqual(backend.operations.filter(([operation]) => operation === 'set'), [])
})

test('CRD28 detail projection causes zero History mutation', () => {
  const records = Object.freeze([report()])
  const before = JSON.stringify(records)
  projectChordReportDetail(records[0], Date.now())
  assert.equal(JSON.stringify(records), before)
})

test('CRD29 detail creates no MIDI subscription', () => {
  assert.doesNotMatch(detailSource + projectionSource, /midiRouter|subscribe\(|handleMidi|NOTE_ON/)
  assert.equal((mainSource.match(/midiRouter\.subscribe\(/g) ?? []).length, 1)
})

test('CRD30 detail never acquires practice keep-awake', () => {
  assert.doesNotMatch(detailSource + projectionSource, /PracticeKeepAwake|setEnabled\(/)
  assert.doesNotMatch(policySource, /chord-report-detail/)
})

test('CRD31 valid old persisted record remains viewable after repository reload', async () => {
  const durable = report({ recordId: 'chord-report-7', sequentialKey: 'Cb' })
  assert.equal(isChordPracticeReportV1(durable), true)
  const backend = new FakePreferencesBackend(new Map([
    [CHORD_REPORT_STORAGE_KEYS.reportIndex, JSON.stringify({ schemaVersion: CHORD_REPORT_SCHEMA_VERSION, nextSequence: 8, recordIds: [durable.recordId] })],
    [`${CHORD_REPORT_STORAGE_KEYS.reportPrefix}${durable.recordId}`, JSON.stringify(durable)]
  ]))
  const reloaded = new ChordReportRepository(backend)
  const result = await reloaded.initialize()
  assert.equal(result.success, true)
  assert.equal(projectChordReportDetail(resolveChordReportById(reloaded.list(), durable.recordId), Date.now()).modeIdentity, '循序练习 · C♭ 大调')
})

test('CRD32 current settings cannot alter an old persisted report identity', () => {
  const durable = report({ sequentialKey: 'Eb' })
  const currentSettings = { sequentialKey: 'C' }
  const before = projectChordReportDetail(durable, Date.now()).modeIdentity
  currentSettings.sequentialKey = 'Gb'
  const after = projectChordReportDetail(durable, Date.now()).modeIdentity
  assert.deepEqual([before, after], ['循序练习 · E♭ 大调', '循序练习 · E♭ 大调'])
  assert.doesNotMatch(projectionSource, /ChordSettings|currentSettings/)
  assert.match(reportSource, /export const CHORD_REPORT_SCHEMA_VERSION = 1 as const/)
})

async function run() {
  let passed = 0
  for (const item of tests) {
    try {
      await item.callback()
      passed += 1
      console.log(`PASS ${item.name}`)
    } catch (error) {
      console.error(`FAIL ${item.name}\n${error.stack || error}`)
    }
  }
  console.log(`\nAndroid Chord Report Detail: ${passed}/${tests.length} passed`)
  if (passed !== tests.length) process.exitCode = 1
}

void run()
