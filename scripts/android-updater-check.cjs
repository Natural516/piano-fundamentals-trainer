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
  UPDATER_PACKAGE_ID,
  UPDATER_PINNED_SIGNER_SHA256,
  UpdaterController,
  UpdaterFailure,
  parseUpdaterManifest
} = require('../prototype/android-tablet-v1/src/updaterCore.ts')
const { HttpsManifestFetchAdapter } = require('../prototype/android-tablet-v1/src/androidUpdater.ts')

const root = path.resolve(__dirname, '..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

function manifest(overrides = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    packageId: UPDATER_PACKAGE_ID,
    versionCode: 5,
    versionName: '1.4.0',
    apkUrl: 'https://updates.example.test/app-1.4.0.apk',
    apkSha256: 'A'.repeat(64),
    apkSizeBytes: 4_000_000,
    publishedAt: '2026-09-02T00:00:00Z',
    releaseNotes: ['Safe plain text'],
    ...overrides
  })
}

class FakePorts {
  constructor(options = {}) {
    this.installed = options.installed ?? { packageId: UPDATER_PACKAGE_ID, versionCode: 4, versionName: '1.3.0' }
    this.manifestSource = options.manifestSource ?? manifest()
    this.manifestFailure = options.manifestFailure ?? null
    this.verificationFailure = options.verificationFailure ?? null
    this.installFailure = options.installFailure ?? null
    this.capability = options.capability ?? 'READY'
    this.history = options.history ?? [{ recordId: 'durable-a4.2' }]
    this.practiceAvailable = true
    this.installTokens = []
    this.invalidations = 0
  }

  async getInstalledPackageInfo() { return { ...this.installed } }
  async fetchManifest() {
    if (this.manifestFailure) throw this.manifestFailure
    return this.manifestSource
  }
  async invalidateSelection() { this.invalidations += 1 }
  async downloadAndVerify(request, onProgress) {
    onProgress({ stage: 'downloading', receivedBytes: request.expectedSize, totalBytes: request.expectedSize })
    onProgress({ stage: 'verifying', receivedBytes: request.expectedSize, totalBytes: request.expectedSize })
    if (this.verificationFailure) throw this.verificationFailure
    return {
      token: 'opaque-native-token',
      packageId: UPDATER_PACKAGE_ID,
      versionCode: request.expectedVersionCode,
      sizeBytes: request.expectedSize,
      sha256: request.expectedSha256,
      signerSha256: [UPDATER_PINNED_SIGNER_SHA256]
    }
  }
  async cancelDownload() {}
  async getInstallCapability() { return this.capability }
  async openInstallSettings() {}
  async installVerifiedArtifact(token) {
    this.installTokens.push(token)
    if (this.installFailure) throw this.installFailure
  }
}

async function controllerFor(options = {}) {
  const ports = new FakePorts(options)
  const controller = new UpdaterController('https://updates.example.test/manifest.json', ports)
  await controller.initialize()
  return { controller, ports }
}

async function readyController(options = {}) {
  const value = await controllerFor(options)
  await value.controller.check()
  assert.equal(value.controller.snapshot.status, 'updateAvailable')
  await value.controller.download()
  return value
}

const tests = []
const test = (name, callback) => tests.push({ name, callback })

test('UP01 no update produces upToDate', async () => {
  const { controller } = await controllerFor({ manifestSource: manifest({ versionCode: 4, versionName: '1.3.0' }) })
  await controller.check()
  assert.equal(controller.snapshot.status, 'upToDate')
})

test('UP02 valid newer manifest produces updateAvailable', async () => {
  const { controller } = await controllerFor()
  await controller.check()
  assert.equal(controller.snapshot.status, 'updateAvailable')
  assert.equal(controller.snapshot.manifest.versionCode, 5)
})

test('UP03 older manifest is never offered', async () => {
  const { controller } = await controllerFor({ manifestSource: manifest({ versionCode: 3, versionName: '1.2.0' }) })
  await controller.check()
  assert.equal(controller.snapshot.status, 'upToDate')
  assert.equal(controller.snapshot.errorCode, 'MANIFEST_OLDER_THAN_INSTALLED')
})

test('UP04 equal version uses numeric NO_UPDATE decision', async () => {
  const { controller } = await controllerFor({ manifestSource: manifest({ versionCode: 4, versionName: '99.0.0' }) })
  await controller.check()
  assert.equal(controller.snapshot.errorCode, 'NO_UPDATE')
})

test('UP05 malformed, duplicate, unknown and oversized manifests fail closed', async () => {
  assert.throws(() => parseUpdaterManifest('{bad'), (error) => error.code === 'MANIFEST_INVALID')
  assert.throws(() => parseUpdaterManifest('{"schemaVersion":1,"schemaVersion":1}'), (error) => error.code === 'MANIFEST_INVALID')
  assert.throws(() => parseUpdaterManifest(manifest({ unknown: true })), (error) => error.code === 'MANIFEST_INVALID')
  assert.throws(() => parseUpdaterManifest(manifest({ versionCode: '5' })), (error) => error.code === 'MANIFEST_INVALID')
  assert.throws(() => parseUpdaterManifest(manifest({ apkUrl: 5 })), (error) => error.code === 'MANIFEST_INVALID')
  assert.throws(() => parseUpdaterManifest(manifest({ releaseNotes: [''] })), (error) => error.code === 'MANIFEST_INVALID')
  const originalFetch = global.fetch
  global.fetch = async () => ({
    status: 200,
    ok: true,
    url: 'https://updates.example.test/manifest.json',
    headers: new Headers({ 'Content-Length': '65537' }),
    body: null,
    arrayBuffer: async () => new ArrayBuffer(0)
  })
  try {
    await assert.rejects(
      new HttpsManifestFetchAdapter().fetchManifest('https://updates.example.test/manifest.json'),
      (error) => error.code === 'MANIFEST_INVALID'
    )
  } finally {
    global.fetch = originalFetch
  }
})

test('UP06 unsupported schema is rejected without fallback', () => {
  assert.throws(() => parseUpdaterManifest(manifest({ schemaVersion: 2 })), (error) => error.code === 'MANIFEST_UNSUPPORTED_SCHEMA')
})

test('UP07 wrong manifest package is rejected', () => {
  assert.throws(() => parseUpdaterManifest(manifest({ packageId: 'other.package' })), (error) => error.code === 'PACKAGE_ID_MISMATCH')
})

test('UP08 HTTP APK and redirect downgrade are rejected', async () => {
  assert.throws(() => parseUpdaterManifest(manifest({ apkUrl: 'http://updates.example.test/app.apk' })), (error) => error.code === 'MANIFEST_INVALID')
  const originalFetch = global.fetch
  let observedOptions = null
  global.fetch = async (_url, options) => {
    observedOptions = options
    return {
      status: 302,
      ok: false,
      url: 'https://updates.example.test/manifest.json',
      headers: new Headers({ Location: 'http://updates.example.test/manifest.json' }),
      body: null,
      arrayBuffer: async () => new ArrayBuffer(0)
    }
  }
  try {
    await assert.rejects(
      new HttpsManifestFetchAdapter().fetchManifest('https://updates.example.test/manifest.json'),
      (error) => error.code === 'MANIFEST_NETWORK_ERROR'
    )
    assert.equal(observedOptions.redirect, 'manual')
    assert.equal(observedOptions.credentials, 'omit')
  } finally {
    global.fetch = originalFetch
  }
})

for (const [id, label, code] of [
  ['UP09', 'SHA mismatch', 'APK_SHA256_MISMATCH'],
  ['UP10', 'size mismatch', 'DOWNLOAD_SIZE_MISMATCH'],
  ['UP11', 'archive package mismatch', 'APK_PACKAGE_MISMATCH'],
  ['UP12', 'APK and manifest version mismatch', 'APK_VERSION_MISMATCH'],
  ['UP13', 'downloaded version is not newer', 'APK_DOWNGRADE_REJECTED'],
  ['UP14', 'wrong signer', 'APK_SIGNER_MISMATCH'],
  ['UP15', 'Android Debug signer', 'APK_SIGNER_MISMATCH']
]) {
  test(`${id} ${label} blocks verified state`, async () => {
    const { controller } = await controllerFor({ verificationFailure: new UpdaterFailure(code) })
    await controller.check()
    await controller.download()
    assert.equal(controller.snapshot.status, 'error')
    assert.equal(controller.snapshot.errorCode, code)
  })
}

test('UP16 exact permanent-signed result reaches readyToInstall', async () => {
  const { controller } = await readyController()
  assert.equal(controller.snapshot.status, 'readyToInstall')
})

test('UP17 manifest network failure is isolated from practice', async () => {
  const { controller, ports } = await controllerFor({ manifestFailure: new UpdaterFailure('MANIFEST_NETWORK_ERROR') })
  await controller.check()
  assert.equal(controller.snapshot.errorCode, 'MANIFEST_NETWORK_ERROR')
  assert.equal(ports.practiceAvailable, true)
})

test('UP18 APK download network failure is isolated and retryable', async () => {
  const { controller, ports } = await controllerFor({ verificationFailure: new UpdaterFailure('DOWNLOAD_NETWORK_ERROR') })
  await controller.check()
  await controller.download()
  assert.equal(controller.snapshot.errorCode, 'DOWNLOAD_NETWORK_ERROR')
  assert.equal(controller.snapshot.retryAction, 'download')
  assert.equal(ports.practiceAvailable, true)

  class CancellablePorts extends FakePorts {
    async downloadAndVerify() {
      return new Promise((_resolve, reject) => { this.rejectDownload = reject })
    }
    async cancelDownload() {
      this.rejectDownload?.(new UpdaterFailure('DOWNLOAD_NETWORK_ERROR'))
    }
  }
  const cancellablePorts = new CancellablePorts()
  const cancellable = new UpdaterController('https://updates.example.test/manifest.json', cancellablePorts)
  await cancellable.initialize()
  await cancellable.check()
  const pendingDownload = cancellable.download()
  await Promise.resolve()
  await cancellable.cancelDownload()
  await pendingDownload
  assert.equal(cancellable.snapshot.status, 'updateAvailable')
  assert.equal(cancellable.snapshot.errorCode, null)
})

test('UP19 malformed APK archive is rejected', async () => {
  const { controller } = await controllerFor({ verificationFailure: new UpdaterFailure('APK_ARCHIVE_INVALID') })
  await controller.check()
  await controller.download()
  assert.equal(controller.snapshot.errorCode, 'APK_ARCHIVE_INVALID')
})

test('UP20 missing install permission enters permission-required state', async () => {
  const { controller } = await readyController({ capability: 'PERMISSION_REQUIRED' })
  await controller.install()
  assert.equal(controller.snapshot.status, 'installPermissionRequired')
})

test('UP21 installer launch failure is sanitized and not success', async () => {
  const { controller } = await readyController({ installFailure: new UpdaterFailure('INSTALL_LAUNCH_FAILED') })
  await controller.install()
  assert.equal(controller.snapshot.status, 'error')
  assert.equal(controller.snapshot.errorCode, 'INSTALL_LAUNCH_FAILED')
  assert.equal(controller.snapshot.retryAction, 'install')
  assert.doesNotMatch(controller.snapshot.errorMessage, /stack|Exception|\\|\//)
})

test('UP22 updater failure leaves offline core application available', async () => {
  const { controller, ports } = await controllerFor({ manifestFailure: new Error('offline') })
  await controller.check()
  assert.equal(ports.practiceAvailable, true)
  assert.equal(controller.snapshot.status, 'error')
})

test('UP23 updater has no persistence-clear authority', () => {
  const core = read('prototype/android-tablet-v1/src/updaterCore.ts')
  const native = read('android/app/src/main/java/com/pianofundamentals/trainer/AndroidUpdaterPlugin.kt')
  assert.doesNotMatch(core + native, /SharedPreferences|clearApplicationUserData|androidPersistence|removeReport|deleteHistory/)
})

test('UP24 durable History survives updater orchestration', async () => {
  const history = [{ recordId: 'before-upgrade' }, { recordId: 'stopped-before-upgrade' }]
  const { controller, ports } = await controllerFor({ history })
  await controller.check()
  assert.deepEqual(ports.history, history)
})

test('UP25 Release source contains no development updater bypass', () => {
  const core = read('prototype/android-tablet-v1/src/updaterCore.ts')
  const adapter = read('prototype/android-tablet-v1/src/androidUpdater.ts')
  const native = read('android/app/src/main/java/com/pianofundamentals/trainer/AndroidUpdaterPlugin.kt')
  const ui = read('prototype/android-tablet-v1/src/main.tsx')
  const manifestXml = read('android/app/src/main/AndroidManifest.xml')
  const paths = read('android/app/src/main/res/xml/file_paths.xml')
  for (const forbidden of ['skipSigner', 'skipHash', 'acceptAnyApk', 'httpOverride', 'install(path', 'install(url', 'install(uri']) {
    assert.equal((core + adapter + native).toLowerCase().includes(forbidden.toLowerCase()), false, forbidden)
  }
  assert.doesNotMatch(ui, /dangerouslySetInnerHTML/)
  assert.match(adapter, /redirect:\s*'manual'/)
  assert.doesNotMatch(adapter, /redirect:\s*'follow'/)
  assert.match(native, /installVerifiedArtifact/)
  assert.match(manifestXml, /android\.permission\.REQUEST_INSTALL_PACKAGES/)
  assert.match(paths, /path="update\/verified\/"/)
  assert.doesNotMatch(paths, /external-path|path="\."/)
})

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
  if (passed === tests.length) process.stdout.write(`\n${passed}/${tests.length} Android updater checks PASS\n`)
})()
