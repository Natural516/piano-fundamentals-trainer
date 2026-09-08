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

const root = path.resolve(__dirname, '..')
const theory = require('../prototype/android-tablet-v1/src/musicTheory/chords/index.ts')
const { ChordPracticeRuntime } = require('../prototype/android-tablet-v1/src/chordPractice/runtime/index.ts')
const settingsCore = require('../prototype/android-tablet-v1/src/chordPractice/settings.ts')
const mainSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/main.tsx'), 'utf8')
const sequentialSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/musicTheory/chords/sequentialPractice.ts'), 'utf8')
const runtimeSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/chordPractice/runtime/core.ts'), 'utf8')

const tests = []
const test = (id, title, callback) => tests.push({ id, title, callback })
const identityKey = theory.chordQuestionIdentityKey
const zeroRng = () => 0
const labels = (tones) => tones.map(theory.formatWrittenPitchClass)

class MemoryPreferences {
  constructor(initial = {}) { this.values = new Map(Object.entries(initial)) }
  async get({ key }) { return { value: this.values.get(key) ?? null } }
  async set({ key, value }) { this.values.set(key, value) }
  async keys() { return { keys: [...this.values.keys()] } }
}

class FakeTime {
  constructor() { this.value = 0; this.nextId = 0; this.jobs = new Map() }
  now = () => this.value
  schedule = (callback, delayMs) => { const id = ++this.nextId; this.jobs.set(id, { callback, at: this.value + delayMs }); return id }
  cancel = (id) => { this.jobs.delete(id) }
}

test('CSEQ01', 'frozen key order contains exactly the 15 supported Major Keys', () => {
  assert.deepEqual(theory.CHORD_SEQUENTIAL_MAJOR_KEY_IDS, ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'E', 'Ab', 'B', 'Db', 'Fs', 'Gb', 'Cs', 'Cb'])
})

test('CSEQ02', '10 and 20 use the same seven root-position diatonic triads', () => {
  const ten = theory.getSequentialQuestionPool('C', 10)
  const twenty = theory.getSequentialQuestionPool('C', 20)
  assert.equal(ten.length, 7)
  assert.deepEqual(ten, twenty)
  assert.deepEqual(ten.map((item) => item.qualityId), ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'])
  assert.ok(ten.every((item) => item.inversionIndex === 0))
})

test('CSEQ03', '50 uses exactly seven triad roots plus seven seventh roots', () => {
  const pool = theory.getSequentialQuestionPool('C', 50)
  assert.equal(pool.length, 14)
  assert.equal(pool.filter((item) => theory.getChordQuality(item.qualityId).family === 'triad').length, 7)
  assert.equal(pool.filter((item) => theory.getChordQuality(item.qualityId).family === 'seventh').length, 7)
  assert.ok(pool.every((item) => item.inversionIndex === 0))
})

test('CSEQ04', '100 uses 21 triad positions and only seven root-position sevenths', () => {
  const pool = theory.getSequentialQuestionPool('Eb', 100)
  const triads = pool.filter((item) => theory.getChordQuality(item.qualityId).family === 'triad')
  const sevenths = pool.filter((item) => theory.getChordQuality(item.qualityId).family === 'seventh')
  assert.equal(pool.length, 28)
  assert.equal(triads.length, 21)
  assert.deepEqual(new Set(triads.map((item) => item.inversionIndex)), new Set([0, 1, 2]))
  assert.equal(sevenths.length, 7)
  assert.ok(sevenths.every((item) => item.inversionIndex === 0))
})

test('CSEQ05', 'endless uses all 49 triad and seventh positions', () => {
  const pool = theory.getSequentialQuestionPool('Fs', 'endless')
  assert.equal(pool.length, 49)
  assert.equal(new Set(pool.map(identityKey)).size, 49)
  assert.equal(pool.filter((item) => theory.getChordQuality(item.qualityId).family === 'triad').length, 21)
  assert.equal(pool.filter((item) => theory.getChordQuality(item.qualityId).family === 'seventh').length, 28)
})

test('CSEQ06', 'shuffle bags cover every identity once and avoid the exact cross-boundary repeat', () => {
  const bag = new theory.ChordSequentialShuffleBag('C', 'endless', zeroRng)
  const first = Array.from({ length: 49 }, () => bag.next())
  const second = Array.from({ length: 49 }, () => bag.next())
  assert.equal(new Set(first.map(identityKey)).size, 49)
  assert.equal(new Set(second.map(identityKey)).size, 49)
  assert.notEqual(identityKey(first.at(-1)), identityKey(second[0]))
  assert.doesNotMatch(sequentialSource, /\bwhile\s*\(|\bdo\s*\{/)
})

test('CSEQ07', 'fresh bags repeat the same allowed pool without retaining prior session position', () => {
  const first = new theory.ChordSequentialShuffleBag('Db', 10, zeroRng)
  const second = new theory.ChordSequentialShuffleBag('Db', 10, zeroRng)
  assert.deepEqual(Array.from({ length: 7 }, () => identityKey(first.next())), Array.from({ length: 7 }, () => identityKey(second.next())))
})

test('CSEQ08', 'Runtime locks mode and Major Key and keeps Wrong on the exact current question', () => {
  const time = new FakeTime()
  const runtime = new ChordPracticeRuntime({ clock: time, scheduler: time, rng: zeroRng })
  runtime.start({ mode: 'sequential', questionCount: 10, sequentialKey: 'Eb' })
  const before = runtime.snapshot
  assert.equal(before.mode, 'sequential')
  assert.equal(before.sequentialKey, 'Eb')
  const allowed = new Set(theory.getDiatonicTriadIdentities('Eb').map(identityKey))
  assert.ok(allowed.has(identityKey(before.questionIdentity)))
  const target = before.judgement.target.arpeggioMidi[0]
  runtime.handleMidi({ id: 1, type: 'noteOn', timestamp: 10, midiNumber: target + 1, velocity: 100 })
  runtime.handleMidi({ id: 2, type: 'noteOff', timestamp: 11, midiNumber: target + 1, velocity: 0 })
  assert.deepEqual(runtime.snapshot.questionIdentity, before.questionIdentity)
  assert.equal(runtime.snapshot.questionGeneration, before.questionGeneration)
})

test('CSEQ09', 'comprehensive Runtime preserves the existing generator path', () => {
  const time = new FakeTime()
  const values = [0.999, 0.999, 0, 0]
  const runtime = new ChordPracticeRuntime({ clock: time, scheduler: time, rng: () => values.shift() })
  runtime.start({ mode: 'comprehensive', questionCount: 20 })
  assert.equal(runtime.snapshot.mode, 'comprehensive')
  assert.equal(runtime.snapshot.sequentialKey, null)
  assert.equal(runtime.snapshot.question.qualityId, 'diminished7')
  assert.match(runtimeSource, /generateChordPracticeQuestion/)
})

test('CSEQ10', 'Chord tones use current-inversion written voicing order with exact spelling', () => {
  const voicingLabels = (root, qualityId, inversion, rootOctave = 4) => labels(
    theory.createClosePositionPlacement(root, qualityId, inversion, rootOctave).writtenPitches
  )
  assert.deepEqual(voicingLabels({ letter: 'C', accidental: 0 }, 'major', 0), ['C', 'E', 'G'])
  assert.deepEqual(voicingLabels({ letter: 'C', accidental: 0 }, 'major', 1), ['E', 'G', 'C'])
  assert.deepEqual(voicingLabels({ letter: 'C', accidental: 0 }, 'major', 2), ['G', 'C', 'E'])
  assert.deepEqual(voicingLabels({ letter: 'A', accidental: -1 }, 'minor', 2), ['E♭', 'A♭', 'C♭'])
  assert.deepEqual(voicingLabels({ letter: 'C', accidental: 1 }, 'major7', 1), ['E♯', 'G♯', 'B♯', 'C♯'])
  assert.deepEqual(voicingLabels({ letter: 'B', accidental: -1 }, 'diminished7', 3, 3), ['A𝄫', 'B♭', 'D♭', 'F♭'])
})

test('CSEQ11', 'Chord settings default, corruption fallback and isolated key are deterministic', async () => {
  assert.deepEqual(settingsCore.parseChordSettings(null), { schemaVersion: 1, sequentialKey: 'C', showChordTones: true })
  for (const corrupt of ['{', '{}', '{"schemaVersion":2,"sequentialKey":"C","showChordTones":true}', '{"schemaVersion":1,"sequentialKey":"H","showChordTones":false}']) {
    assert.deepEqual(settingsCore.parseChordSettings(corrupt), settingsCore.DEFAULT_CHORD_SETTINGS)
  }
  const backend = new MemoryPreferences()
  const repository = new settingsCore.ChordSettingsRepository(backend)
  await repository.save({ schemaVersion: 1, sequentialKey: 'Eb', showChordTones: false })
  assert.deepEqual(await repository.load(), { schemaVersion: 1, sequentialKey: 'Eb', showChordTones: false })
  assert.deepEqual((await backend.keys()).keys, ['piano.v1.chord.settings'])
})

test('CSEQ12', 'Mode Select navigation, cards and modal copy are present without Sight navigation mutation', () => {
  assert.match(mainSource, /navigate\('chord-mode-select'\)/)
  assert.match(mainSource, /选择和弦练习方式/)
  assert.match(mainSource, /围绕单一大调，逐步扩展练习内容/)
  assert.match(mainSource, /从完整和弦范围中综合随机出题/)
  assert.match(mainSource, /练习方式说明/)
  assert.match(mainSource, /题目采用均衡题袋方式安排/)
  assert.match(mainSource, /'chord-mode-select': 'practice'/)
})

test('CSEQ13', 'Sequential-only key controls and common chord-tone switch stay in one Chord drawer', () => {
  assert.match(mainSource, /mode === 'sequential'/)
  assert.match(mainSource, /选择循序练习当前调/)
  assert.match(mainSource, /显示构成音/)
  assert.match(mainSource, /按当前转位顺序显示/)
  assert.match(mainSource, /showChordTones/)
  assert.match(mainSource, /liveQuestion\?\.blockNotes\.map\(formatWrittenPitchClass\)/)
  assert.doesNotMatch(mainSource, /piano\.v1\.sightReading\.settings/)
})

test('CSEQ14', 'Comprehensive quality catalog still contains augmented and diminished7 with frozen weights', () => {
  assert.ok(theory.TRIAD_QUALITY_IDS.includes('augmented'))
  assert.ok(theory.SEVENTH_QUALITY_IDS.includes('diminished7'))
  assert.deepEqual(theory.CHORD_PRACTICE_DEFAULT_WEIGHTS.family, { triad: 0.5, seventh: 0.5 })
  assert.deepEqual(theory.CHORD_PRACTICE_DEFAULT_WEIGHTS.qualityWithinFamily.triad, { major: 0.25, minor: 0.25, diminished: 0.25, augmented: 0.25 })
  assert.deepEqual(theory.CHORD_PRACTICE_DEFAULT_WEIGHTS.qualityWithinFamily.seventh, { major7: 0.2, dominant7: 0.2, minor7: 0.2, halfDiminished7: 0.2, diminished7: 0.2 })
})

test('CSEQ15', 'no mastery, adaptive insertion or delayed review policy exists in executable Sequential source', () => {
  assert.doesNotMatch(sequentialSource, /mastery|spaced|weak|adaptive|delayed/i)
  assert.equal(theory.CHORD_SEQUENTIAL_LEARNING_CONTRACT.masteryAlgorithm, false)
  assert.equal(theory.CHORD_SEQUENTIAL_LEARNING_CONTRACT.delayedErrorReview, false)
})

;(async () => {
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
  console.log(`\n${tests.length - failed}/${tests.length} Android Chord Sequential contract groups PASS`)
  if (failed > 0) process.exitCode = 1
})()
