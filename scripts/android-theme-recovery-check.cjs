const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/theme/themePackageRuntime.ts'), 'utf8')
const main = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/main.tsx'), 'utf8')
const assertions = [
  ['Preferences active pointer', /activeThemeId/], ['lastKnownGood pointer', /lastKnownGoodThemeId/],
  ['failed version pointer', /failedThemeVersion/], ['pending activation', /pendingActivation/],
  ['bootstrap Light fallback', /BOOTSTRAP_FAILED[\s\S]*persistBuiltIn\('light'\)/],
  ['asset onError recovery', /ASSET_RUNTIME_LOAD_FAILED/], ['recovery boundary', /class ThemeRecoveryBoundary/],
  ['external source evidence', /data-runtime-theme-source/]
]
for (const [label, pattern] of assertions) if (!pattern.test(source + '\n' + main)) throw new Error(`Missing ${label}`)
console.log(`PASS android theme recovery (${assertions.length}/${assertions.length})`)
