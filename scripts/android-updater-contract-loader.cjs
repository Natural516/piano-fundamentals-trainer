const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function loadUpdaterCore(repositoryRoot) {
  const sourcePath = path.join(repositoryRoot, 'prototype', 'android-tablet-v1', 'src', 'updaterCore.ts')
  const source = fs.readFileSync(sourcePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: sourcePath,
    reportDiagnostics: true
  })
  const errors = (transpiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
  if (errors.length) {
    const message = errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('; ')
    throw new Error(`Unable to load the canonical updater contract: ${message}`)
  }

  const loadedModule = { exports: {} }
  const evaluate = new Function('exports', 'require', 'module', '__filename', '__dirname', transpiled.outputText)
  evaluate(loadedModule.exports, require, loadedModule, sourcePath, path.dirname(sourcePath))

  const updaterCore = loadedModule.exports
  if (typeof updaterCore.parseUpdaterManifest !== 'function') {
    throw new Error('Canonical updater contract does not export parseUpdaterManifest()')
  }
  if (typeof updaterCore.UPDATER_PACKAGE_ID !== 'string' || typeof updaterCore.UPDATER_PINNED_SIGNER_SHA256 !== 'string') {
    throw new Error('Canonical updater package or signer identity is unavailable')
  }
  return updaterCore
}

module.exports = { loadUpdaterCore }
