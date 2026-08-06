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
const chordDefinitions = require('../src/renderer/src/utils/chordDefinitions.ts')
const chordProgressions = require('../src/renderer/src/utils/chordProgressions.ts')
const chordTrainingContents = require('../src/renderer/src/utils/chordTrainingContents.ts')
const timingSubdivisions = require('../src/renderer/src/utils/timingSubdivisions.ts')
const sightReadingNotes = require('../src/renderer/src/utils/sightReadingNotes.ts')
const sightReadingSession = require('../src/renderer/src/utils/sightReadingSession.ts')
const themeTypes = require('../src/renderer/src/utils/themeTypes.ts')
const themeStorage = require('../src/renderer/src/utils/themeStorage.ts')
const displayPreferences = require('../src/renderer/src/utils/displayPreferences.ts')
const pageRouting = require('../src/renderer/src/utils/pageRouting.ts')
const practiceRecordAdapters = require('../src/renderer/src/utils/practiceRecordAdapters.ts')
const trainingPlanStages = require('../src/renderer/src/utils/trainingPlanStages.ts')
const dailyTrainingPlan = require('../src/renderer/src/utils/dailyTrainingPlan.ts')
const weeklyTrainingPlan = require('../src/renderer/src/utils/weeklyTrainingPlan.ts')
const levelSixChecklist = require('../src/renderer/src/utils/levelSixChecklist.ts')
const trainingPlanStorage = require('../src/renderer/src/utils/trainingPlanStorage.ts')
const trainingPlanRecordLink = require('../src/renderer/src/utils/trainingPlanRecordLink.ts')

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

test('识谱谱表、两档音域与洗牌袋', () => {
  const trebleCommon = sightReadingNotes.getSightReadingNotesForClef('treble', 'common')
  const trebleExtended = sightReadingNotes.getSightReadingNotesForClef('treble', 'extended')
  const bassCommon = sightReadingNotes.getSightReadingNotesForClef('bass', 'common')
  const bassExtended = sightReadingNotes.getSightReadingNotesForClef('bass', 'extended')
  const grandCommon = sightReadingNotes.getSightReadingNotes({ staffMode: 'grand', range: 'common' })

  assert.deepEqual([trebleCommon[0].midiNumber, trebleCommon.at(-1).midiNumber], [55, 79])
  assert.deepEqual([trebleExtended[0].midiNumber, trebleExtended.at(-1).midiNumber], [48, 84])
  assert.deepEqual([bassCommon[0].midiNumber, bassCommon.at(-1).midiNumber], [41, 60])
  assert.deepEqual([bassExtended[0].midiNumber, bassExtended.at(-1).midiNumber], [36, 60])
  assert.equal(new Set(grandCommon.map((note) => note.midiNumber)).size, grandCommon.length)
  assert.equal(grandCommon.find((note) => note.midiNumber === 60).clef, 'treble')
  assert.ok([...trebleExtended, ...bassExtended].every((note) => Number.isFinite(note.staffPosition)))

  const sequence = []
  let previousMidiNumber = null
  while (sequence.length < 100) {
    const bag = sightReadingNotes.createShuffledSightReadingBag(grandCommon, previousMidiNumber, () => 0.42)
    for (const note of bag) {
      if (sequence.length >= 100) break
      sequence.push(note)
      previousMidiNumber = note.midiNumber
    }
  }

  assert.ok(sequence.every((note, index) => index === 0 || note.midiNumber !== sequence[index - 1].midiNumber))
  const occurrenceCounts = Array.from(new Set(grandCommon.map((note) => note.midiNumber)))
    .map((midiNumber) => sequence.filter((note) => note.midiNumber === midiNumber).length)
  assert.ok(Math.max(...occurrenceCounts) - Math.min(...occurrenceCounts) <= 1)
})

function createSightReadingMidiEvent(id, midiNumber, timestamp, type = 'noteOn') {
  return {
    id,
    type,
    midiNumber,
    noteName: midiNotes.midiNumberToNoteName(midiNumber),
    velocity: type === 'noteOn' ? 100 : 0,
    timestamp,
    deviceName: 'Regression MIDI'
  }
}

function prepareSightReadingQuestion(core, note, startedAt = 1000, latestEventId = null, timeLimitMs = 5000) {
  core.start(startedAt, latestEventId)
  core.beginQuestion(note)
  core.unlockQuestion(startedAt + 32, latestEventId, timeLimitMs)
}

test('识谱状态机正确、错误与超时后推进', () => {
  const notes = sightReadingNotes.getSightReadingNotesForClef('treble', 'common')

  const correctCore = new sightReadingSession.SightReadingSessionCore(notes)
  prepareSightReadingQuestion(correctCore, notes[0])
  const correct = correctCore.processMidiEvent(createSightReadingMidiEvent(1, notes[0].midiNumber, 1132))
  assert.equal(correct.outcome, 'correct')
  assert.equal(correctCore.counters.correct, 1)
  assert.equal(correctCore.completeFeedback(2), 'next')
  correctCore.beginQuestion(notes[1])
  assert.equal(correctCore.phase, 'display')

  const wrongCore = new sightReadingSession.SightReadingSessionCore(notes)
  prepareSightReadingQuestion(wrongCore, notes[0])
  const wrong = wrongCore.processMidiEvent(createSightReadingMidiEvent(1, notes[1].midiNumber, 1182))
  assert.equal(wrong.outcome, 'wrong_note')
  assert.equal(wrongCore.counters.wrong, 1)
  assert.equal(wrongCore.completeFeedback(2), 'next')
  wrongCore.beginQuestion(notes[1])
  assert.equal(wrongCore.phase, 'display')

  const timeoutCore = new sightReadingSession.SightReadingSessionCore(notes)
  prepareSightReadingQuestion(timeoutCore, notes[0])
  const timeout = timeoutCore.recordTimeout()
  assert.equal(timeout.outcome, 'timeout')
  assert.equal(timeoutCore.counters.timeout, 1)
  assert.equal(timeoutCore.completeFeedback(2), 'next')
})

test('识谱状态机按事件 ID 排除旧事件并区分同毫秒事件', () => {
  const notes = sightReadingNotes.getSightReadingNotesForClef('treble', 'common')
  const core = new sightReadingSession.SightReadingSessionCore(notes)
  prepareSightReadingQuestion(core, notes[0], 1000, 10)

  assert.equal(core.processMidiEvent(createSightReadingMidiEvent(9, notes[0].midiNumber, 1200)), null)
  assert.equal(core.counters.completed, 0)

  const accepted = core.processMidiEvent(createSightReadingMidiEvent(11, notes[0].midiNumber, 1032))
  assert.equal(accepted.outcome, 'correct')
  assert.equal(core.counters.completed, 1)
  assert.equal(core.processMidiEvent(createSightReadingMidiEvent(12, notes[1].midiNumber, 1032)), null)
  assert.equal(core.counters.completed, 1)

  const sameMillisecondCore = new sightReadingSession.SightReadingSessionCore(notes)
  prepareSightReadingQuestion(sameMillisecondCore, notes[0], 2000, 20)
  const sameMillisecond = sameMillisecondCore.processMidiEvent(
    createSightReadingMidiEvent(21, notes[0].midiNumber, 2032)
  )
  assert.equal(sameMillisecond.outcome, 'correct')
})

test('识谱状态机反应时间分账且全部超时保持 null', () => {
  const notes = sightReadingNotes.getSightReadingNotesForClef('treble', 'common')
  const core = new sightReadingSession.SightReadingSessionCore(notes)

  prepareSightReadingQuestion(core, notes[0], 1000)
  core.processMidiEvent(createSightReadingMidiEvent(1, notes[0].midiNumber, 1132))
  assert.equal(core.completeFeedback(3), 'next')
  core.beginQuestion(notes[1])
  core.unlockQuestion(2000, 1, 5000)
  core.processMidiEvent(createSightReadingMidiEvent(2, notes[2].midiNumber, 2250))
  assert.equal(core.completeFeedback(3), 'next')
  core.beginQuestion(notes[2])
  core.unlockQuestion(3000, 2, 5000)
  core.recordTimeout()

  assert.deepEqual(sightReadingSession.getSightReadingReactionSummary(core.counters.reactionTimes), {
    averageReactionMs: 175,
    fastestReactionMs: 100,
    slowestReactionMs: 250
  })
  assert.equal(core.counters.wrongNoteCounts[notes[1].midiNumber], 1)
  assert.equal(core.counters.timeoutNoteCounts[notes[2].midiNumber], 1)

  const allTimeoutCore = new sightReadingSession.SightReadingSessionCore(notes)
  prepareSightReadingQuestion(allTimeoutCore, notes[0])
  allTimeoutCore.recordTimeout()
  assert.deepEqual(sightReadingSession.getSightReadingReactionSummary(allTimeoutCore.counters.reactionTimes), {
    averageReactionMs: null,
    fastestReactionMs: null,
    slowestReactionMs: null
  })
})

test('识谱状态机暂停期间不超时并在恢复后续用剩余时间', () => {
  const notes = sightReadingNotes.getSightReadingNotesForClef('treble', 'common')
  const core = new sightReadingSession.SightReadingSessionCore(notes)
  prepareSightReadingQuestion(core, notes[0], 1000, null, 5000)

  core.pause(2000)
  assert.equal(core.remainingQuestionMs, 4032)
  assert.equal(core.recordTimeout(), null)
  assert.equal(core.counters.timeout, 0)

  core.resume(5000, 7)
  assert.equal(core.questionDeadlineMs, 9032)
  assert.equal(core.inputLocked, false)
  assert.equal(core.recordTimeout().outcome, 'timeout')
  assert.equal(core.recordTimeout(), null)
  assert.equal(core.counters.timeout, 1)
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

  assert.deepEqual(scalePatterns.MAJOR_SCALE_PATTERNS.map((scale) => scale.notes), [
    [60, 62, 64, 65, 67, 69, 71, 72],
    [55, 57, 59, 60, 62, 64, 66, 67],
    [62, 64, 66, 67, 69, 71, 73, 74],
    [57, 59, 61, 62, 64, 66, 68, 69],
    [64, 66, 68, 69, 71, 73, 75, 76],
    [59, 61, 63, 64, 66, 68, 70, 71],
    [54, 56, 58, 59, 61, 63, 65, 66],
    [53, 55, 57, 58, 60, 62, 64, 65],
    [58, 60, 62, 63, 65, 67, 69, 70],
    [51, 53, 55, 56, 58, 60, 62, 63],
    [56, 58, 60, 61, 63, 65, 67, 68],
    [49, 51, 53, 54, 56, 58, 60, 61]
  ])

  const twoOctave = scalePatterns.createScalePracticeSteps(cMajor, 'right-ascending', { range: 'two-octave' })
  assert.equal(twoOctave.length, 15)
  assert.deepEqual(twoOctave.map((step) => step.notes[0]), [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84])

  const speedTargets = scalePatterns.createScaleTargets(cMajor, 'right-speed', 1000, { loopCount: 2, notesPerBeat: 4 })
  assert.equal(speedTargets.length, 16)
  assert.equal(speedTargets[1].timeMs, 250)
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

test('七和弦四音集合与 4536251 级数顺序', () => {
  const cRootTargets = chordDefinitions.getSeventhChordTargets('root').filter((target) => target.root === 'C')
  const notesByQuality = Object.fromEntries(cRootTargets.map((target) => [target.quality, target.notes]))
  assert.deepEqual(notesByQuality.major7, [60, 64, 67, 71])
  assert.deepEqual(notesByQuality.dominant7, [60, 64, 67, 70])
  assert.deepEqual(notesByQuality.minor7, [60, 63, 67, 70])
  assert.deepEqual(notesByQuality['half-diminished7'], [60, 63, 66, 70])

  const thirdInversion = chordDefinitions.getSeventhChordTargets('all')
    .find((target) => target.root === 'C' && target.quality === 'major7' && target.inversion === 'third')
  assert.deepEqual(thirdInversion.notes, [71, 72, 76, 79])
  assert.deepEqual(chordProgressions.getChordProgressionById('4536251').degrees, [4, 5, 3, 6, 2, 5, 1])
  assert.equal(chordProgressions.createProgressionTargets('4536251', 'C', 'block').length, 7)
})

test('四个节奏模板与目标时间线', () => {
  const originalIds = ['quarter-basic', 'eighth-notes', 'quarter-rests', 'simple-syncopation']
  assert.ok(originalIds.every((id) => rhythmPatterns.getRhythmPatternById(id).id === id))
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

test('新增节奏三连音和三对二使用准确等分时间点', () => {
  const tripletPattern = rhythmPatterns.getRhythmPatternById('eighth-triplets')
  const tripletTargets = rhythmPatterns.createRhythmTargets(tripletPattern, 600, 1)
  assert.deepEqual(tripletTargets.slice(0, 3).map((target) => Math.round(target.timeMs)), [0, 200, 400])

  const points = timingSubdivisions.createPolyrhythmPoints(2, 3, 1)
  assert.deepEqual(points.map((point) => Math.round(point.position * 1_000_000) / 1_000_000), [0, 0.333333, 0.5, 0.666667])
  assert.deepEqual(points.map((point) => [point.left, point.right]), [[true, true], [false, true], [true, false], [false, true]])

  const rhythmPolyrhythm = rhythmPatterns.createRhythmTargets(
    rhythmPatterns.getRhythmPatternById('two-against-three-left-two'),
    600,
    1
  )
  assert.deepEqual(rhythmPolyrhythm.slice(0, 4).map((target) => Math.round(target.timeMs)), [0, 200, 300, 400])
})

test('附点、混合细分与两小节切分保留真实时值', () => {
  const dottedQuarter = rhythmPatterns.getRhythmPatternById('dotted-quarter-eighth')
  assert.deepEqual(dottedQuarter.beats.map((beat) => beat.position), [0, 1.5, 2, 3.5])
  assert.deepEqual(dottedQuarter.beats.map((beat) => beat.duration), [1.5, 0.5, 1.5, 0.5])

  const dottedEighth = rhythmPatterns.getRhythmPatternById('dotted-eighth-sixteenth')
  assert.deepEqual(dottedEighth.beats.slice(0, 2).map((beat) => beat.duration), [0.75, 0.25])

  const mixed = rhythmPatterns.createRhythmTargets(
    rhythmPatterns.getRhythmPatternById('eighth-triplet-alternation'),
    600,
    1
  )
  assert.deepEqual(mixed.map((target) => Math.round(target.timeMs)), [0, 300, 600, 900, 1200, 1400, 1600, 1800, 2000, 2200])

  const twoMeasure = rhythmPatterns.getRhythmPatternById('two-measure-mixed-syncopation')
  const twoMeasureTargets = rhythmPatterns.createRhythmTargets(twoMeasure, 600, 2)
  assert.equal(twoMeasure.lengthBeats, 8)
  assert.equal(twoMeasureTargets[twoMeasure.beats.length].timeMs, 4800)
})

test('四个左右手协调模板与八分格时间线', () => {
  const originalIds = ['hands-together', 'slow-left-fast-right', 'broken-chord-melody', 'offbeat-entry']
  assert.ok(originalIds.every((id) => coordinationPatterns.getCoordinationPattern(id).steps.length === 8))

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

test('左右手三对二只在理论同点比较同步', () => {
  const pattern = coordinationPatterns.getCoordinationPattern('polyrhythm-left-2-right-3')
  assert.equal(pattern.bpmDefault, 40)
  assert.ok(pattern.steps.some((step) => step.leftNotes.length > 0 && step.rightNotes.length === 0))
  assert.ok(pattern.steps.some((step) => step.rightNotes.length > 0 && step.leftNotes.length === 0))
  assert.ok(pattern.steps.every((step) =>
    coordinationPatterns.shouldCompareCoordinationSync(step) === (step.leftNotes.length > 0 && step.rightNotes.length > 0)
  ))

  const timeline = coordinationPatterns.createCoordinationTimeline(pattern, 1, 750)
  assert.deepEqual(timeline.slice(0, 4).map((step) => Math.round(step.expectedTimeMs)), [0, 500, 750, 1000])
})

test('新增训练内容 ID 唯一且原有内容仍可加载', () => {
  const ids = [
    ...rhythmPatterns.RHYTHM_PATTERNS.map((pattern) => `rhythm:${pattern.id}`),
    ...scalePatterns.SCALE_PRACTICE_MODES.map((mode) => `scale:${mode.id}`),
    ...chordTrainingContents.CHORD_TRAINING_CONTENTS.map((content) => `chord:${content.id}`),
    ...coordinationPatterns.COORDINATION_PATTERNS.map((pattern) => `coordination:${pattern.id}`)
  ]
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(rhythmPatterns.RHYTHM_PATTERNS.every((pattern) => pattern.name && pattern.description && pattern.difficulty))
  assert.ok(chordTrainingContents.CHORD_TRAINING_CONTENTS.every((content) => content.name && content.description && content.difficulty))
  assert.ok(coordinationPatterns.COORDINATION_PATTERNS.every((pattern) => pattern.name && pattern.description && pattern.difficulty))
  assert.equal(rhythmPatterns.getRhythmPatternById('quarter-basic').name, '四分音符基础')
  assert.equal(chordPatterns.getChordTargets('both', 'root').length, 6)
  assert.equal(coordinationPatterns.getCoordinationPattern('hands-together').name, '双手同步单音')
})

test('四模块新增内容可由设置状态连接到实际生成器', () => {
  const rhythmCategories = new Set(rhythmPatterns.RHYTHM_PATTERNS.map((pattern) => pattern.category))
  assert.deepEqual([...rhythmCategories].sort(), ['basic', 'dotted', 'mixed', 'polyrhythm', 'syncopation', 'triplet'])
  for (const pattern of rhythmPatterns.RHYTHM_PATTERNS) {
    assert.equal(rhythmPatterns.getRhythmPatternById(pattern.id).id, pattern.id)
    const targets = rhythmPatterns.createRhythmTargets(pattern, 600, 1)
    assert.ok(targets.length > 0)
    assert.ok(targets.every((target) => target.id.startsWith(pattern.id)))
  }

  const requiredScaleModes = [
    'right-ascending', 'left-ascending', 'right-descending', 'left-descending',
    'right-up-down', 'left-up-down', 'right-continuous', 'left-continuous', 'right-speed'
  ]
  const scaleModeIds = new Set(scalePatterns.SCALE_PRACTICE_MODES.map((mode) => mode.id))
  assert.ok(requiredScaleModes.every((mode) => scaleModeIds.has(mode)))
  const cMajor = scalePatterns.getMajorScaleByKey('C')
  assert.deepEqual(scalePatterns.createScalePracticeSteps(cMajor, 'right-descending').map((step) => step.notes[0]), [72, 71, 69, 67, 65, 64, 62, 60])
  assert.equal(scalePatterns.createScalePracticeSteps(cMajor, 'right-up-down', { range: 'two-octave' }).length, 29)
  assert.equal(scalePatterns.createScalePracticeSteps(cMajor, 'right-continuous', { loopCount: 4 }).length, 32)
  assert.deepEqual(
    [1, 2, 4].map((notesPerBeat) => scalePatterns.createScaleTargets(cMajor, 'right-speed', 750, { notesPerBeat })[1].timeMs),
    [750, 375, 187.5]
  )

  const chordCategories = new Set(chordTrainingContents.CHORD_TRAINING_CONTENTS.map((content) => content.category))
  assert.deepEqual([...chordCategories].sort(), ['4536251', 'arpeggio', 'progression', 'seventh', 'triad'])
  for (const quality of ['major7', 'dominant7', 'minor7', 'half-diminished7']) {
    const targets = chordDefinitions.getSeventhChordTargets('all', quality)
    assert.ok(targets.length > 0)
    assert.ok(targets.every((target) => target.quality === quality))
    assert.ok(targets.some((target) => target.inversion === 'third'))
  }
  for (const content of chordTrainingContents.CHORD_TRAINING_CONTENTS.filter((candidate) => candidate.progressionId)) {
    const targets = chordProgressions.createProgressionTargets(content.progressionId, 'G', content.inputStyle)
    assert.ok(targets.length > 0)
    assert.ok(targets.every((target) => target.keySignature === 'G' && target.inputStyle === content.inputStyle))
  }

  const originalCoordinationIds = ['hands-together', 'slow-left-fast-right', 'broken-chord-melody', 'offbeat-entry']
  assert.ok(originalCoordinationIds.every((id) => coordinationPatterns.getCoordinationPattern(id).id === id))
  const coordinationSignatures = coordinationPatterns.COORDINATION_PATTERNS.map((pattern) => JSON.stringify(
    coordinationPatterns.createCoordinationTimeline(pattern, 1, 500)
      .map((step) => [step.expectedTimeMs, step.leftNotes, step.rightNotes])
  ))
  assert.equal(new Set(coordinationSignatures).size, coordinationSignatures.length)

  const componentDirectory = '../src/renderer/src/components/'
  const rhythmPage = fs.readFileSync(require.resolve(`${componentDirectory}RhythmPracticePage.tsx`), 'utf8')
  const scalePage = fs.readFileSync(require.resolve(`${componentDirectory}ScalePracticePage.tsx`), 'utf8')
  const chordPage = fs.readFileSync(require.resolve(`${componentDirectory}ChordPracticePage.tsx`), 'utf8')
  const coordinationPage = fs.readFileSync(require.resolve(`${componentDirectory}CoordinationPracticePage.tsx`), 'utf8')
  const rhythmHook = fs.readFileSync(require.resolve('../src/renderer/src/hooks/useRhythmPractice.ts'), 'utf8')
  const scaleHook = fs.readFileSync(require.resolve('../src/renderer/src/hooks/useScalePractice.ts'), 'utf8')
  const chordHook = fs.readFileSync(require.resolve('../src/renderer/src/hooks/useChordPractice.ts'), 'utf8')
  const coordinationHook = fs.readFileSync(require.resolve('../src/renderer/src/hooks/useCoordinationPractice.ts'), 'utf8')
  assert.match(rhythmPage, /rhythm\.patterns\.filter/)
  assert.match(rhythmPage, /setSelectedPatternId\(draftPatternId\)/)
  assert.match(rhythmHook, /createRhythmTargets\(selectedPattern/)
  assert.match(scalePage, /scale\.modes\.map/)
  assert.match(scalePage, /setSelectedMode\(draftMode\)/)
  assert.match(scalePage, /setRange\(draftRange\)/)
  assert.match(scalePage, /setLoopCount\(draftLoopCount\)/)
  assert.match(scalePage, /setNotesPerBeat\(draftNotesPerBeat\)/)
  assert.match(scalePage, /setBpm\(draftBpm\)/)
  assert.match(scaleHook, /createScalePracticeSteps\(selectedScale, selectedMode, sequenceOptions\)/)
  assert.match(scaleHook, /createScaleTargets\(selectedScale, selectedMode, metronome\.beatDurationMs, sequenceOptions\)/)
  assert.match(chordPage, /chord\.contents\.filter/)
  assert.match(chordPage, /setSelectedContentId\(draftContentId\)/)
  assert.match(chordPage, /setSeventhQualityFilter\(draftSeventhQuality\)/)
  assert.match(chordHook, /getSeventhChordTargets\(inversionMode, seventhQualityFilter\)/)
  assert.match(chordHook, /createProgressionTargets\(selectedContent\.progressionId, keySignature, selectedContent\.inputStyle\)/)
  assert.match(coordinationPage, /coordination\.patterns\.filter/)
  assert.match(coordinationPage, /setSelectedPatternId\(draftPatternId\)/)
  assert.match(coordinationHook, /createCoordinationTimeline\(selectedPattern, measureCount, eighthNoteDurationMs\)/)
})

test('新增内容报告与记录保存实际设置且省略不适用字段', () => {
  const timing = {
    id: 'reachability-record',
    startedAt: '2026-08-03T00:00:00.000Z',
    endedAt: '2026-08-03T00:01:00.000Z',
    durationMs: 60000
  }
  const baseReport = {
    totalTargets: 4, correct: 3, wrongNote: 1, missingNote: 0, extraNote: 0,
    early: 0, late: 0, restError: 0, averageOffsetMs: 12, accuracy: 75
  }
  const rhythmRecord = practiceRecordAdapters.createRhythmRecord({
    timing, report: { ...baseReport, extraInput: 0 }, patternId: 'eighth-triplets',
    patternName: '一拍三个八分三连音', bpm: 80, tolerance: 'standard', difficulty: 'challenge'
  })
  assert.equal(rhythmRecord.contentId, 'eighth-triplets')
  assert.equal(rhythmRecord.contentName, '一拍三个八分三连音')
  assert.equal(rhythmRecord.difficulty, 'challenge')
  assert.equal(rhythmRecord.bpm, 80)
  assert.equal(rhythmRecord.practiceMode, 'rhythm-pattern')
  assert.equal(rhythmRecord.keySignature, undefined)

  const scaleRecord = practiceRecordAdapters.createScaleRecord({
    timing,
    report: {
      ...baseReport, keyName: 'G 大调', modeName: '右手节拍速度训练', bpm: 100, targetBpm: 100,
      loopCount: 4, completedNotes: 60, range: 'two-octave', notesPerBeat: 4,
      totalNotes: 60, bestStreak: 20, mostMissedNote: 'F#4'
    },
    key: 'G', mode: 'right-speed', tolerance: 'strict'
  })
  assert.equal(scaleRecord.bpm, 100)
  assert.equal(scaleRecord.loopCount, 4)
  assert.equal(scaleRecord.keySignature, 'G')
  assert.equal(scaleRecord.practiceMode, 'right-speed')

  const chordReport = {
    totalQuestions: 7, correct: 6, wrong: 1, missingNote: 1, extraNote: 0, wrongNote: 0,
    accuracy: 86, bestStreak: 6, mostMissedChord: 'G 大调 V 级大三和弦', mostMissedNote: 'D4',
    averageAttempts: 1.1, contentName: '4536251 分解', keySignature: 'G', roundCount: 2
  }
  const triadRecord = practiceRecordAdapters.createChordRecord({
    timing, report: { ...chordReport, contentName: 'C大调自然三和弦' }, chordType: 'both',
    seventhChordType: 'all', inversionMode: 'all', questionCount: 20,
    contentId: 'triad-identification', contentName: 'C大调自然三和弦', difficulty: 'basic',
    category: 'triad', inputStyle: 'block'
  })
  assert.equal(triadRecord.keySignature, undefined)
  assert.equal(triadRecord.loopCount, undefined)
  assert.equal(triadRecord.settings.seventhChordType, undefined)

  const progressionRecord = practiceRecordAdapters.createChordRecord({
    timing, report: chordReport, chordType: 'both', seventhChordType: 'all', inversionMode: 'root',
    questionCount: 20, contentId: '4536251-arpeggio', contentName: '4536251 分解', difficulty: 'challenge',
    category: '4536251', inputStyle: 'arpeggio', keySignature: 'G', roundCount: 2
  })
  assert.equal(progressionRecord.keySignature, 'G')
  assert.equal(progressionRecord.loopCount, 2)
  assert.equal(progressionRecord.practiceMode, '4536251:arpeggio')
  assert.match(progressionRecord.subtitle, /分解/)
  assert.doesNotMatch(progressionRecord.subtitle, /柱式/)

  const coordinationRecord = practiceRecordAdapters.createCoordinationRecord({
    timing,
    report: {
      patternName: '左手2、右手3', bpm: 40, measureCount: 4, toleranceLevel: 'standard',
      totalCells: 64, playableCells: 64, correct: 60, wrongNote: 1, missingNote: 1,
      extraNote: 1, restError: 0, early: 1, late: 0, syncWarning: 0, averageOffsetMs: 8,
      accuracy: 94, leftWrongCount: 2, rightWrongCount: 2, generalExtraCount: 0,
      hardestPosition: '第 2 小节 3+0.33', completedLoops: 4
    },
    patternId: 'polyrhythm-left-2-right-3', difficulty: 'challenge'
  })
  assert.equal(coordinationRecord.contentId, 'polyrhythm-left-2-right-3')
  assert.equal(coordinationRecord.contentName, '左手2、右手3')
  assert.equal(coordinationRecord.bpm, 40)
  assert.equal(coordinationRecord.loopCount, 4)
  assert.equal(coordinationRecord.keySignature, undefined)
})

test('四个核心练习页面使用统一交互结构', () => {
  const componentDirectory = '../src/renderer/src/components/'
  const pageFiles = [
    'RhythmPracticePage.tsx',
    'ScalePracticePage.tsx',
    'ChordPracticePage.tsx',
    'CoordinationPracticePage.tsx'
  ]
  const obsoleteLayoutClasses = [
    'rhythm-grid-layout',
    'rhythm-settings-panel',
    'rhythm-result-panel',
    'rhythm-report-panel',
    'scale-grid-layout',
    'scale-settings-panel',
    'scale-result-panel',
    'scale-report-panel',
    'chord-grid-layout',
    'chord-report-panel',
    'coordination-grid-layout',
    'coordination-feedback-panel',
    'coordination-report-panel'
  ]

  for (const pageFile of pageFiles) {
    const source = fs.readFileSync(require.resolve(`${componentDirectory}${pageFile}`), 'utf8')
    assert.match(source, /PracticePageHeader/, `${pageFile} 应复用统一页头与设置齿轮`)
    assert.match(source, /PracticeSettingsDrawer/, `${pageFile} 应复用设置抽屉`)
    assert.match(source, /PracticeStatBar/, `${pageFile} 应使用紧凑统计栏`)
    assert.match(source, /PracticeReportModal/, `${pageFile} 应使用报告弹窗`)
    assert.match(source, /usePracticeSessionRecorder/, `${pageFile} 应保留统一记录保存`)
    assert.match(source, /onPracticeRunningChange/, `${pageFile} 应接入统一退出确认`)

    for (const className of obsoleteLayoutClasses) {
      assert.equal(source.includes(className), false, `${pageFile} 不应再渲染旧布局 ${className}`)
    }
  }

  const pageHeaderSource = fs.readFileSync(require.resolve(`${componentDirectory}PracticePageHeader.tsx`), 'utf8')
  assert.match(pageHeaderSource, /practice-settings-trigger/, '统一页头应提供设置齿轮')

  const chordTargetSource = fs.readFileSync(require.resolve(`${componentDirectory}ChordTargetView.tsx`), 'utf8')
  assert.equal(chordTargetSource.includes('等待输入'), false, '和弦主卡片不应常驻等待输入面板')
})

test('统一页面改造保留核心判定常量与记录去重', () => {
  const scaleHookSource = fs.readFileSync(require.resolve('../src/renderer/src/hooks/useScalePractice.ts'), 'utf8')
  const rhythmHookSource = fs.readFileSync(require.resolve('../src/renderer/src/hooks/useRhythmPractice.ts'), 'utf8')
  const chordHookSource = fs.readFileSync(require.resolve('../src/renderer/src/hooks/useChordPractice.ts'), 'utf8')
  const coordinationHookSource = fs.readFileSync(require.resolve('../src/renderer/src/hooks/useCoordinationPractice.ts'), 'utf8')
  const recorderSource = fs.readFileSync(require.resolve('../src/renderer/src/hooks/usePracticeSessionRecorder.ts'), 'utf8')

  assert.match(rhythmHookSource, /usePracticeEngine/, '节奏练习应继续复用通用判定引擎')
  assert.match(scaleHookSource, /if \(type === 'wrong_note'\)/, '音阶错音专用分支必须保留')
  assert.match(scaleHookSource, /if \(type === 'missing_note'\)/, '音阶漏音专用分支必须保留')
  assert.match(chordHookSource, /CHORD_INPUT_WINDOW_MS/, '和弦 150ms 输入窗口必须保留')
  assert.equal(chordPatterns.CHORD_INPUT_WINDOW_MS, 150)
  assert.match(coordinationHookSource, /COORDINATION_SYNC_THRESHOLD_MS/, '左右手同步阈值必须保留')
  assert.equal(coordinationPatterns.COORDINATION_SYNC_THRESHOLD_MS, 100)
  assert.match(recorderSource, /savedSessionIdRef\.current === session\.id/, '练习记录会话去重必须保留')
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
    const metadataTimestamp = new Date().toISOString()
    storage.savePracticeRecord({
      id: 'record-with-content-metadata', schemaVersion: 1, module: 'scale', moduleName: '音阶练习',
      title: 'C 大调速度训练', startedAt: metadataTimestamp, endedAt: metadataTimestamp, durationMs: 1000,
      status: 'completed', totalEvents: 16, correctEvents: 14, accuracy: 88, wrongNoteCount: 2,
      missingNoteCount: 0, extraNoteCount: 0, earlyCount: 0, lateCount: 0, restErrorCount: 0,
      syncWarningCount: 0, contentId: 'C-right-speed-two-octave', contentName: 'C 大调速度训练',
      difficulty: 'challenge', bpm: 100, loopCount: 2, keySignature: 'C', practiceMode: 'right-speed',
      settings: {}, details: {}, mistakes: []
    })
    const metadataRecord = storage.readPracticeRecords()[0]
    assert.equal(metadataRecord.contentId, 'C-right-speed-two-octave')
    assert.equal(metadataRecord.bpm, 100)
    assert.equal(metadataRecord.loopCount, 2)
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

    const legacyRecords = storage.readPracticeRecords()
    assert.equal(legacyRecords.length, 200)
    assert.equal(legacyRecords[0].contentId, undefined)

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

test('主题模式存储容错与系统主题解析', () => {
  const values = new Map()
  const storage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    }
  }

  assert.equal(themeStorage.readThemeMode(storage), 'dark')
  values.set(themeStorage.THEME_STORAGE_KEY, 'light')
  assert.equal(themeStorage.readThemeMode(storage), 'light')
  values.set(themeStorage.THEME_STORAGE_KEY, 'invalid')
  assert.equal(themeStorage.readThemeMode(storage), 'dark')

  assert.equal(themeStorage.writeThemeMode('system', storage), true)
  assert.equal(values.get(themeStorage.THEME_STORAGE_KEY), 'system')
  assert.equal(themeTypes.resolveTheme('system', true), 'dark')
  assert.equal(themeTypes.resolveTheme('system', false), 'light')
  assert.equal(themeStorage.getSystemPrefersDark(() => ({ matches: true })), true)

  const failingStorage = {
    getItem() {
      throw new Error('read failed')
    },
    setItem() {
      throw new Error('write failed')
    }
  }
  assert.equal(themeStorage.readThemeMode(failingStorage), 'dark')
  assert.equal(themeStorage.writeThemeMode('light', failingStorage), false)
})

test('顶层页面路由稳定且无效地址安全回到首页', () => {
  const expectedPages = [
    'home', 'records', 'analytics', 'badges', 'settings', 'training-plan',
    'sight-reading', 'rhythm', 'scales', 'chords', 'coordination',
    'free-practice', 'midi-test', 'metronome', 'help'
  ]

  assert.deepEqual(pageRouting.TOP_LEVEL_PAGE_IDS, expectedPages)
  const hashes = expectedPages.map((page) => pageRouting.getPageHash(page))
  assert.equal(new Set(hashes).size, expectedPages.length)

  for (const page of expectedPages) {
    assert.equal(pageRouting.getPageFromHash(pageRouting.getPageHash(page)), page)
    const state = pageRouting.createPageHistoryState(page, 3)
    assert.deepEqual(pageRouting.readPageHistoryState(state), state)
  }

  assert.equal(pageRouting.getPageFromHash('#/not-a-page'), 'home')
  assert.equal(pageRouting.getPageFromHash(''), 'home')
  assert.equal(pageRouting.readPageHistoryState({ page: 'home', index: 0 }), null)
})

test('统一历史导航入栈、恢复与练习保护均已接入', () => {
  const appSource = fs.readFileSync(require.resolve('../src/renderer/src/App.tsx'), 'utf8')
  const historyEffectStart = appSource.indexOf('const initialPage = getPageFromHash')
  const historyEffectEnd = appSource.indexOf('const handleNavigate = useCallback')
  const historyRestoreSource = appSource.slice(historyEffectStart, historyEffectEnd)

  assert.match(appSource, /window\.history\.pushState\(nextEntry/, '页面内导航应创建真实历史条目')
  assert.match(appSource, /addEventListener\('popstate'/, '应恢复浏览器后退和前进目标')
  assert.match(appSource, /addEventListener\('hashchange'/, '应恢复手动 hash 导航目标')
  assert.equal(historyRestoreSource.includes('pushState'), false, '历史恢复期间不得再次入栈')
  assert.match(historyRestoreSource, /practiceRunningRef\.current/, '历史导航必须检查练习运行状态')
  assert.match(historyRestoreSource, /updatePendingNavigation\(pending\)/, '运行中应进入现有退出确认流程')
  assert.match(historyRestoreSource, /window\.history\.go\(-delta\)/, '确认前应恢复当前历史索引')
  assert.match(appSource, /confirmedHistoryNavigationRef/, '确认退出后应继续前往原历史目标')
  assert.doesNotMatch(appSource, /addEventListener\(['"](?:mousedown|mouseup|auxclick)['"]/, '不得重复监听鼠标侧键')
})

test('虚拟键盘偏好按模块独立存储且默认隐藏', () => {
  const values = new Map()
  const storage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    }
  }
  const scopes = ['midi-test', 'sight-reading', 'rhythm', 'scales', 'chords', 'coordination']
  const keys = scopes.map((scope) => displayPreferences.DISPLAY_PREFERENCES_STORAGE_KEYS[scope])

  assert.equal(new Set(keys).size, scopes.length)
  assert.ok(scopes.every((scope) => displayPreferences.readDisplayPreferences(scope, storage).showVirtualKeyboard === false))
  assert.equal(displayPreferences.writeDisplayPreferences('sight-reading', { version: 2, showVirtualKeyboard: true }, storage), true)
  assert.equal(displayPreferences.readDisplayPreferences('sight-reading', storage).showVirtualKeyboard, true)
  assert.equal(displayPreferences.readDisplayPreferences('scales', storage).showVirtualKeyboard, false)

  values.set(displayPreferences.DISPLAY_PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 1, showVirtualKeyboard: true }))
  assert.equal(displayPreferences.readDisplayPreferences('chords', storage).showVirtualKeyboard, false)
})

test('训练计划四阶段与阶段项目 ID 唯一', () => {
  const stages = trainingPlanStages.TRAINING_PLAN_STAGES
  assert.equal(stages.length, 4)
  assert.equal(new Set(stages.map((stage) => stage.id)).size, 4)

  const projectIds = stages.flatMap((stage) => stage.projects.map((project) => project.id))
  assert.equal(new Set(projectIds).size, projectIds.length)
  assert.ok(stages.every((stage) => stage.projects.length > 0))
})

test('每日、每周与六级验收固定数据完整', () => {
  assert.equal(dailyTrainingPlan.DAILY_TRAINING_TOTAL_MINUTES, 90)
  assert.equal(dailyTrainingPlan.DAILY_TRAINING_PLAN.length, 7)
  assert.deepEqual(weeklyTrainingPlan.WEEKLY_TRAINING_PLAN.map((item) => item.day), [1, 2, 3, 4, 5, 6, 7])
  assert.equal(levelSixChecklist.LEVEL_SIX_CHECKLIST.length, 12)
  assert.equal(new Set(levelSixChecklist.LEVEL_SIX_CHECKLIST.map((item) => item.id)).size, 12)
})

test('每日状态按本地日期隔离', () => {
  const initial = trainingPlanStorage.createDefaultTrainingPlanState(new Date(2026, 7, 3))
  const firstDay = trainingPlanStorage.setDailyTaskOverride(initial, '2026-08-03', 'daily-scales', 'completed')
  const secondDay = trainingPlanStorage.setDailyTaskOverride(firstDay, '2026-08-04', 'daily-scales', 'pending')

  assert.equal(secondDay.dailyRecords['2026-08-03'].taskOverrides['daily-scales'], 'completed')
  assert.equal(secondDay.dailyRecords['2026-08-04'].taskOverrides['daily-scales'], 'pending')
  const resetSecondDay = trainingPlanStorage.resetDailyTrainingRecord(secondDay, '2026-08-04')
  assert.equal(resetSecondDay.dailyRecords['2026-08-04'], undefined)
  assert.equal(resetSecondDay.dailyRecords['2026-08-03'].taskOverrides['daily-scales'], 'completed')
})

test('新周记录不会覆盖旧周目标', () => {
  const initial = trainingPlanStorage.createDefaultTrainingPlanState(new Date(2026, 7, 3))
  const firstWeek = trainingPlanStorage.ensureWeeklyTrainingRecord(initial, '2026-08-03')
  const edited = {
    ...firstWeek.state,
    weeklyRecords: {
      ...firstWeek.state.weeklyRecords,
      '2026-08-03': {
        ...firstWeek.record,
        goals: firstWeek.record.goals.map((goal, index) => index === 0 ? { ...goal, content: '保留的旧周目标' } : goal)
      }
    }
  }
  const secondWeek = trainingPlanStorage.ensureWeeklyTrainingRecord(edited, '2026-08-10')

  assert.equal(secondWeek.state.weeklyRecords['2026-08-03'].goals[0].content, '保留的旧周目标')
  assert.equal(secondWeek.state.weeklyRecords['2026-08-10'].goals.length, 3)
})

test('切换训练阶段保留旧阶段项目状态', () => {
  const initial = trainingPlanStorage.createDefaultTrainingPlanState(new Date(2026, 7, 3))
  const projectId = trainingPlanStages.TRAINING_PLAN_STAGES[0].projects[0].id
  const withProgress = {
    ...initial,
    stageProjects: { [projectId]: { status: 'completed', note: '保留进度' } }
  }
  const changed = trainingPlanStorage.changeCurrentStage(withProgress, 'stage-2', '2026-08-04')

  assert.equal(changed.currentStageId, 'stage-2')
  assert.deepEqual(changed.stageProjects[projectId], { status: 'completed', note: '保留进度' })
  assert.equal(changed.stageStartDates['stage-2'], '2026-08-04')
})

test('今日软件任务映射练习记录且线下任务不会自动完成', () => {
  const localDate = new Date(2026, 7, 3, 12, 0, 0)
  const date = trainingPlanStorage.formatLocalDate(localDate)
  const endedAt = localDate.toISOString()
  const records = [
    { module: 'scale', status: 'completed', endedAt, accuracy: 90 },
    { module: 'chord', status: 'completed', endedAt, accuracy: 85 },
    { module: 'coordination', status: 'completed', endedAt, accuracy: 80 },
    { module: 'sight-reading', status: 'completed', endedAt, accuracy: 88 }
  ]
  const completed = trainingPlanRecordLink.getTodayCompletedModules(records, date)
  const tasks = Object.fromEntries(dailyTrainingPlan.DAILY_TRAINING_PLAN.map((task) => [task.id, task]))

  assert.equal(trainingPlanRecordLink.isDailyTaskAutoCompleted(tasks['daily-scales'], completed), true)
  assert.equal(trainingPlanRecordLink.isDailyTaskAutoCompleted(tasks['daily-chords-arpeggios'], completed), true)
  assert.equal(trainingPlanRecordLink.isDailyTaskAutoCompleted(tasks['daily-rhythm-coordination'], completed), true)
  assert.equal(trainingPlanRecordLink.isDailyTaskAutoCompleted(tasks['daily-sight-reading'], completed), true)
  assert.equal(trainingPlanRecordLink.isDailyTaskAutoCompleted(tasks['daily-etude'], completed), false)
  assert.equal(trainingPlanRecordLink.isDailyTaskAutoCompleted({
    id: 'manual-test', order: 1, minutes: 10, title: '线下', content: '', objective: '',
    taskType: 'manual', linkedModules: ['scale']
  }, completed), false)
})

test('训练计划损坏和未知版本存储安全回退', () => {
  const normalized = trainingPlanStorage.migrateTrainingPlanState({
    version: 1,
    currentStageId: 'bad-stage',
    stageStartDates: { 'stage-1': 'not-a-date' },
    stageProjects: 'broken',
    dailyRecords: { invalid: { taskOverrides: { unknown: 'completed' } } },
    weeklyRecords: { invalid: { goals: 'broken' } },
    levelSixProgress: null
  }, new Date(2026, 7, 3))
  assert.equal(normalized.currentStageId, 'stage-1')
  assert.equal(normalized.stageStartDates['stage-1'], '2026-08-03')
  assert.deepEqual(normalized.stageProjects, {})
  assert.deepEqual(normalized.dailyRecords, {})

  const unknownVersion = trainingPlanStorage.migrateTrainingPlanState({ version: 99 }, new Date(2026, 7, 3))
  assert.equal(unknownVersion.version, 1)
  assert.equal(unknownVersion.currentStageId, 'stage-1')
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
