const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      },
      fileName: filename
    }).outputText
    module._compile(output, filename)
  }
}

const {
  ANDROID_PERSISTENCE_KEYS,
  AndroidPersistenceStore,
  SightReadingReportRepository,
  SightReadingSettingsRepository,
  createDurableSightReadingReport,
  initializeAndroidPersistence
} = require('../prototype/android-tablet-v1/src/androidPersistenceCore.ts')
const { AndroidSightReadingRuntime } = require('../prototype/android-tablet-v1/src/sightReadingIntegration.ts')
const { ANDROID_SIGHT_READING_DEFAULTS } = require('../src/sightReading/sightReadingSettings.ts')
const { MAJOR_KEY_IDS } = require('../src/sightReading/musicKeySignatures.ts')

class FakePreferencesBackend {
  constructor(sharedValues = new Map()) {
    this.values = sharedValues
    this.failures = new Map()
    this.operations = []
  }

  failNextSet(key) {
    this.failures.set(key, (this.failures.get(key) ?? 0) + 1)
  }

  rawSet(key, value) {
    this.values.set(key, value)
  }

  async get({ key }) {
    this.operations.push(['get', key])
    return { value: this.values.get(key) ?? null }
  }

  async set({ key, value }) {
    this.operations.push(['set', key])
    const remaining = this.failures.get(key) ?? 0
    if (remaining > 0) {
      this.failures.set(key, remaining - 1)
      throw new Error(`injected set failure: ${key}`)
    }
    this.values.set(key, value)
  }

  async keys() {
    this.operations.push(['keys', '*'])
    return { keys: [...this.values.keys()] }
  }
}

const androidSettings = (changes = {}) => ({
  ...ANDROID_SIGHT_READING_DEFAULTS,
  ...changes,
  noteCount: 1
})

function sampleReport(completionState = 'completed', changes = {}) {
  const stopped = completionState === 'stopped'
  const completedQuestions = stopped ? 2 : 10
  const correct = stopped ? 1 : 8
  const wrong = stopped ? 1 : 1
  const timeout = stopped ? 0 : 1
  return {
    totalQuestions: 10,
    completedQuestions,
    correct,
    wrong,
    timeout,
    accuracy: Math.round(correct / completedQuestions * 100),
    bestStreak: stopped ? 1 : 5,
    mostWrongNote: 'D4',
    mostTimedOutNote: timeout ? 'E4' : '暂无',
    weakestNote: 'D4',
    averageReactionMs: 420,
    fastestReactionMs: 120,
    slowestReactionMs: 780,
    wrongNoteCounts: [{ noteName: 'C4', count: 0 }, { noteName: 'D4', count: 1 }],
    timeoutNoteCounts: [{ noteName: 'C4', count: 0 }, { noteName: 'E4', count: timeout }],
    staffMode: 'grand',
    noteCount: 1,
    keySignature: 'C',
    keyName: 'C 大调',
    notePoolMode: 'diatonic',
    answerTimeLimitSeconds: 5,
    treble: { total: completedQuestions, correct, wrong, timeout, accuracy: Math.round(correct / completedQuestions * 100) },
    bass: { total: 0, correct: 0, wrong: 0, timeout: 0, accuracy: 0 },
    completionState,
    partialEvidence: stopped,
    ...changes
  }
}

function durableRecord(id, completionState = 'completed', options = {}) {
  const settings = options.settings ?? androidSettings({ questionCount: 10 })
  return createDurableSightReadingReport(options.report ?? sampleReport(completionState), {
    recordId: id,
    startedAt: options.startedAt ?? 1000,
    endedAt: options.endedAt ?? 2500,
    settings
  })
}

function fakeTime() {
  let now = 1000
  let sequence = 0
  const jobs = new Map()
  return {
    now: () => now,
    schedule(callback, delayMs) {
      const id = ++sequence
      jobs.set(id, { callback, at: now + delayMs })
      return id
    },
    cancel(id) { jobs.delete(id) },
    advance(ms) { now += ms }
  }
}

const tests = []
const test = (name, callback) => tests.push({ name, callback })

test('P01 no stored settings loads Android defaults', async () => {
  const persistence = await initializeAndroidPersistence(new FakePreferencesBackend())
  assert.equal(persistence.settingsLoad.success, true)
  assert.equal(persistence.settingsLoad.source, 'default')
  assert.deepEqual(persistence.settingsLoad.settings, ANDROID_SIGHT_READING_DEFAULTS)
})

test('P02 valid settings save/load round trip', async () => {
  const backend = new FakePreferencesBackend()
  const first = await initializeAndroidPersistence(backend)
  const expected = androidSettings({ staffMode: 'bass', keySignature: 'Cb', notePoolMode: 'chromatic', questionCount: 10, noteNameVisible: true })
  assert.deepEqual(await first.settings.save(expected), { success: true })
  const second = await initializeAndroidPersistence(backend)
  assert.deepEqual(second.settingsLoad.settings, expected)
})

test('P03 all supported staff modes persist', async () => {
  for (const staffMode of ['treble', 'bass', 'grand']) {
    const backend = new FakePreferencesBackend()
    const first = await initializeAndroidPersistence(backend)
    assert.equal((await first.settings.save(androidSettings({ staffMode }))).success, true)
    assert.equal((await initializeAndroidPersistence(backend)).settingsLoad.settings.staffMode, staffMode)
  }
})

test('P04 all 15 major keys survive persistence', async () => {
  assert.equal(MAJOR_KEY_IDS.length, 15)
  for (const keySignature of MAJOR_KEY_IDS) {
    const backend = new FakePreferencesBackend()
    const first = await initializeAndroidPersistence(backend)
    assert.equal((await first.settings.save(androidSettings({ keySignature }))).success, true)
    assert.equal((await initializeAndroidPersistence(backend)).settingsLoad.settings.keySignature, keySignature)
  }
})

test('P05 diatonic/chromatic survives persistence', async () => {
  for (const notePoolMode of ['diatonic', 'chromatic']) {
    const backend = new FakePreferencesBackend()
    const first = await initializeAndroidPersistence(backend)
    await first.settings.save(androidSettings({ notePoolMode }))
    assert.equal((await initializeAndroidPersistence(backend)).settingsLoad.settings.notePoolMode, notePoolMode)
  }
})

test('P06 10/20/50/100 survives persistence', async () => {
  for (const questionCount of [10, 20, 50, 100]) {
    const backend = new FakePreferencesBackend()
    const first = await initializeAndroidPersistence(backend)
    await first.settings.save(androidSettings({ questionCount }))
    assert.equal((await initializeAndroidPersistence(backend)).settingsLoad.settings.questionCount, questionCount)
  }
})

test('P07 noteNameVisible On/Off survives persistence', async () => {
  for (const noteNameVisible of [true, false]) {
    const backend = new FakePreferencesBackend()
    const first = await initializeAndroidPersistence(backend)
    await first.settings.save(androidSettings({ noteNameVisible }))
    assert.equal((await initializeAndroidPersistence(backend)).settingsLoad.settings.noteNameVisible, noteNameVisible)
  }
})

test('P08 malformed settings safely recover with explicit error', async () => {
  const backend = new FakePreferencesBackend()
  backend.rawSet(ANDROID_PERSISTENCE_KEYS.sightReadingSettings, '{not json')
  const persistence = await initializeAndroidPersistence(backend)
  assert.equal(persistence.settingsLoad.success, false)
  assert.deepEqual(persistence.settingsLoad.settings, ANDROID_SIGHT_READING_DEFAULTS)
  assert.match(persistence.settingsLoad.error, /Unable to load|malformed/)
})

test('P09 unknown settings schema does not crash or rewrite data', async () => {
  const backend = new FakePreferencesBackend()
  const future = JSON.stringify({ schemaVersion: 99, staffMode: 'bass' })
  backend.rawSet(ANDROID_PERSISTENCE_KEYS.sightReadingSettings, future)
  const persistence = await initializeAndroidPersistence(backend)
  assert.equal(persistence.settingsLoad.success, false)
  assert.deepEqual(persistence.settingsLoad.settings, ANDROID_SIGHT_READING_DEFAULTS)
  assert.equal(backend.values.get(ANDROID_PERSISTENCE_KEYS.sightReadingSettings), future)
  assert.equal((await persistence.settings.save(androidSettings({ staffMode: 'bass' }))).success, false)
  assert.equal(backend.values.get(ANDROID_PERSISTENCE_KEYS.sightReadingSettings), future)

  const futureRoot = new FakePreferencesBackend()
  futureRoot.rawSet(ANDROID_PERSISTENCE_KEYS.schemaVersion, '99')
  const rootResult = await initializeAndroidPersistence(futureRoot)
  assert.equal(rootResult.schemaError !== null, true)
  assert.equal(futureRoot.operations.some(([operation]) => operation === 'set'), false)
  assert.equal(futureRoot.values.get(ANDROID_PERSISTENCE_KEYS.schemaVersion), '99')
})

test('P10 completed report save/load round trip', async () => {
  const backend = new FakePreferencesBackend()
  const first = await initializeAndroidPersistence(backend)
  const record = durableRecord('completed-1')
  assert.equal((await first.reports.save(record)).success, true)
  const second = await initializeAndroidPersistence(backend)
  assert.deepEqual(second.reportLoad.records, [record])
})

test('P11 stopped partial report save/load round trip', async () => {
  const backend = new FakePreferencesBackend()
  const first = await initializeAndroidPersistence(backend)
  const record = durableRecord('stopped-1', 'stopped')
  await first.reports.save(record)
  const loaded = (await initializeAndroidPersistence(backend)).reportLoad.records[0]
  assert.deepEqual([loaded.completionState, loaded.partialEvidence, loaded.completed], ['stopped', true, 2])
})

test('P12 nullable reaction metrics remain null', async () => {
  const report = sampleReport('completed', {
    correct: 0, wrong: 0, timeout: 10, accuracy: 0,
    averageReactionMs: null, fastestReactionMs: null, slowestReactionMs: null,
    treble: { total: 10, correct: 0, wrong: 0, timeout: 10, accuracy: 0 }
  })
  const backend = new FakePreferencesBackend()
  const first = await initializeAndroidPersistence(backend)
  await first.reports.save(durableRecord('null-reactions', 'completed', { report }))
  const loaded = (await initializeAndroidPersistence(backend)).reportLoad.records[0]
  assert.deepEqual([loaded.averageReactionMs, loaded.fastestReactionMs, loaded.slowestReactionMs], [null, null, null])
})

test('P13 target-note error aggregates survive exactly', async () => {
  const backend = new FakePreferencesBackend()
  const first = await initializeAndroidPersistence(backend)
  const record = durableRecord('errors-exact')
  await first.reports.save(record)
  const loaded = (await initializeAndroidPersistence(backend)).reportLoad.records[0]
  assert.deepEqual(loaded.targetNoteErrors, record.targetNoteErrors)
})

test('P14 settings snapshot survives exactly', async () => {
  const settings = androidSettings({ staffMode: 'bass', keySignature: 'Cb', notePoolMode: 'chromatic', questionCount: 10, noteNameVisible: true })
  const record = durableRecord('settings-snapshot', 'completed', { settings })
  const backend = new FakePreferencesBackend()
  const first = await initializeAndroidPersistence(backend)
  await first.reports.save(record)
  assert.deepEqual((await initializeAndroidPersistence(backend)).reportLoad.records[0].settings, record.settings)
})

test('P15 injected ID generator creates unique stable record IDs', () => {
  let sequence = 0
  const idGenerator = () => `record-${++sequence}`
  const first = durableRecord(idGenerator())
  const second = durableRecord(idGenerator(), 'stopped')
  assert.notEqual(first.recordId, second.recordId)
  assert.equal(first.recordId, 'record-1')
})

test('P16 duplicate save is idempotent with no duplicate index entry', async () => {
  const backend = new FakePreferencesBackend()
  const persistence = await initializeAndroidPersistence(backend)
  const record = durableRecord('same-logical-record')
  await persistence.reports.save(record)
  await persistence.reports.save(record)
  const recreated = await initializeAndroidPersistence(backend)
  assert.equal(recreated.reportLoad.records.length, 1)
  const index = JSON.parse(backend.values.get(ANDROID_PERSISTENCE_KEYS.sightReadingReportIndex))
  assert.deepEqual(index.recordIds, ['same-logical-record'])
})

test('P17 failed report write does not create a false index entry', async () => {
  const backend = new FakePreferencesBackend()
  const persistence = await initializeAndroidPersistence(backend)
  const record = durableRecord('report-write-fails')
  backend.failNextSet(`${ANDROID_PERSISTENCE_KEYS.sightReadingReportPrefix}${record.recordId}`)
  const result = await persistence.reports.save(record)
  assert.equal(result.success, false)
  const index = JSON.parse(backend.values.get(ANDROID_PERSISTENCE_KEYS.sightReadingReportIndex))
  assert.equal(index.recordIds.includes(record.recordId), false)
})

test('P18 report success plus index failure reconciles orphan safely', async () => {
  const backend = new FakePreferencesBackend()
  const first = await initializeAndroidPersistence(backend)
  const record = durableRecord('orphan-recovered')
  backend.failNextSet(ANDROID_PERSISTENCE_KEYS.sightReadingReportIndex)
  const failed = await first.reports.save(record)
  assert.equal(failed.success, false)
  assert.equal(backend.values.has(`${ANDROID_PERSISTENCE_KEYS.sightReadingReportPrefix}${record.recordId}`), true)
  const second = await initializeAndroidPersistence(backend)
  assert.equal(second.reportLoad.success, true)
  assert.deepEqual(second.reportLoad.diagnostics.recoveredOrphanIds, [record.recordId])
  assert.equal(second.reportLoad.records.length, 1)
})

test('P19 stale index entry is reconciled', async () => {
  const backend = new FakePreferencesBackend()
  await initializeAndroidPersistence(backend)
  backend.rawSet(ANDROID_PERSISTENCE_KEYS.sightReadingReportIndex, JSON.stringify({ schemaVersion: 1, recordIds: ['missing'] }))
  const persistence = await initializeAndroidPersistence(backend)
  assert.deepEqual(persistence.reportLoad.diagnostics.removedStaleIds, ['missing'])
  assert.deepEqual(JSON.parse(backend.values.get(ANDROID_PERSISTENCE_KEYS.sightReadingReportIndex)).recordIds, [])
})

test('P20 one malformed report does not block valid records', async () => {
  const backend = new FakePreferencesBackend()
  const first = await initializeAndroidPersistence(backend)
  const valid = durableRecord('valid-record')
  await first.reports.save(valid)
  const badKey = `${ANDROID_PERSISTENCE_KEYS.sightReadingReportPrefix}bad-record`
  backend.rawSet(badKey, '{bad json')
  backend.rawSet(ANDROID_PERSISTENCE_KEYS.sightReadingReportIndex, JSON.stringify({ schemaVersion: 1, recordIds: ['valid-record', 'bad-record'] }))
  const second = await initializeAndroidPersistence(backend)
  assert.deepEqual(second.reportLoad.records.map((record) => record.recordId), ['valid-record'])
  assert.deepEqual(second.reportLoad.diagnostics.invalidRecordKeys, [badKey])
})

test('P21 async write failures remain explicit at repository and runtime boundaries', async () => {
  const backend = new FakePreferencesBackend()
  const persistence = await initializeAndroidPersistence(backend)
  backend.failNextSet(ANDROID_PERSISTENCE_KEYS.sightReadingSettings)
  assert.equal((await persistence.settings.save(androidSettings({ staffMode: 'bass' }))).success, false)

  const time = fakeTime()
  const runtime = new AndroidSightReadingRuntime({
    clock: time, scheduler: time, random: () => 0.2,
    initialSettings: persistence.settingsLoad.settings,
    settingsRepository: persistence.settings,
    reportRepository: persistence.reports,
    wallClock: { now: () => 10000 + time.now() },
    idGenerator: () => 'runtime-report-failure'
  })
  backend.failNextSet(ANDROID_PERSISTENCE_KEYS.sightReadingSettings)
  const settingsFailure = await runtime.updateSettings({ staffMode: 'bass' })
  assert.equal(settingsFailure.success, false)
  assert.equal(runtime.settings.staffMode, 'bass')
  assert.equal(runtime.persistenceSnapshot.settingsStatus, 'error')
  backend.failNextSet(`${ANDROID_PERSISTENCE_KEYS.sightReadingReportPrefix}runtime-report-failure`)
  runtime.start()
  runtime.stop()
  await runtime.flushPersistence()
  assert.equal(runtime.snapshot.report.completionState, 'stopped')
  assert.equal(runtime.persistenceSnapshot.reportStatus, 'error')
  assert.equal(runtime.persistenceSnapshot.pendingReportCount, 1)
  assert.equal((await runtime.retryReportPersistence()).success, true)
  assert.equal(runtime.persistenceSnapshot.pendingReportCount, 0)
  assert.equal(runtime.persistenceSnapshot.reportStatus, 'saved')
})

test('P22 repository recreation reads previously stored data', async () => {
  const values = new Map()
  const first = await initializeAndroidPersistence(new FakePreferencesBackend(values))
  await first.settings.save(androidSettings({ keySignature: 'Gb' }))
  await first.reports.save(durableRecord('recreated'))
  const second = await initializeAndroidPersistence(new FakePreferencesBackend(values))
  assert.equal(second.settingsLoad.settings.keySignature, 'Gb')
  assert.equal(second.reportLoad.records[0].recordId, 'recreated')
})

test('P23 recreating the application runtime does not erase Preferences data', async () => {
  const backend = new FakePreferencesBackend()
  const firstPersistence = await initializeAndroidPersistence(backend)
  const firstTime = fakeTime()
  const firstRuntime = new AndroidSightReadingRuntime({
    clock: firstTime, scheduler: firstTime, random: () => 0.2,
    initialSettings: firstPersistence.settingsLoad.settings,
    settingsRepository: firstPersistence.settings,
    reportRepository: firstPersistence.reports,
    idGenerator: () => 'runtime-one'
  })
  await firstRuntime.updateSettings({ staffMode: 'bass', keySignature: 'Cb', questionCount: 10, noteNameVisible: true })
  await firstRuntime.flushPersistence()
  await firstRuntime.dispose()

  const secondPersistence = await initializeAndroidPersistence(backend)
  const secondTime = fakeTime()
  const secondRuntime = new AndroidSightReadingRuntime({
    clock: secondTime, scheduler: secondTime, random: () => 0.2,
    initialSettings: secondPersistence.settingsLoad.settings,
    settingsRepository: secondPersistence.settings,
    reportRepository: secondPersistence.reports,
    idGenerator: () => 'runtime-two'
  })
  assert.deepEqual(secondRuntime.settings, androidSettings({ staffMode: 'bass', keySignature: 'Cb', questionCount: 10, noteNameVisible: true }))
})

test('P24 live-session state is never persisted', async () => {
  const backend = new FakePreferencesBackend()
  const persistence = await initializeAndroidPersistence(backend)
  const before = [...backend.values.keys()].sort()
  const time = fakeTime()
  const runtime = new AndroidSightReadingRuntime({
    clock: time, scheduler: time, random: () => 0.2,
    initialSettings: persistence.settingsLoad.settings,
    settingsRepository: persistence.settings,
    reportRepository: persistence.reports,
    idGenerator: () => 'unused-live-id'
  })
  runtime.start()
  time.advance(2500)
  await runtime.flushPersistence()
  assert.deepEqual([...backend.values.keys()].sort(), before)
  assert.equal([...backend.values.keys()].some((key) => /session|question|timer|streak/i.test(key)), false)
})

test('P25 MIDI connection/device state is never persisted', async () => {
  const backend = new FakePreferencesBackend()
  await initializeAndroidPersistence(backend)
  const keys = [...backend.values.keys()]
  assert.equal(keys.some((key) => /midi|bluetooth|device|connection|fp-30x|\.port(?:\.|$)/i.test(key)), false)
  assert.ok(keys.every((key) => key.startsWith('piano.v1.')))
})

test('P26 shared src/sightReading remains platform-neutral', () => {
  const root = path.resolve(__dirname, '..')
  const sources = fs.readdirSync(path.join(root, 'src', 'sightReading'))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => fs.readFileSync(path.join(root, 'src', 'sightReading', file), 'utf8'))
    .join('\n')
  assert.doesNotMatch(sources, /@capacitor|Preferences|localStorage/)
})

test('N01 production adapter uses Capacitor Preferences backed by Android SharedPreferences', () => {
  const root = path.resolve(__dirname, '..')
  const adapter = fs.readFileSync(path.join(root, 'prototype', 'android-tablet-v1', 'src', 'androidPersistence.ts'), 'utf8')
  const nativePlugin = fs.readFileSync(path.join(root, 'node_modules', '@capacitor', 'preferences', 'android', 'src', 'main', 'java', 'com', 'capacitorjs', 'plugins', 'preferences', 'Preferences.java'), 'utf8')
  const capacitorSettings = fs.readFileSync(path.join(root, 'android', 'capacitor.settings.gradle'), 'utf8')
  const capacitorBuild = fs.readFileSync(path.join(root, 'android', 'app', 'capacitor.build.gradle'), 'utf8')
  assert.match(adapter, /@capacitor\/preferences/)
  assert.match(adapter, /Preferences\.get/)
  assert.doesNotMatch(adapter, /localStorage/)
  assert.match(nativePlugin, /SharedPreferences/)
  assert.match(capacitorSettings, /include ':capacitor-preferences'/)
  assert.match(capacitorBuild, /implementation project\(':capacitor-preferences'\)/)
})

async function run() {
  let failed = 0
  for (const { name, callback } of tests) {
    try {
      await callback()
      process.stdout.write(`PASS ${name}\n`)
    } catch (error) {
      failed += 1
      process.stderr.write(`FAIL ${name}\n${error.stack || error}\n`)
    }
  }
  process.stdout.write(`\n${tests.length - failed}/${tests.length} Android persistence checks PASS\n`)
  process.exitCode = failed ? 1 : 0
}

void run()
