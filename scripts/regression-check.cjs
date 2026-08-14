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
const midiEventBus = require('../src/renderer/src/midi/midiEventBus.ts')
const midiMessages = require('../src/renderer/src/midi/midiMessages.ts')
const samplePackLoader = require('../src/renderer/src/audio/samplePackLoader.ts')
const audioModeSettings = require('../src/renderer/src/audio/audioModeSettings.ts')
const voicePolicy = require('../src/renderer/src/audio/voicePolicy.ts')
const midiRecording = require('../src/renderer/src/midi/midiRecording.ts')
const curriculumCatalog = require('../src/renderer/src/curriculum/curriculumCatalog.ts')
const curriculumProgress = require('../src/renderer/src/curriculum/curriculumProgress.ts')
const chordIdentity = require('../src/renderer/src/chordV2/chordIdentity.ts')
const voicing = require('../src/renderer/src/chordV2/voicing.ts')
const harmony = require('../src/renderer/src/chordV2/harmony.ts')
const progressions = require('../src/renderer/src/harmony/progressions.ts')
const progressionTypes = require('../src/renderer/src/harmony/progressionTypes.ts')
const arrangement = require('../src/renderer/src/harmony/arrangement.ts')
const xmlMiniParser = require('../src/renderer/src/score/xmlMiniParser.ts')
const musicXmlParser = require('../src/renderer/src/score/musicXmlParser.ts')
const scoreTimeline = require('../src/renderer/src/score/scoreTimeline.ts')
const waitScoreCore = require('../src/renderer/src/score/waitScoreCore.ts')
const zipReader = require('../src/renderer/src/score/zipReader.ts')
const practiceSegment = require('../src/renderer/src/score/practiceSegment.ts')
const realtimeScoreCore = require('../src/renderer/src/score/realtimeScoreCore.ts')
const followScoreCore = require('../src/renderer/src/score/followScoreCore.ts')
const planV2 = require('../src/renderer/src/plan/planV2.ts')
const periodStats = require('../src/renderer/src/analytics/periodStats.ts')
const aiSettings = require('../src/renderer/src/ai/aiSettings.ts')
const aiCoach = require('../src/renderer/src/ai/aiCoach.ts')
const musicAi = require('../src/renderer/src/ai/musicAi.ts')
const backup = require('../src/renderer/src/storage/backup.ts')
const firstRun = require('../src/renderer/src/storage/firstRun.ts')
const appInfo = require('../src/renderer/src/appInfo.ts')
const chordValidator = require('../src/renderer/src/chordV2/chordValidator.ts')
const midiFileParser = require('../src/renderer/src/midiFile/midiFileParser.ts')
const featureFlags = require('../src/renderer/src/featureFlags.ts')
const practiceRecordV2 = require('../src/renderer/src/records/practiceRecordV2.ts')
const abilityModel = require('../src/renderer/src/ability/abilityModel.ts')
const exerciseLibrary = require('../src/renderer/src/prescription/exerciseLibrary.ts')
const planner = require('../src/renderer/src/plan/planner.ts')
const judgement = require('../src/renderer/src/utils/judgement.ts')
const scalePatterns = require('../src/renderer/src/utils/scalePatterns.ts')
const scalePracticeCore = require('../src/renderer/src/utils/scalePracticeCore.ts')
const chordPatterns = require('../src/renderer/src/utils/chordPatterns.ts')
const chordFeedback = require('../src/renderer/src/utils/chordFeedback.ts')
const rhythmPatterns = require('../src/renderer/src/utils/rhythmPatterns.ts')
const coordinationPatterns = require('../src/renderer/src/utils/coordinationPatterns.ts')
const chordDefinitions = require('../src/renderer/src/utils/chordDefinitions.ts')
const chordProgressions = require('../src/renderer/src/utils/chordProgressions.ts')
const chordTrainingContents = require('../src/renderer/src/utils/chordTrainingContents.ts')
const timingSubdivisions = require('../src/renderer/src/utils/timingSubdivisions.ts')
const sightReadingNotes = require('../src/renderer/src/utils/sightReadingNotes.ts')
const sightReadingSession = require('../src/renderer/src/utils/sightReadingSession.ts')
const sightReadingSettings = require('../src/renderer/src/utils/sightReadingSettings.ts')
const musicKeySignatures = require('../src/renderer/src/utils/musicKeySignatures.ts')
const musicPitchSpelling = require('../src/renderer/src/utils/musicPitchSpelling.ts')
const musicStaffModel = require('../src/renderer/src/utils/musicStaffModel.ts')
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

test('识谱固定谱表范围、C4 归属与洗牌袋', () => {
  const trebleCommon = sightReadingNotes.getSightReadingNotesForClef('treble', 'common')
  const trebleExtended = sightReadingNotes.getSightReadingNotesForClef('treble', 'extended')
  const bassCommon = sightReadingNotes.getSightReadingNotesForClef('bass', 'common')
  const bassExtended = sightReadingNotes.getSightReadingNotesForClef('bass', 'extended')
  const grandCommon = sightReadingNotes.getSightReadingNotes({ staffMode: 'grand', range: 'common' })

  assert.deepEqual([trebleCommon[0].midiNumber, trebleCommon.at(-1).midiNumber], [60, 88])
  assert.deepEqual([trebleExtended[0].midiNumber, trebleExtended.at(-1).midiNumber], [60, 88])
  assert.deepEqual([bassCommon[0].midiNumber, bassCommon.at(-1).midiNumber], [36, 64])
  assert.deepEqual([bassExtended[0].midiNumber, bassExtended.at(-1).midiNumber], [36, 64])
  assert.deepEqual([grandCommon[0].midiNumber, grandCommon.at(-1).midiNumber], [36, 88])
  assert.equal(new Set(grandCommon.map((note) => note.midiNumber)).size, grandCommon.length)
  assert.equal(grandCommon.find((note) => note.midiNumber === 59).clef, 'bass')
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

test('十五种常用大调制谱元数据、同音异名与调号顺序', () => {
  const keys = musicKeySignatures.MAJOR_KEY_SIGNATURES
  const displayOrder = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B', 'Cb']
  assert.equal(keys.length, 15)
  assert.equal(new Set(keys.map((key) => key.id)).size, 15)
  assert.ok(keys.every((key) => key.scaleDegrees.length === 7))
  assert.deepEqual(musicKeySignatures.MAJOR_KEY_DISPLAY_ORDER, displayOrder)
  assert.deepEqual(
    musicKeySignatures.MAJOR_KEY_DISPLAY_SIGNATURES.map((key) => key.id),
    displayOrder
  )
  assert.deepEqual(musicKeySignatures.getMajorKeySignature('D').signatureOrder, ['F', 'C'])
  assert.deepEqual(musicKeySignatures.getMajorKeySignature('Db').signatureOrder, ['B', 'E', 'A', 'D', 'G'])
  assert.equal(musicKeySignatures.getScaleDegree('F#', 7).spelling, 'E#')
  assert.equal(musicKeySignatures.getScaleDegree('F#', 7).pitchClass, 5)
  assert.equal(musicKeySignatures.getScaleDegree('Bb', 1).spelling, 'Bb')
  assert.equal(musicKeySignatures.getScaleDegree('Db', 4).spelling, 'Gb')
  assert.deepEqual(
    musicKeySignatures.getMajorKeySignature('C#').scaleDegrees.map((degree) => degree.spelling),
    ['C#', 'D#', 'E#', 'F#', 'G#', 'A#', 'B#']
  )
  assert.deepEqual(
    musicKeySignatures.getMajorKeySignature('Gb').scaleDegrees.map((degree) => degree.spelling),
    ['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F']
  )
  assert.deepEqual(
    musicKeySignatures.getMajorKeySignature('Cb').scaleDegrees.map((degree) => degree.spelling),
    ['Cb', 'Db', 'Eb', 'Fb', 'Gb', 'Ab', 'Bb']
  )
  assert.deepEqual(
    musicKeySignatures.getMajorKeySignature('C#').scaleDegrees.map((degree) => degree.pitchClass),
    [1, 3, 5, 6, 8, 10, 0]
  )
  assert.deepEqual(
    musicKeySignatures.getMajorKeySignature('Gb').scaleDegrees.map((degree) => degree.pitchClass),
    [6, 8, 10, 11, 1, 3, 5]
  )
  assert.deepEqual(
    musicKeySignatures.getMajorKeySignature('Cb').scaleDegrees.map((degree) => degree.pitchClass),
    [11, 1, 3, 4, 6, 8, 10]
  )
  assert.deepEqual(
    ['C#', 'Gb', 'Cb'].map((key) => {
      const metadata = musicKeySignatures.getMajorKeySignature(key)
      return [metadata.vexFlowKey, metadata.accidentalCount, metadata.accidentalType]
    }),
    [['C#', 7, 'sharp'], ['Gb', 6, 'flat'], ['Cb', 7, 'flat']]
  )
  assert.deepEqual(musicKeySignatures.getMajorKeySignature('C#').signatureOrder, ['F', 'C', 'G', 'D', 'A', 'E', 'B'])
  assert.deepEqual(musicKeySignatures.getMajorKeySignature('Gb').signatureOrder, ['B', 'E', 'A', 'D', 'G', 'C'])
  assert.deepEqual(musicKeySignatures.getMajorKeySignature('Cb').signatureOrder, ['B', 'E', 'A', 'D', 'G', 'C', 'F'])

  assert.equal(musicPitchSpelling.spellMidiPitch(65, 'F#', 'treble').spelling, 'E#4')
  assert.equal(musicPitchSpelling.spellMidiPitch(70, 'Bb', 'treble').spelling, 'Bb4')
  assert.equal(musicPitchSpelling.spellMidiPitch(66, 'Db', 'treble').spelling, 'Gb4')
  assert.equal(musicPitchSpelling.spellMidiPitch(60, 'C#', 'treble').spelling, 'B#3')
  assert.equal(musicPitchSpelling.spellMidiPitch(59, 'Cb', 'bass').spelling, 'Cb4')
  assert.equal(musicPitchSpelling.spellMidiPitch(64, 'Cb', 'treble').spelling, 'Fb4')
  assert.equal(musicPitchSpelling.spellMidiPitch(65, 'C#', 'treble').spelling, 'E#4')
  assert.equal(musicPitchSpelling.spellMidiPitch(66, 'Gb', 'treble').spelling, 'Gb4')
  assert.equal(musicPitchSpelling.spellMidiPitch(60, 'C#', 'treble').displayAccidental, null)
  assert.equal(musicPitchSpelling.spellMidiPitch(59, 'Cb', 'bass').displayAccidental, null)
  assert.equal(musicPitchSpelling.spellMidiPitch(60, 'Cb', 'treble').displayAccidental, 'n')
})

test('十五调调内与半音识谱候选遵守固定音域、标准拼写和题袋规则', () => {
  for (const key of musicKeySignatures.MAJOR_KEY_IDS) {
    const metadata = musicKeySignatures.getMajorKeySignature(key)
    const spellingByPitchClass = new Map(
      metadata.scaleDegrees.map((degree) => [degree.pitchClass, degree.spelling])
    )

    for (const staffMode of ['treble', 'bass', 'grand']) {
      const [start, end] = sightReadingNotes.SIGHT_READING_MIDI_RANGES[staffMode]
      const diatonic = sightReadingNotes.getSightReadingNotes({
        staffMode, keySignature: key, notePoolMode: 'diatonic'
      })
      const chromatic = sightReadingNotes.getSightReadingNotes({
        staffMode, keySignature: key, notePoolMode: 'chromatic'
      })

      assert.ok(diatonic.length > 0)
      assert.ok(diatonic.every((note) => note.midiNumber >= start && note.midiNumber <= end))
      assert.ok(diatonic.every((note) => spellingByPitchClass.has(note.midiNumber % 12)))
      assert.ok(diatonic.every((note) => note.pitchClass === spellingByPitchClass.get(note.midiNumber % 12)))
      assert.ok(diatonic.every((note) => note.notation.displayAccidental === null))
      assert.equal(new Set(diatonic.map((note) => note.midiNumber % 12)).size, 7)

      assert.equal(chromatic.length, end - start + 1)
      assert.ok(chromatic.length > diatonic.length)
      assert.ok(chromatic.some((note) => !spellingByPitchClass.has(note.midiNumber % 12)))

      for (const notes of [diatonic, chromatic]) {
        const previousMidiNumber = notes[0].midiNumber
        const bag = sightReadingNotes.createShuffledSightReadingBag(notes, previousMidiNumber, () => 0)
        assert.equal(bag.length, notes.length)
        assert.notEqual(bag[0].midiNumber, previousMidiNumber)
      }
    }
  }

  assert.equal(musicKeySignatures.getScaleDegree('C#', 3).spelling, 'E#')
  assert.equal(musicKeySignatures.getScaleDegree('C#', 3).pitchClass, 5)
  assert.equal(musicKeySignatures.getScaleDegree('C#', 7).spelling, 'B#')
  assert.equal(musicKeySignatures.getScaleDegree('C#', 7).pitchClass, 0)
  assert.equal(musicKeySignatures.getScaleDegree('Gb', 4).spelling, 'Cb')
  assert.equal(musicKeySignatures.getScaleDegree('Gb', 4).pitchClass, 11)
  assert.equal(musicKeySignatures.getScaleDegree('Cb', 4).spelling, 'Fb')
  assert.equal(musicKeySignatures.getScaleDegree('Cb', 4).pitchClass, 4)

  const chromaticAccidentals = [
    sightReadingNotes.getSightReadingNoteByMidi(65, 'treble', 'extended', 'G', 'chromatic'),
    sightReadingNotes.getSightReadingNoteByMidi(71, 'treble', 'extended', 'F', 'chromatic'),
    sightReadingNotes.getSightReadingNoteByMidi(64, 'treble', 'extended', 'C#', 'chromatic'),
    sightReadingNotes.getSightReadingNoteByMidi(65, 'treble', 'extended', 'Cb', 'chromatic')
  ]
  assert.deepEqual(chromaticAccidentals.map((note) => note.notation.displayAccidental), ['n', 'n', 'n', 'n'])
  assert.deepEqual(chromaticAccidentals.map((note) => note.pitchClass), ['F', 'B', 'E', 'F'])
  assert.equal(sightReadingNotes.getSightReadingNoteByMidi(65, 'treble', 'extended', 'G', 'diatonic'), null)
})

test('识谱设置迁移删除旧音域和旧时限并固定 5000ms', () => {
  const migrated = sightReadingSettings.migrateSightReadingSettings({
    staffMode: 'mixed', range: 'common', answerTimeLimitSeconds: 3,
    customTimeLimit: 10, noteCount: 3, questionCount: 50, keySignature: 'bad'
  })
  assert.deepEqual(migrated, {
    staffMode: 'grand', noteCount: 1, questionCount: 50, keySignature: 'C',
    notePoolMode: 'diatonic', noteNameVisible: true
  })
  assert.equal('range' in migrated, false)
  assert.equal('answerTimeLimitSeconds' in migrated, false)
  assert.equal(sightReadingSettings.SIGHT_READING_ANSWER_TIMEOUT_MS, 5000)

  assert.equal(sightReadingSettings.migrateSightReadingSettings({ notePoolMode: 'chromatic' }).notePoolMode, 'chromatic')
  assert.equal(sightReadingSettings.migrateSightReadingSettings({ notePoolMode: 'invalid' }).notePoolMode, 'diatonic')
  assert.equal(sightReadingSettings.migrateSightReadingSettings(null).notePoolMode, 'diatonic')

  class SettingsStorage {
    constructor() { this.values = new Map() }
    getItem(key) { return this.values.get(key) ?? null }
    setItem(key, value) { this.values.set(key, String(value)) }
  }
  const hadWindow = Object.prototype.hasOwnProperty.call(global, 'window')
  const previousWindow = global.window
  const localStorage = new SettingsStorage()
  global.window = { localStorage }
  try {
    sightReadingSettings.writeSightReadingSettings({
      ...sightReadingSettings.DEFAULT_SIGHT_READING_SETTINGS,
      keySignature: 'Gb',
      notePoolMode: 'chromatic'
    })
    const restored = sightReadingSettings.readSightReadingSettings()
    assert.equal(restored.keySignature, 'Gb')
    assert.equal(restored.notePoolMode, 'chromatic')

    sightReadingSettings.writeSightReadingSettings({ ...restored, notePoolMode: 'diatonic' })
    assert.equal(sightReadingSettings.readSightReadingSettings().notePoolMode, 'diatonic')
  } finally {
    if (hadWindow) global.window = previousWindow
    else delete global.window
  }
})

test('统一谱面模型支持三种谱表、十五调与一到三音并安全回退', () => {
  const pitches = [60, 64, 67].map((midi) => musicPitchSpelling.spellMidiPitch(midi, 'C', 'grand'))
  for (const staffMode of ['treble', 'bass', 'grand']) {
    for (const key of musicKeySignatures.MAJOR_KEY_IDS) {
      const model = musicStaffModel.createMusicStaffRenderModel({ staffMode, keySignature: key, notes: pitches })
      assert.equal(model.staffMode, staffMode)
      assert.equal(model.keySignature, key)
      assert.equal(model.notes.length, 3)
    }
  }
  assert.equal(musicStaffModel.createMusicStaffRenderModel({ staffMode: 'bad', keySignature: 'bad', notes: null }).staffMode, 'treble')
  assert.equal(musicStaffModel.createMusicStaffRenderModel({ notes: [...pitches, pitches[0]] }).notes.length, 3)
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

test('识谱倒计时读取权威剩余时间并随暂停、反馈和下一题同步', () => {
  const notes = sightReadingNotes.getSightReadingNotesForClef('treble', 'common')
  const core = new sightReadingSession.SightReadingSessionCore(notes)
  prepareSightReadingQuestion(core, notes[0], 1000, null, 5000)

  assert.equal(sightReadingSession.getSightReadingAnswerProgress(5000, 5000), 1)
  assert.equal(sightReadingSession.getSightReadingAnswerProgress(2500, 5000), 0.5)
  assert.equal(sightReadingSession.getSightReadingAnswerProgress(0, 5000), 0)
  assert.equal(core.getRemainingQuestionMs(1032), 5000)
  assert.equal(core.getRemainingQuestionMs(3032), 3000)

  core.pause(3032)
  assert.equal(core.getRemainingQuestionMs(9000), 3000)
  core.resume(10000, 7)
  assert.equal(core.getRemainingQuestionMs(11000), 2000)

  const outcome = core.processMidiEvent(createSightReadingMidiEvent(8, notes[0].midiNumber, 11000))
  assert.equal(outcome.outcome, 'correct')
  assert.equal(core.getRemainingQuestionMs(20000), 2000)

  assert.equal(core.completeFeedback(2), 'next')
  core.beginQuestion(notes[1])
  core.unlockQuestion(12000, 8, 5000)
  assert.equal(core.getRemainingQuestionMs(12000), 5000)
  core.recordTimeout()
  assert.equal(core.getRemainingQuestionMs(17000), 0)
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
  assert.equal(chordPatterns.getChordTargets('both', 'all').length, 21)

  const cTargets = chordPatterns.getChordTargets('major', 'all').filter((target) => target.root === 'C')
  assert.deepEqual(cTargets.find((target) => target.inversion === 'root').notes, [60, 64, 67])
  assert.deepEqual(cTargets.find((target) => target.inversion === 'first').notes, [64, 67, 72])
  assert.deepEqual(cTargets.find((target) => target.inversion === 'second').notes, [67, 72, 76])
})

test('调内七和弦四音集合与 4536251 级数顺序', () => {
  const cTargets = chordDefinitions.getSeventhChordTargets('root')
  assert.deepEqual(cTargets.find((target) => target.degree === 1).notes, [60, 64, 67, 71])
  assert.deepEqual(cTargets.find((target) => target.degree === 2).notes, [62, 65, 69, 72])
  assert.deepEqual(cTargets.find((target) => target.degree === 5).notes, [67, 71, 74, 77])
  assert.deepEqual(cTargets.find((target) => target.degree === 7).notes, [71, 74, 77, 81])

  const thirdInversion = chordDefinitions.getSeventhChordTargets('all')
    .find((target) => target.degree === 1 && target.quality === 'major7' && target.inversion === 'third')
  assert.deepEqual(thirdInversion.notes, [71, 72, 76, 79])
  assert.deepEqual(chordProgressions.getChordProgressionById('4536251').degrees, [4, 5, 3, 6, 2, 5, 1])
  assert.equal(chordProgressions.createProgressionTargets('4536251', 'C', 'block').length, 7)
})

test('和弦十五调目标、进行、4536251 与转位拼写', () => {
  for (const key of musicKeySignatures.MAJOR_KEY_IDS) {
    const triads = chordPatterns.createDiatonicTriads(key)
    assert.equal(triads.length, 7)
    assert.deepEqual(triads.map((triad) => triad.quality), [
      'major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'
    ])
    for (const progressionId of ['I-IV-V-I', 'I-V-vi-IV', 'ii-V-I', 'I-vi-IV-V', '4536251']) {
      const targets = chordProgressions.createProgressionTargets(progressionId, key, 'block')
      assert.equal(targets.length, chordProgressions.getChordProgressionById(progressionId).degrees.length)
      assert.ok(targets.every((target) => target.keySignature === key))
    }
  }

  assert.equal(chordPatterns.createDiatonicTriads('F#')[6].root, 'E#')
  assert.equal(chordPatterns.createDiatonicTriads('Bb')[3].root, 'Eb')
  assert.equal(chordPatterns.createDiatonicTriads('Db')[4].root, 'Ab')
  const dbFive = chordProgressions.createProgressionTargets('I-IV-V-I', 'Db').find((target) => target.degree === 5)
  assert.equal(dbFive.root, 'Ab')

  const rootNotes = chordPatterns.getChordTargets('major', 'root', 'F#').find((target) => target.root === 'F#').notes
  const firstNotes = chordPatterns.getChordTargets('major', 'first', 'F#').find((target) => target.root === 'F#').notes
  assert.deepEqual(firstNotes, [rootNotes[1], rootNotes[2], rootNotes[0] + 12])
  assert.equal(chordPatterns.CHORD_INPUT_WINDOW_MS, 150)
})

test('C#、Gb 与 Cb 大调和弦、进行及转位使用正确拼写与 MIDI 集合', () => {
  const stripOctave = (noteName) => noteName.replace(/-?\d+$/, '')
  const expectations = {
    'C#': {
      triads: [['C#', 'E#', 'G#'], ['F#', 'A#', 'C#'], ['G#', 'B#', 'D#'], ['A#', 'C#', 'E#'], ['B#', 'D#', 'F#']],
      iiVI: ['D#', 'G#', 'C#']
    },
    Gb: {
      triads: [['Gb', 'Bb', 'Db'], ['Cb', 'Eb', 'Gb'], ['Db', 'F', 'Ab'], ['Eb', 'Gb', 'Bb'], ['F', 'Ab', 'Cb']],
      iiVI: ['Ab', 'Db', 'Gb']
    },
    Cb: {
      triads: [['Cb', 'Eb', 'Gb'], ['Fb', 'Ab', 'Cb'], ['Gb', 'Bb', 'Db'], ['Ab', 'Cb', 'Eb'], ['Bb', 'Db', 'Fb']],
      iiVI: ['Db', 'Gb', 'Cb']
    }
  }

  for (const [key, expected] of Object.entries(expectations)) {
    const triads = chordPatterns.createDiatonicTriads(key)
    const selectedTriads = [triads[0], triads[3], triads[4], triads[5], triads[6]]
    assert.deepEqual(
      selectedTriads.map((triad) => triad.noteNames.map(stripOctave)),
      expected.triads
    )

    const iiVI = chordProgressions.createProgressionTargets('ii-V-I', key, 'block')
    assert.deepEqual(iiVI.map((target) => target.root), expected.iiVI)

    const fourFiveThree = chordProgressions.createProgressionTargets('4536251', key, 'block')
    assert.deepEqual(fourFiveThree.map((target) => target.degree), [4, 5, 3, 6, 2, 5, 1])
    assert.ok(fourFiveThree.every((target) => target.keySignature === key))

    const root = chordPatterns.getChordTargets('both', 'root', key)
      .find((target) => target.root === key)
    const first = chordPatterns.getChordTargets('both', 'first', key)
      .find((target) => target.root === key)
    assert.deepEqual(first.notes, [root.notes[1], root.notes[2], root.notes[0] + 12])
    assert.equal(chordDefinitions.getSeventhChordTargets('root', 'all', key).length, 7)
  }
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
  assert.equal(chordPatterns.getChordTargets('both', 'root').length, 7)
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
  assert.match(chordHook, /getSeventhChordTargets\(inversionMode, seventhQualityFilter, keySignature\)/)
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
  const sightRecord = practiceRecordAdapters.createSightReadingRecord({
    timing,
    showNoteName: true,
    report: {
      totalQuestions: 20, completedQuestions: 20, correct: 17, wrong: 2, timeout: 1,
      accuracy: 85, bestStreak: 9, mostWrongNote: 'E#4', mostTimedOutNote: 'C#5',
      weakestNote: 'E#4', averageReactionMs: 412, fastestReactionMs: 188, slowestReactionMs: 802,
      wrongNoteCounts: [], timeoutNoteCounts: [], staffMode: 'grand', noteCount: 1,
      keySignature: 'F#', keyName: 'F♯ 大调', notePoolMode: 'chromatic', answerTimeLimitSeconds: 5,
      treble: { total: 10, correct: 9, wrong: 1, timeout: 0, accuracy: 90 },
      bass: { total: 10, correct: 8, wrong: 1, timeout: 1, accuracy: 80 }
    }
  })
  assert.equal(sightRecord.keySignature, 'F#')
  assert.equal(sightRecord.settings.rangeMode, 'fixed')
  assert.equal(sightRecord.settings.answerTimeLimitSeconds, 5)
  assert.equal(sightRecord.settings.noteCount, 1)
  assert.equal(sightRecord.settings.notePoolMode, 'chromatic')

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
  const scaleCoreSource = fs.readFileSync(require.resolve('../src/renderer/src/utils/scalePracticeCore.ts'), 'utf8')
  const rhythmHookSource = fs.readFileSync(require.resolve('../src/renderer/src/hooks/useRhythmPractice.ts'), 'utf8')
  const chordHookSource = fs.readFileSync(require.resolve('../src/renderer/src/hooks/useChordPractice.ts'), 'utf8')
  const coordinationHookSource = fs.readFileSync(require.resolve('../src/renderer/src/hooks/useCoordinationPractice.ts'), 'utf8')
  const recorderSource = fs.readFileSync(require.resolve('../src/renderer/src/hooks/usePracticeSessionRecorder.ts'), 'utf8')

  assert.match(rhythmHookSource, /usePracticeEngine/, '节奏练习应继续复用通用判定引擎')
  assert.match(scaleCoreSource, /if \(type === 'wrong_note'\)/, '音阶错音专用分支必须保留')
  assert.match(scaleCoreSource, /if \(type === 'missing_note'\)/, '音阶漏音专用分支必须保留')
  assert.match(chordHookSource, /CHORD_INPUT_WINDOW_MS/, '和弦 150ms 输入窗口必须保留')
  assert.equal(chordPatterns.CHORD_INPUT_WINDOW_MS, 150)
  assert.match(coordinationHookSource, /COORDINATION_SYNC_THRESHOLD_MS/, '左右手同步阈值必须保留')
  assert.equal(coordinationPatterns.COORDINATION_SYNC_THRESHOLD_MS, 100)
  assert.match(recorderSource, /savedSessionIdRef\.current === session\.id/, '练习记录会话去重必须保留')
})

test('VexFlow SVG、本地 Bravura 与协调 BPM 步进器接入', () => {
  const rendererSource = fs.readFileSync(require.resolve('../src/renderer/src/components/MusicStaffRenderer.tsx'), 'utf8')
  const fontSource = fs.readFileSync(require.resolve('../src/renderer/src/utils/musicNotationFont.ts'), 'utf8')
  const sightStaffSource = fs.readFileSync(require.resolve('../src/renderer/src/components/SightReadingStaff.tsx'), 'utf8')
  const sightPageSource = fs.readFileSync(require.resolve('../src/renderer/src/components/SightReadingPage.tsx'), 'utf8')
  const sightHookSource = fs.readFileSync(require.resolve('../src/renderer/src/hooks/useSightReadingPractice.ts'), 'utf8')
  const timeBarSource = fs.readFileSync(require.resolve('../src/renderer/src/components/SightReadingTimeBar.tsx'), 'utf8')
  const sightSettingsSource = fs.readFileSync(require.resolve('../src/renderer/src/utils/sightReadingSettings.ts'), 'utf8')
  const historyPageSource = fs.readFileSync(require.resolve('../src/renderer/src/components/PracticeHistoryPage.tsx'), 'utf8')
  const chordPageSource = fs.readFileSync(require.resolve('../src/renderer/src/components/ChordPracticePage.tsx'), 'utf8')
  const stepperSource = fs.readFileSync(require.resolve('../src/renderer/src/components/NumericStepper.tsx'), 'utf8')
  const coordinationPage = fs.readFileSync(require.resolve('../src/renderer/src/components/CoordinationPracticePage.tsx'), 'utf8')
  const fullKeyboardSource = fs.readFileSync(require.resolve('../src/renderer/src/components/FullKeyboard.tsx'), 'utf8')
  const virtualKeyboardSource = fs.readFileSync(require.resolve('../src/renderer/src/components/VirtualKeyboard.tsx'), 'utf8')
  const componentCss = fs.readFileSync(require.resolve('../src/renderer/src/components.css'), 'utf8')
  const practiceCss = fs.readFileSync(require.resolve('../src/renderer/src/styles/practice-usability.css'), 'utf8')
  const themeCss = fs.readFileSync(require.resolve('../src/renderer/src/styles/themes.css'), 'utf8')
  const baseCss = fs.readFileSync(require.resolve('../src/renderer/src/styles.css'), 'utf8')
  const notationCss = [componentCss, practiceCss, themeCss].join('\n')
  const keyboardCss = [baseCss, componentCss, themeCss].join('\n')
  const packageJson = JSON.parse(fs.readFileSync(require.resolve('../package.json'), 'utf8'))

  assert.match(rendererSource, /Renderer\.Backends\.SVG/)
  assert.match(rendererSource, /ResizeObserver/)
  assert.match(rendererSource, /replaceChildren\(\)/)
  assert.match(rendererSource, /setType\('brace'\)/)
  assert.match(rendererSource, /setType\('singleLeft'\)/)
  assert.match(fontSource, /@vexflow-fonts\/bravura\/bravura\.woff2\?url/)
  assert.match(fontSource, /document\.fonts\.ready/)
  assert.doesNotMatch(fontSource, /https?:\/\/|\bcdn\b|VexFlow\.loadFonts/i)
  assert.match(rendererSource, /drawWithStyle\(\)/)
  assert.match(rendererSource, /setContextColor/)
  assert.match(rendererSource, /setLedgerLineStyle/)
  assert.match(rendererSource, /setLedgerLineStyle\(\{[\s\S]+MUSIC_STAFF_INK_COLOR/)
  assert.match(rendererSource, /modifier\.setStyle/)
  assert.match(rendererSource, /MUSIC_STAFF_INK_COLOR = '#171717'/)
  assert.doesNotMatch(rendererSource, /--staff-(?:background|line|symbol|note)/)
  assert.match(componentCss, /--music-staff-ink: #171717/)
  assert.match(componentCss, /--music-staff-paper: #ffffff/)
  assert.doesNotMatch(componentCss, /--music-staff-paper:\s*#fffdf8/)
  assert.doesNotMatch(themeCss, /--staff-(?:background|line|symbol|note)/)
  assert.match(sightStaffSource, /MusicStaffRenderer/)
  assert.doesNotMatch(sightStaffSource, /𝄞|𝄢/)
  assert.doesNotMatch(notationCss, /Segoe UI Symbol|Noto Music|Bravura Text/)
  assert.doesNotMatch(notationCss, /sight-custom-time-limit/)
  assert.equal(packageJson.dependencies.vexflow, '5.0.0')
  assert.equal(packageJson.dependencies['@vexflow-fonts/bravura'], '1.0.2')
  assert.ok(fs.existsSync(require.resolve('../src/renderer/public/third-party-licenses/VexFlow-MIT.txt')))
  assert.ok(fs.existsSync(require.resolve('../src/renderer/public/third-party-licenses/Bravura-OFL-1.1.txt')))
  assert.match(stepperSource, /aria-label="BPM 数值"/)
  assert.doesNotMatch(stepperSource, /<button|降低 BPM|提高 BPM|\bnudge\b/)
  assert.ok(stepperSource.includes("if (!/^\\d+$/.test(normalizedDraft))"))
  assert.match(stepperSource, /onBlur=\{commit\}/)
  assert.match(stepperSource, /event\.key === 'Enter'/)
  assert.match(stepperSource, /event\.key === 'Escape'/)
  assert.match(stepperSource, /onFocus=\{\(event\) => event\.currentTarget\.select\(\)\}/)
  assert.match(stepperSource, /Math\.min\(max, Math\.max\(min, value\)\)/)
  assert.doesNotMatch(practiceCss, /\.numeric-stepper button/)
  assert.match(coordinationPage, /<NumericStepper[^>]+max=\{120\} min=\{40\} step=\{1\}/)
  assert.match(coordinationPage, /type="range"/)
  assert.match(sightPageSource, /MAJOR_KEY_DISPLAY_SIGNATURES\.map/)
  assert.match(chordPageSource, /MAJOR_KEY_DISPLAY_SIGNATURES\.map/)
  assert.doesNotMatch(`${sightPageSource}\n${chordPageSource}`, /MAJOR_KEY_SIGNATURES\.map/)
  assert.match(fullKeyboardSource, /isActive[\s\S]+isTarget[\s\S]+isCorrect[\s\S]+isWrong/)
  assert.match(virtualKeyboardSource, /white-key/)
  assert.match(virtualKeyboardSource, /black-key/)
  assert.match(keyboardCss, /\.full-white-key\.is-active/)
  assert.match(keyboardCss, /\.full-white-key\.is-target/)
  assert.match(keyboardCss, /\.full-white-key\.is-correct/)
  assert.match(keyboardCss, /\.full-white-key\.is-wrong/)
  assert.match(keyboardCss, /translateY\(2px\)/)
  assert.doesNotMatch(keyboardCss, /url\(/i)
  assert.doesNotMatch(
    keyboardCss,
    /\.(?:keyboard-preview|full-keyboard-shell|keyboard-scroll)[^{]*\{[^}]*backdrop-filter/s
  )
  assert.match(sightHookSource, /getRemainingTimeMs/)
  assert.match(sightHookSource, /notePoolMode: settings\.notePoolMode/)
  assert.match(sightHookSource, /setNotePoolMode: \(value\) => updateSetting\('notePoolMode', value\)/)
  assert.match(sightPageSource, /<SightReadingTimeBar/)
  assert.match(sightPageSource, />音符内容</)
  assert.match(sightPageSource, /setDraftNotePoolMode/)
  assert.match(sightSettingsSource, /sight-reading-settings\.v4/)
  assert.match(sightSettingsSource, /notePoolMode: 'diatonic'/)
  assert.match(historyPageSource, /notePoolMode === 'diatonic' \|\| notePoolMode === 'chromatic'/)
  assert.match(timeBarSource, /requestAnimationFrame/)
  assert.match(timeBarSource, /cancelAnimationFrame/)
  assert.match(timeBarSource, /role="progressbar"/)
  assert.match(timeBarSource, /aria-label="本题剩余时间"/)
  assert.match(timeBarSource, /aria-valuemin=\{0\}/)
  assert.match(timeBarSource, /aria-valuemax=\{SIGHT_READING_ANSWER_TIMEOUT_MS\}/)
  assert.match(timeBarSource, /aria-valuenow=\{Math\.round\(remainingTimeMs\)\}/)
  assert.doesNotMatch(timeBarSource, /setTimeout|recordTimeout/)
  assert.match(practiceCss, /transform-origin: left center/)
})

test('单谱表与大谱表极限音保留安全边距', () => {
  const layout = musicStaffModel.MUSIC_STAFF_LAYOUT
  const staveTopLineOffset = 40
  const staveBottomLineOffset = 80
  const trebleE6OffsetAboveTopLine = 35
  const trebleC4OffsetBelowBottomLine = 20
  const bassE4OffsetAboveTopLine = 20
  const bassC2OffsetBelowBottomLine = 20

  const singleTopLine = layout.single.staveY + staveTopLineOffset
  const singleBottomLine = layout.single.staveY + staveBottomLineOffset
  assert.ok(singleTopLine - trebleE6OffsetAboveTopLine >= 24)
  assert.ok(layout.single.height - (singleBottomLine + trebleC4OffsetBelowBottomLine) >= 24)
  assert.ok(singleTopLine - bassE4OffsetAboveTopLine >= 24)
  assert.ok(layout.single.height - (singleBottomLine + bassC2OffsetBelowBottomLine) >= 24)

  const grandTrebleTopLine = layout.grand.trebleStaveY + staveTopLineOffset
  const grandBassBottomLine = layout.grand.bassStaveY + staveBottomLineOffset
  assert.ok(grandTrebleTopLine - trebleE6OffsetAboveTopLine >= 24)
  assert.ok(layout.grand.height - (grandBassBottomLine + bassC2OffsetBelowBottomLine) >= 24)
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
    'free-practice', 'score-practice', 'midi-test', 'metronome', 'help'
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
  const scopes = ['midi-test', 'sight-reading', 'rhythm', 'scales', 'chords', 'coordination', 'free-practice']
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

test('MIDI 逐事件分发层不丢事件且不回放订阅前旧事件', () => {
  midiEventBus.resetMidiEventBusForTests()
  const receivedA = []
  const receivedB = []
  const unsubscribeA = midiEventBus.subscribeMidiEvents((event) => receivedA.push(event.id))
  midiEventBus.subscribeMidiEvents((event) => receivedB.push(event.id))

  const makeEvent = (id, midiNumber) => ({
    id,
    type: 'noteOn',
    midiNumber,
    velocity: 100,
    timestamp: 1000 + id,
    deviceName: 'Regression MIDI'
  })

  midiEventBus.publishMidiEvent(makeEvent(1, 60))
  midiEventBus.publishMidiEvent(makeEvent(2, 64))
  assert.deepEqual(receivedA, [1, 2])
  assert.deepEqual(receivedB, [1, 2])

  unsubscribeA()
  midiEventBus.publishMidiEvent(makeEvent(3, 67))
  assert.deepEqual(receivedA, [1, 2])
  assert.deepEqual(receivedB, [1, 2, 3])

  const receivedC = []
  midiEventBus.subscribeMidiEvents((event) => receivedC.push(event.id))
  midiEventBus.publishMidiEvent(makeEvent(4, 69))
  assert.deepEqual(receivedC, [4], '订阅后不得重放订阅前的旧事件')
  assert.equal(midiEventBus.getLastMidiEventId(), 4)
})

test('Web MIDI 入口解析覆盖 noteOn/noteOff/velocity0/CC64 并接入总线', () => {
  midiEventBus.resetMidiEventBusForTests()
  const noteOn = midiMessages.parseMidiMessage([0x90, 60, 100], 'FP-30X', 1, 5000)
  assert.equal(noteOn.type, 'noteOn')
  assert.equal(noteOn.midiNumber, 60)
  assert.equal(noteOn.noteName, 'C4')
  assert.equal(noteOn.velocity, 100)
  assert.equal(noteOn.timestamp, 5000)

  const velocityZero = midiMessages.parseMidiMessage([0x90, 60, 0], 'FP-30X', 2, 5001)
  assert.equal(velocityZero.type, 'noteOff')
  assert.equal(velocityZero.velocity, 0)

  const noteOff = midiMessages.parseMidiMessage([0x80, 62, 0], 'FP-30X', 3, 5002)
  assert.equal(noteOff.type, 'noteOff')

  const cc64 = midiMessages.parseMidiMessage([0xb0, 64, 127], 'FP-30X', 4, 5003)
  assert.equal(cc64.type, 'controlChange')
  assert.equal(cc64.controllerNumber, 64)
  assert.equal(cc64.sustainPedalDown, true)
  assert.equal(cc64.midiNumber, undefined)

  assert.equal(midiMessages.parseMidiMessage([0x90], 'FP-30X', 5), null)
  assert.equal(midiMessages.parseMidiMessage([0xe0, 60, 100], 'FP-30X', 6), null)

  const received = []
  const unsubscribe = midiEventBus.subscribeMidiEvents((event) => received.push([event.id, event.midiNumber]))
  midiEventBus.publishMidiEvent(noteOn)
  midiEventBus.publishMidiEvent(velocityZero)
  midiEventBus.publishMidiEvent(cc64)
  assert.deepEqual(received, [[1, 60], [2, 60], [4, undefined]])
  unsubscribe()
})

test('同 timestamp 双音、三音、四音经逐事件层全部送达', () => {
  midiEventBus.resetMidiEventBusForTests()
  const seen = []
  const unsubscribe = midiEventBus.subscribeMidiEvents((event) => {
    if (event.type === 'noteOn' && typeof event.midiNumber === 'number') seen.push(event.midiNumber)
  })

  const chords = [
    [60, 64],
    [60, 64, 67],
    [60, 64, 67, 71]
  ]
  let eventId = 0
  for (const chord of chords) {
    const before = seen.length
    for (const midiNumber of chord) {
      eventId += 1
      const event = midiMessages.parseMidiMessage([0x90, midiNumber, 100], 'FP-30X', eventId, 9000)
      midiEventBus.publishMidiEvent(event)
    }
    assert.equal(seen.length - before, chord.length, `同 timestamp ${chord.length} 音必须全部送达`)
    assert.deepEqual(seen.slice(-chord.length), chord)
  }
  unsubscribe()
})

test('极快速 MIDI 序列与快速重复音逐条按顺序消费', () => {
  midiEventBus.resetMidiEventBusForTests()
  const seen = []
  const unsubscribe = midiEventBus.subscribeMidiEvents((event) => seen.push(`${event.type}:${event.midiNumber}`))
  const sequence = [
    [0x90, 60, 100], [0x90, 62, 100], [0x90, 64, 100], [0x90, 65, 100],
    [0x90, 67, 100], [0x90, 69, 100], [0x90, 71, 100], [0x90, 72, 100],
    [0x90, 60, 0], [0x90, 60, 100], [0x90, 60, 0]
  ]
  sequence.forEach((data, index) => {
    const event = midiMessages.parseMidiMessage(data, 'FP-30X', index + 1, 10000 + index)
    midiEventBus.publishMidiEvent(event)
  })
  assert.deepEqual(seen, [
    'noteOn:60', 'noteOn:62', 'noteOn:64', 'noteOn:65', 'noteOn:67', 'noteOn:69', 'noteOn:71', 'noteOn:72',
    'noteOff:60', 'noteOn:60', 'noteOff:60'
  ])
  unsubscribe()
})

test('订阅期间暂停、卸载与重入均隔离 MIDI 事件', () => {
  midiEventBus.resetMidiEventBusForTests()
  const collected = []
  let paused = false
  let baseline = midiEventBus.getLastMidiEventId()
  const listener = (event) => {
    if (event.id <= baseline || paused) return
    collected.push(event.id)
  }
  const unsubscribe = midiEventBus.subscribeMidiEvents(listener)
  const publish = (id, midiNumber) => midiEventBus.publishMidiEvent({
    id,
    type: 'noteOn',
    midiNumber,
    velocity: 100,
    timestamp: 20000 + id,
    deviceName: 'Regression MIDI'
  })

  publish(1, 60)
  publish(2, 62)
  paused = true
  publish(3, 64)
  paused = false
  publish(4, 65)
  unsubscribe()
  publish(5, 67)
  assert.deepEqual(collected, [1, 2, 4], '暂停期间事件不得恢复后污染，卸载后不得继续收到事件')

  const reentered = []
  baseline = midiEventBus.getLastMidiEventId()
  const unsubscribeReentered = midiEventBus.subscribeMidiEvents((event) => {
    if (event.id <= baseline) return
    reentered.push(event.id)
  })
  publish(6, 69)
  assert.deepEqual(reentered, [6], '重新进入不得重放上一次遗留事件')
  unsubscribeReentered()
})

test('音阶核心按目标时间点判定 8 音全对且无漏音错音', () => {
  const scale = scalePatterns.getMajorScaleByKey('C')
  const targets = scalePatterns.createScaleTargets(scale, 'right-ascending', 1000, { notesPerBeat: 1 })
  const core = new scalePracticeCore.ScalePracticeCore(targets, 'standard')
  core.reset(0)
  const start = 10000

  targets.forEach((target, index) => {
    core.processMidiEvent({
      id: index + 1,
      type: 'noteOn',
      midiNumber: target.notes[0],
      velocity: 100,
      timestamp: start + target.timeMs,
      deviceName: 'Regression MIDI'
    }, start)
  })

  assert.equal(core.isComplete, true)
  assert.equal(core.results.filter((result) => result.type === 'correct').length, 8)
  assert.equal(core.results.filter((result) => result.type === 'missing_note').length, 0)
  assert.equal(core.results.filter((result) => result.type === 'wrong_note').length, 0)
  assert.equal(core.results.filter((result) => result.type === 'early' || result.type === 'late').length, 0)
})

test('音阶一个音不弹只产生 1 个漏音', () => {
  const scale = scalePatterns.getMajorScaleByKey('C')
  const targets = scalePatterns.createScaleTargets(scale, 'right-ascending', 1000, { notesPerBeat: 1 })
  const core = new scalePracticeCore.ScalePracticeCore(targets, 'standard')
  core.reset(0)
  const start = 10000

  targets.forEach((target, index) => {
    if (index === 3) return
    core.processMidiEvent({
      id: index + 1,
      type: 'noteOn',
      midiNumber: target.notes[0],
      velocity: 100,
      timestamp: start + target.timeMs,
      deviceName: 'Regression MIDI'
    }, start)
  })

  assert.equal(core.results.filter((result) => result.type === 'missing_note').length, 1)
  assert.equal(core.results.filter((result) => result.type === 'correct').length, 7)
  assert.equal(core.results.filter((result) => result.type === 'wrong_note').length, 0)
})

test('音阶窗口真正结束且无匹配输入才记漏音并推进', () => {
  const scale = scalePatterns.getMajorScaleByKey('C')
  const targets = scalePatterns.createScaleTargets(scale, 'right-ascending', 1000, { notesPerBeat: 1 })
  const core = new scalePracticeCore.ScalePracticeCore(targets, 'standard')
  core.reset(0)

  core.advanceElapsed(241)
  assert.equal(core.results[0].type, 'missing_note')
  assert.equal(core.currentStepIndex, 1)
  core.advanceElapsed(1241)
  assert.equal(core.results[1].type, 'missing_note')
  assert.equal(core.currentStepIndex, 2)
})

test('音阶提前与迟到合法窗口内被接受并记录正负偏移', () => {
  const scale = scalePatterns.getMajorScaleByKey('C')
  const targets = scalePatterns.createScaleTargets(scale, 'right-ascending', 1000, { notesPerBeat: 1 })
  const core = new scalePracticeCore.ScalePracticeCore(targets, 'standard')
  core.reset(0)
  const start = 10000

  core.processMidiEvent({
    id: 1, type: 'noteOn', midiNumber: 60, velocity: 100,
    timestamp: start, deviceName: 'Regression MIDI'
  }, start)
  assert.equal(core.results[0].type, 'correct')

  core.processMidiEvent({
    id: 2, type: 'noteOn', midiNumber: 62, velocity: 100,
    timestamp: start + 800, deviceName: 'Regression MIDI'
  }, start)
  assert.equal(core.results[1].type, 'early')
  assert.equal(core.results[1].timeOffsetMs, -200)

  core.processMidiEvent({
    id: 3, type: 'noteOn', midiNumber: 64, velocity: 100,
    timestamp: start + 2150, deviceName: 'Regression MIDI'
  }, start)
  assert.equal(core.results[2].type, 'late')
  assert.equal(core.results[2].timeOffsetMs, 150)
})

test('音阶超过合法窗口的输入按漏音处理且不误判下一目标', () => {
  const scale = scalePatterns.getMajorScaleByKey('C')
  const targets = scalePatterns.createScaleTargets(scale, 'right-ascending', 1000, { notesPerBeat: 1 })
  const core = new scalePracticeCore.ScalePracticeCore(targets, 'standard')
  core.reset(0)
  const start = 10000

  core.processMidiEvent({
    id: 1, type: 'noteOn', midiNumber: 60, velocity: 100,
    timestamp: start + 250, deviceName: 'Regression MIDI'
  }, start)
  assert.equal(core.results[0].type, 'missing_note')
  assert.equal(core.currentStepIndex, 1)
  assert.equal(core.results.filter((result) => result.type === 'wrong_note').length, 0)
})

test('每拍 2 音与每拍 4 音时间换算正确且全对', () => {
  const scale = scalePatterns.getMajorScaleByKey('C')
  assert.equal(scalePatterns.createScaleTargets(scale, 'right-speed', 1000, { notesPerBeat: 2 })[1].timeMs, 500)
  assert.equal(scalePatterns.createScaleTargets(scale, 'right-speed', 1000, { notesPerBeat: 4 })[1].timeMs, 250)

  for (const notesPerBeat of [2, 4]) {
    const targets = scalePatterns.createScaleTargets(scale, 'right-speed', 1000, { notesPerBeat })
    const core = new scalePracticeCore.ScalePracticeCore(targets, 'standard')
    core.reset(0)
    const start = 20000
    targets.forEach((target, index) => {
      core.processMidiEvent({
        id: index + 1, type: 'noteOn', midiNumber: target.notes[0], velocity: 100,
        timestamp: start + target.timeMs, deviceName: 'Regression MIDI'
      }, start)
    })
    assert.equal(core.results.filter((result) => result.type === 'correct').length, targets.length)
    assert.equal(core.results.filter((result) => result.type === 'missing_note').length, 0)
  }
})

test('和弦柱式旧模块 D4 F4 A4 收集与缺失/多音语义', () => {
  const target = { id: 'D-major', notes: [62, 65, 69], label: 'D' }
  const collectChordNotes = (events, windowMs) => {
    const notes = []
    let firstTime = null
    for (const event of events) {
      if (event.type !== 'noteOn' || typeof event.midiNumber !== 'number') continue
      if (firstTime === null || event.timestamp - firstTime <= windowMs) {
        firstTime = firstTime ?? event.timestamp
        notes.push(event.midiNumber)
      }
    }
    return chordFeedback.normalizeNotes(notes)
  }
  const noteOn = (id, midiNumber, timestamp) => ({
    id, type: 'noteOn', midiNumber, velocity: 100, timestamp, deviceName: 'Regression MIDI'
  })

  const sameTimestamp = collectChordNotes([
    noteOn(1, 62, 3000),
    noteOn(2, 65, 3000),
    noteOn(3, 69, 3000)
  ], 150)
  assert.deepEqual(sameTimestamp, [62, 65, 69])
  assert.equal(chordFeedback.createChordFeedback(target, sameTimestamp).type, 'correct')

  const fewMsApart = collectChordNotes([
    noteOn(4, 62, 3000),
    noteOn(5, 65, 3007),
    noteOn(6, 69, 3015)
  ], 150)
  assert.deepEqual(fewMsApart, [62, 65, 69])
  assert.equal(chordFeedback.createChordFeedback(target, fewMsApart).type, 'correct')

  const onlyA4 = chordFeedback.createChordFeedback(target, [69])
  assert.equal(onlyA4.type, 'missing_note')
  assert.deepEqual(onlyA4.missingNotes, [62, 65])
  assert.match(onlyA4.message, /缺少 D4 \/ F4/)

  const withExtraC5 = chordFeedback.createChordFeedback(target, [62, 65, 69, 72])
  assert.equal(withExtraC5.type, 'extra_note')
  assert.deepEqual(withExtraC5.extraNotes, [72])
  assert.equal(chordFeedback.createChordFeedback(target, [62, 65, 72]).type, 'wrong_note')
})

test('练习 Hook 与页面不再把 latestEvent 当作判定事件队列', () => {
  const hookFiles = [
    'useScalePractice.ts',
    'useChordPractice.ts',
    'useRhythmPractice.ts',
    'useCoordinationPractice.ts',
    'useSightReadingPractice.ts',
    'usePracticeEngine.ts'
  ]
  for (const file of hookFiles) {
    const source = fs.readFileSync(require.resolve(`../src/renderer/src/hooks/${file}`), 'utf8')
    assert.doesNotMatch(source, /latestMidiEvent/, `${file} 不应再消费 latestMidiEvent`)
    assert.match(source, /useMidiEventSubscription/, `${file} 应订阅逐事件分发层`)
  }

  const appSource = fs.readFileSync(require.resolve('../src/renderer/src/App.tsx'), 'utf8')
  assert.doesNotMatch(appSource, /latestMidiEvent=\{midi\.latestEvent\}/, 'App 不应再向练习页面传递 latestEvent')

  for (const page of [
    'SightReadingPage.tsx',
    'RhythmPracticePage.tsx',
    'ScalePracticePage.tsx',
    'ChordPracticePage.tsx',
    'CoordinationPracticePage.tsx'
  ]) {
    const source = fs.readFileSync(require.resolve(`../src/renderer/src/components/${page}`), 'utf8')
    assert.doesNotMatch(source, /latestMidiEvent/, `${page} 不应再传递 latestMidiEvent`)
  }
})

test('结果报告返回行为统一且识谱报告精简', () => {
  const reportModal = fs.readFileSync(require.resolve('../src/renderer/src/components/PracticeReportModal.tsx'), 'utf8')
  assert.match(reportModal, />返回</)
  assert.match(reportModal, /aria-label="关闭报告"/)
  assert.doesNotMatch(reportModal, /返回首页/)

  for (const page of [
    'SightReadingPage.tsx',
    'RhythmPracticePage.tsx',
    'ScalePracticePage.tsx',
    'ChordPracticePage.tsx',
    'CoordinationPracticePage.tsx'
  ]) {
    const source = fs.readFileSync(require.resolve(`../src/renderer/src/components/${page}`), 'utf8')
    assert.doesNotMatch(source, /返回首页/, `${page} 不应再提供返回首页行为`)
    assert.match(source, /onBack=\{/, `${page} 应通过共享报告弹窗接入返回行为`)
  }

  const sightPage = fs.readFileSync(require.resolve('../src/renderer/src/components/SightReadingPage.tsx'), 'utf8')
  assert.doesNotMatch(sightPage, /练习名称|ClefReportCard|sight-clef-report-grid/, '识谱主报告不得再包含配置项与谱表拆分卡')
  assert.match(sightPage, /查看详情/)
  assert.match(sightPage, /本次没有错误或超时/)
  assert.match(sightPage, /显示全部音符/)

  const componentCss = fs.readFileSync(require.resolve('../src/renderer/src/components.css'), 'utf8')
  const themesCss = fs.readFileSync(require.resolve('../src/renderer/src/styles/themes.css'), 'utf8')
  assert.doesNotMatch(componentCss, /sight-clef-report-grid/)
  assert.doesNotMatch(themesCss, /sight-clef-report-grid/)
})

test('SFZ 采样包解析：锚点、键区、循环与分组默认值', () => {
  const sfz = `
    // Salamander Grand Piano V2 子集
    <group>
      loop_mode=loop_continuous
      volume=-3
    </group>
    <region> sample=A0.wav lokey=21 hikey=27 pitch_keycenter=21 </region>
    <region> sample=C4.wav lokey=48 hikey=63 pitch_keycenter=60 loop_start=44100 loop_end=88200 </region>
    <region> sample=C7.wav lokey=96 hikey=108 pitch_keycenter=96 </region>
  `
  const anchors = samplePackLoader.parseSfz(sfz)
  assert.equal(anchors.length, 3)
  assert.deepEqual(
    anchors.map((anchor) => [anchor.sample, anchor.lokey, anchor.hikey, anchor.pitchKeycenter]),
    [
      ['A0.wav', 21, 27, 21],
      ['C4.wav', 48, 63, 60],
      ['C7.wav', 96, 108, 96]
    ]
  )
  assert.equal(anchors[0].loopMode, 'continuous')
  assert.equal(anchors[0].volume, -3)
  assert.equal(anchors[1].loopStart, 44100)
  assert.equal(anchors[1].loopEnd, 88200)
})

test('采样锚点选择与移调 playbackRate 计算正确', () => {
  const anchors = samplePackLoader.parseSfz(`
    <region> sample=low.wav lokey=21 hikey=40 pitch_keycenter=36 </region>
    <region> sample=mid.wav lokey=41 hikey=72 pitch_keycenter=60 </region>
    <region> sample=high.wav lokey=73 hikey=108 pitch_keycenter=84 </region>
  `)

  assert.equal(samplePackLoader.computePlaybackRate(anchors[1], 60), 1)
  assert.equal(samplePackLoader.computePlaybackRate(anchors[1], 72), 2)
  assert.equal(samplePackLoader.computePlaybackRate(anchors[1], 48), 0.5)
  assert.ok(Math.abs(samplePackLoader.computePlaybackRate(anchors[1], 62) - 2 ** (2 / 12)) < 1e-9)

  assert.equal(samplePackLoader.selectSampleAndRate(anchors, 60).anchor.sample, 'mid.wav')
  assert.equal(samplePackLoader.selectSampleAndRate(anchors, 40).anchor.sample, 'low.wav')
  assert.equal(samplePackLoader.selectSampleAndRate(anchors, 96).anchor.sample, 'high.wav')
  assert.equal(samplePackLoader.selectSampleAndRate([], 60), null)

  assert.equal(samplePackLoader.getVelocityGain(0), 0.28)
  assert.equal(samplePackLoader.getVelocityGain(127), 1)
  assert.equal(samplePackLoader.clampPianoVolume(150), 100)
  assert.equal(samplePackLoader.clampPianoVolume(-5), 0)
})

test('钢琴音频模式设置默认内置并安全读写', () => {
  const values = new Map()
  const storage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    }
  }

  assert.equal(audioModeSettings.sanitizeAudioMode('builtin'), 'builtin')
  assert.equal(audioModeSettings.sanitizeAudioMode('silent'), 'silent')
  assert.equal(audioModeSettings.sanitizeAudioMode('external'), 'external')
  assert.equal(audioModeSettings.sanitizeAudioMode('bogus'), 'builtin')
  assert.equal(audioModeSettings.sanitizeAudioMode(null), 'builtin')

  assert.equal(audioModeSettings.readAudioMode(storage), 'builtin')
  assert.equal(audioModeSettings.writeAudioMode('external', storage), true)
  assert.equal(audioModeSettings.readAudioMode(storage), 'external')
  assert.equal(audioModeSettings.readPianoVolume(storage), 70)
  assert.equal(audioModeSettings.writePianoVolume(88, storage), true)
  assert.equal(audioModeSettings.readPianoVolume(storage), 88)

  values.set(audioModeSettings.PIANO_VOLUME_STORAGE_KEY, '999')
  assert.equal(audioModeSettings.readPianoVolume(storage), 100)
})

test('采样器复音策略：重复音、抢声部与延音集合', () => {
  const voices = [
    { id: 1, midiNumber: 60, physicalKeyDown: true, sustainedByPedal: false, released: false, startedAt: 100 },
    { id: 2, midiNumber: 64, physicalKeyDown: false, sustainedByPedal: false, released: true, startedAt: 200 },
    { id: 3, midiNumber: 67, physicalKeyDown: false, sustainedByPedal: true, released: false, startedAt: 300 }
  ]

  assert.equal(voicePolicy.findVoiceForNote(voices, 60)?.id, 1)
  assert.equal(voicePolicy.findVoiceForNote(voices, 64), null)
  assert.equal(voicePolicy.pickVoiceToSteal(voices, 8), null)
  assert.equal(voicePolicy.pickVoiceToSteal(voices, 2)?.id, 2, '超限时应优先偷已释放声部')
  assert.deepEqual(
    voicePolicy.collectSustainedVoices(voices).map((voice) => voice.id),
    [3]
  )
  assert.equal(voicePolicy.countReleasedVoices(voices), 1)

  const allActive = [
    { id: 1, midiNumber: 60, physicalKeyDown: true, sustainedByPedal: false, released: false, startedAt: 100 },
    { id: 2, midiNumber: 62, physicalKeyDown: true, sustainedByPedal: false, released: false, startedAt: 200 }
  ]
  assert.equal(voicePolicy.pickVoiceToSteal(allActive, 1)?.id, 1, '无已释放声部时偷最旧活动声部')
})

test('钢琴音频层接入逐事件总线且不使用 latestEvent', () => {
  const audioHook = fs.readFileSync(require.resolve('../src/renderer/src/hooks/usePianoAudio.ts'), 'utf8')
  const samplerSource = fs.readFileSync(require.resolve('../src/renderer/src/audio/pianoSampler.ts'), 'utf8')
  const legacyAudioSource = fs.readFileSync(require.resolve('../src/renderer/src/hooks/useAudioEngine.ts'), 'utf8')

  assert.match(audioHook, /useMidiEventSubscription/)
  assert.doesNotMatch(audioHook, /latestEvent|latestMidiEvent/)
  assert.doesNotMatch(legacyAudioSource, /latestEvent|latestMidiEvent/)
  assert.match(samplerSource, /class PianoSampler/)
  assert.match(samplerSource, /setSustain/)
  assert.match(samplerSource, /pickVoiceToSteal/)
  assert.match(samplerSource, /loadSamplePack/)
  assert.match(audioHook, /readAudioMode/)
  assert.match(audioHook, /writePianoVolume/)
})

test('自由练习 MIDI 录制逐条捕获并生成事实统计', () => {
  const session = midiRecording.createRecordingSession(5000)
  const noteOn = (id, midiNumber, timestamp, velocity = 100) => ({
    id, type: 'noteOn', midiNumber, velocity, timestamp, deviceName: 'Regression MIDI'
  })
  const noteOff = (id, midiNumber, timestamp) => ({
    id, type: 'noteOff', midiNumber, velocity: 0, timestamp, deviceName: 'Regression MIDI'
  })
  const cc64 = (id, value, timestamp) => ({
    id, type: 'controlChange', controllerNumber: 64, value, sustainPedalDown: value >= 64, timestamp, deviceName: 'Regression MIDI'
  })

  // 同 timestamp 三音 + 快速 8 音 + 踏板
  for (const midiNumber of [62, 65, 69]) {
    midiRecording.appendRecordedEvent(session, noteOn(session.events.length + 1, midiNumber, 5000))
  }
  midiRecording.appendRecordedEvent(session, cc64(4, 127, 5100))
  for (let index = 0; index < 8; index += 1) {
    midiRecording.appendRecordedEvent(session, noteOn(10 + index, 60 + index, 5200 + index))
    midiRecording.appendRecordedEvent(session, noteOff(20 + index, 60 + index, 5350 + index))
  }
  midiRecording.appendRecordedEvent(session, cc64(99, 0, 9000))

  assert.equal(session.events.length, 21)
  assert.equal(session.events[0].relativeTimeMs, 0)
  assert.equal(session.events[1].relativeTimeMs, 0)
  assert.equal(session.events[2].relativeTimeMs, 0)

  const stats = midiRecording.summarizeRecording(session, 9500)
  assert.equal(stats.noteOnCount, 11)
  assert.equal(stats.lowestMidi, 60)
  assert.equal(stats.highestMidi, 69)
  assert.equal(stats.actualRange, 9)
  assert.equal(stats.pedalDownCount, 1)
  assert.ok(stats.pedalDownDurationMs >= 3900)
  assert.equal(stats.leftRegionNoteOnCount, 0)
  assert.equal(stats.rightRegionNoteOnCount, 11)
  assert.ok(stats.averageVelocity > 0)
})

test('自由练习回放时间线有序并支持跳转与速度', () => {
  const session = midiRecording.createRecordingSession(0)
  const push = (id, type, midiNumber, timestamp, velocity = 100) => {
    midiRecording.appendRecordedEvent(session, {
      id, type, midiNumber, velocity, timestamp, deviceName: 'Regression MIDI'
    })
  }
  push(1, 'noteOn', 60, 0)
  push(2, 'noteOn', 64, 0)
  push(3, 'noteOff', 60, 500)
  push(4, 'noteOn', 60, 700)
  push(5, 'noteOff', 64, 900)

  const timeline = midiRecording.createPlaybackTimeline(session.events)
  assert.deepEqual(timeline.map((action) => action.type), ['noteOn', 'noteOn', 'noteOff', 'noteOn', 'noteOff'])
  assert.deepEqual(timeline.map((action) => action.timeMs), [0, 0, 500, 700, 900])
  assert.equal(midiRecording.getPlaybackDurationMs(session.events), 900)

  const cursor = new midiRecording.PlaybackCursorCore(session.events)
  cursor.seek(0)
  const first = cursor.advanceTo(0)
  assert.equal(first.length, 2)
  assert.equal(cursor.advanceTo(500).length, 1)
  cursor.seek(650)
  const afterSeek = cursor.advanceTo(900)
  assert.deepEqual(afterSeek.map((action) => action.midiNumber), [60, 64])
  assert.equal(cursor.isFinished(), true)
})

test('教材目录：哈农元数据、车尔尼100目录与真实音阶/协调练习', () => {
  const hanon = curriculumCatalog.getCurriculumBook('hanon')
  const czerny = curriculumCatalog.getCurriculumBook('czerny-599')
  const scales = curriculumCatalog.getCurriculumBook('scales')
  const coordination = curriculumCatalog.getCurriculumBook('coordination')

  assert.equal(hanon.exercises.length, 10)
  assert.equal(czerny.exercises.length, 100)
  assert.ok(scales.exercises.length >= 12)
  assert.ok(coordination.exercises.length >= 4)

  // 不允许伪造教材音符：未导入的哈农/车尔尼必须是 partial 且无 noteSequence
  assert.ok(hanon.exercises.every((exercise) => exercise.contentStatus === 'partial' && exercise.noteSequence === null))
  assert.ok(czerny.exercises.every((exercise) => exercise.contentStatus === 'partial' && exercise.noteSequence === null))
  assert.ok(czerny.exercises.every((exercise) => exercise.techniqueTags.length === 0), '不得凭编号猜测车尔尼技术标签')
  assert.ok(hanon.exercises.every((exercise) => exercise.techniqueTags.length > 0))

  const cMajorScale = curriculumCatalog.getCurriculumExercise('scale-C-right-ascending')
  assert.ok(cMajorScale !== null)
  assert.deepEqual(cMajorScale.noteSequence.midi, [60, 62, 64, 65, 67, 69, 71, 72])
  assert.equal(cMajorScale.contentStatus, 'verified')

  const ids = curriculumCatalog.CURRICULUM_BOOKS.flatMap((book) => book.exercises.map((exercise) => exercise.id))
  assert.equal(new Set(ids).size, ids.length)
})

test('教材进度存储：损坏回退、合法迁移与练习记录', () => {
  const values = new Map()
  const storage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    }
  }

  assert.deepEqual(curriculumProgress.readCurriculumProgress(storage), {
    version: 1,
    exercises: {}
  })

  values.set(curriculumProgress.CURRICULUM_PROGRESS_STORAGE_KEY, '{bad json')
  assert.deepEqual(curriculumProgress.readCurriculumProgress(storage).exercises, {})

  const migrated = curriculumProgress.migrateProgressState({
    exercises: {
      'hanon-1': { exerciseId: 'hanon-1', status: 'mastered', attempts: 3, currentTempo: 80, bogus: true },
      broken: 'not-an-object'
    }
  })
  assert.equal(migrated.version, 1)
  assert.equal(migrated.exercises['hanon-1'].status, 'mastered')
  assert.equal(migrated.exercises['hanon-1'].attempts, 3)
  assert.equal(migrated.exercises['hanon-1'].lastPracticedAt, null)
  assert.equal(migrated.exercises.broken, undefined)

  const attempted = curriculumProgress.recordExerciseAttempt(migrated, 'hanon-1', {
    currentTempo: 88,
    targetTempo: 100,
    durationMs: 60000
  })
  assert.equal(attempted.exercises['hanon-1'].attempts, 4)
  assert.equal(attempted.exercises['hanon-1'].currentTempo, 88)
  assert.equal(attempted.exercises['hanon-1'].totalDurationMs, 60000)
  assert.ok(attempted.exercises['hanon-1'].lastPracticedAt !== null)

  assert.equal(curriculumProgress.writeCurriculumProgress(attempted, storage), true)
  assert.equal(curriculumProgress.readCurriculumProgress(storage).exercises['hanon-1'].currentTempo, 88)
})

test('自由练习记录适配器只保存事实字段', () => {
  const practiceRecordAdapters = require('../src/renderer/src/utils/practiceRecordAdapters.ts')
  const timing = {
    id: 'free-session-1',
    startedAt: '2026-08-13T00:00:00.000Z',
    endedAt: '2026-08-13T00:01:00.000Z',
    durationMs: 60000
  }
  const stats = {
    durationMs: 60000,
    noteOnCount: 24,
    lowestMidi: 48,
    highestMidi: 84,
    actualRange: 36,
    averageVelocity: 90,
    velocityRange: 70,
    pedalDownCount: 2,
    pedalDownDurationMs: 8000,
    densityPerSecond: 0.4,
    leftRegionNoteOnCount: 8,
    rightRegionNoteOnCount: 16
  }
  const record = practiceRecordAdapters.createFreePracticeRecord({ timing, stats, notes: '试音' })
  assert.equal(record.module, 'free-practice')
  assert.equal(record.moduleName, '自由练习')
  assert.equal(record.accuracy, 0)
  assert.equal(record.details.lowestMidi, 48)
  assert.equal(record.details.rightRegionNoteOnCount, 16)
  assert.equal(record.mistakes.length, 0)
  assert.equal('wrongNoteCount' in record && record.wrongNoteCount, 0)
})

test('和弦 V2 身份模型：根音、音级集合与扩展/变化音分离', () => {
  const cMajor = chordIdentity.getChordV2Identity(0, 'major')
  assert.deepEqual(cMajor.requiredPitchClasses, [0, 4, 7])
  assert.deepEqual(cMajor.optionalPitchClasses, [])

  const dMinor = chordIdentity.getChordV2Identity(2, 'minor')
  assert.deepEqual(dMinor.requiredPitchClasses, [2, 5, 9])

  const cmaj7 = chordIdentity.getChordV2Identity(0, 'maj7')
  assert.deepEqual(cmaj7.requiredPitchClasses, [0, 4, 7, 11])

  const c9 = chordIdentity.getChordV2Identity(0, '9')
  assert.deepEqual(c9.requiredPitchClasses, [0, 4, 7, 10])
  assert.deepEqual(c9.optionalPitchClasses, [2])

  // 同音异名根音归一
  assert.deepEqual(chordIdentity.getChordV2Identity(12, 'major').requiredPitchClasses, [0, 4, 7])
  assert.deepEqual(chordIdentity.getChordV2Identity(14, 'minor').requiredPitchClasses, [2, 5, 9])
})

test('和弦 V2 标准符号：格式化与解析（含 slash 与 ♭）', () => {
  assert.equal(chordIdentity.formatChordSymbol(0, 'maj7', 7), 'Cmaj7/G')
  assert.equal(chordIdentity.formatChordSymbol(2, 'm7b5'), 'Dm7♭5')
  assert.equal(chordIdentity.formatChordSymbol(0, '6/9'), 'C6/9')
  assert.equal(chordIdentity.formatChordSymbol(0, 'major'), 'C')

  assert.deepEqual(chordIdentity.parseChordSymbol('Cmaj7/G'), {
    rootPitchClass: 0,
    quality: 'maj7',
    slashBass: 7
  })
  assert.deepEqual(chordIdentity.parseChordSymbol('Cm7♭5'), {
    rootPitchClass: 0,
    quality: 'm7b5',
    slashBass: null
  })
  assert.deepEqual(chordIdentity.parseChordSymbol('C6/9'), {
    rootPitchClass: 0,
    quality: '6/9',
    slashBass: null
  })
  assert.deepEqual(chordIdentity.parseChordSymbol('Csus4'), {
    rootPitchClass: 0,
    quality: 'sus4',
    slashBass: null
  })
  assert.equal(chordIdentity.parseChordSymbol('Hmaj7'), null)
})

test('和弦 V2 Voicing：分层判定（身份/转位/精确）', () => {
  const identity = chordIdentity.getChordV2Identity(2, 'minor')
  const rootVoicing = voicing.createDefaultVoicing(identity, {
    registerLowest: 48,
    registerHighest: 84,
    bassConstraint: 2
  })
  assert.equal(rootVoicing.bassConstraint % 12, 2)
  assert.ok(rootVoicing.exactNotes.every((note) => note >= 48 && note <= 84))
  assert.equal(rootVoicing.exactNotes.length >= 3, true)

  // 身份判定：不同八度、合理重复均正确
  assert.equal(voicing.judgeVoicing(rootVoicing, [38, 53, 57], 'identity').judgement, 'correct')
  assert.equal(voicing.judgeVoicing(rootVoicing, [38, 57], 'identity').judgement, 'missing')
  assert.equal(voicing.judgeVoicing(rootVoicing, [38, 53, 57, 58], 'identity').judgement, 'extra')

  // 转位判定：最低音错误
  const inversionVoicing = voicing.createDefaultVoicing(identity, {
    registerLowest: 48,
    registerHighest: 84,
    bassConstraint: 5
  })
  assert.equal(voicing.judgeVoicing(inversionVoicing, [38, 53, 57], 'inversion').judgement, 'wrong_bass')
  assert.equal(voicing.judgeVoicing(inversionVoicing, [41, 50, 57], 'inversion').judgement, 'correct')

  // 精确判定：必须完全一致
  const exact = voicing.judgeVoicing(rootVoicing, rootVoicing.exactNotes, 'exact')
  assert.equal(exact.judgement, 'correct')
  const exactWrong = voicing.judgeVoicing(rootVoicing, [rootVoicing.exactNotes[0], rootVoicing.exactNotes[1] + 12, rootVoicing.exactNotes[2]], 'exact')
  assert.equal(exactWrong.judgement, 'missing')
})

test('和弦 V2 分解有序状态机', () => {
  const machine = new voicing.ArpeggioStateMachine([50, 53, 57])
  assert.equal(machine.processNote(50), 'correct')
  assert.equal(machine.processNote(52), 'wrong')
  assert.equal(machine.processNote(53), 'correct')
  assert.equal(machine.processNote(57), 'complete')
  assert.equal(machine.isComplete, true)
  assert.equal(machine.progress, 3)

  const resetMachine = new voicing.ArpeggioStateMachine([50, 53, 57])
  resetMachine.processNote(50)
  resetMachine.reset()
  assert.equal(resetMachine.progress, 0)
  assert.equal(resetMachine.processNote(50), 'correct')
})

test('和弦 V2 和声功能与 Voice Leading 启发式', () => {
  assert.equal(harmony.getHarmonicFunction(0, 0, 'major'), 'tonic')
  assert.equal(harmony.getHarmonicFunction(0, 5, 'major'), 'subdominant')
  assert.equal(harmony.getHarmonicFunction(0, 7, 'major'), 'dominant')
  assert.equal(harmony.getHarmonicFunction(0, 2, 'minor'), 'other')
  assert.equal(harmony.getScaleDegree(0, 7), 5)
  assert.equal(harmony.getScaleDegree(0, 1), null)

  const cMajor = chordIdentity.getChordV2Identity(0, 'major')
  const aMinor = chordIdentity.getChordV2Identity(9, 'minor')
  const fMajor = chordIdentity.getChordV2Identity(5, 'major')
  const smooth = harmony.voiceLeadingScore(cMajor, aMinor)
  const jumpy = harmony.voiceLeadingScore(cMajor, fMajor)
  assert.ok(smooth >= 0)
  assert.ok(smooth < jumpy, '共同音更多、低音移动更小的进行应得分更低（更平滑）')
})

test('和弦 V2 页面与 Hook 接入逐事件总线且不使用 latestEvent', () => {
  const hookSource = fs.readFileSync(require.resolve('../src/renderer/src/hooks/useChordV2Practice.ts'), 'utf8')
  const pageSource = fs.readFileSync(require.resolve('../src/renderer/src/components/ChordV2Page.tsx'), 'utf8')
  const appSource = fs.readFileSync(require.resolve('../src/renderer/src/App.tsx'), 'utf8')

  assert.match(hookSource, /useMidiEventSubscription/)
  assert.match(hookSource, /judgeVoicing/)
  assert.match(hookSource, /ArpeggioStateMachine/)
  assert.doesNotMatch(hookSource, /latestMidiEvent|latestEvent/)
  assert.match(pageSource, /MiniKeyboard/)
  assert.match(pageSource, /PracticeSettingsDrawer/)
  assert.match(appSource, /ChordV2Page/)
  assert.match(pageSource, /onBack=\{/)
  assert.doesNotMatch(pageSource, /返回首页/)
})

test('进行模型：4536251 与四个常用进行定义完整且级数/功能正确', () => {
  assert.equal(progressionTypes.PROGRESSION_IDS.length, 5)
  const p453 = progressions.getProgressionDefinition('4536251')
  assert.deepEqual(p453.steps.map((step) => step.degree), [4, 5, 3, 6, 2, 5, 1])
  assert.deepEqual(p453.steps.map((step) => step.quality), ['major', 'major', 'minor', 'minor', 'minor', 'major', 'major'])

  const model = progressions.buildProgression('4536251', 0)
  assert.equal(model.steps.length, 7)
  assert.deepEqual(model.steps.map((step) => step.roman), ['IV', 'V', 'III', 'VI', 'II', 'V', 'I'])
  assert.deepEqual(model.steps.map((step) => step.function), [
    'subdominant', 'dominant', 'other', 'other', 'other', 'dominant', 'tonic'
  ])

  const iiVI = progressions.buildProgression('ii-V-I', 0)
  assert.deepEqual(iiVI.steps.map((step) => step.roman), ['II', 'V', 'I'])
  assert.equal(progressions.getDiatonicRoot(0, 1), 0)
  assert.equal(progressions.getDiatonicRoot(0, 5), 7)
  assert.equal(progressions.getDiatonicRoot(0, 6), 9)

  const fKey = progressions.buildProgression('I-IV-V-I', 5)
  assert.deepEqual(fKey.steps.map((step) => step.identity.root), [5, 10, 0, 5])
})

test('进行步骤判定与符号输出', () => {
  const model = progressions.buildProgression('ii-V-I', 0)
  const step = model.steps[0]
  assert.equal(progressions.getProgressionStepSymbol(step), 'Dm')
  assert.equal(progressions.judgeProgressionStep(step, step.voicing.exactNotes), 'correct')
  const wrongNotes = step.voicing.exactNotes.map((note, index) => index === 0 ? note + 1 : note)
  assert.equal(progressions.judgeProgressionStep(step, wrongNotes), 'wrong')
})

test('编配变化：纹理选择、可演奏性校验与 Voice Leading 评分', () => {
  const variation = arrangement.createArrangementVariation('4536251', 0, () => 0.1)
  assert.equal(variation.progressionId, '4536251')
  assert.equal(variation.steps.length, 7)
  assert.ok(variation.steps.every((step) => step.texture === 'block' || step.texture === 'arpeggio'))
  assert.ok(variation.voiceLeadingScore >= 0)
  assert.equal(typeof variation.playable, 'boolean')

  const identity = chordIdentity.getChordV2Identity(0, 'major')
  const wideVoicing = voicing.createDefaultVoicing(identity, {
    registerLowest: 36,
    registerHighest: 84,
    bassConstraint: 0
  })
  assert.equal(arrangement.validatePlayability(wideVoicing, { registerHighest: 84 }), true)
  assert.equal(arrangement.validatePlayability({
    ...wideVoicing,
    exactNotes: [36, 72],
    range: { lowest: 36, highest: 84 }
  }, { registerHighest: 84, maxSpacingSemitones: 24 }), false, '过宽声部间距应判为不可演奏')

  const formatted = arrangement.formatArrangementStep(variation.steps[0])
  assert.match(formatted, /IV/)
  assert.match(formatted, /柱式|分解/)
})

test('进行练习 Hook 与面板接入逐事件总线且不使用 latestEvent', () => {
  const hookSource = fs.readFileSync(require.resolve('../src/renderer/src/hooks/useProgressionPractice.ts'), 'utf8')
  const panelSource = fs.readFileSync(require.resolve('../src/renderer/src/components/ProgressionPracticePanel.tsx'), 'utf8')
  const chordPageSource = fs.readFileSync(require.resolve('../src/renderer/src/components/ChordV2Page.tsx'), 'utf8')

  assert.match(hookSource, /useMidiEventSubscription/)
  assert.match(hookSource, /buildProgression/)
  assert.doesNotMatch(hookSource, /latestMidiEvent|latestEvent/)
  assert.match(panelSource, /useProgressionPractice/)
  assert.match(panelSource, /PracticeReportModal/)
  assert.match(chordPageSource, /ProgressionPracticePanel/)
  assert.match(chordPageSource, /practice-content-toggle/)
})

test('XML 迷你解析器：元素、属性、文本与自闭合', () => {
  const root = xmlMiniParser.parseXml(
    '<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Hi &amp; bye</work-title></work><part id="P1"/><note pitch="C4">text</note></score-partwise>'
  )
  assert.equal(root.tag, 'score-partwise')
  assert.equal(root.attributes.version, '4.0')
  const work = xmlMiniParser.findChild(root, 'work')
  assert.equal(xmlMiniParser.childText(work, 'work-title'), 'Hi & bye')
  const part = xmlMiniParser.findChild(root, 'part')
  assert.equal(part.attributes.id, 'P1')
  assert.equal(xmlMiniParser.findChild(root, 'note').text, 'text')
  assert.equal(xmlMiniParser.findChildren(root, 'note').length, 1)
})

test('MusicXML 解析：单旋律、调号、拍号与速度', () => {
  const xml = fs.readFileSync(require.resolve('./score-fixtures/single-melody.xml'), 'utf8')
  const score = musicXmlParser.loadMusicXmlDocument(xml)
  assert.equal(score.title, 'Single Melody')
  assert.equal(score.parts.length, 1)
  assert.equal(score.parts[0].measures.length, 1)
  const measure = score.parts[0].measures[0]
  assert.equal(measure.keySignature, 0)
  assert.equal(measure.timeBeats, 4)
  assert.equal(measure.timeBeatType, 4)
  assert.equal(measure.tempoBpm, 80)
  assert.deepEqual(measure.notes.map((note) => note.midiNumber), [60, 62, 64, 65, 67, 69, 71, 72])
  assert.deepEqual(measure.notes.map((note) => note.voice), Array(8).fill('1'))
  assert.equal(score.defaultTempoBpm, 80)
})

test('MusicXML 解析：和弦、延音、休止、临时记号与调号变化', () => {
  const chordXml = fs.readFileSync(require.resolve('./score-fixtures/chord-tie-rest.xml'), 'utf8')
  const chordScore = musicXmlParser.loadMusicXmlDocument(chordXml)
  const firstMeasure = chordScore.parts[0].measures[0]
  assert.equal(firstMeasure.notes.filter((note) => note.isChordTone).length, 1)
  assert.equal(firstMeasure.notes.find((note) => note.midiNumber === 60)?.tie, 'start')
  assert.equal(firstMeasure.notes.some((note) => note.type === 'rest'), true)
  const secondMeasure = chordScore.parts[0].measures[1]
  assert.equal(secondMeasure.notes.find((note) => note.midiNumber === 60)?.tie, 'stop')

  const accidentalXml = fs.readFileSync(require.resolve('./score-fixtures/accidental-key-change.xml'), 'utf8')
  const accidentalScore = musicXmlParser.loadMusicXmlDocument(accidentalXml)
  assert.equal(accidentalScore.parts[0].measures[0].keySignature, 1)
  assert.equal(accidentalScore.parts[0].measures[0].notes[0].alter, 1)
  assert.equal(accidentalScore.parts[0].measures[0].notes[0].accidental, 'sharp')
  assert.equal(accidentalScore.parts[0].measures[1].keySignature, -1)
  assert.equal(accidentalScore.parts[0].measures[1].notes[0].alter, -1)
})

test('时间线：同 onset 和弦归组、休止与延音单元', () => {
  const xml = fs.readFileSync(require.resolve('./score-fixtures/chord-tie-rest.xml'), 'utf8')
  const score = musicXmlParser.loadMusicXmlDocument(xml)
  const timeline = scoreTimeline.buildScoreTimeline(score)

  assert.equal(timeline.units.length, 7)
  const chordUnit = timeline.units.find((unit) => unit.expectedMidi.length === 2)
  assert.ok(chordUnit !== undefined, '和弦单元应包含同 onset 的多个音')
  assert.deepEqual(chordUnit.expectedMidi, [67, 72])

  const tieUnit = timeline.units[0]
  assert.equal(tieUnit.tieStart, true)
  assert.deepEqual(tieUnit.expectedMidi, [60])
  const restUnit = timeline.units.find((unit) => unit.rest)
  assert.ok(restUnit !== undefined)
  assert.deepEqual(restUnit.expectedMidi, [])
})

test('Wait 模式核心：正确推进、错误不推进、休止/延音自动跳过', () => {
  const xml = fs.readFileSync(require.resolve('./score-fixtures/chord-tie-rest.xml'), 'utf8')
  const score = musicXmlParser.loadMusicXmlDocument(xml)
  const timeline = scoreTimeline.buildScoreTimeline(score)
  const core = new waitScoreCore.WaitScoreCore(timeline)

  // 单元0: C4（延音开始）→ 正确
  assert.equal(core.processNoteOn(60), 'none')
  // 单元1: E4 → 正确
  core.processNoteOn(64)
  // 单元2: G4+C5 和弦（两个新 onset）→ 先按 G 不满足，再按 C5 满足
  core.processNoteOn(67)
  assert.equal(core.processNoteOn(72), 'none')
  // 单元3: 休止 → 自动跳过
  // 单元4: C4 延音停止（不需要重按）→ 自动跳过
  // 单元5: F4 → 正确并完成
  core.processNoteOn(65)
  core.processNoteOn(69)
  assert.equal(core.isComplete, true)
  assert.equal(core.results.filter((entry) => entry.outcome === 'correct').length, 5)
  assert.equal(core.results.filter((entry) => entry.outcome === 'skip').length, 2)
  assert.equal(core.results.filter((entry) => entry.outcome === 'wrong').length, 0)

  const wrongCore = new waitScoreCore.WaitScoreCore(timeline)
  wrongCore.processNoteOn(61)
  assert.equal(wrongCore.results[0].outcome, 'wrong')
  assert.equal(wrongCore.currentIndex, 0, '错误输入不得推进')
  wrongCore.processNoteOn(60)
  assert.equal(wrongCore.currentIndex, 1)
})

test('Wait 模式：单旋律全部正确与错误计数', () => {
  const xml = fs.readFileSync(require.resolve('./score-fixtures/single-melody.xml'), 'utf8')
  const score = musicXmlParser.loadMusicXmlDocument(xml)
  const timeline = scoreTimeline.buildScoreTimeline(score)
  const core = new waitScoreCore.WaitScoreCore(timeline)

  for (const midiNumber of [60, 62, 64, 65, 67, 69, 71, 72]) {
    core.processNoteOn(midiNumber)
  }
  assert.equal(core.isComplete, true)
  assert.equal(core.results.filter((entry) => entry.outcome === 'correct').length, 8)
})

test('MXL 容器：存储型 ZIP 可解出 MusicXML 文本', () => {
  const xml = fs.readFileSync(require.resolve('./score-fixtures/single-melody.xml'), 'utf8')
  const zipBuffer = zipReader.createStoredZip([{ name: 'container.xml', content: xml }])
  const container = zipReader.extractMxlContainer(zipBuffer)
  assert.ok(container !== null)
  assert.equal(container.fileName, 'container.xml')
  assert.match(container.xmlText, /score-partwise/)
  assert.match(container.xmlText, /Single Melody/)
})

test('练习片段存储：损坏回退、净化与 upsert', () => {
  const values = new Map()
  const storage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    }
  }

  assert.deepEqual(practiceSegment.readPracticeSegments(storage), { version: 1, segments: [] })
  values.set(practiceSegment.PRACTICE_SEGMENT_STORAGE_KEY, '{bad')
  assert.deepEqual(practiceSegment.readPracticeSegments(storage).segments, [])

  const state = practiceSegment.upsertPracticeSegment({ version: 1, segments: [] }, {
    id: 's1',
    scoreId: 'demo',
    title: '片段 A',
    startMeasure: 1,
    endMeasure: 2,
    tempo: 80,
    handMode: 'both',
    practiceMode: 'wait',
    loop: false,
    notes: '',
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z'
  })
  assert.equal(state.segments.length, 1)
  const updated = practiceSegment.upsertPracticeSegment(state, {
    ...state.segments[0],
    tempo: 90,
    updatedAt: '2026-08-13T01:00:00.000Z'
  })
  assert.equal(updated.segments.length, 1)
  assert.equal(updated.segments[0].tempo, 90)
  assert.equal(practiceSegment.writePracticeSegments(updated, storage), true)
  assert.equal(practiceSegment.readPracticeSegments(storage).segments[0].id, 's1')
})

test('曲谱 Wait 练习 Hook 与页面接入逐事件总线且路由存在', () => {
  const wrapperSource = fs.readFileSync(require.resolve('../src/renderer/src/hooks/useScoreWaitPractice.ts'), 'utf8')
  const hookSource = fs.readFileSync(require.resolve('../src/renderer/src/hooks/useScorePractice.ts'), 'utf8')
  const pageSource = fs.readFileSync(require.resolve('../src/renderer/src/components/ScorePracticePage.tsx'), 'utf8')
  const appSource = fs.readFileSync(require.resolve('../src/renderer/src/App.tsx'), 'utf8')

  assert.match(wrapperSource, /useScorePractice/)
  assert.match(hookSource, /useMidiEventSubscription/)
  assert.match(hookSource, /WaitScoreCore/)
  assert.doesNotMatch(hookSource, /latestMidiEvent|latestEvent/)
  assert.match(pageSource, /loadMusicXmlDocument/)
  assert.match(pageSource, /extractMxlContainer/)
  assert.match(pageSource, /accept="\.xml,\.musicxml,\.mxl"/)
  assert.match(appSource, /ScorePracticePage/)
  assert.doesNotMatch(pageSource, /返回首页/)
})

test('Realtime 核心：准时正确、早/晚偏移、漏音与多音且不永久错位', () => {
  const xml = fs.readFileSync(require.resolve('./score-fixtures/single-melody.xml'), 'utf8')
  const score = musicXmlParser.loadMusicXmlDocument(xml)
  const timeline = scoreTimeline.buildScoreTimeline(score)
  const core = new realtimeScoreCore.RealtimeScoreCore(timeline, { toleranceMs: 180, beatDurationMs: 500 })

  // 单元0：准时 → correct
  assert.equal(core.processNoteOn(60, 0), 'correct')
  // 单元1：晚 200ms → late
  assert.equal(core.processNoteOn(62, 500 + 200), 'late')
  // 单元2：早 200ms → early
  assert.equal(core.processNoteOn(64, 1000 - 200), 'early')
  // 单元3：错误音 → wrong (extra)，不推进
  core.processNoteOn(70, 1500)
  assert.equal(core.currentIndex, 3)
  // 单元3：正确音
  core.processNoteOn(65, 1500)
  // 单元4：跳过（直接推进到窗口结束）
  core.advanceTo(2000 + 400)
  assert.equal(core.results.filter((result) => result.outcome === 'missing').length, 1)
  // 剩余继续（追赶式）：A4、B4、C5
  core.processNoteOn(67, 2500)
  core.processNoteOn(69, 2600)
  core.processNoteOn(71, 3100)
  assert.equal(core.processNoteOn(72, 3700), 'complete')
  assert.equal(core.isComplete, true)
  assert.equal(core.results.filter((result) => result.outcome === 'correct').length, 4)
})

test('Follow 核心：跟弹、漏一个音恢复、多弹不永久错位', () => {
  const xml = fs.readFileSync(require.resolve('./score-fixtures/single-melody.xml'), 'utf8')
  const score = musicXmlParser.loadMusicXmlDocument(xml)
  const timeline = scoreTimeline.buildScoreTimeline(score)

  // 完全正确
  const perfect = new followScoreCore.FollowScoreCore(timeline, { beatDurationMs: 500 })
  ;[60, 62, 64, 65, 67, 69, 71, 72].forEach((midi, index) => perfect.observeNoteOn(midi, index * 500))
  assert.equal(perfect.isComplete, true)
  assert.equal(perfect.results.filter((result) => result.outcome === 'correct').length, 8)

  // 漏一个音：跳过 E4，后面 F4 应仍能对上
  const skip = new followScoreCore.FollowScoreCore(timeline, { beatDurationMs: 500 })
  skip.observeNoteOn(60, 0)
  skip.observeNoteOn(62, 500)
  skip.observeNoteOn(65, 1500)
  assert.equal(skip.isComplete, false)
  skip.observeNoteOn(67, 2000)
  skip.observeNoteOn(69, 2500)
  skip.observeNoteOn(71, 3000)
  skip.observeNoteOn(72, 3500)
  assert.equal(skip.isComplete, true)

  // 多弹一个音：不推进当前单元，恢复后继续
  const extra = new followScoreCore.FollowScoreCore(timeline, { beatDurationMs: 500 })
  extra.observeNoteOn(60, 0)
  extra.observeNoteOn(70, 300)
  assert.equal(extra.currentIndex, 1, '多弹一个音不得推进当前单元')
  extra.observeNoteOn(62, 500)
  assert.equal(extra.currentIndex >= 2, true, '恢复正确输入后应继续')
})

test('训练计划 2.0：v1 迁移保留遗留数据且损坏回退', () => {
  const migrated = planV2.migratePlanV1ToV2({
    currentStageId: 'stage-2',
    stageStartDates: { 'stage-1': '2026-08-01' },
    stageProjects: { 'p1': { status: 'completed' } },
    dailyRecords: { '2026-08-03': {} },
    weeklyRecords: {},
    levelSixProgress: { passed: true }
  })
  assert.equal(migrated.version, 2)
  assert.equal(migrated.profile.stage, 'stage-2')
  assert.equal(migrated.migratedFromV1, true)
  assert.equal(migrated.legacy.stageStartDates['stage-1'], '2026-08-01')
  assert.equal(migrated.legacy.levelSixProgress.passed, true)

  assert.equal(planV2.migratePlanV1ToV2(null).migratedFromV1, false)
  assert.equal(planV2.sanitizePlanV2('bogus').version, 2)

  const values = new Map()
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null },
    setItem(key, value) { values.set(key, String(value)) }
  }
  assert.deepEqual(planV2.readPlanV2(storage), planV2.createDefaultPlanV2())
  assert.equal(planV2.writePlanV2(migrated, storage), true)
  assert.equal(planV2.readPlanV2(storage).profile.stage, 'stage-2')
})

test('统计周期：今日/周/月/全部与置信度、周报事实建议分离', () => {
  const now = new Date(2026, 7, 13, 12, 0, 0)
  const iso = (dayOffset, hours) => new Date(2026, 7, dayOffset, hours, 0, 0).toISOString()
  const record = (id, module, endedAt, accuracy, extra) => ({
    id,
    schemaVersion: 1,
    module,
    moduleName: module,
    title: '测试',
    startedAt: endedAt,
    endedAt,
    durationMs: 1200000,
    status: 'completed',
    totalEvents: 10,
    correctEvents: Math.round(10 * accuracy / 100),
    accuracy,
    wrongNoteCount: 0,
    missingNoteCount: 0,
    extraNoteCount: 0,
    earlyCount: 0,
    lateCount: 0,
    restErrorCount: 0,
    syncWarningCount: 0,
    settings: {},
    details: extra ?? {},
    mistakes: []
  })

  const records = [
    record('1', 'sight-reading', iso(13, 9), 80, { averageReactionMs: 1500 }),
    record('2', 'sight-reading', iso(13, 10), 90, { averageReactionMs: 1200 }),
    record('3', 'rhythm', iso(12, 10), 70, {}),
    record('4', 'scale', iso(1, 10), 85, {}),
    record('5', 'chord', iso(1, 11), 60, { hardestChord: 'Dm7' })
  ]

  const today = periodStats.computePeriodStats(records, now, 'today')
  assert.equal(today.sessions, 2)
  assert.equal(today.sightReadingAverageReactionMs, 1350)
  assert.equal(today.confidence, 'low')

  const week = periodStats.computePeriodStats(records, now, 'week')
  assert.equal(week.sessions, 3)
  assert.equal(week.chordWeakness, '暂无')

  const month = periodStats.computePeriodStats(records, now, 'month')
  assert.equal(month.sessions, 5)
  assert.equal(month.confidence, 'medium')
  assert.equal(month.chordWeakness, 'Dm7')

  const all = periodStats.computePeriodStats(records, now, 'all')
  assert.equal(all.sessions, 5)

  const empty = periodStats.computePeriodStats([], now, 'week')
  assert.equal(empty.sessions, 0)
  assert.equal(empty.confidence, 'low')
  assert.equal(periodStats.formatNoData(null), '—')

  const report = periodStats.buildWeeklyReport(records, now)
  assert.ok(report.facts.length > 0)
  assert.ok(report.suggestions.length > 0)
  const emptyReport = periodStats.buildWeeklyReport([], now)
  assert.match(emptyReport.facts[0], /暂无练习数据/)
})

test('曲谱练习三模式 Hook 与统计页面接线', () => {
  const hookSource = fs.readFileSync(require.resolve('../src/renderer/src/hooks/useScorePractice.ts'), 'utf8')
  const pageSource = fs.readFileSync(require.resolve('../src/renderer/src/components/ScorePracticePage.tsx'), 'utf8')
  const analyticsSource = fs.readFileSync(require.resolve('../src/renderer/src/components/AnalyticsPage.tsx'), 'utf8')
  const appSource = fs.readFileSync(require.resolve('../src/renderer/src/App.tsx'), 'utf8')

  assert.match(hookSource, /WaitScoreCore/)
  assert.match(hookSource, /RealtimeScoreCore/)
  assert.match(hookSource, /FollowScoreCore/)
  assert.match(hookSource, /useMidiEventSubscription/)
  assert.doesNotMatch(hookSource, /latestMidiEvent|latestEvent/)
  assert.match(pageSource, /realtime|follow/)
  assert.match(pageSource, /setMode\(option\)/)
  assert.match(analyticsSource, /computePeriodStats/)
  assert.match(analyticsSource, /buildWeeklyReport/)
  assert.match(appSource, /AnalyticsPage/)
})

test('AI 设置：默认停用、净化与安全导出不含 Key', () => {
  const defaults = aiSettings.createDefaultAiSettings()
  assert.equal(defaults.enabled, false)
  assert.equal(defaults.config.apiKey, '')

  const sanitized = aiSettings.sanitizeAiSettings({
    enabled: true,
    config: { endpoint: 'https://example.com/v1/chat/completions', apiKey: 'sk-secret', model: 'm', temperature: 9, timeoutMs: 1, maxTokens: 99999 }
  })
  assert.equal(sanitized.config.temperature, 1.5)
  assert.equal(sanitized.config.timeoutMs, 1000)
  assert.equal(sanitized.config.maxTokens, 4000)
  assert.equal(sanitized.config.apiKey, 'sk-secret')

  const safe = aiSettings.toSafeAiSettingsExport(sanitized)
  assert.equal('apiKey' in safe.config, false)
  assert.equal(safe.config.apiKeyConfigured, true)
  assert.doesNotMatch(JSON.stringify(safe), /sk-secret/)

  const values = new Map()
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null },
    setItem(key, value) { values.set(key, String(value)) }
  }
  assert.equal(aiSettings.writeAiSettings(sanitized, storage), true)
  assert.equal(aiSettings.readAiSettings(storage).config.apiKey, 'sk-secret')
})

test('AI 教练：快照不含 Key、消息分层、输出校验与回退', () => {
  const snapshot = aiCoach.buildCoachSnapshot(
    periodStats.computePeriodStats([], new Date(), 'week'),
    { version: 2, profile: { stage: 'stage-1', goal: '', dailyMinutes: 60, focusAreas: [], repertoire: [], curriculum: [] }, goals: [], legacy: {}, migratedFromV1: false },
    []
  )
  const messages = aiCoach.buildCoachMessages(snapshot, 'weekly-review')
  const serialized = JSON.stringify(messages)
  assert.doesNotMatch(serialized, /sk-|apiKey|Authorization/)
  assert.equal(messages[0].role, 'system')
  assert.match(messages[1].content, /facts/)

  const parsed = aiCoach.parseCoachResponse('{"facts":["f1"],"interpretation":["i1"],"recommendation":["r1"]}')
  assert.deepEqual(parsed.facts, ['f1'])
  assert.deepEqual(parsed.interpretation, ['i1'])
  assert.deepEqual(parsed.recommendation, ['r1'])

  const plain = aiCoach.parseCoachResponse('一段没有 JSON 的文本')
  assert.equal(plain.recommendation[0], '一段没有 JSON 的文本')

  assert.equal(aiCoach.validateCoachOutput({ facts: ['a'], interpretation: [], recommendation: [] }), true)
  assert.equal(
    aiCoach.validateCoachOutput({ facts: [], interpretation: ['已修改你的练习记录'], recommendation: [] }),
    false
  )
  assert.equal(aiCoach.validateCoachOutput({ facts: [], interpretation: [], recommendation: [] }), false)

  const fallback = aiCoach.getFallbackCoachLayers(snapshot)
  assert.equal(fallback.facts.length, 1)
  assert.equal(fallback.recommendation.length, 1)
})

test('音乐 AI：变化生成必须通过校验，校验器拒绝不可演奏输出', () => {
  const variation = musicAi.generatePracticeVariation({ progressionId: '4536251', keyPitchClass: 0, variationIndex: 1 })
  const validation = musicAi.validateGeneratedVariation(variation)
  assert.equal(validation.valid, true)
  assert.equal(variation.steps.length, 7)

  const invalid = musicAi.validateGeneratedVariation({
    progressionId: '4536251',
    key: 0,
    steps: [],
    voiceLeadingScore: 999,
    playable: false
  })
  assert.equal(invalid.valid, false)
  assert.ok(invalid.reasons.length > 0)

  assert.equal(musicAi.validateMelodyCandidate([60, 64, 67], { lowest: 48, highest: 84 }), true)
  assert.equal(musicAi.validateMelodyCandidate([36, 100], { lowest: 48, highest: 84 }), false)

  const score = musicAi.scoreVoiceLeadingBetweenVariants(variation, variation)
  assert.ok(score >= 0)
})

test('AI 页面接线：设置页含 AI 卡、分析页含教练卡、无硬编码 Key', () => {
  const settingsSource = fs.readFileSync(require.resolve('../src/renderer/src/components/SettingsPage.tsx'), 'utf8')
  const analyticsSource = fs.readFileSync(require.resolve('../src/renderer/src/components/AnalyticsPage.tsx'), 'utf8')
  const hookSource = fs.readFileSync(require.resolve('../src/renderer/src/hooks/useAiCoach.ts'), 'utf8')
  const providerSource = fs.readFileSync(require.resolve('../src/renderer/src/ai/aiProvider.ts'), 'utf8')

  assert.match(settingsSource, /AI 教练/)
  assert.match(settingsSource, /type="password"/)
  assert.match(settingsSource, /测试连接/)
  assert.match(analyticsSource, /AI 教练/)
  assert.match(analyticsSource, /requestCoach/)
  assert.match(hookSource, /createOpenAiCompatibleClient/)
  assert.doesNotMatch(hookSource + settingsSource + providerSource, /sk-[A-Za-z0-9]{8,}/)
  assert.match(providerSource, /Authorization: `Bearer/)
})

test('统一备份：构建、安全导出不含 Key、校验与恢复', () => {
  const state = {
    'practice-records': '[]',
    'ai-settings.v1': JSON.stringify({ version: 1, enabled: true, config: { apiKey: 'sk-secret-123' } }),
    'piano-volume.v1': '70'
  }
  const document = backup.buildBackup(state, '1.0.0-rc.1', new Date('2026-08-13T00:00:00.000Z'))
  assert.equal(document.schemaVersion, 1)
  assert.equal(document.appVersion, '1.0.0-rc.1')
  assert.equal(document.createdAt, '2026-08-13T00:00:00.000Z')
  const serialized = JSON.stringify(document)
  assert.doesNotMatch(serialized, /sk-secret-123/)
  assert.match(serialized, /apiKeyExported/)

  assert.equal(backup.validateBackup(document), true)
  assert.equal(backup.validateBackup({ schemaVersion: 99, data: {} }), false)
  assert.equal(backup.validateBackup('bad'), false)
  assert.equal(backup.validateBackup({ schemaVersion: 1, appVersion: 'v', createdAt: 'c', data: { k: 1 } }), false)

  const values = new Map()
  values.set('existing', 'keep-me')
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null },
    setItem(key, value) { values.set(key, String(value)) },
    removeItem(key) { values.delete(key) }
  }
  const invalid = backup.restoreFromBackup({ bad: true }, storage)
  assert.equal(invalid.ok, false)
  assert.equal(values.get('existing'), 'keep-me')

  const valid = backup.restoreFromBackup(document, storage)
  assert.equal(valid.ok, true)
  assert.equal(valid.restoredKeys.length, 3)
  assert.equal(values.get('piano-volume.v1'), '70')
})

test('首次启动标记与应用信息（版本与许可）', () => {
  const values = new Map()
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null },
    setItem(key, value) { values.set(key, String(value)) }
  }
  assert.equal(firstRun.isFirstRun(storage), true)
  firstRun.completeFirstRun(storage)
  assert.equal(firstRun.isFirstRun(storage), false)

  assert.equal(appInfo.APP_VERSION, '1.0.0-rc.1')
  const salamander = appInfo.APP_LICENSES.find((entry) => entry.name.includes('Salamander'))
  assert.equal(salamander.license, 'CC BY 3.0')
  assert.ok(appInfo.APP_LICENSES.some((entry) => entry.name === 'VexFlow'))
})

test('产品化接线：设置页含数据/关于、应用含首次启动、版本为 RC', () => {
  const settingsSource = fs.readFileSync(require.resolve('../src/renderer/src/components/SettingsPage.tsx'), 'utf8')
  const appSource = fs.readFileSync(require.resolve('../src/renderer/src/App.tsx'), 'utf8')
  const welcomeSource = fs.readFileSync(require.resolve('../src/renderer/src/components/FirstRunWelcome.tsx'), 'utf8')
  const packageJson = JSON.parse(fs.readFileSync(require.resolve('../package.json'), 'utf8'))

  assert.match(settingsSource, /下载备份/)
  assert.match(settingsSource, /恢复备份/)
  assert.match(settingsSource, /关于/)
  assert.match(settingsSource, /APP_VERSION/)
  assert.match(appSource, /FirstRunWelcome/)
  assert.match(welcomeSource, /开始使用/)
  assert.equal(packageJson.version, '1.0.0-rc.1')
})

test('Chord V2 10,000 组属性测试：无非法音级、音域与跨度', () => {
  const qualities = [
    'major', 'minor', 'dim', 'aug', 'sus2', 'sus4', '6', 'm6', 'maj7', '7', 'm7', 'm7b5',
    'dim7', 'add9', '9', 'm9', 'maj9', '6/9'
  ]
  let seed = 20260814
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0x100000000
  }

  for (let index = 0; index < 10000; index += 1) {
    const quality = qualities[Math.floor(rand() * qualities.length)]
    const root = Math.floor(rand() * 12)
    const registerLowest = 36 + Math.floor(rand() * 25)
    const spacing = rand() > 0.5 ? 'open' : 'close'
    const identity = chordIdentity.getChordV2Identity(root, quality)
    const bassCandidates = chordValidator.getBassCandidates(root, quality, 'all')
    const bassConstraint = rand() > 0.2 ? bassCandidates[Math.floor(rand() * bassCandidates.length)] : null
    const createdVoicing = voicing.createDefaultVoicing(identity, {
      registerLowest,
      registerHighest: 88,
      spacing,
      bassConstraint
    })
    const validation = chordValidator.validateVoicing(identity, createdVoicing, { maxHandSpan: 26 })
    assert.equal(validation.valid, true, `#${index} ${quality} root=${root} reg=${registerLowest} ${spacing}: ${validation.reasons.join(';')}`)
    for (const note of createdVoicing.exactNotes) {
      assert.equal(
        chordValidator.isChordTonePitchClass(identity, note),
        true,
        `#${index} 非和弦音 ${note}（${quality} root=${root}）`
      )
    }
  }
})

test('Chord V2：flat root / 同音异名拼写保留', () => {
  assert.deepEqual(chordIdentity.parseChordSymbol('Db'), { rootPitchClass: 1, quality: 'major', slashBass: null })
  assert.deepEqual(chordIdentity.parseChordSymbol('Dbmaj7'), { rootPitchClass: 1, quality: 'maj7', slashBass: null })
  assert.deepEqual(chordIdentity.parseChordSymbol('Bb7'), { rootPitchClass: 10, quality: '7', slashBass: null })
  assert.deepEqual(chordIdentity.parseChordSymbol('Eb'), { rootPitchClass: 3, quality: 'major', slashBass: null })
  assert.deepEqual(chordIdentity.parseChordSymbol('Abm7'), { rootPitchClass: 8, quality: 'm7', slashBass: null })
  assert.deepEqual(chordIdentity.parseChordSymbol('Gb'), { rootPitchClass: 6, quality: 'major', slashBass: null })
  assert.deepEqual(chordIdentity.parseChordSymbol('Cm7♭5'), { rootPitchClass: 0, quality: 'm7b5', slashBass: null })

  assert.equal(chordIdentity.formatChordSymbol(1, 'major', undefined, 'flat'), 'Db')
  assert.equal(chordIdentity.formatChordSymbol(10, '7', undefined, 'flat'), 'Bb7')
  assert.equal(chordIdentity.formatChordSymbol(1, 'major'), 'C#')
  assert.equal(chordIdentity.formatChordSymbol(10, '7'), 'A#7')
})

test('Chord V2：inversionMode all 包含 root 与全部转位，open/close 真实不同', () => {
  assert.deepEqual(chordValidator.getBassCandidates(0, 'major', 'all'), [0, 4, 7])
  assert.deepEqual(chordValidator.getBassCandidates(0, 'major', 'inversions'), [4, 7])
  assert.deepEqual(chordValidator.getBassCandidates(0, 'major', 'root'), [0])
  assert.deepEqual(chordValidator.getBassCandidates(0, '7', 'all'), [0, 4, 7, 10])
  assert.deepEqual(chordValidator.getBassCandidates(0, '7', 'inversions'), [4, 7, 10])
  assert.deepEqual(chordValidator.getBassCandidates(4, 'maj7', 'all'), [4, 8, 11, 3])
  assert.deepEqual(chordValidator.getBassCandidates(4, 'maj7', 'inversions'), [8, 11, 3])

  const identity = chordIdentity.getChordV2Identity(0, 'major')
  const close = voicing.createDefaultVoicing(identity, {
    registerLowest: 48, registerHighest: 84, bassConstraint: 0, spacing: 'close'
  })
  const open = voicing.createDefaultVoicing(identity, {
    registerLowest: 48, registerHighest: 84, bassConstraint: 0, spacing: 'open'
  })
  assert.notDeepEqual(close.exactNotes, open.exactNotes, 'open/close 必须产生真实不同的 spacing')
  assert.equal(chordValidator.validateVoicing(identity, open).valid, true)
})

test('CC64 踏板状态机：先踩后弹、先弹后踩、按住不释放、重复音与清理', () => {
  const vp = voicePolicy
  // 先踩踏板再弹
  let state = vp.createPedalVoiceState()
  state = vp.pedalKeyDown(state)
  state = vp.pedalKeyUp(state, true)
  assert.deepEqual(state, { physicalKeyDown: false, sustainedByPedal: true, released: false })
  state = vp.pedalPedalUp(state)
  assert.equal(state.released, true)

  // 先弹再踩踏板（KeyUp 时踏板已按下 → 延音）
  let noteFirst = vp.createPedalVoiceState()
  noteFirst = vp.pedalKeyDown(noteFirst)
  noteFirst = vp.pedalKeyUp(noteFirst, true)
  assert.equal(noteFirst.sustainedByPedal, true)

  // 琴键仍按住时松踏板 → 不得释放
  let held = vp.createPedalVoiceState()
  held = vp.pedalKeyDown(held)
  const afterPedalUpWhileHeld = vp.pedalPedalUp(held)
  assert.equal(afterPedalUpWhileHeld.released, false)
  assert.equal(afterPedalUpWhileHeld.physicalKeyDown, true)

  // 重复同音：旧延音声部被新按下替代
  let first = vp.createPedalVoiceState()
  first = vp.pedalKeyDown(first)
  first = vp.pedalKeyUp(first, true)
  const repeated = vp.pedalKeyDown(vp.createPedalVoiceState())
  assert.equal(repeated.physicalKeyDown, true)
  assert.equal(repeated.sustainedByPedal, false)

  // 清理 / all notes off
  const cleaned = vp.pedalAllNotesOff(first)
  assert.deepEqual(cleaned, { physicalKeyDown: false, sustainedByPedal: false, released: true })
})

function buildSmfFixture() {
  const chunks = []
  const push = (data) => chunks.push(Buffer.from(data))
  const header = Buffer.alloc(14)
  header.write('MThd', 0, 'ascii')
  header.writeUInt32BE(6, 4)
  header.writeUInt16BE(1, 8)
  header.writeUInt16BE(2, 10)
  header.writeUInt16BE(480, 12)
  push(header)

  const track = (name, events) => {
    const body = []
    const write = (data) => body.push(Buffer.from(data))
    // meta: track name
    write([0x00, 0xff, 0x03, name.length])
    write(Buffer.from(name, 'ascii'))
    for (const event of events) {
      write(event)
    }
    write([0x00, 0xff, 0x2f, 0x00])
    const bodyBuffer = Buffer.concat(body)
    const trackHeader = Buffer.alloc(8)
    trackHeader.write('MTrk', 0, 'ascii')
    trackHeader.writeUInt32BE(bodyBuffer.length, 4)
    push(trackHeader)
    push(bodyBuffer)
  }

  // RH: C4 on, E4 on via running status (0x90), C4 off, E4 off via running status (0x80)
  track('RH', [
    [0x00, 0x90, 60, 100],
    [0x00, 64, 90],
    [0x60, 0x80, 60, 0],
    [0x00, 64, 0]
  ])
  // LH: C3 on/off, same channel 0 as RH
  track('LH', [
    [0x00, 0x90, 48, 100],
    [0x60, 0x80, 48, 0]
  ])
  return Buffer.concat(chunks)
}

test('SMF Format 1：多轨解析、running status、velocity0 与合并计数', () => {
  const bytes = buildSmfFixture()
  const smf = midiFileParser.parseMidiFile(new Uint8Array(bytes))
  assert.equal(smf.format, 1)
  assert.equal(smf.division, 480)
  assert.equal(smf.tracks.length, 2)
  assert.deepEqual(smf.tracks.map((track) => track.name), ['RH', 'LH'])

  const notes = smf.mergedEvents.filter((event) => event.type === 'noteOn' || event.type === 'noteOff')
  assert.equal(notes.length, 6, '两轨事件合并计数必须为 A+B')
  assert.equal(notes.filter((event) => event.type === 'noteOn').length, 3)
  assert.ok(notes.every((event) => event.channel === 0), '不同 track 的同 channel 事件必须保留')

  const rhNotes = smf.tracks[0].events.filter((event) => event.type === 'noteOn' || event.type === 'noteOff')
  assert.deepEqual(rhNotes.map((event) => [event.type, event.midiNumber]), [
    ['noteOn', 60], ['noteOn', 64], ['noteOff', 60], ['noteOff', 64]
  ])

  const velocityZero = midiFileParser.parseMidiFile(new Uint8Array(buildSmfWithVelocityZero()))
  const velocityZeroNoteOff = velocityZero.tracks[0].events.find((event) => event.type === 'noteOff' && event.midiNumber === 60)
  assert.ok(velocityZeroNoteOff !== undefined, 'velocity=0 的 noteOn 必须转换为 noteOff')
  assert.equal(velocityZeroNoteOff.velocity, 0)
})

function buildSmfWithVelocityZero() {
  const chunks = []
  const header = Buffer.alloc(14)
  header.write('MThd', 0, 'ascii')
  header.writeUInt32BE(6, 4)
  header.writeUInt16BE(0, 8)
  header.writeUInt16BE(1, 10)
  header.writeUInt16BE(480, 12)
  chunks.push(header)
  const body = Buffer.from([0x00, 0x90, 60, 100, 0x60, 0x90, 60, 0, 0x00, 0xff, 0x2f, 0x00])
  const trackHeader = Buffer.alloc(8)
  trackHeader.write('MTrk', 0, 'ascii')
  trackHeader.writeUInt32BE(body.length, 4)
  chunks.push(trackHeader, body)
  return Buffer.concat(chunks)
}

test('MusicXML 时间轴：backup 合并、多声部、rest 与 tie 链', () => {
  const backupXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><key><fifths>0</fifths></key></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>16</duration><voice>1</voice></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>16</duration><voice>1</voice></note>
    </measure>
  </part>
</score-partwise>`
  const backupScore = musicXmlParser.loadMusicXmlDocument(backupXml)
  const backupTimeline = scoreTimeline.buildScoreTimeline(backupScore)
  assert.equal(backupTimeline.units.length, 1)
  assert.deepEqual(backupTimeline.units[0].expectedMidi, [48, 60])
  assert.equal(backupTimeline.units[0].expectedTick, 0)

  const multiVoiceXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
      <note><pitch><step>E</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice></note>
      <note><rest/><duration>4</duration><voice>2</voice></note>
    </measure>
  </part>
</score-partwise>`
  const multiVoiceTimeline = scoreTimeline.buildScoreTimeline(musicXmlParser.loadMusicXmlDocument(multiVoiceXml))
  assert.deepEqual(multiVoiceTimeline.units.map((unit) => [unit.expectedTick, unit.expectedMidi]), [
    [0, [52, 60]],
    [4, [62]],
    [8, []]
  ])
})

test('MXL DEFLATE：压缩容器可解出 MusicXML', async () => {
  const xml = fs.readFileSync(require.resolve('./score-fixtures/single-melody.xml'), 'utf8')
  const zipBuffer = await zipReader.createDeflatedZip([{ name: 'META-INF/container.xml', content: '<container/>' }, { name: 'score.musicxml', content: xml }])
  const container = await zipReader.extractMxlContainerAsync(zipBuffer)
  assert.ok(container !== null)
  assert.equal(container.fileName, 'score.musicxml')
  assert.match(container.xmlText, /Single Melody/)
})

test('Follow：完整和弦才推进、部分和弦累积、休止/延音不死锁、reset 清空', () => {
  const xml = fs.readFileSync(require.resolve('./score-fixtures/chord-tie-rest.xml'), 'utf8')
  const score = musicXmlParser.loadMusicXmlDocument(xml)
  const timeline = scoreTimeline.buildScoreTimeline(score)
  const core = new followScoreCore.FollowScoreCore(timeline, { beatDurationMs: 500 })

  core.observeNoteOn(60, 0)
  core.observeNoteOn(64, 500)
  core.observeNoteOn(67, 1000)
  assert.equal(core.currentIndex, 2, '部分和弦（仅 G4）不得推进')
  core.observeNoteOn(72, 1100)
  assert.ok(core.currentIndex >= 3, '补上 C5 后整和弦才推进')
  core.observeNoteOn(65, 2500)
  assert.ok(core.currentIndex >= 6, '休止与延音单元自动跳过，不得死锁')
  core.observeNoteOn(69, 3000)
  assert.equal(core.isComplete, true)

  core.reset()
  assert.equal(core.currentIndex, 0)
  assert.equal(core.results.length, 0)
  assert.equal(core.isComplete, false)
})

test('Feature flags：实验功能默认关闭且可从 UI 隐藏', () => {
  assert.equal(featureFlags.FEATURE_FLAGS.FEATURE_EXPERIMENTAL_HARMONY_GENERATOR, false)
  assert.equal(featureFlags.FEATURE_FLAGS.FEATURE_AI_MUSIC_GENERATOR, false)
  assert.equal(featureFlags.FEATURE_FLAGS.FEATURE_SCORE_FOLLOWING, false)
  assert.equal(featureFlags.isFeatureEnabled('FEATURE_SCORE_FOLLOWING'), false)

  const values = new Map()
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null },
    setItem(key, value) { values.set(key, String(value)) }
  }
  assert.equal(featureFlags.isExperimentalAccessEnabled(storage), false)
  featureFlags.setExperimentalAccess(true, storage)
  assert.equal(featureFlags.isExperimentalAccessEnabled(storage), true)

  const chordPage = fs.readFileSync(require.resolve('../src/renderer/src/components/ChordV2Page.tsx'), 'utf8')
  const scorePage = fs.readFileSync(require.resolve('../src/renderer/src/components/ScorePracticePage.tsx'), 'utf8')
  assert.match(chordPage, /isExperimentalFeatureVisible\('FEATURE_EXPERIMENTAL_HARMONY_GENERATOR'\)/)
  assert.match(scorePage, /Experimental feature disabled/)
  assert.match(scorePage, /followVisible/)
})

test('PracticeRecord 2.0：统一模型、迁移、序列化与 MIDI 不可观测边界', () => {
  const legacy = {
    id: 'rec-1',
    schemaVersion: 1,
    module: 'scale',
    moduleName: '音阶练习',
    title: 'C 大调',
    startedAt: '2026-08-13T00:00:00.000Z',
    endedAt: '2026-08-13T00:01:00.000Z',
    durationMs: 60000,
    status: 'completed',
    totalEvents: 8,
    correctEvents: 6,
    accuracy: 75,
    wrongNoteCount: 1,
    missingNoteCount: 1,
    extraNoteCount: 0,
    earlyCount: 0,
    lateCount: 0,
    restErrorCount: 0,
    syncWarningCount: 0,
    averageOffsetMs: 12,
    contentId: 'C-right-ascending-one-octave',
    settings: { key: 'C' },
    details: { hardestNote: 'D4' },
    mistakes: [{ label: 'D4', count: 2, type: 'pitch' }]
  }
  const v2 = practiceRecordV2.fromLegacyRecord(legacy)
  assert.equal(v2.schemaVersion, 2)
  assert.equal(v2.practiceType, 'scale')
  assert.equal(v2.metrics.find((metric) => metric.key === 'accuracy').value, 75)
  assert.equal(v2.metrics.find((metric) => metric.key === 'averageOffsetMs').value, 12)
  assert.equal(v2.errorEvents.length, 1)
  assert.equal(v2.evidenceRefs.length, 1)
  assert.equal(v2.evidenceRefs[0].errorEventId, v2.errorEvents[0].id)
  assert.equal(v2.metadata.key, 'C')

  const serialized = practiceRecordV2.serializePracticeRecordV2(v2)
  const parsed = practiceRecordV2.parsePracticeRecordV2(serialized)
  assert.equal(parsed.id, 'rec-1')
  assert.equal(parsed.metrics.length, v2.metrics.length)
  assert.equal(practiceRecordV2.parsePracticeRecordV2('{bad'), null)

  const exported = practiceRecordV2.exportRecordsToJson([legacy])
  assert.match(exported, /schemaVersion/)
  assert.match(exported, /rec-1/)

  assert.equal(practiceRecordV2.isUnobservableFromMidi('指法错误'), true)
  assert.equal(practiceRecordV2.isUnobservableFromMidi('手腕僵硬'), true)
  assert.equal(practiceRecordV2.isUnobservableFromMidi('时序偏差'), false)
})

test('Ability Model：样本/置信度/趋势/证据与问题回答', () => {
  const record = (id, module, accuracy, endedAt) => ({
    id,
    schemaVersion: 1,
    module,
    moduleName: module,
    title: 't',
    startedAt: endedAt,
    endedAt,
    durationMs: 1000,
    status: 'completed',
    totalEvents: 10,
    correctEvents: Math.round(10 * accuracy / 100),
    accuracy,
    wrongNoteCount: 0,
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
  const records = [
    record('a1', 'scale', 60, '2026-08-10T00:00:00.000Z'),
    record('a2', 'scale', 65, '2026-08-11T00:00:00.000Z'),
    record('a3', 'scale', 80, '2026-08-12T00:00:00.000Z'),
    record('a4', 'scale', 85, '2026-08-13T00:00:00.000Z'),
    record('b1', 'chord', 90, '2026-08-13T00:00:00.000Z')
  ]
  const model = abilityModel.computeAbilityModel(records, new Date('2026-08-14T00:00:00.000Z'))
  const scale = model.skills.scale
  assert.equal(scale.sampleCount, 4)
  assert.equal(scale.confidence, 'medium')
  assert.equal(scale.score, 73)
  assert.equal(scale.trend, 'up')
  assert.equal(scale.evidenceRefs.length, 4)
  assert.equal(model.skills['sight-reading'].sampleCount, 0)
  assert.equal(model.skills['sight-reading'].confidence, 'low')
  assert.equal(model.skills['sight-reading'].score, null)

  const answers = abilityModel.answerAbilityQuestions(model)
  assert.deepEqual(answers.improved, ['scale'])
  assert.ok(answers.insufficient.includes('sight-reading'))

  const weakest = abilityModel.getWeakestReliableSkills(model, 3)
  assert.deepEqual(weakest, ['scale'], '只考虑置信度非 low 且非空分数')
})

test('Exercise Prescription Library：Practice Ready 真实性、技能映射与 Micro Drill 校验', () => {
  assert.ok(exerciseLibrary.getPracticeReadyCount() >= 5)
  assert.ok(exerciseLibrary.EXERCISE_LIBRARY.every((definition) => {
    if (definition.practiceReady) return definition.verified && (definition.scoreAsset || definition.sourceType === 'builtin')
    return true
  }), 'Practice Ready 必须 verified 且有真实资产/内置确定性来源')

  const hanon = exerciseLibrary.EXERCISE_LIBRARY.find((definition) => definition.id === 'hanon-1')
  assert.equal(hanon, undefined, '哈农无真实乐谱，不得进入 Practice Ready 库')

  const scaleExercises = exerciseLibrary.getExercisesForSkill('scale')
  assert.ok(scaleExercises.length > 0)
  assert.ok(scaleExercises.every((definition) => definition.practiceReady))

  const validDrill = exerciseLibrary.createMicroDrill({
    skillId: 'scale',
    measureCount: 2,
    range: { lowest: 48, highest: 84 },
    hand: 'right'
  })
  assert.equal(validDrill.validation.valid, true)
  assert.ok(validDrill.notes.length >= 8)

  const invalidDrill = exerciseLibrary.createMicroDrill({
    skillId: 'scale',
    measureCount: 3,
    range: { lowest: 60, highest: 61 },
    hand: 'both'
  })
  assert.equal(invalidDrill.validation.valid, false)
})

test('Training Plan 2.0：弱项优先、平衡、成功标准与证据引用', () => {
  const record = (id, module, accuracy, endedAt) => ({
    id,
    schemaVersion: 1,
    module,
    moduleName: module,
    title: 't',
    startedAt: endedAt,
    endedAt,
    durationMs: 1000,
    status: 'completed',
    totalEvents: 10,
    correctEvents: Math.round(10 * accuracy / 100),
    accuracy,
    wrongNoteCount: 0,
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
  const records = [
    record('s1', 'scale', 55, '2026-08-12T00:00:00.000Z'),
    record('s2', 'scale', 58, '2026-08-12T01:00:00.000Z'),
    record('s3', 'scale', 60, '2026-08-13T00:00:00.000Z'),
    record('s4', 'scale', 62, '2026-08-13T01:00:00.000Z')
  ]
  const ability = abilityModel.computeAbilityModel(records)
  const plan = planner.buildDailyPlan({
    ability,
    records,
    goal: '准备考级',
    availableMinutes: 60,
    library: exerciseLibrary.EXERCISE_LIBRARY
  })

  assert.ok(plan.items.length >= 1)
  assert.ok(plan.totalTargetMinutes <= 60)
  assert.ok(plan.rationale.some((line) => line.includes('scale')))
  assert.ok(plan.items.every((item) => item.successCriteria.length > 4))
  assert.ok(plan.items.every((item) => item.whyThis.length > 4))
  assert.ok(plan.items.every((item) => item.evidenceRefs.length >= 0))

  const categories = plan.items.map((item) => item.exerciseId.split('-')[0])
  const maxCategoryRatio = Math.max(...categories.map((category) => categories.filter((entry) => entry === category).length)) / Math.max(1, categories.length)
  assert.ok(maxCategoryRatio <= 0.6, '一天不能全练同一种能力')

  const emptyPlan = planner.buildDailyPlan({
    ability: abilityModel.computeAbilityModel([]),
    records: [],
    goal: '',
    availableMinutes: 30,
    library: exerciseLibrary.EXERCISE_LIBRARY
  })
  assert.ok(emptyPlan.items.length >= 1, '无弱项时也要给出均衡练习')
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
