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

const root = path.resolve(__dirname, '..')
const { ChordJudgementCore } = require('../prototype/android-tablet-v1/src/chordPractice/judgement/index.ts')
const { CHORD_BLOCK_CAPTURE_CONTRACT } = require('../prototype/android-tablet-v1/src/musicTheory/chords/productContract.ts')
const judgementSource = fs.readFileSync(
  path.join(root, 'prototype/android-tablet-v1/src/chordPractice/judgement/core.ts'),
  'utf8'
)

function makeQuestion(notes = [60, 64, 67]) {
  const pitches = notes.map((soundingMidi, index) => ({
    letter: ['C', 'E', 'G', 'B'][index],
    accidental: 0,
    octave: 4,
    soundingMidi
  }))
  return {
    family: notes.length === 3 ? 'triad' : 'seventh',
    qualityId: notes.length === 3 ? 'major' : 'major7',
    root: { letter: 'C', accidental: 0 },
    chordSymbol: notes.length === 3 ? 'C' : 'Cmaj7',
    chineseQualityLabel: notes.length === 3 ? '大三和弦' : '大七和弦',
    inversionIndex: 0,
    chineseInversionLabel: '原位',
    chordTones: [],
    voicing: {},
    soundingMidiNumbers: [...notes],
    blockNotes: pitches.map((pitch) => ({ ...pitch })),
    arpeggioNotes: pitches.map((pitch) => ({ ...pitch })),
    register: { window: { minMidi: 48, maxMidi: 96 }, lowestMidi: notes[0], highestMidi: notes.at(-1) }
  }
}

const phase = (core) => core.snapshot.state.phase
const on = (core, note, timestampMs) => core.process({ type: 'NOTE_ON', note, timestampMs })
const off = (core, note, timestampMs) => core.process({ type: 'NOTE_OFF', note, timestampMs })
const advance = (core, timestampMs) => core.process({ type: 'TIME_ADVANCE', timestampMs })
const cc64 = (core, value, timestampMs) => core.process({ type: 'CONTROL_CHANGE', controller: 64, value, timestampMs })
const resetInput = (core, timestampMs) => core.process({ type: 'INPUT_STATE_RESET', timestampMs })
const suspend = (core, reason, timestampMs) => core.process({ type: 'SUSPEND', reason, timestampMs })
const resume = (core, timestampMs) => core.process({ type: 'RESUME', timestampMs })
const stop = (core, timestampMs) => core.process({ type: 'STOP', timestampMs })

function playArpeggioToBlock(core, notes, startMs, stepMs = 10) {
  let lastTimestampMs = startMs
  notes.forEach((note, index) => {
    const noteOnTimestampMs = startMs + index * stepMs
    on(core, note, noteOnTimestampMs)
    off(core, note, noteOnTimestampMs + 1)
    lastTimestampMs = noteOnTimestampMs + 1
  })
  assert.equal(phase(core), 'BLOCK_READY')
  return lastTimestampMs
}

function playBlockToCompletion(core, notes, startMs, offsets = notes.map((_, index) => index * 10)) {
  notes.forEach((note, index) => on(core, note, startMs + offsets[index]))
  assert.equal(phase(core), 'BLOCK_CAPTURE')
  advance(core, startMs + CHORD_BLOCK_CAPTURE_CONTRACT.captureWindowMs)
  assert.equal(phase(core), 'WAIT_ALL_KEYS_UP_AFTER_BLOCK')
  notes.forEach((note, index) => off(core, note, startMs + CHORD_BLOCK_CAPTURE_CONTRACT.captureWindowMs + 1 + index))
  assert.equal(phase(core), 'QUESTION_COMPLETE')
}

function cleanCompletion(notes = [60, 64, 67]) {
  const core = new ChordJudgementCore(makeQuestion(notes), 0)
  playArpeggioToBlock(core, notes, 100)
  playBlockToCompletion(core, notes, 300)
  return core
}

const tests = []
const test = (id, title, callback) => tests.push({ id, title, callback })

test('AJ01', 'correct triad follows exact ascending Arpeggio order', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10)
  assert.equal(core.snapshot.facts.arpeggioErrors, 0)
})

test('AJ02', 'correct seventh uses all four exact NOTE_ON pitches', () => {
  const notes = [59, 60, 64, 67]
  const core = new ChordJudgementCore(makeQuestion(notes), 0)
  playArpeggioToBlock(core, notes, 10)
})

test('AJ03', 'non-target first Arpeggio input settles one wrong-pitch error', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  const events = on(core, 61, 10)
  assert.equal(phase(core), 'ARPEGGIO_WRONG_WAIT_RELEASE')
  assert.deepEqual(events.map((event) => [event.type, event.reason]), [['ARPEGGIO_ERROR', 'ARPEGGIO_WRONG_PITCH']])
})

test('AJ04', 'correct first note then non-target input is one immediate failure', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 60, 10)
  on(core, 62, 20)
  assert.equal(core.snapshot.facts.arpeggioErrors, 1)
  assert.equal(core.snapshot.facts.timing.questionStartLatencyMs, 10)
})

test('AJ05', 'target pitch in the wrong order has the distinct wrong-order reason', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  const [event] = on(core, 64, 10)
  assert.equal(event.reason, 'ARPEGGIO_WRONG_ORDER')
})

test('AJ06', 'NOTE_OFF and CC64 do not advance Arpeggio judgement', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  off(core, 60, 1)
  cc64(core, 127, 2)
  assert.deepEqual(core.snapshot.state, { phase: 'ARPEGGIO_READY', expectedIndex: 0 })
  on(core, 60, 3)
  assert.deepEqual(core.snapshot.state, { phase: 'ARPEGGIO_ACTIVE', expectedIndex: 1 })
})

test('AJ07', 'Arpeggio has no tempo or maximum inter-note duration', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 60, 10); off(core, 60, 11)
  on(core, 64, 100_000); off(core, 64, 100_001)
  on(core, 67, 900_000)
  assert.equal(phase(core), 'WAIT_ALL_KEYS_UP_BEFORE_BLOCK')
})

test('AJ08', 'final correct Arpeggio note waits for physical release before Block', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 60, 10); off(core, 60, 11)
  on(core, 64, 20); off(core, 64, 21)
  on(core, 67, 30)
  assert.equal(phase(core), 'WAIT_ALL_KEYS_UP_BEFORE_BLOCK')
  off(core, 67, 31)
  assert.equal(phase(core), 'BLOCK_READY')
})

test('AJ09', 'wrong wait ignores later attacks and final release restarts same question at note one', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 61, 10)
  on(core, 62, 11)
  assert.equal(core.snapshot.facts.arpeggioErrors, 1)
  off(core, 61, 12)
  assert.equal(phase(core), 'ARPEGGIO_WRONG_WAIT_RELEASE')
  off(core, 62, 13)
  assert.deepEqual(core.snapshot.state, { phase: 'ARPEGGIO_READY', expectedIndex: 0 })
})

test('BJ01', 'first target starts capture using frozen 150ms source of truth', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10)
  on(core, 60, 100)
  assert.equal(core.snapshot.state.captureStartTimestampMs, 100)
  assert.equal(core.snapshot.state.captureCloseTimestampMs, 100 + CHORD_BLOCK_CAPTURE_CONTRACT.captureWindowMs)
  assert.equal(CHORD_BLOCK_CAPTURE_CONTRACT.captureWindowMs, 150)
})

test('BJ01A', 'Arpeggio Ready and Block Ready have unlimited preparation time', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  advance(core, 1_000_000)
  assert.equal(phase(core), 'ARPEGGIO_READY')
  playArpeggioToBlock(core, [60, 64, 67], 1_000_100)
  advance(core, 2_000_000)
  assert.equal(phase(core), 'BLOCK_READY')
})

test('BJ02', 'complete triad held at capture close is correct then release-complete', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10)
  playBlockToCompletion(core, [60, 64, 67], 100)
  assert.equal(core.snapshot.facts.questionCompleted, true)
})

test('BJ03', 'complete seventh held at capture close is correct', () => {
  const notes = [59, 60, 64, 67]
  const core = new ChordJudgementCore(makeQuestion(notes), 0)
  playArpeggioToBlock(core, notes, 10)
  playBlockToCompletion(core, notes, 100)
})

test('BJ04', 'all Block targets arriving early never finish before capture close', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10)
  on(core, 60, 100); on(core, 64, 110); on(core, 67, 120)
  advance(core, 249)
  assert.equal(phase(core), 'BLOCK_CAPTURE')
  advance(core, 250)
  assert.equal(phase(core), 'WAIT_ALL_KEYS_UP_AFTER_BLOCK')
})

test('BJ05', 'trailing non-target before close is immediate Block Wrong', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10)
  on(core, 60, 100); on(core, 64, 110); on(core, 67, 120)
  const [event] = on(core, 68, 149)
  assert.deepEqual([event.type, event.reason], ['BLOCK_ERROR', 'BLOCK_WRONG_PITCH'])
})

test('BJ06', 'non-target as first Block NOTE_ON is immediate Wrong without capture', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10)
  on(core, 61, 100)
  assert.equal(phase(core), 'BLOCK_WRONG_WAIT_RELEASE')
  assert.equal(core.snapshot.facts.blockErrors, 1)
})

test('BJ07', 'capture close missing one target is BLOCK_INCOMPLETE', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10)
  on(core, 60, 100); on(core, 64, 110)
  const [event] = advance(core, 250)
  assert.deepEqual([event.type, event.reason], ['BLOCK_ERROR', 'BLOCK_INCOMPLETE'])
})

test('BJ08', 'target pressed then released before capture close is incomplete', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10)
  on(core, 60, 100); on(core, 64, 110); on(core, 67, 120)
  off(core, 67, 130)
  advance(core, 250)
  assert.equal(core.snapshot.state.reason, 'BLOCK_INCOMPLETE')
})

test('BJ09', 'Block Wrong release restarts Arpeggio rather than Block', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10)
  on(core, 61, 100)
  off(core, 61, 101)
  assert.deepEqual(core.snapshot.state, { phase: 'ARPEGGIO_READY', expectedIndex: 0 })
})

test('BJ10', 'failed Block attempt counts once regardless of later key events', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10)
  on(core, 61, 100); on(core, 62, 101); on(core, 63, 102)
  off(core, 61, 103); off(core, 62, 104); off(core, 63, 105)
  assert.equal(core.snapshot.facts.blockErrors, 1)
})

test('BJ11', 'CC64 neither changes physical held keys nor blocks release completion', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10)
  on(core, 60, 100); on(core, 64, 110); on(core, 67, 120); advance(core, 250)
  cc64(core, 127, 251)
  off(core, 60, 252); off(core, 64, 253); off(core, 67, 254)
  assert.equal(phase(core), 'QUESTION_COMPLETE')
})

test('BJ12', 'Block judges exact sounding MIDI with no neighboring-pitch substitution', () => {
  const core = new ChordJudgementCore(makeQuestion([61, 65, 68]), 0)
  playArpeggioToBlock(core, [61, 65, 68], 10)
  on(core, 60, 100)
  assert.equal(core.snapshot.state.reason, 'BLOCK_WRONG_PITCH')
})

test('BJ13', 'repeated target attacks cannot substitute for a missing distinct pitch', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10)
  on(core, 60, 100); on(core, 64, 110); on(core, 64, 120)
  advance(core, 250)
  assert.equal(core.snapshot.state.reason, 'BLOCK_INCOMPLETE')
})

test('FJ01', 'clean Arpeggio and Block completion is first-pass complete', () => {
  const core = cleanCompletion()
  assert.deepEqual(
    [core.snapshot.facts.questionCompleted, core.snapshot.facts.firstPassCompleted, core.snapshot.facts.totalErrors],
    [true, true, 0]
  )
})

test('FJ02', 'Arpeggio Wrong then full success completes without first-pass credit', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 61, 10); off(core, 61, 11)
  playArpeggioToBlock(core, [60, 64, 67], 100)
  playBlockToCompletion(core, [60, 64, 67], 200)
  assert.deepEqual([core.snapshot.facts.questionCompleted, core.snapshot.facts.firstPassCompleted], [true, false])
})

test('FJ03', 'Block Wrong invalidates first pass and restarts full same-question cycle', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10)
  on(core, 61, 100); off(core, 61, 101)
  playArpeggioToBlock(core, [60, 64, 67], 200)
  playBlockToCompletion(core, [60, 64, 67], 300)
  assert.deepEqual([core.snapshot.facts.questionCompleted, core.snapshot.facts.firstPassCompleted], [true, false])
})

test('FJ04', 'multiple failures count attempts rather than subsequent input events', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 61, 10); on(core, 62, 11); off(core, 61, 12); off(core, 62, 13)
  on(core, 64, 20); off(core, 64, 21)
  playArpeggioToBlock(core, [60, 64, 67], 100)
  on(core, 61, 200); on(core, 62, 201); off(core, 61, 202); off(core, 62, 203)
  playArpeggioToBlock(core, [60, 64, 67], 300)
  playBlockToCompletion(core, [60, 64, 67], 400)
  assert.deepEqual([core.snapshot.facts.arpeggioErrors, core.snapshot.facts.blockErrors], [2, 1])
})

for (const [id, reason] of [['SJ01', 'manual-pause'], ['SJ02', 'background'], ['SJ03', 'midi-disconnect']]) {
  test(id, `${reason} during partial Arpeggio cancels progress without error`, () => {
    const core = new ChordJudgementCore(makeQuestion(), 0)
    on(core, 60, 10); off(core, 60, 11)
    suspend(core, reason, 20)
    resume(core, 1_020)
    assert.deepEqual(core.snapshot.state, { phase: 'ARPEGGIO_READY', expectedIndex: 0 })
    assert.equal(core.snapshot.facts.totalErrors, 0)
  })
}

test('SJ04', 'suspension after settled Arpeggio preserves stage and resumes at Block Ready', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 60, 10); off(core, 60, 11); on(core, 64, 20); off(core, 64, 21); on(core, 67, 30)
  suspend(core, 'manual-pause', 31)
  resume(core, 1_000)
  assert.equal(phase(core), 'RESUME_WAIT_ALL_KEYS_UP')
  off(core, 67, 1_001)
  assert.equal(phase(core), 'BLOCK_READY')
})

test('SJ05', 'suspension during Block capture cancels capture but preserves Arpeggio', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10)
  on(core, 60, 100)
  suspend(core, 'screen-lock', 120)
  resume(core, 1_120)
  off(core, 60, 1_121)
  assert.equal(phase(core), 'BLOCK_READY')
  assert.equal(core.snapshot.facts.totalErrors, 0)
})

test('SJ06', 'canceled Block capture has no stale deadline after resume', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10)
  on(core, 60, 100); suspend(core, 'background', 120); off(core, 60, 121); resume(core, 1_000)
  advance(core, 5_000)
  assert.equal(phase(core), 'BLOCK_READY')
  assert.equal(core.snapshot.facts.blockErrors, 0)
})

test('SJ07', 'explicit resume with held keys remains gated until final physical release', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 60, 10)
  suspend(core, 'manual-pause', 20)
  resume(core, 100)
  assert.equal(phase(core), 'RESUME_WAIT_ALL_KEYS_UP')
  on(core, 64, 101); off(core, 60, 102)
  assert.equal(phase(core), 'RESUME_WAIT_ALL_KEYS_UP')
  off(core, 64, 103)
  assert.equal(phase(core), 'ARPEGGIO_READY')
})

test('SJ08', 'suspension cancellation does not destroy first-pass eligibility', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 60, 10); off(core, 60, 11); suspend(core, 'manual-pause', 20); resume(core, 1_020)
  playArpeggioToBlock(core, [60, 64, 67], 1_100)
  playBlockToCompletion(core, [60, 64, 67], 1_200)
  assert.equal(core.snapshot.facts.firstPassCompleted, true)
})

test('SJ09', 'suspension after Block settles preserves result until safe release completion', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10)
  on(core, 60, 100); on(core, 64, 110); on(core, 67, 120); advance(core, 250)
  suspend(core, 'screen-lock', 260)
  resume(core, 1_260)
  assert.equal(phase(core), 'RESUME_WAIT_ALL_KEYS_UP')
  off(core, 60, 1_261); off(core, 64, 1_262); off(core, 67, 1_263)
  assert.equal(phase(core), 'QUESTION_COMPLETE')
  assert.equal(core.snapshot.facts.firstPassCompleted, true)
})

test('RS01', 'held NOTE_ON then disconnect suspension and input reset clears stale physical keys', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 60, 10)
  suspend(core, 'midi-disconnect', 20)
  resetInput(core, 30)
  assert.deepEqual(core.snapshot.heldNotes, [])
  assert.equal(phase(core), 'SUSPENDED')
})

test('RS02', 'input reset allows explicit resume without a lost stale NOTE_OFF', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 60, 10)
  suspend(core, 'midi-disconnect', 20)
  resetInput(core, 30)
  resume(core, 40)
  assert.deepEqual(core.snapshot.state, { phase: 'ARPEGGIO_READY', expectedIndex: 0 })
})

test('RS03', 'partial Arpeggio plus reset resumes at exact Arpeggio note one', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 60, 10); off(core, 60, 11)
  suspend(core, 'midi-disconnect', 20); resetInput(core, 30); resume(core, 40)
  assert.deepEqual(core.snapshot.state, { phase: 'ARPEGGIO_READY', expectedIndex: 0 })
})

test('RS04', 'settled Arpeggio plus reset preserves Block Ready resume target', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10)
  suspend(core, 'midi-disconnect', 40); resetInput(core, 50); resume(core, 60)
  assert.equal(phase(core), 'BLOCK_READY')
})

test('RS05', 'active Block capture reset cancels capture without Block error then resumes Block Ready', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10)
  on(core, 60, 100)
  suspend(core, 'midi-disconnect', 110); resetInput(core, 120); resume(core, 130)
  assert.equal(phase(core), 'BLOCK_READY')
  assert.equal(core.snapshot.facts.blockErrors, 0)
})

test('RS06', 'settled Block reset stays suspended and completes only after explicit Resume', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10)
  on(core, 60, 100); on(core, 64, 110); on(core, 67, 120); advance(core, 250)
  suspend(core, 'midi-disconnect', 260); resetInput(core, 270)
  assert.equal(phase(core), 'SUSPENDED')
  assert.equal(core.snapshot.facts.questionCompleted, false)
  resume(core, 280)
  assert.equal(phase(core), 'QUESTION_COMPLETE')
})

test('RS07', 'input reset never increments Arpeggio or Block errors', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 60, 10); suspend(core, 'midi-disconnect', 20); resetInput(core, 30)
  assert.deepEqual(
    [core.snapshot.facts.arpeggioErrors, core.snapshot.facts.blockErrors, core.snapshot.facts.totalErrors],
    [0, 0, 0]
  )
})

test('RS08', 'input reset does not clear first-pass eligibility', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 60, 10); suspend(core, 'midi-disconnect', 20); resetInput(core, 30); resume(core, 40)
  playArpeggioToBlock(core, [60, 64, 67], 100)
  playBlockToCompletion(core, [60, 64, 67], 200)
  assert.equal(core.snapshot.facts.firstPassCompleted, true)
})

test('RS09', 'no stale Block capture deadline survives input reset', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10)
  on(core, 60, 100); suspend(core, 'midi-disconnect', 110); resetInput(core, 120); resume(core, 130)
  advance(core, 10_000)
  assert.equal(phase(core), 'BLOCK_READY')
  assert.equal(core.snapshot.facts.blockErrors, 0)
})

test('RS10', 'same reset event stream is deterministic', () => {
  const left = new ChordJudgementCore(makeQuestion(), 0)
  const right = new ChordJudgementCore(makeQuestion(), 0)
  const events = [
    { type: 'NOTE_ON', note: 60, timestampMs: 10 },
    { type: 'SUSPEND', reason: 'midi-disconnect', timestampMs: 20 },
    { type: 'INPUT_STATE_RESET', timestampMs: 30 },
    { type: 'RESUME', timestampMs: 40 }
  ]
  events.forEach((event) => { left.process(event); right.process(event) })
  assert.deepEqual(left.snapshot, right.snapshot)
})

test('RS11', 'input reset during active judgement fails clearly without silent continuation', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  assert.throws(() => resetInput(core, 10), /requires a suspended or resume-gated state/)
  assert.deepEqual(core.snapshot.state, { phase: 'ARPEGGIO_READY', expectedIndex: 0 })
  assert.deepEqual(core.snapshot.heldNotes, [])
})

test('RS12', 'reset during resume release gate returns to suspended and requires another explicit Resume', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 60, 10); suspend(core, 'midi-disconnect', 20); resume(core, 30)
  assert.equal(phase(core), 'RESUME_WAIT_ALL_KEYS_UP')
  resetInput(core, 40)
  assert.equal(phase(core), 'SUSPENDED')
  resume(core, 50)
  assert.equal(phase(core), 'ARPEGGIO_READY')
})

test('ST01', 'Stop at Arpeggio Ready discards an unsettled question without facts', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  stop(core, 10)
  assert.deepEqual(core.snapshot.state, { phase: 'STOPPED', disposition: 'UNSETTLED_DISCARDED' })
  assert.deepEqual([core.snapshot.facts.questionCompleted, core.snapshot.facts.totalErrors], [false, 0])
})

test('ST02', 'Stop during partial Arpeggio does not fabricate completion or error', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 60, 10); stop(core, 11)
  assert.deepEqual([core.snapshot.facts.questionCompleted, core.snapshot.facts.totalErrors], [false, 0])
})

test('ST03', 'Stop between phases discards the incomplete current question', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10); stop(core, 100)
  assert.equal(core.snapshot.state.disposition, 'UNSETTLED_DISCARDED')
})

test('ST04', 'Stop during Block capture adds no error or completion', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 10); on(core, 60, 100); stop(core, 110)
  assert.deepEqual([core.snapshot.facts.questionCompleted, core.snapshot.facts.totalErrors], [false, 0])
})

test('ST05', 'Stop while waiting after Wrong preserves only the actual settled error', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 61, 10); stop(core, 11)
  assert.deepEqual([core.snapshot.facts.questionCompleted, core.snapshot.facts.arpeggioErrors], [false, 1])
})

test('ST06', 'Stop after Question Complete retains the settled completed question', () => {
  const core = cleanCompletion()
  stop(core, 1_000)
  assert.deepEqual(core.snapshot.state, { phase: 'STOPPED', disposition: 'SETTLED_COMPLETED' })
  assert.equal(core.snapshot.facts.questionCompleted, true)
})

test('TM01', 'question-start latency settles at first correct first-attempt Arpeggio note', () => {
  const core = new ChordJudgementCore(makeQuestion(), 100)
  on(core, 60, 250)
  assert.equal(core.snapshot.facts.timing.questionStartLatencyMs, 150)
})

test('TM02', 'question-start latency never restarts after a later failure', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 60, 100); on(core, 62, 120); off(core, 60, 121); off(core, 62, 122)
  on(core, 60, 1_000)
  assert.equal(core.snapshot.facts.timing.questionStartLatencyMs, 100)
})

test('TM03', 'first wrong-pitch Arpeggio NOTE_ON still settles start latency', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 61, 100)
  assert.equal(core.snapshot.facts.timing.questionStartLatencyMs, 100)
})

test('TM03A', 'first wrong-order Arpeggio NOTE_ON still settles start latency', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 64, 100)
  assert.equal(core.snapshot.facts.timing.questionStartLatencyMs, 100)
})

test('TM03B', 'later retry never replaces start latency settled by a wrong first note', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  on(core, 61, 100); off(core, 61, 101); on(core, 60, 1_000)
  assert.equal(core.snapshot.facts.timing.questionStartLatencyMs, 100)
})

test('TM03C', 'Stop before any Arpeggio NOTE_ON leaves start latency null', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  stop(core, 100)
  assert.equal(core.snapshot.facts.timing.questionStartLatencyMs, null)
})

test('TM03D', 'start latency excludes suspension duration and measures first Arpeggio NOTE_ON', () => {
  const core = new ChordJudgementCore(makeQuestion(), 1_000)
  suspend(core, 'manual-pause', 3_000)
  resume(core, 13_000)
  on(core, 61, 14_000)
  assert.equal(core.snapshot.facts.timing.questionStartLatencyMs, 3_000)
})

test('TM03E', 'input reset before first Arpeggio NOTE_ON never fabricates start latency', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  suspend(core, 'midi-disconnect', 100); resetInput(core, 200)
  assert.equal(core.snapshot.facts.timing.questionStartLatencyMs, null)
  resume(core, 300)
  assert.equal(core.snapshot.facts.timing.questionStartLatencyMs, null)
})

test('TM04', 'Block Wrong invalidates prior cycle and final Arpeggio duration replaces it', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 100, 10)
  on(core, 61, 200); off(core, 61, 201)
  playArpeggioToBlock(core, [60, 64, 67], 300, 40)
  playBlockToCompletion(core, [60, 64, 67], 500)
  assert.equal(core.snapshot.facts.timing.arpeggioDurationMs, 80)
})

test('TM05', 'switch timing uses Arpeggio release gate to first note of final successful Block', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  const releaseTimestamp = playArpeggioToBlock(core, [60, 64, 67], 100, 40)
  playBlockToCompletion(core, [60, 64, 67], 500)
  assert.equal(core.snapshot.facts.timing.switchToBlockLatencyMs, 500 - releaseTimestamp)
})

test('TM06', 'Block landing spread is first-to-last target rather than capture duration', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  playArpeggioToBlock(core, [60, 64, 67], 100)
  playBlockToCompletion(core, [60, 64, 67], 500, [0, 30, 42])
  assert.equal(core.snapshot.facts.timing.blockLandingSpreadMs, 42)
})

test('TM07', 'suspended time is excluded from question, cycle and switch timing', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  suspend(core, 'manual-pause', 100); resume(core, 1_100)
  const releaseTimestamp = playArpeggioToBlock(core, [60, 64, 67], 1_200, 50)
  suspend(core, 'background', releaseTimestamp + 10); resume(core, releaseTimestamp + 1_010)
  playBlockToCompletion(core, [60, 64, 67], releaseTimestamp + 1_100, [0, 30, 50])
  assert.deepEqual(core.snapshot.facts.timing, {
    questionStartLatencyMs: 200,
    arpeggioDurationMs: 100,
    switchToBlockLatencyMs: 100,
    blockLandingSpreadMs: 50
  })
})

test('TM08', 'non-monotonic event timestamps fail fast', () => {
  const core = new ChordJudgementCore(makeQuestion(), 100)
  on(core, 60, 110)
  assert.throws(() => off(core, 60, 109), /Non-monotonic timestamp/)
})

test('DT01', 'same immutable target and event stream produce identical snapshots', () => {
  const question = makeQuestion()
  const left = new ChordJudgementCore(question, 0)
  const right = new ChordJudgementCore(question, 0)
  const events = [
    { type: 'NOTE_ON', note: 60, timestampMs: 10 }, { type: 'NOTE_OFF', note: 60, timestampMs: 11 },
    { type: 'NOTE_ON', note: 64, timestampMs: 20 }, { type: 'NOTE_OFF', note: 64, timestampMs: 21 },
    { type: 'NOTE_ON', note: 67, timestampMs: 30 }, { type: 'NOTE_OFF', note: 67, timestampMs: 31 }
  ]
  events.forEach((event) => { left.process(event); right.process(event) })
  assert.deepEqual(left.snapshot, right.snapshot)
  assert.equal(Object.isFrozen(left.snapshot.target.arpeggioMidi), true)
})

test('DT02', 'input question arrays are copied and never retained as mutable judgement targets', () => {
  const question = makeQuestion()
  const core = new ChordJudgementCore(question, 0)
  question.arpeggioNotes[0].soundingMidi = 1
  question.blockNotes[0].soundingMidi = 2
  assert.deepEqual(core.snapshot.target.arpeggioMidi, [60, 64, 67])
  assert.deepEqual(core.snapshot.target.blockMidi, [60, 64, 67])
})

test('DT03', 'core has no hidden clock, random, scheduler, UI, native or generator dependency', () => {
  for (const forbidden of ['Date.now', 'performance.now', 'setTimeout', 'Math.random', 'main.tsx', 'ChordGrandStaff', 'Bluetooth', 'musicTheory/chords/generator']) {
    assert.equal(judgementSource.includes(forbidden), false, forbidden)
  }
})

test('DT04', 'invalid resume and post-stop transitions fail clearly', () => {
  const core = new ChordJudgementCore(makeQuestion(), 0)
  assert.throws(() => resume(core, 1), /RESUME requires SUSPENDED/)
  stop(core, 2)
  assert.throws(() => advance(core, 3), /after STOPPED/)
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

process.stdout.write(`\n${passed}/${tests.length} Android Chord V1 judgement contract groups PASS\n`)
if (passed !== tests.length) process.exitCode = 1
