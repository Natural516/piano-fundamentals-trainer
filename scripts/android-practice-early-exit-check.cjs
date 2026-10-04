const assert = require('node:assert/strict')
const { act } = require('react-test-renderer')
const shared = require('./android-localization-shell-check.cjs')
const guard = require('./android-practice-early-exit-contract.cjs')
const fixtures = Object.fromEntries(['sight', 'chord', 'interval'].map(name => [name, require('./android-localization-' + name + '-check.cjs')]))
const { createLocalizationInstance } = require('../prototype/android-tablet-v1/src/localization/localizationService.ts')
const { practiceExitResources } = require('../prototype/android-tablet-v1/src/localization/practiceExitResources.ts')
const tests = [], test = (id, run) => tests.push({ id, run })
const runtime = (name, h) => name === 'sight' ? h.runtime : h[name]
const records = (name, h) => name === 'sight' ? h.runtime.historySnapshot.records : h.persistence.snapshot.records
const snapshot = (name, h) => runtime(name, h).snapshot
const question = (name, h) => name === 'sight' ? snapshot(name, h).currentTargetNotes : snapshot(name, h).question
const counts = (name, h) => {
  const s = snapshot(name, h)
  return name === 'sight' ? [s.completedQuestions, s.correctCount, s.wrongCount, s.timeoutCount] : name === 'chord' ? s.counters : [s.completedQuestions, s.currentWrongAttemptCount, s.practiceState.attempts]
}
const paused = (name, h) => name === 'sight' ? snapshot(name, h).isPaused : snapshot(name, h).status === 'SUSPENDED'
const flush = async (name, h) => act(async () => name === 'sight' ? h.runtime.flushPersistence() : h.persistence.flush())
const actions = h => h.renderer.root.findByProps({ className: 'early-end-dialog__actions' }).findAllByType('button')
const dialog = h => h.renderer.root.findByProps({ role: 'dialog' })
const click = async node => act(async () => node.props.onClick())
const back = async h => act(async () => global.window.dispatchEvent({ type: 'practice-request-end' }))
async function open(name, h) {
  const node = name === 'sight' ? h.renderer.root.findByProps({ className: 'focus-back' }) : name === 'interval' ? h.renderer.root.findAllByProps({ className: 'outline-action' })[1] : h.renderer.root.findAllByProps({ className: 'outline-action' }).at(-1)
  await click(node)
  assert.equal(dialog(h).props['data-exit-stage'], 'confirm')
}
async function chooseEnd(h) { await click(actions(h)[1]); assert.equal(dialog(h).props['data-exit-stage'], 'save-choice') }
async function progress(name, h) {
  const f = fixtures[name]
  if (name === 'sight') { await f.answer(h); await f.advance(h, 350); await f.advance(h, 32) }
  if (name === 'chord') { await f.arpeggio(h); await f.block(h); await f.advance(h, 800) }
  if (name === 'interval') { await f.correct(h); await f.release(h); await f.advance(h, 800) }
}
function protectedState(h) {
  return { input: JSON.stringify(h.runtime.bluetoothSnapshot), boundary: h.runtime.midiBoundaryVersion,
    nativeCalls: [...h.plugin.calls], listeners: [...h.plugin.listeners], theme: h.themeManager.snapshot,
    preferences: [...h.backend.values].filter(([key]) => !/report|history/.test(key)) }
}
const routeAfterExit = { sight: 'sight-ready', chord: 'chord-mode-select', interval: 'interval-practice' }
for (const name of Object.keys(fixtures)) {
  const f = fixtures[name]
  test('EARLY-EXIT-1/' + name, async () => f.flow(async h => {
    await f.start(h); const bytes = shared.businessBytes(h.backend), writes = h.backend.writes.length
    await open(name, h)
    assert.deepEqual(actions(h).map(shared.text), ['继续练习', '结束'])
    assert.equal(paused(name, h), true); assert.equal(records(name, h).length, 1)
    assert.deepEqual(shared.businessBytes(h.backend), bytes); assert.equal(h.backend.writes.length, writes)
  }))
  test('EARLY-EXIT-CONTINUE/' + name, async () => f.flow(async h => {
    await f.start(h); const q = question(name, h), c = JSON.stringify(counts(name, h)), host = h.host.current
    await open(name, h); await click(actions(h)[0])
    assert.equal(paused(name, h), false); assert.equal(question(name, h), q); assert.equal(JSON.stringify(counts(name, h)), c)
    assert.deepEqual(h.host.current, host); assert.equal(h.renderer.root.findAllByProps({ role: 'dialog' }).length, 0)
  }))
  test('EARLY-EXIT-2/' + name, async () => f.flow(async h => {
    await f.start(h); await progress(name, h); const bytes = shared.businessBytes(h.backend), c = JSON.stringify(counts(name, h)), q = question(name, h), host = h.host.current
    await open(name, h); await chooseEnd(h); await flush(name, h)
    assert.deepEqual(actions(h).map(shared.text), ['保存并结束', '不保存并结束'])
    assert.equal(question(name, h), q); assert.equal(JSON.stringify(counts(name, h)), c); assert.deepEqual(h.host.current, host)
    assert.deepEqual(shared.businessBytes(h.backend), bytes); assert.equal(records(name, h).length, 1)
  }))
  test('EARLY-EXIT-3/' + name, async () => f.flow(async h => {
    await f.start(h); await progress(name, h); const state = protectedState(h), oldIds = records(name, h).map(r => r.recordId)
    await open(name, h); await chooseEnd(h); const save = actions(h)[0].props.onClick
    await act(async () => { save(); save() }); await flush(name, h)
    assert.equal(records(name, h).length, 2); assert.equal(h.host.current, null)
    const report = records(name, h).find(r => !oldIds.includes(r.recordId))
    assert.ok(report); assert.equal(name === 'sight' ? report.completed : report.completedQuestions, 1)
    const valid = name === 'sight' ? require('../prototype/android-tablet-v1/src/androidPersistenceCore.ts').isDurableSightReadingReport : name === 'chord' ? require('../prototype/android-tablet-v1/src/chordPractice/report.ts').isChordPracticeReportV1 : require('../prototype/android-tablet-v1/src/intervalPractice/index.ts').isIntervalPracticeReportV1
    assert.equal(valid(report), true)
    assert.equal(name === 'interval' ? report.completionStatus : name === 'chord' ? report.completionReason : report.completionState, name === 'interval' ? 'STOPPED' : 'stopped')
    assert.deepEqual(protectedState(h), state)
  }))
  test('EARLY-EXIT-4+5+8/' + name, async () => {
    for (const progressed of [false, true]) await f.flow(async h => {
      await f.start(h); if (progressed) await progress(name, h)
      const bytes = shared.businessBytes(h.backend), writes = h.backend.writes.length, state = protectedState(h), c = JSON.stringify(counts(name, h))
      await open(name, h); await chooseEnd(h); const discard = actions(h)[1].props.onClick
      await act(async () => { discard(); discard() }); await flush(name, h)
      assert.equal(h.state().screen, routeAfterExit[name]); assert.equal(h.host.current, null)
      assert.equal(records(name, h).length, 1); assert.deepEqual(shared.businessBytes(h.backend), bytes)
      assert.equal(h.backend.writes.length, writes); assert.deepEqual(protectedState(h), state); assert.equal(JSON.stringify(counts(name, h)), c)
      if (name === 'sight') { await act(async () => h.runtime.stop()); await flush(name, h); assert.equal(records(name, h).length, 1) }
    })
  })
  test('EARLY-EXIT-7/' + name, async () => {
    // Existing Chord no-progress save policy deliberately differs from Sight/Interval.
    await f.flow(async h => {
      await f.start(h); await open(name, h); await chooseEnd(h); await click(actions(h)[0]); await flush(name, h)
      assert.equal(records(name, h).length, name === 'chord' ? 1 : 2)
      if (name !== 'chord') {
        const saved = name === 'sight' ? h.runtime.snapshot.report : h.persistence.snapshot.latestReport
        assert.equal(saved.completedQuestions, 0)
        if (name === 'sight') { assert.equal(saved.wrong, 0); assert.equal(saved.timeout, 0) }
        else { assert.equal(saved.firstTryCorrectCount, 0); assert.equal(saved.firstTryAccuracy, null) }
      }
    })
  })
  test('EARLY-EXIT-6/' + name, async () => {
    for (const cancellation of ['native-back', 'escape', 'close', 'backdrop']) await f.flow(async h => {
      await f.start(h); const q = question(name, h), c = JSON.stringify(counts(name, h)), bytes = shared.businessBytes(h.backend), host = h.host.current
      await open(name, h); await chooseEnd(h)
      if (cancellation === 'native-back') await back(h)
      if (cancellation === 'escape') await act(async () => global.window.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} }))
      if (cancellation === 'close') await click(dialog(h).findByProps({ 'aria-label': '取消退出，返回练习' }))
      if (cancellation === 'backdrop') { const node = h.renderer.root.findByProps({ className: 'early-end-backdrop' }); await act(async () => node.props.onClick({ target: node, currentTarget: node })) }
      await flush(name, h)
      assert.equal(paused(name, h), false); assert.equal(question(name, h), q); assert.equal(JSON.stringify(counts(name, h)), c)
      assert.deepEqual(h.host.current, host); assert.deepEqual(shared.businessBytes(h.backend), bytes); assert.equal(records(name, h).length, 1)
      assert.equal(h.renderer.root.findAllByProps({ role: 'dialog' }).length, 0)
    })
    await f.flow(async h => {
      await f.start(h); await act(async () => runtime(name, h).pause()); await open(name, h); await chooseEnd(h); await back(h)
      assert.equal(paused(name, h), true); assert.equal(records(name, h).length, 1)
    })
  })
  test('EARLY-EXIT-10/' + name, async () => f.flow(async h => {
    await f.start(h); await open(name, h); await h.switchTo('en')
    assert.deepEqual(actions(h).map(shared.text), ['Continue practice', 'End'])
    await chooseEnd(h); assert.deepEqual(actions(h).map(shared.text), ['Save and end', 'End without saving'])
    await f.roundTrip(h); assert.equal(dialog(h).props['data-exit-stage'], 'save-choice')
    assert.equal(actions(h)[1].props.className, 'secondary-action'); assert.equal(records(name, h).length, 1)
  }))
  test('EARLY-EXIT-9/' + name, async () => f.flow(async h => {
    await f.start(h); const count = name === 'sight' ? h.runtime.settings.questionCount : snapshot(name, h).questionCount
    assert.equal(count, 10)
    for (let i = 0; i < count; i++) await progress(name, h)
    await flush(name, h); assert.equal(records(name, h).length, 2)
    assert.equal(h.renderer.root.findAllByProps({ role: 'dialog' }).length, 0)
    const report = name === 'sight' ? h.runtime.snapshot.report : name === 'chord' ? records(name, h).find(r => r.completionReason === 'completed') : h.persistence.snapshot.latestReport
    assert.equal(report.completedQuestions, 10)
    assert.equal(name === 'interval' ? report.completionStatus : name === 'chord' ? report.completionReason : report.completionState, name === 'interval' ? 'COMPLETED' : 'completed')
  }, { settings: { questionCount: 10 } }))
  test('EARLY-EXIT-MANUAL-LIMIT/' + name, async () => f.flow(async h => {
    await f.start(h); await progress(name, h); const bytes = shared.businessBytes(h.backend)
    await back(h); await chooseEnd(h)
    if (name === 'sight') assert.match(shared.text(dialog(h)), /\/ 100/)
    else assert.doesNotMatch(shared.text(dialog(h)), /\/\s*\d+/)
    await click(actions(h)[1]); await flush(name, h)
    assert.equal(records(name, h).length, 1); assert.deepEqual(shared.businessBytes(h.backend), bytes)
  }, name === 'sight' ? { settings: { questionCount: 100 } } : name === 'chord' ? { count: 'endless' } : { settings: { questionCount: 'endless' } }))
}
test('EARLY-EXIT-SCOPE', () => {
  guard.assertEarlyExitDelta()
  const main = shared.read('prototype/android-tablet-v1/src/main.tsx')
  assert.equal((main.match(/<PracticeEarlyExitDialog/g) ?? []).length, 3)
  assert.equal((main.match(/usePracticeEarlyExit\(/g) ?? []).length, 3)
  assert.equal((main.match(/dispatchEvent\(new CustomEvent\('practice-request-end'\)\)/g) ?? []).length, 3)
  assert.doesNotMatch(main, /interval-request-end/)
  for (const name of Object.keys(fixtures)) assert.match(shared.current.get(name === 'sight' ? 'SightFocusScreen' : name === 'chord' ? 'ChordPracticeScreen' : 'IntervalPracticeActiveScreen'), /onDiscard=\{\(\) => \w+\(false\)\}/)
})
test('EARLY-EXIT-RESOURCE-PARITY', () => {
  assert.deepEqual(Object.keys(practiceExitResources['zh-CN']).sort(), Object.keys(practiceExitResources.en).sort())
  const en = createLocalizationInstance('en'); en.options.fallbackLng = false
  for (const [key, value] of Object.entries(practiceExitResources.en)) {
    assert.ok(en.exists(key, { ns: 'practiceExit', lng: 'en', fallbackLng: false })); assert.doesNotMatch(value, /[\u3400-\u9fff]/)
    const slots = s => [...s.matchAll(/{{\s*(\w+)\s*}}/g)].map(m => m[1]).sort()
    assert.deepEqual(slots(value), slots(practiceExitResources['zh-CN'][key]))
  }
})
void (async () => {
  let passed = 0
  for (const { id, run } of tests) {
    try { await run(); passed++; console.log('PASS ' + id) }
    catch (error) { console.error('FAIL ' + id + '\n' + error.stack) }
  }
  console.log(`\n${passed}/${tests.length} Practice Early-Exit checks PASS (React/runtime contracts, not pixel evidence)`)
  if (passed !== tests.length) process.exitCode = 1
})()
