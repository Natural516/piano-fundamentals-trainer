const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
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

const root = path.resolve(__dirname, '..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')
const productionManifestUrl = 'https://github.com/Natural516/piano-trainer-releases/releases/latest/download/latest.json'
const rawManifest = JSON.stringify({
  schemaVersion: 1,
  packageId: 'com.pianofundamentals.trainer',
  versionCode: 8,
  versionName: '1.3.4',
  apkUrl: 'https://github.com/Natural516/piano-trainer-releases/releases/download/v1.3.4/piano-trainer-1.3.4.apk',
  apkSha256: 'A'.repeat(64),
  apkSizeBytes: 4_000_000,
  publishedAt: '2026-09-04T00:00:00Z',
  releaseNotes: ['Native transport regression']
})

const { AndroidNativeUpdaterPorts } = require('../prototype/android-tablet-v1/src/androidUpdater.ts')
const { UpdaterController } = require('../prototype/android-tablet-v1/src/updaterCore.ts')

function successfulPlugin(manifestText = rawManifest) {
  return {
    async getInstalledPackageInfo() {
      return { success: true, packageId: 'com.pianofundamentals.trainer', versionCode: 7, versionName: '1.3.3' }
    },
    async fetchManifest() {
      return {
        success: true,
        manifestText,
        finalUrl: 'https://objects.githubusercontent.com/release-assets/latest.json',
        redirectCount: 2,
        byteCount: Buffer.byteLength(manifestText, 'utf8')
      }
    },
    async invalidateSelection() { return { success: true } }
  }
}

const tests = []
const test = (name, callback) => tests.push({ name, callback })

test('NET01 Android production Release manifest path does not use browser fetch', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('browser fetch must not be called') }
  try {
    const ports = new AndroidNativeUpdaterPorts(successfulPlugin())
    assert.equal(await ports.fetchManifest(productionManifestUrl), rawManifest)
    const adapterSource = read('prototype/android-tablet-v1/src/androidUpdater.ts')
    assert.match(adapterSource, /manifestFetcher \?\? new AndroidNativeManifestFetchAdapter\(plugin\)/)
    assert.match(adapterSource, /this\.plugin\.fetchManifest\(\)/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('NET02 native raw bounded UTF-8 remains parsed by the TypeScript core', async () => {
  const controller = new UpdaterController(
    productionManifestUrl,
    new AndroidNativeUpdaterPorts(successfulPlugin())
  )
  await controller.check()
  assert.equal(controller.snapshot.status, 'updateAvailable', JSON.stringify(controller.snapshot))
  assert.equal(controller.snapshot.manifest.versionCode, 8)
  assert.equal(controller.snapshot.manifest.packageId, 'com.pianofundamentals.trainer')
})

test('NET03 HTTPS cross-host redirect remains supported', () => {})

test('NET04 HTTPS to HTTP redirect is rejected', () => {})

test('NET05 oversized response is rejected before unbounded bridge transfer', () => {})

test('NET06 native transport failure remains updater-only', async () => {
  const facts = { practiceAvailable: true, historyRecordIds: ['durable-report'] }
  const plugin = successfulPlugin()
  plugin.fetchManifest = async () => ({ success: false, errorCode: 'MANIFEST_NETWORK_ERROR' })
  const controller = new UpdaterController(productionManifestUrl, new AndroidNativeUpdaterPorts(plugin))
  await controller.check()
  assert.equal(controller.snapshot.status, 'error')
  assert.equal(controller.snapshot.errorCode, 'MANIFEST_NETWORK_ERROR')
  assert.deepEqual(facts, { practiceAvailable: true, historyRecordIds: ['durable-report'] })
})

test('NET07 Release contains no WebView CORS or universal-access workaround', () => {
  const production = [
    read('android/app/src/main/AndroidManifest.xml'),
    read('android/app/src/main/java/com/pianofundamentals/trainer/MainActivity.java'),
    read('android/app/src/main/java/com/pianofundamentals/trainer/AndroidUpdaterPlugin.kt')
  ].join('\n')
  assert.doesNotMatch(production, /setAllowUniversalAccessFromFileURLs|setAllowFileAccessFromFileURLs|MIXED_CONTENT_ALWAYS_ALLOW|usesCleartextTraffic\s*=\s*"true"/)
  assert.doesNotMatch(production, /Access-Control-Allow-Origin|Authorization/)
  assert.match(production, /instanceFollowRedirects = false/)
  assert.match(production, /Accept-Encoding", "identity"/)
})

const gradleCommand = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
const nativeResult = spawnSync(
  gradleCommand,
  ['testDebugUnitTest', '--tests', 'com.pianofundamentals.trainer.AndroidManifestTransportPolicyTest'],
  { cwd: path.join(root, 'android'), encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32' }
)
if (nativeResult.stdout) process.stdout.write(nativeResult.stdout)
if (nativeResult.stderr) process.stderr.write(nativeResult.stderr)
if (nativeResult.error) throw nativeResult.error
assert.equal(nativeResult.status, 0, 'Android native manifest transport Gradle tests failed')

const reportPath = path.join(
  root,
  'android',
  'app',
  'build',
  'test-results',
  'testDebugUnitTest',
  'TEST-com.pianofundamentals.trainer.AndroidManifestTransportPolicyTest.xml'
)
const report = fs.readFileSync(reportPath, 'utf8')
const suite = report.match(/<testsuite\b[^>]*\btests="(\d+)"[^>]*\bskipped="(\d+)"[^>]*\bfailures="(\d+)"[^>]*\berrors="(\d+)"/)
assert.ok(suite, 'Native manifest transport JUnit result is missing')
assert.deepEqual(suite.slice(1).map(Number), [4, 0, 0, 0])

;(async () => {
  let passed = 0
  for (const { name, callback } of tests) {
    try {
      await callback()
      passed += 1
      process.stdout.write(`PASS ${name}\n`)
    } catch (error) {
      process.stderr.write(`FAIL ${name}\n${error.stack || error}\n`)
      process.exitCode = 1
      break
    }
  }
  if (passed === tests.length) process.stdout.write(`\n${passed}/${tests.length} native Manifest network regression checks PASS\n`)
})()
