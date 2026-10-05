const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { Module } = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

const gradle = read('android', 'app', 'build.gradle')
const version = read('android', 'version.properties')
const manifest = read('android', 'app', 'src', 'main', 'AndroidManifest.xml')
const productionStrings = read('android', 'app', 'src', 'main', 'res', 'values', 'strings.xml')
const qaStrings = read('android', 'app', 'src', 'qa', 'res', 'values', 'strings.xml')
const vite = read('vite.android-prototype.config.ts')
const ui = read('prototype', 'android-tablet-v1', 'src', 'main.tsx')
const updaterPlugin = read('android', 'app', 'src', 'main', 'java', 'com', 'pianofundamentals', 'trainer', 'AndroidUpdaterPlugin.kt')
const packageJson = JSON.parse(read('package.json'))
// Read the actual static bilingual resources without mounting the app or invoking its updater.
const shellResourcePath = path.join(root, 'prototype', 'android-tablet-v1', 'src', 'localization', 'shellResources.ts')
const shellResourceModule = new Module(shellResourcePath, module)
shellResourceModule._compile(ts.transpileModule(fs.readFileSync(shellResourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, shellResourcePath)
const { shellResources } = shellResourceModule.exports

const checks = [
  ['Production applicationId remains fixed', () => assert.match(gradle, /applicationId\s+["']com\.pianofundamentals\.trainer["']/)],
  ['QA build type uses an isolated applicationId suffix', () => {
    assert.match(gradle, /qa\s*\{[\s\S]*?initWith debug[\s\S]*?applicationIdSuffix\s+["']\.qa["']/)
    assert.match(gradle, /qa\s*\{[\s\S]*?buildConfigField\s+["']String["'],\s*["']UPDATE_MANIFEST_URL["'],\s*'""'/)
  }],
  ['Candidate source version is 15 / 1.7.0; production assets are not rebuilt', () => {
    assert.match(version, /^versionCode=15$/m)
    assert.match(version, /^versionName=1\.7\.0$/m)
  }],
  ['QA launcher name and package resources are distinct', () => {
    assert.match(qaStrings, />Piano Fundamentals Trainer QA</)
    assert.match(read('android', 'app', 'src', 'qa', 'res', 'values-zh', 'strings.xml'), />钢琴基本功训练器 QA</)
    assert.match(qaStrings, />com\.pianofundamentals\.trainer\.qa</)
  }],
  ['Production approved bilingual launcher names have no QA marker', () => {
    assert.match(productionStrings, />Piano Fundamentals Trainer</)
    assert.match(read('android', 'app', 'src', 'main', 'res', 'values-zh', 'strings.xml'), />钢琴基本功训练器</)
    assert.doesNotMatch(productionStrings, /QA/)
  }],
  ['FileProvider authority is variant-safe', () => {
    assert.match(manifest, /android:authorities="\$\{applicationId\}\.updater\.fileprovider"/)
    assert.match(updaterPlugin, /context\.packageName\s*\+\s*FILE_PROVIDER_AUTHORITY_SUFFIX/)
  }],
  ['QA web bundle explicitly disables updater initialization and entry', () => {
    assert.match(vite, /mode === 'android-qa'/)
    assert.match(vite, /__QA_BUILD__:\s*JSON\.stringify\(isQaBuild\)/)
    assert.match(ui, /if \(!__QA_BUILD__\) void updater\.initialize\(\)/)
    assert.match(ui, /if \(__QA_BUILD__ && value === 'update'\) return 'settings'/)
    assert.match(ui, /const \{ t \} = useTranslation\('settings'\)/)
    assert.match(ui, /description=\{t\('qaUpdateDescription'\)\}/)
    assert.equal(shellResources['zh-CN'].settings.qaUpdateDescription, '与正式版独立安装；正式更新通道已关闭')
    assert.equal(shellResources.en.settings.qaUpdateDescription, 'Installed separately from production; the production update channel is disabled')
  }],
  ['QA retains development-only Human UI Review controls', () => {
    assert.match(ui, /SHOW_DEVELOPMENT_TOOLS[\s\S]*?__QA_BUILD__/)
    assert.match(ui, /Human UI Review/)
    assert.match(ui, /CHORD_MOCK_CASES\.map/)
    assert.match(ui, /CHORD_MOCK_STATES\.map/)
  }],
  ['Release build still binds the production updater endpoint', () => {
    assert.match(vite, /mode === 'android-release'[\s\S]*?productionManifestUrl/)
    assert.doesNotMatch(gradle.match(/release\s*\{[\s\S]*?\n\s*\}/)?.[0] ?? '', /applicationIdSuffix/)
  }],
  ['One-command QA build and verification entries exist', () => {
    assert.match(packageJson.scripts['android:apk:qa'], /assembleQa/)
    assert.match(packageJson.scripts['android:verify:qa'], /com\.pianofundamentals\.trainer\.qa/)
  }]
]

let passed = 0
for (const [name, check] of checks) {
  try {
    check()
    passed += 1
    process.stdout.write(`PASS ${name}\n`)
  } catch (error) {
    process.stderr.write(`FAIL ${name}: ${error.message}\n`)
  }
}

if (passed !== checks.length) process.exitCode = 1
process.stdout.write(`\n${passed}/${checks.length} Android QA channel checks PASS\n`)
