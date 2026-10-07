const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const root = path.resolve(__dirname, '..')
// Specific approved metadata delta, not a new baseline for product/native files.
const PREPARATION_BASE = '40996117a570986da169ed37ec2abb7f0173c883'
const CURRENT_PREPARATION_BASE = '4c02a828938a4afc90ec1dc3b90e2824449fbb21'
const VERSION_PATH = 'android/version.properties'
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n').trimEnd()
const beforeVersion = git('show', `${PREPARATION_BASE}:${VERSION_PATH}`) + '\n'
assert.equal((beforeVersion.match(/^versionCode=14$/gm) || []).length, 1)
assert.equal((beforeVersion.match(/^versionName=1\.6\.0$/gm) || []).length, 1)
const previousVersion = beforeVersion.replace('versionCode=14\n', 'versionCode=15\n').replace('versionName=1.6.0\n', 'versionName=1.7.0\n')
const candidateVersion = beforeVersion.replace('versionCode=14\n', 'versionCode=16\n').replace('versionName=1.6.0\n', 'versionName=1.7.1\n')
function normalizeCandidateVersion(source) {
  assert.equal(source.replaceAll('\r\n', '\n'), candidateVersion, 'ONLY the exact approved 1.7.1/16 metadata is authorized; historical normalization remains 1.6.0/14')
  return beforeVersion
}
function assertCandidateVersion() { normalizeCandidateVersion(read(VERSION_PATH)) }
function assertCommittedVersionOrPreparation(committed, current, head, branch) {
  normalizeCandidateVersion(current)
  committed = committed.replaceAll('\r\n', '\n')
  if (committed === candidateVersion) return assert.equal(current.replaceAll('\r\n', '\n'), committed)
  // The explicitly authorized, uncommitted preparation phase is not a released/committed candidate.
  assert.equal(head.trim(), CURRENT_PREPARATION_BASE)
  assert.equal(branch.trim(), 'codex/release-1.7.1')
  assert.equal(committed, previousVersion)
}
const signingEdits = [
  ["// Frozen V1.6.0 production release contract, not values inferred from an APK.", "// Exact V1.7.1 candidate metadata contract; published V1.7.0 artifacts remain frozen."],
  ["const EXPECTED_VERSION_NAME = '1.6.0'", "const EXPECTED_VERSION_NAME = '1.7.1'"],
  ['const EXPECTED_VERSION_CODE = 14', 'const EXPECTED_VERSION_CODE = 16'],
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
  // Fixed, reviewed final 1.7.1 contract: exact release facts/negative fixtures,
  // plus the added byte-preservation assertion for the entire 1.7.0 changelog.
  // No current-HEAD or directory allowance; any other assertion edit fails.
  const releaseContractSha256 = 'd3a8bc8a60b29c9011ce96be25ef0f7549f0296b830435b3189ac1b26981c154'
  assert.equal(createHash('sha256').update(source.replaceAll('\r\n', '\n')).digest('hex'), releaseContractSha256,
    'release preparation permits ONLY the reviewed exact 1.7.1 final contract; theme/security/screenshot assertions stay frozen')
}
module.exports = { PREPARATION_BASE, CURRENT_PREPARATION_BASE, VERSION_PATH, beforeVersion, previousVersion, candidateVersion, normalizeCandidateVersion, assertCandidateVersion, assertCommittedVersionOrPreparation, normalizeSigningContract, assertPreparationContractDelta }
