const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repositoryRoot = path.resolve(__dirname, '..')
const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8')
const checks = []
const check = (name, callback) => checks.push({ name, callback })

check('permanent Android identity remains frozen', () => {
  const gradle = read('android/app/build.gradle')
  const capacitor = read('capacitor.config.ts')
  const strings = read('android/app/src/main/res/values/strings.xml')
  assert.match(gradle, /applicationId "com\.pianofundamentals\.trainer"/)
  assert.match(capacitor, /appId: 'com\.pianofundamentals\.trainer'/)
  assert.match(capacitor, /appName: '钢琴基本功训练器'/)
  assert.match(strings, /<string name="app_name">钢琴基本功训练器<\/string>/)
})

check('Android version has one explicit committed source', () => {
  const version = read('android/version.properties')
  const gradle = read('android/app/build.gradle')
  assert.match(version, /^versionCode=9$/m)
  assert.match(version, /^versionName=1\.4\.0$/m)
  assert.match(gradle, /rootProject\.file\('version\.properties'\)/)
  assert.match(gradle, /versionCode appVersionCode/)
  assert.match(gradle, /versionName appVersionName/)
})

check('release signing is fail-closed and never falls back to debug', () => {
  const gradle = read('android/app/build.gradle')
  assert.match(gradle, /Release signing credentials are missing/)
  assert.match(gradle, /No debug-signing fallback is allowed/)
  assert.match(gradle, /signingConfig signingConfigs\.getByName\('release'\)/)
  assert.doesNotMatch(gradle, /signingConfig\s+signingConfigs\.debug/)
  assert.match(gradle, /keystore must not be stored inside the Git repository/)
  assert.match(gradle, /permanentReleaseKeyAlias = 'piano-fundamentals'/)
  assert.match(gradle, /Release signing keyAlias must match the permanent application identity/)
})

check('local secrets and private key extensions are ignored', () => {
  const ignore = read('.gitignore')
  assert.match(ignore, /^android\/keystore\.properties$/m)
  assert.match(ignore, /^\*\.jks$/m)
  assert.match(ignore, /^\*\.keystore$/m)
  assert.match(ignore, /^\*\.p12$/m)
  assert.match(ignore, /^\*\.pfx$/m)
  const visibleFiles = []
  const walk = (directory, relative = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', '.git', 'build', 'dist'].includes(entry.name)) continue
      const childRelative = path.join(relative, entry.name)
      const child = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(child, childRelative)
      else visibleFiles.push(childRelative.replaceAll('\\', '/'))
    }
  }
  walk(repositoryRoot)
  assert.equal(visibleFiles.some((file) => /(^|\/)keystore\.properties$/i.test(file)), false)
  assert.equal(visibleFiles.some((file) => /\.(jks|keystore|p12|pfx)$/i.test(file)), false)
})

check('committed signing example contains placeholders but no passwords', () => {
  const example = read('android/keystore.properties.example')
  assert.match(example, /^storeFile=C:\/Users\/YOUR_ACCOUNT\/\.android-signing\/piano-fundamentals-release\.jks$/m)
  assert.match(example, /^keyAlias=piano-fundamentals$/m)
  assert.match(example, /^storePassword=$/m)
  assert.match(example, /^keyPassword=$/m)
})

check('release, verification and signing-test commands are explicit', () => {
  const scripts = JSON.parse(read('package.json')).scripts
  assert.equal(scripts['android:apk:release'], 'npm run android:sync:release && cd android && gradlew.bat assembleRelease')
  assert.match(scripts['android:verify:debug'], /--expect-debug$/)
  assert.match(scripts['android:verify:release'], /--expect-release$/)
  assert.equal(scripts['test:android-signing'], 'node scripts/android-signing-foundation-check.cjs')
})

check('APK verifier reports public metadata without reading signing secrets', () => {
  const verifier = read('scripts/android-apk-signing-report.cjs')
  assert.match(verifier, /Package ID:/)
  assert.match(verifier, /Version code:/)
  assert.match(verifier, /Version name:/)
  assert.match(verifier, /Signer certificate SHA-256:/)
  assert.doesNotMatch(verifier, /STORE_PASSWORD|KEY_PASSWORD|keystore\.properties/)
})

check('release-signing runbook covers interactive generation, migration and backup', () => {
  const documentation = read('android/RELEASE_SIGNING.md')
  assert.match(documentation, /keytool\.exe[\s\S]*-genkeypair/)
  assert.match(documentation, /piano-fundamentals-release\.jks/)
  assert.match(documentation, /-alias "piano-fundamentals"/)
  assert.match(documentation, /uninstall/i)
  assert.match(documentation, /offline backup/i)
  assert.match(documentation, /password manager/i)
})

let failures = 0
for (const item of checks) {
  try {
    item.callback()
    process.stdout.write(`PASS ${item.name}\n`)
  } catch (error) {
    failures += 1
    process.stderr.write(`FAIL ${item.name}\n${error.stack ?? error}\n`)
  }
}

if (failures) {
  process.stderr.write(`\n${failures}/${checks.length} Android signing foundation checks FAILED\n`)
  process.exit(1)
}
process.stdout.write(`\n${checks.length}/${checks.length} Android signing foundation checks PASS\n`)
