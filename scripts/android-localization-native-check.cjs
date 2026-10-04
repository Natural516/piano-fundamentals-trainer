const assert = require('node:assert/strict')
const c = require('./android-localization-native-contract.cjs')
const tests = [], test = (id, name, run) => tests.push({ id, name, run })
const manifest = c.read('android/app/src/main/AndroidManifest.xml')
const main = q => `android/app/src/main/res/${q}/strings.xml`
test('NATIVE-L1', 'four app-owned resource keys cover native labels and unnamed MIDI fallbacks', () => {
  c.assertResources(); assert.equal(Object.keys(c.display.en).length, 4)
  assert.match(c.read(c.midiPath), /PROPERTY_NAME\)[\s\S]*?PROPERTY_PRODUCT\)[\s\S]*?safeBluetoothName\(bluetoothDevice\)[\s\S]*?context\.getString\(R\.string\.midi_unnamed_device\)/)
})
test('NATIVE-L2', 'default complete English fallback has no Chinese user strings', () => {
  for (const s of Object.values(c.display.en)) assert.doesNotMatch(s, /[\u3400-\u9fff]/)
  assert.deepEqual(c.strings(main('values')).app_name, { value: 'Piano Fundamentals Trainer', translatable: true })
})
test('NATIVE-L3', 'zh and explicit zh-Hant qualifiers use identical Simplified Chinese copy', () => {
  assert.deepEqual(c.strings(main('values-zh')), c.strings(main('values-b+zh+Hant')))
  assert.equal(c.strings(main('values-b+zh+Hant')).app_name.value, '钢琴基本功训练器')
})
test('NATIVE-L4', 'Chinese/English semantic key parity; QA inherits main MIDI resources', () => {
  assert.deepEqual(Object.keys(c.display.en), Object.keys(c.display.zh)); c.assertResources()
})
test('NATIVE-L5', 'Android numbered format placeholder parity', () => {
  const slots = value => [...value.matchAll(/%(?:\d+\$)?[sd]/g)].map(m => m[0])
  for (const key of Object.keys(c.display.en)) assert.deepEqual(slots(c.display.en[key]), slots(c.display.zh[key]))
  assert.deepEqual(slots(c.display.en.midi_input_port), ['%1$d'])
})
test('NATIVE-L6', 'manifest user-facing labels remain existing resource references', () => {
  assert.equal(manifest, c.old('android/app/src/main/AndroidManifest.xml'))
  assert.deepEqual([...manifest.matchAll(/android:label="([^"]+)"/g)].map(x => x[1]), ['@string/app_name', '@string/title_activity_main'])
})
test('NATIVE-L7', 'technical IDs are unchanged and non-translatable, absent from locale overlays', () => {
  for (const file of c.resourcePaths.filter(f => f.includes('/values/'))) {
    const current = c.strings(file), old = c.old(file)
    for (const key of ['package_name', 'custom_url_scheme']) {
      assert.equal(current[key].translatable, false)
      assert.equal(current[key].value, old.match(new RegExp(`<string name="${key}">([^<]+)</string>`))[1])
    }
  }
})
test('NATIVE-L8', 'actual MIDI device/manufacturer/product/port names preserved before fallback', () => {
  assert.equal(c.normalizeMidi(c.read(c.midiPath)), c.old(c.midiPath))
  assert.match(c.read(c.midiPath), /port\.name\?\.takeIf \{ it\.isNotBlank\(\) \} \?: context\.getString\(R\.string\.midi_input_port, port\.portNumber \+ 1\)/)
})
test('NATIVE-L9', 'resource values used only for existing display name fields, not identities', () => {
  const source = c.read(c.midiPath)
  assert.equal((source.match(/R\.string\./g) || []).length, 2); c.assertNativePresentationOnly()
})
test('NATIVE-L10', 'Web preference/infrastructure/bridge files remain byte-frozen; no locale bridge', () => {
  c.git(['diff', '--exit-code', c.base, '--', 'prototype', 'src', 'capacitor.config.ts'])
})
test('NATIVE-L11', 'no per-app locale sync/configuration override/recreate implementation', () => {
  const source = Object.keys(c.literalPolicies).map(f => c.read(c.nativeDir + f)).join('\n')
  assert.doesNotMatch(source, /LocaleManager|setApplicationLocales|LocaleListCompat|updateConfiguration|attachBaseContext|createConfigurationContext|\.recreate\s*\(/)
  c.git(['diff', '--exit-code', c.base, '--', 'android/app/src/main/java/com/pianofundamentals/trainer/MainActivity.java', 'android/app/src/main/AndroidManifest.xml'])
})
test('NATIVE-L12', 'Theme native runtime/trust/storage/schema behavior frozen', () => {
  for (const f of Object.keys(c.literalPolicies).filter(f => /Theme/.test(f))) assert.equal(c.read(c.nativeDir + f), c.old(c.nativeDir + f))
  c.git(['diff', '--exit-code', c.base, '--', 'theme-api', 'theme-packages'])
})
test('NATIVE-L13', 'Updater native/network/installer behavior frozen and system UI not duplicated', () => {
  for (const f of ['AndroidUpdaterPlugin.kt', 'AndroidUpdaterSecurityPolicy.kt', 'AndroidManifestTransportPolicy.kt']) assert.equal(c.read(c.nativeDir + f), c.old(c.nativeDir + f))
})
test('NATIVE-L14', 'native business/signing/version/permissions/assets frozen beyond exact display delta', () => {
  c.assertNativePresentationOnly()
  assert.deepEqual([...c.read('android/version.properties').matchAll(/^(versionCode|versionName)=([^\n]+)$/gm)].map(m => [m[1], m[2]]), [['versionCode', '14'], ['versionName', '1.6.0']])
  assert.equal(c.git(['rev-parse', 'v1.6.0^{}']).trim(), '1cc465afad7fae7d00508fb20a0e36e176c8fb90')
  const file = 'scripts/android-signing-foundation-check.cjs'
  const before = '  assert.match(strings, /<string name="app_name">钢琴基本功训练器<\\/string>/)'
  const after = '  assert.match(strings, /<string name="app_name">Piano Fundamentals Trainer<\\/string>/)\n' +
    '  assert.match(read(\'android/app/src/main/res/values-zh/strings.xml\'), /<string name="app_name">钢琴基本功训练器<\\/string>/)'
  assert.equal(c.read(file), c.old(file).replace(before, after), 'explicit user exception changes ONLY the app-label assertion; all 14 signing callbacks otherwise exact')
})
test('NATIVE-L15', 'all native production source literals classified; no direct UI literals remain', () => {
  const inventory = c.literalInventory(); assert.ok(inventory.length > 0)
  for (const row of inventory) assert.ok(row.category === 'D' && row.reason && row.line > 0)
  const source = Object.keys(c.literalPolicies).map(f => c.read(c.nativeDir + f)).join('\n')
  assert.doesNotMatch(source, /Toast\.makeText|Snackbar\.make|AlertDialog|NotificationChannel|NotificationCompat|setContentTitle|setContentText|setText\(|setContentDescription\(/)
  assert.doesNotMatch(source, /"(?:确定|取消|安装失败|重试|MIDI 设备|MIDI 输入)/)
  console.log(`NATIVE_LITERAL_CLASSIFIED_COUNT=${inventory.length}; NATIVE_UNCLASSIFIED_USER_FACING_LITERAL_COUNT=0`)
})
let passed = 0
for (const { id, name, run } of tests) {
  try { run(); passed++; console.log(`PASS ${id} ${name}`) }
  catch (error) { process.exitCode = 1; console.error(`FAIL ${id} ${name}\n${error.stack}`) }
}
console.log(`${passed}/${tests.length} Android native locale source contracts PASS`)
// Packaged Android resources are checked separately; these are not runtime/pixel tests.
