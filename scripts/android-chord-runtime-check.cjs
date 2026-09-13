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

const root = path.resolve(__dirname, '..')
const { ChordPracticeRuntime } = require('../prototype/android-tablet-v1/src/chordPractice/runtime/index.ts')
const { isSameChordPracticeQuestionIdentity } = require('../prototype/android-tablet-v1/src/musicTheory/chords/index.ts')
const {
  CHORD_BLOCK_CAPTURE_CONTRACT,
  CHORD_QUESTION_SUCCESS_FEEDBACK_MS
} = require('../prototype/android-tablet-v1/src/musicTheory/chords/productContract.ts')

class FakeTime {
  constructor(now = 0) {
    this.nowValue = now
    this.nextId = 0
    this.jobs = new Map()
  }

  now = () => this.nowValue

  schedule = (callback, delayMs) => {
    const id = ++this.nextId
    this.jobs.set(id, { active: true, at: this.nowValue + Math.max(0, delayMs), callback })
    return id
  }

  cancel = (id) => {
    const job = this.jobs.get(id)
    if (job) job.active = false
  }

  set(timestampMs) {
    assert.ok(timestampMs >= this.nowValue, `test clock cannot move backward: ${timestampMs} < ${this.nowValue}`)
    this.nowValue = timestampMs
  }

  advanceTo(timestampMs) {
    assert.ok(timestampMs >= this.nowValue)
    while (true) {
      const next = [...this.jobs.entries()]
        .filter(([, job]) => job.active && job.at <= timestampMs)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0]
      if (!next) break
      const [, job] = next
      job.active = false
      this.nowValue = job.at
      job.callback()
    }
    this.nowValue = timestampMs
  }

  activeJobs() {
    return [...this.jobs.entries()].filter(([, job]) => job.active)
  }

  latestJobId() {
    return this.nextId
  }

  force(id) {
    const job = this.jobs.get(id)
    assert.ok(job, `missing archived job ${id}`)
    job.callback()
  }
}

function constantRng(value = 0.1) {
  return () => value
}

function makeRuntime(rng = constantRng()) {
  const time = new FakeTime()
  const runtime = new ChordPracticeRuntime({ clock: time, scheduler: time, rng })
  runtime.start(20)
  return { runtime, time }
}

function emit(runtime, time, id, type, timestamp, midiNumber, velocity = type === 'noteOn' ? 100 : 0) {
  time.set(timestamp)
  runtime.handleMidi({ id, type, timestamp, midiNumber, velocity })
}

function phase(runtime) {
  return runtime.snapshot.judgement.state.phase
}

function targets(runtime) {
  const target = runtime.snapshot.judgement.target
  return { arpeggio: [...target.arpeggioMidi], block: [...target.blockMidi] }
}

function playArpeggio(runtime, time, start = 10, idStart = 1) {
  const notes = targets(runtime).arpeggio
  let id = idStart
  notes.forEach((note, index) => {
    emit(runtime, time, id++, 'noteOn', start + index * 10, note)
    emit(runtime, time, id++, 'noteOff', start + index * 10 + 1, note)
  })
  assert.equal(phase(runtime), 'BLOCK_READY')
  return { id, lastTimestamp: start + (notes.length - 1) * 10 + 1 }
}

function playBlockAndRelease(runtime, time, start = 100, idStart = 20, sameTimestamp = false) {
  const notes = targets(runtime).block
  let id = idStart
  notes.forEach((note, index) => emit(runtime, time, id++, 'noteOn', start + (sameTimestamp ? 0 : index * 5), note))
  const close = start + CHORD_BLOCK_CAPTURE_CONTRACT.captureWindowMs
  time.advanceTo(close)
  assert.equal(phase(runtime), 'WAIT_ALL_KEYS_UP_AFTER_BLOCK')
  notes.forEach((note, index) => emit(runtime, time, id++, 'noteOff', close + 1 + index, note))
  assert.equal(phase(runtime), 'QUESTION_COMPLETE')
  return { id, completedAt: close + notes.length }
}

function completeQuestion(runtime, time, options = {}) {
  const arpeggio = playArpeggio(runtime, time, options.arpeggioStart ?? 10, options.idStart ?? 1)
  return playBlockAndRelease(runtime, time, options.blockStart ?? arpeggio.lastTimestamp + 20, arpeggio.id, options.sameTimestamp ?? false)
}

const tests = []
const test = (id, title, callback) => tests.push({ id, title, callback })

test('CRT01', 'live triad completes Arpeggio, release, Block, release, 800ms, next question', () => {
  const { runtime, time } = makeRuntime(constantRng(0.1))
  assert.equal(runtime.snapshot.question.family, 'triad')
  const firstGeneration = runtime.snapshot.questionGeneration
  const { completedAt } = completeQuestion(runtime, time)
  assert.equal(runtime.snapshot.status, 'SUCCESS_FEEDBACK')
  time.advanceTo(completedAt + 799)
  assert.equal(runtime.snapshot.questionGeneration, firstGeneration)
  time.advanceTo(completedAt + 800)
  assert.equal(runtime.snapshot.questionGeneration, firstGeneration + 1)
  assert.equal(runtime.snapshot.status, 'RUNNING')
})

test('CRT02', 'live seventh happy path preserves all four pitches', () => {
  const { runtime, time } = makeRuntime(constantRng(0.75))
  assert.equal(runtime.snapshot.question.family, 'seventh')
  assert.equal(targets(runtime).block.length, 4)
  completeQuestion(runtime, time, { sameTimestamp: true })
  assert.equal(runtime.snapshot.counters.completedQuestions, 1)
})

test('CRT03', 'wrong Arpeggio restarts the exact same question after release', () => {
  const { runtime, time } = makeRuntime()
  const identity = runtime.snapshot.questionIdentity
  const wrong = targets(runtime).arpeggio[0] + 1
  emit(runtime, time, 1, 'noteOn', 10, wrong)
  assert.equal(phase(runtime), 'ARPEGGIO_WRONG_WAIT_RELEASE')
  emit(runtime, time, 2, 'noteOff', 11, wrong)
  assert.equal(phase(runtime), 'ARPEGGIO_READY')
  assert.deepEqual(runtime.snapshot.questionIdentity, identity)
  assert.equal(runtime.snapshot.questionGeneration, 1)
})

test('CRT04', 'wrong Block restarts the exact same question from Arpeggio', () => {
  const { runtime, time } = makeRuntime()
  const identity = runtime.snapshot.questionIdentity
  const { id, lastTimestamp } = playArpeggio(runtime, time)
  const wrong = targets(runtime).block.at(-1) + 1
  emit(runtime, time, id, 'noteOn', lastTimestamp + 10, wrong)
  assert.equal(phase(runtime), 'BLOCK_WRONG_WAIT_RELEASE')
  emit(runtime, time, id + 1, 'noteOff', lastTimestamp + 11, wrong)
  assert.equal(phase(runtime), 'ARPEGGIO_READY')
  assert.deepEqual(runtime.snapshot.questionIdentity, identity)
})

test('CRT05', 'same-timestamp triad NOTE_ON events are all forwarded in source order', () => {
  const { runtime, time } = makeRuntime()
  const { id, lastTimestamp } = playArpeggio(runtime, time)
  const before = runtime.snapshot.forwardedMidiEventCount
  targets(runtime).block.forEach((note, index) => emit(runtime, time, id + index, 'noteOn', lastTimestamp + 20, note))
  assert.equal(runtime.snapshot.forwardedMidiEventCount - before, 3)
  assert.equal(runtime.snapshot.judgement.state.capturedTargetNotes.length, 3)
})

test('CRT06', 'same-timestamp seventh NOTE_ON events are all preserved', () => {
  const { runtime, time } = makeRuntime(constantRng(0.75))
  const { id, lastTimestamp } = playArpeggio(runtime, time)
  const before = runtime.snapshot.forwardedMidiEventCount
  targets(runtime).block.forEach((note, index) => emit(runtime, time, id + index, 'noteOn', lastTimestamp + 20, note))
  assert.equal(runtime.snapshot.forwardedMidiEventCount - before, 4)
  assert.equal(runtime.snapshot.judgement.state.capturedTargetNotes.length, 4)
})

test('CRT07', 'all Block targets arriving early do not complete before capture close', () => {
  const { runtime, time } = makeRuntime()
  const { id, lastTimestamp } = playArpeggio(runtime, time)
  targets(runtime).block.forEach((note, index) => emit(runtime, time, id + index, 'noteOn', lastTimestamp + 20 + index, note))
  assert.equal(phase(runtime), 'BLOCK_CAPTURE')
  assert.equal(runtime.snapshot.counters.completedQuestions, 0)
})

test('CRT08', 'trailing non-target Block NOTE_ON before 150ms is immediate Wrong', () => {
  const { runtime, time } = makeRuntime()
  const { id, lastTimestamp } = playArpeggio(runtime, time)
  emit(runtime, time, id, 'noteOn', lastTimestamp + 20, targets(runtime).block[0])
  emit(runtime, time, id + 1, 'noteOn', lastTimestamp + 30, 1)
  assert.equal(phase(runtime), 'BLOCK_WRONG_WAIT_RELEASE')
  assert.equal(runtime.snapshot.counters.blockErrors, 1)
})

test('CRT09', 'Runtime wake-up closes an incomplete Block at the core deadline', () => {
  const { runtime, time } = makeRuntime()
  const { id, lastTimestamp } = playArpeggio(runtime, time)
  const start = lastTimestamp + 20
  emit(runtime, time, id, 'noteOn', start, targets(runtime).block[0])
  time.advanceTo(start + 149)
  assert.equal(phase(runtime), 'BLOCK_CAPTURE')
  time.advanceTo(start + 150)
  assert.equal(phase(runtime), 'BLOCK_WRONG_WAIT_RELEASE')
})

test('CRT10', 'canceled capture callback after Wrong is stale and harmless', () => {
  const { runtime, time } = makeRuntime()
  const { id, lastTimestamp } = playArpeggio(runtime, time)
  emit(runtime, time, id, 'noteOn', lastTimestamp + 20, targets(runtime).block[0])
  const staleTimer = time.latestJobId()
  emit(runtime, time, id + 1, 'noteOn', lastTimestamp + 30, 1)
  const before = runtime.snapshot.counters.blockErrors
  time.force(staleTimer)
  assert.equal(runtime.snapshot.counters.blockErrors, before)
  assert.equal(phase(runtime), 'BLOCK_WRONG_WAIT_RELEASE')
})

test('CRT11', 'capture callback from Question N cannot mutate Question N+1', () => {
  const { runtime, time } = makeRuntime()
  const { id, lastTimestamp } = playArpeggio(runtime, time)
  const start = lastTimestamp + 20
  targets(runtime).block.forEach((note, index) => emit(runtime, time, id + index, 'noteOn', start + index, note))
  const staleTimer = time.latestJobId()
  time.advanceTo(start + 150)
  targets(runtime).block.forEach((note, index) => emit(runtime, time, id + 10 + index, 'noteOff', start + 151 + index, note))
  const completedAt = start + 150 + targets(runtime).block.length
  time.advanceTo(completedAt + 800)
  const generation = runtime.snapshot.questionGeneration
  time.force(staleTimer)
  assert.equal(runtime.snapshot.questionGeneration, generation)
  assert.equal(runtime.snapshot.status, 'RUNNING')
})

test('CRT12', 'disconnect with a held key suspends, resets input and does not score Wrong', () => {
  const { runtime, time } = makeRuntime()
  emit(runtime, time, 1, 'noteOn', 10, targets(runtime).arpeggio[0])
  time.set(20)
  runtime.handleTransportLost(20)
  assert.equal(runtime.snapshot.status, 'SUSPENDED')
  assert.equal(runtime.snapshot.judgement.heldNotes.length, 0)
  assert.equal(runtime.snapshot.counters.totalErrors, 0)
  assert.equal(runtime.snapshot.questionGeneration, 1)
})

test('CRT13', 'reconnect restores transport only and never auto-resumes', () => {
  const { runtime, time } = makeRuntime()
  time.set(10); runtime.handleTransportLost(10)
  runtime.handleTransportReady()
  assert.equal(runtime.snapshot.status, 'SUSPENDED')
  assert.equal(runtime.snapshot.resumeRequired, true)
})

test('CRT14', 'explicit Resume restores interrupted Arpeggio to READY', () => {
  const { runtime, time } = makeRuntime()
  emit(runtime, time, 1, 'noteOn', 10, targets(runtime).arpeggio[0])
  time.set(20); runtime.handleTransportLost(20)
  runtime.handleTransportReady()
  time.set(30); runtime.resume(30)
  assert.equal(runtime.snapshot.status, 'RUNNING')
  assert.equal(phase(runtime), 'ARPEGGIO_READY')
})

test('CRT15', 'explicit Resume restores settled Arpeggio to BLOCK_READY', () => {
  const { runtime, time } = makeRuntime()
  const { lastTimestamp } = playArpeggio(runtime, time)
  time.set(lastTimestamp + 10); runtime.handleTransportLost(lastTimestamp + 10)
  runtime.handleTransportReady()
  time.set(lastTimestamp + 20); runtime.resume(lastTimestamp + 20)
  assert.equal(phase(runtime), 'BLOCK_READY')
})

test('CRT16', 'background during Arpeggio cancels attempt without an error', () => {
  const { runtime, time } = makeRuntime()
  emit(runtime, time, 1, 'noteOn', 10, targets(runtime).arpeggio[0])
  time.set(20); runtime.pause('background', 20)
  assert.equal(runtime.snapshot.status, 'SUSPENDED')
  assert.equal(runtime.snapshot.counters.totalErrors, 0)
})

test('CRT17', 'background during Block capture cancels timer without an error', () => {
  const { runtime, time } = makeRuntime()
  const { id, lastTimestamp } = playArpeggio(runtime, time)
  emit(runtime, time, id, 'noteOn', lastTimestamp + 20, targets(runtime).block[0])
  const stale = time.latestJobId()
  time.set(lastTimestamp + 30); runtime.pause('background', lastTimestamp + 30)
  time.force(stale)
  assert.equal(runtime.snapshot.counters.totalErrors, 0)
  assert.equal(runtime.snapshot.status, 'SUSPENDED')
})

test('CRT18', 'manual pause retains key continuity and release permits explicit Resume', () => {
  const { runtime, time } = makeRuntime()
  const note = targets(runtime).arpeggio[0]
  emit(runtime, time, 1, 'noteOn', 10, note)
  time.set(20); runtime.pause('manual-pause', 20)
  emit(runtime, time, 2, 'noteOff', 30, note)
  time.set(40); runtime.resume(40)
  assert.equal(runtime.snapshot.status, 'RUNNING')
  assert.equal(phase(runtime), 'ARPEGGIO_READY')
})

test('CRT19', 'CC64 is forwarded but has no answer or release-gate effect', () => {
  const { runtime, time } = makeRuntime()
  emit(runtime, time, 1, 'controlChange', 10, 64, 127)
  assert.equal(phase(runtime), 'ARPEGGIO_READY')
  assert.equal(runtime.snapshot.forwardedMidiEventCount, 1)
})

test('CRT20', 'Runtime does not duplicate upstream velocity-zero normalization', () => {
  const { runtime, time } = makeRuntime()
  emit(runtime, time, 1, 'noteOn', 10, targets(runtime).arpeggio[0], 0)
  assert.equal(phase(runtime), 'ARPEGGIO_ACTIVE')
  const source = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/chordPractice/runtime/core.ts'), 'utf8')
  assert.doesNotMatch(source, /velocity\s*===\s*0|normalizeSightReadingMidiEvent/)
})

test('CRT21', 'same timestamp and same pitch events are not locally deduplicated', () => {
  const { runtime, time } = makeRuntime()
  const note = targets(runtime).arpeggio[0]
  emit(runtime, time, 100, 'noteOn', 10, note)
  emit(runtime, time, 101, 'noteOn', 10, note)
  assert.equal(runtime.snapshot.forwardedMidiEventCount, 2)
  assert.equal(runtime.snapshot.lastNormalizedEvent.id, 101)
})

test('CRT22', '800ms feedback blocks next-question creation through 799ms', () => {
  const { runtime, time } = makeRuntime()
  const { completedAt } = completeQuestion(runtime, time)
  const generation = runtime.snapshot.questionGeneration
  time.advanceTo(completedAt + CHORD_QUESTION_SUCCESS_FEEDBACK_MS - 1)
  assert.equal(runtime.snapshot.questionGeneration, generation)
  assert.equal(runtime.snapshot.status, 'SUCCESS_FEEDBACK')
})

test('CRT23', 'input during success feedback cannot answer the next question', () => {
  const { runtime, time } = makeRuntime()
  const { id, completedAt } = completeQuestion(runtime, time)
  emit(runtime, time, id, 'noteOn', completedAt + 100, 60)
  emit(runtime, time, id + 1, 'noteOff', completedAt + 101, 60)
  time.advanceTo(completedAt + 800)
  assert.equal(phase(runtime), 'ARPEGGIO_READY')
  assert.equal(runtime.snapshot.judgement.facts.timing.questionStartLatencyMs, null)
})

test('CRT24', 'a key held through 800ms delays arming until physical release', () => {
  const { runtime, time } = makeRuntime()
  const { id, completedAt } = completeQuestion(runtime, time)
  emit(runtime, time, id, 'noteOn', completedAt + 100, 60)
  const generation = runtime.snapshot.questionGeneration
  time.advanceTo(completedAt + 800)
  assert.equal(runtime.snapshot.waitingForInterQuestionRelease, true)
  assert.equal(runtime.snapshot.questionGeneration, generation)
  emit(runtime, time, id + 1, 'noteOff', completedAt + 900, 60)
  assert.equal(runtime.snapshot.questionGeneration, generation + 1)
})

test('CRT25', 'new question start latency begins only when that question is armed READY', () => {
  const { runtime, time } = makeRuntime()
  const { id, completedAt } = completeQuestion(runtime, time)
  time.advanceTo(completedAt + 800)
  const firstTarget = targets(runtime).arpeggio[0]
  emit(runtime, time, id + 1, 'noteOn', completedAt + 900, firstTarget)
  assert.equal(runtime.snapshot.judgement.facts.timing.questionStartLatencyMs, 100)
})

test('CRT26', 'generator anti-repeat identity excludes Root + Quality + Inversion adjacency', () => {
  const { runtime, time } = makeRuntime(constantRng(0.1))
  const first = runtime.snapshot.questionIdentity
  const { completedAt } = completeQuestion(runtime, time)
  time.advanceTo(completedAt + 800)
  const second = runtime.snapshot.questionIdentity
  assert.equal(isSameChordPracticeQuestionIdentity(first, second), false)
})

test('CRT27', 'all Wrong retries retain one immutable question and generation', () => {
  const { runtime, time } = makeRuntime()
  const question = runtime.snapshot.question
  const wrong = targets(runtime).arpeggio[0] + 1
  for (let attempt = 0; attempt < 3; attempt += 1) {
    emit(runtime, time, attempt * 2 + 1, 'noteOn', 10 + attempt * 10, wrong)
    emit(runtime, time, attempt * 2 + 2, 'noteOff', 11 + attempt * 10, wrong)
  }
  assert.equal(runtime.snapshot.question, question)
  assert.equal(runtime.snapshot.questionGeneration, 1)
})

test('CRT28', 'success counters settle exactly once and capture timing facts from Judgement', () => {
  const { runtime, time } = makeRuntime()
  const { completedAt } = completeQuestion(runtime, time)
  assert.deepEqual(
    [runtime.snapshot.counters.completedQuestions, runtime.snapshot.counters.firstPassCompletedQuestions, runtime.snapshot.timingSamples.length],
    [1, 1, 1]
  )
  const staleSuccess = time.latestJobId()
  time.advanceTo(completedAt + 800)
  time.force(staleSuccess)
  assert.equal(runtime.snapshot.counters.completedQuestions, 1)
})

test('CRT29', 'Stop discards the incomplete question without fabricating Wrong or persistence', () => {
  const { runtime, time } = makeRuntime()
  emit(runtime, time, 1, 'noteOn', 10, targets(runtime).arpeggio[0])
  time.set(20); runtime.stop(20)
  assert.equal(runtime.snapshot.status, 'STOPPED')
  assert.equal(runtime.snapshot.counters.completedQuestions, 0)
  assert.equal(runtime.snapshot.counters.totalErrors, 0)
})

test('CRT30', 'logical MIDI timestamps, not wall-clock or array indexes, drive timing', () => {
  const { runtime, time } = makeRuntime()
  time.set(500)
  const note = targets(runtime).arpeggio[0]
  runtime.handleMidi({ id: 9999, type: 'noteOn', timestamp: 1234, midiNumber: note, velocity: 100 })
  assert.equal(runtime.snapshot.judgement.facts.timing.questionStartLatencyMs, 1234)
  const source = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/chordPractice/runtime/core.ts'), 'utf8')
  assert.doesNotMatch(source, /Date\.now|new Date|timestamp.*dedup/i)
})

test('CRT31', 'success feedback uses the named 800ms product contract', () => {
  assert.equal(CHORD_QUESTION_SUCCESS_FEEDBACK_MS, 800)
  const contract = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/musicTheory/chords/productContract.ts'), 'utf8')
  const runtime = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/chordPractice/runtime/core.ts'), 'utf8')
  assert.match(contract, /CHORD_QUESTION_SUCCESS_FEEDBACK_MS = 800/)
  assert.match(runtime, /CHORD_QUESTION_SUCCESS_FEEDBACK_MS/)
  assert.doesNotMatch(runtime, /scheduleSuccessFeedback\([^\n]+,\s*800\)/)
})

test('CRT32', 'capture duration is read from Judgement state, never rederived as a Runtime literal', () => {
  const runtimeSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/chordPractice/runtime/core.ts'), 'utf8')
  assert.match(runtimeSource, /state\.captureCloseTimestampMs/)
  assert.doesNotMatch(runtimeSource, /captureWindowMs|\+\s*150/)
})

test('CRT33', 'normalized router observation preserves primary sink and exact event identity', () => {
  const { AndroidMidiInputRouter } = require('../prototype/android-tablet-v1/src/androidBluetoothMidiCore.ts')
  const sink = []
  const observed = []
  let now = 77
  const router = new AndroidMidiInputRouter({ now: () => now }, (event) => sink.push(event), 'bluetooth')
  const unsubscribe = router.subscribe((event) => observed.push(event))
  router.emit('bluetooth', { type: 'noteOn', midiNumber: 60, velocity: 100, channel: 0, status: 0x90 })
  router.emit('bluetooth', { type: 'noteOn', midiNumber: 64, velocity: 100, channel: 0, status: 0x90 })
  unsubscribe()
  now = 78
  router.emit('bluetooth', { type: 'noteOn', midiNumber: 67, velocity: 100, channel: 0, status: 0x90 })
  assert.deepEqual(sink.map((event) => event.id), [1, 2, 3])
  assert.deepEqual(observed.map((event) => [event.id, event.timestamp]), [[1, 77], [2, 77]])
})

test('CRT34', 'finite question count exposes SESSION_COMPLETE without creating a report', () => {
  const { runtime, time } = makeRuntime()
  runtime.start(10)
  for (let index = 0; index < 10; index += 1) {
    const base = index * 2_000
    const { completedAt } = completeQuestion(runtime, time, {
      arpeggioStart: base + 10,
      blockStart: base + 100,
      idStart: index * 100 + 1,
      sameTimestamp: true
    })
    time.advanceTo(completedAt + 800)
  }
  assert.equal(runtime.snapshot.status, 'SESSION_COMPLETE')
  assert.equal(runtime.snapshot.counters.completedQuestions, 10)
  assert.equal('report' in runtime.snapshot, false)
})

test('CRT35', 'pause freezes success-feedback remainder and invalidates its stale callback', () => {
  const { runtime, time } = makeRuntime()
  const { completedAt } = completeQuestion(runtime, time)
  const generation = runtime.snapshot.questionGeneration
  const staleTimer = time.latestJobId()
  time.advanceTo(completedAt + 300)
  runtime.pause('background', completedAt + 300)
  time.force(staleTimer)
  assert.equal(runtime.snapshot.questionGeneration, generation)
  time.set(completedAt + 500)
  runtime.resume(completedAt + 500)
  time.advanceTo(completedAt + 999)
  assert.equal(runtime.snapshot.questionGeneration, generation)
  time.advanceTo(completedAt + 1_000)
  assert.equal(runtime.snapshot.questionGeneration, generation + 1)
})

let failed = 0
for (const item of tests) {
  try {
    item.callback()
    console.log(`PASS ${item.id} ${item.title}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${item.id} ${item.title}`)
    console.error(error.stack || error)
  }
}
console.log(`\n${tests.length - failed}/${tests.length} Android Chord V1 runtime checks PASS`)
if (failed > 0) process.exitCode = 1
