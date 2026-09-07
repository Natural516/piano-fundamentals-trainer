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
  AndroidSightReadingRuntime,
  formatReactionTime,
  getPrimaryErrorNote
} = require('../prototype/android-tablet-v1/src/sightReadingIntegration.ts')
const { ANDROID_SIGHT_READING_DEFAULTS } = require('../src/sightReading/sightReadingSettings.ts')
const { getMajorKeySignature } = require('../src/sightReading/musicKeySignatures.ts')

function fakeTime() {
  let now = 1000
  let sequence = 0
  const jobs = new Map()
  return {
    now: () => now,
    schedule(callback, delayMs) {
      const id = ++sequence
      jobs.set(id, { at: now + Math.max(0, delayMs), callback })
      return id
    },
    cancel: (id) => jobs.delete(id),
    advance(ms) {
      const until = now + ms
      let turns = 0
      while (true) {
        const next = [...jobs.entries()]
          .filter(([, job]) => job.at <= until)
          .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0]
        if (!next) break
        assert.ok(++turns < 10000, 'timer sequence must remain bounded')
        jobs.delete(next[0])
        now = next[1].at
        next[1].callback()
      }
      now = until
    },
    pending: () => jobs.size
  }
}

function createRuntime(random = () => 0.42) {
  const time = fakeTime()
  const runtime = new AndroidSightReadingRuntime({ clock: time, scheduler: time, random })
  return { runtime, time }
}

function unlock(runtime, time) {
  time.advance(32)
  assert.equal(runtime.snapshot.phase, 'answering')
}

function answerCorrect(runtime, time, reactionMs = 0) {
  unlock(runtime, time)
  time.advance(reactionMs)
  const event = runtime.sendCorrect()
  assert.equal(event.type, 'noteOn')
  assert.ok(event.velocity > 0)
  time.advance(350)
}

const tests = []
const test = (name, callback) => tests.push({ name, callback })

test('I01 Android defaults reach the real shared controller', () => {
  const { runtime } = createRuntime()
  assert.deepEqual(runtime.settings, ANDROID_SIGHT_READING_DEFAULTS)
  runtime.start()
  assert.equal(runtime.uiState, 'active')
  assert.equal(runtime.snapshot.currentNote.clef, runtime.snapshot.currentNote.midiNumber >= 60 ? 'treble' : 'bass')
  assert.equal(runtime.snapshot.report, null)
})

test('I02 in-memory settings affect the next generated session', async () => {
  for (const staffMode of ['treble', 'bass', 'grand']) {
    const { runtime } = createRuntime(() => 0)
    assert.deepEqual(await runtime.updateSettings({
      staffMode,
      keySignature: 'Cb',
      notePoolMode: 'chromatic',
      questionCount: 10,
      noteNameVisible: true
    }), { success: true })
    runtime.start()
    const note = runtime.snapshot.currentNote
    const [low, high] = { treble: [60, 88], bass: [36, 64], grand: [36, 88] }[staffMode]
    assert.ok(note.midiNumber >= low && note.midiNumber <= high)
    assert.equal(runtime.settings.keySignature, 'Cb')
    assert.equal(note.clef, staffMode === 'grand' ? (note.midiNumber >= 60 ? 'treble' : 'bass') : staffMode)
    assert.equal(runtime.settings.questionCount, 10)
    assert.equal(runtime.settings.noteNameVisible, true)
    assert.equal(getMajorKeySignature(runtime.settings.keySignature).displayName, 'C♭ 大调')
    assert.equal((await runtime.updateSettings({ questionCount: 100 })).success, false)
  }
})

test('I03 simulated correct event enters normalized MIDI and produces CORRECT UI', () => {
  const { runtime, time } = createRuntime()
  runtime.start(); unlock(runtime, time)
  const target = runtime.snapshot.currentNote.midiNumber
  const event = runtime.sendCorrect()
  assert.equal(event.midiNumber, target)
  assert.equal(event.id, 1)
  assert.equal(event.timestamp, time.now())
  assert.equal(runtime.midi.events()[0], event)
  assert.equal(runtime.uiState, 'correct')
  assert.deepEqual([runtime.snapshot.completedQuestions, runtime.snapshot.correctCount], [1, 1])
})

test('I04 simulated wrong and exact MIDI events produce WRONG from first valid noteOn', () => {
  const { runtime, time } = createRuntime()
  runtime.start(); unlock(runtime, time)
  const target = runtime.snapshot.currentNote.midiNumber
  const wrong = runtime.sendWrong()
  assert.notEqual(wrong.midiNumber, target)
  runtime.sendMidi(target)
  assert.equal(runtime.uiState, 'wrong')
  assert.deepEqual([runtime.snapshot.wrongCount, runtime.snapshot.correctCount], [1, 0])
  assert.deepEqual(runtime.midi.events().map((event) => event.id), [1, 2])
})

test('I05 velocity-zero noteOn normalizes to noteOff and never bypasses judgement', () => {
  const { runtime, time } = createRuntime()
  runtime.start(); unlock(runtime, time)
  const event = runtime.sendVelocityZero(runtime.snapshot.currentNote.midiNumber)
  assert.equal(event.type, 'noteOff')
  assert.equal(runtime.snapshot.completedQuestions, 0)
  runtime.sendCorrect()
  assert.equal(runtime.snapshot.correctCount, 1)
})

test('I06 real shared timer produces TIMEOUT then advances after 350ms', () => {
  const { runtime, time } = createRuntime()
  runtime.start(); time.advance(5031)
  assert.equal(runtime.uiState, 'active')
  time.advance(1)
  assert.equal(runtime.uiState, 'timeout')
  assert.deepEqual([runtime.snapshot.completedQuestions, runtime.snapshot.timeoutCount], [1, 1])
  time.advance(349); assert.equal(runtime.uiState, 'timeout')
  time.advance(1); assert.equal(runtime.uiState, 'active')
})

test('I07 active metrics mirror controller facts across correct, wrong and timeout', () => {
  const { runtime, time } = createRuntime()
  runtime.start(); answerCorrect(runtime, time, 100)
  unlock(runtime, time); time.advance(400); runtime.sendWrong(); time.advance(350)
  time.advance(32 + 5000 + 350)
  assert.deepEqual({
    completed: runtime.snapshot.completedQuestions,
    correct: runtime.snapshot.correctCount,
    wrong: runtime.snapshot.wrongCount,
    timeout: runtime.snapshot.timeoutCount,
    streak: runtime.snapshot.currentStreak,
    accuracy: runtime.snapshot.accuracy
  }, { completed: 3, correct: 1, wrong: 1, timeout: 1, streak: 0, accuracy: 33 })
})

test('I08 explicit pause/resume uses real display, answer and feedback timing', () => {
  const display = createRuntime(); display.runtime.start(); display.time.advance(10)
  display.runtime.pause(); display.time.advance(9000); display.runtime.resume(); display.time.advance(31)
  display.runtime.sendCorrect(); assert.equal(display.runtime.snapshot.completedQuestions, 0)
  display.time.advance(1); display.runtime.sendCorrect(); assert.equal(display.runtime.snapshot.correctCount, 1)

  const answer = createRuntime(); answer.runtime.start(); answer.time.advance(1032)
  answer.runtime.pause(); answer.time.advance(9000); assert.equal(answer.runtime.getRemainingTimeMs(), 4000)
  answer.runtime.resume(); answer.time.advance(3999); assert.equal(answer.runtime.uiState, 'active')
  answer.time.advance(1); assert.equal(answer.runtime.uiState, 'timeout')

  const feedback = createRuntime(); feedback.runtime.start(); unlock(feedback.runtime, feedback.time)
  feedback.runtime.sendCorrect(); feedback.time.advance(100); feedback.runtime.pause(); feedback.time.advance(9000)
  feedback.runtime.resume(); feedback.time.advance(249); assert.equal(feedback.runtime.uiState, 'correct')
  feedback.time.advance(1); assert.equal(feedback.runtime.uiState, 'active')
})

test('I09 completed session saves one real report and projects RESULT facts', async () => {
  const { runtime, time } = createRuntime()
  await runtime.updateSettings({ questionCount: 10 })
  runtime.start()
  for (let index = 0; index < 10; index++) answerCorrect(runtime, time, 100 + index)
  const report = runtime.reports.latest()
  assert.equal(runtime.uiState, 'result')
  assert.equal(runtime.reports.list().length, 1)
  assert.deepEqual([report.completionState, report.partialEvidence], ['completed', false])
  assert.deepEqual([report.completedQuestions, report.correct, report.accuracy, report.bestStreak], [10, 10, 100, 10])
  assert.equal(formatReactionTime(report.averageReactionMs), '0.10 秒')
  assert.equal(formatReactionTime(null), '—')
  assert.equal(getPrimaryErrorNote(report), null)
})

test('I10 early stop saves stopped partial facts and returns READY without normal RESULT', async () => {
  const { runtime, time } = createRuntime()
  await runtime.updateSettings({ questionCount: 10 })
  runtime.start(); answerCorrect(runtime, time, 120)
  unlock(runtime, time); time.advance(300); const wrongTarget = runtime.snapshot.currentNote
  runtime.sendWrong(); time.advance(350)
  runtime.pause()
  const report = runtime.stop()
  assert.equal(runtime.uiState, 'ready')
  assert.equal(runtime.reports.list().length, 1)
  assert.equal(runtime.reports.latest(), report)
  assert.deepEqual([report.completionState, report.partialEvidence], ['stopped', true])
  assert.deepEqual([report.completedQuestions, report.correct, report.wrong, report.timeout, report.accuracy, report.bestStreak], [2, 1, 1, 0, 50, 1])
  assert.equal(report.wrongNoteCounts.find((entry) => entry.noteName === wrongTarget.noteName).count, 1)
  assert.equal(formatReactionTime(report.averageReactionMs), '0.21 秒')
  assert.equal(getPrimaryErrorNote(report), wrongTarget.noteName)
  time.advance(10000)
  assert.equal(runtime.reports.list().length, 1)
})

test('I11 UI integration has no direct answer/timeout shortcut', () => {
  const root = path.resolve(__dirname, '../prototype/android-tablet-v1/src')
  const sources = ['main.tsx', 'sightReadingIntegration.ts']
    .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
    .join('\n')
  assert.doesNotMatch(sources, /recordOutcome|recordTimeout|applyOutcome|correctCount\s*\+=|wrongCount\s*\+=/)
  assert.match(sources, /midi\.emitNoteOn/)
  assert.match(sources, /controller\.handleMidi/)
  assert.match(sources, /getAndroidSightReadingUiState/)
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
  process.stdout.write(`\n${tests.length - failed}/${tests.length} Android Sight Reading integration groups PASS\n`)
  process.exitCode = failed ? 1 : 0
}

void run()
