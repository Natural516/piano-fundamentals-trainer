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

const practice = require('../prototype/android-tablet-v1/src/intervalPractice/index.ts')
const theory = require('../prototype/android-tablet-v1/src/musicTheory/intervals/index.ts')
const ROOT = path.resolve(__dirname, '..')
const mainSource = fs.readFileSync(path.join(ROOT, 'prototype/android-tablet-v1/src/main.tsx'), 'utf8')
const tests = []
const test = (id, title, callback) => tests.push({ id, title, callback })

function lcg(initialSeed) {
  let seed = initialSeed >>> 0
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0x100000000
  }
}

const settings = (changes = {}) => Object.freeze({ ...practice.DEFAULT_INTERVAL_PRACTICE_SETTINGS, ...changes })
const stateFor = (candidate, currentSettings) => Object.freeze({
  settings: currentSettings,
  scheduler: practice.createIntervalSchedulerState(),
  currentQuestion: Object.freeze({ ...candidate, questionId: 'fixed-test-question' })
})

test('IP01', 'V3 narrow writes and V1/V2 wide reads retire modes without rewriting old storage', async () => {
  const storage = new Map()
  const backend = {
    get: async ({ key }) => ({ value: storage.get(key) ?? null }),
    set: async ({ key, value }) => { storage.set(key, value) },
    keys: async () => ({ keys: [...storage.keys()] })
  }
  const repository = new practice.IntervalPracticeSettingsRepository(backend)
  assert.deepEqual(practice.INTERVAL_QUESTION_COUNT_OPTIONS, [10, 20, 50, 100, 'endless'])
  const saved = settings({ answerHint: true, includeAccidentalRoots: true, questionCount: 'endless' })
  await repository.save({ ...saved, practiceMode: 'construction' })
  assert.deepEqual(await repository.load(), saved)
  assert.doesNotMatch(storage.get(practice.INTERVAL_PRACTICE_SETTINGS_STORAGE_KEY), /practiceMode/)
  for (const schemaVersion of [1, 2]) for (const practiceMode of ['reproduction', 'construction']) {
    const raw = JSON.stringify({ schemaVersion, practiceMode, answerHint: false, orderMode: 'sequential', sequentialStage: 6 })
    storage.set(practice.INTERVAL_PRACTICE_SETTINGS_STORAGE_KEY, raw)
    assert.deepEqual(await repository.load(), settings({ answerHint: false }))
    assert.equal(storage.get(practice.INTERVAL_PRACTICE_SETTINGS_STORAGE_KEY), raw)
  }
})

test('IP02', 'presentation always has a grand-staff notation model with formal hint semantics', () => {
  const candidate = theory.INTERVAL_PRACTICE_CANDIDATES.majorSixth.find(({ rootMidi }) => rootMidi === 60)
  assert.ok(candidate)
  const constructionOn = practice.presentIntervalPractice(stateFor(candidate, settings({ answerHint: true })))
  assert.equal(constructionOn.notation.notes.length, 2)
  assert.equal(constructionOn.notation.targetVisible, true)
  const constructionOff = practice.presentIntervalPractice(stateFor(candidate, settings({ answerHint: false })))
  assert.equal(constructionOff.notation.notes.length, 1)
  assert.equal(constructionOff.notation.notes[0].midiNumber, candidate.rootMidi)
  assert.equal(constructionOff.notation.targetVisible, false)
  assert.equal(constructionOff.notation.answerLabel, null)
  assert.equal(constructionOff.prompt, '请按出以 C4 为低音的大六度音程')
  assert.equal(constructionOn.prompt, constructionOff.prompt)
  for (const candidate of Object.values(theory.INTERVAL_PRACTICE_CANDIDATES).flat()) {
    const original = JSON.stringify(candidate)
    const off = practice.presentIntervalPractice(stateFor(candidate, settings({ answerHint: false })))
    const on = practice.presentIntervalPractice(stateFor(candidate, settings({ answerHint: true })))
    assert.match(off.rootLabel, /^[A-G][♯♭]?\d$/)
    assert.equal(off.prompt, `请按出以 ${off.rootLabel} 为低音的${candidate.intervalType.chineseName}音程`)
    assert.equal(on.prompt, off.prompt)
    assert.equal(off.notation.notes.length, 1)
    assert.equal(off.notation.notes[0].midiNumber, candidate.rootMidi)
    assert.equal(on.notation.notes[0].midiNumber, candidate.rootMidi)
    assert.deepEqual(on.notation.notes[0], off.notation.notes[0])
    assert.equal(off.notation.notes[0].spelling, off.rootLabel)
    assert.equal(off.notation.notes[0].octave, candidate.root.octave)
    assert.ok(on.notation.notes.some((note) => note.midiNumber === candidate.targetMidi && note.letter === candidate.target.letter && note.octave === candidate.target.octave))
    assert.equal(JSON.stringify(candidate), original, 'hint must not mutate question or expected target')
  }
  for (const rootLabel of ['C4', 'E♭3', 'F♯4']) {
    assert.ok(Object.values(theory.INTERVAL_PRACTICE_CANDIDATES).flat().some((candidate) => practice.presentIntervalPractice(stateFor(candidate, settings())).rootLabel === rootLabel))
  }
})

let weightAudit = null
test('IP03', '50,000 seeded questions preserve 11/18 weights, zones, anti-repeat and legality', () => {
  const rng = lcg(20260929)
  let scheduler = practice.createIntervalSchedulerState()
  const counts = Object.fromEntries(theory.INTERVAL_TYPE_IDS.map((id) => [id, 0]))
  const zones = { LOW_EXTENSION: 0, CORE: 0, HIGH_EXTENSION: 0 }
  let invalid = 0
  let lastInterval = null
  let lastRoot = null
  let sameInterval = 0
  let sameRoot = 0
  let longestSameInterval = 0
  let longestSameRoot = 0
  for (let index = 0; index < 50000; index += 1) {
    const result = practice.scheduleNextIntervalQuestion(scheduler, settings({ includeAccidentalRoots: true }), rng)
    scheduler = result.scheduler
    const question = result.question
    counts[question.intervalType.id] += 1
    zones[question.zone] += 1
    if (theory.validateIntervalPracticeQuestion(question).length > 0) invalid += 1
    sameInterval = question.intervalType.id === lastInterval ? sameInterval + 1 : 1
    sameRoot = question.rootMidi === lastRoot ? sameRoot + 1 : 1
    longestSameInterval = Math.max(longestSameInterval, sameInterval)
    longestSameRoot = Math.max(longestSameRoot, sameRoot)
    lastInterval = question.intervalType.id
    lastRoot = question.rootMidi
  }
  const low = new Set(practice.LOW_WEIGHT_INTERVAL_IDS)
  for (const id of theory.INTERVAL_TYPE_IDS) {
    const percent = counts[id] / 500
    if (low.has(id)) assert.ok(Math.abs(percent - 2.5) < 0.35, `${id} ${percent}`)
    else assert.ok(Math.abs(percent - (18 / 440 * 100)) < 0.45, `${id} ${percent}`)
  }
  const lowTotal = practice.LOW_WEIGHT_INTERVAL_IDS.reduce((sum, id) => sum + counts[id], 0)
  assert.ok(Math.abs(lowTotal / 500 - 10) < 0.5)
  assert.ok(Math.abs(zones.CORE / 500 - 70) < 1.2)
  assert.equal(invalid, 0)
  assert.ok(longestSameInterval <= 2)
  weightAudit = { counts, zones, lowTotal, longestSameInterval, longestSameRoot, invalid }
})

test('IP04', 'accidental-root setting filters candidates before selection', () => {
  let offScheduler = practice.createIntervalSchedulerState()
  let onScheduler = practice.createIntervalSchedulerState()
  const offRng = lcg(40)
  const onRng = lcg(41)
  let targetAccidentalSeen = false
  let sharpRootSeen = false
  let flatRootSeen = false
  for (let index = 0; index < 10000; index += 1) {
    const off = practice.scheduleNextIntervalQuestion(offScheduler, settings({ includeAccidentalRoots: false }), offRng)
    offScheduler = off.scheduler
    assert.equal(off.question.root.accidental, 0)
    if (off.question.target.accidental !== 0) targetAccidentalSeen = true
    const on = practice.scheduleNextIntervalQuestion(onScheduler, settings({ includeAccidentalRoots: true }), onRng)
    onScheduler = on.scheduler
    if (on.question.root.accidental === 1) sharpRootSeen = true
    if (on.question.root.accidental === -1) flatRootSeen = true
  }
  assert.equal(targetAccidentalSeen, true)
  assert.equal(sharpRootSeen, true)
  assert.equal(flatRootSeen, true)
})

class FakeClock { nowValue = 0; now() { return this.nowValue } }
class FakeScheduler {
  constructor(clock) { this.clock = clock; this.nextId = 1; this.tasks = new Map() }
  schedule(callback, delayMs) { const id = this.nextId++; this.tasks.set(id, { callback, deadline: this.clock.now() + delayMs }); return id }
  cancel(id) { this.tasks.delete(id) }
  advanceBy(delta) {
    const target = this.clock.now() + delta
    while (true) {
      const next = [...this.tasks.entries()].filter(([, task]) => task.deadline <= target).sort((a, b) => a[1].deadline - b[1].deadline)[0]
      if (!next) break
      this.tasks.delete(next[0]); this.clock.nowValue = next[1].deadline; next[1].callback()
    }
    this.clock.nowValue = target
  }
}
function midi(runtime, clock, type, note) {
  runtime.handleMidi({ id: `${type}-${note}-${clock.now()}`, type, midiNumber: note, velocity: type === 'noteOn' ? 100 : 0, timestamp: clock.now() })
}
function answerCurrent(runtime, clock, scheduler) {
  const question = runtime.snapshot.question
  const pitches = [...new Set([question.rootMidi, question.targetMidi])]
  for (const pitch of pitches) { midi(runtime, clock, 'noteOn', pitch); clock.nowValue += 1 }
  for (const pitch of pitches) { midi(runtime, clock, 'noteOff', pitch); clock.nowValue += 1 }
  scheduler.advanceBy(801)
}

test('IP05', 'session pause blocks judgement, fixed count completes, and wrong does not advance', () => {
  const clock = new FakeClock(); const scheduler = new FakeScheduler(clock)
  const runtime = new practice.IntervalPracticeSessionRuntime({ clock, scheduler, rng: lcg(90) })
  runtime.start(settings({ questionCount: 10, includeAccidentalRoots: false }))
  const originalId = runtime.snapshot.question.questionId
  runtime.pause()
  midi(runtime, clock, 'noteOn', runtime.snapshot.question.rootMidi)
  assert.equal(runtime.snapshot.question.questionId, originalId)
  assert.equal(runtime.snapshot.judgement, null)
  runtime.resume()
  const wrongPitch = runtime.snapshot.question.rootMidi === 127 ? 126 : runtime.snapshot.question.rootMidi + 1
  const expected = new Set([runtime.snapshot.question.rootMidi, runtime.snapshot.question.targetMidi])
  const usableWrong = expected.has(wrongPitch) ? wrongPitch + 1 : wrongPitch
  midi(runtime, clock, 'noteOn', runtime.snapshot.question.rootMidi)
  midi(runtime, clock, 'noteOn', usableWrong)
  assert.equal(runtime.snapshot.question.questionId, originalId)
  assert.equal(runtime.snapshot.completedQuestions, 0)
  midi(runtime, clock, 'noteOff', runtime.snapshot.question.rootMidi)
  midi(runtime, clock, 'noteOff', usableWrong)
  for (let index = 0; index < 10; index += 1) answerCurrent(runtime, clock, scheduler)
  assert.equal(runtime.snapshot.completedQuestions, 10)
  assert.equal(runtime.snapshot.status, 'SESSION_COMPLETE')
})

test('IP06', 'endless session never auto-completes and transport loss requires explicit resume', () => {
  const clock = new FakeClock(); const scheduler = new FakeScheduler(clock)
  const runtime = new practice.IntervalPracticeSessionRuntime({ clock, scheduler, rng: lcg(91) })
  runtime.start(settings({ questionCount: 'endless' }))
  for (let index = 0; index < 25; index += 1) answerCurrent(runtime, clock, scheduler)
  assert.equal(runtime.snapshot.status, 'RUNNING')
  assert.equal(runtime.snapshot.completedQuestions, 25)
  runtime.setTransportReady(false)
  assert.equal(runtime.snapshot.status, 'SUSPENDED')
  runtime.setTransportReady(true)
  assert.equal(runtime.snapshot.status, 'SUSPENDED')
  runtime.resume()
  assert.equal(runtime.snapshot.status, 'RUNNING')
  runtime.stop()
  assert.equal(runtime.snapshot.status, 'STOPPED')
})

test('IP08', 'hint ON/OFF keep the identical generated question and MIDI answer throughout sessions', () => {
  const clocks = [new FakeClock(), new FakeClock()]
  const schedulers = clocks.map((clock) => new FakeScheduler(clock))
  const runtimes = clocks.map((clock, index) => new practice.IntervalPracticeSessionRuntime({ clock, scheduler: schedulers[index], rng: lcg(123) }))
  runtimes.forEach((runtime, index) => runtime.start(settings({ answerHint: Boolean(index), includeAccidentalRoots: true, questionCount: 'endless' })))
  for (let index = 0; index < 100; index += 1) {
    assert.deepEqual(runtimes[0].snapshot.question, runtimes[1].snapshot.question)
    assert.equal(practice.presentIntervalPractice(runtimes[0].snapshot.practiceState).prompt, practice.presentIntervalPractice(runtimes[1].snapshot.practiceState).prompt)
    runtimes.forEach((runtime, index) => answerCurrent(runtime, clocks[index], schedulers[index]))
    assert.equal(runtimes[0].snapshot.completedQuestions, index + 1)
    assert.equal(runtimes[1].snapshot.completedQuestions, index + 1)
    assert.equal(Object.hasOwn(runtimes[0].snapshot.attempts[0], 'practiceMode'), false)
  }
})

test('IP07', 'formal UI contract splits preparation and ACTIVE without next or skip', () => {
  const setup = mainSource.slice(mainSource.indexOf('function IntervalPracticeSetupScreen'), mainSource.indexOf('function IntervalPracticeActiveScreen'))
  const active = mainSource.slice(mainSource.indexOf('function IntervalPracticeActiveScreen'), mainSource.indexOf('function ChordModeSelectScreen'))
  assert.doesNotMatch(setup, /练习方式|practiceMode|音程复现|音程构造|始终显示/)
  assert.match(setup, /答案提示/)
  assert.match(setup, /低音包含升降号/)
  assert.match(setup, /练习题数/)
  assert.match(setup, /开始练习/)
  assert.doesNotMatch(setup, /judgementPhase|WRONG_WAIT_RELEASE/)
  assert.match(active, /interval-focus-frame/)
  assert.match(active, /runtime\.pause\(\)/)
  assert.match(active, /runtime\.resume\(\)/)
  assert.match(active, /提前结束/)
  assert.match(active, /midiRouter\.subscribe/)
  assert.match(active, /staffMode="grand"/)
  assert.doesNotMatch(active, /practiceMode|modeLabel|chord-stage-prompt|interval-progress-footer|<footer|请在 MIDI 钢琴上弹奏当前音程/)
  assert.match(active, /interval-focus-prompt__identity/)
  assert.match(active, /interval-focus-feedback/)
  assert.match(active, /已完成 \$\{snapshot\.completedQuestions\} \/ \$\{snapshot\.questionCount\}/)
  assert.equal((active.match(/<MidiStatusButton/g) || []).length, 1)
  assert.doesNotMatch(active, /BottomNavigation|下一题|跳过/)
  assert.doesNotMatch(active, /History record|ReportRepository|PersistenceCoordinator/)
})

;(async () => {
  let failed = 0
  for (const item of tests) {
    try { await item.callback(); console.log(`PASS ${item.id} ${item.title}`) }
    catch (error) { failed += 1; console.error(`FAIL ${item.id} ${item.title}`); console.error(error.stack || error) }
  }
  if (weightAudit) {
    console.log(`\nWEIGHT_COUNTS=${JSON.stringify(weightAudit.counts)}`)
    console.log(`ZONE_COUNTS=${JSON.stringify(weightAudit.zones)}`)
    console.log(`LOW_WEIGHT_TOTAL=${weightAudit.lowTotal}`)
    console.log(`LONGEST_SAME_INTERVAL_STREAK=${weightAudit.longestSameInterval}`)
    console.log(`LONGEST_SAME_ROOT_MIDI_STREAK=${weightAudit.longestSameRoot}`)
    console.log(`INVALID=${weightAudit.invalid}`)
  }
  console.log(`${tests.length - failed}/${tests.length} Android Interval Practice contract groups PASS`)
  if (failed > 0) process.exitCode = 1
})()
