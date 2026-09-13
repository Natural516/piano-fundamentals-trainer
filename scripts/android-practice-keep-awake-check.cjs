const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename
  }).outputText
  module._compile(output, filename)
}

const root = path.resolve(__dirname, '..')
const mainPath = path.join(root, 'prototype/android-tablet-v1/src/main.tsx')
const policyPath = path.join(root, 'prototype/android-tablet-v1/src/practiceKeepAwake.ts')
const pluginPath = path.join(root, 'android/app/src/main/java/com/pianofundamentals/trainer/PracticeKeepAwakePlugin.kt')
const activityPath = path.join(root, 'android/app/src/main/java/com/pianofundamentals/trainer/MainActivity.java')
const mainSource = fs.readFileSync(mainPath, 'utf8')
const policySource = fs.readFileSync(policyPath, 'utf8')
const pluginSource = fs.readFileSync(pluginPath, 'utf8')
const activitySource = fs.readFileSync(activityPath, 'utf8')
const { PracticeKeepAwakeController, shouldKeepPracticeAwake } = require('../prototype/android-tablet-v1/src/practiceKeepAwake.ts')

const results = []
function test(name, fn) {
  Promise.resolve().then(fn).then(() => {
    results.push({ name, ok: true })
  }).catch((error) => {
    results.push({ name, ok: false, error })
  })
}

const baseline = Object.freeze({
  appForeground: true,
  screen: 'home',
  sightStatus: 'idle',
  sightPaused: false,
  chordStatus: 'IDLE'
})
const policy = (changes) => shouldKeepPracticeAwake({ ...baseline, ...changes })

test('KA01 Sight running keeps the screen awake', () => assert.equal(policy({ screen: 'sight-active', sightStatus: 'running' }), true))
test('KA02 Sight manual pause releases keep-awake', () => assert.equal(policy({ screen: 'sight-active', sightStatus: 'running', sightPaused: true }), false))
test('KA03 Sight explicit resume reacquires keep-awake', () => assert.equal(policy({ screen: 'sight-active', sightStatus: 'running', sightPaused: false }), true))
test('KA04 Sight completion releases keep-awake', () => assert.equal(policy({ screen: 'sight-result', sightStatus: 'finished' }), false))
test('KA05 Chord running keeps the screen awake', () => assert.equal(policy({ screen: 'chord-practice', chordStatus: 'RUNNING' }), true))
test('KA06 Chord manual pause releases keep-awake', () => assert.equal(policy({ screen: 'chord-practice', chordStatus: 'SUSPENDED' }), false))
test('KA07 Chord explicit resume reacquires keep-awake', () => assert.equal(policy({ screen: 'chord-practice', chordStatus: 'RUNNING' }), true))
test('KA08 Chord completion releases keep-awake', () => assert.equal(policy({ screen: 'chord-practice', chordStatus: 'SESSION_COMPLETE' }), false))
test('KA09 Chord 800ms success feedback keeps the screen awake', () => assert.equal(policy({ screen: 'chord-practice', chordStatus: 'SUCCESS_FEEDBACK' }), true))
test('KA10 Chord inter-question all-keys-up wait stays awake in success feedback', () => assert.equal(policy({ screen: 'chord-practice', chordStatus: 'SUCCESS_FEEDBACK' }), true))
test('KA11 auxiliary MIDI navigation releases keep-awake', () => assert.equal(policy({ screen: 'midi', chordStatus: 'RUNNING' }), false))
test('KA12 returning from MIDI with preserved suspended session remains released', () => assert.equal(policy({ screen: 'chord-practice', chordStatus: 'SUSPENDED' }), false))
test('KA13 explicit resumed Chord practice is awake', () => assert.equal(policy({ screen: 'chord-practice', chordStatus: 'RUNNING' }), true))
test('KA14 background always releases keep-awake', () => assert.equal(policy({ appForeground: false, screen: 'chord-practice', chordStatus: 'RUNNING' }), false))
test('KA15 foreground alone does not wake a suspended session', () => assert.equal(policy({ screen: 'chord-practice', chordStatus: 'SUSPENDED' }), false))
test('KA16 explicitly resumed foreground practice reacquires', () => assert.equal(policy({ screen: 'sight-active', sightStatus: 'running' }), true))
test('KA17 zero-completion stop releases keep-awake', () => assert.equal(policy({ screen: 'chord-mode-select', chordStatus: 'STOPPED' }), false))
test('KA18 early End-and-Save releases keep-awake', () => assert.equal(policy({ screen: 'chord-mode-select', chordStatus: 'STOPPED' }), false))
test('KA19 natural finite completion releases keep-awake', () => assert.equal(policy({ screen: 'chord-practice', chordStatus: 'SESSION_COMPLETE' }), false))

test('KA20 repeated acquire and release calls are idempotent', async () => {
  const calls = []
  const controller = new PracticeKeepAwakeController({
    async setEnabled({ enabled }) { calls.push(enabled); return { enabled } }
  })
  await controller.setEnabled(true)
  await controller.setEnabled(true)
  await controller.setEnabled(false)
  await controller.setEnabled(false)
  assert.deepEqual(calls, [true, false])
  assert.equal(controller.appliedEnabled, false)
})

test('KA21 all normal non-practice screens remain released', () => {
  for (const screen of ['home', 'practice', 'chord-mode-select', 'sight-ready', 'tools', 'history', 'settings', 'midi', 'update', 'sight-result']) {
    assert.equal(policy({ screen, sightStatus: 'running', chordStatus: 'RUNNING' }), false, screen)
  }
})

test('KA22 wake-state boundary contains no persistence or History writes', () => {
  assert.doesNotMatch(policySource, /Preferences|Repository|History|reportIndex|finalize\(/)
  assert.doesNotMatch(pluginSource, /Preferences|Repository|History|reportIndex/)
})

test('KA23 keep-awake adds no second MIDI subscription', () => {
  assert.equal((mainSource.match(/midiRouter\.subscribe\(/g) ?? []).length, 1)
  assert.doesNotMatch(policySource, /Web MIDI|Midi|midiRouter|handleMidi/)
})

test('KA24 native mechanism permits manual lock and uses no kiosk or wake-lock tricks', () => {
  assert.match(pluginSource, /FLAG_KEEP_SCREEN_ON/)
  assert.match(pluginSource, /clearFlags/)
  assert.match(pluginSource, /handleOnPause/)
  assert.doesNotMatch(pluginSource + activitySource, /PowerManager|WakeLock|startLockTask|DevicePolicyManager|setShowWhenLocked|turnScreenOn/)
  assert.equal((activitySource.match(/registerPlugin\(PracticeKeepAwakePlugin\.class\)/g) ?? []).length, 1)
})

test('KA25 Sight feedback screens retain running ownership', () => {
  for (const screen of ['sight-correct', 'sight-wrong', 'sight-timeout']) {
    assert.equal(policy({ screen, sightStatus: 'running' }), true, screen)
  }
})

test('KA26 early-end confirmation never owns keep-awake', () => {
  assert.equal(policy({ screen: 'sight-early-end', sightStatus: 'running' }), false)
})

test('KA27 native lifecycle releases and does not blindly reacquire', () => {
  assert.match(pluginSource, /override fun handleOnPause\(\)/)
  assert.doesNotMatch(pluginSource, /override fun handleOnResume\(\)/)
  assert.match(mainSource, /setAppForeground\(false\)[\s\S]*practiceKeepAwake\.setEnabled\(false\)/)
  assert.match(mainSource, /setAppForeground\(true\)[\s\S]*runtime\.resumeFromAppLifecycle\(\)/)
})

test('KA28 implementation preserves existing immersive policy body', () => {
  assert.match(activitySource, /applyImmersiveWindowPolicy\(\)/)
  assert.match(activitySource, /BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE/)
  assert.match(activitySource, /controller\.hide\(WindowInsetsCompat\.Type\.systemBars\(\)\)/)
})

setImmediate(async () => {
  while (results.length < 28) await new Promise((resolve) => setImmediate(resolve))
  for (const result of results) {
    if (result.ok) console.log(`PASS ${result.name}`)
    else console.error(`FAIL ${result.name}: ${result.error?.stack ?? result.error}`)
  }
  const passed = results.filter((result) => result.ok).length
  console.log(`\nAndroid practice keep-awake: ${passed}/${results.length} passed`)
  if (passed !== results.length) process.exitCode = 1
})
