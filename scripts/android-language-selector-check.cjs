const assert = require('node:assert/strict')
const ts = require('typescript')
const React = require('react')
const { create, act } = require('react-test-renderer')
const { renderToStaticMarkup } = require('react-dom/server')
// Reuse the existing real Settings/runtime harness; it does not run its suite on import.
const { mounted, businessBytes, text } = require('./android-localization-shell-check.cjs')
const guard = require('./android-language-selector-contract.cjs')
const loc = '../prototype/android-tablet-v1/src/localization/'
const { LanguageSetting, LANGUAGE_OPTIONS } = require(loc + 'LanguageSetting.tsx')
const { LocaleProvider } = require(loc + 'LocaleProvider.tsx')
const { LocalizationService } = require(loc + 'localizationService.ts')
const { AppPreferencesRepository, APP_PREFERENCES_KEY } = require(loc + 'appPreferences.ts')
const { localizationResources } = require(loc + 'resources.ts')
const expected = [{ value: 'zh-CN', label: '中文' }, { value: 'en', label: 'English' }]
const select = h => h.renderer.root.findByProps({ id: 'app-language-preference' })
const options = h => select(h).findAllByType('option').map(node => ({ value: node.props.value, label: node.children.join('') }))
// Serialize actual mounted host nodes, not client hooks or a reconstructed mock selector.
function hostElement(node) {
  if (typeof node === 'string' || typeof node === 'number') return node
  assert.equal(typeof node.type, 'string', 'only already-rendered HTML nodes are serialized')
  return React.createElement(node.type, node.props, ...node.children.map(hostElement))
}
async function choose(h, value) {
  await act(async () => { select(h).props.onChange({ target: { value } }); await new Promise(resolve => setImmediate(resolve)) })
}
function events() {
  const handlers = new Map()
  return {
    addEventListener(name, fn) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(fn) },
    removeEventListener(name, fn) { handlers.get(name)?.delete(fn) }
  }
}
class MemoryBackend {
  values = new Map()
  writes = []
  failRead = false
  failWrite = false
  async get({ key }) { if (this.failRead) throw new Error('RAW_PRIVATE_ERROR'); return { value: this.values.get(key) ?? null } }
  async set({ key, value }) {
    if (this.failWrite) throw new Error('RAW_PRIVATE_ERROR')
    this.values.set(key, value); this.writes.push({ key, value })
  }
}
async function selectorSession(run, { raw = null, languages = ['zh-CN'], failRead = false } = {}) {
  const oldWindow = global.window, oldDocument = global.document
  global.window = events()
  global.document = { ...events(), documentElement: { lang: '' }, title: '', visibilityState: 'visible' }
  const backend = new MemoryBackend()
  if (raw !== null) backend.values.set(APP_PREFERENCES_KEY, raw)
  backend.failRead = failRead
  let system = languages
  const service = new LocalizationService(new AppPreferencesRepository(backend), () => system)
  let renderer
  try {
    await act(async () => { renderer = create(React.createElement(LocaleProvider, { service }, React.createElement(LanguageSetting))); await service.initialize() })
    await run({ renderer, backend, service, setSystem: value => { system = value } })
  } finally {
    if (renderer) await act(async () => { renderer.unmount() })
    global.window = oldWindow; global.document = oldDocument
  }
}
const tests = [], test = (id, description, run) => tests.push({ id, description, run })

test('LANGUAGE-SELECTOR-1', 'actual normal Settings has exactly two real, non-hidden options', () => mounted('settings', async h => {
  assert.equal(select(h).findAllByType('option').length, 2)
  for (const node of select(h).findAllByType('option')) {
    assert.notEqual(node.props.hidden, true); assert.notEqual(node.props['aria-hidden'], true)
    assert.equal(node.props.style, undefined); assert.notEqual(node.props.disabled, true)
  }
}))
test('LANGUAGE-SELECTOR-2', 'stable choice IDs are exactly zh-CN / en', () => mounted('settings', async h => {
  assert.deepEqual(options(h).map(x => x.value), ['zh-CN', 'en'])
  assert.deepEqual(LANGUAGE_OPTIONS.map(x => x.id), ['zh-CN', 'en'])
}))
test('LANGUAGE-SELECTOR-3', 'fixed autonyms are exact literals, not translator or resource expressions', () => {
  assert.deepEqual(LANGUAGE_OPTIONS.map(x => x.label), ['中文', 'English'])
  guard.assertB6PresentationOnly()
  const ast = ts.createSourceFile(guard.selectorPath, guard.read(guard.selectorPath), 99, true, ts.ScriptKind.TSX)
  const declaration = ast.statements.flatMap(n => ts.isVariableStatement(n) ? [...n.declarationList.declarations] : []).find(n => n.name.getText(ast) === 'LANGUAGE_OPTIONS')
  assert.ok(declaration && ts.isAsExpression(declaration.initializer))
  const array = declaration.initializer.expression
  assert.ok(ts.isArrayLiteralExpression(array))
  assert.equal(array.elements.length, 2)
  for (const entry of array.elements) {
    assert.ok(ts.isObjectLiteralExpression(entry)); assert.equal(entry.properties.length, 2)
    for (const field of entry.properties) assert.ok(ts.isPropertyAssignment(field) && ts.isStringLiteral(field.initializer))
  }
})
test('LANGUAGE-SELECTOR-4', 'Chinese Settings uses 中文 / English and a localized language title', () => mounted('settings', async h => {
  assert.equal(h.service.getSnapshot().resolvedLocale, 'zh-CN')
  assert.deepEqual(options(h), expected)
  assert.equal(h.renderer.root.findByProps({ htmlFor: 'app-language-preference' }).findByType('strong').children.join(''), '语言')
}))
test('LANGUAGE-SELECTOR-5', 'English Settings retains the same autonyms and localizes only the title', () => mounted('settings', async h => {
  await choose(h, 'en')
  assert.equal(h.service.getSnapshot().resolvedLocale, 'en')
  assert.deepEqual(options(h), expected)
  assert.equal(h.renderer.root.findByProps({ htmlFor: 'app-language-preference' }).findByType('strong').children.join(''), 'Language')
  assert.ok(text(h.renderer.root.findByProps({ role: 'status' })).includes('English'))
}))
test('LANGUAGE-SELECTOR-6', 'no System third choice exists and invalid/legacy event values cannot be selected', () => mounted('settings', async h => {
  const before = h.service.getSnapshot(), writes = [...h.backend.writes]
  for (const value of ['system', 'auto', 'fr', 'zh-TW', '', '<unsafe>']) await choose(h, value)
  assert.deepEqual(options(h), expected)
  assert.equal(h.service.getSnapshot(), before)
  assert.deepEqual(h.backend.writes, writes)
}))
test('LANGUAGE-SELECTOR-7', 'legacy system reads safely and selects resolved language without rewriting raw bytes', async () => {
  for (const [languages, resolved] of [[['zh-TW'], 'zh-CN'], [['en-US'], 'en']]) {
    const raw = ' { "schemaVersion": 1, "languagePreference": "system", "other": 7 }\n'
    await selectorSession(async h => {
      assert.deepEqual(await new AppPreferencesRepository(h.backend).load(), { preference: 'system', error: null, writable: true })
      assert.equal(h.service.getSnapshot().preference, 'system')
      assert.equal(select(h).props.value, resolved)
      assert.deepEqual(options(h), expected)
      assert.equal(h.backend.values.get(APP_PREFERENCES_KEY), raw)
      assert.equal(h.backend.writes.length, 0)
    }, { raw, languages })
  }
})
test('LANGUAGE-SELECTOR-8', 'actual explicit choices persist only zh-CN/en and retain unrelated preference fields', () => selectorSession(async h => {
  for (const value of ['en', 'zh-CN']) {
    await choose(h, value)
    assert.equal(select(h).props.value, value)
    assert.equal(h.service.getSnapshot().preference, value)
    assert.deepEqual(JSON.parse(h.backend.values.get(APP_PREFERENCES_KEY)), { schemaVersion: 1, languagePreference: value, other: 7 })
    const reloaded = new LocalizationService(new AppPreferencesRepository(h.backend), () => ['ja-JP'])
    await reloaded.initialize()
    assert.equal(reloaded.getSnapshot().resolvedLocale, value)
    assert.equal(reloaded.getSnapshot().preference, value)
  }
  assert.deepEqual(h.backend.writes.map(x => x.key), [APP_PREFERENCES_KEY, APP_PREFERENCES_KEY])
}, { raw: '{"schemaVersion":1,"languagePreference":"system","other":7}' }))
test('LANGUAGE-SELECTOR-9', 'actual Settings round trip preserves control/route/runtime/input/session/history/theme/listeners', () => mounted('settings', async h => {
  const component = h.renderer.root.findByType(LanguageSetting), control = select(h), runtime = h.runtime
  const provider = runtime.midiInput, controller = runtime.controller
  const snapshot = JSON.stringify(runtime.snapshot), input = JSON.stringify(runtime.bluetoothSnapshot.activeInput)
  const boundary = provider.boundary, settings = runtime.settings, paused = runtime.midiResumeRequired
  const calls = [...h.plugin.calls], listeners = [...h.plugin.listeners], registrations = h.plugin.registrations
  const route = global.window.location.hash, bytes = businessBytes(h.backend), theme = h.themeManager.snapshot
  for (const value of ['en', 'zh-CN']) {
    await choose(h, value)
    assert.deepEqual(options(h), expected)
    assert.equal(select(h), control); assert.equal(h.renderer.root.findByType(LanguageSetting), component)
    assert.equal(global.window.location.hash, route)
    assert.equal(h.runtime, runtime); assert.equal(runtime.midiInput, provider); assert.equal(runtime.controller, controller)
    assert.equal(JSON.stringify(runtime.snapshot), snapshot); assert.equal(JSON.stringify(runtime.bluetoothSnapshot.activeInput), input)
    assert.equal(provider.boundary, boundary); assert.deepEqual(runtime.settings, settings); assert.equal(runtime.midiResumeRequired, paused)
    assert.deepEqual(h.plugin.calls, calls); assert.deepEqual([...h.plugin.listeners], listeners); assert.equal(h.plugin.registrations, registrations)
    assert.deepEqual(businessBytes(h.backend), bytes); assert.equal(h.themeManager.snapshot, theme); assert.deepEqual(h.pointerCalls, [])
    assert.deepEqual(h.lifecycle(), { mounts: 1, unmounts: 0 })
  }
  assert.deepEqual(h.backend.writes.map(x => x.key), [APP_PREFERENCES_KEY, APP_PREFERENCES_KEY])
}))
test('LANGUAGE-SELECTOR-10', 'B5 native/system strategy and Web services/bridges remain frozen without per-app sync', () => {
  guard.assertB6ScopeFrozen()
  const native = require('./android-localization-native-contract.cjs')
  native.assertNativePresentationOnly()
  const source = Object.keys(native.literalPolicies).map(f => native.read(native.nativeDir + f)).join('\n')
  assert.doesNotMatch(source, /LocaleManager|setApplicationLocales|LocaleListCompat|updateConfiguration|\.recreate\s*\(/)
})
test('LANGUAGE-SELECTOR-11', 'semantic HTML option names stay exact; associated label localizes without overrides', () => mounted('settings', async h => {
  for (const value of ['zh-CN', 'en']) {
    await choose(h, value)
    assert.deepEqual(options(h).map(x => x.label), ['中文', 'English'])
    assert.equal(select(h).props['aria-label'], undefined)
    assert.equal(select(h).props['aria-labelledby'], undefined)
    for (const node of select(h).findAllByType('option')) for (const field of ['aria-label', 'aria-labelledby', 'label', 'title']) assert.equal(node.props[field], undefined)
    assert.equal(h.renderer.root.findAllByProps({ htmlFor: select(h).props.id }).length, 1)
    const markup = renderToStaticMarkup(hostElement(select(h)))
    assert.match(markup, /<option value="zh-CN"(?: selected="")?>中文<\/option>/)
    assert.match(markup, /<option value="en"(?: selected="")?>English<\/option>/)
  }
}))
test('LANGUAGE-SELECTOR-12', 'language UI exposes no locale/region code text, flag, or extra region selector', () => mounted('settings', async h => {
  for (const value of ['en', 'zh-CN']) {
    await choose(h, value)
    const language = h.renderer.root.findByProps({ className: 'settings-language' })
    const visible = text(language)
    assert.doesNotMatch(visible, /zh-CN|zh-TW|en-US|BCP.?47|Simplified Chinese|简体中文|Chinese|跟随系统|Follow system|Automatic|Auto|地区|国家|Region|Country|[\u{1F1E6}-\u{1F1FF}]/u)
    assert.equal(language.findAllByType('select').length, 1)
    assert.equal(language.findAllByType('img').length, 0)
    assert.deepEqual(options(h), expected)
  }
}))
test('LANGUAGE-SELECTOR-13', 'fresh/no-preference startup uses existing primary-system resolver with zero initialization writes', async () => {
  for (const [languages, resolved] of [[['zh-CN'], 'zh-CN'], [['zh-HK'], 'zh-CN'], [['en-US', 'zh-CN'], 'en'], [['ja-JP'], 'en'], [[], 'en']]) {
    await selectorSession(async h => {
      assert.equal(h.service.getSnapshot().preference, 'system')
      assert.equal(h.service.getSnapshot().resolvedLocale, resolved)
      assert.equal(select(h).props.value, resolved)
      assert.deepEqual(options(h), expected)
      assert.equal(h.backend.values.has(APP_PREFERENCES_KEY), false)
      assert.equal(h.backend.writes.length, 0)
    }, { languages })
  }
})
test('LANGUAGE-SELECTOR-14', 'read/future-schema/write failures preserve controlled errors, bytes, disabled policy and autonyms', async () => {
  const future = '{"schemaVersion":99,"languagePreference":"future","other":7}'
  await selectorSession(async h => {
    assert.equal(h.service.getSnapshot().error, 'futureSchema')
    assert.equal(select(h).props.disabled, true)
    assert.deepEqual(options(h), expected)
    await choose(h, 'en')
    assert.equal(h.backend.values.get(APP_PREFERENCES_KEY), future); assert.equal(h.backend.writes.length, 0)
  }, { raw: future })
  await selectorSession(async h => {
    assert.equal(h.service.getSnapshot().error, 'readFailed')
    assert.deepEqual(options(h), expected); assert.equal(h.backend.writes.length, 0)
    assert.doesNotMatch(text(h.renderer.toJSON()), /RAW_PRIVATE_ERROR/)
  }, { failRead: true })
  await selectorSession(async h => {
    const before = h.backend.values.get(APP_PREFERENCES_KEY)
    h.backend.failWrite = true
    await choose(h, 'en')
    assert.equal(h.service.getSnapshot().error, 'writeFailed')
    assert.equal(select(h).props.value, 'zh-CN')
    assert.deepEqual(options(h), expected); assert.equal(h.backend.values.get(APP_PREFERENCES_KEY), before)
    assert.doesNotMatch(text(h.renderer.toJSON()), /RAW_PRIVATE_ERROR/)
  }, { raw: '{"schemaVersion":1,"languagePreference":"zh-CN"}' })
})
test('LANGUAGE-SELECTOR-15', 'only dead translated option keys are removed; title/status/error resources retain bilingual parity', () => {
  guard.assertB6PresentationOnly()
  const slots = value => [...value.matchAll(/{{\s*([^}\s]+)\s*}}/g)].map(x => x[1])
  for (const locale of ['zh-CN', 'en']) {
    for (const key of ['system', 'chinese', 'english']) assert.equal(Object.hasOwn(localizationResources[locale].settings, key), false)
    const service = new LocalizationService(new AppPreferencesRepository(new MemoryBackend()), () => [locale])
    service.i18n.options.fallbackLng = false
    for (const key of ['language', 'languageDescription', 'currentLanguage', 'loading', 'saving', 'errors.readFailed', 'errors.invalidDocument', 'errors.futureSchema', 'errors.writeFailed']) assert.equal(service.i18n.exists(key, { ns: 'settings', lng: locale, fallbackLng: false }), true)
  }
  assert.deepEqual(slots(localizationResources['zh-CN'].settings.currentLanguage), ['language'])
  assert.deepEqual(slots(localizationResources.en.settings.currentLanguage), ['language'])
})
test('LANGUAGE-SELECTOR-16', 'legacy system refresh updates selection without rewriting; explicit choice stops following system', () => selectorSession(async h => {
  const raw = h.backend.values.get(APP_PREFERENCES_KEY)
  const control = select(h)
  h.setSystem(['en-US'])
  await act(async () => h.service.refreshSystemLocale())
  assert.equal(select(h), control); assert.equal(select(h).props.value, 'en')
  assert.equal(h.backend.values.get(APP_PREFERENCES_KEY), raw); assert.equal(h.backend.writes.length, 0)
  assert.deepEqual(options(h), expected)
  await choose(h, 'zh-CN')
  h.setSystem(['ja-JP'])
  await act(async () => h.service.refreshSystemLocale())
  assert.equal(select(h).props.value, 'zh-CN')
  assert.equal(h.service.getSnapshot().preference, 'zh-CN')
  assert.deepEqual(options(h), expected)
  assert.equal(h.backend.writes.length, 1)
}, { raw: '{"schemaVersion":1,"languagePreference":"system"}' }))

void (async () => {
  let passed = 0
  for (const { id, description, run } of tests) {
    try { await run(); passed++; console.log('PASS ' + id + ' ' + description) }
    catch (error) { console.error('FAIL ' + id + ' ' + description + '\n' + error.stack) }
  }
  console.log(passed + '/' + tests.length + ' B6 language selector contracts PASS')
  console.log('EVIDENCE_LEVEL=SOURCE_FREEZE_AND_REACT_SEMANTIC_HTML; BROWSER_PIXEL_VISUAL_NOT_PERFORMED')
  if (passed !== tests.length) process.exitCode = 1
})()
