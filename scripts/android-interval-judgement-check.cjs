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

const interval = require('../prototype/android-tablet-v1/src/intervalPractice/index.ts')
const theory = require('../prototype/android-tablet-v1/src/musicTheory/intervals/index.ts')

const tests = []
const test = (id, title, callback) => tests.push({ id, title, callback })
const scheduled = (candidate, questionId = `test-${candidate.intervalType.id}-${candidate.rootMidi}-${candidate.targetMidi}`) => Object.freeze({ ...candidate, questionId })
const candidate = (id, rootMidi) => {
  const found = theory.INTERVAL_PRACTICE_CANDIDATES[id].find((question) => question.rootMidi === rootMidi)
  assert.ok(found, `${id} root ${rootMidi}`)
  return scheduled(found)
}
const normalQuestion = candidate('majorSixth', 60)
const unisonQuestion = candidate('perfectUnison', 60)
const diminishedSecondQuestion = scheduled(theory.INTERVAL_PRACTICE_CANDIDATES.diminishedSecond.find((question) => question.rootMidi === question.targetMidi))
const phase = (core) => core.snapshot.state.phase
const on = (core, note, timestampMs) => core.process({ type: 'NOTE_ON', note, timestampMs })
const off = (core, note, timestampMs) => core.process({ type: 'NOTE_OFF', note, timestampMs })
const advance = (core, timestampMs) => core.process({ type: 'TIME_ADVANCE', timestampMs })

test('IJ01', 'constants and physical answer contract are independent and explicit', () => {
  assert.equal(interval.INTERVAL_CAPTURE_WINDOW_MS, 150)
  assert.equal(interval.INTERVAL_SUCCESS_DURATION_MS, 800)
  assert.deepEqual(new interval.IntervalJudgementCore(normalQuestion, 0).snapshot.expectedPitches, [60, 69])
  assert.equal(new interval.IntervalJudgementCore(normalQuestion, 0).snapshot.requiredPhysicalPitchCount, 2)
  assert.deepEqual(new interval.IntervalJudgementCore(unisonQuestion, 0).snapshot.expectedPitches, [60])
  assert.equal(new interval.IntervalJudgementCore(unisonQuestion, 0).snapshot.requiredPhysicalPitchCount, 1)
  assert.equal(diminishedSecondQuestion.intervalType.id, 'diminishedSecond')
  assert.equal(new interval.IntervalJudgementCore(diminishedSecondQuestion, 0).snapshot.requiredPhysicalPitchCount, 1)
})

test('IJ02', 'C then A and A then C both enter SUCCESS inside the capture window', () => {
  const forward = new interval.IntervalJudgementCore(normalQuestion, 0)
  on(forward, 60, 0)
  assert.equal(phase(forward), 'COLLECTING')
  on(forward, 69, 70)
  assert.equal(phase(forward), 'SUCCESS')

  const reverse = new interval.IntervalJudgementCore(normalQuestion, 0)
  on(reverse, 69, 0)
  on(reverse, 60, 60)
  assert.equal(phase(reverse), 'SUCCESS')
})

test('IJ03', 'one isolated pitch is incomplete and released history never completes an answer', () => {
  const rootOnly = new interval.IntervalJudgementCore(normalQuestion, 0)
  on(rootOnly, 60, 0)
  assert.equal(phase(rootOnly), 'COLLECTING')
  assert.notEqual(phase(rootOnly), 'WRONG_WAIT_RELEASE')

  const targetOnly = new interval.IntervalJudgementCore(normalQuestion, 0)
  on(targetOnly, 69, 0)
  assert.equal(phase(targetOnly), 'COLLECTING')

  const released = new interval.IntervalJudgementCore(normalQuestion, 0)
  on(released, 60, 0)
  off(released, 60, 20)
  assert.equal(phase(released), 'READY')
  on(released, 69, 40)
  assert.equal(phase(released), 'COLLECTING')
  assert.deepEqual(released.snapshot.state.collectedPitches, [69])
})

test('IJ04', 'complete wrong pair and extra pitch fail as whole-group answers', () => {
  const wrong = new interval.IntervalJudgementCore(normalQuestion, 0)
  on(wrong, 60, 0)
  const [wrongEvent] = on(wrong, 68, 50)
  assert.equal(phase(wrong), 'WRONG_WAIT_RELEASE')
  assert.deepEqual([wrongEvent.type, wrongEvent.reason], ['QUESTION_WRONG_ATTEMPT', 'WRONG_PITCH_SET'])

  const extra = new interval.IntervalJudgementCore(normalQuestion, 0)
  on(extra, 60, 0)
  on(extra, 69, 60)
  assert.equal(phase(extra), 'SUCCESS')
  const [extraEvent] = on(extra, 64, 100)
  assert.equal(phase(extra), 'WRONG_WAIT_RELEASE')
  assert.deepEqual([extraEvent.type, extraEvent.reason], ['QUESTION_WRONG_ATTEMPT', 'EXTRA_PITCH'])
})

test('IJ05', 'duplicate NOTE_ON is idempotent and does not become an extra pitch', () => {
  const core = new interval.IntervalJudgementCore(normalQuestion, 0)
  on(core, 60, 0)
  on(core, 60, 20)
  assert.deepEqual(core.snapshot.heldPitches, [60])
  assert.deepEqual(core.snapshot.state.collectedPitches, [60])
  on(core, 69, 70)
  assert.equal(phase(core), 'SUCCESS')
})

test('IJ06', 'pure unison succeeds on one physical key and rejects an extra pitch', () => {
  const correct = new interval.IntervalJudgementCore(unisonQuestion, 0)
  on(correct, 60, 0)
  assert.equal(phase(correct), 'SUCCESS')
  assert.deepEqual(correct.snapshot.heldPitches, [60])

  const extra = new interval.IntervalJudgementCore(unisonQuestion, 0)
  on(extra, 60, 0)
  const [event] = on(extra, 64, 80)
  assert.equal(phase(extra), 'WRONG_WAIT_RELEASE')
  assert.equal(event.reason, 'EXTRA_PITCH')

  const wrong = new interval.IntervalJudgementCore(unisonQuestion, 0)
  on(wrong, 64, 0)
  assert.equal(phase(wrong), 'WRONG_WAIT_RELEASE')
})

test('IJ07', 'wrong answer keeps the question and unlocks only after all keys are up', () => {
  const core = new interval.IntervalJudgementCore(normalQuestion, 0)
  const questionId = core.snapshot.questionId
  on(core, 60, 0)
  on(core, 68, 50)
  off(core, 60, 60)
  assert.equal(phase(core), 'WRONG_WAIT_RELEASE')
  assert.deepEqual(core.snapshot.heldPitches, [68])
  off(core, 68, 70)
  assert.equal(phase(core), 'READY')
  assert.equal(core.snapshot.questionId, questionId)
  on(core, 60, 80)
  on(core, 69, 120)
  assert.equal(phase(core), 'SUCCESS')
  assert.equal(core.snapshot.questionId, questionId)
})

test('IJ08', 'capture boundary is inclusive at 150ms and starts a new block at 151ms', () => {
  const at149 = new interval.IntervalJudgementCore(normalQuestion, 0)
  on(at149, 60, 0)
  on(at149, 69, 149)
  assert.equal(phase(at149), 'SUCCESS')

  const at150 = new interval.IntervalJudgementCore(normalQuestion, 0)
  on(at150, 60, 0)
  on(at150, 69, 150)
  assert.equal(phase(at150), 'SUCCESS')

  const at151 = new interval.IntervalJudgementCore(normalQuestion, 0)
  on(at151, 60, 0)
  on(at151, 69, 151)
  assert.equal(phase(at151), 'COLLECTING')
  assert.deepEqual(at151.snapshot.state.collectedPitches, [69])
  assert.deepEqual(at151.snapshot.heldPitches, [60, 69])
})

test('IJ09', 'success feedback lasts 800ms and waits for release before completion', () => {
  const released = new interval.IntervalJudgementCore(normalQuestion, 0)
  on(released, 60, 0)
  on(released, 69, 70)
  off(released, 60, 71)
  off(released, 69, 72)
  assert.deepEqual(advance(released, 869), [])
  const [completed] = advance(released, 870)
  assert.equal(completed.type, 'QUESTION_CORRECT')

  const held = new interval.IntervalJudgementCore(normalQuestion, 0)
  on(held, 60, 0)
  on(held, 69, 70)
  assert.deepEqual(advance(held, 870), [])
  assert.equal(held.snapshot.state.feedbackElapsed, true)
  off(held, 60, 900)
  assert.deepEqual(held.snapshot.settledEvents.filter(({ type }) => type === 'QUESTION_CORRECT'), [])
  const [afterRelease] = off(held, 69, 901)
  assert.equal(afterRelease.type, 'QUESTION_CORRECT')
})

class FakeClock {
  nowValue = 0
  now() { return this.nowValue }
}

class FakeScheduler {
  constructor(clock) { this.clock = clock }
  nextId = 1
  tasks = new Map()
  schedule(callback, delayMs) {
    const id = this.nextId++
    this.tasks.set(id, { callback, deadline: this.clock.now() + delayMs })
    return id
  }
  cancel(id) { this.tasks.delete(id) }
  advanceTo(timestampMs) {
    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.deadline <= timestampMs)
        .sort((left, right) => left[1].deadline - right[1].deadline || left[0] - right[0])[0]
      if (!next) break
      const [id, task] = next
      this.tasks.delete(id)
      this.clock.nowValue = task.deadline
      task.callback()
    }
    this.clock.nowValue = timestampMs
  }
}

function midi(runtime, clock, id, type, midiNumber, timestamp) {
  clock.nowValue = timestamp
  runtime.handleMidi({ id, type, midiNumber, velocity: type === 'noteOn' ? 100 : 0, timestamp })
}

test('IJ10', 'runtime timers advance only after 800ms and held input cannot pollute the next question', () => {
  const clock = new FakeClock()
  const scheduler = new FakeScheduler(clock)
  const nextQuestion = candidate('perfectFifth', 62)
  let runtime
  const completed = []
  runtime = new interval.IntervalPracticeMidiRuntime({
    clock,
    scheduler,
    onQuestionCorrect: (questionId) => {
      completed.push(questionId)
      runtime.ensureQuestion(nextQuestion)
    }
  })
  runtime.activate(normalQuestion)
  midi(runtime, clock, 1, 'noteOn', 60, 0)
  midi(runtime, clock, 2, 'noteOn', 69, 70)
  scheduler.advanceTo(869)
  assert.deepEqual(completed, [])
  scheduler.advanceTo(870)
  assert.deepEqual(completed, [])
  midi(runtime, clock, 3, 'noteOff', 60, 900)
  assert.deepEqual(completed, [])
  midi(runtime, clock, 4, 'noteOff', 69, 901)
  assert.deepEqual(completed, [normalQuestion.questionId])
  assert.equal(runtime.snapshot.judgement.questionId, nextQuestion.questionId)
  assert.equal(runtime.snapshot.judgement.state.phase, 'READY')
  assert.deepEqual(runtime.snapshot.judgement.heldPitches, [])
})

test('IJ11', 'question reset invalidates old timers and transport/unmount boundaries clear input', () => {
  const clock = new FakeClock()
  const scheduler = new FakeScheduler(clock)
  const completed = []
  const runtime = new interval.IntervalPracticeMidiRuntime({ clock, scheduler, onQuestionCorrect: (id) => completed.push(id) })
  runtime.activate(normalQuestion)
  midi(runtime, clock, 1, 'noteOn', 60, 0)
  midi(runtime, clock, 2, 'noteOn', 69, 70)
  clock.nowValue = 100
  runtime.ensureQuestion(unisonQuestion)
  scheduler.advanceTo(1000)
  assert.deepEqual(completed, [])
  assert.equal(runtime.snapshot.judgement.questionId, unisonQuestion.questionId)
  midi(runtime, clock, 3, 'noteOn', 60, 1001)
  assert.equal(runtime.snapshot.judgement.state.phase, 'SUCCESS')
  runtime.resetInputState()
  assert.equal(runtime.snapshot.judgement.state.phase, 'READY')
  assert.deepEqual(runtime.snapshot.judgement.heldPitches, [])
  runtime.setTransportReady(false)
  assert.equal(runtime.snapshot.judgement.state.phase, 'READY')
  midi(runtime, clock, 4, 'noteOn', 60, 1002)
  assert.equal(runtime.snapshot.forwardedMidiEventCount, 3)
  runtime.setTransportReady(true)
  runtime.deactivate()
  midi(runtime, clock, 5, 'noteOn', 60, 1003)
  assert.equal(runtime.snapshot.forwardedMidiEventCount, 3)
  assert.equal(runtime.snapshot.judgement, null)
})

let candidateAudit = null
test('IJ12', 'all candidates accept their unique physical MIDI set with zero invalid judgements', () => {
  const all = Object.values(theory.INTERVAL_PRACTICE_CANDIDATES).flat()
  let normalCandidates = 0
  let unisonCandidates = 0
  let correctSimulations = 0
  let orderReversalTests = 0
  let invalidJudgement = 0

  for (let index = 0; index < all.length; index += 1) {
    const question = scheduled(all[index], `audit-${index}`)
    if (question.rootMidi === question.targetMidi) {
      unisonCandidates += 1
      const core = new interval.IntervalJudgementCore(question, 0)
      on(core, question.rootMidi, 0)
      if (phase(core) !== 'SUCCESS') invalidJudgement += 1
      else correctSimulations += 1
      const wrongNote = question.rootMidi === 127 ? 126 : question.rootMidi + 1
      const wrong = new interval.IntervalJudgementCore(question, 0)
      on(wrong, wrongNote, 0)
      if (phase(wrong) !== 'WRONG_WAIT_RELEASE') invalidJudgement += 1
      continue
    }

    normalCandidates += 1
    const forward = new interval.IntervalJudgementCore(question, 0)
    on(forward, question.rootMidi, 0)
    on(forward, question.targetMidi, 70)
    if (phase(forward) !== 'SUCCESS') invalidJudgement += 1
    else correctSimulations += 1

    const reverse = new interval.IntervalJudgementCore(question, 0)
    on(reverse, question.targetMidi, 0)
    on(reverse, question.rootMidi, 70)
    orderReversalTests += 1
    if (phase(reverse) !== 'SUCCESS') invalidJudgement += 1
    else correctSimulations += 1

    let wrongNote = question.rootMidi + 1
    while (wrongNote === question.targetMidi || wrongNote > 127) wrongNote = wrongNote > 127 ? 0 : wrongNote + 1
    const wrong = new interval.IntervalJudgementCore(question, 0)
    on(wrong, question.rootMidi, 0)
    on(wrong, wrongNote, 70)
    if (phase(wrong) !== 'WRONG_WAIT_RELEASE') invalidJudgement += 1
  }

  assert.equal(all.length, 1575)
  assert.ok(unisonCandidates > theory.INTERVAL_PRACTICE_CANDIDATES.perfectUnison.length)
  assert.equal(unisonCandidates + normalCandidates, all.length)
  assert.equal(correctSimulations, unisonCandidates + normalCandidates * 2)
  assert.equal(orderReversalTests, normalCandidates)
  assert.equal(invalidJudgement, 0)
  candidateAudit = { candidateTotal: all.length, normalCandidates, unisonCandidates, correctSimulations, orderReversalTests, invalidJudgement }
})

test('IJ13', 'enharmonic spelling stays outside physical MIDI judgement', () => {
  const augmented = theory.INTERVAL_PRACTICE_CANDIDATES.augmentedFourth.find(({ rootMidi }) => rootMidi === 60)
  const diminished = theory.INTERVAL_PRACTICE_CANDIDATES.diminishedFifth.find(({ rootMidi }) => rootMidi === 60)
  assert.ok(augmented && diminished)
  assert.equal(augmented.targetMidi, diminished.targetMidi)
  const sharpCore = new interval.IntervalJudgementCore(scheduled(augmented, 'sharp'), 0)
  const flatCore = new interval.IntervalJudgementCore(scheduled(diminished, 'flat'), 0)
  assert.deepEqual(sharpCore.snapshot.expectedPitches, flatCore.snapshot.expectedPitches)
})

test('IJ14', 'ACTIVE page binds one shared-router subscription while simulator controls stay in the QA dock', () => {
  const mainSource = fs.readFileSync(require.resolve('../prototype/android-tablet-v1/src/main.tsx'), 'utf8')
  const screenStart = mainSource.indexOf('function IntervalPracticeActiveScreen(')
  const screenEnd = mainSource.indexOf('\nfunction ', screenStart + 1)
  const dockStart = mainSource.indexOf('function ReviewDock(')
  const dockEnd = mainSource.indexOf('\nfunction ', dockStart + 1)
  assert.ok(screenStart >= 0 && screenEnd > screenStart)
  assert.ok(dockStart >= 0 && dockEnd > dockStart)
  const screenSource = mainSource.slice(screenStart, screenEnd)
  const dockSource = mainSource.slice(dockStart, dockEnd)

  assert.match(screenSource, /midiRuntime\.midiRouter\.subscribe/)
  assert.match(screenSource, /return unsubscribe/)
  assert.match(screenSource, /runtime\.setTransportReady\(transportReady\)/)
  assert.match(screenSource, /runtime\.resetInputState\(\)/)
  assert.match(screenSource, /feedback=\{notationFeedback\}/)
  assert.doesNotMatch(screenSource, /目标 MIDI|NOTE ON|NOTE OFF|模拟 MIDI 音高|interval-midi-development|sendMidi\(|sendVelocityZero\(/)
  assert.match(dockSource, /开发模拟 MIDI/)
  assert.match(dockSource, /runtime\.sendMidi\(Number\(midiNumber\)\)/)
  assert.doesNotMatch(screenSource, /ReportRepository|PersistenceCoordinator|\.save\(|\.finalize\(/)
  assert.doesNotMatch(screenSource, /rootFeedback|targetFeedback|perNote/)
})

let passed = 0
for (const { id, title, callback } of tests) {
  try {
    callback()
    passed += 1
    process.stdout.write(`PASS ${id} ${title}\n`)
  } catch (error) {
    process.stderr.write(`FAIL ${id} ${title}\n${error.stack || error}\n`)
  }
}

if (candidateAudit) {
  process.stdout.write(`\nCANDIDATE_TOTAL=${candidateAudit.candidateTotal}\n`)
  process.stdout.write(`UNIQUE_PHYSICAL_1_COUNT=${candidateAudit.unisonCandidates}\n`)
  process.stdout.write(`UNIQUE_PHYSICAL_2_COUNT=${candidateAudit.normalCandidates}\n`)
  process.stdout.write(`CORRECT_SIMULATIONS=${candidateAudit.correctSimulations}\n`)
  process.stdout.write(`ORDER_REVERSAL_TESTS=${candidateAudit.orderReversalTests}\n`)
  process.stdout.write(`INVALID_JUDGEMENT=${candidateAudit.invalidJudgement}\n`)
}
process.stdout.write(`${passed}/${tests.length} Android Interval Judgement contract groups PASS\n`)
if (passed !== tests.length) process.exitCode = 1
