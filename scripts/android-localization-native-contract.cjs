const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const base = 'a9938814cf46ad66339b8dadcad07378f0e11b99'
const nativeDir = 'android/app/src/main/java/com/pianofundamentals/trainer/'
const midiPath = nativeDir + 'AndroidBluetoothMidiPlugin.kt'
const resourcePaths = ['main', 'qa'].flatMap(source => ['values', 'values-zh', 'values-b+zh+Hant'].map(q => `android/app/src/${source}/res/${q}/strings.xml`))
const allowedPaths = new Set([midiPath, ...resourcePaths])
const read = file => require('./android-repository-cleanup-contract.cjs').read(file)
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).replaceAll('\r\n', '\n')
const old = file => git(['show', base + ':' + file])
const display = {
  en: { app_name: 'Piano Fundamentals Trainer', title_activity_main: 'Piano Fundamentals Trainer', midi_unnamed_device: 'MIDI device', midi_input_port: 'MIDI input %1$d' },
  zh: { app_name: '钢琴基本功训练器', title_activity_main: '钢琴基本功训练器', midi_unnamed_device: 'MIDI 设备', midi_input_port: 'MIDI 输入 %1$d' }
}
function strings(file) {
  const xml = read(file), entries = [...xml.matchAll(/<string name="([a-z_]+)"( translatable="false")?>([^<]*)<\/string>/g)]
  assert.equal((xml.match(/<string\b/g) || []).length, entries.length, file + ': exact string element shape')
  assert.equal(new Set(entries.map(x => x[1])).size, entries.length, file + ': unique keys')
  return Object.fromEntries(entries.map(x => [x[1], { value: x[3], translatable: !x[2] }]))
}
function assertResources() {
  for (const file of resourcePaths) {
    const qa = file.includes('/qa/'), english = file.includes('/values/'), actual = strings(file)
    const expected = { ...(english ? display.en : display.zh) }
    if (qa) {
      expected.app_name += ' QA'; expected.title_activity_main += ' QA'
      delete expected.midi_unnamed_device; delete expected.midi_input_port
    }
    const values = Object.fromEntries(Object.entries(expected).map(([k, value]) => [k, { value, translatable: true }]))
    if (english) for (const key of ['package_name', 'custom_url_scheme']) values[key] = { value: 'com.pianofundamentals.trainer' + (qa ? '.qa' : ''), translatable: false }
    assert.deepEqual(actual, values, file)
  }
  const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '--', 'android/app/src/main/res', 'android/app/src/qa/res']).trim().split('\n')
  assert.deepEqual(files.filter(f => /\/values[^/]*\/strings\.xml$/.test(f)).sort(), [...resourcePaths].sort(), 'only exact standard default/zh/zh-Hant locale resources')
}
function normalizeMidi(source) {
  const replacements = [
    ['context.getString(R.string.midi_unnamed_device)', '"MIDI 设备"'],
    ['context.getString(R.string.midi_input_port, port.portNumber + 1)', '"MIDI 输入 ${port.portNumber + 1}"']
  ]
  for (const [from, to] of replacements) {
    assert.equal(source.split(from).length - 1, 1, 'exactly one fallback-only resource call: ' + from)
    source = source.replace(from, to)
  }
  return source
}
function assertNativePresentationOnly() {
  const cleanup = require('./android-repository-cleanup-contract.cjs'); cleanup.assertCleanupDelta()
  assertResources()
  assert.equal(normalizeMidi(read(midiPath)), old(midiPath), 'MIDI only permits the two unnamed display fallbacks, no operational change')
  const candidate = require('./android-release-candidate-version-contract.cjs')
  assert.equal(candidate.normalizeCandidateVersion(read(candidate.VERSION_PATH)), old(candidate.VERSION_PATH), 'only exact candidate version metadata differs')
  git(['diff', '--exit-code', base, '--', 'android', ':(exclude)' + cleanup.nativeTestPath, ':(exclude)' + candidate.VERSION_PATH, ...[...allowedPaths].map(f => ':(exclude)' + f)])
  for (const file of git(['ls-files', '--others', '--exclude-standard', '--', 'android']).trim().split('\n').filter(Boolean)) assert.ok(allowedPaths.has(file), 'unreviewed native file: ' + file)
}
// Reviewed ownership: no file in this list directly renders a native dialog/toast/notification.
// Bridge keys/reasons/messages and parser/security/storage diagnostics are not UI translations.
const literalPolicies = {
  'AndroidBluetoothMidiPlugin.kt': 'MIDI bridge payload keys, state/reason codes, UUID/transport identifiers and debug diagnostics; actual names are supplied by system APIs; two app-owned unnamed fallbacks use R.string',
  'AndroidUpdaterPlugin.kt': 'Updater bridge fields/reasons, network protocol, artifact/cache paths and diagnostic messages; installation/settings UI belongs to OS',
  'AndroidUpdaterSecurityPolicy.kt': 'Frozen updater validation constants and diagnostic reasons',
  'AndroidManifestTransportPolicy.kt': 'Frozen transport validation reasons/protocol values',
  'ThemePackagePlugin.kt': 'Theme bridge fields/reasons, package metadata and document-picker intent; no directly rendered native error text',
  'AndroidThemeStore.kt': 'Frozen theme storage IDs, paths, metadata keys and diagnostic exceptions',
  'NativeThemeArchiveValidator.kt': 'Frozen archive format/asset validation fields and diagnostic exceptions',
  'ThemePackageModels.kt': 'Frozen model IDs/schema/version and diagnostic reasons',
  'ThemePackageSecurity.kt': 'Frozen signature/schema/archive security constants and diagnostic reasons',
  'ThemeTrustStore.kt': 'Frozen public trust material, trust IDs and diagnostic reasons',
  'ExternalUrlPlugin.kt': 'External URL bridge fields and diagnostic rejection messages; browser UI belongs to OS',
  'PracticeKeepAwakePlugin.kt': 'Keep-awake bridge keys and diagnostic rejection messages, not directly rendered UI',
  'BluetoothMidiStatePolicy.kt': 'Frozen MIDI state/reason identifiers',
  'MidiInputConnectionPolicy.kt': 'Frozen input/state/generation identifiers',
  'MidiCandidateIdentityPolicy.kt': 'Frozen candidate/device/transport identity normalization (not display-name localization)',
  'MainActivity.java': 'Plugin registration and immersive lifecycle; no native presentation literals'
}
function literalInventory() {
  const files = fs.readdirSync(path.join(root, nativeDir)).filter(f => /\.(kt|java)$/.test(f)).sort()
  assert.deepEqual(files, Object.keys(literalPolicies).sort(), 'every production native source has a reviewed ownership policy')
  return files.flatMap(file => {
    const source = read(nativeDir + file)
    return [...source.matchAll(/"""[\s\S]*?"""|"(?:\\.|[^"\\])*"/g)].map(m => ({ file: nativeDir + file, line: source.slice(0, m.index).split('\n').length, literal: m[0], category: 'D', reason: literalPolicies[file] }))
  })
}
module.exports = { root, base, nativeDir, midiPath, resourcePaths, allowedPaths, read, git, old, display, strings, assertResources, normalizeMidi, assertNativePresentationOnly, literalInventory, literalPolicies }
