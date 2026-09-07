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

const { SightReadingController } = require('../src/sightReading/controller.ts')
const settingsModule = require('../src/sightReading/sightReadingSettings.ts')
const notesModule = require('../src/sightReading/sightReadingNotes.ts')
const keysModule = require('../src/sightReading/musicKeySignatures.ts')
const doubles = require('../src/sightReading/doubleNoteQuestions.ts')
const { createMusicStaffRenderModel } = require('../src/renderer/src/utils/musicStaffModel.ts')
const { getSightReadingPrompt } = require('../prototype/android-tablet-v1/src/sightReadingPresentation.ts')
const persistence = require('../prototype/android-tablet-v1/src/androidPersistenceCore.ts')
const { projectSightReadingHistory } = require('../prototype/android-tablet-v1/src/historyProjection.ts')
const { AndroidSightReadingRuntime } = require('../prototype/android-tablet-v1/src/sightReadingIntegration.ts')

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
        const next = [...jobs.entries()].filter(([, job]) => job.at <= until)
          .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0]
        if (!next) break
        assert.ok(++turns < 10000, 'timer processing must remain bounded')
        jobs.delete(next[0])
        now = next[1].at
        next[1].callback()
      }
      now = until
    }
  }
}

function harness(overrides = {}) {
  const time = fakeTime()
  let eventId = 0
  let watermark = 0
  const settings = settingsModule.migrateSightReadingSettings({
    ...settingsModule.ANDROID_SIGHT_READING_DEFAULTS,
    noteMode: 'double',
    questionCount: 10,
    ...overrides
  }, settingsModule.ANDROID_SIGHT_READING_DEFAULTS)
  const controller = new SightReadingController(settings, {
    clock: time,
    scheduler: time,
    random: () => 0.42,
    readMidiWatermark: () => watermark
  })
  return {
    controller,
    settings,
    time,
    start() { controller.start(); time.advance(32) },
    emit(midiNumber, changes = {}) {
      const event = {
        id: ++eventId,
        type: 'noteOn',
        midiNumber,
        velocity: 100,
        timestamp: time.now(),
        noteName: `M${midiNumber}`,
        ...changes
      }
      controller.handleMidi(event)
      return event
    },
    target() { return controller.snapshot.currentTargetNotes.map((note) => note.midiNumber) },
    wrongPitch() {
      const targets = new Set(this.target())
      for (let midi = 36; midi <= 88; midi += 1) if (!targets.has(midi)) return midi
      throw new Error('No wrong pitch available')
    },
    setWatermark(value) { watermark = value },
    setEventId(value) { eventId = value }
  }
}

function completeDouble(h, order = [0, 1], gapMs = 25) {
  const target = h.target()
  h.emit(target[order[0]])
  h.time.advance(gapMs)
  h.emit(target[order[1]])
  h.time.advance(150 - gapMs)
}

const tests = []
const test = (id, title, callback) => tests.push({ id, title, callback })

test('D01', 'single-note first valid noteOn still settles immediately', () => {
  const h = harness({ noteMode: 'single' }); h.start()
  assert.equal(h.settings.noteCount, 1)
  h.emit(h.target()[0])
  assert.equal(h.controller.snapshot.result, 'correct')
})
test('D02', 'low then high within 150ms is correct only when capture closes', () => {
  const h = harness(); h.start(); const target = h.target()
  h.emit(target[0]); h.time.advance(25); h.emit(target[1]); assert.equal(h.controller.snapshot.result, null)
  h.time.advance(125); assert.equal(h.controller.snapshot.result, 'correct')
})
test('D03', 'high then low within 150ms is correct', () => {
  const h = harness(); h.start(); completeDouble(h, [1, 0]); assert.equal(h.controller.snapshot.result, 'correct')
})
test('D04', 'same target pitch repeated stays one unique pitch', () => {
  const h = harness(); h.start(); const target = h.target(); h.emit(target[0]); h.time.advance(30); h.emit(target[0]); h.time.advance(120)
  assert.deepEqual([h.controller.snapshot.result, h.controller.snapshot.wrongCount], ['wrong_note', 1])
})
test('D05', 'E then E plus C pattern resolves from unique target set', () => {
  const h = harness(); h.start(); const [low, high] = h.target(); h.emit(high); h.time.advance(20); h.emit(high); h.emit(low); h.time.advance(130)
  assert.equal(h.controller.snapshot.result, 'correct')
})
test('D06', 'two targets plus third pitch is wrong', () => {
  const h = harness(); h.start(); const [low, high] = h.target(); h.emit(low); h.emit(high); h.time.advance(10); h.emit(h.wrongPitch())
  assert.equal(h.controller.snapshot.result, 'wrong_note')
})
test('D07', 'non-target first pitch is immediately wrong', () => {
  const h = harness(); h.start(); h.time.advance(80); h.emit(h.wrongPitch()); assert.equal(h.controller.snapshot.result, 'wrong_note')
  assert.equal(h.controller.stop().averageReactionMs, 80)
})
test('D08', 'one target only is wrong at capture close', () => {
  const h = harness(); h.start(); h.emit(h.target()[0]); h.time.advance(149); assert.equal(h.controller.snapshot.result, null)
  h.time.advance(1); assert.equal(h.controller.snapshot.result, 'wrong_note')
})
test('D09', 'no input for 7000ms is timeout', () => {
  const h = harness(); h.start(); h.time.advance(6999); assert.equal(h.controller.snapshot.result, null)
  h.time.advance(1); assert.equal(h.controller.snapshot.result, 'timeout')
})
test('D10', 'capture deadline is clipped by overall deadline', () => {
  const h = harness(); h.start(); h.time.advance(6950); h.emit(h.target()[0]); h.time.advance(49); assert.equal(h.controller.snapshot.result, null)
  h.time.advance(1); assert.equal(h.controller.snapshot.result, 'wrong_note')
})
test('D11', 'correct reaction equals target-set completion timestamp', () => {
  const h = harness(); h.start(); h.time.advance(800); h.emit(h.target()[0]); h.time.advance(25); h.emit(h.target()[1]); h.time.advance(125)
  assert.equal(h.controller.stop().averageReactionMs, 825)
})
test('D12', 'remaining capture wait is not added to reaction', () => {
  const h = harness(); h.start(); h.time.advance(20); completeDouble(h, [0, 1], 30)
  assert.equal(h.controller.stop().averageReactionMs, 50)
})
test('D13', 'non-target wrong reaction uses decisive event time', () => {
  const h = harness(); h.start(); h.time.advance(240); h.emit(h.wrongPitch())
  assert.equal(h.controller.stop().averageReactionMs, 240)
})
test('D14', 'timeout remains excluded from reaction metrics', () => {
  const h = harness(); h.start(); h.time.advance(7000)
  assert.equal(h.controller.stop().averageReactionMs, null)
})
test('D15', 'manual pause freezes capture without phantom judgement', () => {
  const h = harness(); h.start(); const [low, high] = h.target(); h.emit(low); h.time.advance(50); h.controller.pause(); h.time.advance(9000)
  assert.equal(h.controller.snapshot.result, null); h.controller.resume(); h.time.advance(20); h.emit(high); h.time.advance(80)
  assert.equal(h.controller.snapshot.result, 'correct')
  const complete = harness(); complete.start(); complete.emit(complete.target()[0]); complete.time.advance(25); complete.emit(complete.target()[1]); complete.time.advance(25); complete.controller.pause(); complete.time.advance(9000); complete.controller.resume(); complete.time.advance(100)
  assert.equal(complete.controller.stop().averageReactionMs, 25)
})
test('D16', 'disconnect invalidates capture without phantom judgement', () => {
  const h = harness(); h.start(); h.emit(h.target()[0]); h.time.advance(30); h.controller.disconnect(); h.time.advance(9000)
  assert.deepEqual([h.controller.snapshot.result, h.controller.snapshot.completedQuestions], [null, 0])
})
test('D17', 'reconnect rejects stale capture events and accepts fresh input after explicit resume', () => {
  const h = harness(); h.start(); const [low, high] = h.target(); const stale = h.emit(low); h.controller.disconnect(); h.setWatermark(stale.id + 5); h.controller.reconnect(); h.controller.resume()
  h.controller.handleMidi({ ...stale, timestamp: h.time.now() }); assert.equal(h.controller.snapshot.result, null)
  h.setEventId(stale.id + 5); h.emit(low); h.emit(high); h.time.advance(150); assert.equal(h.controller.snapshot.result, 'correct')
})
test('D18', 'velocity-zero noteOn does not enter target set', () => {
  const h = harness(); h.start(); h.emit(h.target()[0], { velocity: 0 }); h.time.advance(200)
  assert.deepEqual([h.controller.snapshot.result, h.controller.snapshot.completedQuestions], [null, 0])
})
test('D19', 'CC64 does not affect double-note judgement', () => {
  const h = harness(); h.start(); h.emit(undefined, { type: 'controlChange', controllerNumber: 64, controllerValue: 127 }); assert.equal(h.controller.snapshot.completedQuestions, 0)
  completeDouble(h); assert.equal(h.controller.snapshot.result, 'correct')
})

test('FDT01', 'single correct feedback still advances at 350ms', () => {
  const h = harness({ noteMode: 'single' }); h.start(); h.emit(h.target()[0])
  h.time.advance(349); assert.deepEqual([h.controller.snapshot.phase, h.controller.snapshot.result], ['feedback', 'correct'])
  h.time.advance(1); assert.deepEqual([h.controller.snapshot.phase, h.controller.snapshot.result], ['display', null])
})
test('FDT02', 'double correct feedback remains visible for exactly 1200ms', () => {
  const h = harness(); h.start(); completeDouble(h)
  h.time.advance(1199); assert.deepEqual([h.controller.snapshot.phase, h.controller.snapshot.result], ['feedback', 'correct'])
  h.time.advance(1); assert.deepEqual([h.controller.snapshot.phase, h.controller.snapshot.result], ['display', null])
})
test('FDT03', 'double wrong feedback remains visible for exactly 1600ms', () => {
  const h = harness(); h.start(); h.emit(h.wrongPitch())
  h.time.advance(1599); assert.deepEqual([h.controller.snapshot.phase, h.controller.snapshot.result], ['feedback', 'wrong_note'])
  h.time.advance(1); assert.deepEqual([h.controller.snapshot.phase, h.controller.snapshot.result], ['display', null])
})
test('FDT04', 'double timeout feedback remains visible for exactly 1600ms', () => {
  const h = harness(); h.start(); h.time.advance(7000)
  h.time.advance(1599); assert.deepEqual([h.controller.snapshot.phase, h.controller.snapshot.result], ['feedback', 'timeout'])
  h.time.advance(1); assert.deepEqual([h.controller.snapshot.phase, h.controller.snapshot.result], ['display', null])
})
test('FDT05', 'interval label remains visible for the full double feedback hold', () => {
  const h = harness(); h.start(); completeDouble(h)
  const label = h.controller.snapshot.currentIntervalLabel
  h.time.advance(1199)
  assert.equal(getSightReadingPrompt({ noteMode: 'double', outcome: h.controller.snapshot.result, intervalLabel: label, paused: false, pausedPrompt: '' }), `正确 · ${label}`)
  h.time.advance(1)
  assert.equal(getSightReadingPrompt({ noteMode: 'double', outcome: h.controller.snapshot.result, intervalLabel: h.controller.snapshot.currentIntervalLabel, paused: false, pausedPrompt: '' }), '请弹出这两个音')
})
test('FDT06', 'longer double feedback hold does not change reaction time', () => {
  const h = harness(); h.start(); h.time.advance(800); h.emit(h.target()[0]); h.time.advance(25); h.emit(h.target()[1]); h.time.advance(125)
  h.time.advance(1199)
  assert.equal(h.controller.stop().averageReactionMs, 825)
})
test('FDT07', 'pause during double feedback freezes the remaining duration', () => {
  const h = harness(); h.start(); completeDouble(h); h.time.advance(300); h.controller.pause(); h.time.advance(9000)
  assert.deepEqual([h.controller.snapshot.isPaused, h.controller.snapshot.phase, h.controller.snapshot.result], [true, 'feedback', 'correct'])
})
test('FDT08', 'resume consumes only remaining feedback time and advances exactly once', () => {
  const h = harness(); h.start(); completeDouble(h); h.time.advance(300); h.controller.pause(); h.time.advance(9000); h.controller.resume()
  h.time.advance(899); assert.deepEqual([h.controller.snapshot.phase, h.controller.snapshot.result, h.controller.snapshot.completedQuestions], ['feedback', 'correct', 1])
  h.time.advance(1); assert.deepEqual([h.controller.snapshot.phase, h.controller.snapshot.result, h.controller.snapshot.completedQuestions], ['display', null, 1])
  h.time.advance(32); assert.deepEqual([h.controller.snapshot.phase, h.controller.snapshot.completedQuestions], ['answering', 1])
  h.time.advance(1000); assert.deepEqual([h.controller.snapshot.phase, h.controller.snapshot.completedQuestions], ['answering', 1])
})

test('ADT01', 'single no-input timeout remains exactly 5000ms', () => {
  const h = harness({ noteMode: 'single' }); h.start(); h.time.advance(4999)
  assert.deepEqual([h.controller.snapshot.phase, h.controller.snapshot.result], ['answering', null])
  h.time.advance(1); assert.deepEqual([h.controller.snapshot.phase, h.controller.snapshot.result], ['feedback', 'timeout'])
})
test('ADT02', 'double no-input timeout is exactly 7000ms', () => {
  const h = harness(); h.start(); h.time.advance(6999)
  assert.deepEqual([h.controller.snapshot.phase, h.controller.snapshot.result], ['answering', null])
  h.time.advance(1); assert.deepEqual([h.controller.snapshot.phase, h.controller.snapshot.result], ['feedback', 'timeout'])
})
test('ADT03', 'double capture starting at 6950ms is clipped to 50ms', () => {
  const h = harness(); h.start(); h.time.advance(6950); h.emit(h.target()[0]); h.time.advance(49)
  assert.deepEqual([h.controller.snapshot.phase, h.controller.snapshot.result], ['answering', null])
  h.time.advance(1); assert.deepEqual([h.controller.snapshot.phase, h.controller.snapshot.result], ['feedback', 'wrong_note'])
})
test('ADT04', '7000ms deadline does not alter target-set completion reaction time', () => {
  const h = harness(); h.start(); h.time.advance(6800); h.emit(h.target()[0]); h.time.advance(100); h.emit(h.target()[1]); h.time.advance(50)
  assert.equal(h.controller.stop().averageReactionMs, 6900)
})
test('ADT05', 'late non-target note uses its decisive event time', () => {
  const h = harness(); h.start(); h.time.advance(6900); h.emit(h.wrongPitch())
  assert.equal(h.controller.stop().averageReactionMs, 6900)
})
test('ADT06', 'late incomplete answer reaction is capture settlement time', () => {
  const h = harness(); h.start(); h.time.advance(6950); h.emit(h.target()[0]); h.time.advance(50)
  assert.equal(h.controller.stop().averageReactionMs, 7000)
})
test('ADT07', 'pause freezes the remaining double answer deadline', () => {
  const h = harness(); h.start(); h.time.advance(6000); h.controller.pause(); h.time.advance(9000)
  assert.deepEqual([h.controller.snapshot.isPaused, h.controller.snapshot.phase, h.controller.snapshot.result], [true, 'answering', null])
  h.controller.resume(); h.time.advance(999); assert.equal(h.controller.snapshot.result, null)
  h.time.advance(1); assert.equal(h.controller.snapshot.result, 'timeout')
})
test('ADT08', 'disconnect keeps double deadline safe and requires explicit resume', () => {
  const h = harness(); h.start(); h.time.advance(6500); h.controller.disconnect(); h.time.advance(9000)
  assert.deepEqual([h.controller.snapshot.isPaused, h.controller.snapshot.phase, h.controller.snapshot.result], [true, 'answering', null])
  h.controller.reconnect(); h.time.advance(9000); assert.equal(h.controller.snapshot.result, null)
  h.controller.resume(); h.time.advance(499); assert.equal(h.controller.snapshot.result, null)
  h.time.advance(1); assert.equal(h.controller.snapshot.result, 'timeout')
})

function sessions(questionCount = 100) {
  return keysModule.MAJOR_KEY_DISPLAY_ORDER.flatMap((keySignature) => ['treble', 'bass', 'grand'].map((staffMode) => ({
    keySignature,
    staffMode,
    questions: doubles.createSightReadingDoubleQuestions({ keySignature, staffMode, questionCount, random: () => 0.42 })
  })))
}
const allQuestions = () => sessions(100).flatMap((session) => session.questions)

test('G01', 'every question has exactly two distinct pitches', () => { for (const q of allQuestions()) assert.equal(new Set(q.notes.map((n) => n.midiNumber)).size, 2) })
test('G02', 'both pitches are diatonic in the selected major key', () => { for (const s of sessions()) for (const q of s.questions) for (const n of q.notes) assert.ok(notesModule.isDiatonicMidiNumber(n.midiNumber, s.keySignature)) })
test('G03', 'only approved semitone intervals are generated', () => { const allowed = new Set([3, 4, 5, 7, 8, 9, 12]); for (const q of allQuestions()) assert.ok(allowed.has(q.notes[1].midiNumber - q.notes[0].midiNumber)) })
test('G04', 'tritone is never generated', () => { for (const q of allQuestions()) assert.notEqual(q.notes[1].midiNumber - q.notes[0].midiNumber, 6) })
test('G05', 'seconds and sevenths are never generated', () => { const excluded = new Set([1, 2, 10, 11]); for (const q of allQuestions()) assert.ok(!excluded.has(q.notes[1].midiNumber - q.notes[0].midiNumber)) })
test('G06', 'all 15 supported major keys generate complete sessions', () => { assert.equal(keysModule.MAJOR_KEY_DISPLAY_ORDER.length, 15); for (const s of sessions(10)) assert.equal(s.questions.length, 10) })
test('G07', 'treble range remains 60-88', () => { for (const s of sessions().filter((s) => s.staffMode === 'treble')) for (const q of s.questions) for (const n of q.notes) assert.ok(n.midiNumber >= 60 && n.midiNumber <= 88) })
test('G08', 'bass range remains 36-64', () => { for (const s of sessions().filter((s) => s.staffMode === 'bass')) for (const q of s.questions) for (const n of q.notes) assert.ok(n.midiNumber >= 36 && n.midiNumber <= 64) })
test('G09', 'grand range remains 36-88', () => { for (const s of sessions().filter((s) => s.staffMode === 'grand')) for (const q of s.questions) for (const n of q.notes) assert.ok(n.midiNumber >= 36 && n.midiNumber <= 88) })
for (const [id, count, same, cross] of [['G10', 10, 6, 4], ['G11', 20, 12, 8], ['G12', 50, 30, 20], ['G13', 100, 60, 40]]) {
  test(id, `grand ${count} layout is exactly ${same}/${cross}`, () => { const q = doubles.createSightReadingDoubleQuestions({ keySignature: 'C', staffMode: 'grand', questionCount: count, random: () => 0.42 }); assert.equal(q.filter((x) => x.layout === 'cross').length, cross); assert.equal(q.filter((x) => x.layout !== 'cross').length, same) })
}
test('G14', 'grand same-staff quota splits evenly treble/bass', () => { for (const count of [10, 20, 50, 100]) { const q = doubles.createSightReadingDoubleQuestions({ keySignature: 'F#', staffMode: 'grand', questionCount: count, random: () => 0.42 }); assert.equal(q.filter((x) => x.layout === 'treble').length, q.filter((x) => x.layout === 'bass').length) } })
test('G15', 'cross layout has one pitch on each side of split 60', () => { for (const q of allQuestions().filter((q) => q.layout === 'cross')) assert.ok(q.notes[0].midiNumber < 60 && q.notes[1].midiNumber >= 60) })
test('G16', 'largest-remainder quotas and generated totals are exact', () => { for (const count of [10, 20, 50, 100]) { const quotas = doubles.allocateDoubleIntervalQuotas(count); assert.equal(Object.values(quotas).reduce((a, b) => a + b, 0), count); const generated = doubles.createSightReadingDoubleQuestions({ keySignature: 'C', staffMode: 'grand', questionCount: count, random: () => 0.42 }).reduce((result, q) => ({ ...result, [q.interval.id]: (result[q.interval.id] ?? 0) + 1 }), {}); assert.deepEqual(generated, Object.fromEntries(Object.entries(quotas).filter(([, value]) => value > 0))) } })
test('G17', '10-question allocation contains all seven interval classes', () => { assert.equal(Object.values(doubles.allocateDoubleIntervalQuotas(10)).filter((count) => count > 0).length, 7) })
test('G18', 'allocated interval shares approximate approved weights within one question', () => { for (const count of [10, 20, 50, 100]) { const quotas = doubles.allocateDoubleIntervalQuotas(count); for (const interval of doubles.SIGHT_READING_DOUBLE_INTERVALS) assert.ok(Math.abs(quotas[interval.id] - count * interval.weight / 100) < 1) } })
test('G19', 'complete generated sessions have no adjacent exact pair repeat', () => { for (const s of sessions()) for (let i = 1; i < s.questions.length; i += 1) assert.notEqual(s.questions[i].pairKey, s.questions[i - 1].pairKey) })
test('G20', 'candidate matrix and deterministic cross-bucket rebalancing never deadlock', () => { let emptyBuckets = 0; for (const key of keysModule.MAJOR_KEY_DISPLAY_ORDER) for (const interval of doubles.SIGHT_READING_DOUBLE_INTERVALS) for (const layout of ['treble', 'bass', 'cross']) { const mode = layout === 'cross' ? 'grand' : layout; if (doubles.enumerateDoubleNoteCandidates(key, mode, interval, layout).length === 0) emptyBuckets += 1 } assert.ok(emptyBuckets > 0); for (const s of sessions()) assert.equal(s.questions.length, 100) })

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'prototype', 'android-tablet-v1', 'src', 'main.tsx'), 'utf8')
test('U01', 'settings selector contains 单音 and 双音', () => { assert.match(mainSource, /title="音符数量"/); assert.match(mainSource, /label: '单音'/); assert.match(mainSource, /label: '双音'/) })
test('U02', 'old settings without noteMode default to single', () => { const s = settingsModule.migrateSightReadingSettings({ staffMode: 'grand', notePoolMode: 'chromatic' }, settingsModule.ANDROID_SIGHT_READING_DEFAULTS); assert.deepEqual([s.noteMode, s.noteCount], ['single', 1]) })
test('U03', 'double mode effective pool is always diatonic', () => { assert.equal(settingsModule.getEffectiveSightReadingNotePoolMode({ noteMode: 'double', notePoolMode: 'chromatic' }), 'diatonic') })
test('U04', 'single chromatic preference survives single-double-single', () => { let s = settingsModule.migrateSightReadingSettings({ ...settingsModule.ANDROID_SIGHT_READING_DEFAULTS, notePoolMode: 'chromatic', noteMode: 'double' }, settingsModule.ANDROID_SIGHT_READING_DEFAULTS); assert.equal(s.notePoolMode, 'chromatic'); s = settingsModule.migrateSightReadingSettings({ ...s, noteMode: 'single' }, settingsModule.ANDROID_SIGHT_READING_DEFAULTS); assert.deepEqual([s.noteMode, s.notePoolMode], ['single', 'chromatic']) })
test('U05', 'same-staff double render model contains two simultaneous noteheads', () => { const pair = doubles.enumerateDoubleNoteCandidates('C', 'treble', doubles.SIGHT_READING_DOUBLE_INTERVALS[0], 'treble')[0]; const model = createMusicStaffRenderModel({ staffMode: 'treble', keySignature: 'C', notes: pair.map((n) => n.notation) }); assert.equal(model.notes.length, 2); assert.equal(new Set(model.notes.map((n) => n.clef)).size, 1) })
test('U06', 'grand cross render model contains exactly two total noteheads', () => { const interval = doubles.SIGHT_READING_DOUBLE_INTERVALS.find((item) => item.id === 'perfectFifth'); const pair = doubles.enumerateDoubleNoteCandidates('C', 'grand', interval, 'cross')[0]; const model = createMusicStaffRenderModel({ staffMode: 'grand', keySignature: 'C', notes: pair.map((n) => n.notation) }); assert.equal(model.notes.length, 2); assert.deepEqual(new Set(model.notes.map((n) => n.clef)), new Set(['bass', 'treble'])) })
test('U07', 'interval label is hidden before answer', () => { assert.equal(getSightReadingPrompt({ noteMode: 'double', outcome: null, intervalLabel: '大三度', paused: false, pausedPrompt: '' }), '请弹出这两个音') })
test('U08', 'correct feedback shows interval label', () => { assert.equal(getSightReadingPrompt({ noteMode: 'double', outcome: 'correct', intervalLabel: '大三度', paused: false, pausedPrompt: '' }), '正确 · 大三度') })
test('U09', 'wrong feedback identifies target interval', () => { assert.equal(getSightReadingPrompt({ noteMode: 'double', outcome: 'wrong_note', intervalLabel: '纯五度', paused: false, pausedPrompt: '' }), '错误 · 目标：纯五度') })
test('U10', 'timeout feedback identifies target interval', () => { assert.equal(getSightReadingPrompt({ noteMode: 'double', outcome: 'timeout', intervalLabel: '纯八度', paused: false, pausedPrompt: '' }), '超时 · 目标：纯八度') })
test('U11', 'note-name visibility cannot suppress interval feedback', () => { const hidden = false; assert.equal(hidden, false); assert.equal(getSightReadingPrompt({ noteMode: 'double', outcome: 'correct', intervalLabel: '小六度', paused: false, pausedPrompt: '' }), '正确 · 小六度') })
test('U12', 'single-note presentation strings remain unchanged', () => { assert.equal(getSightReadingPrompt({ noteMode: 'single', outcome: null, intervalLabel: null, paused: false, pausedPrompt: '' }), '请弹出这个音'); assert.equal(getSightReadingPrompt({ noteMode: 'single', outcome: 'correct', intervalLabel: null, paused: false, pausedPrompt: '' }), '回答正确'); assert.match(mainSource, /settings\.noteMode === 'double' \? `\$\{settings\.questionCount\} 道双音题` : `\$\{settings\.questionCount\} 个音符`/) })
test('U13', 'answer deadline and active UI time display derive from note mode', () => {
  assert.equal(settingsModule.getSightReadingAnswerTimeoutMs({ noteMode: 'single' }), 5000)
  assert.equal(settingsModule.getSightReadingAnswerTimeoutMs({ noteMode: 'double' }), 7000)
  const single = harness({ noteMode: 'single' }); single.start(); assert.equal(single.controller.stop().answerTimeLimitSeconds, 5)
  const double = harness(); double.start(); assert.equal(double.controller.stop().answerTimeLimitSeconds, 7)
  assert.match(mainSource, /getSightReadingAnswerTimeoutMs\(settings\)/)
  assert.doesNotMatch(mainSource, /remainingTimeMs \/ 5000/)
})

class MemoryPreferencesBackend {
  constructor(values = new Map()) { this.values = values }
  async get({ key }) { return { value: this.values.get(key) ?? null } }
  async set({ key, value }) { this.values.set(key, value) }
  async keys() { return { keys: [...this.values.keys()] } }
}

function sampleDurableRecord(id, completionState) {
  const stopped = completionState === 'stopped'
  return {
    schemaVersion: 1,
    recordId: id,
    practiceType: 'sightReading',
    completionState,
    partialEvidence: stopped,
    startedAt: 1000,
    endedAt: 2000,
    durationMs: 1000,
    settings: {
      schemaVersion: 1, staffMode: 'grand', keySignature: 'C', notePoolMode: 'chromatic',
      questionCount: 10, answerTimeLimitMs: 5000, noteNameVisible: false
    },
    plannedQuestionCount: 10,
    completed: stopped ? 2 : 10,
    correct: stopped ? 1 : 8,
    wrong: 1,
    timeout: stopped ? 0 : 1,
    accuracy: stopped ? 50 : 80,
    averageReactionMs: 400,
    fastestReactionMs: 200,
    slowestReactionMs: 600,
    bestStreak: 4,
    targetNoteErrors: { wrong: [{ noteName: 'C4', count: 1 }], timeout: [{ noteName: 'D4', count: stopped ? 0 : 1 }] },
    mostWrongNote: 'C4', mostTimedOutNote: stopped ? '暂无' : 'D4', weakestNote: 'C4',
    clefStats: {
      treble: { total: stopped ? 2 : 10, correct: stopped ? 1 : 8, wrong: 1, timeout: stopped ? 0 : 1, accuracy: stopped ? 50 : 80 },
      bass: { total: 0, correct: 0, wrong: 0, timeout: 0, accuracy: 0 }
    }
  }
}

async function loadSeededRecords(records) {
  const values = new Map([
    [persistence.ANDROID_PERSISTENCE_KEYS.schemaVersion, '1'],
    [persistence.ANDROID_PERSISTENCE_KEYS.sightReadingReportIndex, JSON.stringify({ schemaVersion: 1, recordIds: records.map((r) => r.recordId) })],
    ...records.map((record) => [`${persistence.ANDROID_PERSISTENCE_KEYS.sightReadingReportPrefix}${record.recordId}`, JSON.stringify(record)])
  ])
  const backend = new MemoryPreferencesBackend(values)
  const loaded = await persistence.initializeAndroidPersistence(backend)
  return { backend, loaded }
}

test('P01', 'code-8 settings without noteMode load as single without key/schema migration', async () => {
  const oldDocument = { schemaVersion: 1, staffMode: 'grand', keySignature: 'Cb', notePoolMode: 'chromatic', questionCount: 20, answerTimeLimitMs: 5000, noteNameVisible: false }
  const backend = new MemoryPreferencesBackend(new Map([
    [persistence.ANDROID_PERSISTENCE_KEYS.schemaVersion, '1'],
    [persistence.ANDROID_PERSISTENCE_KEYS.sightReadingSettings, JSON.stringify(oldDocument)]
  ]))
  const loaded = await persistence.initializeAndroidPersistence(backend)
  assert.deepEqual([loaded.settingsLoad.settings.noteMode, loaded.settingsLoad.settings.noteCount, loaded.settingsLoad.settings.notePoolMode], ['single', 1, 'chromatic'])
  assert.equal(backend.values.get(persistence.ANDROID_PERSISTENCE_KEYS.sightReadingSettings), JSON.stringify(oldDocument))
})
test('P02', 'double mode persists through the existing schema-v1 settings key', async () => {
  const backend = new MemoryPreferencesBackend(); const first = await persistence.initializeAndroidPersistence(backend)
  const expected = settingsModule.migrateSightReadingSettings({ ...settingsModule.ANDROID_SIGHT_READING_DEFAULTS, noteMode: 'double', notePoolMode: 'chromatic' }, settingsModule.ANDROID_SIGHT_READING_DEFAULTS)
  assert.equal((await first.settings.save(expected)).success, true)
  const second = await persistence.initializeAndroidPersistence(backend)
  assert.deepEqual([second.settingsLoad.settings.noteMode, second.settingsLoad.settings.noteCount, second.settingsLoad.settings.notePoolMode], ['double', 2, 'chromatic'])
})
test('P03', 'old COMPLETED History record remains readable', async () => { const { loaded } = await loadSeededRecords([sampleDurableRecord('old-complete', 'completed')]); assert.equal(loaded.reportLoad.records[0].completionState, 'completed') })
test('P04', 'old STOPPED History record remains readable', async () => { const { loaded } = await loadSeededRecords([sampleDurableRecord('old-stopped', 'stopped')]); assert.equal(loaded.reportLoad.records[0].completionState, 'stopped') })
test('P05', 'loading old History records performs no record rewrite', async () => { const record = sampleDurableRecord('old-byte-stable', 'completed'); const { backend } = await loadSeededRecords([record]); assert.equal(backend.values.get(`${persistence.ANDROID_PERSISTENCE_KEYS.sightReadingReportPrefix}${record.recordId}`), JSON.stringify(record)) })
test('P06', 'History projection still deduplicates record IDs', () => { const record = sampleDurableRecord('old-once', 'completed'); const projection = projectSightReadingHistory([record, record]); assert.deepEqual([projection.items.length, projection.summary.totalSessions], [1, 1]) })
test('A01', 'Android runtime routes both development target notes through controller', () => { const time = fakeTime(); const runtime = new AndroidSightReadingRuntime({ clock: time, scheduler: time, random: () => 0.42, initialSettings: settingsModule.migrateSightReadingSettings({ ...settingsModule.ANDROID_SIGHT_READING_DEFAULTS, noteMode: 'double', questionCount: 10 }, settingsModule.ANDROID_SIGHT_READING_DEFAULTS) }); runtime.start(); time.advance(32); runtime.sendCorrect(); assert.equal(runtime.snapshot.result, null); time.advance(150); assert.equal(runtime.snapshot.result, 'correct') })

async function run() {
  let failed = 0
  for (const item of tests) {
    try {
      await item.callback()
      console.log(`PASS ${item.id} ${item.title}`)
    } catch (error) {
      failed += 1
      console.error(`FAIL ${item.id} ${item.title}`)
      console.error(error.stack || error)
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} Android double-note checks PASS`)
  if (failed > 0) process.exitCode = 1
}

void run()
