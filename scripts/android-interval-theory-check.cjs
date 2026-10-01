const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename
    }).outputText
    module._compile(output, filename)
  }
}

const core = require('../prototype/android-tablet-v1/src/musicTheory/intervals/index.ts')
const chordTheory = require('../prototype/android-tablet-v1/src/musicTheory/chords/index.ts')
const intervalQuery = require('../prototype/android-tablet-v1/src/intervalQueryTool.ts')

const tests = []
const test = (id, title, callback) => tests.push({ id, title, callback })
const note = (letter, accidental, octave) => core.createIntervalSpelledNote(letter, accidental, octave)
const build = (root, id) => core.buildInterval(root, core.getIntervalType(id))
const label = (pitch) => chordTheory.formatWrittenPitch(pitch)

test('IT01', 'catalog contains exactly the 26 formal identities', () => {
  assert.deepEqual(core.INTERVAL_TYPES.map(({ id, chineseName, degree, semitones }) => [id, chineseName, degree, semitones]), [
    ['perfectUnison', '纯一度', 1, 0],
    ['augmentedUnison', '增一度', 1, 1],
    ['diminishedSecond', '减二度', 2, 0],
    ['minorSecond', '小二度', 2, 1],
    ['majorSecond', '大二度', 2, 2],
    ['augmentedSecond', '增二度', 2, 3],
    ['diminishedThird', '减三度', 3, 2],
    ['minorThird', '小三度', 3, 3],
    ['majorThird', '大三度', 3, 4],
    ['augmentedThird', '增三度', 3, 5],
    ['diminishedFourth', '减四度', 4, 4],
    ['perfectFourth', '纯四度', 4, 5],
    ['augmentedFourth', '增四度', 4, 6],
    ['diminishedFifth', '减五度', 5, 6],
    ['perfectFifth', '纯五度', 5, 7],
    ['augmentedFifth', '增五度', 5, 8],
    ['diminishedSixth', '减六度', 6, 7],
    ['minorSixth', '小六度', 6, 8],
    ['majorSixth', '大六度', 6, 9],
    ['augmentedSixth', '增六度', 6, 10],
    ['diminishedSeventh', '减七度', 7, 9],
    ['minorSeventh', '小七度', 7, 10],
    ['majorSeventh', '大七度', 7, 11],
    ['augmentedSeventh', '增七度', 7, 12],
    ['diminishedOctave', '减八度', 8, 11],
    ['perfectOctave', '纯八度', 8, 12]
  ])
  assert.ok(core.INTERVAL_TYPES.every(Object.isFrozen))
})

test('IT02', 'augmented fourth and diminished fifth retain distinct identities and spelling', () => {
  const augmented = build(note('C', 0, 4), 'augmentedFourth')
  const diminished = build(note('C', 0, 4), 'diminishedFifth')
  assert.equal(augmented.eligible, true)
  assert.equal(diminished.eligible, true)
  assert.deepEqual([label(augmented.target), augmented.target.soundingMidi], ['F♯4', 66])
  assert.deepEqual([label(diminished.target), diminished.target.soundingMidi], ['G♭4', 66])
  assert.notEqual(core.getIntervalType('augmentedFourth').id, core.getIntervalType('diminishedFifth').id)
  assert.notEqual(augmented.target.letter, diminished.target.letter)
})

test('IT03', 'fixed theory cases preserve exact degree semitone and octave spelling', () => {
  const cases = [
    [note('C', 0, 4), 'augmentedUnison', 'C♯4', 1, 1],
    [note('C', 1, 4), 'diminishedSecond', 'D♭4', 2, 0],
    [note('C', 0, 4), 'augmentedSecond', 'D♯4', 2, 3],
    [note('C', 0, 4), 'minorThird', 'E♭4', 3, 3],
    [note('C', 0, 4), 'majorThird', 'E4', 3, 4],
    [note('C', 0, 4), 'diminishedFourth', 'F♭4', 4, 4],
    [note('C', 0, 4), 'augmentedFourth', 'F♯4', 4, 6],
    [note('C', 0, 4), 'diminishedFifth', 'G♭4', 5, 6],
    [note('C', 0, 4), 'augmentedFifth', 'G♯4', 5, 8],
    [note('C', 0, 4), 'minorSixth', 'A♭4', 6, 8],
    [note('C', 0, 4), 'augmentedSixth', 'A♯4', 6, 10],
    [note('C', 0, 4), 'minorSeventh', 'B♭4', 7, 10],
    [note('C', 0, 4), 'augmentedSeventh', 'B♯4', 7, 12],
    [note('C', 0, 4), 'diminishedOctave', 'C♭5', 8, 11],
    [note('C', 0, 4), 'perfectOctave', 'C5', 8, 12]
  ]
  for (const [root, id, expectedLabel, degree, semitones] of cases) {
    const result = build(root, id)
    assert.equal(result.eligible, true)
    assert.equal(label(result.target), expectedLabel)
    assert.equal(result.target.soundingMidi - root.soundingMidi, semitones)
    assert.equal(intervalQuery.getIntervalNumber(root, result.target), degree)
  }
})

test('IT04', 'F1 and G6 are exact inclusive range boundaries', () => {
  assert.equal(core.INTERVAL_PRACTICE_MIN_MIDI, 29)
  assert.equal(core.INTERVAL_PRACTICE_MAX_MIDI, 91)
  assert.ok(core.INTERVAL_PRACTICE_ROOTS.some((root) => label(root) === 'F1' && root.soundingMidi === 29))
  assert.ok(core.INTERVAL_PRACTICE_ROOTS.some((root) => label(root) === 'G6' && root.soundingMidi === 91))
  assert.equal(Math.min(...core.INTERVAL_PRACTICE_ROOTS.map((root) => root.soundingMidi)), 29)
  assert.equal(Math.max(...core.INTERVAL_PRACTICE_ROOTS.map((root) => root.soundingMidi)), 91)
})

test('IT05', 'high roots whose target exceeds G6 are excluded without mutation', () => {
  const octaveCandidates = core.INTERVAL_PRACTICE_CANDIDATES.perfectOctave
  assert.ok(!octaveCandidates.some((question) => question.rootMidi > 79))
  assert.ok(!octaveCandidates.some((question) => label(question.root) === 'G6'))
  assert.ok(octaveCandidates.every((question) => question.targetMidi <= 91))
})

test('IT06', 'double-sharp and double-flat constructions are explicit but never quiz candidates', () => {
  const doubleSharp = build(note('C', 1, 4), 'augmentedFourth')
  const doubleFlat = build(note('C', -1, 4), 'diminishedFifth')
  assert.deepEqual([doubleSharp.eligible, doubleSharp.reason, doubleSharp.target.letter, doubleSharp.target.accidental], [false, 'unsupported-accidental', 'F', 2])
  assert.deepEqual([doubleFlat.eligible, doubleFlat.reason, doubleFlat.target.letter, doubleFlat.target.accidental], [false, 'unsupported-accidental', 'G', -2])
  const allCandidates = Object.values(core.INTERVAL_PRACTICE_CANDIDATES).flat()
  assert.ok(!allCandidates.some((question) => Math.abs(question.target.accidental) > 1))
})

test('IT07', 'enharmonic pitches remain separate written notes', () => {
  const sharp = note('F', 1, 4)
  const flat = note('G', -1, 4)
  assert.equal(sharp.soundingMidi, flat.soundingMidi)
  assert.notDeepEqual(sharp, flat)
  assert.deepEqual([label(sharp), label(flat)], ['F♯4', 'G♭4'])
})

test('IT08', 'zones are continuous mutually exclusive and use sounding pitch at the C6-D6 gap', () => {
  assert.deepEqual(core.INTERVAL_ZONE_MIDI_RANGES, {
    LOW_EXTENSION: { minMidi: 29, maxMidi: 35 },
    CORE: { minMidi: 36, maxMidi: 85 },
    HIGH_EXTENSION: { minMidi: 86, maxMidi: 91 }
  })
  const expected = new Map([[29, 'LOW_EXTENSION'], [35, 'LOW_EXTENSION'], [36, 'CORE'], [84, 'CORE'], [85, 'CORE'], [86, 'HIGH_EXTENSION'], [91, 'HIGH_EXTENSION']])
  for (let midi = 29; midi <= 91; midi += 1) {
    const zone = core.getIntervalPracticeZone(midi)
    assert.ok(['LOW_EXTENSION', 'CORE', 'HIGH_EXTENSION'].includes(zone))
    if (expected.has(midi)) assert.equal(zone, expected.get(midi))
  }
})

test('IT09', 'all deterministic candidates satisfy every range spelling and identity invariant', () => {
  let invalidCount = 0
  let total = 0
  for (const intervalType of core.INTERVAL_TYPES) {
    const candidates = core.INTERVAL_PRACTICE_CANDIDATES[intervalType.id]
    assert.ok(candidates.length > 0, intervalType.id)
    for (const question of candidates) {
      total += 1
      const errors = core.validateIntervalPracticeQuestion(question)
      invalidCount += errors.length > 0 ? 1 : 0
      assert.deepEqual(errors, [])
      assert.equal(question.intervalType, intervalType)
      assert.ok(Number.isInteger(question.rootMidi) && Number.isInteger(question.targetMidi))
      assert.ok(Number.isFinite(question.rootMidi) && Number.isFinite(question.targetMidi))
      assert.ok(question.rootMidi >= 29 && question.rootMidi <= 91)
      assert.ok(question.targetMidi >= 29 && question.targetMidi <= 91)
      assert.ok(Math.abs(question.root.accidental) <= 1 && Math.abs(question.target.accidental) <= 1)
      assert.equal(question.targetMidi - question.rootMidi, intervalType.semitones)
      assert.equal(intervalQuery.getIntervalNumber(question.root, question.target), intervalType.degree)
      assert.equal(intervalQuery.getIntervalQueryResult(question.root, question.target).intervalName, intervalType.chineseName)
    }
  }
  assert.ok(total > 0)
  assert.equal(invalidCount, 0)
})

test('IT10', 'catalog lookup and note construction reject malformed domain inputs', () => {
  assert.throws(() => core.getIntervalType('tritone'), /Unknown interval type/)
  assert.throws(() => core.createIntervalSpelledNote('C', 0, 4.5), /Octave/)
  assert.throws(() => core.getIntervalPracticeZone(28), /outside/)
  assert.throws(() => core.getIntervalPracticeZone(92), /outside/)
  assert.throws(() => core.buildInterval({ letter: 'C', accidental: 0, octave: 4, soundingMidi: 61 }, core.getIntervalType('majorThird')), /does not match/)
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

const counts = Object.fromEntries(core.INTERVAL_TYPES.map((interval) => [interval.id, core.INTERVAL_PRACTICE_CANDIDATES[interval.id].length]))
const candidates = Object.values(core.INTERVAL_PRACTICE_CANDIDATES).flat()
const invalidCount = candidates.filter((question) => core.validateIntervalPracticeQuestion(question).length > 0).length
process.stdout.write(`\nINTERVAL_TYPES=${core.INTERVAL_TYPES.length}\n`)
process.stdout.write(`CANDIDATE_COUNTS=${JSON.stringify(counts)}\n`)
process.stdout.write(`CANDIDATE_TOTAL=${candidates.length}\n`)
process.stdout.write(`INVALID_COUNT=${invalidCount}\n`)
process.stdout.write(`${passed}/${tests.length} Android Interval Theory contract groups PASS\n`)
if (passed !== tests.length || invalidCount !== 0) process.exitCode = 1
