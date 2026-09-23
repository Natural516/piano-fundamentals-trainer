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

const { projectPracticeHubRecentSummary } = require('../prototype/android-tablet-v1/src/practiceHubProjection.ts')

function sightRecord({ recordId = 'sight-1', endedAt = 20_000, correct = 8, completed = 10 } = {}) {
  const wrong = completed - correct
  return {
    schemaVersion: 1,
    recordId,
    practiceType: 'sightReading',
    completionState: 'completed',
    partialEvidence: false,
    startedAt: endedAt - 5_000,
    endedAt,
    durationMs: 5_000,
    settings: {
      schemaVersion: 1,
      staffMode: 'grand',
      keySignature: 'C',
      notePoolMode: 'diatonic',
      questionCount: 10,
      answerTimeLimitMs: 5_000,
      noteNameVisible: false
    },
    plannedQuestionCount: 10,
    completed,
    correct,
    wrong,
    timeout: 0,
    accuracy: correct / completed * 100,
    averageReactionMs: 500,
    fastestReactionMs: 300,
    slowestReactionMs: 700,
    bestStreak: correct,
    targetNoteErrors: { wrong: [], timeout: [] },
    mostWrongNote: '暂无',
    mostTimedOutNote: '暂无',
    weakestNote: '暂无',
    clefStats: {
      treble: { total: completed, correct, wrong, timeout: 0, accuracy: correct / completed * 100 },
      bass: { total: 0, correct: 0, wrong: 0, timeout: 0, accuracy: 0 }
    }
  }
}

function chordRecord({ recordId = 'chord-report-1', endedAtEpochMs = 30_000, completedQuestions = 20, firstPassCompleteQuestions = 18 } = {}) {
  const metric = { sampleCount: completedQuestions, medianMs: 100 }
  return {
    schemaVersion: 1,
    recordId,
    module: 'chord',
    startedAtEpochMs: endedAtEpochMs - 10_000,
    endedAtEpochMs,
    completionReason: 'completed',
    practiceMode: 'sequential',
    sequentialKey: 'C',
    plannedQuestionCount: 20,
    completedQuestions,
    firstPassCompleteQuestions,
    arpeggioErrors: 1,
    blockErrors: 1,
    totalErrors: 2,
    longestFirstPassStreak: 6,
    practiceDurationMs: 10_000,
    timingSummary: {
      questionStartLatencyMs: metric,
      arpeggioDurationMs: metric,
      switchToBlockLatencyMs: metric,
      blockLandingSpreadMs: metric
    }
  }
}

const tests = [
  ['HUB01', 'no records produces two honest empty summaries', () => {
    assert.deepEqual(projectPracticeHubRecentSummary([], []), { sight: null, chord: null })
  }],
  ['HUB02', 'latest Sight record projects its real accuracy', () => {
    const summary = projectPracticeHubRecentSummary([
      sightRecord({ recordId: 'older-sight', endedAt: 10_000, correct: 5 }),
      sightRecord({ recordId: 'newer-sight', endedAt: 20_000, correct: 8 })
    ], [])
    assert.equal(summary.sight.recordId, 'newer-sight')
    assert.equal(summary.sight.module, 'sight')
    assert.equal(summary.sight.summary, '上次练习 · 80% 正确率')
    assert.equal(summary.chord, null)
  }],
  ['HUB03', 'latest Chord record projects first-pass completion rather than accuracy', () => {
    const summary = projectPracticeHubRecentSummary([], [
      chordRecord({ recordId: 'chord-report-1', endedAtEpochMs: 10_000, firstPassCompleteQuestions: 10 }),
      chordRecord({ recordId: 'chord-report-2', endedAtEpochMs: 30_000, firstPassCompleteQuestions: 18 })
    ])
    assert.equal(summary.chord.recordId, 'chord-report-2')
    assert.equal(summary.chord.module, 'chord')
    assert.equal(summary.chord.summary, '上次练习 · 90% 完成率')
    assert.equal(summary.sight, null)
  }],
  ['HUB04', 'newer record from another module never replaces the module-specific latest result', () => {
    const summary = projectPracticeHubRecentSummary(
      [sightRecord({ recordId: 'sight-only', endedAt: 20_000, correct: 7 })],
      [chordRecord({ recordId: 'chord-report-1', endedAtEpochMs: 99_000, firstPassCompleteQuestions: 16 })]
    )
    assert.equal(summary.sight.recordId, 'sight-only')
    assert.equal(summary.sight.summary, '上次练习 · 70% 正确率')
    assert.equal(summary.chord.recordId, 'chord-report-1')
    assert.equal(summary.chord.summary, '上次练习 · 80% 完成率')
  }]
]

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

process.stdout.write(`\n${passed}/${tests.length} Android Practice Hub summary checks PASS\n`)
if (passed !== tests.length) process.exitCode = 1
