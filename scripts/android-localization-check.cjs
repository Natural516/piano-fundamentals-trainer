const { normalizeB46Main, assertFrozenDiff, assertRendererDisplayOnly, stripB46Css } = require('./android-localization-remaining-contract.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: filename
  }).outputText, filename)
}
const React = require('react')
const { create, act } = require('react-test-renderer')
const { renderToStaticMarkup } = require('react-dom/server')
const root = path.resolve(__dirname, '..')
const loc = '../prototype/android-tablet-v1/src/localization/'
const { resolveSystemLocale, resolveLocale } = require(loc + 'locale.ts')
const { AppPreferencesRepository, APP_PREFERENCES_KEY } = require(loc + 'appPreferences.ts')
const { LocalizationService, createLocalizationInstance, applyDocumentLocale } = require(loc + 'localizationService.ts')
const { localizationResources } = require(loc + 'resources.ts')
const { LocaleProvider } = require(loc + 'LocaleProvider.tsx')
const { LanguageSetting } = require(loc + 'LanguageSetting.tsx')
const { useTranslation } = require('react-i18next')
const tests = []
const test = (id, name, check) => tests.push({ id, name, check })
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

class MemoryBackend {
  values = new Map()
  writes = []
  failRead = false
  failWrite = false
  async get({ key }) {
    if (this.failRead) throw new Error('RAW_NATIVE_PREFERENCES_SECRET')
    return { value: this.values.get(key) ?? null }
  }
  async set({ key, value }) {
    if (this.failWrite) throw new Error('RAW_NATIVE_PREFERENCES_SECRET')
    this.writes.push({ key, value })
    this.values.set(key, value)
  }
  async keys() { return { keys: [...this.values.keys()] } }
}
const seed = (backend, preference, extra = {}) => backend.values.set(APP_PREFERENCES_KEY, JSON.stringify({ schemaVersion: 1, languagePreference: preference, ...extra }))
const serviceFor = (backend = new MemoryBackend(), languages = () => ['zh-CN']) => new LocalizationService(new AppPreferencesRepository(backend), languages)

test('LOC01', 'all confirmed Chinese language tags resolve to Simplified Chinese fallback', () => {
  for (const tag of ['zh', 'zh-CN', 'zh-SG', 'zh-Hans', 'zh-Hans-CN', 'zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-TW', 'ZH-cn']) assert.equal(resolveSystemLocale(tag), 'zh-CN')
})
test('LOC02', 'non-Chinese and priority lists use only the primary language', () => {
  for (const tag of ['en-US', 'en-GB', 'ja-JP', 'fr-FR']) assert.equal(resolveSystemLocale(tag), 'en')
  assert.equal(resolveSystemLocale(['en-US', 'zh-CN']), 'en')
  assert.equal(resolveSystemLocale(['zh-TW', 'en-US']), 'zh-CN')
})
test('LOC03', 'malformed or unavailable system locale safely falls back to English', () => {
  for (const tag of [undefined, null, '', '???', 'zh_CN', 'zh--CN', {}, 5, [], [undefined, 'zh-CN']]) assert.equal(resolveSystemLocale(tag), 'en')
  assert.equal(serviceFor(undefined, () => { throw new Error('UNAVAILABLE') }).getSnapshot().resolvedLocale, 'en')
})
test('LOC04', 'manual preferences override system locale', () => {
  assert.equal(resolveLocale('system', 'zh-TW'), 'zh-CN')
  assert.equal(resolveLocale('system', 'en-US'), 'en')
  assert.equal(resolveLocale('zh-CN', 'en-US'), 'zh-CN')
  assert.equal(resolveLocale('en', 'zh-CN'), 'en')
})
test('LOC05', 'missing preference defaults to system without writing', async () => {
  const backend = new MemoryBackend()
  assert.deepEqual(await new AppPreferencesRepository(backend).load(), { preference: 'system', error: null, writable: true })
  assert.equal(backend.writes.length, 0)
})
test('LOC06', 'invalid enum, wrong shape and parse failure use a controlled default', async () => {
  const backend = new MemoryBackend()
  for (const raw of ['{', 'null', '[]', '5', '{"schemaVersion":1,"languagePreference":"fr"}', '{"schemaVersion":0,"languagePreference":"en"}']) {
    backend.values.set(APP_PREFERENCES_KEY, raw)
    assert.deepEqual(await new AppPreferencesRepository(backend).load(), { preference: 'system', error: 'invalidDocument', writable: true })
    assert.equal(backend.values.get(APP_PREFERENCES_KEY), raw)
  }
  assert.equal(backend.writes.length, 0)
})
test('LOC07', 'future schema is preserved and cannot be overwritten', async () => {
  const backend = new MemoryBackend()
  const raw = '{"schemaVersion":2,"languagePreference":"en","futureField":"preserve"}'
  backend.values.set(APP_PREFERENCES_KEY, raw)
  const service = serviceFor(backend)
  await service.initialize()
  await service.changeLanguagePreference('en')
  assert.equal(service.getSnapshot().preference, 'system')
  assert.equal(service.getSnapshot().error, 'futureSchema')
  assert.equal(service.getSnapshot().writable, false)
  assert.equal(await new AppPreferencesRepository(backend).save('en'), 'futureSchema')
  assert.equal(backend.values.get(APP_PREFERENCES_KEY), raw)
  assert.equal(backend.writes.length, 0)
})
test('LOC08', 'system, Chinese and English persist only preference and reload correctly', async () => {
  const backend = new MemoryBackend()
  for (const preference of ['system', 'zh-CN', 'en']) {
    const service = serviceFor(backend)
    await service.initialize()
    await service.changeLanguagePreference(preference)
    assert.deepEqual(JSON.parse(backend.values.get(APP_PREFERENCES_KEY)), { schemaVersion: 1, languagePreference: preference })
    const reloaded = serviceFor(backend)
    await reloaded.initialize()
    assert.equal(reloaded.getSnapshot().preference, preference)
  }
})
test('LOC09', 'app preference writes preserve other V1 fields and never touch practice/history/theme keys', async () => {
  const backend = new MemoryBackend()
  seed(backend, 'system', { anotherAppPreference: 7 })
  const keys = ['piano.v1.sightReading.settings', 'piano.v1.chord.settings', 'piano.v1.interval-practice.settings', 'piano.v1.sightReading.report.old', 'piano.v1.interval.report.old', 'theme.active']
  for (const key of keys) backend.values.set(key, 'UNCHANGED-' + key)
  const before = new Map(backend.values)
  const service = serviceFor(backend)
  await service.initialize()
  await service.changeLanguagePreference('en')
  for (const key of keys) assert.equal(backend.values.get(key), before.get(key))
  assert.equal(JSON.parse(backend.values.get(APP_PREFERENCES_KEY)).anotherAppPreference, 7)
  assert.deepEqual(backend.writes.map(({ key }) => key), [APP_PREFERENCES_KEY])
})
test('LOC10', 'read failure defaults safely without raw exception presentation', async () => {
  const backend = new MemoryBackend()
  backend.failRead = true
  const service = serviceFor(backend)
  await service.initialize()
  assert.equal(service.getSnapshot().ready, true)
  assert.equal(service.getSnapshot().error, 'readFailed')
  assert.equal(service.getSnapshot().preference, 'system')
  assert.doesNotMatch(JSON.stringify(service.getSnapshot()), /RAW_NATIVE/)
})
test('LOC11', 'write failure rolls back the choice and keeps existing bytes unchanged', async () => {
  const backend = new MemoryBackend()
  seed(backend, 'en')
  const before = backend.values.get(APP_PREFERENCES_KEY)
  const service = serviceFor(backend)
  await service.initialize()
  backend.failWrite = true
  await service.changeLanguagePreference('zh-CN')
  assert.equal(service.getSnapshot().preference, 'en')
  assert.equal(service.getSnapshot().resolvedLocale, 'en')
  assert.equal(service.getSnapshot().error, 'writeFailed')
  assert.equal(service.i18n.language, 'en')
  assert.equal(backend.values.get(APP_PREFERENCES_KEY), before)
  assert.doesNotMatch(JSON.stringify(service.getSnapshot()), /RAW_NATIVE/)
})
test('LOC12', 'live zh-CN to en to zh-CN updates the same service and i18next instance', async () => {
  const service = serviceFor()
  const instance = service.i18n
  await service.initialize()
  await service.changeLanguagePreference('en')
  assert.equal(service.i18n.t('title', { ns: 'settings' }), 'Settings')
  await service.changeLanguagePreference('zh-CN')
  assert.equal(service.i18n.t('title', { ns: 'settings' }), '设置')
  assert.equal(service.i18n, instance)
})
test('LOC13', 'foreground/system refresh updates system preference, never overrides manual choice or writes', async () => {
  let languages = ['zh-TW']
  const backend = new MemoryBackend()
  const service = serviceFor(backend, () => languages)
  await service.initialize()
  languages = ['en-US']
  service.refreshSystemLocale()
  assert.equal(service.getSnapshot().resolvedLocale, 'en')
  assert.equal(backend.writes.length, 0)
  await service.changeLanguagePreference('zh-CN')
  service.refreshSystemLocale()
  assert.equal(service.getSnapshot().resolvedLocale, 'zh-CN')
  await service.changeLanguagePreference('en')
  languages = ['zh-CN']
  service.refreshSystemLocale()
  assert.equal(service.getSnapshot().resolvedLocale, 'en')
  await service.changeLanguagePreference('system')
  assert.equal(service.getSnapshot().resolvedLocale, 'zh-CN')
})
test('LOC14', 'document language and title track both locales without development suffix', () => {
  const document = { documentElement: { lang: '' }, title: '' }
  const instance = createLocalizationInstance('en')
  for (const [locale, title] of [['en', 'Piano Fundamentals Trainer'], ['zh-CN', '钢琴基本功训练器']]) {
    applyDocumentLocale(document, locale, instance)
    assert.equal(document.documentElement.lang, locale)
    assert.equal(document.title, title)
    assert.doesNotMatch(document.title, /Prototype/)
  }
  assert.doesNotMatch(read('prototype/android-tablet-v1/index.html'), /Prototype/)
})
function flatten(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => typeof child === 'string' ? [[prefix + key, child]] : flatten(child, prefix + key + '.'))
}
test('LOC15', 'all migrated resource namespaces have identical nonempty key shapes', () => {
  const zh = flatten(localizationResources['zh-CN'])
  const en = flatten(localizationResources.en)
  // CLDR Chinese uses the unsuffixed count key; English requires one/other variants.
  const keys = (entries) => [...new Set(entries.map(([key]) => key.replace(/_(one|other)$/, '')))].sort()
  assert.deepEqual(keys(zh), keys(en))
  assert.deepEqual(Object.keys(localizationResources.en.midi).filter(key => key.startsWith('devicesFound')), ['devicesFound_one', 'devicesFound_other'])
  assert.equal(localizationResources['zh-CN'].midi.devicesFound, '{{count}} 个候选')
  assert.equal(zh.length, 150 + 58 + 121 + 19 + 112 + 107 + 148 + 148 - 3) // B6 removes only the three translated language-option keys.
  for (const locale of ['zh-CN', 'en']) for (const key of ['system', 'chinese', 'english']) assert.equal(Object.hasOwn(localizationResources[locale].settings, key), false)
  assert.equal(en.length, zh.length + 30) // Existing plural differences plus five Chord English plurals.
  for (const [, value] of [...zh, ...en]) assert.ok(value.trim())
  for (const [key] of en) {
    const [ns, ...parts] = key.split('.')
    assert.equal(createLocalizationInstance('en').exists(parts.join('.'), { ns, lng: 'en', fallbackLng: false }), true)
  }
})
test('LOC16', 'named interpolation parameters match in Chinese and English', () => {
  const en = new Map(flatten(localizationResources.en))
  const placeholders = (value) => [...value.matchAll(/{{\s*([^},\s]+).*?}}/g)].map((match) => match[1]).sort()
  for (const [key, value] of flatten(localizationResources['zh-CN'])) {
    const variants = en.has(key) ? [key] : [key + '_one', key + '_other']
    for (const variant of variants) { assert.ok(en.has(variant), variant); assert.deepEqual(placeholders(value), placeholders(en.get(variant)), variant) }
  }
  assert.deepEqual(placeholders(localizationResources.en.settings.currentLanguage), ['language'])
})
test('LOC17', 'offline initialization uses safe missing-key fallback and React text interpolation', () => {
  const instance = createLocalizationInstance('en')
  assert.equal(instance.isInitialized, true)
  assert.equal(instance.t('not.a.real.key'), '—')
  assert.equal(instance.options.react.useSuspense, false)
  assert.deepEqual(instance.options.supportedLngs.filter((v) => v !== 'cimode'), ['zh-CN', 'en'])
  assert.equal(instance.modules.backend, undefined)
  const unsafe = '<img src=x onerror=alert(1)>'
  const html = renderToStaticMarkup(React.createElement('span', null, instance.t('currentLanguage', { ns: 'settings', language: unsafe })))
  assert.match(html, /&lt;img/)
  assert.doesNotMatch(html, /<img/)
})
test('LOC18', 'initialization is idempotent; queued writes cannot persist an older choice last', async () => {
  const backend = new MemoryBackend()
  const service = serviceFor(backend)
  assert.equal(service.initialize(), service.initialize())
  await Promise.all([service.changeLanguagePreference('en'), service.changeLanguagePreference('zh-CN'), service.changeLanguagePreference('en')])
  assert.equal(service.getSnapshot().preference, 'en')
  assert.equal(JSON.parse(backend.values.get(APP_PREFERENCES_KEY)).languagePreference, 'en')
  assert.equal(service.getSnapshot().saving, false)
})
test('LOC19', 'future schema appearing after load is protected at write time', async () => {
  const backend = new MemoryBackend()
  const service = serviceFor(backend)
  await service.initialize()
  const future = '{"schemaVersion":99,"languagePreference":"unknown"}'
  backend.values.set(APP_PREFERENCES_KEY, future)
  await service.changeLanguagePreference('en')
  assert.equal(backend.values.get(APP_PREFERENCES_KEY), future)
  assert.equal(service.getSnapshot().error, 'futureSchema')
  assert.equal(service.getSnapshot().writable, false)
})

function fakeEvents() {
  const handlers = new Map()
  return {
    addEventListener(name, handler) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(handler) },
    removeEventListener(name, handler) { handlers.get(name)?.delete(handler) },
    fire(name) { for (const handler of handlers.get(name) ?? []) handler() },
    count() { return [...handlers.values()].reduce((sum, set) => sum + set.size, 0) }
  }
}
test('LOC20', 'real React provider/settings switch live without remounting runtime ownership children', async () => {
  const oldWindow = global.window
  const oldDocument = global.document
  global.window = fakeEvents()
  global.document = { ...fakeEvents(), documentElement: { lang: '' }, title: '', visibilityState: 'visible' }
  let mounts = 0
  let unmounts = 0
  let latestIdentity
  const identities = []
  const backend = new MemoryBackend()
  let languages = ['zh-CN']
  const service = serviceFor(backend, () => languages)
  function OwnershipProbe() {
    const [identity] = React.useState(() => ({ midi: {}, session: {}, generation: 4, epoch: 8, question: 1, paused: true, keepAwakeOwner: {} }))
    latestIdentity = identity
    identities.push(identity)
    React.useEffect(() => { mounts++; return () => { unmounts++ } }, [])
    const { t } = useTranslation('settings')
    return React.createElement('div', null, React.createElement('h1', null, t('title')), React.createElement(LanguageSetting))
  }
  let renderer
  const treeText = () => JSON.stringify(renderer.toJSON())
  try {
    await act(async () => { renderer = create(React.createElement(LocaleProvider, { service }, React.createElement(OwnershipProbe))); await service.initialize() })
    assert.match(treeText(), /设置/)
    const identity = latestIdentity
    const options = () => renderer.root.findAllByType('option').map((node) => ({ value: node.props.value, label: node.children.join('') }))
    const expectedOptions = [{ value: 'zh-CN', label: '中文' }, { value: 'en', label: 'English' }]
    assert.deepEqual(options(), expectedOptions)
    assert.equal(renderer.root.findByType('select').props.value, 'zh-CN')
    await act(async () => { renderer.root.findByType('select').props.onChange({ target: { value: 'en' } }); await service.changeLanguagePreference('en') })
    assert.match(treeText(), /Settings/)
    assert.match(treeText(), /Language/)
    assert.deepEqual(options(), expectedOptions)
    assert.doesNotMatch(treeText(), /Follow system|Simplified Chinese/)
    assert.equal(global.document.documentElement.lang, 'en')
    assert.equal(global.document.title, 'Piano Fundamentals Trainer')
    backend.failWrite = true
    await act(async () => { await service.changeLanguagePreference('zh-CN') })
    assert.equal(renderer.root.findByType('select').props.value, 'en')
    assert.match(treeText(), /not saved/)
    assert.doesNotMatch(treeText(), /RAW_NATIVE_PREFERENCES_SECRET/)
    backend.failWrite = false
    await act(async () => { await service.changeLanguagePreference('zh-CN') })
    assert.deepEqual(options(), expectedOptions)
    assert.equal(global.document.documentElement.lang, 'zh-CN')
    assert.equal(global.document.title, '钢琴基本功训练器')
    await act(async () => { await service.changeLanguagePreference('system') })
    const writes = backend.writes.length
    languages = ['en-US']
    await act(async () => { global.window.fire('languagechange'); global.document.fire('visibilitychange') })
    assert.equal(global.document.documentElement.lang, 'en')
    assert.equal(backend.writes.length, writes)
    assert.equal(latestIdentity, identity)
    assert.ok(identities.every((value) => value === identity))
    assert.equal(mounts, 1)
    assert.equal(unmounts, 0)
    assert.equal(identity.paused, true)
    assert.equal(identity.question, 1)
    await act(async () => { renderer.unmount() })
    assert.equal(global.window.count(), 0)
    assert.equal(global.document.count(), 0)
  } finally {
    if (renderer) await act(async () => { renderer.unmount() })
    global.window = oldWindow
    global.document = oldDocument
  }
})
test('LOC21', 'MIDI/session/bootstrap stay frozen; only explicit B3 compatibility boundaries may change', () => {
  const base = '5c24110604e16b098c665757a05d06e16c813498'
  const mainPath = 'prototype/android-tablet-v1/src/main.tsx'
  const main = normalizeB46Main(read(mainPath))
  const old = execFileSync('git', ['show', base + ':' + mainPath], { cwd: root, encoding: 'utf8' })
  const normalize = (source) => source.replaceAll('\r\n', '\n')
  const slice = (source, start, end) => {
    const text = normalize(source)
    const from = text.indexOf(start)
    const to = text.indexOf(end, from)
    assert.ok(from >= 0 && to > from, `missing source boundary ${start} / ${end}`)
    return text.slice(from, to)
  }
  assert.equal(normalize(slice(main, 'function App(', 'function AndroidAppBootstrap')), normalize(slice(old, 'function App(', 'function AndroidAppBootstrap')))
  assert.equal(normalize(slice(main, 'function AndroidAppBootstrap', '\nconst localizationService')), normalize(slice(old, 'function AndroidAppBootstrap', '\ncreateRoot')))
  for (const file of ['prototype/android-tablet-v1/src/androidBluetoothMidi.ts', 'prototype/android-tablet-v1/src/androidBluetoothMidiCore.ts', 'prototype/android-tablet-v1/src/activePracticeSession.ts', 'prototype/android-tablet-v1/src/practiceKeepAwake.ts']) {
    assert.equal(normalize(read(file)), normalize(execFileSync('git', ['show', base + ':' + file], { cwd: root, encoding: 'utf8' })), file)
  }
  // Preserve the complete Sight implementations outside the two exact legacy-boundary substitutions.
  for (const file of ['src/sightReading/sightReadingNotes.ts', 'prototype/android-tablet-v1/src/sightReadingIntegration.ts']) {
    const current = normalize(read(file))
      .replace(/^import \{ (?:LEGACY_SIGHT_EMPTY_NOTE_SENTINEL|resolveLegacySightNoteSnapshot) \} from '[^']+legacyNoteSnapshot'\n/m, '')
      .replace('return LEGACY_SIGHT_EMPTY_NOTE_SENTINEL', "return '暂无'")
      .replace('return resolveLegacySightNoteSnapshot(report.weakestNote)', "return report.weakestNote === '暂无' ? null : report.weakestNote")
    assert.equal(current, normalize(execFileSync('git', ['show', base + ':' + file], { cwd: root, encoding: 'utf8' })), file)
  }
  // The B3 suite separately verifies canonical report bytes and candidate facts against the checkpoint.
  assert.match(main, /<LocaleProvider service=\{localizationService\}>\s*<AndroidAppBootstrap \/>/)
  assert.doesNotMatch(main, /<App key=|<AndroidAppBootstrap key=/)
})
test('LOC22', 'new localization scope has no practice/native language manipulation or unsafe UI output', () => {
  const files = fs.readdirSync(path.join(root, 'prototype/android-tablet-v1/src/localization')).filter((file) => /\.tsx?$/.test(file))
  const source = files.map((file) => read('prototype/android-tablet-v1/src/localization/' + file)).join('\n')
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|window\.location|location\.reload|window\.reload|resumeFrom|\.resume\(|\.pause\(|new AndroidSightReadingRuntime|new MidiInputProvider|setApplicationLocales/)
  assert.doesNotMatch(source, /FP-30X|Roland|Yamaha|Kawai/)
  assert.match(source, /\[service\]/)
  assert.match(source, /addListener\('appStateChange'/)
  assert.match(read('prototype/android-tablet-v1/src/main.tsx'), /title=\{t\('title'\)\}/)
  const packageJson = JSON.parse(read('package.json'))
  for (const forbidden of ['i18next-browser-languagedetector', 'i18next-http-backend']) assert.equal(packageJson.dependencies[forbidden], undefined)
})
test('LOC23', 'native foreground listener is stable across language switches and removed on unmount', async () => {
  const { Capacitor } = require('@capacitor/core')
  const Module = require('node:module')
  const previousNative = Capacitor.isNativePlatform
  const previousWindow = global.window
  const previousDocument = global.document
  global.window = fakeEvents()
  global.document = { ...fakeEvents(), documentElement: { lang: '' }, title: '', visibilityState: 'visible' }
  let registrations = 0
  let removals = 0
  let callback
  let languages = ['zh-CN']
  Capacitor.isNativePlatform = () => true
  const addListener = async (name, handler) => {
    assert.equal(name, 'appStateChange')
    registrations++
    callback = handler
    return { remove: async () => { removals++ } }
  }
  // Capacitor's App is a proxy; inject a native bridge fixture at the module boundary, not by assigning its proxy method.
  const providerPath = require.resolve(loc + 'LocaleProvider.tsx')
  const previousProvider = require.cache[providerPath]
  const previousLoad = Module._load
  let NativeFixtureProvider
  try {
    Module._load = function (request, ...args) {
      return request === '@capacitor/app' ? { App: { addListener } } : previousLoad.call(this, request, ...args)
    }
    delete require.cache[providerPath]
    NativeFixtureProvider = require(providerPath).LocaleProvider
  } finally {
    Module._load = previousLoad
    require.cache[providerPath] = previousProvider
  }
  const backend = new MemoryBackend()
  const service = serviceFor(backend, () => languages)
  let renderer
  try {
    await act(async () => { renderer = create(React.createElement(NativeFixtureProvider, { service }, React.createElement('span', null, 'stable child'))); await service.initialize() })
    const handler = callback
    await act(async () => { await service.changeLanguagePreference('en'); await service.changeLanguagePreference('system') })
    assert.equal(registrations, 1)
    assert.equal(callback, handler)
    assert.equal(removals, 0)
    const writes = backend.writes.length
    languages = ['en-US']
    await act(async () => { callback({ isActive: false }) })
    assert.equal(service.getSnapshot().resolvedLocale, 'zh-CN')
    await act(async () => { callback({ isActive: true }) })
    assert.equal(service.getSnapshot().resolvedLocale, 'en')
    assert.equal(backend.writes.length, writes)
    await act(async () => { renderer.unmount() })
    assert.equal(removals, 1)
  } finally {
    if (renderer) await act(async () => { renderer.unmount() })
    Capacitor.isNativePlatform = previousNative
    global.window = previousWindow
    global.document = previousDocument
  }
})

;(async () => {
  let passed = 0
  for (const { id, name, check } of tests) {
    try { await check(); passed++; process.stdout.write(`PASS ${id} ${name}\n`) }
    catch (error) { process.stderr.write(`FAIL ${id} ${name}\n${error.stack}\n`) }
  }
  process.stdout.write(`\n${passed}/${tests.length} Android localization infrastructure checks PASS\n`)
  if (passed !== tests.length) process.exitCode = 1
})()
