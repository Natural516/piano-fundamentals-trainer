const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

// Same in-memory TypeScript loading approach as the existing regression suite.
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
      }, fileName: filename
    }).outputText
    module._compile(output, filename)
  }
}

const tests = []
const test = (name, callback) => tests.push({ name, callback })
function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  }
}

function fakeTime() {
  let now = 1000
  let sequence = 0
  const jobs = new Map()
  return {
    now: () => now,
    schedule(callback, delay) {
      const id = ++sequence
      jobs.set(id, { at: now + Math.max(0, delay), callback })
      return id
    },
    cancel: (id) => jobs.delete(id),
    advance(ms) {
      const until = now + ms
      let turns = 0
      while (true) {
        const next = [...jobs.entries()].filter(([, job]) => job.at <= until)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0]
        if (!next) break
        assert.ok(++turns < 10000, 'timer loop must remain bounded')
        jobs.delete(next[0])
        now = next[1].at
        next[1].callback()
      }
      now = until
    },
    pending: () => jobs.size
  }
}

const path = require('node:path')
const sharedSettings = require('../src/sightReading/sightReadingSettings.ts')
const sharedNotes = require('../src/sightReading/sightReadingNotes.ts')
const keys = require('../src/sightReading/musicKeySignatures.ts')
const { SightReadingController } = require('../src/sightReading/controller.ts')
const { SightReadingSessionCore } = require('../src/sightReading/sightReadingSession.ts')
const { normalizeSightReadingMidiEvent } = require('../src/sightReading/midi.ts')
const reports = require('../src/sightReading/report.ts')
const { AndroidMidiByteStreamParser, toSightReadingMidiPayload } = require('../prototype/android-tablet-v1/src/androidBluetoothMidiCore.ts')
function headless(overrides = {}, random = () => 0.42) {
  const time = fakeTime()
  let sequence = 0
  let latestId = 0
  const settings = { ...sharedSettings.ANDROID_SIGHT_READING_DEFAULTS, ...overrides }
  const controller = new SightReadingController(settings, {
    clock: time, scheduler: time, random, readMidiWatermark: () => latestId
  })
  const h = {
    controller, settings, time,
    get state() { return controller.snapshot },
    start: () => controller.start(),
    advance: (ms) => time.advance(ms),
    emit(midiNumber, changes = {}) {
      const event = { id: ++sequence, type: 'noteOn', timestamp: time.now(), midiNumber, velocity: 100, ...changes }
      latestId = Math.max(latestId, event.id)
      controller.handleMidi(event)
      return event
    },
    answer(outcome = 'correct', reaction = 100) {
      time.advance(32)
      const target = h.state.currentNote
      if (outcome === 'timeout') time.advance(5000)
      else { time.advance(reaction); h.emit(target.midiNumber + (outcome === 'wrong' ? 1 : 0)) }
      time.advance(350)
      return target
    }
  }
  return h
}

function mixedSession() {
  const h = headless({ questionCount: 10 })
  h.start()
  h.answer('correct', 100)
  h.answer('correct', 200)
  const wrong = h.answer('wrong', 600)
  const timeout = h.answer('timeout')
  return { h, wrong, timeout }
}

test('C01 settings: explicit Android defaults, legacy migration and injected storage errors', () => {
  const defaults = sharedSettings.ANDROID_SIGHT_READING_DEFAULTS
  assert.deepEqual(defaults, { staffMode: 'grand', keySignature: 'C', notePoolMode: 'diatonic', questionCount: 20, noteNameVisible: false, noteCount: 1, noteMode: 'single' })
  for (const invalid of [undefined, null, [], 'bad', {}]) {
    assert.deepEqual(sharedSettings.migrateSightReadingSettings(invalid, defaults), defaults)
  }
  const storage = memoryStorage()
  storage.setItem('piano-trainer.sight-reading-settings.v1', JSON.stringify({
    clef: 'mixed', key: 'Gb', questionCount: '50', noteCount: 3, showNoteName: true,
    range: 'custom', answerTimeLimitSeconds: 99, notePoolMode: 'chromatic'
  }))
  const store = sharedSettings.createSightReadingSettingsStore(storage, defaults)
  const migrated = store.read()
  assert.equal(migrated.success, true)
  assert.deepEqual(migrated.settings, { ...defaults, keySignature: 'Gb', questionCount: 50, noteNameVisible: true, notePoolMode: 'chromatic' })
  assert.deepEqual(JSON.parse(storage.getItem(sharedSettings.SIGHT_READING_SETTINGS_STORAGE_KEY)), migrated.settings)
  assert.deepEqual(store.write({ ...defaults, staffMode: 'bass' }), { success: true })
  assert.equal(store.read().settings.staffMode, 'bass')
  storage.setItem(sharedSettings.SIGHT_READING_SETTINGS_STORAGE_KEY, '{broken')
  assert.equal(store.read().success, false)
  assert.deepEqual(store.read().settings, defaults)
  const denied = sharedSettings.createSightReadingSettingsStore({ getItem() { throw Error('read denied') }, setItem() { throw Error('write denied') } }, defaults)
  assert.equal(denied.read().success, false)
  assert.deepEqual(denied.write(defaults), { success: false, error: 'Error: write denied' })
  assert.deepEqual(sharedSettings.migrateSightReadingSettings({ clef: 'invalid', key: 'invalid', questionCount: 3, noteCount: 2 }, defaults), defaults)
})

test('C02 ranges: treble C4-E6, bass C2-E4, grand C2-E6; obsolete range never changes pool', () => {
  for (const [staffMode, [low, high]] of Object.entries({ treble: [60, 88], bass: [36, 64], grand: [36, 88] })) {
    const pool = sharedNotes.getSightReadingNotes({ staffMode, notePoolMode: 'chromatic' })
    assert.deepEqual(pool.map((note) => note.midiNumber), Array.from({ length: high - low + 1 }, (_, i) => i + low))
    assert.deepEqual(sharedNotes.getSightReadingNotes({ staffMode, notePoolMode: 'chromatic', range: 'common' }), pool)
    for (const note of pool) assert.equal(note.clef, staffMode === 'grand' ? (note.midiNumber >= 60 ? 'treble' : 'bass') : staffMode)
  }
})

test('C03 all 15 diatonic spellings: independent expected scale spellings and octave crossings', () => {
  const scales = {
    C: 'C D E F G A B', 'C#': 'C# D# E# F# G# A# B#', Db: 'Db Eb F Gb Ab Bb C',
    D: 'D E F# G A B C#', Eb: 'Eb F G Ab Bb C D', E: 'E F# G# A B C# D#',
    F: 'F G A Bb C D E', 'F#': 'F# G# A# B C# D# E#', Gb: 'Gb Ab Bb Cb Db Eb F',
    G: 'G A B C D E F#', Ab: 'Ab Bb C Db Eb F G', A: 'A B C# D E F# G#',
    Bb: 'Bb C D Eb F G A', B: 'B C# D# E F# G# A#', Cb: 'Cb Db Eb Fb Gb Ab Bb'
  }
  assert.deepEqual(Object.keys(scales).sort(), [...keys.MAJOR_KEY_IDS].sort())
  const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  for (const [keySignature, spellings] of Object.entries(scales)) {
    const expected = new Map(spellings.split(' ').map((spelling) => [
      (natural[spelling[0]] + (spelling[1] === '#' ? 1 : spelling[1] === 'b' ? -1 : 0) + 12) % 12, spelling
    ]))
    for (const staffMode of ['treble', 'bass', 'grand']) {
      const pool = sharedNotes.getSightReadingNotes({ staffMode, keySignature, notePoolMode: 'diatonic' })
      const [low, high] = sharedNotes.SIGHT_READING_MIDI_RANGES[staffMode]
      const candidates = Array.from({ length: high - low + 1 }, (_, i) => i + low).filter((midi) => expected.has(midi % 12))
      assert.deepEqual(pool.map((note) => note.midiNumber), candidates)
      for (const note of pool) {
        assert.equal(note.pitchClass, expected.get(note.midiNumber % 12))
        assert.equal(note.notation.displayAccidental, null)
        assert.equal(note.notation.spelling, note.noteName)
      }
    }
  }
  assert.equal(sharedNotes.getSightReadingNoteByMidi(60, undefined, 'extended', 'C#', 'diatonic').noteName, 'B#3')
  assert.equal(sharedNotes.getSightReadingNoteByMidi(59, undefined, 'extended', 'Cb', 'diatonic').noteName, 'Cb4')
})

test('C04 chromatic pool: every semitone, key-aware sharps/flats/naturals', () => {
  for (const keySignature of keys.MAJOR_KEY_IDS) {
    assert.equal(sharedNotes.getSightReadingNotes({ staffMode: 'grand', keySignature, notePoolMode: 'chromatic' }).length, 53)
  }
  for (const [midi, key, name, accidental] of [[61, 'C', 'C#4', '#'], [71, 'F', 'B4', 'n'], [61, 'Eb', 'Db4', 'b']]) {
    const note = sharedNotes.getSightReadingNoteByMidi(midi, undefined, 'extended', key, 'chromatic')
    assert.equal(note.noteName, name)
    assert.equal(note.notation.displayAccidental, accidental)
  }
})

test('C05 counts: 10/20/50/100 finish only after the final feedback, with no extra question', () => {
  for (const questionCount of [10, 20, 50, 100]) {
    const h = headless({ questionCount }); h.start()
    for (let i = 0; i < questionCount; i++) {
      h.advance(32); h.emit(h.state.currentNote.midiNumber); h.advance(349)
      assert.equal(h.state.status, 'running'); h.advance(1)
    }
    const report = h.state.report
    assert.equal(report.completedQuestions, questionCount)
    assert.equal(report.correct, questionCount)
    assert.equal(report.completionState, 'completed')
    assert.equal(report.partialEvidence, false)
    h.advance(100000); h.emit(60)
    assert.equal(h.state.report, report)
    assert.equal(h.time.pending(), 0)
  }
})

test('C06 Fisher-Yates: exact deterministic permutation, n-1 RNG calls and no pool mutation', () => {
  const pool = sharedNotes.getSightReadingNotes(sharedSettings.ANDROID_SIGHT_READING_DEFAULTS).slice(0, 3)
  const before = [...pool]; let calls = 0
  const bag = sharedNotes.createShuffledSightReadingBag(pool, null, () => { calls++; return 0 })
  assert.deepEqual(bag, [pool[1], pool[2], pool[0]])
  assert.equal(calls, pool.length - 1)
  assert.deepEqual(pool, before)
  assert.equal(new Set(bag.map((note) => note.midiNumber)).size, pool.length)
})

test('C07 bag boundary: force first==previous and verify correction without losing notes', () => {
  const pool = sharedNotes.getSightReadingNotes(sharedSettings.ANDROID_SIGHT_READING_DEFAULTS)
  const bag = sharedNotes.createShuffledSightReadingBag(pool, pool[0].midiNumber, () => 0.999)
  assert.notEqual(bag[0].midiNumber, pool[0].midiNumber)
  assert.deepEqual(bag.map((n) => n.midiNumber).sort((a, b) => a - b), pool.map((n) => n.midiNumber))
  assert.deepEqual(sharedNotes.createShuffledSightReadingBag([pool[0]], pool[0].midiNumber, () => 0), [pool[0]])
})

test('C08 start/reset: counters, report, bag and pending timers reset per session', () => {
  const { h } = mixedSession(); h.controller.stop(); h.start()
  for (const key of ['completedQuestions', 'correctCount', 'wrongCount', 'timeoutCount', 'currentStreak', 'bestStreak']) assert.equal(h.state[key], 0)
  assert.equal(h.state.report, null); assert.equal(h.state.result, null)
  assert.equal(h.time.pending(), 1)
  h.controller.reset(); h.advance(10000)
  assert.equal(h.state.status, 'idle'); assert.equal(h.time.pending(), 0)
})

test('C09 input lock: noteOn at 0ms and 31ms ignored, 32ms accepted', () => {
  const h = headless(); h.start(); const target = h.state.currentNote.midiNumber
  h.emit(target); h.advance(31); h.emit(target)
  assert.equal(h.state.completedQuestions, 0)
  h.advance(1); h.emit(target)
  assert.equal(h.state.correctCount, 1)
})

test('C10 first correct noteOn wins; feedback rejects extra notes', () => {
  const h = headless(); h.start(); h.advance(32)
  h.emit(h.state.currentNote.midiNumber); h.emit(36); h.emit(88)
  assert.deepEqual([h.state.result, h.state.completedQuestions, h.state.correctCount, h.state.wrongCount], ['correct', 1, 1, 0])
})

test('C11 first wrong noteOn wins; later correct input does not repair it', () => {
  const h = headless(); h.start(); h.advance(32); const target = h.state.currentNote.midiNumber
  h.emit(target + 1); h.emit(target)
  assert.deepEqual([h.state.result, h.state.completedQuestions, h.state.wrongCount, h.state.correctCount], ['wrong_note', 1, 1, 0])
})

test('C12 normalization: real 0x90 velocity0 becomes noteOff on every channel; event identity preserved', () => {
  const h = headless(); h.start(); h.advance(32)
  for (let channel = 0; channel < 16; channel++) {
    const parser = new AndroidMidiByteStreamParser()
    const parsed = parser.push([0x90 | channel, 60, 0])[0]
    const payload = toSightReadingMidiPayload(parsed)
    const event = { id: channel + 1, timestamp: h.time.now(), ...payload }
    const normalized = normalizeSightReadingMidiEvent(event)
    assert.equal(normalized.type, 'noteOff')
    assert.equal(normalized.id, event.id)
    assert.equal(normalized.timestamp, event.timestamp)
    h.controller.handleMidi(normalized)
  }
  h.emit(h.state.currentNote.midiNumber, { velocity: 0 })
  assert.equal(h.state.completedQuestions, 0)
})

test('C13 noteOff ignored regardless of release velocity', () => {
  const h = headless(); h.start(); h.advance(32)
  h.emit(h.state.currentNote.midiNumber, { type: 'noteOff', velocity: 99 })
  assert.equal(h.state.completedQuestions, 0)
})

test('C14 CC ignored: pedal is not judgement input', () => {
  const h = headless(); h.start(); h.advance(32)
  for (const value of [127, 0]) h.emit(undefined, { type: 'controlChange', controllerNumber: 64, value })
  assert.equal(h.state.completedQuestions, 0)
})

test('C15 fixed timeout: exactly 5000ms after the 32ms unlock', () => {
  const h = headless(); h.start(); h.advance(5031)
  assert.equal(h.state.result, null); assert.equal(h.controller.getRemainingTimeMs(), 1)
  h.advance(1); assert.equal(h.state.result, 'timeout')
  assert.equal(h.state.timeoutCount, 1)
})

test('C16 correct reaction starts from unlock, not initial display', () => {
  const h = headless(); h.start(); h.answer('correct', 123)
  const report = h.controller.stop()
  assert.equal(report.averageReactionMs, 123); assert.equal(report.fastestReactionMs, 123)
})

test('C17 wrong answers have reaction time', () => {
  const h = headless(); h.start(); h.answer('wrong', 321)
  const report = h.controller.stop()
  assert.equal(report.wrong, 1); assert.equal(report.averageReactionMs, 321)
})

test('C18 timeout has no reaction sample and does not dilute averages', () => {
  const h = headless(); h.start(); h.answer('wrong', 400); h.answer('timeout')
  const report = h.controller.stop()
  assert.equal(report.averageReactionMs, 400); assert.equal(report.slowestReactionMs, 400)
})

test('C19 feedback lasts exactly 350ms, followed by a fresh 32ms lock', () => {
  const h = headless(); h.start(); h.advance(32); h.emit(h.state.currentNote.midiNumber)
  h.advance(349); assert.equal(h.state.phase, 'feedback')
  h.advance(1); assert.equal(h.state.phase, 'display')
  h.emit(h.state.currentNote.midiNumber); assert.equal(h.state.completedQuestions, 1)
  h.advance(32); assert.equal(h.state.phase, 'answering')
})

test('C20 mixed counters: completed equals correct+wrong+timeout', () => {
  const { h } = mixedSession()
  assert.deepEqual([h.state.completedQuestions, h.state.correctCount, h.state.wrongCount, h.state.timeoutCount], [4, 2, 1, 1])
})

test('C21 streak updates on correct and resets on wrong AND timeout', () => {
  const h = headless(); h.start(); h.answer(); h.answer()
  assert.equal(h.state.currentStreak, 2); h.answer('wrong')
  assert.equal(h.state.currentStreak, 0); h.answer(); h.answer('timeout')
  assert.equal(h.state.currentStreak, 0); assert.equal(h.state.bestStreak, 2)
})

test('C22 accuracy uses completed questions, not planned count; zero answers => 0', () => {
  const h = headless(); h.start(); assert.equal(h.state.accuracy, 0)
  h.answer(); h.answer('wrong'); h.answer('timeout')
  assert.equal(h.state.accuracy, 33)
  assert.equal(h.controller.stop().accuracy, 33)
})

test('C23 wrong/timeout errors aggregate against TARGET notes, not played wrong pitch', () => {
  const { h, wrong, timeout } = mixedSession(); const report = h.controller.stop()
  assert.equal(report.wrongNoteCounts.find((entry) => entry.noteName === wrong.noteName).count, 1)
  assert.equal(report.timeoutNoteCounts.find((entry) => entry.noteName === timeout.noteName).count, 1)
  assert.equal(report.wrongNoteCounts.reduce((total, entry) => total + entry.count, 0), 1)
  assert.equal(report.timeoutNoteCounts.reduce((total, entry) => total + entry.count, 0), 1)
  assert.equal(report.mostWrongNote, wrong.noteName)
})

test('C24 all-timeout report: reactions null, never zero or a fabricated sample', () => {
  const h = headless({ questionCount: 10 }); h.start()
  for (let i = 0; i < 10; i++) h.answer('timeout')
  assert.equal(h.state.report.timeout, 10)
  for (const key of ['averageReactionMs', 'fastestReactionMs', 'slowestReactionMs']) assert.equal(h.state.report[key], null)
})

test('C25 pause during display: no judgement/timer, full 32ms lock after resume', () => {
  const h = headless(); h.start(); h.advance(12); h.controller.pause(); h.advance(9000)
  assert.equal(h.time.pending(), 0); h.controller.resume(); h.advance(31); h.emit(h.state.currentNote.midiNumber)
  assert.equal(h.state.completedQuestions, 0); h.advance(1); h.emit(h.state.currentNote.midiNumber)
  assert.equal(h.state.correctCount, 1)
})

test('C26 pause during answering: no timeout or input during pause', () => {
  const h = headless(); h.start(); h.advance(1032); h.controller.pause(); h.advance(9000)
  h.emit(h.state.currentNote.midiNumber)
  assert.equal(h.state.completedQuestions, 0); assert.equal(h.controller.getRemainingTimeMs(), 4000)
})

test('C27 pause during feedback: preserve result and remaining 250ms advance', () => {
  const h = headless(); h.start(); h.advance(32); h.emit(h.state.currentNote.midiNumber)
  h.advance(100); h.controller.pause(); h.advance(9000); h.controller.resume(); h.advance(249)
  assert.equal(h.state.result, 'correct'); h.advance(1); assert.equal(h.state.result, null)
})

test('C28 resume: remaining time preserved across repeated pauses; reaction excludes paused time', () => {
  const h = headless(); h.start(); h.advance(1032); h.controller.pause(); h.advance(9000)
  h.controller.resume(); h.advance(500); h.controller.pause(); h.advance(8000)
  assert.equal(h.controller.getRemainingTimeMs(), 3500)
  h.controller.resume(); h.advance(200); h.emit(h.state.currentNote.midiNumber)
  assert.equal(h.controller.stop().averageReactionMs, 1700)
  const timeout = headless(); timeout.start(); timeout.advance(1032); timeout.controller.pause(); timeout.advance(9000)
  timeout.controller.resume(); timeout.advance(3999); assert.equal(timeout.state.result, null)
  timeout.advance(1); assert.equal(timeout.state.result, 'timeout')
})

test('C29 stale watermark/timestamps: reject old IDs, keep distinct same-timestamp attacks', () => {
  const h = headless(); h.start(); h.advance(32); h.controller.pause()
  const stale = h.emit(h.state.currentNote.midiNumber); h.controller.resume()
  h.emit(stale.midiNumber, { id: stale.id })
  h.emit(stale.midiNumber, { timestamp: h.time.now() - 1 })
  assert.equal(h.state.completedQuestions, 0)
  h.emit(stale.midiNumber, { timestamp: stale.timestamp })
  assert.equal(h.state.correctCount, 1)
  // Two core questions at an identical timestamp prove no timestamp-based dedup.
  const pool = sharedNotes.getSightReadingNotes(sharedSettings.ANDROID_SIGHT_READING_DEFAULTS)
  const core = new SightReadingSessionCore(pool); core.start(100, 0)
  for (let id = 1; id <= 2; id++) {
    core.beginQuestion(pool[0]); core.unlockQuestion(100, id - 1, 5000)
    assert.equal(core.processMidiEvent({ id, type: 'noteOn', midiNumber: pool[0].midiNumber, velocity: 90, timestamp: 100 }).outcome, 'correct')
    core.completeFeedback(10)
  }
  assert.equal(core.counters.correct, 2)
})

test('C30 disconnect/panic/reconnect: retain facts, clear transient input, require explicit resume', () => {
  const h = headless(); h.start(); h.answer(); h.advance(1032)
  h.controller.disconnect(); h.controller.disconnect(); h.advance(10000)
  const stale = h.emit(h.state.currentNote.midiNumber)
  h.controller.resume(); assert.equal(h.state.isPaused, true)
  assert.equal(h.state.completedQuestions, 1); assert.equal(h.state.timeoutCount, 0)
  assert.equal(h.state.currentInputMidiNumber, null)
  h.controller.reconnect(); assert.equal(h.state.isPaused, true)
  h.controller.resume(); h.emit(stale.midiNumber, { id: stale.id })
  assert.equal(h.state.completedQuestions, 1)
  h.emit(stale.midiNumber); assert.equal(h.state.correctCount, 2)
  h.controller.panic(); assert.equal(h.state.currentInputMidiNumber, null)
  assert.equal(h.state.correctCount, 2)
  const watermark = headless(); watermark.start(); watermark.advance(32); watermark.controller.pause()
  const blocked = watermark.emit(watermark.state.currentNote.midiNumber)
  watermark.controller.panic(); watermark.controller.resume(); watermark.emit(blocked.midiNumber, { id: blocked.id })
  assert.equal(watermark.state.completedQuestions, 0)
})

const timing = { id: 'sight-contract-session', startedAt: '2026-08-30T00:00:00.000Z', endedAt: '2026-08-30T00:01:00.000Z', durationMs: 60000 }
test('E01 Android early end retains mixed partial facts, reactions, streak and target aggregates', () => {
  const { h, wrong, timeout } = mixedSession(); const report = h.controller.stop()
  assert.deepEqual([report.completionState, report.partialEvidence, report.totalQuestions, report.completedQuestions], ['stopped', true, 10, 4])
  assert.deepEqual([report.correct, report.wrong, report.timeout, report.accuracy, report.bestStreak], [2, 1, 1, 50, 2])
  assert.deepEqual([report.averageReactionMs, report.fastestReactionMs, report.slowestReactionMs], [300, 100, 600])
  assert.equal(report.wrongNoteCounts.find((e) => e.noteName === wrong.noteName).count, 1)
  assert.equal(report.timeoutNoteCounts.find((e) => e.noteName === timeout.noteName).count, 1)
  assert.equal(report.treble.total + report.bass.total, 4)
  const saved = JSON.stringify(report); h.advance(100000); h.emit(60)
  assert.equal(JSON.stringify(report), saved); assert.equal(h.time.pending(), 0)
  assert.equal(h.controller.stop(), report)
  h.start(); h.answer('wrong')
  assert.equal(JSON.stringify(report), saved, 'new sessions cannot mutate an already-built partial report')
})

test('E02 early end before any answer: zero facts and null reaction metrics, no invented timeout', () => {
  const h = headless(); h.start(); const report = h.controller.stop()
  assert.equal(report.partialEvidence, true); assert.equal(report.completedQuestions, 0)
  assert.equal(report.correct + report.wrong + report.timeout, 0)
  assert.equal(report.averageReactionMs, null); assert.equal(report.accuracy, 0)
})

test('E03 early end in answering/feedback/paused states counts settled outcomes only', () => {
  for (const phase of ['answering', 'feedback', 'paused']) {
    const h = headless(); h.start(); h.advance(32)
    if (phase !== 'answering') h.emit(h.state.currentNote.midiNumber)
    if (phase === 'paused') h.controller.pause()
    const report = h.controller.stop()
    assert.equal(report.completedQuestions, phase === 'answering' ? 0 : 1)
    assert.equal(report.completionState, 'stopped'); assert.equal(report.partialEvidence, true)
  }
  const h = headless({ questionCount: 10 }); h.start(); for (let i = 0; i < 9; i++) h.answer()
  h.advance(32); h.emit(h.state.currentNote.midiNumber)
  const report = h.controller.stop()
  assert.equal(report.completedQuestions, 10); assert.equal(report.completionState, 'stopped')
})

test('E04 early all-timeout partial report keeps null reactions', () => {
  const h = headless(); h.start(); h.answer('timeout'); h.answer('timeout')
  const report = h.controller.stop()
  assert.equal(report.timeout, 2); assert.equal(report.partialEvidence, true)
  for (const key of ['averageReactionMs', 'fastestReactionMs', 'slowestReactionMs']) assert.equal(report[key], null)
})

test('E05 report repository port receives complete stopped payload without a storage schema change', () => {
  const { h } = mixedSession(); const report = h.controller.stop(); const storage = memoryStorage()
  // Test-only adapter, NOT an Android persistence implementation or a new record schema.
  const repository = { save(value) { storage.setItem('report', JSON.stringify(value)); return { success: true } } }
  assert.deepEqual(reports.saveSightReadingReport(report, repository), { success: true })
  assert.deepEqual(JSON.parse(storage.getItem('report')), report)
})

test('A01 neutral dependency boundary: no React, DOM, runtime renderer import or implicit clock/RNG', () => {
  const directory = path.resolve(__dirname, '../src/sightReading')
  for (const name of fs.readdirSync(directory).filter((file) => file.endsWith('.ts'))) {
    const source = fs.readFileSync(path.join(directory, name), 'utf8')
    const ast = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true)
    function visit(node) {
      if (ts.isImportDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier)) {
        assert.ok(node.moduleSpecifier.text.startsWith('./'), `${name}: only local neutral imports are allowed`)
      }
      if (ts.isIdentifier(node)) assert.ok(!['window', 'document', 'localStorage', 'Date', 'setTimeout', 'clearTimeout', 'require'].includes(node.text), `${name}: forbidden global ${node.text}`)
      if (ts.isPropertyAccessExpression(node)) assert.notEqual(node.getText(ast), 'Math.random', `${name}: RNG must be injected`)
      ts.forEachChild(node, visit)
    }
    visit(ast)
  }
  const oldNow = Date.now; const oldRandom = Math.random
  try {
    Date.now = () => { throw Error('un-injected clock') }; Math.random = () => { throw Error('un-injected RNG') }
    const h = headless(); h.start(); h.answer(); assert.equal(h.controller.stop().correct, 1)
  } finally { Date.now = oldNow; Math.random = oldRandom }
})

test('A02 no React commit needed; cancelled/disposed timer callbacks cannot change facts', () => {
  const h = headless(); h.start(); h.advance(32); h.emit(h.state.currentNote.midiNumber)
  assert.equal(h.state.correctCount, 1, 'no React component or subscription exists')
  h.controller.dispose(); h.advance(10000); assert.equal(h.time.pending(), 0)
  let callback
  const controller = new SightReadingController(sharedSettings.ANDROID_SIGHT_READING_DEFAULTS, {
    clock: { now: () => 1000 }, random: () => 0.4, readMidiWatermark: () => 0,
    scheduler: { schedule(fn) { callback = fn; return 1 }, cancel() {} }
  })
  controller.start(); const stale = callback; controller.reset(); stale()
  assert.equal(controller.snapshot.status, 'idle'); assert.equal(controller.snapshot.completedQuestions, 0)
})

let failed = 0
for (const { name, callback } of tests) {
  try { callback(); process.stdout.write(`PASS ${name}\n`) }
  catch (error) { failed++; process.stderr.write(`FAIL ${name}\n${error.stack}\n`) }
}
process.stdout.write(`\n${tests.length - failed}/${tests.length} Sight Reading contract groups PASS\n`)
process.exitCode = failed ? 1 : 0
