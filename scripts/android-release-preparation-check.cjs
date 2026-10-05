const assert = require('node:assert/strict')
const cp = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const git = (...args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const { assertPublicReleaseFacts, assertNoLegacyRepositoryReferences, publicPathAudit } = require('./android-release-preflight.cjs')
const properties = Object.fromEntries(read('android/version.properties').split(/\r?\n/).filter(line => /^\w+=/.test(line)).map(line => line.split('=')))
assert.deepEqual(properties, { versionCode: '15', versionName: '1.7.0' })
console.log('PASS Android candidate version source: 1.7.0 / code15; public stable remains 1.6.0 / code14')

const gradle = read('android/app/build.gradle')
assert.match(gradle, /rootProject\.file\('version\.properties'\)/)
assert.match(gradle, /versionCode appVersionCode/)
assert.match(gradle, /versionName appVersionName/)
assert.match(gradle, /buildConfigField "String", "THEME_HOST_COMPAT_VERSION", "\\"[$]\{appVersionName\}\\""/)
assert.doesNotMatch(gradle, /THEME_HOST_COMPAT_VERSION.*1\.5\.3/)
assert.match(gradle, /applicationId "com\.pianofundamentals\.trainer"/)
assert.match(gradle, /applicationIdSuffix "\.qa"/)
const plugin = read('android/app/src/main/java/com/pianofundamentals/trainer/ThemePackagePlugin.kt')
assert.match(plugin, /NativeThemeArchiveValidator\(.*BuildConfig\.THEME_HOST_COMPAT_VERSION\)/)
const vite = read('vite.android-prototype.config.ts')
assert.match(vite, /readFileSync\(resolve\('android\/version\.properties'\)/)
assert.match(vite, /__ANDROID_VERSION_CODE__: JSON\.stringify\(androidVersionCode\)/)
assert.match(vite, /__ANDROID_VERSION_NAME__: JSON\.stringify\(androidVersionName\)/)
for (const file of ['scripts/android-apk-signing-report.cjs', 'scripts/android-release-preflight.cjs']) {
  assert.match(read(file), /version\.properties/)
}
console.log('PASS Gradle / native host / Vite / signing verification / preflight use the shared version source')

const manifest = JSON.parse(read('theme-packages/bocchi/manifest.json'))
assert.equal(manifest.themeId, 'natural516.bocchi')
assert.equal(manifest.version, '1.1.0')
assert.equal(manifest.minAppVersion, '1.6.0')
assert.equal(manifest.maxAppVersionExclusive, '2.0.0')
assert.equal(manifest.signature, null)
console.log('PASS Bocchi SOURCE 1.1.0 / [1.6.0, 2.0.0), unsigned metadata only')

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, filename)
const { adaptExternalTheme } = require('../prototype/android-tablet-v1/src/theme/runtimeThemeAdapter.ts')
// Use the real frozen old source definition from the public release, not a mutilated new fixture.
const oldManifest = JSON.parse(git('show', '4866e59:theme-packages/bocchi/manifest.json'))
const oldTheme = JSON.parse(git('show', '4866e59:theme-packages/bocchi/theme.json'))
assert.equal(oldManifest.version, '1.0.0')
assert.equal(oldManifest.minAppVersion, '1.5.3')
const runtime = adaptExternalTheme(oldManifest, oldTheme, { resolveAsset: (_id, _version, asset) => 'https://safe.invalid/' + asset })
assert.equal(runtime.version, '1.0.0')
assert.equal(runtime.capabilities.intervalPracticeVisual.kind, 'standard')
console.log('PASS real old Bocchi 1.0.0 definition uses standard Interval fallback')

const paths = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter(Boolean)
const documents = new Map(paths.filter(p => p.endsWith('.md')).map(p => [p, read(p)]))
const publicSource = {paths, documents}
assert.equal(assertPublicReleaseFacts(publicSource, '14', '1.6.0'), 8)
const stableScreenshots = [
  'docs/screenshots/android-v1.6.0-home.png',
  'docs/screenshots/android-v1.6.0-sight-reading.png',
  'docs/screenshots/android-v1.6.0-chord-practice.png',
  'docs/screenshots/android-v1.6.0-history.png'
]
const developmentEnglishScreenshots = [
  'docs/screenshots/android-development-en-home.png',
  'docs/screenshots/android-development-en-sight-reading.png',
  'docs/screenshots/android-development-en-chord-practice.png',
  'docs/screenshots/android-development-en-history.png'
]
const readme = documents.get('README.md')
const screenshotReferences = [...new Set(readme.match(/docs\/screenshots\/[^)\s"'<>]+/g) ?? [])]
assert.deepEqual(screenshotReferences.slice().sort(), [...stableScreenshots, ...developmentEnglishScreenshots].sort())
assert.equal(screenshotReferences.filter(file => stableScreenshots.includes(file)).length, 4)
assert.equal(screenshotReferences.filter(file => developmentEnglishScreenshots.includes(file)).length, 4)
assert.ok(readme.includes('**Development preview:**'))
console.log('PASS exact screenshot paths: 4 stable + 4 development English = 8, development attribution retained')

const stableFact = 'Android 1.6.0 · versionCode 14'
assert.ok(readme.includes(stableFact), 'negative fixtures must mutate the actual stable release fact')
const withReadme = source => ({paths, documents: new Map(documents).set('README.md', source)})
for (const formatted of ['Android `1.6.0` · `versionCode 14`', '**Android 1.6.0 · versionCode 14**']) {
  assert.equal(assertPublicReleaseFacts(withReadme(readme.replace(stableFact, formatted)), '14', '1.6.0'), 8)
}
for (const invalid of [
  'Android 1.5.3 · versionCode 14',
  'Android 1.6.01 · versionCode 14',
  'Android 1.6.0 · versionCode 13',
  'Android 1.6.0 · versionCode 140',
  'Android 1.6.0'
]) {
  assert.throws(() => assertPublicReleaseFacts(withReadme(readme.replace(stableFact, invalid)), '14', '1.6.0'), /public README stable release/)
}
assert.throws(() => assertPublicReleaseFacts({...publicSource, paths: paths.filter(file => file !== developmentEnglishScreenshots[0])}, '14', '1.6.0'), /missing screenshots/)
console.log('PASS release facts are Markdown-independent and reject wrong/missing values, prefix matches and missing screenshots')
publicPathAudit(paths)
assertNoLegacyRepositoryReferences(documents, 'integration public docs')
assert.match(read('CHANGELOG.md'), /^## 1\.6\.0 — 2026-10-02 — versionCode 14$/m)
const previousChangelog = git('show', '4866e59:CHANGELOG.md')
assert.ok(read('CHANGELOG.md').replaceAll('\r\n', '\n').includes(previousChangelog.slice(previousChangelog.indexOf('## 1.5.3')).replaceAll('\r\n', '\n').trim()))
assert.doesNotMatch(read('README.md'), /音程复现|双模式|0\.9\.1-beta/)
console.log('PASS public document/path contracts, old CHANGELOG retained and screenshots honestly attributed')
