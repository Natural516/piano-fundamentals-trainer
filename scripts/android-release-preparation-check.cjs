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
assert.deepEqual(properties, { versionCode: '17', versionName: '1.7.2' })
console.log('PASS Android release version source and public stable facts: 1.7.2 / code17')

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
assert.equal(assertPublicReleaseFacts(publicSource, '17', '1.7.2'), 12)
const stableScreenshots = [
  'docs/screenshots/android-v1.7.1-home.png',
  'docs/screenshots/android-v1.7.1-sight-reading.png',
  'docs/screenshots/android-v1.7.1-chord-practice.png',
  'docs/screenshots/android-v1.7.1-interval-practice.png',
  'docs/screenshots/android-v1.7.2-sight-report.png',
  'docs/screenshots/android-v1.7.2-sight-analysis.png'
]
const stableEnglishScreenshots = stableScreenshots.map(file => file.replace(/android-(v1\.7\.[12])-/, 'android-$1-en-'))
const readme = documents.get('README.md').replaceAll('\r\n', '\n')
const screenshotReferences = [...new Set(readme.match(/docs\/screenshots\/[^)\s"'<>]+\.png/g) ?? [])]
assert.deepEqual(screenshotReferences.slice().sort(), [...stableScreenshots, ...stableEnglishScreenshots].sort())
assert.equal(screenshotReferences.filter(file => stableScreenshots.includes(file)).length, 6)
assert.equal(screenshotReferences.filter(file => stableEnglishScreenshots.includes(file)).length, 6)
assert.ok(readme.includes('**Android 1.7.1 正式应用**'))
assert.ok(readme.includes('**Android 1.7.1 production app**'))
assert.ok(readme.includes('**Android 1.7.2 正式应用**'))
assert.ok(readme.includes('**Android 1.7.2 production app**'))
assert.doesNotMatch(readme, /Development preview:|android-development-en-|android-v1\.6\.0-/)
console.log('PASS exact screenshot paths: 6 Production Chinese + 6 Production English = 12, honest 1.7.1 unchanged pages / 1.7.2 report and analysis attribution')

const stableFact = '\nAndroid 1.7.2\n'
assert.ok(readme.includes(stableFact), 'negative fixtures must mutate the actual stable release fact')
const withReadme = source => ({paths, documents: new Map(documents).set('README.md', source)})
for (const formatted of ['\nAndroid `1.7.2`\n', '\n**Android 1.7.2**\n']) {
  assert.equal(assertPublicReleaseFacts(withReadme(readme.replace(stableFact, formatted)), '17', '1.7.2'), 12)
}
for (const invalid of [
  '\nAndroid 1.7.1\n',
  '\nAndroid 1.7.20\n',
  '\nAndroid\n',
  '\n'
]) {
  assert.throws(() => assertPublicReleaseFacts(withReadme(readme.replace(stableFact, invalid)), '17', '1.7.2'), /public README stable release/)
}
for (const invalidCode of ['16', '170', '']) {
  const invalidChangelog = documents.get('CHANGELOG.md').replace('## 1.7.2 — 2026-10-12 — versionCode 17', `## 1.7.2 — 2026-10-12 — versionCode ${invalidCode}`)
  assert.throws(() => assertPublicReleaseFacts({paths, documents: new Map(documents).set('CHANGELOG.md', invalidChangelog)}, '17', '1.7.2'))
}
assert.throws(() => assertPublicReleaseFacts({...publicSource, paths: paths.filter(file => file !== stableEnglishScreenshots[0])}, '17', '1.7.2'), /missing screenshots/)
console.log('PASS release facts are Markdown-independent and reject wrong/missing values, prefix matches and missing screenshots')
publicPathAudit(paths)
assertNoLegacyRepositoryReferences(documents, 'integration public docs')
assert.match(read('CHANGELOG.md'), /^## 1\.6\.0 — 2026-10-02 — versionCode 14$/m)
assert.match(read('CHANGELOG.md'), /^## 1\.7\.0 — 2026-10-05 — versionCode 15$/m)
assert.match(read('CHANGELOG.md'), /^## 1\.7\.1 — 2026-10-07 — versionCode 16$/m)
const released171Changelog = cp.execFileSync('git', ['show', '5b5b0afa4b17c1e2847b01f3ca13c879d55f5540:CHANGELOG.md'], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n')
assert.equal(read('CHANGELOG.md').replaceAll('\r\n', '\n').slice(read('CHANGELOG.md').replaceAll('\r\n', '\n').indexOf('## 1.7.1 —')), released171Changelog.slice(released171Changelog.indexOf('## 1.7.1 —')), 'entire published 1.7.1 and older changelog retained')
const released170Changelog = cp.execFileSync('git', ['show', '4c02a828938a4afc90ec1dc3b90e2824449fbb21:CHANGELOG.md'], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n')
assert.equal(read('CHANGELOG.md').replaceAll('\r\n', '\n').slice(read('CHANGELOG.md').replaceAll('\r\n', '\n').indexOf('## 1.7.0 —')), released170Changelog.slice(released170Changelog.indexOf('## 1.7.0 —')))
// The tag predates the post-release date closure; freeze the accepted final 1.6.0 section instead.
const closed160Changelog = cp.execFileSync('git', ['show', '37fb125f0192e351a86b350d85569704ec050c40:CHANGELOG.md'], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n')
assert.equal(read('CHANGELOG.md').replaceAll('\r\n', '\n').slice(read('CHANGELOG.md').replaceAll('\r\n', '\n').indexOf('## 1.6.0 —')), closed160Changelog.slice(closed160Changelog.indexOf('## 1.6.0 —')))
assert.ok(readme.includes('使用内置浅色主题'))
assert.ok(readme.includes('with the built-in Light theme'))
const previousChangelog = git('show', '4866e59:CHANGELOG.md')
assert.ok(read('CHANGELOG.md').replaceAll('\r\n', '\n').includes(previousChangelog.slice(previousChangelog.indexOf('## 1.5.3')).replaceAll('\r\n', '\n').trim()))
assert.doesNotMatch(read('README.md'), /音程复现|双模式|0\.9\.1-beta/)
console.log('PASS public document/path contracts, old CHANGELOG retained and screenshots honestly attributed')
