const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server')
const { I18nextProvider } = require('react-i18next')
// Node SSR has no Vite ?url transform. Resolve the real packaged font; no renderer mock.
const Module = require('node:module'), originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === '@vexflow-fonts/bravura/bravura.woff2?url') return require.resolve('@vexflow-fonts/bravura/bravura.woff2')
  return originalLoad.call(this, request, parent, isMain)
}
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
}).outputText, filename)
const domain = require('../src/sightReading/noteAnalysis.ts')
const { spellMidiPitch } = require('../src/sightReading/musicPitchSpelling.ts')
const { createSightReadingNote } = require('../src/sightReading/sightReadingNotes.ts')
const { SightReadingSessionCore } = require('../src/sightReading/sightReadingSession.ts')
const { createSightReadingSessionReport } = require('../src/sightReading/report.ts')
const { ANDROID_SIGHT_READING_DEFAULTS } = require('../src/sightReading/sightReadingSettings.ts')
const persistence = require('../prototype/android-tablet-v1/src/androidPersistenceCore.ts')
const { AndroidSightReadingRuntime } = require('../prototype/android-tablet-v1/src/sightReadingIntegration.ts')
const { createLocalizationInstance } = require('../prototype/android-tablet-v1/src/localization/localizationService.ts')
const ui = require('../prototype/android-tablet-v1/src/SightReadingAnalysis.tsx')
const { sightAnalysisResources } = require('../prototype/android-tablet-v1/src/localization/sightAnalysisResources.ts')
const tests = [], test = (id, run) => tests.push([id, run])
const clone = value => JSON.parse(JSON.stringify(value))
const stat = (midi = 60, times = [1000], errors = 0, key = 'C', clef = 'treble') => {
  const notation = spellMidiPitch(midi, key, clef)
  return { identity: domain.sightNoteIdentity(notation), notation, keySignature: key, occurrences: times.length + errors, errorCount: errors, responseTimesMs: [...times] }
}
const report = (id, stats, changes = {}) => ({ recordId: `r${id}`, endedAt: id, completionState: 'completed', partialEvidence: false, completed: 10, plannedQuestionCount: 10, ...(stats ? { noteStatsVersion: 1, noteStats: stats } : {}), ...changes })
test('SA01 B2 and B4 have distinct written identities', () => assert.notEqual(stat(47).identity, stat(71).identity))
test('SA02 enharmonic F sharp / G flat, same MIDI, remain separate', () => { const a = stat(66, [1], 1, 'G'), b = stat(66, [1], 1, 'Gb'); assert.notEqual(a.identity, b.identity); assert.equal(a.notation.midiNumber, b.notation.midiNumber); assert.equal(domain.analyzeSightHistory([report(1, [a, b])]).noteStats.length, 2) })
test('SA03 V1 identity unchanged; analysis separates clefs and retains real key contexts', () => {
  const a = stat(60, Array(5).fill(1000), 1, 'C', 'treble'), b = stat(60, Array(5).fill(1200), 2, 'F', 'bass')
  assert.equal(a.identity, b.identity); assert.notEqual(domain.sightAnalysisIdentity(a.notation), domain.sightAnalysisIdentity(b.notation))
  const reports = [report(2, [b]), report(1, [a])], before = JSON.stringify(reports)
  const result = domain.analyzeSightHistory(reports); assert.equal(result.noteStats.length, 2)
  assert.deepEqual(result.slow.map(s => [s.notation.clef, s.medianResponseMs, s.responseTimesMs.length]), [['bass', 1200, 5], ['treble', 1000, 5]])
  assert.deepEqual(result.noteStats.map(s => s.notation), [a.notation, b.notation]); assert.equal(result.noteStats[1].keySignature, 'F')
  assert.equal(JSON.stringify(reports), before); assert.ok(reports.every(r => domain.isSightNoteStats(r.noteStats)))
})
for (const [id, values, expected] of [['SA04 odd', [9, 1, 5], 5], ['SA05 even', [9, 1, 7, 2], 4.5], ['SA06 one', [1820.25], 1820.25], ['SA07 empty', [], null]]) test(id, () => { const original = [...values]; assert.equal(domain.medianMs(values), expected); assert.deepEqual(values, original) })
test('SA08 invalid / negative times rejected', () => { for (const ms of [-1, NaN, Infinity]) assert.throws(() => domain.medianMs([ms])) })
test('SA09 all actual notes recorded, wrong/timeout excluded from correct samples', () => {
  const stats = [], note = spellMidiPitch(71, 'C', 'treble')
  domain.recordSightNoteOutcome(stats, [note], 'C', 'correct', 1820)
  domain.recordSightNoteOutcome(stats, [note], 'C', 'wrong_note', 9999)
  domain.recordSightNoteOutcome(stats, [note], 'C', 'timeout', null)
  assert.equal(stats[0].occurrences, 3); assert.equal(stats[0].errorCount, 2); assert.deepEqual(stats[0].responseTimesMs, [1820]); assert.ok(domain.isSightNoteStats(stats))
})
test('SA10 canonical deterministic tie order independent of insertion and MIDI', () => { const notes = [stat(71, [2], 1), stat(60, [2], 1), stat(47, [2], 1)]; const a = domain.rankSightNotes(notes, 5); const b = domain.rankSightNotes(notes.reverse(), 5); assert.deepEqual(a, b); assert.deepEqual(a.errors.map(n => n.notation.spelling), ['B2', 'C4', 'B4']) })
test('SA11 session Top5 keeps complete underlying stats and requires only one correct sample', () => { const stats = Array.from({ length: 12 }, (_, i) => stat(60 + i, [i + 1], i + 1)); const before = JSON.stringify(stats), result = domain.rankSightNotes(stats, 5); assert.equal(result.errors.length, 5); assert.equal(result.slow.length, 5); assert.equal(stats.length, 12); assert.equal(result.errors[0].errorCount, 12); assert.equal(result.slow[0].medianResponseMs, 12); assert.equal(JSON.stringify(stats), before) })
for (const count of [0, 1, 9, 10, 11, 25]) test(`SA12/${count} exact recent completed window`, () => { const result = domain.analyzeSightHistory(Array.from({ length: count }, (_, i) => report(i, [stat()]))); assert.equal(result.windowCount, Math.min(count, 10)); assert.deepEqual(result.windowIds, Array.from({ length: Math.min(count, 10) }, (_, i) => `r${count - i - 1}`)) })
test('SA13 stopped / partial / incomplete cannot enter window', () => { const result = domain.analyzeSightHistory([report(1, [stat()]), report(2, [stat()], { completionState: 'stopped' }), report(3, [stat()], { partialEvidence: true }), report(4, [stat()], { completed: 9 })]); assert.deepEqual(result.windowIds, ['r1']) })
test('SA14 fixed recent10 first, only3 analyzable, no older backfill', () => { const reports = Array.from({ length: 14 }, (_, i) => report(i, i < 4 || i > 10 ? [stat()] : null)); const result = domain.analyzeSightHistory(reports); assert.equal(result.windowCount, 10); assert.equal(result.analyzableCount, 3); assert.equal(result.noteStats[0].occurrences, 3); assert.ok(!result.windowIds.includes('r3')) })
test('SA15 old-only reports return no invented detail or baseline', () => { const result = domain.analyzeSightHistory([report(1)]); assert.equal(result.analyzableCount, 0); assert.equal(result.globalMedian, null); assert.deepEqual(result.errors, []); assert.deepEqual(result.slow, []) })
test('SA16 occurrence4 excluded /5 included, errors0 excluded', () => { const result = domain.analyzeSightHistory([report(1, [stat(60, [1, 1, 1], 1), stat(62, [1, 1, 1, 1], 1), stat(64, [1, 1, 1, 1, 1])])]); assert.deepEqual(result.errors.map(n => n.notation.spelling), ['D4']) })
test('SA17 errors accumulate across complete reports', () => { const result = domain.analyzeSightHistory([report(2, [stat(60, [1, 2], 2)]), report(1, [stat(60, [3], 1)])]); assert.equal(result.errors[0].occurrences, 6); assert.equal(result.errors[0].errorCount, 3) })
test('SA18 long-term Top10 deterministic, same note may occupy both lists', () => { const stats = Array.from({ length: 13 }, (_, i) => stat(60 + i, [2000, 2000, 2000, 2000, 2000], i + 1)); stats.push(stat(36, Array(100).fill(100))); const result = domain.analyzeSightHistory([report(1, stats)]); assert.equal(result.errors.length, 10); assert.equal(result.slow.length, 10); assert.ok(result.errors.some(a => result.slow.some(b => a.identity === b.identity))) })
test('SA19 slow sample4 excluded /5 included without outlier gate', () => { const result = domain.analyzeSightHistory([report(1, [stat(60, [2000, 2000, 2000, 2000]), stat(62, Array(5).fill(2000)), stat(64, Array(20).fill(1000))])]); assert.deepEqual(result.slow.map(n => n.notation.spelling), ['D4', 'E4']); assert.deepEqual(result.slow.map(n => n.responseTimesMs.length), [5, 20]) })
test('SA20 raw merged median is NOT median of medians', () => { const result = domain.analyzeSightHistory([report(1, [stat(60, [100, 100, 100, 100, 100])]), report(2, [stat(60, [2000])])]); assert.equal(result.noteStats[0].responseTimesMs.length, 6); assert.equal(domain.medianMs(result.noteStats[0].responseTimesMs), 100); assert.equal(result.globalMedian, 100) })
for (const [id, baseline, median] of [['SA21 20 percent slower ranks', 1000, 1200], ['SA22 small absolute difference ranks', 2000, 2300], ['SA23 former threshold still ranks', 1000, 1300], ['SA24 sub300ms ranks', 100, 399.99], ['SA25 equal medians rank', 100, 100]]) test(id, () => {
  const result = domain.analyzeSightHistory([report(1, [stat(60, Array(5).fill(median)), stat(62, Array(20).fill(baseline))])])
  assert.equal(result.globalMedian, baseline); assert.equal(result.slow.length, 2)
  assert.equal(result.slow[0].identity, stat(60).identity); assert.equal(result.slow[0].medianResponseMs, median)
})
test('SA26 pure aggregation leaves all report bytes unchanged across repeated calls', () => { const reports = [report(2, [stat(60, [100, 200])]), report(1, [stat(60, [300])])]; const before = JSON.stringify(reports); assert.deepEqual(domain.analyzeSightHistory(reports), domain.analyzeSightHistory(reports)); assert.equal(JSON.stringify(reports), before) })
test('SA27 validation rejects duplicate identities, fake spelling/render fields, wrong sample counts', () => {
  assert.equal(domain.isSightNoteStats([stat(), stat()]), false)
  for (const [field, value] of [['vexFlowKey', 'b/4'], ['octave', 7], ['spelling', 'FAKE'], ['displayAccidental', '#'], ['clef', 'alien']]) { const s = stat(); s.notation[field] = value; assert.equal(domain.isSightNoteStats([s]), false, field) }
  const s = stat(); s.occurrences++; assert.equal(domain.isSightNoteStats([s]), false)
})
test('SA28 capture actual single-question core settles only once and clones immutable report', () => {
  const note = createSightReadingNote('treble', 66, 'G'), core = new SightReadingSessionCore([note], 'single', 'G')
  core.start(0, null); core.beginQuestion(note); core.unlockQuestion(32, null, 5000)
  core.processMidiEvent({ id: 1, timestamp: 2032, type: 'noteOn', midiNumber: 66, velocity: 100 })
  core.processMidiEvent({ id: 2, timestamp: 2033, type: 'noteOn', midiNumber: 66, velocity: 100 })
  const settings = { ...ANDROID_SIGHT_READING_DEFAULTS, staffMode: 'treble', keySignature: 'G', questionCount: 10 }
  const r = createSightReadingSessionReport(settings, core.counters, [note], 'stopped')
  assert.equal(r.noteStats[0].occurrences, 1); assert.deepEqual(r.noteStats[0].notation, note.notation); assert.deepEqual(r.noteStats[0].responseTimesMs, [2000]); core.counters.noteStats[0].responseTimesMs.push(3); assert.deepEqual(r.noteStats[0].responseTimesMs, [2000])
})
test('SA29 double correct remains whole-question correct with zero per-note attribution', () => {
  const notes = [createSightReadingNote('grand', 60, 'C'), createSightReadingNote('grand', 64, 'C')], core = new SightReadingSessionCore(notes, 'double', 'C')
  core.start(0, null); core.beginQuestion(notes); core.unlockQuestion(32, null, 5000)
  core.processMidiEvent({ id: 1, timestamp: 1032, type: 'noteOn', midiNumber: 60, velocity: 100 }); core.processMidiEvent({ id: 2, timestamp: 1082, type: 'noteOn', midiNumber: 64, velocity: 100 }); core.settleDoubleCapture()
  assert.deepEqual(core.counters.noteStats, []); assert.equal(core.counters.completed, 1); assert.equal(core.counters.correct, 1); assert.deepEqual(core.counters.reactionTimes, [1050])
  const settings = { ...ANDROID_SIGHT_READING_DEFAULTS, noteMode: 'double', noteCount: 2 }
  const r = createSightReadingSessionReport(settings, core.counters, notes, 'stopped')
  const durable = persistence.createDurableSightReadingReport(r, { recordId: 'double', startedAt: 0, endedAt: 2000, settings })
  assert.ok(persistence.isDurableSightReadingReport(durable)); assert.deepEqual(durable.noteStats, [])
  const falseAttribution = clone(durable); falseAttribution.noteStats = [stat(60, [1050]), stat(64, [1050])]
  assert.equal(persistence.isDurableSightReadingReport(falseAttribution), false)
})
for (const outcome of ['wrong', 'timeout']) test(`SA29/${outcome} double outcomes retain aggregates but zero note errors/samples`, () => {
  const notes = [createSightReadingNote('grand', 60, 'C'), createSightReadingNote('grand', 64, 'C')], core = new SightReadingSessionCore(notes, 'double', 'C')
  core.start(0, null); core.beginQuestion(notes); core.unlockQuestion(32, null, 5000)
  if (outcome === 'timeout') core.recordTimeout()
  else { core.processMidiEvent({ id: 1, timestamp: 1032, type: 'noteOn', midiNumber: 60, velocity: 100 }); core.processMidiEvent({ id: 2, timestamp: 1082, type: 'noteOn', midiNumber: 65, velocity: 100 }); core.settleDoubleCapture() }
  assert.deepEqual(core.counters.noteStats, []); assert.equal(core.counters.completed, 1); assert.equal(core.counters[outcome], 1)
  assert.deepEqual(domain.rankSightNotes(core.counters.noteStats, 5), { errors: [], slow: [] })
  const stats = []; domain.recordSightNoteOutcome(stats, notes.map(n => n.notation), 'C', outcome === 'wrong' ? 'wrong_note' : 'timeout', null); assert.deepEqual(stats, [])
})
class Backend {
  values = new Map(); writes = []; failKey = null
  async get({ key }) { return { value: this.values.get(key) ?? null } }
  async set({ key, value }) { if (this.failKey === key) { this.failKey = null; throw Error('injected') } this.writes.push([key, value]); this.values.set(key, value) }
  async keys() { return { keys: [...this.values.keys()] } }
}
class Timers {
  now = 0; id = 0; jobs = new Map()
  schedule = (callback, delay) => { const id = ++this.id; this.jobs.set(id, { callback, at: this.now + delay }); return id }
  cancel = id => this.jobs.delete(id)
  advance(ms) { const end = this.now + ms; for (;;) { const next = [...this.jobs].sort((a, b) => a[1].at - b[1].at).find(([, v]) => v.at <= end); if (!next) break; this.now = next[1].at; this.jobs.delete(next[0]); next[1].callback() } this.now = end }
}
async function runtimeFixture(settings = {}, recordId = 'actual-session') {
  const backend = new Backend(), store = new persistence.AndroidPersistenceStore(backend), repository = new persistence.SightReadingReportRepository(store)
  assert.equal((await store.ensureSchema()).success, true); await repository.initialize(); const timers = new Timers()
  const runtime = new AndroidSightReadingRuntime({ clock: { now: () => timers.now }, scheduler: timers, random: () => .5, wallClock: { now: () => 1000 + timers.now }, idGenerator: () => recordId, initialSettings: { ...ANDROID_SIGHT_READING_DEFAULTS, questionCount: 10, ...settings }, reportRepository: repository })
  return { backend, repository, timers, runtime }
}
async function reload(backend) {
  const store = new persistence.AndroidPersistenceStore(backend)
  assert.equal((await store.ensureSchema()).success, true)
  const repository = new persistence.SightReadingReportRepository(store)
  assert.equal((await repository.initialize()).success, true)
  return repository
}
test('SA30 actual runtime normal completion durable noteStats exactly once + reload', async () => {
  const { backend, repository, timers, runtime } = await runtimeFixture(); runtime.start()
  for (let i = 0; i < 10; i++) { timers.advance(32); timers.advance(100); i === 1 ? runtime.sendWrong() : runtime.sendCorrect(); timers.advance(350) }
  await runtime.flushPersistence(); const r = repository.list()[0]; assert.ok(persistence.isDurableSightReadingReport(r)); assert.equal(r.completed, 10); assert.equal(r.noteStats.reduce((sum, s) => sum + s.occurrences, 0), 10); assert.equal(r.noteStats.reduce((sum, s) => sum + s.responseTimesMs.length, 0), 9); assert.equal(r.noteStats.reduce((sum, s) => sum + s.errorCount, 0), 1)
  runtime.stop(); await runtime.flushPersistence(); assert.equal(repository.list().length, 1); assert.equal(backend.writes.filter(([k]) => k === 'piano.v1.sightReading.report.actual-session').length, 1)
  const reloaded = await reload(backend); assert.deepEqual(reloaded.list()[0], r)
  const writes = backend.writes.length; domain.analyzeSightHistory(reloaded.list()); assert.equal(backend.writes.length, writes)
})
test('SA31 discard zero-write / early-save keeps details but excluded from long-term', async () => {
  for (const save of [false, true]) { const { backend, repository, timers, runtime } = await runtimeFixture(); const before = backend.writes.length; runtime.start(); timers.advance(132); runtime.sendCorrect(); runtime.stop(save); await runtime.flushPersistence(); assert.equal(repository.list().length, save ? 1 : 0); if (!save) assert.equal(backend.writes.length, before); else { assert.equal(repository.list()[0].noteStats[0].responseTimesMs.length, 1); assert.equal(domain.analyzeSightHistory(repository.list()).windowCount, 0) } }
})
test('SA32 legacy V1 remains readable, bytes not rewritten or populated', async () => {
  const { repository, backend, timers, runtime } = await runtimeFixture(); runtime.start(); timers.advance(132); runtime.sendCorrect(); runtime.stop(true); await runtime.flushPersistence()
  const legacy = clone(repository.list()[0]); delete legacy.noteStats; delete legacy.noteStatsVersion; delete legacy.settings.noteMode; legacy.recordId = 'legacy'
  assert.ok(persistence.isDurableSightReadingReport(legacy)); const key = 'piano.v1.sightReading.report.legacy', raw = JSON.stringify(legacy); backend.values.set(key, raw)
  const reloaded = await reload(backend); assert.equal(backend.values.get(key), raw); const restored = ui.sightSessionFromHistory(reloaded.list().find(r => r.recordId === 'legacy')); assert.equal(restored.noteStats, undefined); assert.equal(restored.correct, legacy.correct); assert.equal(restored.averageReactionMs, legacy.averageReactionMs)
})
test('SA33 V1 optional extension fails closed on inconsistent or partial facts', async () => {
  const { repository, timers, runtime } = await runtimeFixture(); runtime.start(); timers.advance(132); runtime.sendCorrect(); runtime.stop(true); await runtime.flushPersistence(); const r = repository.list()[0]
  for (const mutate of [r => { r.noteStats[0].occurrences++ }, r => { r.noteStatsVersion = 2 }, r => { delete r.noteStatsVersion }, r => { r.noteStats[0].keySignature = 'G' }, r => { r.noteStats[0].responseTimesMs[0] = -1 }]) { const bad = clone(r); mutate(bad); assert.equal(persistence.isDurableSightReadingReport(bad), false) }
})
test('SA34 body-first readback index-last survives interrupted index and restores detail', async () => {
  const { repository, backend, timers, runtime } = await runtimeFixture(); runtime.start(); timers.advance(132); runtime.sendCorrect(); backend.failKey = persistence.ANDROID_PERSISTENCE_KEYS.sightReadingReportIndex; runtime.stop(true); await runtime.flushPersistence(); assert.equal(runtime.persistenceSnapshot.reportStatus, 'error'); const fresh = await reload(backend); assert.equal(fresh.list().length, 1); assert.ok(fresh.list()[0].noteStats.length); await runtime.retryReportPersistence(); assert.equal(repository.list().length, 1)
})
for (const locale of ['zh-CN', 'en']) test(`SA35/${locale} real React Analysis and report render with explicit resources`, () => {
  const instance = createLocalizationInstance(locale); instance.options.fallbackLng = false
  const html = renderToStaticMarkup(React.createElement(I18nextProvider, { i18n: instance }, React.createElement(ui.SightHistoryAnalysis, { records: [report(1, [stat(66, Array(5).fill(2000), 1, 'G'), stat(60, Array(30).fill(1000))])], status: 'ready', warning: null })))
  assert.ok(html.includes(locale === 'en' ? 'Based on the latest' : '基于最近')); assert.ok(!html.includes('<h1')); assert.ok(html.includes('F♯4')); assert.ok(html.includes('music-staff-renderer is-treble is-analysis-dense')); assert.ok(!html.includes('DEBUG')); if (locale === 'en') assert.ok(!/[\u4e00-\u9fff]/.test(html))
  const old = renderToStaticMarkup(React.createElement(I18nextProvider, { i18n: instance }, React.createElement(ui.SightSessionNoteAnalysis, {}))); assert.ok(old.includes(locale === 'en' ? 'not saved' : '未保存'))
})
test('SA49 written-note presentation uses contiguous music accidentals without mutating facts', () => {
  const notes = [spellMidiPitch(47, 'C', 'bass'), spellMidiPitch(37, 'C', 'bass'), spellMidiPitch(66, 'G', 'treble'), spellMidiPitch(66, 'Gb', 'treble')]
  const before = JSON.stringify(notes), identities = notes.map(domain.sightNoteIdentity)
  assert.deepEqual(notes.map(ui.presentSightAnalysisNote), ['B2', 'C♯2', 'F♯4', 'G♭4'])
  for (const note of notes) assert.doesNotMatch(ui.presentSightAnalysisNote(note), /\s|#|b/)
  assert.notEqual(identities[2], identities[3]); assert.equal(notes[2].midiNumber, notes[3].midiNumber)
  assert.equal(JSON.stringify(notes), before); assert.deepEqual(notes.map(domain.sightNoteIdentity), identities)
  // The label uses written accidental, not the accidental glyph suppressed by a key signature.
  assert.equal(notes[2].displayAccidental, null); assert.equal(ui.presentSightAnalysisNote(notes[2]), 'F♯4')
  const { StaveNote } = require('vexflow')
  assert.deepEqual(notes.map(n => new StaveNote({ clef: n.clef, keys: [n.vexFlowKey], duration: 'w' }).getKeyProps()[0].line), [2, -1, 1.5, 2])
})
test('SA50 all four analysis lists render exact labels and retain original stats / renderer facts', () => {
  const stats = [stat(47, Array(5).fill(2000), 1), stat(37, Array(5).fill(2000), 1), stat(66, Array(5).fill(2000), 1, 'G'), stat(66, Array(5).fill(2000), 1, 'Gb'), stat(60, Array(60).fill(100))]
  const before = JSON.stringify(stats)
  for (const locale of ['zh-CN', 'en']) for (const [Component, props] of [[ui.SightHistoryAnalysis, { records: [report(1, stats)], status: 'ready', warning: null }], [ui.SightSessionNoteAnalysis, { stats }]]) {
    const html = renderToStaticMarkup(React.createElement(I18nextProvider, { i18n: createLocalizationInstance(locale) }, React.createElement(Component, props)))
    const cards = html.split('<article ').slice(1); assert.equal(cards.length, 2)
    for (const card of cards) {
      const labels = [...card.matchAll(/<strong class="sight-analysis-note">([^<]+)<\/strong>/g)].map(m => m[1])
      for (const label of ['B2', 'C♯2', 'F♯4', 'G♭4']) assert.ok(labels.includes(label), `${locale}: ${label}`)
      for (const label of labels) assert.doesNotMatch(label, /\s|#|b/)
    }
  }
  assert.equal(JSON.stringify(stats), before)
  const source = fs.readFileSync(path.join(__dirname, '../prototype/android-tablet-v1/src/SightReadingAnalysis.tsx'), 'utf8')
  assert.match(source, /const note = presentSightAnalysisNote\(row.notation\)/); assert.match(source, /notes=\{\[row.notation\]\}/)
  const css = fs.readFileSync(path.join(__dirname, '../prototype/android-tablet-v1/src/styles.css'), 'utf8')
  assert.match(css, /\.sight-analysis-note \{[^}]*white-space: nowrap; letter-spacing: 0; word-spacing: 0;/)
  assert.match(css, /\.sight-analysis-note \{ font-family: Arial, sans-serif;/)
})
test('SA36 no fabricated candidate or statistic in empty/loading/error views', () => { const instance = createLocalizationInstance('en'); for (const status of ['ready', 'loading', 'error']) { const html = renderToStaticMarkup(React.createElement(I18nextProvider, { i18n: instance }, React.createElement(ui.SightHistoryAnalysis, { records: [], status, warning: null }))); assert.ok(!html.includes('<li')); if (status === 'ready') assert.ok(html.includes('No clear error-prone notes yet')) } })
test('SA37 resource semantic / placeholders / plural parity, explicit English no fallback', () => {
  const zh = sightAnalysisResources['zh-CN'], en = sightAnalysisResources.en
  const semantic = k => k.replace(/_(one|other)$/, '')
  assert.deepEqual([...new Set(Object.keys(en).map(semantic))].sort(), Object.keys(zh).sort())
  for (const locale of ['zh-CN', 'en']) { const instance = createLocalizationInstance(locale); instance.options.fallbackLng = false; for (const key of Object.keys(zh)) { const variants = Object.keys(sightAnalysisResources[locale]).filter(k => semantic(k) === key); for (const variant of variants) { const value = sightAnalysisResources[locale][variant]; assert.ok(instance.exists(variant, { ns: 'sightAnalysis', lng: locale, fallbackLng: false })); assert.deepEqual([...zh[key].matchAll(/{{(\w+)}}/g)].map(m => m[1]).sort(), [...value.matchAll(/{{(\w+)}}/g)].map(m => m[1]).sort()) } } }
})
test('SA38 renderer handoff is production facts, never display parsing or reference coordinates', () => {
  const source = fs.readFileSync(path.join(__dirname, '../prototype/android-tablet-v1/src/SightReadingAnalysis.tsx'), 'utf8')
  assert.match(source, /notes=\{\[row.notation\]\}/); assert.match(source, /keySignature=\{row.keySignature\}/); assert.match(source, /staffMode=\{row.notation.clef\}/); assert.doesNotMatch(source, /getStaffPosition|midiNumberToNoteName|spellMidiPitch|\.match\(/)
  const renderer = fs.readFileSync(path.join(__dirname, '../src/shared/musicNotation/MusicStaffRenderer.tsx'), 'utf8'); assert.match(renderer, /drawCompactMusicStaff/); assert.match(renderer, /drawNote\(context, stave, model.notes, clef/); assert.match(renderer, /keys: notes.map\(\(note\) => note.vexFlowKey\)/)
})
test('SA39 localized labels cannot enter durable identity or domain algorithms', () => { const source = fs.readFileSync(path.join(__dirname, '../src/sightReading/noteAnalysis.ts'), 'utf8'); assert.doesNotMatch(source, /i18next|LocaleProvider|document\.|window\.|localStorage|Date\.now|React/) })
test('SA40 UI entry only Sight, no new navigation item, Android Back goes to History', () => {
  const main = fs.readFileSync(path.join(__dirname, '../prototype/android-tablet-v1/src/main.tsx'), 'utf8')
  assert.match(main, /filter === 'sight' \? <button className="sight-analysis-entry"/); assert.match(main, /navigate\('sight-analysis'\)/); assert.match(main, /case 'sight-analysis':/); assert.match(main, /'sight-analysis': 'history'/); assert.match(main, /'sight-report-detail': 'history'/)
  assert.doesNotMatch(main.slice(main.indexOf('const productNavigation'), main.indexOf('const SHOW_DEVELOPMENT_TOOLS')), /sight-analysis/)
})
test('SA41 responsive wide dual columns / narrow stack; theme tokens, no scale-to-fit staff', () => {
  const css = fs.readFileSync(path.join(__dirname, '../prototype/android-tablet-v1/src/styles.css'), 'utf8').split('/* Sight analysis:')[1]
  assert.match(css, /repeat\(2, minmax\(0, 1fr\)\)/); assert.match(css, /@media \(max-width: 1100px\)/); assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/); assert.match(css, /var\(--surface-elevated\)/); assert.doesNotMatch(css, /transform:.*scale|zoom:|font-size:\s*[0-9]px/)
  assert.match(css, /@media \(max-width: 1100px\), \(max-height: 780px\) \{\s*\.product-content:has\(> \.sight-history-analysis\).*overflow-y: auto/)
  assert.doesNotMatch(css.split('@media')[0], /overflow-y:\s*auto/)
  const transparentHitArea = ".sight-analysis-entry::after { content: ''; position: absolute; inset: -9px 0; }"
  assert.ok(css.includes(transparentHitArea)); assert.doesNotMatch(css.replace(transparentHitArea, ''), /position:\s*absolute/)
  assert.match(css, /@media \(max-width: 420px\)/)
})
test('SA51 entry uses scoped lightweight header action, not a CTA/pill, and retains 44px hit area', () => {
  const css = fs.readFileSync(path.join(__dirname, '../prototype/android-tablet-v1/src/styles.css'), 'utf8')
  const rule = css.match(/\.sight-analysis-entry \{([^}]+)\}/)[1]
  for (const declaration of ['display: inline-flex', 'gap: 5px', 'min-height: 0', 'border: 0', 'border-radius: 8px', 'padding: 4px 10px', 'font-size: 12px', 'font-weight: 500', 'line-height: 18px', 'var(--success) 8%, var(--surface)']) assert.ok(rule.includes(declaration), declaration)
  assert.doesNotMatch(rule, /999|#[0-9a-f]{3}|width:\s*\d|box-shadow/)
  assert.match(css, /\.sight-analysis-entry > span \{ font-size: 12px; line-height: 1; \}/)
  assert.match(css, /\.history-dashboard__heading-actions \{[^}]*align-items: center;/)
  assert.equal(18 + 4 * 2 + 9 * 2, 44)
})
test('SA43 production notation -> actual VexFlow staff lines B2/F3/B4/C5, not reference coordinates', () => {
  const { StaveNote } = require('vexflow')
  // VexFlow uses line 1 for the bottom staff line: G2 bass / E4 treble.
  for (const [midi, clef, expectedLine] of [[36, 'bass', -1], [37, 'bass', -1], [47, 'bass', 2], [53, 'bass', 4], [71, 'treble', 3], [72, 'treble', 3.5], [84, 'treble', 7], [85, 'treble', 7]]) {
    const n = spellMidiPitch(midi, 'C', clef), note = new StaveNote({ clef: n.clef, keys: [n.vexFlowKey], duration: 'w' })
    assert.equal(note.getKeyProps()[0].line, expectedLine)
  }
  const renderer = fs.readFileSync(path.join(__dirname, '../src/shared/musicNotation/MusicStaffRenderer.tsx'), 'utf8')
  assert.match(renderer, /const ys = note.getYs\(\)/); assert.match(renderer, /stave.getYForLine\(0\)/)
  assert.match(renderer, /svg.setAttribute\('viewBox'/); assert.doesNotMatch(renderer, /svg.getBBox\(\)/)
})
test('SA44 median and correct sample evidence are explicit without changing average facts', () => {
  for (const locale of ['zh-CN', 'en']) {
    const instance = createLocalizationInstance(locale), t = instance.getFixedT(locale, 'sightAnalysis')
    assert.equal(ui.presentSightHistoryAverage(790, t), locale === 'en' ? 'Avg response 0.79s' : '平均反应 0.79 秒')
    for (const value of [null, undefined, -1, NaN, Infinity, '790']) assert.equal(ui.presentSightHistoryAverage(value, t), locale === 'en' ? 'Avg response —' : '平均反应 —')
    const html = renderToStaticMarkup(React.createElement(I18nextProvider, { i18n: instance }, React.createElement(ui.SightSessionNoteAnalysis, { stats: [stat(60, [100, 100, 1900], 1)] })))
    assert.ok(html.includes(locale === 'en' ? 'Median correct time 0.10s' : '答对中位用时 0.10 秒'))
    assert.ok(html.includes(locale === 'en' ? '3 correct samples' : '3 次正确样本'))
    assert.doesNotMatch(html, /Typical response|30%|300ms/)
    assert.ok(!('detailed' in sightAnalysisResources[locale])); assert.ok(!('detailed_other' in sightAnalysisResources[locale]))
  }
  assert.equal(domain.medianMs([100, 100, 1900]), 100)
})
test('SA45 compact report replaces accuracy hero and recommendation, preserves seven real facts', () => {
  const main = fs.readFileSync(path.join(__dirname, '../prototype/android-tablet-v1/src/main.tsx'), 'utf8')
  const result = main.slice(main.indexOf('function SightResultScreen('), main.indexOf('function formatIntervalAccuracy('))
  assert.doesNotMatch(result, /score-ring|result-score|result-note|getPrimaryErrorNote|attention|primaryError/)
  assert.match(result, /sight-report-dashboard/); assert.match(result, /sight-report-metrics/)
  for (const fact of ['accuracy', 'completedQuestions', 'totalQuestions', 'correct', 'wrong', 'timeout', 'averageReactionMs', 'bestStreak']) assert.ok(result.includes('report.' + fact))
  assert.match(result, /SightSessionNoteAnalysis stats=\{report.noteStats\}/)
  const sight = main.slice(main.indexOf('const sightPresentation ='), main.indexOf('function HistoryScreen('))
  assert.match(sight, /averageReactionMs/); assert.doesNotMatch(sight, /item.durationMs|presentSightDuration|median/)
  const actions = main.slice(main.indexOf('<div className="history-dashboard__heading-actions">'), main.indexOf('<div className="history-filter"'))
  assert.match(actions, /sight-analysis-entry[\s\S]*→[\s\S]*listStatus/)
  assert.match(main, /ProductFrame active="history" title=\{analysisT\('title'\)\}/)
})
test('SA46 full Top10 and Top5 render every row, no duplicated body title or detailed-count copy', () => {
  const stats = Array.from({ length: 10 }, (_, i) => stat(60 + i, Array(5).fill(2000), 5)); stats.push(stat(36, Array(100).fill(100)))
  for (const locale of ['zh-CN', 'en']) {
    const instance = createLocalizationInstance(locale)
    const render = component => renderToStaticMarkup(React.createElement(I18nextProvider, { i18n: instance }, component))
    const html = render(React.createElement(ui.SightHistoryAnalysis, { records: [report(1, stats), report(2, null)], status: 'ready', warning: null }))
    assert.equal((html.match(/<li(?: |>)/g) ?? []).length, 20); assert.doesNotMatch(html, /<h1|包含详细音符统计|of these include|30%|0.30s|Median response/)
    const session = render(React.createElement(ui.SightSessionNoteAnalysis, { stats }))
    assert.equal((session.match(/<li(?: |>)/g) ?? []).length, 10)
  }
})
test('SA47 double reports count in completed window but never contribute per-note long-term data', () => {
  const invalidOldAttribution = report(2, [stat(60, Array(5).fill(2000), 5)], { settings: { noteMode: 'double' } })
  const result = domain.analyzeSightHistory([invalidOldAttribution, report(1, [stat(62, Array(20).fill(1000))])])
  assert.equal(result.windowCount, 2); assert.equal(result.analyzableCount, 1)
  assert.deepEqual(result.noteStats.map(s => s.identity), [stat(62).identity]); assert.deepEqual(result.errors, []); assert.equal(result.slow.length, 1); assert.equal(result.slow[0].responseTimesMs.length, 20)
})
test('SR00 exact four-file repair preserves all historical guards and rejects mutations', () => require('./android-sight-slow-ranking-contract.cjs').assertDelta())
test('SR01 close response times still rank all eligible notes instead of an empty outlier list', () => {
  const result = domain.analyzeSightHistory([report(1, [stat(60, Array(5).fill(1000)), stat(62, Array(5).fill(1010)), stat(64, Array(5).fill(1020))])])
  assert.deepEqual(result.slow.map(s => [s.notation.spelling, s.medianResponseMs]), [['E4', 1020], ['D4', 1010], ['C4', 1000]])
  assert.equal(result.slow.filter(s => s.medianResponseMs >= Math.max(result.globalMedian * 1.30, result.globalMedian + 300)).length, 0, 'old outlier rule would hide every note')
})
test('SR02 eligible samples aggregate across reports without mixing clefs or medians of medians', () => {
  const result = domain.analyzeSightHistory([report(3, [stat(60, [2000, 3000], 0, 'C', 'treble')]), report(2, [stat(60, [100, 200, 300], 0, 'F', 'treble')]), report(1, [stat(60, Array(4).fill(9000), 0, 'C', 'bass')])])
  assert.equal(result.noteStats.length, 2); assert.equal(result.slow.length, 1)
  assert.equal(result.slow[0].notation.clef, 'treble'); assert.equal(result.slow[0].medianResponseMs, 300); assert.equal(result.slow[0].responseTimesMs.length, 5)
  assert.equal(result.slow[0].keySignature, 'C', 'most recent real rendering context retained')
})
test('SR03 wrong and timeout timestamps never affect median; same note may rank in both lists', () => {
  const stats = [], note = spellMidiPitch(74, 'C', 'treble')
  for (const ms of [900, 1000, 1100, 1200, 1300]) domain.recordSightNoteOutcome(stats, [note], 'C', 'correct', ms)
  domain.recordSightNoteOutcome(stats, [note], 'C', 'wrong_note', 90000); domain.recordSightNoteOutcome(stats, [note], 'C', 'timeout', 99999)
  const result = domain.analyzeSightHistory([report(1, stats)])
  assert.equal(result.errors[0].errorCount, 2); assert.equal(result.slow[0].medianResponseMs, 1100); assert.equal(result.slow[0].responseTimesMs.length, 5)
  assert.equal(result.slow[0].analysisIdentity, result.errors[0].analysisIdentity)
})
test('SR04 clef tie order and enharmonic groups are deterministic and remain separate', () => {
  const reports = [report(2, [stat(60, Array(5).fill(1000), 0, 'C', 'bass')]), report(1, [stat(60, Array(5).fill(1000), 0, 'C', 'treble')]), report(3, [stat(66, Array(5).fill(1000), 0, 'G'), stat(66, Array(5).fill(1000), 0, 'Gb')])]
  const result = domain.analyzeSightHistory(reports)
  assert.equal(result.slow.length, 4); assert.equal(new Set(result.slow.map(s => s.analysisIdentity)).size, 4)
  assert.deepEqual(result.slow.map(s => [s.notation.clef, s.notation.spelling]), [['treble', 'C4'], ['bass', 'C4'], ['treble', 'F#4'], ['treble', 'Gb4']])
  assert.deepEqual(domain.analyzeSightHistory([...reports].reverse()), result)
})
test('SR05 missing or invalid clef is not inferred from pitch or a neighbouring report', () => {
  const missing = stat(60, Array(5).fill(1000)); delete missing.notation.clef
  const result = domain.analyzeSightHistory([report(1, [missing]), report(2, null)])
  assert.equal(result.windowCount, 2); assert.equal(result.analyzableCount, 0); assert.deepEqual(result.slow, [])
})
test('SR06 correct sample minimum and Top10 limit are per clef, not padded with ineligible notes', () => {
  const reports = [report(1, [stat(60, Array(4).fill(9000), 0, 'C', 'treble')]), report(2, [stat(60, Array(4).fill(9000), 0, 'C', 'bass')]), report(3, [stat(62, Array(6).fill(1100))])]
  assert.deepEqual(domain.analyzeSightHistory(reports).slow.map(s => s.notation.spelling), ['D4'])
  const stats = Array.from({ length: 12 }, (_, i) => stat(60 + i, Array(5).fill(1000 + i)))
  assert.deepEqual(domain.analyzeSightHistory([report(1, stats)]).slow.map(s => s.medianResponseMs), [1011, 1010, 1009, 1008, 1007, 1006, 1005, 1004, 1003, 1002])
})
for (const locale of ['zh-CN', 'en']) test(`SR07/${locale} actual React shows clefs, medians, correct samples and honest empty states`, () => {
  const instance = createLocalizationInstance(locale); instance.options.fallbackLng = false
  const render = records => renderToStaticMarkup(React.createElement(I18nextProvider, { i18n: instance }, React.createElement(ui.SightHistoryAnalysis, { records, status: 'ready', warning: null })))
  const html = render([report(2, [stat(60, Array(5).fill(1200), 0, 'C', 'bass')]), report(1, [stat(60, Array(6).fill(1000), 0, 'C', 'treble')])])
  for (const text of locale === 'en' ? ['Bass clef', 'Treble clef', 'Median correct time 1.20s', 'Median correct time 1.00s', '5 correct samples', '6 correct samples'] : ['低音谱号', '高音谱号', '答对中位用时 1.20 秒', '答对中位用时 1.00 秒', '5 次正确样本', '6 次正确样本']) assert.ok(html.includes(text), text)
  assert.ok(html.includes('music-staff-renderer is-bass')); assert.ok(html.includes('music-staff-renderer is-treble'))
  assert.ok(html.includes(locale === 'en' ? 'not necessarily outliers' : '不代表异常')); assert.ok(!html.includes('No clear slow-response notes yet')); assert.ok(!html.includes('暂无明显长思考音'))
  for (const records of [[], [report(1, null)], [report(1, [stat(60, Array(4).fill(2000))])]]) assert.ok(render(records).includes(locale === 'en' ? 'No eligible notes' : '暂无符合排名条件的音'))
  if (locale === 'en') assert.doesNotMatch(html, /[\u4e00-\u9fff]/)
  const single = renderToStaticMarkup(React.createElement(I18nextProvider, { i18n: instance }, React.createElement(ui.SightSessionNoteAnalysis, { stats: [stat(60, [900], 0, 'C', 'bass')] })))
  assert.ok(single.includes(locale === 'en' ? '1 correct sample' : '1 次正确样本')); assert.ok(single.includes(locale === 'en' ? 'Median correct time 0.90s' : '答对中位用时 0.90 秒'))
})
test('SR08 existing generated reports have one real clef per pitch in each fixed staff mode', () => {
  const { getSightReadingNotes } = require('../src/sightReading/sightReadingNotes.ts')
  for (const staffMode of ['treble', 'bass', 'grand']) {
    const seen = new Map()
    for (const note of getSightReadingNotes({ staffMode, keySignature: 'C', notePoolMode: 'chromatic' })) {
      const id = domain.sightNoteIdentity(note.notation)
      assert.ok(!seen.has(id) || seen.get(id) === note.notation.clef); seen.set(id, note.notation.clef)
    }
  }
})

test('SR09 two real runtime 100-question fixture reports reuse durable V1 facts and never rewrite storage', async () => {
  const fixtures = [], reports = []
  for (const staffMode of ['treble', 'bass']) {
    const f = await runtimeFixture({ questionCount: 100, staffMode, noteMode: 'single' }, `hundred-${staffMode}`)
    fixtures.push(f); f.runtime.start()
    for (let i = 0; i < 100; i++) {
      f.timers.advance(32)
      const c4 = f.runtime.snapshot.currentNote.notation.spelling === 'C4'
      f.timers.advance(c4 ? staffMode === 'treble' ? 1200 : 1100 : 1000)
      f.runtime.sendCorrect(); f.timers.advance(350)
    }
    await f.runtime.flushPersistence()
    const r = (await reload(f.backend)).list()[0]
    assert.ok(persistence.isDurableSightReadingReport(r)); assert.equal(r.completed, 100); assert.equal(r.correct, 100)
    reports.push(r)
  }
  const rawBefore = fixtures.map(f => JSON.stringify([...f.backend.values]))
  const result = domain.analyzeSightHistory(reports)
  assert.equal(result.windowCount, 2); assert.equal(result.analyzableCount, 2); assert.equal(result.slow.length, 10)
  const c4 = result.slow.filter(s => s.notation.spelling === 'C4')
  assert.deepEqual(c4.map(s => [s.notation.clef, s.medianResponseMs]), [['treble', 1200], ['bass', 1100]])
  assert.ok(c4.every(s => s.responseTimesMs.length >= 5))
  assert.equal(result.slow.filter(s => s.medianResponseMs >= Math.max(result.globalMedian * 1.30, result.globalMedian + 300)).length, 0)
  for (let i = 0; i < fixtures.length; i++) {
    assert.equal(JSON.stringify([...fixtures[i].backend.values]), rawBefore[i])
    const single = domain.rankSightNotes(ui.sightSessionFromHistory(reports[i]).noteStats, 5)
    assert.equal(single.slow.length, 5); assert.equal(single.slow[0].notation.spelling, 'C4')
    assert.equal(single.slow[0].medianResponseMs, i === 0 ? 1200 : 1100)
    await fixtures[i].runtime.dispose()
  }
})

test('SR10 V1 identity, writer, validator, cloning and median function bodies remain byte-exact', () => {
  const file = 'src/sightReading/noteAnalysis.ts', baseline = require('./android-sight-slow-ranking-contract.cjs').base
  const before = require('node:child_process').execFileSync('git', ['show', `${baseline}:${file}`], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' })
  const after = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  const functions = source => {
    const ast = ts.createSourceFile(file, source.replaceAll('\r\n', '\n'), ts.ScriptTarget.Latest, true)
    return new Map(ast.statements.filter(ts.isFunctionDeclaration).map(n => [n.name.text, n.getText(ast)]))
  }
  const old = functions(before), current = functions(after)
  for (const name of ['sightNoteIdentity', 'recordSightNoteOutcome', 'isSightNoteStats', 'cloneSightNoteStats', 'medianMs']) assert.equal(current.get(name), old.get(name), name)
  const durable = fs.readFileSync(path.join(__dirname, '../prototype/android-tablet-v1/src/androidPersistenceCore.ts'), 'utf8')
  assert.doesNotMatch(durable, /sightAnalysisIdentity|analysisIdentity/)
})

test('SA48 actual History entry absent in All/Chord/Interval and present before count only in Sight', async () => {
  const { mounted, text } = require('./android-localization-shell-check.cjs')
  const empty = { status: 'ready', records: [] }, coordinator = { refresh: async () => {} }
  for (const filter of ['all', 'sight', 'chord', 'interval']) await mounted('sight-flow', async h => {
    const entries = h.renderer.root.findAllByProps({ className: 'sight-analysis-entry' })
    assert.equal(entries.length, filter === 'sight' ? 1 : 0)
    if (entries.length) {
      const actions = h.renderer.root.findByProps({ className: 'history-dashboard__heading-actions' })
      assert.equal(actions.children[0], entries[0]); assert.ok(text(actions.children[1]).includes('条记录'))
    }
  }, { theme: { id: 'light', source: 'builtin', capabilities: { historyVisual: { kind: 'standard' } } }, render: ({ runtime, theme, ui }) => React.createElement(ui.HistoryScreen, { runtime, theme, filter, onFilterChange() {}, onOpenSightReport() {}, onOpenChordReport() {}, onOpenIntervalReport() {}, chordHistory: empty, intervalHistory: empty, chordPersistence: coordinator, intervalPersistence: coordinator }) })
})
test('SA42 actual mounted History filter/entry/record handlers and locale round trip preserve durable bytes', async () => {
  const { mounted, text, businessBytes } = require('./android-localization-shell-check.cjs')
  const { act } = require('react-test-renderer')
  const { repository, runtime, timers } = await runtimeFixture(); runtime.start()
  for (let i = 0; i < 10; i++) { timers.advance(132); runtime.sendCorrect(); timers.advance(350) }
  await runtime.flushPersistence()
  const opened = [], changed = [], emptyHistory = { status: 'ready', records: [] }, coordinator = { refresh: async () => {} }
  await mounted('sight-flow', async h => {
    const before = businessBytes(h.backend)
    const entry = h.renderer.root.findByProps({ className: 'sight-analysis-entry' })
    assert.ok(text(entry).includes('识谱分析'))
    assert.ok(text(entry).includes('→')); assert.ok(text(h.renderer.root).includes('平均反应 0.10 秒'))
    await h.switchTo('en'); assert.ok(text(h.renderer.root.findByProps({ className: 'sight-analysis-entry' })).includes('Sight Reading Analysis'))
    assert.ok(text(h.renderer.root).includes('Avg response 0.10s'))
    await act(async () => { entry.props.onClick() }); assert.equal(global.window.location.hash, 'sight-analysis')
    const row = h.renderer.root.findAllByType('button').find(node => node.props.className?.includes('history-row'))
    await act(async () => { row.props.onClick() }); assert.deepEqual(opened, [['actual-session', 'sight']])
    const all = h.renderer.root.findAllByType('button').find(node => text(node).trim() === 'All')
    await act(async () => { all.props.onClick() }); assert.deepEqual(changed, ['all'])
    await h.switchTo('zh-CN'); assert.deepEqual(businessBytes(h.backend), before)
  }, { sightRecords: repository.list(), theme: { id: 'light', source: 'builtin', capabilities: { historyVisual: { kind: 'standard' } } },
    render: ({ runtime, theme, ui }) => React.createElement(ui.HistoryScreen, { runtime, theme, filter: 'sight', onFilterChange: filter => changed.push(filter), onOpenSightReport: (...args) => opened.push(args), onOpenChordReport() {}, onOpenIntervalReport() {}, chordHistory: emptyHistory, intervalHistory: emptyHistory, chordPersistence: coordinator, intervalPersistence: coordinator }) })
  await runtime.dispose()
})
async function run() { let passed = 0; for (const [id, check] of tests) { try { await check(); passed++; console.log('PASS', id) } catch (error) { console.error('FAIL', id, error.stack) } } console.log(`\n${passed}/${tests.length} Sight Reading Analysis checks PASS (React/contracts, not pixel evidence)`); if (passed !== tests.length) process.exitCode = 1 }
if (require.main === module) run()
module.exports = { stat, report, Backend, Timers, runtimeFixture, run }
