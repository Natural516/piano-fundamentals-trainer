const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filename
  }).outputText

  module._compile(output, filename)
}

const tests = []

function test(name, callback) {
  tests.push({ name, callback })
}

const midiNotes = require('../src/renderer/src/utils/midiNotes.ts')
const judgement = require('../src/renderer/src/utils/judgement.ts')
const scalePatterns = require('../src/renderer/src/utils/scalePatterns.ts')
const chordPatterns = require('../src/renderer/src/utils/chordPatterns.ts')
const rhythmPatterns = require('../src/renderer/src/utils/rhythmPatterns.ts')
const coordinationPatterns = require('../src/renderer/src/utils/coordinationPatterns.ts')
const sightReadingNotes = require('../src/renderer/src/utils/sightReadingNotes.ts')

test('MIDI 音名与 88 键范围', () => {
  assert.equal(midiNotes.midiNumberToNoteName(21), 'A0')
  assert.equal(midiNotes.midiNumberToNoteName(60), 'C4')
  assert.equal(midiNotes.midiNumberToNoteName(108), 'C8')
  assert.equal(midiNotes.getPianoKeyRange().length, 88)
})

test('通用单音、和弦、休止和时间判定', () => {
  const noteTarget = { id: 'note', timeMs: 1000, notes: [60], type: 'note', label: 'C4' }
  const input = (midiNumber, timestamp = 1) => ({
    type: 'noteOn',
    midiNumber,
    velocity: 100,
    timestamp
  })

  assert.equal(judgement.judgeSingleNoteTarget(noteTarget, input(60), 1000, 120).type, 'correct')
  assert.equal(judgement.judgeSingleNoteTarget(noteTarget, input(61), 1000, 120).type, 'wrong_note')
  assert.equal(judgement.judgeSingleNoteTarget(noteTarget, input(60), 800, 120).type, 'early')
  assert.equal(judgement.judgeSingleNoteTarget(noteTarget, input(60), 1200, 120).type, 'late')

  const chordTarget = { id: 'chord', timeMs: 1000, notes: [60, 64, 67], type: 'chord', label: 'C' }
  assert.equal(judgement.judgeChordTarget(chordTarget, [60, 64, 67], 1000, 1, 120).type, 'correct')
  assert.equal(judgement.judgeChordTarget(chordTarget, [60, 64], 1000, 1, 120).type, 'missing_note')
  assert.equal(judgement.judgeChordTarget(chordTarget, [60, 64, 67, 70], 1000, 1, 120).type, 'extra_note')
  assert.equal(judgement.judgeChordTarget(chordTarget, [60, 64, 70], 1000, 1, 120).type, 'wrong_note')

  const restTarget = { id: 'rest', timeMs: 1000, durationMs: 500, notes: [], type: 'rest' }
  assert.equal(judgement.judgeRestTarget(restTarget, input(60), 1200).type, 'rest_error')
  assert.equal(judgement.judgeRestTarget(restTarget, input(60), 1600), null)

  const report = judgement.summarizeJudgements([], 0)
  assert.equal(report.accuracy, 0)
  assert.equal(Number.isNaN(report.averageOffsetMs), false)
})

test('识谱谱号与三档音域题库', () => {
  const trebleBasic = sightReadingNotes.getSightReadingNotesForClef('treble', 'basic')
  const trebleCommon = sightReadingNotes.getSightReadingNotesForClef('treble', 'common')
  const trebleExtended = sightReadingNotes.getSightReadingNotesForClef('treble', 'extended')
  const bassBasic = sightReadingNotes.getSightReadingNotesForClef('bass', 'basic')
  const bassCommon = sightReadingNotes.getSightReadingNotesForClef('bass', 'common')
  const bassExtended = sightReadingNotes.getSightReadingNotesForClef('bass', 'extended')

  assert.deepEqual([trebleBasic[0].midiNumber, trebleBasic.at(-1).midiNumber], [60, 72])
  assert.deepEqual([trebleCommon[0].midiNumber, trebleCommon.at(-1).midiNumber], [55, 79])
  assert.deepEqual([trebleExtended[0].midiNumber, trebleExtended.at(-1).midiNumber], [48, 84])
  assert.deepEqual([bassBasic[0].midiNumber, bassBasic.at(-1).midiNumber], [48, 60])
  assert.deepEqual([bassCommon[0].midiNumber, bassCommon.at(-1).midiNumber], [41, 60])
  assert.deepEqual([bassExtended[0].midiNumber, bassExtended.at(-1).midiNumber], [36, 60])
  assert.equal(
    sightReadingNotes.getSightReadingNotes({ clefMode: 'mixed', range: 'basic' }).length,
    trebleBasic.length + bassBasic.length
  )
  assert.ok([...trebleExtended, ...bassExtended].every((note) => Number.isFinite(note.staffPosition)))
})

test('十二大调、升降号名称与练习序列', () => {
  assert.equal(scalePatterns.MAJOR_SCALE_PATTERNS.length, 12)
  assert.equal(new Set(scalePatterns.MAJOR_SCALE_PATTERNS.map((scale) => scale.key)).size, 12)

  const fSharp = scalePatterns.getMajorScaleByKey('F#')
  assert.equal(fSharp.noteNames[6], 'E#4')
  assert.equal(fSharp.notes[6], 65)
  assert.ok(scalePatterns.getMajorScaleByKey('Bb').noteNames.includes('Bb3'))
  assert.ok(scalePatterns.getMajorScaleByKey('Db').noteNames.includes('Gb3'))

  const cMajor = scalePatterns.getMajorScaleByKey('C')
  assert.equal(scalePatterns.createScalePracticeSteps(cMajor, 'right-ascending').length, 8)
  assert.equal(scalePatterns.createScalePracticeSteps(cMajor, 'right-up-down').length, 15)
  assert.ok(scalePatterns.createScalePracticeSteps(cMajor, 'both-ascending').every((step) => step.notes.length === 2))
})

test('自然三和弦、转位与归组窗口', () => {
  assert.equal(chordPatterns.BASE_TRIADS.length, 6)
  assert.equal(chordPatterns.CHORD_INPUT_WINDOW_MS, 150)
  assert.deepEqual(chordPatterns.BASE_TRIADS.find((chord) => chord.id === 'd-minor').notes, [62, 65, 69])
  assert.equal(chordPatterns.getChordTargets('both', 'all').length, 18)

  const cTargets = chordPatterns.getChordTargets('major', 'all').filter((target) => target.baseId === 'c-major')
  assert.deepEqual(cTargets.find((target) => target.inversion === 'root').notes, [60, 64, 67])
  assert.deepEqual(cTargets.find((target) => target.inversion === 'first').notes, [64, 67, 72])
  assert.deepEqual(cTargets.find((target) => target.inversion === 'second').notes, [67, 72, 76])
})

test('四个节奏模板与目标时间线', () => {
  assert.equal(rhythmPatterns.RHYTHM_PATTERNS.length, 4)
  const quarterTargets = rhythmPatterns.createRhythmTargets(
    rhythmPatterns.getRhythmPatternById('quarter-basic'),
    1000
  )
  const eighthTargets = rhythmPatterns.createRhythmTargets(
    rhythmPatterns.getRhythmPatternById('eighth-notes'),
    1000
  )
  const restTargets = rhythmPatterns.createRhythmTargets(
    rhythmPatterns.getRhythmPatternById('quarter-rests'),
    1000
  )

  assert.equal(quarterTargets.length, 16)
  assert.equal(eighthTargets.length, 32)
  assert.equal(restTargets.filter((target) => target.type === 'rest').length, 8)
  assert.equal(eighthTargets[1].timeMs, 500)
})

test('四个左右手协调模板与八分格时间线', () => {
  assert.equal(coordinationPatterns.COORDINATION_PATTERNS.length, 4)
  assert.ok(coordinationPatterns.COORDINATION_PATTERNS.every((pattern) => pattern.steps.length === 8))

  const timeline = coordinationPatterns.createCoordinationTimeline(
    coordinationPatterns.getCoordinationPattern('hands-together'),
    4,
    500
  )

  assert.equal(timeline.length, 32)
  assert.equal(timeline[1].expectedTimeMs, 500)
  assert.equal(timeline[8].measureIndex, 1)
  assert.equal(timeline[8].expectedTimeMs, 4000)
})

test('练习记录损坏容错、200 条上限与今日加权统计', () => {
  class MemoryStorage {
    constructor() {
      this.values = new Map()
    }
    getItem(key) {
      return this.values.has(key) ? this.values.get(key) : null
    }
    setItem(key, value) {
      this.values.set(key, String(value))
    }
    removeItem(key) {
      this.values.delete(key)
    }
  }

  const localStorage = new MemoryStorage()
  global.window = { localStorage, dispatchEvent() {} }
  global.CustomEvent = class CustomEvent {
    constructor(type) {
      this.type = type
    }
  }

  const storage = require('../src/renderer/src/utils/practiceRecordStorage.ts')
  const originalWarn = console.warn
  console.warn = () => undefined

  try {
    localStorage.setItem(storage.PRACTICE_RECORD_STORAGE_KEY, '{bad json')
    assert.deepEqual(storage.readPracticeRecords(), [])

    storage.clearPracticeRecords()
    const baseTime = Date.now() - 205000
    for (let index = 0; index < 205; index += 1) {
      const timestamp = new Date(baseTime + index * 1000).toISOString()
      const result = storage.savePracticeRecord({
        id: `record-${index}`,
        schemaVersion: 1,
        module: 'sight-reading',
        moduleName: '识谱练习',
        title: '回归测试',
        startedAt: timestamp,
        endedAt: timestamp,
        durationMs: 1000,
        status: 'completed',
        totalEvents: 10,
        correctEvents: 8,
        accuracy: 80,
        wrongNoteCount: 2,
        missingNoteCount: 0,
        extraNoteCount: 0,
        earlyCount: 0,
        lateCount: 0,
        restErrorCount: 0,
        syncWarningCount: 0,
        settings: {},
        details: {},
        mistakes: []
      })
      assert.equal(result.success, true)
    }

    assert.equal(storage.readPracticeRecords().length, 200)

    const now = new Date()
    const today = now.toISOString()
    const todayStats = storage.calculateTodayPracticeStats([
      { status: 'completed', endedAt: today, durationMs: 1000, totalEvents: 10, correctEvents: 10 },
      { status: 'completed', endedAt: today, durationMs: 2000, totalEvents: 90, correctEvents: 45 }
    ], now)

    assert.equal(todayStats.durationMs, 3000)
    assert.equal(todayStats.completedSessions, 2)
    assert.equal(todayStats.accuracy, 55)
    assert.equal(storage.calculateTodayPracticeStats([], now).accuracy, 0)
  } finally {
    console.warn = originalWarn
    delete global.window
    delete global.CustomEvent
  }
})

let failed = 0

for (const { name, callback } of tests) {
  try {
    callback()
    process.stdout.write(`PASS ${name}\n`)
  } catch (error) {
    failed += 1
    process.stderr.write(`FAIL ${name}\n${error.stack || error}\n`)
  }
}

if (failed > 0) {
  process.stderr.write(`\n${failed} 项回归检查失败。\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`\n${tests.length} 项回归检查全部通过。\n`)
}
