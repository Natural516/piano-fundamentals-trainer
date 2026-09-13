const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      },
      fileName: filename
    }).outputText
    module._compile(output, filename)
  }
}

const core = require('../prototype/android-tablet-v1/src/musicTheory/chords/index.ts')
const root = path.resolve(__dirname, '..')
const generatorSource = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/musicTheory/chords/generator.ts'), 'utf8')

const pc = (letter, accidental = 0) => ({ letter, accidental })
const labels = (chord) => chord.tones.map(core.formatWrittenPitchClass)
const invertedLabels = (rootPitch, qualityId, inversion) => core
  .invertChordTones(core.spellChord(rootPitch, qualityId).tones, inversion)
  .map(core.formatWrittenPitchClass)
const scriptedRng = (...values) => {
  let index = 0
  return () => {
    assert.ok(index < values.length, 'scripted RNG exhausted')
    return values[index++]
  }
}

const tests = []
const test = (id, title, callback) => tests.push({ id, title, callback })

test('CT01', 'quality catalog contains exactly the frozen nine immutable definitions', () => {
  assert.deepEqual(core.CHORD_QUALITY_IDS, [
    'major', 'minor', 'diminished', 'augmented',
    'major7', 'dominant7', 'minor7', 'halfDiminished7', 'diminished7'
  ])
  const expected = {
    major: ['triad', [0, 4, 7], [1, 3, 5], '大三和弦'],
    minor: ['triad', [0, 3, 7], [1, 3, 5], '小三和弦'],
    diminished: ['triad', [0, 3, 6], [1, 3, 5], '减三和弦'],
    augmented: ['triad', [0, 4, 8], [1, 3, 5], '增三和弦'],
    major7: ['seventh', [0, 4, 7, 11], [1, 3, 5, 7], '大七和弦'],
    dominant7: ['seventh', [0, 4, 7, 10], [1, 3, 5, 7], '属七和弦'],
    minor7: ['seventh', [0, 3, 7, 10], [1, 3, 5, 7], '小七和弦'],
    halfDiminished7: ['seventh', [0, 3, 6, 10], [1, 3, 5, 7], '半减七和弦'],
    diminished7: ['seventh', [0, 3, 6, 9], [1, 3, 5, 7], '减七和弦']
  }
  for (const qualityId of core.CHORD_QUALITY_IDS) {
    const quality = core.getChordQuality(qualityId)
    assert.deepEqual([quality.family, quality.semitones, quality.diatonicDegrees, quality.chineseLabel], expected[qualityId])
    assert.ok(Object.isFrozen(quality))
    assert.ok(Object.isFrozen(quality.semitones))
  }
})

test('CT02', 'basic triads and sevenths use tertian written spelling', () => {
  const cases = [
    ['major', ['C', 'E', 'G']],
    ['minor', ['C', 'E♭', 'G']],
    ['diminished', ['C', 'E♭', 'G♭']],
    ['augmented', ['C', 'E', 'G♯']],
    ['major7', ['C', 'E', 'G', 'B']],
    ['dominant7', ['C', 'E', 'G', 'B♭']],
    ['minor7', ['C', 'E♭', 'G', 'B♭']],
    ['halfDiminished7', ['C', 'E♭', 'G♭', 'B♭']],
    ['diminished7', ['C', 'E♭', 'G♭', 'B𝄫']]
  ]
  for (const [qualityId, expected] of cases) assert.deepEqual(labels(core.spellChord(pc('C'), qualityId)), expected)
})

test('CT03', 'enharmonic roots retain their independent written identities', () => {
  assert.deepEqual(labels(core.spellChord(pc('C', 1), 'major')), ['C♯', 'E♯', 'G♯'])
  assert.deepEqual(labels(core.spellChord(pc('D', -1), 'major')), ['D♭', 'F', 'A♭'])
  assert.deepEqual(labels(core.spellChord(pc('E', 1), 'minor')), ['E♯', 'G♯', 'B♯'])
  assert.deepEqual(labels(core.spellChord(pc('G', 1), 'major')), ['G♯', 'B♯', 'D♯'])
  assert.deepEqual(labels(core.spellChord(pc('F', -1), 'major')), ['F♭', 'A♭', 'C♭'])
  assert.notDeepEqual(core.spellChord(pc('C', 1), 'major').tones, core.spellChord(pc('D', -1), 'major').tones)
})

test('CT04', 'theory represents required double accidentals without clamping', () => {
  const cases = [
    [pc('G', -1), 'minor', ['G♭', 'B𝄫', 'D♭']],
    [pc('C', -1), 'minor', ['C♭', 'E𝄫', 'G♭']],
    [pc('E', 1), 'major', ['E♯', 'G𝄪', 'B♯']],
    [pc('F', -1), 'minor', ['F♭', 'A𝄫', 'C♭']],
    [pc('D', 1), 'major', ['D♯', 'F𝄪', 'A♯']],
    [pc('A', 1), 'major', ['A♯', 'C𝄪', 'E♯']],
    [pc('C'), 'diminished7', ['C', 'E♭', 'G♭', 'B𝄫']]
  ]
  for (const [rootPitch, qualityId, expected] of cases) {
    assert.deepEqual(labels(core.spellChord(rootPitch, qualityId)), expected)
  }
  assert.equal(core.spellChord(pc('C', 3), 'major').tones[0].accidental, 3)
})

test('CT05', 'formatting is separate and exposes exact symbols and Chinese metadata', () => {
  const expectedSymbols = {
    major: 'C♯', minor: 'C♯m', diminished: 'C♯dim', augmented: 'C♯aug',
    major7: 'C♯maj7', dominant7: 'C♯7', minor7: 'C♯m7',
    halfDiminished7: 'C♯m7♭5', diminished7: 'C♯dim7'
  }
  for (const qualityId of core.CHORD_QUALITY_IDS) {
    assert.equal(core.formatChordSymbol(pc('C', 1), qualityId), expectedSymbols[qualityId])
  }
  assert.equal(core.formatAccidental(-2), '𝄫')
  assert.equal(core.formatAccidental(2), '𝄪')
  assert.throws(() => core.formatAccidental(3), /No display glyph/)
})

test('CT06', 'Practice root pool is generated as 21 structured roots with exact legal counts', () => {
  assert.equal(core.CHORD_PRACTICE_ROOTS.length, 21)
  assert.equal(new Set(core.CHORD_PRACTICE_ROOTS.map(core.formatWrittenPitchClass)).size, 21)
  assert.deepEqual(core.CHORD_PRACTICE_ROOTS.slice(0, 6).map(core.formatWrittenPitchClass), ['C♭', 'C', 'C♯', 'D♭', 'D', 'D♯'])
  const expectedCounts = {
    major: 17, minor: 17, diminished: 15, augmented: 13,
    major7: 16, dominant7: 15, minor7: 17, halfDiminished7: 15, diminished7: 19
  }
  for (const qualityId of core.CHORD_QUALITY_IDS) {
    assert.equal(core.CHORD_PRACTICE_LEGAL_ROOTS[qualityId].length, expectedCounts[qualityId], qualityId)
  }
})

test('CT07', 'Practice legality is quality-specific and diminished7 alone permits structural doubles', () => {
  const legal = [
    [pc('C', 1), 'major'], [pc('D', -1), 'major'], [pc('F', 1), 'minor'],
    [pc('C', -1), 'major'], [pc('E', 1), 'minor'], [pc('F', -1), 'major'],
    [pc('G', 1), 'major'], [pc('C'), 'diminished7']
  ]
  const illegal = [
    [pc('G', -1), 'minor'], [pc('C', -1), 'minor'], [pc('E', 1), 'major'],
    [pc('F', -1), 'minor'], [pc('D', 1), 'major'], [pc('A', 1), 'major']
  ]
  for (const [rootPitch, qualityId] of legal) assert.equal(core.isChordPracticeLegal(rootPitch, qualityId), true)
  for (const [rootPitch, qualityId] of illegal) assert.equal(core.isChordPracticeLegal(rootPitch, qualityId), false)
  assert.equal(core.getPracticeAccidentalLimit('diminished7'), 2)
  for (const qualityId of core.CHORD_QUALITY_IDS.filter((id) => id !== 'diminished7')) {
    assert.equal(core.getPracticeAccidentalLimit(qualityId), 1)
  }
})

test('CT08', 'inversions rotate tones, raise moved tones and preserve spelling', () => {
  assert.deepEqual(invertedLabels(pc('C'), 'major', 0), ['C', 'E', 'G'])
  assert.deepEqual(invertedLabels(pc('C'), 'major', 1), ['E', 'G', 'C'])
  assert.deepEqual(invertedLabels(pc('C'), 'major', 2), ['G', 'C', 'E'])
  assert.deepEqual(invertedLabels(pc('C'), 'major7', 0), ['C', 'E', 'G', 'B'])
  assert.deepEqual(invertedLabels(pc('C'), 'major7', 1), ['E', 'G', 'B', 'C'])
  assert.deepEqual(invertedLabels(pc('C'), 'major7', 2), ['G', 'B', 'C', 'E'])
  assert.deepEqual(invertedLabels(pc('C'), 'major7', 3), ['B', 'C', 'E', 'G'])
  assert.deepEqual(invertedLabels(pc('C', 1), 'major', 1), ['E♯', 'G♯', 'C♯'])
  assert.deepEqual(invertedLabels(pc('C'), 'diminished7', 3), ['B𝄫', 'C', 'E♭', 'G♭'])
  const cFirst = core.createClosePositionPlacement(pc('C'), 'major', 1, 4)
  assert.deepEqual(cFirst.writtenPitches.map(core.formatWrittenPitch), ['E4', 'G4', 'C5'])
})

test('CT09', 'written pitch to MIDI follows SPN C4=60 across enharmonic octave boundaries', () => {
  const cases = [
    [{ letter: 'C', accidental: 0, octave: 4 }, 60],
    [{ letter: 'C', accidental: 1, octave: 4 }, 61],
    [{ letter: 'D', accidental: -1, octave: 4 }, 61],
    [{ letter: 'B', accidental: 1, octave: 3 }, 60],
    [{ letter: 'C', accidental: -1, octave: 4 }, 59]
  ]
  for (const [pitch, expected] of cases) {
    const before = { ...pitch }
    assert.equal(core.writtenPitchToMidi(pitch), expected)
    assert.deepEqual(pitch, before)
  }
})

test('CT10', 'register enumeration returns only deterministic strict close-position placements', () => {
  assert.deepEqual(core.CHORD_PRACTICE_DEFAULT_REGISTER_WINDOW, { minMidi: 48, maxMidi: 96 })
  const cases = [
    [pc('C'), 'major', 0, 3],
    [pc('D', -1), 'dominant7', 3, 4],
    [pc('B', 1), 'major', 0, 3],
    [pc('C', -1), 'major7', 1, 4]
  ]
  for (const [rootPitch, qualityId, inversion, count] of cases) {
    const placements = core.enumerateClosePositionPlacements(rootPitch, qualityId, inversion, core.CHORD_PRACTICE_DEFAULT_REGISTER_WINDOW)
    assert.ok(placements.length > 0)
    assert.deepEqual(placements, [...placements].sort((a, b) => a.lowestMidi - b.lowestMidi || a.highestMidi - b.highestMidi))
    for (const placement of placements) {
      assert.equal(placement.writtenPitches.length, count)
      assert.equal(new Set(placement.soundingMidiNumbers).size, count)
      assert.ok(placement.lowestMidi >= 48 && placement.highestMidi <= 96)
      assert.ok(placement.highestMidi - placement.lowestMidi < 12)
      assert.ok(placement.soundingMidiNumbers.every((midi, index, notes) => index === 0 || midi > notes[index - 1]))
      placement.writtenPitches.forEach((pitch, index) => assert.equal(core.writtenPitchToMidi(pitch), placement.soundingMidiNumbers[index]))
    }
  }
  const bSharp = core.createClosePositionPlacement(pc('B', 1), 'major', 0, 3)
  assert.equal(core.formatWrittenPitch(bSharp.writtenPitches[0]), 'B♯3')
  assert.equal(bSharp.soundingMidiNumbers[0], 60)
  const cFlat = core.createClosePositionPlacement(pc('C', -1), 'major', 0, 4)
  assert.equal(core.formatWrittenPitch(cFlat.writtenPitches[0]), 'C♭4')
  assert.equal(cFlat.soundingMidiNumbers[0], 59)

  const cMajorPlacements = core.enumerateClosePositionPlacements(
    pc('C'),
    'major',
    0,
    core.CHORD_PRACTICE_DEFAULT_REGISTER_WINDOW
  )
  assert.ok(cMajorPlacements.some((placement) =>
    placement.soundingMidiNumbers.join(',') === '84,88,91'
  ), 'C6 E6 G6 must be available in the expanded register')
  assert.ok(cMajorPlacements.every((placement) => placement.highestMidi <= 96))

  const gMajorPlacements = core.enumerateClosePositionPlacements(
    pc('G'),
    'major',
    0,
    core.CHORD_PRACTICE_DEFAULT_REGISTER_WINDOW
  )
  assert.ok(gMajorPlacements.every((placement) => placement.soundingMidiNumbers.join(',') !== '91,95,98'))
})

test('CT11', 'weighted generator honors family and quality boundaries in the frozen selection order', () => {
  const firstTriad = core.generateChordPracticeQuestion({ rng: scriptedRng(0, 0, 0, 0) })
  assert.equal(firstTriad.family, 'triad')
  assert.equal(firstTriad.qualityId, 'major')
  const upperTriad = core.generateChordPracticeQuestion({ rng: scriptedRng(0.499999, 0.999999, 0.999999, 0.999999) })
  assert.equal(upperTriad.qualityId, 'augmented')
  const firstSeventh = core.generateChordPracticeQuestion({ rng: scriptedRng(0.5, 0, 0, 0) })
  assert.equal(firstSeventh.family, 'seventh')
  assert.equal(firstSeventh.qualityId, 'major7')
  const lastSeventh = core.generateChordPracticeQuestion({ rng: scriptedRng(0.999999, 0.999999, 0, 0) })
  assert.equal(lastSeventh.qualityId, 'diminished7')

  core.TRIAD_QUALITY_IDS.forEach((qualityId, index) => {
    const question = core.generateChordPracticeQuestion({ rng: scriptedRng(0, (index + 0.5) / 4, 0, 0) })
    assert.equal(question.qualityId, qualityId)
    assert.ok(question.inversionIndex >= 0 && question.inversionIndex <= 2)
  })
  core.SEVENTH_QUALITY_IDS.forEach((qualityId, index) => {
    const question = core.generateChordPracticeQuestion({ rng: scriptedRng(0.5, (index + 0.5) / 5, 0, 0) })
    assert.equal(question.qualityId, qualityId)
    assert.ok(question.inversionIndex >= 0 && question.inversionIndex <= 3)
  })
})

test('CT12', 'generated question contract contains one legal exact voicing for block and ascending arpeggio', () => {
  const question = core.generateChordPracticeQuestion({ rng: scriptedRng(0.8, 0.42, 0.73, 0.25) })
  assert.ok(core.isChordPracticeLegal(question.root, question.qualityId))
  assert.strictEqual(question.blockNotes, question.voicing.writtenPitches)
  assert.strictEqual(question.arpeggioNotes, question.voicing.writtenPitches)
  assert.strictEqual(question.soundingMidiNumbers, question.voicing.soundingMidiNumbers)
  assert.ok(question.soundingMidiNumbers.every((midi, index, notes) => index === 0 || midi > notes[index - 1]))
  assert.ok(question.register.lowestMidi >= 48 && question.register.highestMidi <= 96)
  for (const forbidden of ['judgement', 'midiState', 'timer', 'streak', 'historyRecord', 'persistenceId', 'uiState']) {
    assert.equal(Object.hasOwn(question, forbidden), false)
  }
})

test('CT13', 'invalid RNG values and invalid weights fail fast without hidden randomness', () => {
  for (const value of [-0.001, 1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => core.generateChordPracticeQuestion({ rng: () => value }), /RNG must return/)
  }
  assert.throws(() => core.generateChordPracticeQuestion({
    rng: () => 0,
    weights: {
      ...core.CHORD_PRACTICE_DEFAULT_WEIGHTS,
      family: { triad: 0.6, seventh: 0.5 }
    }
  }), /sum to 1/)
  assert.doesNotMatch(generatorSource, /Math\.random|Date\.now|randomUUID|\bwhile\s*\(|\bdo\s*\{/)
})

test('CT14', 'catalog-wide Practice invariants hold for every legal root quality inversion and register', () => {
  for (const qualityId of core.CHORD_QUALITY_IDS) {
    const quality = core.getChordQuality(qualityId)
    for (const rootPitch of core.CHORD_PRACTICE_LEGAL_ROOTS[qualityId]) {
      const chord = core.spellChord(rootPitch, qualityId)
      assert.equal(chord.tones.length, quality.semitones.length)
      chord.tones.forEach((tone, index) => {
        assert.equal(tone.diatonicDegree, quality.diatonicDegrees[index])
        const rootMidi = core.writtenPitchToMidi({ ...rootPitch, octave: 4 })
        const toneMidi = core.writtenPitchToMidi({ ...tone, octave: 4 + tone.octaveOffset })
        assert.equal(toneMidi - rootMidi, quality.semitones[index])
        assert.ok(Math.abs(tone.accidental) <= core.getPracticeAccidentalLimit(qualityId))
      })
      for (let inversion = 0; inversion < quality.semitones.length; inversion += 1) {
        const placements = core.enumerateClosePositionPlacements(rootPitch, qualityId, inversion, core.CHORD_PRACTICE_DEFAULT_REGISTER_WINDOW)
        assert.ok(placements.length > 0, `${core.formatWrittenPitchClass(rootPitch)} ${qualityId} inversion ${inversion}`)
        for (const placement of placements) {
          assert.equal(placement.writtenPitches.length, quality.semitones.length)
          assert.equal(new Set(placement.soundingMidiNumbers).size, quality.semitones.length)
          assert.ok(placement.lowestMidi >= 48 && placement.highestMidi <= 96)
          assert.ok(placement.highestMidi - placement.lowestMidi < 12)
          placement.soundingMidiNumbers.forEach((midi, index, notes) => {
            if (index > 0) assert.ok(midi > notes[index - 1])
            assert.equal(core.writtenPitchToMidi(placement.writtenPitches[index]), midi)
          })
        }
      }
    }
  }
})

test('CT15', 'anti-repeat identity excludes written Root plus Quality plus Inversion regardless of register', () => {
  const previous = Object.freeze({ root: pc('C', -1), qualityId: 'major', inversionIndex: 0 })
  const availableIdentityCount = core.CHORD_PRACTICE_LEGAL_ROOTS.major.length * 3 - 1
  for (let index = 0; index < availableIdentityCount; index += 1) {
    const next = core.generateChordPracticeQuestion({
      rng: scriptedRng(0, 0, (index + 0.5) / availableIdentityCount, index % 2 === 0 ? 0 : 0.999999),
      previousQuestionIdentity: previous
    })
    assert.equal(core.isSameChordPracticeQuestionIdentity(previous, core.getChordPracticeQuestionIdentity(next)), false)
  }

  const differentInversion = core.generateChordPracticeQuestion({
    rng: scriptedRng(0, 0, 0, 0),
    previousQuestionIdentity: previous
  })
  assert.deepEqual(differentInversion.root, previous.root)
  assert.equal(differentInversion.qualityId, previous.qualityId)
  assert.equal(differentInversion.inversionIndex, 1)
})

test('CT16', 'anti-repeat keeps frozen family and quality weights and consumes no reroll RNG', () => {
  assert.deepEqual(core.CHORD_PRACTICE_DEFAULT_WEIGHTS.family, { triad: 0.5, seventh: 0.5 })
  assert.deepEqual(core.CHORD_PRACTICE_DEFAULT_WEIGHTS.qualityWithinFamily.triad, {
    major: 0.25, minor: 0.25, diminished: 0.25, augmented: 0.25
  })
  assert.deepEqual(core.CHORD_PRACTICE_DEFAULT_WEIGHTS.qualityWithinFamily.seventh, {
    major7: 0.2, dominant7: 0.2, minor7: 0.2, halfDiminished7: 0.2, diminished7: 0.2
  })

  let calls = 0
  const rng = () => {
    calls += 1
    return 0
  }
  const previousQuestionIdentity = { root: pc('C', -1), qualityId: 'major', inversionIndex: 0 }
  const first = core.generateChordPracticeQuestion({ rng, previousQuestionIdentity })
  assert.equal(calls, 4, 'family, quality, Root×Inversion and register are selected exactly once')
  const second = core.generateChordPracticeQuestion({
    rng: scriptedRng(0, 0, 0, 0),
    previousQuestionIdentity
  })
  assert.deepEqual(first, second)
})

test('CT17', 'Chord product contract freezes Arpeggio-first flow, capture, feedback and module-specific reporting', () => {
  assert.deepEqual(core.CHORD_PRACTICE_PHASE_ORDER, ['arpeggio', 'block'])
  assert.equal(core.CHORD_PRACTICE_FLOW_CONTRACT.arpeggioFailureAfterRelease, 'restart-same-question-at-arpeggio-first-note')
  assert.equal(core.CHORD_PRACTICE_FLOW_CONTRACT.blockFailureAfterRelease, 'restart-same-question-at-arpeggio-first-note')
  assert.deepEqual(core.CHORD_BLOCK_CAPTURE_CONTRACT, {
    captureWindowMs: 150,
    calibrationStatus: 'FROZEN_FOR_CHORD_V1',
    startsOn: 'first-note-on',
    closesEarlyWhenAllExpectedNotesAppear: false,
    ignoresCc64ForJudgement: true,
    requiresPhysicalReleaseGate: true
  })
  assert.deepEqual(core.CHORD_QUESTION_COUNT_OPTIONS, [10, 20, 50, 100, 'endless'])
  assert.equal(core.CHORD_QUESTION_SUCCESS_FEEDBACK_MS, 800)
  assert.equal(core.CHORD_REPORT_PRODUCT_CONTRACT.module, 'chord')
  assert.equal(core.CHORD_REPORT_PRODUCT_CONTRACT.completionRateLabel, '完成率')
  assert.equal(core.CHORD_REPORT_PRODUCT_CONTRACT.completionRateFormula, 'firstPassCompleteQuestions / completedQuestions')
  assert.equal(core.CHORD_REPORT_PRODUCT_CONTRACT.hasQuestionTimeout, false)
  assert.equal(core.CHORD_REPORT_PRODUCT_CONTRACT.reuseSightReadingAccuracy, false)
  assert.equal(core.CHORD_REPORT_PRODUCT_CONTRACT.earlySaveScope, 'fully-settled-completed-questions-only')
  assert.equal(core.CHORD_HISTORY_CARD_PRODUCT_CONTRACT.rightPrimaryMetricLabel, '完成率')
  assert.equal(core.CHORD_HISTORY_CARD_PRODUCT_CONTRACT.infiniteCompletedDisplay, 'completed-without-denominator')
  assert.equal(core.CHORD_HISTORY_CARD_PRODUCT_CONTRACT.sightReadingRecordsRemainNonInteractive, true)
  assert.equal(core.CHORD_REPORT_DETAIL_PRODUCT_CONTRACT.productionNavigationImplemented, false)
  assert.equal(core.CHORD_REPORT_DETAIL_PRODUCT_CONTRACT.durableStorageImplemented, true)
  assert.equal(core.CHORD_TIMING_METRIC_CONTRACTS.questionStartLatency.label, '开始弹奏用时')
  assert.deepEqual(core.CHORD_TIMING_METRIC_CONTRACTS.questionStartLatency, {
    label: '开始弹奏用时',
    semantics: 'question-ready-to-first-arpeggio-stage-note-on-on-first-attempt',
    requiresCorrectness: false,
    retryReplacesSample: false,
    stopBeforeFirstArpeggioNoteOn: 'null'
  })
  assert.equal(core.CHORD_TIMING_METRIC_CONTRACTS.arpeggioDuration.label, '分解弹奏用时')
  assert.equal(core.CHORD_TIMING_METRIC_CONTRACTS.switchToBlockLatency.label, '切换柱式用时')
  assert.equal(core.CHORD_TIMING_METRIC_CONTRACTS.blockLandingSpread.label, '同时落键差')
  assert.equal(core.CHORD_TIMING_PRIMARY_AGGREGATE, 'median')
  assert.equal(core.CHORD_TIMING_EXCLUDES_PAUSED_TIME, true)
  assert.deepEqual(core.CHORD_FAILURE_TIMING_CONTRACT, {
    questionStartLatencyRestartsAfterFailure: false,
    successfulCycleMetricsUseFinalSuccessfulCycle: true,
    failedAttemptTimingsExcludedFromPrimarySummary: true
  })
})

test('CT18', 'all 15 Sequential Major Keys retain exact written scale spelling and sounding pattern', () => {
  const expected = {
    C: 'C D E F G A B', G: 'G A B C D E F♯', F: 'F G A B♭ C D E',
    D: 'D E F♯ G A B C♯', Bb: 'B♭ C D E♭ F G A', A: 'A B C♯ D E F♯ G♯',
    Eb: 'E♭ F G A♭ B♭ C D', E: 'E F♯ G♯ A B C♯ D♯', Ab: 'A♭ B♭ C D♭ E♭ F G',
    B: 'B C♯ D♯ E F♯ G♯ A♯', Db: 'D♭ E♭ F G♭ A♭ B♭ C', Fs: 'F♯ G♯ A♯ B C♯ D♯ E♯',
    Gb: 'G♭ A♭ B♭ C♭ D♭ E♭ F', Cs: 'C♯ D♯ E♯ F♯ G♯ A♯ B♯', Cb: 'C♭ D♭ E♭ F♭ G♭ A♭ B♭'
  }
  assert.deepEqual(core.CHORD_SEQUENTIAL_MAJOR_KEY_IDS, ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'E', 'Ab', 'B', 'Db', 'Fs', 'Gb', 'Cs', 'Cb'])
  for (const keyId of core.CHORD_SEQUENTIAL_MAJOR_KEY_IDS) {
    const scale = core.getChordSequentialMajorScale(keyId)
    assert.equal(scale.map(core.formatWrittenPitchClass).join(' '), expected[keyId])
    assert.equal(new Set(scale.map((pitch) => pitch.letter)).size, 7)
    const tonicMidi = core.writtenPitchToMidi({ ...scale[0], octave: 4 })
    assert.deepEqual(scale.map((pitch, index) => {
      const octave = 4 + (core.NOTE_LETTERS.indexOf(pitch.letter) < core.NOTE_LETTERS.indexOf(scale[0].letter) ? 1 : 0)
      return core.writtenPitchToMidi({ ...pitch, octave }) - tonicMidi
    }), [0, 2, 4, 5, 7, 9, 11])
  }
})

test('CT19', 'all 15 keys expose exact diatonic triad and seventh quality contracts with written tones', () => {
  const triadQualities = ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished']
  const seventhQualities = ['major7', 'minor7', 'minor7', 'major7', 'dominant7', 'minor7', 'halfDiminished7']
  for (const keyId of core.CHORD_SEQUENTIAL_MAJOR_KEY_IDS) {
    const scale = core.getChordSequentialMajorScale(keyId)
    const triads = core.getDiatonicTriadIdentities(keyId)
    const sevenths = core.getDiatonicSeventhIdentities(keyId)
    assert.deepEqual(triads.map((item) => item.qualityId), triadQualities)
    assert.deepEqual(sevenths.map((item) => item.qualityId), seventhQualities)
    for (const [index, identity] of triads.entries()) {
      assert.deepEqual(identity.root, scale[index])
      const expectedTones = [0, 2, 4].map((offset) => scale[(index + offset) % 7])
      assert.deepEqual(core.spellChord(identity.root, identity.qualityId).tones.map(({ letter, accidental }) => ({ letter, accidental })), expectedTones)
    }
    for (const [index, identity] of sevenths.entries()) {
      assert.deepEqual(identity.root, scale[index])
      const expectedTones = [0, 2, 4, 6].map((offset) => scale[(index + offset) % 7])
      assert.deepEqual(core.spellChord(identity.root, identity.qualityId).tones.map(({ letter, accidental }) => ({ letter, accidental })), expectedTones)
    }
  }
})

test('CT20', 'Sequential learning contract has no mastery, delayed review or automatic key switching', () => {
  assert.deepEqual(core.CHORD_PRACTICE_MODE_OPTIONS, ['sequential', 'comprehensive'])
  assert.equal(core.CHORD_SEQUENTIAL_LEARNING_CONTRACT.currentKeyChangesAutomatically, false)
  assert.equal(core.CHORD_SEQUENTIAL_LEARNING_CONTRACT.wrongConsumesAnotherBagItem, false)
  assert.equal(core.CHORD_SEQUENTIAL_LEARNING_CONTRACT.delayedErrorReview, false)
  assert.equal(core.CHORD_SEQUENTIAL_LEARNING_CONTRACT.masteryAlgorithm, false)
  assert.deepEqual(Object.fromEntries(Object.entries(core.CHORD_SEQUENTIAL_SCOPE_CONTRACT).map(([key, value]) => [key, value.bagSize])), {
    10: 7, 20: 7, 50: 14, 100: 28, endless: 49
  })
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

process.stdout.write('\nLEGAL PRACTICE ROOTS BY QUALITY\n')
for (const qualityId of core.CHORD_QUALITY_IDS) {
  const roots = core.CHORD_PRACTICE_LEGAL_ROOTS[qualityId].map(core.formatWrittenPitchClass)
  process.stdout.write(`${qualityId} (${roots.length}): ${roots.join(' ')}\n`)
}
process.stdout.write(`\n${passed}/${tests.length} Android Chord Theory contract groups PASS\n`)
if (passed !== tests.length) process.exitCode = 1
