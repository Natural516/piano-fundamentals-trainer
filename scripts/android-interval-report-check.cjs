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

const practice = require('../prototype/android-tablet-v1/src/intervalPractice/index.ts')
const theory = require('../prototype/android-tablet-v1/src/musicTheory/intervals/index.ts')
const tests = []
const test = (id, title, callback) => tests.push({ id, title, callback })

const settings = (changes = {}) => Object.freeze({ ...practice.DEFAULT_INTERVAL_PRACTICE_SETTINGS, ...changes })
function attempt(intervalId, index, wrongAttemptCount = 0) {
  const candidate = theory.INTERVAL_PRACTICE_CANDIDATES[intervalId][index % theory.INTERVAL_PRACTICE_CANDIDATES[intervalId].length]
  return Object.freeze({
    questionId: `q-${intervalId}-${index}`,
    intervalId,
    root: candidate.root,
    target: candidate.target,
    rootMidi: candidate.rootMidi,
    targetMidi: candidate.targetMidi,
    wrongAttemptCount,
    firstTryCorrect: wrongAttemptCount === 0,
    completed: true
  })
}
function snapshot(attempts, sessionSettings = settings()) {
  return {
    status: 'STOPPED', transportReady: true, settings: sessionSettings, practiceState: null, question: null,
    questionCount: sessionSettings.questionCount, completedQuestions: attempts.length, attempts,
    currentWrongAttemptCount: 0, judgement: null
  }
}
function report(attempts, sessionSettings = settings(), completionStatus = 'STOPPED') {
  return practice.buildIntervalPracticeReport(snapshot(attempts, sessionSettings), {
    startedAtEpochMs: 1000, finishedAtEpochMs: 2000, completionStatus
  })
}

test('IR01', 'Case A: 20 questions, 15 first try, 5 retried and 7 wrong attempts', () => {
  const wrongs = [2, 2, 1, 1, 1]
  const attempts = Array.from({ length: 20 }, (_, index) => attempt('majorThird', index, index < 5 ? wrongs[index] : 0))
  const value = report(attempts, settings({ questionCount: 20 }), 'COMPLETED')
  assert.deepEqual([value.completedQuestions, value.firstTryCorrectCount, value.firstTryAccuracy, value.retriedCorrectCount, value.totalWrongAttempts], [20, 15, 75, 5, 7])
})

test('IR02', 'Case B: all first try has 100 percent and no fabricated difficult interval', () => {
  const value = report(Array.from({ length: 10 }, (_, index) => attempt('perfectFifth', index)), settings({ questionCount: 10 }), 'COMPLETED')
  assert.deepEqual([value.firstTryAccuracy, value.retriedCorrectCount, value.totalWrongAttempts], [100, 0, 0])
  assert.deepEqual(practice.getDifficultIntervals(value), [])
})

test('IR03', 'Case C: three complete wrong attempts then success is one retried completion', () => {
  const value = report([attempt('minorSixth', 0, 3)])
  assert.deepEqual([value.completedQuestions, value.firstTryCorrectCount, value.retriedCorrectCount, value.totalWrongAttempts], [1, 0, 1, 3])
})

test('IR04', 'Case D: zero-question stopped report uses null accuracy and empty evidence', () => {
  const value = report([], settings({ questionCount: 'endless' }))
  assert.equal(value.firstTryAccuracy, null)
  assert.equal(Number.isNaN(value.firstTryAccuracy), false)
  assert.deepEqual([value.completedQuestions, value.retriedCorrectCount, value.totalWrongAttempts, value.perIntervalStats.length], [0, 0, 0, 0])
  assert.deepEqual(practice.getDifficultIntervals(value), [])
})

test('IR05', 'difficult ordering uses misses, wrong attempts, presented and catalog identity deterministically', () => {
  const attempts = [
    ...Array.from({ length: 5 }, (_, index) => attempt('majorThird', index, index < 3 ? (index === 0 ? 3 : 1) : 0)),
    ...Array.from({ length: 4 }, (_, index) => attempt('augmentedSecond', index, index === 0 ? 2 : 0)),
    ...Array.from({ length: 5 }, (_, index) => attempt('perfectFifth', index, 0)),
    attempt('augmentedUnison', 0, 1), attempt('minorSecond', 0, 1)
  ]
  const difficult = practice.getDifficultIntervals(report(attempts))
  assert.equal(difficult[0].intervalId, 'majorThird')
  assert.equal(difficult[1].intervalId, 'augmentedSecond')
  assert.equal(difficult[2].intervalId, 'augmentedUnison')
})

test('IR06', 'all 26 catalog identities aggregate independently even at equal semitone distance', () => {
  const attempts = theory.INTERVAL_TYPE_IDS.map((intervalId, index) => attempt(intervalId, index, index % 4 === 0 ? 1 : 0))
  const value = report(attempts, settings({ questionCount: 'endless' }))
  assert.equal(value.perIntervalStats.length, 26)
  assert.deepEqual(value.perIntervalStats.map((entry) => entry.intervalId), theory.INTERVAL_TYPE_IDS)
  for (const pair of [['augmentedUnison', 'minorSecond'], ['augmentedFourth', 'diminishedFifth'], ['augmentedSeventh', 'perfectOctave']]) {
    assert.ok(value.perIntervalStats.find((entry) => entry.intervalId === pair[0]))
    assert.ok(value.perIntervalStats.find((entry) => entry.intervalId === pair[1]))
  }
})

class FakeClock { constructor() { this.nowValue = 0 } now() { return this.nowValue } }
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
  runtime.handleMidi({ id: `${type}-${note}-${clock.now()}-${Math.random()}`, type, midiNumber: note, velocity: type === 'noteOn' ? 100 : 0, timestamp: clock.now() })
  clock.nowValue += 1
}
function wrongAttempt(runtime, clock) {
  const q = runtime.snapshot.question
  const expected = new Set([q.rootMidi, q.targetMidi])
  let wrong = 0
  while (expected.has(wrong)) wrong += 1
  if (expected.size === 2) midi(runtime, clock, 'noteOn', q.rootMidi)
  midi(runtime, clock, 'noteOn', wrong)
  if (expected.size === 2) midi(runtime, clock, 'noteOff', q.rootMidi)
  midi(runtime, clock, 'noteOff', wrong)
}
function correctAttempt(runtime, clock, scheduler) {
  const q = runtime.snapshot.question
  const pitches = [...new Set([q.rootMidi, q.targetMidi])]
  for (const pitch of pitches) midi(runtime, clock, 'noteOn', pitch)
  for (const pitch of pitches) midi(runtime, clock, 'noteOff', pitch)
  scheduler.advanceBy(801)
}

test('IR07', 'settled attempt events count WRONG only; incomplete, pause and disconnect do not count', () => {
  const clock = new FakeClock(); const scheduler = new FakeScheduler(clock)
  const runtime = new practice.IntervalPracticeSessionRuntime({ clock, scheduler, rng: () => 0.37 })
  runtime.start(settings({ questionCount: 10 }))
  const q = runtime.snapshot.question
  if (q.rootMidi !== q.targetMidi) {
    midi(runtime, clock, 'noteOn', q.rootMidi)
    scheduler.advanceBy(151)
    midi(runtime, clock, 'noteOff', q.rootMidi)
  }
  runtime.pause(); runtime.resume()
  runtime.setTransportReady(false); runtime.setTransportReady(true); runtime.resume()
  assert.equal(runtime.snapshot.currentWrongAttemptCount, 0)
  wrongAttempt(runtime, clock); wrongAttempt(runtime, clock)
  assert.equal(runtime.snapshot.currentWrongAttemptCount, 2)
  correctAttempt(runtime, clock, scheduler)
  const completedAttempt = runtime.snapshot.attempts.find((attempt) => attempt.completed)
  assert.equal(runtime.snapshot.attempts.filter((attempt) => attempt.completed).length, 1)
  assert.deepEqual([completedAttempt.wrongAttemptCount, completedAttempt.firstTryCorrect], [2, false])
  assert.equal(runtime.snapshot.attempts.at(-1).completed, false)
  assert.equal(runtime.snapshot.currentWrongAttemptCount, 0)
})

test('IR08', 'fixed completed, fixed early stopped and infinite stopped preserve truthful configured totals', () => {
  const fixedDone = report(Array.from({ length: 20 }, (_, index) => attempt('majorSecond', index)), settings({ questionCount: 20 }), 'COMPLETED')
  const fixedStopped = report(Array.from({ length: 8 }, (_, index) => attempt('minorThird', index)), settings({ questionCount: 20 }), 'STOPPED')
  const endlessStopped = report(Array.from({ length: 37 }, (_, index) => attempt('perfectFourth', index)), settings({ questionCount: 'endless' }), 'STOPPED')
  assert.deepEqual([fixedDone.completionStatus, fixedDone.completedQuestions, fixedDone.settings.configuredQuestionCount], ['COMPLETED', 20, 20])
  assert.deepEqual([fixedStopped.completionStatus, fixedStopped.completedQuestions, fixedStopped.settings.configuredQuestionCount], ['STOPPED', 8, 20])
  assert.deepEqual([endlessStopped.completionStatus, endlessStopped.completedQuestions, endlessStopped.settings.questionCountMode, endlessStopped.settings.configuredQuestionCount], ['STOPPED', 37, 'infinite', null])
})

;(async () => {
  let failed = 0
  for (const item of tests) {
    try { await item.callback(); console.log(`PASS ${item.id} ${item.title}`) }
    catch (error) { failed += 1; console.error(`FAIL ${item.id} ${item.title}`); console.error(error.stack || error) }
  }
  console.log(`${tests.length - failed}/${tests.length} Android Interval report contract groups PASS`)
  if (failed > 0) process.exitCode = 1
})()
