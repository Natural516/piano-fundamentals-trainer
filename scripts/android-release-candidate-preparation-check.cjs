const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const version = require('./android-release-candidate-version-contract.cjs')
const { loadLocalPublicSource, assertPublicReleaseFacts, assertNoLegacyRepositoryReferences, publicPathAudit } = require('./android-release-preflight.cjs')
const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')
const before = (file, ref = version.PREPARATION_BASE) => execFileSync('git', ['show', `${ref}:${file}`], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n')
const arg = process.argv.slice(2)
assert.equal(arg.length, 1, 'explicit repo-external --public-root=<path> required')
assert.match(arg[0], /^--public-root=.+/)
const publicRoot = path.resolve(arg[0].slice('--public-root='.length))
const relative = path.relative(root, publicRoot)
assert.ok(relative.startsWith('..' + path.sep) || path.isAbsolute(relative), 'candidate projection must stay outside repository')
const tests = [], test = (name, run) => tests.push({ name, run })
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
test('CAND1 exact version delta rejects wrong names/codes, duplicate keys and unrelated bytes', () => {
  version.assertCandidateVersion()
  assert.equal(version.normalizeCandidateVersion(version.candidateVersion), version.beforeVersion)
  for (const source of [version.beforeVersion, version.previousVersion, version.candidateVersion.replace('versionCode=16','versionCode=15'), version.candidateVersion.replace('versionName=1.7.1','versionName=1.7.10'), version.candidateVersion + 'versionCode=16\n', version.candidateVersion + '# unrelated change\n']) assert.throws(() => version.normalizeCandidateVersion(source))
})
test('CAND2 committed verification retains exact equality and bounds the uncommitted preparation exception', () => {
  version.assertCommittedVersionOrPreparation(version.candidateVersion, version.candidateVersion, 'future-checkpoint', 'candidate-branch')
  version.assertCommittedVersionOrPreparation(version.previousVersion, version.candidateVersion, version.CURRENT_PREPARATION_BASE, 'codex/release-1.7.1')
  for (const [committed, current, head, branch] of [
    [version.previousVersion, version.candidateVersion, 'wrong-head', 'codex/release-1.7.1'],
    [version.previousVersion, version.candidateVersion, version.CURRENT_PREPARATION_BASE, 'main'],
    [version.previousVersion + '# extra\n', version.candidateVersion, version.CURRENT_PREPARATION_BASE, 'codex/release-1.7.1'],
    [version.candidateVersion, version.candidateVersion + 'extra=true\n', 'future-checkpoint', 'candidate-branch']
  ]) assert.throws(() => version.assertCommittedVersionOrPreparation(committed, current, head, branch))
})
test('CAND3 signing callbacks and preparation coverage permit only reviewed metadata edits', () => {
  const signing = 'scripts/android-signing-foundation-check.cjs'
  assert.equal(version.normalizeSigningContract(read(signing)), before(signing))
  assert.notEqual(version.normalizeSigningContract(read(signing).replace('permanent Android identity remains frozen', 'weakened')), before(signing))
  version.assertPreparationContractDelta()
  assert.throws(() => version.assertPreparationContractDelta(read('scripts/android-release-preparation-check.cjs').replace("assert.equal(manifest.minAppVersion, '1.6.0')", "assert.equal(manifest.minAppVersion, '1.7.0')")))
})
test('CAND4 exact approved released docs; package/theme and archived stable section stay frozen', () => {
  // Fixed hashes of the reviewed release-document delta, never inferred from current HEAD.
  assert.equal(digest(Buffer.from(read('README.md'))), '1ca37e856aceb23a1f4d064a566b04cb56a2ac96e50c1a3f16c7c2075a20eb61')
  assert.equal(digest(Buffer.from(read('CHANGELOG.md'))), 'd66b32e8d61e54dba240ea88914666f7902d108d3fae969e8cfa00b309f8ac2c')
  for (const file of ['package.json','package-lock.json','theme-packages/bocchi/manifest.json']) assert.equal(read(file), before(file, version.CURRENT_PREPARATION_BASE), file)
  assert.ok(read('README.md').includes('Android 1.7.0 · versionCode 15'))
  assert.match(read('CHANGELOG.md'), /^## 1\.7\.0 — 2026-10-05 — versionCode 15$/m)
  assert.equal(read('CHANGELOG.md').slice(read('CHANGELOG.md').indexOf('## 1.6.0 —')), before('CHANGELOG.md').slice(before('CHANGELOG.md').indexOf('## 1.6.0 —')))
  const theme = JSON.parse(read('theme-packages/bocchi/manifest.json'))
  assert.deepEqual([theme.version, theme.minAppVersion, theme.maxAppVersionExclusive], ['1.1.0','1.6.0','2.0.0'])
})
test('CAND5 normal preflight loader reads untracked candidate files with exact new facts', () => {
  assert.equal(fs.existsSync(path.join(publicRoot, '.git')), false)
  const candidate = loadLocalPublicSource(publicRoot)
  assert.equal(assertPublicReleaseFacts(candidate, '16','1.7.1'), 8)
  publicPathAudit(candidate.paths); assertNoLegacyRepositoryReferences(candidate.documents, 'candidate projection')
  assert.match(candidate.documents.get('README.md'), /CANDIDATE \/ UNRELEASED DOCUMENT PROJECTION/)
  assert.match(candidate.documents.get('CHANGELOG.md'), /^## 1\.7\.1 — Candidate \/ Unreleased — versionCode 16$/m)
  const existing = candidate.documents.get('CHANGELOG.md').slice(candidate.documents.get('CHANGELOG.md').indexOf('## 1.7.0 —'))
  assert.equal(existing.replaceAll('\r\n', '\n'), read('CHANGELOG.md').slice(read('CHANGELOG.md').indexOf('## 1.7.0 —')))
})
test('CAND6 wrong future facts/prefixes and missing screenshots still fail', () => {
  const candidate = loadLocalPublicSource(publicRoot), original = candidate.documents.get('README.md')
  const withReadme = text => ({ ...candidate, documents: new Map(candidate.documents).set('README.md', text) })
  for (const wrong of ['Android 1.7.10 · versionCode 16','Android 1.7.1 · versionCode 160','Android 1.7.0 · versionCode 16','Android 1.7.1']) assert.throws(() => assertPublicReleaseFacts(withReadme(original.replace('Android 1.7.1 · versionCode 16', wrong)), '16','1.7.1'))
  assert.throws(() => assertPublicReleaseFacts({ ...candidate, paths: candidate.paths.filter(p => p !== 'docs/screenshots/android-development-en-home.png') }, '16','1.7.1'))
})
test('CAND7 all eight real screenshot files preserve original source bytes/names', () => {
  const candidate = loadLocalPublicSource(publicRoot)
  const screenshots = [...new Set(candidate.documents.get('README.md').match(/docs\/screenshots\/[^)\s"'<>]+/g) || [])]
  assert.equal(screenshots.length, 8)
  for (const file of screenshots) assert.equal(digest(fs.readFileSync(path.join(publicRoot,file))), digest(fs.readFileSync(path.join(root,file))), file)
})
test('CAND8 non-Git candidate audits do not ignore private paths or follow directory links', () => {
  const fixture = path.join(publicRoot, '..', 'candidate-loader-negative-fixtures')
  fs.mkdirSync(path.join(fixture, 'private'), { recursive: true })
  fs.writeFileSync(path.join(fixture, 'private', 'keystore.properties'), 'fixture only, no credentials\n')
  assert.throws(() => publicPathAudit(loadLocalPublicSource(fixture).paths))
  const linked = path.join(publicRoot, '..', 'candidate-loader-link-fixture')
  fs.mkdirSync(linked, { recursive: true })
  const junction = path.join(linked, 'outside')
  if (!fs.existsSync(junction)) fs.symlinkSync(fixture, junction, 'junction')
  assert.throws(() => loadLocalPublicSource(linked), /must not contain links/)
})
let passed = 0
for (const { name, run } of tests) try { run(); passed++; console.log('PASS ' + name) } catch (e) { process.exitCode = 1; console.error('FAIL ' + name + '\n' + e.stack) }
console.log(`${passed}/${tests.length} Android candidate version/docs contracts PASS (no APK build or full preflight executed)`)
