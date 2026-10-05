const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
// Specific approved metadata delta, not a new baseline for product/native files.
const PREPARATION_BASE = '40996117a570986da169ed37ec2abb7f0173c883'
const VERSION_PATH = 'android/version.properties'
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n').trimEnd()
const beforeVersion = git('show', `${PREPARATION_BASE}:${VERSION_PATH}`) + '\n'
assert.equal((beforeVersion.match(/^versionCode=14$/gm) || []).length, 1)
assert.equal((beforeVersion.match(/^versionName=1\.6\.0$/gm) || []).length, 1)
const candidateVersion = beforeVersion.replace('versionCode=14\n', 'versionCode=15\n').replace('versionName=1.6.0\n', 'versionName=1.7.0\n')
function normalizeCandidateVersion(source) {
  assert.equal(source.replaceAll('\r\n', '\n'), candidateVersion, 'ONLY the exact 1.6.0/14 to 1.7.0/15 version.properties delta is authorized')
  return beforeVersion
}
function assertCandidateVersion() { normalizeCandidateVersion(read(VERSION_PATH)) }
function assertCommittedVersionOrPreparation(committed, current, head, branch) {
  normalizeCandidateVersion(current)
  committed = committed.replaceAll('\r\n', '\n')
  if (committed === candidateVersion) return assert.equal(current.replaceAll('\r\n', '\n'), committed)
  // The explicitly authorized, uncommitted preparation phase is not a released/committed candidate.
  assert.equal(head.trim(), PREPARATION_BASE)
  assert.equal(branch.trim(), 'codex/release-1.7.0-prep')
  assert.equal(committed, beforeVersion)
}
const signingEdits = [
  ["// Frozen V1.6.0 production release contract, not values inferred from an APK.", "// Exact V1.7.0 candidate metadata contract; published V1.6.0 artifacts remain frozen."],
  ["const EXPECTED_VERSION_NAME = '1.6.0'", "const EXPECTED_VERSION_NAME = '1.7.0'"],
  ['const EXPECTED_VERSION_CODE = 14', 'const EXPECTED_VERSION_CODE = 15'],
  ["const { assertExactReleaseSigner } = require('./android-apk-verification-core.cjs')", "const { assertExactReleaseSigner } = require('./android-apk-verification-core.cjs')\nconst { assertCommittedVersionOrPreparation } = require('./android-release-candidate-version-contract.cjs')"],
  ["  assert.equal(version.replaceAll('\\r\\n', '\\n'), committed.replaceAll('\\r\\n', '\\n'))", "  assertCommittedVersionOrPreparation(committed, version,\n    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }),\n    execFileSync('git', ['branch', '--show-current'], { cwd: repositoryRoot, encoding: 'utf8' }))"]
]
const preparationEdits = [
  ["assert.deepEqual(properties, { versionCode: '14', versionName: '1.6.0' })", "assert.deepEqual(properties, { versionCode: '15', versionName: '1.7.0' })"],
  ["console.log('PASS Android single version source: 1.6.0 / code14')", "console.log('PASS Android candidate version source: 1.7.0 / code15; public stable remains 1.6.0 / code14')"]
]
function normalizeExactEdits(source, edits) {
  source = source.replaceAll('\r\n', '\n')
  for (const [before, after] of edits) {
    assert.equal(source.split(after).length - 1, 1, 'exactly one approved metadata edit: ' + after)
    source = source.replace(after, before)
  }
  return source
}
function normalizeSigningContract(source) { return normalizeExactEdits(source, signingEdits) }
function assertPreparationContractDelta(source = read('scripts/android-release-preparation-check.cjs')) {
  const file = 'scripts/android-release-preparation-check.cjs'
  assert.equal(normalizeExactEdits(source, preparationEdits).trimEnd(), git('show', `${PREPARATION_BASE}:${file}`), 'release preparation permits ONLY the two candidate metadata lines; stable/docs/theme/security assertions stay exact')
}
module.exports = { PREPARATION_BASE, VERSION_PATH, beforeVersion, candidateVersion, normalizeCandidateVersion, assertCandidateVersion, assertCommittedVersionOrPreparation, normalizeSigningContract, assertPreparationContractDelta }
