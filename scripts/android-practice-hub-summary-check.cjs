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
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const main = fs.readFileSync(path.join(__dirname, '../prototype/android-tablet-v1/src/main.tsx'), 'utf8')
const hub = main.slice(main.indexOf('function PracticeHubScreen'), main.indexOf('type IntervalPracticeSettingChanges'))
const css = fs.readFileSync(path.join(__dirname, '../prototype/android-tablet-v1/src/styles.css'), 'utf8')
// Render the actual source component, not a reimplemented test-only card. Dependencies
// are presentation fixtures; controllers/projections and persistent records stay intact.
const hubCode = ts.transpileModule(`${hub}\nexports.Hub = PracticeHubScreen`, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
function renderHub({ themed = true, collage = true, historyStatus = 'ready', ready = true } = {}) {
  const exports = {}
  new Function('require', 'exports', 'useMidiUi', 'useEffect', 'STAFF_MODE_LABELS', 'ProductFrame', 'Icon', 'navigate', hubCode)(
    require, exports,
    () => ({ runtime: { historySnapshot: { status: historyStatus, records: [sightRecord()] }, refreshHistory() {} } }),
    React.useEffect, { grand: '大谱表' },
    ({ children }) => React.createElement('main', null, children),
    ({ name }) => React.createElement('svg', { 'data-icon': name }), () => {}
  )
  return renderToStaticMarkup(React.createElement(exports.Hub, {
    chordHistory: { status: historyStatus, records: [chordRecord()] }, chordPersistence: { refresh() {} },
    intervalSettingsReady: ready, settings: { noteMode: 'single', staffMode: 'grand', questionCount: 20 },
    theme: { capabilities: {
      practiceVisual: themed ? { kind: 'hero-cards', assets: { hero: 'hero.png', sight: 'sight.png', chord: 'chord.png' } } : { kind: 'standard' },
      intervalPracticeVisual: collage ? { kind: 'blue-notebook', assets: { hubCardCollage: 'hub-collage.png' } } : undefined
    } }
  }))
}
const renderedCards = (markup) => [...markup.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(m => m[0])

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
  }],
  ['HUB05', 'actual themed card DOM has only icon, category, title, primary copy, art and full CTA', () => {
    const cards = renderedCards(renderHub())
    assert.equal(cards.length, 3)
    for (const card of cards) {
      assert.doesNotMatch(card, /module-card__recent|annotation|status-pill|暂无练习记录|上次练习|正在读取记录|MIDI 自动判题/)
      assert.match(card, /module-card__icon/)
      assert.match(card, /<span class="module-card__copy"><small>[^<]+<\/small><strong>[^<]+<\/strong><em>[^<]+<\/em><\/span>/)
      assert.equal((card.match(/<img /g) ?? []).length, 1)
      assert.match(card, /class="(?:themed-practice-card|interval-notebook-card)__action"><svg data-icon="play"><\/svg>开始练习<\/span>/)
      assert.doesNotMatch(card, /<span[^>]*><\/span>/)
    }
  }],
  ['HUB06', 'loading and absent optional theme visuals do not restore status wrappers or old interval modes', () => {
    for (const themed of [false, true]) for (const collage of [false, true]) for (const historyStatus of ['loading', 'ready']) {
      const cards = renderedCards(renderHub({ themed, collage, historyStatus }))
      assert.equal(cards.length, 3)
      assert.ok(cards.every(c => !/module-card__recent|暂无练习记录|上次练习|正在读取记录|MIDI 自动判题/.test(c)))
      assert.match(cards[2], /指定低音构造 · 26 种音程/)
      assert.doesNotMatch(cards[2], /复现 \/ 构造/)
      assert.equal(cards.filter(c => /__action/.test(c)).length, (themed ? 2 : 0) + (collage ? 1 : 0))
    }
  }],
  ['HUB07', 'shared copy structure naturally reflows and existing equal-row/full-height CTA contracts remain', () => {
    assert.doesNotMatch(css, /module-card__recent/)
    for (const selector of ['.themed-practice-card', '.interval-notebook-card']) {
      const rules = css.slice(css.indexOf(`${selector} {`), css.indexOf('}', css.indexOf(`${selector} {`)))
      assert.match(rules, /grid-template-rows: minmax\(0, 1fr\) 44px/)
      assert.match(rules, /gap: 11px 14px/)
    }
    const grid = css.slice(css.indexOf('.themed-practice-module-grid {'), css.indexOf('}', css.indexOf('.themed-practice-module-grid {')))
    assert.match(grid, /min-height: 0/)
    assert.match(grid, /gap: 14px/)
    assert.match(css, /\.practice-module-grid\.has-interval \{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/)
    assert.match(css, /\.themed-practice-card__action \{[\s\S]*?height: 44px/)
    assert.match(css, /\.interval-notebook-card__action \{[\s\S]*?height: 44px/)
    for (const selector of ['.themed-practice-card .module-card__icon', '.interval-notebook-card .module-card__icon']) {
      const rules = css.slice(css.indexOf(`${selector} {`), css.indexOf('}', css.indexOf(`${selector} {`)))
      assert.match(rules, /align-self: center/)
    }
  }],
  ['HUB08', 'presentation removal retains refresh, disabled readiness and exact navigation destinations', () => {
    assert.match(hub, /void runtime\.refreshHistory\(\)/)
    assert.match(hub, /void chordPersistence\.refresh\(\)/)
    for (const destination of ['sight-ready', 'chord-mode-select', 'interval-practice']) assert.ok(hub.includes(`navigate('${destination}')`))
    assert.match(renderedCards(renderHub({ ready: false }))[2], /disabled=""/)
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
