const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const Module = require('node:module')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const base = '4b3477ddde39c4a698c8108b02127f23dc5e3df8'
const compile = (source, filename) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: filename
}).outputText
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(compile(fs.readFileSync(filename, 'utf8'), filename), filename)
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')
const baseline = (file) => execFileSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n')
const loc = '../prototype/android-tablet-v1/src/localization/'
const { createLocalizationInstance, LocalizationService } = require(loc + 'localizationService.ts')
const { AppPreferencesRepository, APP_PREFERENCES_KEY } = require(loc + 'appPreferences.ts')
const { localizationResources } = require(loc + 'resources.ts')
const { getIntervalDisplayName, getSightNoteDisplayValue } = require(loc + 'legacyPresentation.ts')
const { IntervalDisplayName, SightNoteValue } = require(loc + 'LegacyDisplayValues.tsx')
const { LocaleProvider } = require(loc + 'LocaleProvider.tsx')
const React = require('react')
const { create, act } = require('react-test-renderer')
const theory = require('../prototype/android-tablet-v1/src/musicTheory/intervals/index.ts')
const query = require('../prototype/android-tablet-v1/src/intervalQueryTool.ts')
const practice = require('../prototype/android-tablet-v1/src/intervalPractice/index.ts')
const { getCanonicalIntervalSnapshotName } = require('../prototype/android-tablet-v1/src/intervalPractice/legacySnapshot.ts')
const { IntervalPracticeSettingsRepository, INTERVAL_PRACTICE_SETTINGS_STORAGE_KEY } = require('../prototype/android-tablet-v1/src/intervalPractice/settings.ts')
const persistence = require('../prototype/android-tablet-v1/src/androidPersistenceCore.ts')
const { createSightReadingSessionReport } = require('../src/sightReading/report.ts')
const { createSightReadingSessionCounters } = require('../src/sightReading/sightReadingSession.ts')
const { ANDROID_SIGHT_READING_DEFAULTS } = require('../src/sightReading/sightReadingSettings.ts')
const { resolveLegacySightNoteSnapshot, LEGACY_SIGHT_EMPTY_NOTE_SENTINEL } = require('../src/sightReading/legacyNoteSnapshot.ts')
const { getPrimaryErrorNote } = require('../prototype/android-tablet-v1/src/sightReadingIntegration.ts')
const tests = []
const test = (id, name, check) => tests.push({ id, name, check })
class MemoryBackend {
  values = new Map()
  writes = []
  async get({ key }) { return { value: this.values.get(key) ?? null } }
  async set({ key, value }) { this.writes.push(key); this.values.set(key, value) }
  async keys() { return { keys: [...this.values.keys()] } }
}
const clone = (v) => JSON.parse(JSON.stringify(v))
const display = (locale) => {
  const instance = createLocalizationInstance(locale)
  return { interval: (id) => getIntervalDisplayName(id, (key) => instance.t(key, { ns: 'music' })), sight: (value) => getSightNoteDisplayValue(value, (key) => instance.t(key, { ns: 'common' })) }
}
const serviceFor = (backend) => new LocalizationService(new AppPreferencesRepository(backend), () => ['zh-CN'])
const candidates = Object.values(theory.INTERVAL_PRACTICE_CANDIDATES).flat()
function attempt(intervalId = 'majorThird', index = 0) {
  const q = theory.INTERVAL_PRACTICE_CANDIDATES[intervalId][0]
  return { questionId: `q-${index}`, intervalId, root: q.root, target: q.target, rootMidi: q.rootMidi, targetMidi: q.targetMidi, wrongAttemptCount: 1, firstTryCorrect: false, completed: true }
}
function draft(attempts = [attempt()], settings = practice.DEFAULT_INTERVAL_PRACTICE_SETTINGS, api = practice) {
  return api.buildIntervalPracticeReport({ status: 'STOPPED', transportReady: true, settings, practiceState: null, question: null, questionCount: settings.questionCount, completedQuestions: attempts.length, attempts, currentWrongAttemptCount: 0, judgement: null }, { startedAtEpochMs: 100, finishedAtEpochMs: 200, completionStatus: 'STOPPED' })
}
function intervalRecord() { return practice.createIntervalPracticeReport('interval-report-1', draft()) }
function sightSession() { return createSightReadingSessionReport(ANDROID_SIGHT_READING_DEFAULTS, createSightReadingSessionCounters([]), [], 'stopped') }
function sightRecord() { return persistence.createDurableSightReadingReport(sightSession(), { recordId: 'sight-legacy', startedAt: 100, endedAt: 200, settings: ANDROID_SIGHT_READING_DEFAULTS }) }
function seedInterval(backend) {
  const record = clone(intervalRecord())
  record.settings.practiceMode = 'reproduction' // Real V1 wide-read compatibility, never reserialized.
  record.legacyExtra = 'preserve exact bytes'
  backend.values.set(practice.INTERVAL_REPORT_STORAGE_KEYS.reportPrefix + record.recordId, JSON.stringify(record, null, 2) + '\n')
  backend.values.set(practice.INTERVAL_REPORT_STORAGE_KEYS.reportIndex, JSON.stringify({ schemaVersion: 1, nextSequence: 2, recordIds: [record.recordId] }, null, 2))
  backend.values.set(INTERVAL_PRACTICE_SETTINGS_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, practiceMode: 'construction', answerHint: false, questionCount: 20 }))
  return record
}
function seedSight(backend) {
  const record = sightRecord()
  const keys = persistence.ANDROID_PERSISTENCE_KEYS
  backend.values.set(keys.schemaVersion, '1')
  backend.values.set(keys.sightReadingReportPrefix + record.recordId, JSON.stringify(record, null, 2) + '\n')
  backend.values.set(keys.sightReadingReportIndex, JSON.stringify({ schemaVersion: 1, recordIds: [record.recordId] }, null, 2))
  backend.values.set(keys.sightReadingSettings, JSON.stringify(record.settings))
  return record
}
const businessValues = (backend) => [...backend.values].filter(([key]) => key !== APP_PREFERENCES_KEY).sort(([a], [b]) => a.localeCompare(b))
function fakeEvents() {
  const handlers = new Map()
  return {
    addEventListener(name, handler) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(handler) },
    removeEventListener(name, handler) { handlers.get(name)?.delete(handler) }
  }
}
async function switchBothWays(backend) {
  const service = serviceFor(backend)
  await service.initialize()
  for (const locale of ['en', 'zh-CN']) await service.changeLanguagePreference(locale)
  return service
}
test('I1', 'old V1 majorThird plus canonical Chinese snapshot remains legal', () => {
  assert.equal(getCanonicalIntervalSnapshotName('majorThird'), '大三度')
  assert.equal(practice.isIntervalPracticeReportV1(intervalRecord()), true)
})
test('I2', 'wrong Chinese, English snapshot and unknown identity remain illegal even with English active', () => {
  assert.equal(createLocalizationInstance('en').language, 'en')
  for (const changes of [{ intervalName: '小三度' }, { intervalName: 'Major third' }, { intervalId: 'invalid' }]) {
    const record = clone(intervalRecord())
    Object.assign(record.perIntervalStats[0], changes)
    assert.equal(practice.isIntervalPracticeReportV1(record), false)
  }
})
test('I3', 'real English preference and V1 repository writer still save canonical Chinese', async () => {
  const backend = new MemoryBackend()
  const service = serviceFor(backend)
  await service.initialize()
  await service.changeLanguagePreference('en')
  const result = await new practice.IntervalReportRepository(backend).saveForSession('english-session', draft())
  assert.equal(result.success, true)
  assert.equal(result.record.perIntervalStats[0].intervalName, '大三度')
  const raw = backend.values.get(practice.INTERVAL_REPORT_STORAGE_KEYS.reportPrefix + result.record.recordId)
  assert.match(raw, /"intervalName":"大三度"/)
  assert.doesNotMatch(raw, /Major third/)
  assert.equal(result.record.schemaVersion, 1)
})
test('I4', 'English display is derived solely from intervalId', () => assert.equal(display('en').interval('majorThird'), 'Major third'))
test('I5', 'Chinese display uses separate locale resources', () => assert.equal(display('zh-CN').interval('majorThird'), '大三度'))
test('I6', 'actual old repository reads and live React locale switches never mutate durable bytes or remount', async () => {
  const backend = new MemoryBackend()
  seedInterval(backend)
  seedSight(backend)
  backend.values.set('piano.v1.chord.settings', '{"fixture":"unchanged"}')
  backend.values.set('theme.active', 'unchanged-theme-id')
  const before = businessValues(backend)
  const repo = new practice.IntervalReportRepository(backend)
  const result = await repo.initialize()
  assert.equal(result.success, true)
  assert.equal(result.records.length, 1)
  assert.equal(backend.writes.length, 0)
  const service = serviceFor(backend)
  let mounts = 0
  let unmounts = 0
  function Facts() {
    React.useEffect(() => { mounts++; return () => { unmounts++ } }, [])
    return React.createElement('strong', null, React.createElement(IntervalDisplayName, { intervalId: result.records[0].perIntervalStats[0].intervalId }), ' / ', React.createElement(SightNoteValue, { value: '暂无' }))
  }
  let renderer
  const previousWindow = global.window
  const previousDocument = global.document
  global.window = fakeEvents()
  global.document = { ...fakeEvents(), documentElement: { lang: '' }, title: '', visibilityState: 'visible' }
  try {
    await act(async () => { renderer = create(React.createElement(LocaleProvider, { service }, React.createElement(Facts))); await service.initialize() })
    assert.match(JSON.stringify(renderer.toJSON()), /大三度/)
    await act(async () => { await service.changeLanguagePreference('en') })
    assert.match(JSON.stringify(renderer.toJSON()), /Major third/)
    assert.match(JSON.stringify(renderer.toJSON()), /No data/)
    assert.deepEqual(businessValues(backend), before)
    await act(async () => { await service.changeLanguagePreference('zh-CN') })
    assert.match(JSON.stringify(renderer.toJSON()), /大三度/)
    assert.match(JSON.stringify(renderer.toJSON()), /暂无/)
    assert.deepEqual(businessValues(backend), before)
    assert.equal(repo.list().length, 1)
    assert.deepEqual(repo.list()[0], result.records[0])
    assert.deepEqual(backend.writes, [APP_PREFERENCES_KEY, APP_PREFERENCES_KEY])
    assert.equal(mounts, 1)
    assert.equal(unmounts, 0)
  } finally {
    if (renderer) await act(async () => { renderer.unmount() })
    global.window = previousWindow
    global.document = previousDocument
  }
})
test('I7', 'current settings changes do not affect historical interval identity, statistics or saved snapshots', async () => {
  const backend = new MemoryBackend()
  seedInterval(backend)
  const reports = new practice.IntervalReportRepository(backend)
  await reports.initialize()
  const stored = backend.values.get(practice.INTERVAL_REPORT_STORAGE_KEYS.reportPrefix + 'interval-report-1')
  const historical = JSON.stringify(reports.list())
  const settings = new IntervalPracticeSettingsRepository(backend)
  await settings.save({ ...practice.DEFAULT_INTERVAL_PRACTICE_SETTINGS, answerHint: true, includeAccidentalRoots: true, questionCount: 'endless' })
  assert.equal((await settings.load()).questionCount, 'endless')
  assert.equal(JSON.stringify(reports.list()), historical)
  assert.equal(backend.values.get(practice.INTERVAL_REPORT_STORAGE_KEYS.reportPrefix + 'interval-report-1'), stored)
  assert.equal(display('en').interval(reports.list()[0].perIntervalStats[0].intervalId), 'Major third')
  assert.deepEqual(backend.writes, [INTERVAL_PRACTICE_SETTINGS_STORAGE_KEY])
})
test('C1', 'candidate validation does not depend on catalog Chinese name equality', () => {
  const q = theory.INTERVAL_PRACTICE_CANDIDATES.majorThird[0]
  for (const chineseName of ['Major third', 'different presentation', '']) assert.deepEqual(theory.validateIntervalPracticeQuestion({ ...q, intervalType: { ...q.intervalType, chineseName } }), [])
  assert.doesNotMatch(read('prototype/android-tablet-v1/src/musicTheory/intervals/candidates.ts'), /queryResult\.intervalName|intervalType\.chineseName/)
})
test('C2', 'changed Query display/quality strings leave every candidate theoretical identity unchanged', () => {
  const original = query.getIntervalQueryResult
  try {
    query.getIntervalQueryResult = (...args) => ({ ...original(...args), intervalName: 'localized name', displayName: 'localized display', quality: 'localized quality' })
    for (const q of candidates) assert.deepEqual(theory.validateIntervalPracticeQuestion(q), [])
    const renamed = theory.getLegalIntervalCandidates({ ...theory.getIntervalType('majorThird'), chineseName: 'Major third' })
    const facts = (values) => values.map(({ intervalType, ...rest }) => ({ intervalId: intervalType.id, degree: intervalType.degree, semitones: intervalType.semitones, ...rest }))
    assert.deepEqual(facts(renamed), facts(theory.INTERVAL_PRACTICE_CANDIDATES.majorThird))
  } finally { query.getIntervalQueryResult = original }
})
test('C3', 'all 1575 ordered candidates including spelling and metadata exactly match the frozen checkpoint digest', () => {
  assert.equal(candidates.length, 1575)
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(candidates)).digest('hex'), 'c643be252f5ea57519490033662008b4716bd1f98df0266d3357e3be171f460e')
})
test('C4', '26 stable catalog IDs, definitions and generation probabilities remain unchanged', () => {
  assert.equal(theory.INTERVAL_TYPE_IDS.length, 26)
  for (const file of ['catalog.ts', 'types.ts', 'spelling.ts']) {
    const filePath = 'prototype/android-tablet-v1/src/musicTheory/intervals/' + file
    assert.equal(read(filePath), baseline(filePath))
  }
  for (const file of ['scheduler.ts', 'state.ts']) {
    const filePath = 'prototype/android-tablet-v1/src/intervalPractice/' + file
    assert.equal(read(filePath), baseline(filePath))
  }
  assert.equal(new Set(theory.INTERVAL_TYPES.map(({ degree, semitones }) => `${degree}/${semitones}`)).size, 26)
})
test('C5', 'all range, direction, catalog degree/semitone and actual spelling checks retain rejection power', () => {
  for (const q of candidates) {
    assert.deepEqual(theory.validateIntervalPracticeQuestion(q), [])
    assert.ok(q.rootMidi >= 29 && q.targetMidi <= 91 && q.targetMidi >= q.rootMidi && q.targetMidi - q.rootMidi <= 12)
    assert.equal(query.getIntervalNumber(q.root, q.target), q.intervalType.degree)
    assert.equal(query.getIntervalPitchSemitone(q.root), q.rootMidi)
    assert.equal(query.getIntervalPitchSemitone(q.target), q.targetMidi)
  }
  const q = theory.INTERVAL_PRACTICE_CANDIDATES.majorThird[0]
  for (const changed of [
    { ...q, intervalType: { ...q.intervalType, id: 'minorThird' } },
    { ...q, intervalType: { ...q.intervalType, degree: 2 } },
    { ...q, intervalType: { ...q.intervalType, semitones: 3 } },
    { ...q, root: { ...q.root, octave: q.root.octave + 1 } },
    { ...q, root: q.target, target: q.root, rootMidi: q.targetMidi, targetMidi: q.rootMidi }
  ]) assert.ok(theory.validateIntervalPracticeQuestion(changed).length > 0)
  const original = query.getIntervalQueryResult
  try {
    for (const changes of [{ direction: 'descending' }, { intervalNumber: 2 }, { semitoneDistance: 3 }]) {
      query.getIntervalQueryResult = (...args) => ({ ...original(...args), ...changes })
      assert.ok(theory.validateIntervalPracticeQuestion(q).includes('Interval Query identity mismatch'))
    }
  } finally { query.getIntervalQueryResult = original }
})
test('C6', 'enharmonic augmented fourth / diminished fifth remain distinct despite identical sounding pitches', () => {
  const find = (id) => theory.INTERVAL_PRACTICE_CANDIDATES[id].find((q) => q.root.letter === 'C' && q.root.accidental === 0 && q.root.octave === 4)
  const fourth = find('augmentedFourth')
  const fifth = find('diminishedFifth')
  assert.equal(fourth.targetMidi, fifth.targetMidi)
  assert.notEqual(fourth.target.letter, fifth.target.letter)
  assert.notEqual(fourth.intervalType.degree, fifth.intervalType.degree)
  assert.deepEqual(theory.validateIntervalPracticeQuestion(fourth), [])
  assert.deepEqual(theory.validateIntervalPracticeQuestion(fifth), [])
  assert.ok(theory.validateIntervalPracticeQuestion({ ...fourth, target: fifth.target }).length > 0)
  assert.notEqual(display('en').interval(fourth.intervalType.id), display('en').interval(fifth.intervalType.id))
})
test('S1', 'only exact legacy Chinese sentinel maps to semantic null', () => {
  assert.equal(LEGACY_SIGHT_EMPTY_NOTE_SENTINEL, '暂无')
  assert.equal(resolveLegacySightNoteSnapshot('暂无'), null)
  assert.equal(getPrimaryErrorNote(sightSession()), null)
  assert.equal(resolveLegacySightNoteSnapshot(null), null)
})
test('S2', 'Chinese empty-note presentation stays canonical-looking without controlling business decisions', () => {
  assert.equal(display('zh-CN').sight('暂无'), '暂无')
  assert.equal(display('zh-CN').sight(null), '暂无')
})
test('S3', 'English empty-note presentation is No data without Chinese resource fallback', () => {
  assert.equal(display('en').sight('暂无'), 'No data')
  assert.equal(display('en').sight(null), 'No data')
  assert.equal(createLocalizationInstance('en').exists('noData', { ns: 'common', lng: 'en', fallbackLng: false }), true)
})
test('S4', 'real Sight V1 repository load and locale changes preserve report/index/settings bytes and timestamps', async () => {
  const backend = new MemoryBackend()
  seedSight(backend)
  const before = businessValues(backend)
  const store = new persistence.AndroidPersistenceStore(backend)
  await store.ensureSchema()
  const repo = new persistence.SightReadingReportRepository(store)
  const result = await repo.initialize()
  assert.equal(result.success, true)
  assert.equal(result.diagnostics.indexRebuilt, false)
  assert.equal(repo.list().length, 1)
  assert.equal(backend.writes.length, 0)
  const history = JSON.stringify(repo.list())
  await switchBothWays(backend)
  assert.equal(JSON.stringify(repo.list()), history)
  assert.deepEqual(businessValues(backend), before)
  assert.deepEqual(backend.writes, [APP_PREFERENCES_KEY, APP_PREFERENCES_KEY])
})
test('S5', 'English locale never changes the real session and durable V1 empty-note writers', async () => {
  const backend = new MemoryBackend()
  const service = serviceFor(backend)
  await service.initialize()
  await service.changeLanguagePreference('en')
  const session = sightSession()
  const record = sightRecord()
  for (const value of [session, record]) for (const key of ['mostWrongNote', 'mostTimedOutNote', 'weakestNote']) assert.equal(value[key], '暂无')
  assert.equal(record.schemaVersion, 1)
  const store = new persistence.AndroidPersistenceStore(backend)
  await store.ensureSchema()
  const result = await new persistence.SightReadingReportRepository(store).save(record)
  assert.equal(result.success, true)
  assert.match(backend.values.get(persistence.ANDROID_PERSISTENCE_KEYS.sightReadingReportPrefix + record.recordId), /"weakestNote":"暂无"/)
})
test('S6', 'real written note names preserve octave and accidentals in both locales', () => {
  for (const locale of ['zh-CN', 'en']) for (const note of ['C4', 'F♯3', 'B♭2']) {
    assert.equal(resolveLegacySightNoteSnapshot(note), note)
    assert.equal(display(locale).sight(note), note)
    assert.equal(getPrimaryErrorNote({ ...sightSession(), weakestNote: note }), note)
  }
})
test('S7', 'unknown old legal text is neither translated nor normalized in display or repository reads', async () => {
  for (const note of ['None', 'No data', 'N/A', '旧版合法音名', '', ' 暂无 ']) {
    for (const locale of ['zh-CN', 'en']) assert.equal(display(locale).sight(note), note)
    const backend = new MemoryBackend()
    const record = seedSight(backend)
    record.weakestNote = note
    const key = persistence.ANDROID_PERSISTENCE_KEYS.sightReadingReportPrefix + record.recordId
    const raw = JSON.stringify(record, null, 2)
    backend.values.set(key, raw)
    const store = new persistence.AndroidPersistenceStore(backend)
    await store.ensureSchema()
    const result = await new persistence.SightReadingReportRepository(store).initialize()
    assert.equal(result.success, true)
    assert.equal(result.records[0].weakestNote, note)
    assert.equal(backend.values.get(key), raw)
    assert.equal(backend.writes.length, 0)
  }
})
test('B3R1', 'all 26 resource IDs have exact approved English names and matching placeholder-free Chinese keys', () => {
  const names = ['Perfect unison', 'Augmented unison', 'Diminished second', 'Minor second', 'Major second', 'Augmented second', 'Diminished third', 'Minor third', 'Major third', 'Augmented third', 'Diminished fourth', 'Perfect fourth', 'Augmented fourth', 'Diminished fifth', 'Perfect fifth', 'Augmented fifth', 'Diminished sixth', 'Minor sixth', 'Major sixth', 'Augmented sixth', 'Diminished seventh', 'Minor seventh', 'Major seventh', 'Augmented seventh', 'Diminished octave', 'Perfect octave']
  for (const locale of ['zh-CN', 'en']) assert.deepEqual(Object.keys(localizationResources[locale].music.intervals), [...theory.INTERVAL_TYPE_IDS])
  theory.INTERVAL_TYPE_IDS.forEach((id, index) => {
    assert.equal(display('en').interval(id), names[index])
    assert.equal(display('zh-CN').interval(id), getCanonicalIntervalSnapshotName(id))
    for (const locale of ['zh-CN', 'en']) assert.doesNotMatch(localizationResources[locale].music.intervals[id], /{{|}}/)
    assert.equal(createLocalizationInstance('en').exists(`intervals.${id}`, { ns: 'music', lng: 'en', fallbackLng: false }), true)
  })
})
test('B3R2', 'canonical writer bytes and numerical report facts equal the actual B2 writer for every interval', () => {
  const file = 'prototype/android-tablet-v1/src/intervalPractice/report.ts'
  // Compile the historical source in memory, keeping original relative imports. No source file is written.
  const filename = path.join(root, file)
  const old = new Module(filename, module)
  old.filename = filename
  old.paths = Module._nodeModulePaths(path.dirname(filename))
  old._compile(compile(baseline(file), filename), filename)
  const attempts = theory.INTERVAL_TYPE_IDS.map(attempt)
  const settings = { ...practice.DEFAULT_INTERVAL_PRACTICE_SETTINGS, questionCount: 'endless' }
  const current = draft(attempts, settings)
  const historical = draft(attempts, settings, old.exports)
  assert.equal(JSON.stringify(current), JSON.stringify(historical))
  assert.equal(JSON.stringify(practice.createIntervalPracticeReport('interval-report-1', current)), JSON.stringify(old.exports.createIntervalPracticeReport('interval-report-1', historical)))
})
test('B3R3', 'pure compatibility/domain/persistence helpers have no translator, React or DOM dependency', () => {
  for (const file of ['prototype/android-tablet-v1/src/intervalPractice/legacySnapshot.ts', 'prototype/android-tablet-v1/src/intervalPractice/report.ts', 'prototype/android-tablet-v1/src/musicTheory/intervals/candidates.ts', 'src/sightReading/legacyNoteSnapshot.ts', 'prototype/android-tablet-v1/src/androidPersistenceCore.ts']) {
    assert.doesNotMatch(read(file), /from ['"][^'"]*(?:i18next|react|localization)|LocaleProvider|\bdocument\.(?:querySelector|documentElement|title|createElement|getElementById)|\bwindow\.|globalThis\.document/)
  }
  assert.doesNotMatch(read('prototype/android-tablet-v1/src/localization/legacyPresentation.ts'), /from ['"](?:react|i18next|react-i18next)|\.changeLanguage|\.save\(/)
})
test('B3R4', 'only authorized UI display points change; Query output and protected schema/runtime sources stay frozen', () => {
  const file = 'prototype/android-tablet-v1/src/main.tsx'
  const main = read(file)
  assert.equal((main.match(/<IntervalDisplayName intervalId=\{entry.intervalId\} \/>/g) ?? []).length, 2)
  assert.equal((main.match(/<SightNoteValue value=\{primaryError\} \/>/g) ?? []).length, 2)
  assert.doesNotMatch(main, /entry\.intervalName/)
  // Explicit B4.1/B4.2A/B4.2B presentation only; B3 display points and App/runtime stay frozen.
  const allowed = ['MidiStatusButton', 'ProductHeader', 'BottomNavigation', 'ProductFrame', 'ExternalThemeCard', 'SettingsScreen', 'MidiScreen', 'OrientationNotice', 'HomeScreen', 'PracticeHubScreen', 'ToolsHubScreen', 'ChordQueryToolScreen', 'ScaleKeySignatureToolScreen', 'IntervalQueryToolScreen', 'IntervalPitchSelector']
  const maskB41 = (source) => {
    source = source.replace(/^import \{ getSettingsThemeDisplayName, presentLocalizedMidiStatus \} from '\.\/localization\/midiPresentation'\n/m, '')
    source = source.replace(/^import \{ presentHomeRecentPractice \} from '\.\/localization\/homePresentation'\n/m, '')
    source = source.replace(/^import \{ presentChordTypeOption, presentIntervalName, presentIntervalQuery, presentQueryAccidental \} from '\.\/localization\/theoryQueryPresentation'\n/m, '')
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const nodes = ast.statements.filter(node => ts.isFunctionDeclaration(node) && allowed.includes(node.name?.text))
    assert.deepEqual(nodes.map(node => node.name.text).sort(), [...allowed].sort())
    for (const node of nodes.reverse()) source = source.slice(0, node.getStart(ast)) + `/* B4.1 presentation: ${node.name.text} */` + source.slice(node.end)
    return source
  }
  const checkpointUI = execFileSync('git', ['show', 'ae51b91a8135c54ec5fa05bfbd076c7affd30ac5:' + file], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n')
  assert.equal(maskB41(main), maskB41(checkpointUI))
  for (const file of ['prototype/android-tablet-v1/src/intervalQueryTool.ts', 'prototype/android-tablet-v1/src/intervalPractice/persistence.ts', 'prototype/android-tablet-v1/src/intervalPractice/settings.ts', 'prototype/android-tablet-v1/src/androidPersistenceCore.ts', 'prototype/android-tablet-v1/src/historyProjection.ts', 'src/sightReading/report.ts', 'src/sightReading/sightReadingSession.ts', 'src/sightReading/sightReadingSettings.ts', 'prototype/android-tablet-v1/src/localization/appPreferences.ts', 'prototype/android-tablet-v1/src/localization/locale.ts', 'prototype/android-tablet-v1/src/localization/LocaleProvider.tsx', 'prototype/android-tablet-v1/src/localization/LanguageSetting.tsx']) assert.equal(read(file), baseline(file), file)
  const candidatePath = 'prototype/android-tablet-v1/src/musicTheory/intervals/candidates.ts'
  const outsideGuard = (source) => source.replace('getIntervalNumber, getIntervalPitchSemitone, getIntervalQueryResult', 'getIntervalNumber, getIntervalQueryResult').replace(/export function validateIntervalPracticeQuestion[\s\S]*?(?=export function getLegalIntervalCandidates)/, '')
  assert.equal(outsideGuard(read(candidatePath)), outsideGuard(baseline(candidatePath)))
})
;(async () => {
  let passed = 0
  for (const { id, name, check } of tests) {
    try { await check(); passed++; process.stdout.write(`PASS ${id} ${name}\n`) }
    catch (error) { process.stderr.write(`FAIL ${id} ${name}\n${error.stack}\n`) }
  }
  process.stdout.write(`\n${passed}/${tests.length} B3 compatibility boundary checks PASS\n`)
  if (passed !== tests.length) process.exitCode = 1
})()
