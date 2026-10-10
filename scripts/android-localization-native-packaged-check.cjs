const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { execFileSync } = require('node:child_process')
const c = require('./android-localization-native-contract.cjs')
const args = process.argv.slice(2)
const production = args.includes('--production-apk')
const qaLinked = args.includes('--qa-resources')
const expectedOptions = production ? ['--aapt2', '--production-apk', '--release-resources'] : ['--aapt2', '--qa-apk', qaLinked ? '--qa-resources' : '--debug-resources']
assert.equal(args.length, expectedOptions.length * 2, 'exactly one explicit APK/resource input pair')
for (let i = 0; i < args.length; i += 2) assert.ok(expectedOptions.includes(args[i]), 'unknown or mixed-channel option: ' + args[i])
for (const name of expectedOptions) assert.equal(args.filter(arg => arg === name).length, 1, 'exactly one ' + name)
function option(name) {
  const i = args.indexOf(name)
  assert.ok(i >= 0 && args[i + 1] && !args[i + 1].startsWith('--'), name + ' must be explicit')
  return path.resolve(args[i + 1])
}
const aapt = option('--aapt2'), apk = option(production ? '--production-apk' : '--qa-apk'), linkedResources = option(production ? '--release-resources' : qaLinked ? '--qa-resources' : '--debug-resources')
for (const file of [aapt, apk, linkedResources]) assert.ok(fs.statSync(file).isFile(), file)
c.assertNativePresentationOnly()
const dump = file => execFileSync(aapt, ['dump', 'resources', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const packaged = dump(apk), linked = dump(linkedResources)
// QA linked resources include QA package/title overrides just like the QA APK.
// Debug/release linked resources retain the original unsuffixed exact contracts.
const resourceInputs = [[linked, qaLinked], [packaged, !production]]
console.log(`PACKAGED_INPUT_CHANNEL=${production ? 'PRODUCTION' : 'QA'}; APK=${apk}; LINKED_RESOURCES=${linkedResources}`)
function values(raw, key) {
  const block = raw.match(new RegExp(`\\bstring/${key}\\r?\\n([\\s\\S]*?)(?=\\r?\\n\\s*resource |\\r?\\n\\s*type |$)`))
  assert.ok(block, key + ' is present in compiled resource table')
  const entries = [...block[1].matchAll(/^\s+\(([^)]*)\) ("(?:\\.|[^"\\])*")\s*$/gm)].map(m => [m[1], JSON.parse(m[2])])
  assert.equal(new Set(entries.map(x => x[0])).size, entries.length, key + ': no duplicate compiled configuration')
  return Object.fromEntries(entries)
}
let passed = 0
function test(id, description, run) {
  try { run(); passed++; console.log(`PASS ${id} ${description}`) }
  catch (error) { process.exitCode = 1; console.error(`FAIL ${id} ${description}\n${error.stack}`) }
}
test('PACK1', 'actual linked resources and selected APK have exact default/zh/zh-Hant values', () => {
  for (const [raw, isQa] of resourceInputs) for (const key of Object.keys(c.display.en)) {
    const suffix = isQa && ['app_name', 'title_activity_main'].includes(key) ? ' QA' : ''
    assert.deepEqual(values(raw, key), { '': c.display.en[key] + suffix, zh: c.display.zh[key] + suffix, 'b+zh+Hant': c.display.zh[key] + suffix })
  }
})
test('PACK2', 'technical package/scheme have only their unchanged default configuration', () => {
  for (const [raw, isQa] of resourceInputs) for (const key of ['package_name', 'custom_url_scheme']) assert.deepEqual(values(raw, key), { '': 'com.pianofundamentals.trainer' + (isQa ? '.qa' : '') })
})
// This verifies packaged coverage for Android's standard language/script matching.
// It deliberately does not pretend that selecting a JS map runs Android Resources.getString.
for (const [id, locale, qualifier, description] of [
  ['N1', 'zh-CN', 'zh', 'Simplified Chinese under the zh/Hans-compatible configuration'],
  ['N2', 'zh-TW', 'b+zh+Hant', 'Simplified Chinese explicitly packaged for the Hant script'],
  ['N3', 'zh-HK', 'b+zh+Hant', 'Simplified Chinese explicitly packaged for the Hant script'],
  ['N4', 'en-US', '', 'complete English default; no Chinese default'],
  ['N5', 'en-GB', '', 'complete English default; no regional override'],
  ['N6', 'ja-JP', '', 'complete English default; no app-owned Japanese override'],
  ['N7', 'zz-ZZ', '', 'complete English default; no unknown-language override'],
  ['N8', 'zh-SG', 'zh', 'Simplified Chinese under the zh/Hans-compatible configuration']
]) test(id, `${locale}: PACKAGED QUALIFIER COVERAGE ONLY — ${description}`, () => {
  for (const [raw, isQa] of resourceInputs) for (const key of Object.keys(c.display.en)) {
    const suffix = isQa && ['app_name', 'title_activity_main'].includes(key) ? ' QA' : ''
    assert.equal(values(raw, key)[qualifier], c.display[qualifier ? 'zh' : 'en'][key] + suffix)
  }
})
if (production) test('PACK3', 'Production APK has exact package/version, no debug identity and permanent signer', () => {
  const badging = execFileSync(aapt, ['dump', 'badging', apk], { encoding: 'utf8' })
  assert.match(badging, /package: name='com\.pianofundamentals\.trainer' versionCode='16' versionName='1\.7\.1'/)
  assert.doesNotMatch(badging, /^application-debuggable$/m)
  assert.match(badging, /^application-label:'Piano Fundamentals Trainer'$/m)
  const signing = execFileSync(process.execPath, [path.join(__dirname, 'android-apk-signing-report.cjs'), apk, '--expect-release'], { encoding: 'utf8' })
  assert.match(signing, /Build status: RELEASE \/ NON-DEBUGGABLE/)
  assert.match(signing, /Permanent signer pin match: PASS/)
  assert.match(signing, /APK signature verification: PASS/)
})
else test('PACK3', 'APK stays QA/debuggable channel with isolated package and exact candidate version', () => {
  const badging = execFileSync(aapt, ['dump', 'badging', apk], { encoding: 'utf8' })
  assert.match(badging, /package: name='com\.pianofundamentals\.trainer\.qa' versionCode='16' versionName='1\.7\.1'/)
  assert.match(badging, /^application-debuggable$/m)
  assert.match(badging, /^application-label:'Piano Fundamentals Trainer QA'$/m)
})
console.log(`${passed}/11 native packaged resource contracts PASS`)
console.log('EVIDENCE_LEVEL=ANDROID_RESOURCE_MERGE_AND_AAPT_PACKAGED_CONFIGURATIONS; LIVE_ANDROID_RESOURCE_RESOLVER_NOT_EXECUTED; REAL_DEVICE_VISUAL_NOT_PERFORMED')
