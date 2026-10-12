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
  for (const source of [version.beforeVersion, version.previousVersion, version.candidateVersion.replace('versionCode=17','versionCode=16'), version.candidateVersion.replace('versionName=1.7.2','versionName=1.7.20'), version.candidateVersion + 'versionCode=17\n', version.candidateVersion + '# unrelated change\n']) assert.throws(() => version.normalizeCandidateVersion(source))
})
test('CAND2 committed verification retains exact equality and bounds the uncommitted preparation exception', () => {
  version.assertCommittedVersionOrPreparation(version.candidateVersion, version.candidateVersion, 'future-checkpoint', 'candidate-branch')
  version.assertCommittedVersionOrPreparation(version.previousVersion, version.candidateVersion, version.CURRENT_PREPARATION_BASE, 'codex/release-1.7.2')
  for (const [committed, current, head, branch] of [
    [version.previousVersion, version.candidateVersion, 'wrong-head', 'codex/release-1.7.2'],
    [version.previousVersion, version.candidateVersion, version.CURRENT_PREPARATION_BASE, 'main'],
    [version.previousVersion + '# extra\n', version.candidateVersion, version.CURRENT_PREPARATION_BASE, 'codex/release-1.7.2'],
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
  // Keep published evidence; pin only the reviewed four new references/copy/version delta.
  assert.equal(digest(Buffer.from(before('README.md','a6a2cfc996ee9a03744c7fcd38cf553ebd07ff08'))), '17e9c965714413cb25e3aae9d30e8d658e2aab7fcac7aec3f49c4aa64dbdd06c')
  assert.equal(digest(Buffer.from(before('CHANGELOG.md','a6a2cfc996ee9a03744c7fcd38cf553ebd07ff08'))), '79bebb858186c120af6b1445d6ee646808ff24dfaf33279ed65448963d706ba2')
  assert.equal(digest(Buffer.from(read('README.md'))), '52bbcea5b1c3a51e2ace8f70072af95d63037cbed365657b77494dd2a6a1adbd')
  assert.equal(digest(Buffer.from(read('CHANGELOG.md'))), '5b5291732bc5f176fe2832800757b4e30ad7e2994a43b0f6fec51cc635cadbfc')
  for (const file of ['package.json','package-lock.json','theme-packages/bocchi/manifest.json']) assert.equal(read(file), before(file, version.CURRENT_PREPARATION_BASE), file)
  assert.ok(read('README.md').includes('\nAndroid 1.7.2\n'))
  assert.match(read('CHANGELOG.md'), /^## 1\.7\.2 — 2026-10-12 — versionCode 17$/m)
  assert.match(read('CHANGELOG.md'), /^## 1\.7\.1 — 2026-10-07 — versionCode 16$/m)
  assert.match(read('CHANGELOG.md'), /^## 1\.7\.0 — 2026-10-05 — versionCode 15$/m)
  assert.equal(read('CHANGELOG.md').slice(read('CHANGELOG.md').indexOf('## 1.7.1 —')), before('CHANGELOG.md', version.CURRENT_PREPARATION_BASE).slice(before('CHANGELOG.md', version.CURRENT_PREPARATION_BASE).indexOf('## 1.7.1 —')))
  assert.equal(read('CHANGELOG.md').slice(read('CHANGELOG.md').indexOf('## 1.6.0 —')), before('CHANGELOG.md','37fb125f0192e351a86b350d85569704ec050c40').slice(before('CHANGELOG.md','37fb125f0192e351a86b350d85569704ec050c40').indexOf('## 1.6.0 —')))
  const theme = JSON.parse(read('theme-packages/bocchi/manifest.json'))
  assert.deepEqual([theme.version, theme.minAppVersion, theme.maxAppVersionExclusive], ['1.1.0','1.6.0','2.0.0'])
})
test('CAND5 normal preflight loader reads untracked candidate files with exact new facts', () => {
  assert.equal(fs.existsSync(path.join(publicRoot, '.git')), false)
  const candidate = loadLocalPublicSource(publicRoot)
  assert.equal(assertPublicReleaseFacts(candidate, '17','1.7.2'), 12)
  publicPathAudit(candidate.paths); assertNoLegacyRepositoryReferences(candidate.documents, 'candidate projection')
  assert.match(candidate.documents.get('README.md'), /CANDIDATE \/ UNRELEASED DOCUMENT PROJECTION/)
  assert.match(candidate.documents.get('CHANGELOG.md'), /^## 1\.7\.2 — Candidate \/ Unreleased — versionCode 17$/m)
  const existing = candidate.documents.get('CHANGELOG.md').slice(candidate.documents.get('CHANGELOG.md').indexOf('## 1.7.1 —'))
  assert.equal(existing.replaceAll('\r\n', '\n'), read('CHANGELOG.md').slice(read('CHANGELOG.md').indexOf('## 1.7.1 —')))
})
test('CAND6 wrong future facts/prefixes and missing screenshots still fail', () => {
  const candidate = loadLocalPublicSource(publicRoot), original = candidate.documents.get('README.md').replaceAll('\r\n', '\n')
  const withReadme = text => ({ ...candidate, documents: new Map(candidate.documents).set('README.md', text) })
  assert.ok(original.includes('\nAndroid 1.7.2\n'), 'negative fixtures must mutate the actual candidate fact')
  for (const wrong of ['Android 1.7.20','Android 1.7.1','Android','']) assert.throws(() => assertPublicReleaseFacts(withReadme(original.replace('\nAndroid 1.7.2\n', '\n'+wrong+'\n')), '17','1.7.2'))
  for (const wrong of ['16','170','']) assert.throws(() => assertPublicReleaseFacts({ ...candidate, documents: new Map(candidate.documents).set('CHANGELOG.md', candidate.documents.get('CHANGELOG.md').replace('versionCode 17', 'versionCode '+wrong)) },'17','1.7.2'))
  assert.throws(() => assertPublicReleaseFacts({ ...candidate, paths: candidate.paths.filter(p => p !== 'docs/screenshots/android-v1.7.2-en-sight-analysis.png') }, '17','1.7.2'))
})
test('CAND7 all twelve real screenshot files preserve original source bytes/names', () => {
  const candidate = loadLocalPublicSource(publicRoot)
  const screenshots = [...new Set(candidate.documents.get('README.md').match(/docs\/screenshots\/[^)\s"'<>]+\.png/g) || [])]
  assert.equal(screenshots.length, 12)
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
