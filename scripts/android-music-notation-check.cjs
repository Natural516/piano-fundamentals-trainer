const assert = require('node:assert/strict')
const fs = require('node:fs'), ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
const sightReadingNotes = require('../src/sightReading/sightReadingNotes.ts')
const musicKeySignatures = require('../src/sightReading/musicKeySignatures.ts')
const musicPitchSpelling = require('../src/sightReading/musicPitchSpelling.ts')
const musicStaffModel = require('../src/shared/musicNotation/musicStaffModel.ts')
const sightReadingSession = require('../src/sightReading/sightReadingSession.ts')
const midiNotes = require('../src/sightReading/midiNotes.ts')
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
let passed = 0
function test(name, run) { run(); passed++; console.log('PASS ' + name) }
// Assertion bodies migrated unchanged from the retired desktop runner.
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
test('VexFlow SVG and local Bravura shared-renderer assertions retained', () => {
  const rendererSource = fs.readFileSync(require.resolve('../src/shared/musicNotation/MusicStaffRenderer.tsx'), 'utf8')
  const fontSource = fs.readFileSync(require.resolve('../src/shared/musicNotation/musicNotationFont.ts'), 'utf8')
  const packageJson = require('../package.json')
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
  assert.equal(packageJson.dependencies.vexflow, '5.0.0')
  assert.equal(packageJson.dependencies['@vexflow-fonts/bravura'], '1.0.2')
})
console.log(passed + '/' + 11 + ' shared notation/domain contract groups PASS')
