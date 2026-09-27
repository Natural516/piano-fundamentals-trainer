const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  ALLOWED_EXTENSIONS, LIMITS, RECIPE_CONTRACT, ThemePackageError, createChecksums, createDeterministicArchive,
  normalizePackagePath, validateContracts, verifyPackageBuffer, verifyThemeSource
} = require('./theme-package-core.cjs')

const root = path.resolve(__dirname, '..')
const fixtureDir = path.join(root, 'theme-packages', 'bocchi')
const registry = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/theme/themeRegistry.ts'), 'utf8')
const adapter = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/theme/runtimeThemeAdapter.ts'), 'utf8')
const recipes = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/theme/visualRecipeRegistry.ts'), 'utf8')
const main = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/main.tsx'), 'utf8')
const manifest = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'manifest.json'), 'utf8'))
const theme = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'theme.json'), 'utf8'))

function clone(value) { return JSON.parse(JSON.stringify(value)) }
function expectCode(code, task) {
  assert.throws(task, (error) => error instanceof ThemePackageError && error.code === code, `expected ${code}`)
}

const tests = [
  ['EXT01', 'ExternalThemeDefinition schema accepts the complete fixture', () => validateContracts(manifest, theme)],
  ['EXT02', 'unknown recipe is rejected', () => { const bad = clone(theme); bad.capabilities.homeVisual.recipeId = 'unknown-recipe'; expectCode('UNSUPPORTED_RECIPE', () => validateContracts(manifest, bad)) }],
  ['EXT03', 'unknown token is rejected', () => { const bad = clone(theme); bad.tokens.colors['--unknown'] = '#112233'; expectCode('INVALID_TOKEN', () => validateContracts(manifest, bad)) }],
  ['EXT04', 'unsafe token value is rejected', () => { const bad = clone(theme); bad.tokens.colors['--accent'] = 'url(javascript:alert(1))'; expectCode('INVALID_TOKEN', () => validateContracts(manifest, bad)) }],
  ['EXT05', 'unsafe asset paths are rejected', () => { for (const value of ['../x.png', 'C:/x.png', 'https://x/y.png', 'a\\b.png', '/x.png']) assert.throws(() => normalizePackagePath(value), /UNSAFE_PATH/) }],
  ['EXT06', 'geometry min and max are enforced', () => { const bad = clone(theme); bad.capabilities.homeVisual.parameters.heroScale = 1.41; expectCode('INVALID_PARAMETER', () => validateContracts(manifest, bad)); const good = clone(theme); good.capabilities.homeVisual.parameters.heroScale = 0.6; validateContracts(manifest, good) }],
  ['EXT07', 'missing full capability is rejected', () => { const bad = clone(theme); delete bad.capabilities.settingsVisual; expectCode('MISSING_CAPABILITY', () => validateContracts(manifest, bad)) }],
  ['EXT08', 'external source and runtime adapter use the complete recipe contract', () => { const verified = verifyThemeSource(fixtureDir); assert.equal(verified.manifest.themeId, 'natural516.bocchi'); for (const contract of Object.values(RECIPE_CONTRACT)) { assert.equal(Object.values(theme.capabilities).some((capability) => capability.recipeId === contract.recipeId), true); assert.match(adapter, new RegExp(contract.recipeId)) } assert.doesNotMatch(registry, /createBocchiExternalDefinition|simulatedExternalBocchiTheme|bocchiTokens/) }],
  ['EXT09', 'visual recipe registry is complete', () => { assert.equal(Object.keys(RECIPE_CONTRACT).length, 7); for (const contract of Object.values(RECIPE_CONTRACT)) assert.match(recipes, new RegExp(contract.recipeId)) }],
  ['EXT10', 'bocchi-dev remains only a development migration alias', () => { assert.match(registry, /allowDevelopmentTheme && \(requested === 'natural516\.bocchi' \|\| requested === 'bocchi-dev'\)/); assert.match(main, /const SETTINGS_THEME_OPTIONS[\s\S]*id: 'light'[\s\S]*id: 'dark'/); assert.doesNotMatch(main.slice(main.indexOf('const SETTINGS_THEME_OPTIONS'), main.indexOf('function SettingsThemeOption')), /bocchi-dev/) }],
  ['EXT11', 'production registry exposes only built-in themes', () => { assert.match(registry, /UnifiedRuntimeThemeRegistry[^=]*= BuiltInThemeRegistry/); assert.match(registry, /return 'light'/); assert.doesNotMatch(registry, /packageThemeId: 'natural516\.bocchi'/) }],
  ['EXT12', 'valid fixture passes source verification', () => { const result = verifyThemeSource(fixtureDir); assert.ok(result.limits.fileCount <= LIMITS.files); assert.ok(result.limits.totalImagePixels <= LIMITS.totalImagePixels) }],
  ['EXT13', 'invalid fixture fails deterministically', () => { const bad = clone(theme); bad.capabilities.toolDetailVisual.assets.background = '../escape.png'; expectCode('UNSAFE_ASSET_PATH', () => validateContracts(manifest, bad)) }],
  ['EXT14', 'package restrictions and deterministic container hold', () => {
    const verified = verifyThemeSource(fixtureDir); const entries = new Map(verified.entries); entries.set('checksums.json', createChecksums(entries))
    const first = createDeterministicArchive(entries); const second = createDeterministicArchive(entries); assert.deepEqual(first, second); verifyPackageBuffer(first)
    assert.equal(ALLOWED_EXTENSIONS.has('.pftheme'), false)
  }]
]

let passed = 0
for (const [id, title, task] of tests) {
  try { task(); passed += 1; process.stdout.write(`PASS ${id} ${title}\n`) }
  catch (error) { process.stderr.write(`FAIL ${id} ${title}\n${error.stack || error}\n`) }
}
process.stdout.write(`\n${passed}/${tests.length} External Theme Runtime checks PASS\n`)
if (passed !== tests.length) process.exitCode = 1
