const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, filename)
const { adaptExternalTheme } = require('../prototype/android-tablet-v1/src/theme/runtimeThemeAdapter.ts')
const { BuiltInThemeRegistry } = require('../prototype/android-tablet-v1/src/theme/themeRegistry.ts')
const { verifyThemeSource, validateContracts, createChecksums, createDeterministicArchive, verifyPackageBuffer } = require('./theme-package-core.cjs')
const root = path.resolve(__dirname, '..')
const source = verifyThemeSource(path.join(root, 'theme-packages/bocchi'))
const clone = (value) => JSON.parse(JSON.stringify(value))
const resolver = { resolveAsset: (_id, _version, file) => `https://safe.invalid/${file}` }
const adapt = (theme) => adaptExternalTheme(source.manifest, theme, resolver)
const checks = [
  ['approved source bytes unchanged', () => {
    assert.deepEqual(fs.readdirSync(path.join(root, 'theme-packages/bocchi/assets/interval-practice')).sort(), ['active-border.png', 'hub-collage.png'])
    for (const [file, hash] of [['hub-collage.png', 'fbee69a0a6fe897dc705b6cc84e16311de5e115f50840b971349193376efa93e'], ['active-border.png', 'd664dd3bde8ca2f49f5cb1217bde27887ccc5274ae606e60b5a5cec9192dce46']]) {
      assert.equal(crypto.createHash('sha256').update(source.entries.get(`assets/interval-practice/${file}`)).digest('hex'), hash)
    }
  }],
  ['old seven-capability theme remains valid and standard', () => {
    const old = clone(source.theme); delete old.capabilities.intervalPracticeVisual
    validateContracts(source.manifest, old)
    const runtime = adapt(old)
    assert.equal(runtime.capabilities.intervalPracticeVisual.kind, 'standard')
    for (const key of Object.keys(old.capabilities)) assert.deepEqual(runtime.capabilities[key], adapt(source.theme).capabilities[key])
  }],
  ['each slot and both slots are independently optional', () => {
    for (const slots of [[], ['hubCardCollage'], ['activeBorder']]) {
      const theme = clone(source.theme)
      theme.capabilities.intervalPracticeVisual.assets = Object.fromEntries(slots.map((slot) => [slot, source.theme.capabilities.intervalPracticeVisual.assets[slot]]))
      validateContracts(source.manifest, theme)
      assert.deepEqual(Object.keys(adapt(theme).capabilities.intervalPracticeVisual.assets).sort(), slots.sort())
    }
  }],
  ['Light and Dark do not opt into Interval artwork', () => {
    for (const theme of Object.values(BuiltInThemeRegistry)) assert.ok(!theme.capabilities.intervalPracticeVisual || theme.capabilities.intervalPracticeVisual.kind === 'standard')
  }],
  ['unknown slots, geometry/business parameters and unsafe paths rejected', () => {
    for (const change of [
      (cap) => { cap.assets.resultHero = 'assets/result.png' },
      (cap) => { cap.parameters.decorationScale = .5 },
      (cap) => { cap.parameters.captureWindowMs = 300 },
      (cap) => { cap.assets.activeBorder = 'https://evil.invalid/a.png' }
    ]) { const bad = clone(source.theme); change(bad.capabilities.intervalPracticeVisual); assert.throws(() => adapt(bad)); assert.throws(() => validateContracts(source.manifest, bad)) }
  }],
  ['package checksums cover new assets, archive remains deterministic', () => {
    const entries = new Map(source.entries); entries.set('checksums.json', createChecksums(entries))
    const archive = createDeterministicArchive(entries)
    assert.deepEqual(archive, createDeterministicArchive(entries))
    verifyPackageBuffer(archive)
  }],
  ['only Hub and ACTIVE consume this capability; paper has measured exclusion', () => {
    const main = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/main.tsx'), 'utf8')
    assert.equal((main.match(/theme\.capabilities\.intervalPracticeVisual/g) || []).length, 2)
    const setup = main.slice(main.indexOf('function IntervalPracticeSetupScreen'), main.indexOf('function IntervalPracticeActiveScreen'))
    assert.doesNotMatch(setup, /intervalVisual|activeBorder|intervalCollage|Hero/)
    assert.match(main, /polygon\(evenodd/)
    assert.match(main, /observer\.observe\(stage\)/)
    assert.match(main, /activeBorder \? <div aria-hidden="true" className="interval-notebook-border-clip"/)
    assert.match(main, /intervalCollage \? <>/)
    assert.match(main, /className="interval-notebook-foreground-clip" style=\{\{ \.\.\.foregroundLayout\.anchorStyle, clipPath: borderClip \}\}/)
    assert.match(main, /\['top-left', 'top-right', 'bottom-left', 'bottom-right'\]/)
    assert.match(main, /className="interval-notebook-text-safe" style=\{\{ clipPath: foregroundLayout\.textClip/)
    assert.match(main, /className="interval-notebook-dock-safe" style=\{\{ clipPath: foregroundLayout\.dockClip/)
    assert.match(main, /textNodes\.forEach\(\(node\) => observer\.observe\(node\)\)/)
    assert.match(main, /if \(dock\) observer\.observe\(dock\)/)
    const hub = main.slice(main.indexOf('function PracticeHubScreen'), main.indexOf('type IntervalPracticeSettingChanges'))
    assert.match(hub, /指定低音构造 · 26 种音程/)
    assert.doesNotMatch(hub, /复现 \/ 构造/)
  }]
]
for (const [title, check] of checks) { check(); console.log(`PASS ${title}`) }
console.log(`${checks.length}/${checks.length} Interval theme checks PASS`)
