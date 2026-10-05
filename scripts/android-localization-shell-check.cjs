const { normalizeB46Main, assertFrozenDiff, assertRendererDisplayOnly, stripB46Css } = require('./android-localization-remaining-contract.cjs')
const { normalizeEarlyExitMain } = require('./android-practice-early-exit-contract.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')
const React = require('react')
const { create, act } = require('react-test-renderer')
const { renderToStaticMarkup } = require('react-dom/server')
const root = path.resolve(__dirname, '..')
const base = 'ae51b91a8135c54ec5fa05bfbd076c7affd30ac5'
const mainPath = 'prototype/android-tablet-v1/src/main.tsx'
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')
const baseline = file => execFileSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n')
const compile = (source, filename) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: filename
}).outputText
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(compile(fs.readFileSync(filename, 'utf8'), filename), filename)
const loc = '../prototype/android-tablet-v1/src/localization/'
const { LocalizationService, createLocalizationInstance } = require(loc + 'localizationService.ts')
const { AppPreferencesRepository, APP_PREFERENCES_KEY } = require(loc + 'appPreferences.ts')
const { LocaleProvider } = require(loc + 'LocaleProvider.tsx')
const { localizationResources } = require(loc + 'resources.ts')
const { presentLocalizedMidiStatus, getSettingsThemeDisplayName } = require(loc + 'midiPresentation.ts')
const { AndroidSightReadingRuntime } = require('../prototype/android-tablet-v1/src/sightReadingIntegration.ts')
const { AndroidPersistenceStore, SightReadingReportRepository, SightReadingSettingsRepository, createSettingsDocument, ANDROID_PERSISTENCE_KEYS } = require('../prototype/android-tablet-v1/src/androidPersistenceCore.ts')

// Compile the actual production component declarations in memory, not a rewritten mock UI.
// This is a React/DOM contract; it does not claim browser pixels or physical device evidence.
const main = read(mainPath)
function declarations(source) {
  source = normalizeB46Main(source)
  const ast = ts.createSourceFile(mainPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const result = new Map()
  for (const node of ast.statements) {
    if ((ts.isFunctionDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) result.set(node.name.text, node.getText(ast))
    if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) result.set(declaration.name.getText(ast), node.getText(ast))
  }
  return result
}
const current = declarations(main), old = declarations(baseline(mainPath))
const frozenCurrent = declarations(normalizeEarlyExitMain(main))
const componentNames = ['ChordModeSelectScreen', 'ChordGroupBadge', 'ChordSettingsDrawer', 'ChordPracticeScreen', 'ChordReportDetailScreen', 'ChordPersistenceErrorNotice', 'useChordPracticeRuntime', 'toChordWrittenPitches', 'MidiUiContext', 'UpdaterUiContext', 'AppNavigationContext', 'useMidiUi', 'useUpdaterUi', 'useAppNavigation', 'productNavigation', 'SETTINGS_THEME_OPTIONS', 'Icon', 'navigate', 'presentMidiStatus', 'MidiStatusButton', 'ProductHeader', 'BottomNavigation', 'ProductFrame', 'SettingRow', 'SettingSelect', 'SettingsThemeOption', 'useThemeRuntime', 'ExternalThemeCard', 'SettingsScreen', 'MidiScreen', 'OrientationNotice', 'HomeScreen', 'PracticeHubScreen', 'THEORY_TOOLS', 'ToolsHubScreen', 'ScaleNoteToken', 'parseChordAccidentalGroup', 'ChordAccidentalGlyph', 'ChordAccidentalGroup', 'ChordSymbol', 'ChordTheoreticalNoteToken', 'ToolDetailShell', 'ChordQueryToolScreen', 'ScaleKeySignatureToolScreen', 'IntervalPitchToken', 'IntervalPitchSelector', 'IntervalQueryToolScreen', 'SightSettingsRows', 'SightSettingsDrawer', 'SightReadyScreen', 'PracticeFocusHeader', 'useRemainingTime', 'PracticeMetric', 'getPracticeScreen', 'SightFocusScreen', 'SightResultScreen', 'PersistenceErrorNotice', 'IntervalPracticeSetupScreen', 'NotationPaper', 'useIntervalPracticeRuntime', 'useIntervalPersistence', 'IntervalPracticeActiveScreen', 'IntervalReportFacts', 'IntervalResultScreen', 'IntervalReportDetailScreen', 'HistoryRecord', 'HistoryScreen', 'HistoryTrendChart', 'IntervalPersistenceErrorNotice']
const componentSource = `
import { CHORD_SEQUENTIAL_MAJOR_KEY_IDS, formatWrittenPitchClass } from './musicTheory/chords'
import { getChordMockCase, getChordMockState } from './chordPracticeMocks'
import { presentChordKey, presentChordQuestion, presentChordHistorySummary, presentLocalizedChordPractice, presentLocalizedChordReport } from './localization/chordPracticePresentation'
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Capacitor } from '@capacitor/core'
import { LanguageSetting } from './localization/LanguageSetting'
import { PracticeEarlyExitDialog, usePracticeEarlyExit } from './PracticeEarlyExitDialog'
import { getSettingsThemeDisplayName, presentLocalizedMidiStatus } from './localization/midiPresentation'
import { presentHomeRecentPractice } from './localization/homePresentation'
import { projectMixedPracticeHistory } from './mixedHistoryProjection'
import { spellMidiPitch } from '../../../src/sightReading/musicPitchSpelling'
import { CHORD_QUERY_NOTE_LETTERS, CHORD_QUERY_INPUT_ACCIDENTALS, CHORD_QUERY_TYPE_GROUPS, getChordQueryResult } from './chordQueryTool'
import { AVAILABLE_SCALE_TYPE_OPTIONS, NATURAL_MAJOR_TOOL_ROOT_IDS, formatScaleToolNoteName, getNaturalMajorToolResult } from './scaleKeySignatureTool'
import { INTERVAL_QUERY_LETTERS, INTERVAL_QUERY_VISIBLE_ACCIDENTALS, INTERVAL_QUERY_OCTAVES, formatIntervalAccidental, getIntervalQueryResult } from './intervalQueryTool'
import { presentChordTypeOption, presentIntervalName, presentIntervalQuery, presentQueryAccidental } from './localization/theoryQueryPresentation'
import { INTERVAL_QUESTION_COUNT_OPTIONS } from './intervalPractice/settings'
import { presentLocalizedIntervalPractice, formatIntervalReportAccuracy, formatIntervalHistoryTimestamp } from './localization/intervalPracticePresentation'
import { useAppLocale } from './localization/LocaleProvider'
import { IntervalDisplayName } from './localization/LegacyDisplayValues'
import { SightNoteValue } from './localization/LegacyDisplayValues'
import { presentSightKey, presentSightPrompt, presentSightReaction, presentSightHistory, presentSightDuration } from './localization/sightReadingPresentation'
import { getSightReadingAnswerTimeoutMs } from '../../../src/sightReading/sightReadingSettings'
import { getMajorKeySignature, MAJOR_KEY_DISPLAY_SIGNATURES } from '../../../src/sightReading/musicKeySignatures'
import { getPrimaryErrorNote } from './sightReadingIntegration'
import { presentSightReadingFeedback } from './sightReadingFeedbackPresentation'
import { getDifficultIntervals, projectIntervalHistory } from './intervalPractice'
import { projectSightReadingHistory, formatHistoryTimestamp, formatHistoryPercentage, formatHistoryDuration } from './historyProjection'
import { projectChordHistory } from './chordPractice/historyProjection'
import { projectHistoryDashboard } from './historyDashboardProjection'
// Only test the staff's production props here. VexFlow pixels remain browser-blocked.
function MusicStaffRenderer(props) { return <div data-test-staff="wiring-only" aria-label={props.ariaLabel} /> }
function ChordGrandStaff(props) { return <div data-test-chord-staff="wiring-only" aria-label={props.ariaLabel} /> }
const __QA_BUILD__ = false
const __ANDROID_VERSION_NAME__ = '1.7.0'
const __ANDROID_VERSION_CODE__ = 15
function ThemePackageDialog() { throw new Error('OUT_OF_SCOPE_DIALOG') }
function ThemeInfoDialog() { throw new Error('OUT_OF_SCOPE_DIALOG') }
function openSourceRepository() { throw new Error('NOT_A_LOCALE_ACTION') }
${componentNames.map(name => { assert.ok(current.has(name), name); return current.get(name) }).join('\n')}
export { ${componentNames.join(', ')} }
`
const compiled = new Module(path.join(root, mainPath), module)
compiled.filename = path.join(root, mainPath)
compiled.paths = Module._nodeModulePaths(path.dirname(compiled.filename))
compiled._compile(compile(componentSource, compiled.filename), compiled.filename)
const ui = compiled.exports

class MemoryBackend {
  values = new Map([
    [APP_PREFERENCES_KEY, '{"schemaVersion":1,"languagePreference":"zh-CN","unrelatedField":"keep"}'],
    ['piano.v1.sightReading.settings', 'UNCHANGED_SETTINGS'],
    ['piano.v1.sightReading.reportIndex', 'UNCHANGED_HISTORY'],
    ['piano.v1.theme.selection', 'UNCHANGED_THEME_POINTER']
  ])
  writes = []
  failWrite = false
  async get({ key }) { return { value: this.values.get(key) ?? null } }
  async set({ key, value }) {
    if (this.failWrite) throw new Error('RAW_PREFERENCES_SECRET')
    this.writes.push({ key, value }); this.values.set(key, value)
  }
  async keys() { return { keys: [...this.values.keys()] } }
}
const device = (id, name, transport = 'usb', ports = [3]) => ({ id, name, transport, source: 'midiManager', manufacturer: 'Original Manufacturer', outputPorts: ports.map(portNumber => ({ portNumber, name: `原始 Port ${portNumber} ♯` })) })
class NativeFixture {
  listeners = new Map()
  calls = []
  registrations = 0
  state = {
    supported: true, androidApiLevel: 36, scanServiceUuid: '', permissionState: 'GRANTED', bluetoothState: 'ON', connectionState: 'IDLE', midiPortState: 'CLOSED',
    discoveredDevices: [device('usb-identity', 'Roland Roland Digital Piano'), device('bt-identity', 'FP-30X MIDI', 'bluetooth', [0])],
    connectionGeneration: 8, deliveryEpoch: 6, stateRevision: 0, disconnectCount: 0, reconnectCount: 0, receivedChunkCount: 0, receivedByteCount: 0,
    capabilities: { bluetooth: { supported: true, available: true }, usb: { supported: true, available: true } }
  }
  async addListener(name, listener) { this.registrations++; this.listeners.set(name, listener); return { remove: async () => this.listeners.delete(name) } }
  update(changes) { this.state = { ...this.state, ...changes, stateRevision: this.state.stateRevision + 1 }; this.listeners.get('stateChanged')?.(this.state); return this.state }
  async getState() { this.calls.push('getState'); return this.state }
  async connect({ deviceId, portNumber }) {
    this.calls.push(['connect', deviceId, portNumber])
    const selected = this.state.discoveredDevices.find(value => value.id === deviceId)
    assert.ok(selected)
    return this.update({ connectionState: 'CONNECTED', midiPortState: 'OPEN', connectedDeviceId: deviceId, connectedDeviceName: selected.name,
      connectionGeneration: this.state.connectionGeneration + 1,
      activeInput: { deviceId, displayName: selected.name, transport: selected.transport, portNumber, connectionGeneration: this.state.connectionGeneration + 1 } })
  }
  async disconnect() { this.calls.push('disconnect'); return this.update({ connectionState: 'DISCONNECTED', activeInput: undefined, midiPortState: 'CLOSED' }) }
  async startScan() { this.calls.push('scan'); return this.state }
  async stopScan() { this.calls.push('stopScan'); return this.state }
  async requestMidiPermissions() { this.calls.push('permissions'); return this.state }
  async suspendDelivery() { this.calls.push('suspend'); return this.update({ deliveryEpoch: this.state.deliveryEpoch + 1, midiPortState: 'SUSPENDED' }) }
  async resumeDelivery() { this.calls.push('resume'); return this.update({ deliveryEpoch: this.state.deliveryEpoch + 1, midiPortState: this.state.activeInput ? 'OPEN' : 'CLOSED' }) }
}
function events() {
  const handlers = new Map()
  return {
    addEventListener(name, handler) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(handler) },
    removeEventListener(name, handler) { handlers.get(name)?.delete(handler) },
    dispatchEvent(event) { for (const handler of [...(handlers.get(event.type) ?? [])]) handler(event); return true },
    count() { return [...handlers.values()].reduce((sum, values) => sum + values.size, 0) },
    snapshot() { return [...handlers].map(([name, values]) => [name, [...values]]) }
  }
}
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (Array.isArray(node) ? node : node?.children ?? []).map(text).join(' ')
const contains = (value, expected) => assert.ok(value.includes(expected), `missing ${JSON.stringify(expected)} in ${value}`)
const translator = (locale, ns = 'midi') => createLocalizationInstance(locale).getFixedT(locale, ns)
const businessBytes = backend => [...backend.values].filter(([key]) => key !== APP_PREFERENCES_KEY)
const tests = []
const test = (id, description, run) => tests.push({ id, description, run })

async function mounted(page, run, options = {}) {
  const oldWindow = global.window, oldDocument = global.document
  global.window = { ...events(), location: { hash: '#' + page }, ...(options.windowTimers ?? {}) }
  global.document = { ...events(), documentElement: { lang: '' }, title: '', visibilityState: 'visible' }
  const backend = new MemoryBackend()
  const service = new LocalizationService(new AppPreferencesRepository(backend), () => ['zh-CN'])
  const plugin = new NativeFixture()
  let reportRepository, settingsRepository
  if (options.sightRecords) {
    const keys = ANDROID_PERSISTENCE_KEYS
    backend.values.set(keys.schemaVersion, '1')
    const encode = value => options.rawSightEvidence ? JSON.stringify(value, null, 2) + '\n' : JSON.stringify(value)
    backend.values.set(keys.sightReadingReportIndex, encode({ schemaVersion: 1, recordIds: options.sightRecords.map(record => record.recordId) }))
    for (const record of options.sightRecords) backend.values.set(keys.sightReadingReportPrefix + record.recordId, encode(record))
    const store = new AndroidPersistenceStore(backend)
    assert.equal((await store.ensureSchema()).success, true)
    reportRepository = new SightReadingReportRepository(store)
    assert.equal((await reportRepository.initialize()).success, true)
    if (options.rawSightEvidence) {
      backend.values.set(keys.sightReadingSettings, encode(createSettingsDocument(options.runtimeDependencies.initialSettings)))
      settingsRepository = new SightReadingSettingsRepository(store)
      assert.equal((await settingsRepository.load()).success, true)
    }
  }
  const runtime = new AndroidSightReadingRuntime({ clock: { now: () => 1000 }, scheduler: { schedule: () => 1, cancel() {} }, random: () => 0.42, bluetoothPlugin: plugin, requireMidiIdentity: true, initialMidiSource: 'bluetooth', reportRepository, settingsRepository, ...(options.runtimeDependencies ?? {}) })
  await runtime.startMidi()
  await runtime.midiInput.connect('usb-identity', 3)
  if (!['interval-practice', 'interval-flow', 'sight-flow', 'chord-flow'].includes(page)) {
    runtime.start(); runtime.pause()
    assert.equal(runtime.snapshot.isPaused, true)
  }
  if (options.historyStatus) runtime.historyStatusValue = options.historyStatus // Controlled loading fixture; no product setting writes.
  const refreshCalls = []
  const initialRefresh = runtime.refreshHistory
  if (['home', 'practice', 'tools'].includes(page)) runtime.refreshHistory = async () => { refreshCalls.push('sight') }
  const chordHistory = { status: options.historyStatus ?? 'ready', records: options.chordRecords ?? [] }
  const chordPersistence = { refresh: async () => { refreshCalls.push('chord') } }
  const hubProps = { chordHistory, chordPersistence, intervalSettingsReady: options.ready ?? true, settings: runtime.settings }
  const pointerCalls = []
  if (options.beforeRender) await options.beforeRender({ backend, runtime })
  const theme = options.theme ?? { id: 'light', displayName: '浅色', source: 'builtin', capabilities: { settingsVisual: { kind: 'standard' }, homeVisual: { kind: 'standard' }, practiceVisual: { kind: 'standard' }, toolsVisual: { kind: 'standard' }, toolDetailVisual: { kind: 'standard' } } }
  const themeSnapshot = { installed: options.installed ?? [], theme }
  const themeManager = { snapshot: themeSnapshot, subscribe: () => () => {}, selectThemeId: id => pointerCalls.push(id), activateExternal: record => pointerCalls.push(record.themeId) }
  let mounts = 0, unmounts = 0, renderer
  const updaterValue = { controller: {}, snapshot: { installed: { versionName: '1.7.0', versionCode: 15 }, status: 'upToDate' } }
  const navValue = { openAuxiliary: destination => { global.window.location.hash = '#' + destination }, returnFromAuxiliary: fallback => { global.window.location.hash = '#' + fallback } }
  function Owner() {
    const [ownedRuntime] = React.useState(() => runtime)
    const [, update] = React.useState(0)
    React.useEffect(() => { mounts++; const stop = ownedRuntime.subscribe(() => update(value => value + 1)); return () => { unmounts++; stop() } }, [ownedRuntime])
    return React.createElement(ui.MidiUiContext.Provider, { value: { runtime: ownedRuntime } },
      React.createElement(ui.UpdaterUiContext.Provider, { value: updaterValue },
        React.createElement(ui.AppNavigationContext.Provider, { value: navValue },
          ['interval-practice', 'interval-flow', 'sight-flow', 'chord-flow'].includes(page) ? options.render({ backend, runtime, theme, ui }) : React.createElement({ settings: ui.SettingsScreen, midi: ui.MidiScreen, home: ui.HomeScreen, practice: ui.PracticeHubScreen, tools: ui.ToolsHubScreen, 'chord-query-tool': ui.ChordQueryToolScreen, 'interval-query-tool': ui.IntervalQueryToolScreen, 'scale-key-signature-tool': ui.ScaleKeySignatureToolScreen }[page],
            page === 'settings' ? { theme, themeManager } : page === 'midi' ? {} : { ...hubProps, theme }))))
  }
  try {
    await act(async () => { renderer = create(React.createElement(LocaleProvider, { service }, React.createElement(Owner))); await service.initialize() })
    const getText = () => text(renderer.toJSON())
    const switchTo = async locale => { await act(async () => { await service.changeLanguagePreference(locale) }) }
    await run({ renderer, backend, service, plugin, runtime, theme, themeManager, pointerCalls, refreshCalls, chordHistory, getText, switchTo, lifecycle: () => ({ mounts, unmounts }) })
  } finally {
    if (renderer) await act(async () => { renderer.unmount() })
    runtime.refreshHistory = initialRefresh
    await runtime.dispose()
    global.window = oldWindow; global.document = oldDocument
  }
}

test('N1', 'actual Chinese navigation has five approved labels', async () => mounted('settings', async h => {
  const nav = h.renderer.root.findByType('nav')
  assert.equal(nav.props['aria-label'], '主要导航')
  assert.deepEqual(nav.findAllByType('button').map(button => text(button).trim()), ['首页', '练习', '工具', '记录', '设置'])
}))
test('N2', 'actual English navigation has five labels without resource fallback', async () => mounted('settings', async h => {
  await h.switchTo('en')
  assert.deepEqual(h.renderer.root.findByType('nav').findAllByType('button').map(button => text(button).trim()), ['Home', 'Practice', 'Tools', 'History', 'Settings'])
  assert.equal(h.renderer.root.findByType('nav').props['aria-label'], 'Main navigation')
}))
test('N3', 'live round trip preserves route; navigation clicks still use stable IDs', async () => mounted('settings', async h => {
  await h.switchTo('en'); assert.equal(global.window.location.hash, '#settings')
  await h.switchTo('zh-CN'); assert.equal(global.window.location.hash, '#settings')
  h.renderer.root.findByType('nav').findAllByType('button')[1].props.onClick()
  assert.equal(global.window.location.hash, 'practice')
}))
test('N4', 'ScreenId, ProductNavigationId, screen metadata and route functions are byte frozen', () => {
  for (const name of ['ScreenId', 'ProductNavigationId', 'screens', 'productNavigation', 'navigate', 'readScreen']) assert.equal(current.get(name), old.get(name), name)
})
test('N5', 'Home/Hub B4.2A presentation retains removed summaries/pills and original entry routes', () => {
  assert.doesNotMatch(current.get('HomeScreen'), /homeSettingsSummary|home-training-summary/)
  assert.doesNotMatch(current.get('PracticeHubScreen'), /practice-card__annotation|practice-card__status|sightConfigurationSummary/)
  for (const name of ['HomeScreen', 'PracticeHubScreen']) for (const route of ['sight-ready', 'chord-mode-select', 'interval-practice']) assert.ok(current.get(name).includes(`navigate('${route}')`))
})

test('ST1', 'Settings Device Appearance About and real entry copy render in both locales', async () => mounted('settings', async h => {
  for (const label of ['设备', '外观', '关于', '当前版本', '检查更新', '开源项目']) contains(h.getText(), label)
  await h.switchTo('en')
  for (const label of ['Device', 'Appearance', 'About', 'Current version', 'Check for updates', 'Open source', 'V1.7.0', 'versionCode 15']) contains(h.getText(), label)
  const language = h.renderer.root.findByProps({ id: 'app-language-preference' })
  assert.equal(text(language.findByProps({ value: 'zh-CN' }).findByType('strong')), '中文')
  // Only the one approved option autonym remains Chinese, not any other English Settings copy.
  assert.deepEqual(h.getText().match(/[\u3400-\u9fff]+/g), ['中文'])
}))
test('ST2', 'Light/Dark display from stable IDs, with selection handlers still sending IDs', async () => {
  for (const id of ['light', 'dark']) await mounted('settings', async h => {
    contains(h.getText(), '当前：' + (id === 'light' ? '浅色' : '深色'))
    await h.switchTo('en'); contains(h.getText(), 'Current: ' + (id === 'light' ? 'Light' : 'Dark'))
    const choices = h.renderer.root.findByProps({ className: 'settings-theme-options' }).findAllByType('button')
    assert.equal(choices.length, 2)
    await act(async () => { choices[1].props.onClick() })
    assert.deepEqual(h.pointerCalls, ['dark'])
    assert.equal(h.theme.id, id)
  }, { theme: { id, displayName: 'AUTHOR_NOT_A_BUILTIN_LABEL', capabilities: { settingsVisual: { kind: 'standard' } } } })
})
const authorRecord = { themeId: 'natural516.bocchi', name: '孤独摇滚 Bocchi Original', subtitle: '作者原文 Subtitle ♭', version: '1.1.0' }
test('ST3', 'external theme names/subtitles remain exact author text, including colliding IDs', async () => mounted('settings', async h => {
  for (const locale of ['en', 'zh-CN']) {
    await h.switchTo(locale)
    contains(h.getText(), authorRecord.name); contains(h.getText(), authorRecord.subtitle)
    contains(h.getText(), locale === 'en' ? 'Theme information' : '主题信息')
  }
  assert.equal(getSettingsThemeDisplayName({ id: 'light', source: 'external', displayName: authorRecord.name }, translator('en', 'settings')), authorRecord.name)
}, { installed: [authorRecord], theme: { id: authorRecord.themeId, source: 'external', displayName: authorRecord.name, version: '1.1.0', capabilities: { settingsVisual: { kind: 'standard' } } } }))
test('ST4', 'actual LanguageSetting clicks update mounted Settings without reload/remount', async () => mounted('settings', async h => {
  const select = () => h.renderer.root.findByProps({ id: 'app-language-preference' })
  for (const [locale, label] of [['en', 'Appearance'], ['zh-CN', '外观']]) {
    await act(async () => { select().findByProps({ value: locale }).props.onClick(); await new Promise(resolve => setImmediate(resolve)) })
    contains(h.getText(), label); assert.equal(global.document.documentElement.lang, locale)
  }
  assert.deepEqual(h.lifecycle(), { mounts: 1, unmounts: 0 })
}))
test('ST5', 'Settings round trip persists only AppPreferences and preserves unrelated fields/bytes', async () => mounted('settings', async h => {
  const before = businessBytes(h.backend)
  await h.switchTo('en'); await h.switchTo('zh-CN')
  assert.deepEqual(h.backend.writes.map(write => write.key), [APP_PREFERENCES_KEY, APP_PREFERENCES_KEY])
  assert.equal(JSON.parse(h.backend.values.get(APP_PREFERENCES_KEY)).unrelatedField, 'keep')
  assert.deepEqual(businessBytes(h.backend), before)
}))
test('ST6', 'locale round trip never writes/selects/activates the theme pointer', async () => mounted('settings', async h => {
  const before = h.themeManager.snapshot
  await h.switchTo('en'); await h.switchTo('zh-CN')
  assert.equal(h.themeManager.snapshot, before)
  assert.deepEqual(h.pointerCalls, [])
  assert.equal(h.backend.values.get('piano.v1.theme.selection'), 'UNCHANGED_THEME_POINTER')
}))
test('ST7', 'actual Settings persistence failure renders controlled bilingual alerts, not exception text', async () => mounted('settings', async h => {
  await h.switchTo('en'); h.backend.failWrite = true
  await h.switchTo('zh-CN')
  assert.equal(h.service.getSnapshot().error, 'writeFailed')
  contains(text(h.renderer.root.findByProps({ role: 'alert' })), 'not saved')
  assert.doesNotMatch(h.getText(), /RAW_PREFERENCES_SECRET/)
  h.backend.failWrite = false; await h.switchTo('zh-CN'); h.backend.failWrite = true; await h.switchTo('en')
  contains(text(h.renderer.root.findByProps({ role: 'alert' })), '未保存')
  assert.doesNotMatch(h.getText(), /RAW_PREFERENCES_SECRET/)
}))

const stateLabels = {
  UNSUPPORTED: ['不支持 MIDI', 'MIDI not supported'], PERMISSION_REQUIRED: ['需要权限', 'Permission needed'], PERMISSION_DENIED: ['权限被拒绝', 'Permission denied'],
  BLUETOOTH_OFF: ['蓝牙已关闭', 'Bluetooth is off'], IDLE: ['MIDI 未连接', 'MIDI not connected'], SCANNING: ['正在扫描', 'Scanning'],
  DEVICE_FOUND: ['已发现设备', 'Devices found'], CONNECTING: ['正在连接', 'Connecting'], CONNECTED: ['Roland Roland Digital Piano 已连接', 'Connected: Roland Roland Digital Piano'],
  DISCONNECTED: ['MIDI 已断开', 'MIDI disconnected'], ERROR: ['MIDI 连接错误', 'MIDI connection error']
}
for (const [locale, labelIndex, id] of [['zh-CN', 0, 'M1'], ['en', 1, 'M2']]) test(id, `${locale} actual MIDI renders every existing product state`, async () => mounted('midi', async h => {
  await h.switchTo(locale)
  for (const [state, labels] of Object.entries(stateLabels)) {
    await act(async () => { h.plugin.update({ connectionState: state, reasonCode: undefined, midiPortState: state === 'CONNECTED' ? 'OPEN' : 'CLOSED' }) })
    contains(h.getText(), labels[labelIndex])
    assert.doesNotMatch(h.getText(), /RAW_|deviceId|deliveryEpoch|generation|discoveryOrigins/)
  }
}))
test('M3', 'real device and port strings stay verbatim in both locales', async () => mounted('midi', async h => {
  await act(async () => { h.plugin.update({ discoveredDevices: [device('a', 'FP-30X MIDI', 'bluetooth'), device('b', 'Yamaha Kawai 任意设备 ♯', 'usb', [0, 3])] }) })
  for (const locale of ['zh-CN', 'en']) {
    await h.switchTo(locale)
    for (const name of ['FP-30X MIDI', 'Yamaha Kawai 任意设备 ♯', '原始 Port 0 ♯', '原始 Port 3 ♯']) contains(h.getText(), name)
    contains(h.renderer.root.findByType('select').props['aria-label'], 'Yamaha Kawai 任意设备 ♯')
  }
}))
test('M4', 'USB/Bluetooth retain protocol spelling; ports keep 0-based identity and +1 presentation', async () => mounted('midi', async h => {
  for (const locale of ['en', 'zh-CN']) {
    await h.switchTo(locale)
    contains(h.getText(), 'USB MIDI'); contains(h.getText(), 'Bluetooth MIDI')
    contains(h.getText(), locale === 'en' ? 'Port 4' : '端口 4')
    assert.equal(h.runtime.bluetoothSnapshot.activeInput.portNumber, 3)
  }
}))
test('M5', 'long/system/unsafe names are not rewritten and remain escaped React text', async () => mounted('midi', async h => {
  const name = 'Original_Long_Device_Name_'.repeat(16) + '<img src=x onerror=alert(1)>'
  await act(async () => { h.plugin.update({ connectedDeviceName: name, discoveredDevices: [device('long', name)] }) })
  for (const locale of ['zh-CN', 'en']) { await h.switchTo(locale); contains(h.getText(), name) }
  const html = renderToStaticMarkup(React.createElement('span', null, presentLocalizedMidiStatus(h.runtime, translator('en')).label))
  assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img/)
}))
test('M6', 'both screens preserve real runtime/input/session/generation/epoch across live locale switches', async () => {
  for (const page of ['settings', 'midi']) await mounted(page, async h => {
    const before = { input: h.runtime.bluetoothSnapshot.activeInput, snapshot: JSON.stringify(h.runtime.snapshot), boundary: h.runtime.midiInput.boundary, settings: h.runtime.settings, resumeRequired: h.runtime.midiResumeRequired }
    const owner = h.runtime, provider = h.runtime.midiInput, controller = h.runtime.controller
    for (const locale of ['en', 'zh-CN']) {
      await h.switchTo(locale)
      assert.equal(h.runtime, owner); assert.equal(h.runtime.midiInput, provider); assert.equal(h.runtime.controller, controller)
      assert.deepEqual(h.runtime.bluetoothSnapshot.activeInput, before.input)
      assert.equal(h.runtime.midiInput.boundary, before.boundary)
      assert.equal(JSON.stringify(h.runtime.snapshot), before.snapshot)
      assert.deepEqual(h.runtime.settings, before.settings)
      assert.equal(h.runtime.midiResumeRequired, before.resumeRequired)
      assert.equal(h.runtime.midiReady, true)
    }
    assert.deepEqual(h.lifecycle(), { mounts: 1, unmounts: 0 })
  })
})
for (const [id, operation] of [['M7', 'disconnect'], ['M8', 'scan']]) test(id, `language changes on both screens do not trigger ${operation} or any native call`, async () => {
  for (const page of ['settings', 'midi']) await mounted(page, async h => {
    const before = [...h.plugin.calls]
    await h.switchTo('en'); await h.switchTo('zh-CN')
    assert.deepEqual(h.plugin.calls, before)
  })
})
test('M9', 'both pages keep exactly three existing MIDI native listeners with identical callbacks', async () => {
  for (const page of ['settings', 'midi']) await mounted(page, async h => {
    assert.equal(h.plugin.registrations, 3)
    const before = [...h.plugin.listeners]
    const eventCount = global.window.count() + global.document.count()
    await h.switchTo('en'); await h.switchTo('zh-CN')
    assert.equal(h.plugin.registrations, 3); assert.deepEqual([...h.plugin.listeners], before)
    assert.equal(global.window.count() + global.document.count(), eventCount)
  })
})
test('M10', 'every controlled reason and unknown reason render safely; Chinese mapping equals old presentation', async () => mounted('midi', async h => {
  for (const reasonCode of ['NO_OUTPUT_PORT', 'PORT_SELECTION_REQUIRED', 'INVALID_PORT', 'DEVICE_REMOVED', 'OPEN_FAILED', 'SCAN_FAILED', 'BLUETOOTH_OFF', 'RAW_REASON_SECRET']) {
    await act(async () => { h.plugin.update({ connectionState: 'ERROR', reasonCode, lastError: 'RAW_NATIVE_SECRET stack java.Exception', discoveryOrigins: ['RAW_ORIGIN_SECRET'] }) })
    await h.switchTo('zh-CN')
    assert.deepEqual(presentLocalizedMidiStatus(h.runtime, translator('zh-CN')), ui.presentMidiStatus(h.runtime))
    await h.switchTo('en')
    assert.doesNotMatch(h.getText(), /RAW_|java\.Exception|OPEN_FAILED|SCAN_FAILED|discoveryOrigins|connectionGeneration/)
    assert.doesNotMatch(h.getText(), /[\u3400-\u9fff]/)
  }
  for (const state of Object.keys(stateLabels)) {
    await act(async () => { h.plugin.update({ connectionState: state, reasonCode: undefined }) })
    assert.deepEqual(presentLocalizedMidiStatus(h.runtime, translator('zh-CN')), ui.presentMidiStatus(h.runtime))
  }
}))
test('M11', 'Bluetooth off plus selected USB stays usable and capability facts do not change with locale', async () => mounted('midi', async h => {
  await act(async () => { h.plugin.update({ bluetoothState: 'OFF', capabilities: { bluetooth: { supported: true, available: false, reason: 'BLUETOOTH_OFF' }, usb: { supported: true, available: true } } }) })
  const before = JSON.stringify(h.plugin.state.capabilities)
  contains(h.getText(), '系统蓝牙已关闭；仍可使用 USB MIDI。')
  await h.switchTo('en'); contains(h.getText(), 'System Bluetooth is off. USB MIDI is still available.')
  assert.equal(JSON.stringify(h.plugin.state.capabilities), before); assert.equal(h.runtime.midiReady, true)
  contains(h.getText(), 'Ready to practice')
}))
test('M12', 'actual full-row candidates and multi-port selector preserve identities/buttons/plural counts', async () => mounted('midi', async h => {
  const candidate = device('multi', 'Same Piano', 'usb', [0, 3])
  await act(async () => { h.plugin.update({ discoveredDevices: [candidate] }) })
  await h.switchTo('en'); contains(h.getText(), '1 candidate'); assert.ok(!h.getText().includes('1 candidates'))
  const row = () => h.renderer.root.findByProps({ className: 'midi-candidate' })
  const buttons = () => row().children.filter(child => child.type === 'button')
  assert.equal(buttons().length, 1); assert.equal(buttons()[0].props.disabled, true)
  await act(async () => { row().findByType('select').props.onChange({ target: { value: '3' } }) })
  assert.equal(row().findByType('select').props.value, 3)
  assert.equal(buttons()[0].props.disabled, false)
  await h.switchTo('zh-CN'); assert.equal(row().findByType('select').props.value, 3)
  contains(text(buttons()[0]), '连接')
  await act(async () => { buttons()[0].props.onClick(); await new Promise(resolve => setImmediate(resolve)) })
  assert.deepEqual(h.plugin.calls.findLast(call => Array.isArray(call)), ['connect', 'multi', 3])
  assert.equal(h.runtime.bluetoothSnapshot.activeInput.deviceId, 'multi')
  await act(async () => { h.plugin.update({ discoveredDevices: [candidate, device('other', 'Same Piano', 'bluetooth')] }) })
  await h.switchTo('en'); contains(h.getText(), '2 candidates')
  const details = h.renderer.root.findByProps({ className: 'device-details' })
  assert.equal(details.children.length, 3)
  assert.doesNotMatch(h.getText(), /应用发声|App audio/)
}))

test('B41R1', 'all out-of-scope main declarations and Bocchi headline/dialogs stay byte frozen', () => {
  const permitted = new Set(['ChordModeSelectScreen', 'ChordGroupBadge', 'ChordSettingsDrawer', 'ChordPracticeScreen', 'ChordReportDetailScreen', 'ChordPersistenceErrorNotice', 'MidiStatusButton', 'ProductHeader', 'BottomNavigation', 'ProductFrame', 'ExternalThemeCard', 'SettingsScreen', 'MidiScreen', 'OrientationNotice', 'HomeScreen', 'PracticeHubScreen', 'ToolsHubScreen', 'ChordQueryToolScreen', 'ScaleKeySignatureToolScreen', 'IntervalQueryToolScreen', 'IntervalPitchSelector', 'SightSettingsRows', 'SightSettingsDrawer', 'SightReadyScreen', 'PracticeFocusHeader', 'SightFocusScreen', 'SightResultScreen', 'PersistenceErrorNotice', 'IntervalPracticeSetupScreen', 'IntervalPracticeActiveScreen', 'IntervalReportFacts', 'IntervalResultScreen', 'IntervalReportDetailScreen', 'HistoryRecord', 'HistoryScreen', 'HistoryTrendChart', 'IntervalPersistenceErrorNotice'])
  assert.deepEqual([...frozenCurrent.keys()], [...old.keys()])
  for (const [name, source] of frozenCurrent) if (!permitted.has(name)) assert.equal(source, old.get(name), name)
  const caption = source => source.match(/<div className="settings-hero__caption">[\s\S]*?<\/div>/)[0]
  assert.equal(caption(current.get('SettingsScreen')), caption(old.get('SettingsScreen')))
  const candidate = require('./android-release-candidate-version-contract.cjs')
  for (const file of ['android/version.properties', 'android/updater.properties', 'android/app/build.gradle', 'prototype/android-tablet-v1/src/theme/themePackageRuntime.ts']) assert.equal(file === candidate.VERSION_PATH ? candidate.normalizeCandidateVersion(read(file)) : read(file), baseline(file), file)
})
test('B41R2', 'local CSS keeps full-row/touch contracts and constrains long English/device copy', () => {
  const css = stripB46Css(read('prototype/android-tablet-v1/src/styles.css'))
  assert.match(css, /\.midi-device-list \.midi-candidate > button \{[\s\S]*?width: 100%;[\s\S]*?min-height: 58px;[\s\S]*?grid-template-columns: 38px minmax\(0, 1fr\) auto;/)
  assert.match(css, /\.midi-device-list button > span:nth-child\(2\) \{[\s\S]*?min-width: 0;[\s\S]*?overflow-wrap: anywhere;/)
  assert.match(css, /\.midi-port-selector \{ flex-wrap: wrap; \}/)
  assert.match(css, /\.bottom-navigation button \{[\s\S]*?min-width: 132px;[\s\S]*?height: 56px;/)
})
test('B41R3', 'English resources/plurals resolve explicitly without Chinese fallback', () => {
  const en = createLocalizationInstance('en')
  for (const ns of ['navigation', 'settings', 'midi']) for (const [key, value] of Object.entries(localizationResources.en[ns])) if (typeof value === 'string') {
    assert.ok(en.exists(key, { ns, lng: 'en', fallbackLng: false }), ns + '.' + key)
    assert.ok(value.trim()); assert.doesNotMatch(value, /[\u3400-\u9fff]/)
  }
  for (const count of [0, 1, 2, 20]) assert.equal(en.t('devicesFound', { ns: 'midi', count }), `${count} ${count === 1 ? 'candidate' : 'candidates'}`)
})
test('B41R4', 'shared title/back/status aria migrate without translating module bodies or remapping IDs', async () => mounted('midi', async h => {
  assert.equal(h.renderer.root.findByProps({ className: 'icon-button' }).props['aria-label'], '返回')
  await h.switchTo('en')
  assert.equal(h.renderer.root.findByProps({ className: 'icon-button' }).props['aria-label'], 'Back')
  contains(h.getText(), 'MIDI Input')
  assert.equal(h.renderer.root.findByProps({ role: 'status' }).props['aria-label'], 'Connected: Roland Roland Digital Piano')
}))
test('B41R5', 'top-level Shell titles/orientation/compact MIDI aria translate; detail titles stay page-owned', async () => mounted('settings', async h => {
  let frame, notice, compact
  const wrapper = children => React.createElement(LocaleProvider, { service: h.service },
    React.createElement(ui.MidiUiContext.Provider, { value: { runtime: h.runtime } },
      React.createElement(ui.AppNavigationContext.Provider, { value: { openAuxiliary() {} } }, children)))
  const renderFrame = props => wrapper(React.createElement(ui.ProductFrame, props, React.createElement('p', null, 'UNCHANGED_BODY')))
  try {
    await act(async () => {
      frame = create(renderFrame({ active: 'home', title: '今天，读几页新音符' }))
      notice = create(wrapper(React.createElement(ui.OrientationNotice)))
      compact = create(wrapper(React.createElement(ui.MidiStatusButton, { compact: true })))
    })
    contains(text(frame.toJSON()), '今天，读几页新音符')
    assert.equal(compact.root.findByType('button').props['aria-label'], '打开 MIDI 设备')
    await h.switchTo('en')
    contains(text(frame.toJSON()), 'Read a few new notes today'); contains(text(frame.toJSON()), 'UNCHANGED_BODY')
    contains(text(notice.toJSON()), 'Rotate your tablet')
    assert.equal(compact.root.findByType('button').props['aria-label'], 'Open MIDI devices')
    await act(async () => { frame.update(renderFrame({ active: 'practice', title: '音程练习', onBack() {} })) })
    contains(text(frame.toJSON()), '音程练习')
    await act(async () => { frame.update(renderFrame({ active: 'history', title: '练习记录' })) })
    contains(text(frame.toJSON()), 'Practice history')
  } finally {
    await act(async () => { frame?.unmount(); notice?.unmount(); compact?.unmount() })
  }
}))
test('B41R6', 'all migrated component event handlers, disabled rules, keys and selected values stay source-identical', () => {
  const stableAttributes = new Set(['onClick', 'onChange', 'onSelect', 'onActivate', 'onInfo', 'disabled', 'value', 'key', 'aria-pressed'])
  const attributes = source => {
    const ast = ts.createSourceFile('component.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const result = []
    const visit = node => {
      if (ts.isJsxAttribute(node) && stableAttributes.has(node.name.getText(ast))) result.push(node.getText(ast))
      if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'run') result.push(node.getText(ast))
      ts.forEachChild(node, visit)
    }
    visit(ast); return result
  }
  for (const name of ['MidiStatusButton', 'ProductHeader', 'BottomNavigation', 'ProductFrame', 'ExternalThemeCard', 'SettingsScreen', 'MidiScreen']) assert.deepEqual(attributes(current.get(name)), attributes(old.get(name)), name)
})
test('B41R7', 'native-gated Settings import CTA is bilingual without opening a theme dialog or calling native', async () => mounted('settings', async h => {
  const { Capacitor } = require('@capacitor/core')
  const previousNative = Capacitor.isNativePlatform
  const calls = [...h.plugin.calls]
  try {
    // Change only the rendering gate after the existing provider effect has mounted.
    // Its [service] lifecycle dependency must not rerun on either locale update.
    Capacitor.isNativePlatform = () => true
    for (const [locale, label] of [['en', 'Import theme package'], ['zh-CN', '导入主题包']]) {
      await h.switchTo(locale)
      contains(text(h.renderer.root.findByProps({ className: 'settings-import-theme' })), label)
      contains(h.getText(), 'versionCode 15'); contains(h.getText(), 'V1.7.0')
      assert.equal(h.renderer.root.findAllByProps({ role: 'dialog' }).length, 0)
      assert.deepEqual(h.plugin.calls, calls)
    }
  } finally { Capacitor.isNativePlatform = previousNative }
}))

module.exports = { mounted, ui, current, frozenCurrent, declarations, read, text, contains, businessBytes, translator }
if (require.main === module) void (async () => {
  let passed = 0
  for (const { id, description, run } of tests) {
    try { await run(); passed++; console.log(`PASS ${id} ${description}`) }
    catch (error) { console.error(`FAIL ${id} ${description}\n${error.stack}`) }
  }
  console.log(`\n${passed}/${tests.length} B4.1 Shell Settings MIDI presentation checks PASS`)
  if (passed !== tests.length) process.exitCode = 1
})()
