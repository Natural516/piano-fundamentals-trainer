// Exact four-file repair from the fixed post-README baseline. No directory allowance,
// current-HEAD expected value, schema/writer changes, or historical baseline replacement.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..'), base = '5b5b0afa4b17c1e2847b01f3ca13c879d55f5540'
const clean = source => source.replaceAll('\r\n', '\n')
const digest = source => crypto.createHash('sha256').update(clean(source)).digest('hex')
const files = {
  'src/sightReading/noteAnalysis.ts': {
    before: '1f01b150e22eb5fe0c629f8ffb9b674077ed0288f913f846d9ddeb0f7f78f2da',
    after: 'e108ac720485b66e93242d04c756dafe5a5aa2ea3bb0630fb47f7b38c34bc7c6', marker: 'sightAnalysisIdentity('
  },
  'prototype/android-tablet-v1/src/SightReadingAnalysis.tsx': {
    before: 'fb4beec24d6d7f4cd9b625fee8a0698a785ca923a1a430452140d08179a5d1ff',
    after: '022ef5d61754a452020ea15da28500192d791205f3d1ea22b52c05c2d1f8854c', marker: 'row.analysisIdentity'
  },
  'prototype/android-tablet-v1/src/localization/sightAnalysisResources.ts': {
    before: '590be3d65efc9824fb14a21aa38147350b2dc0d6b4a8287bb288bea43207bcaf',
    after: '1424e98d5bee0619309bfab47e269c113759270f964324805abb33f544114a31', marker: 'correctSamples:'
  },
  'prototype/android-tablet-v1/src/styles.css': {
    before: 'f2dc075989aece51b94989f85cd4e1b5f578015119aaa0351e47d956f7628f26',
    after: 'b096829d4976a4f169397dfdd7448ec62d9991318a7e432a21acd4684e824c26', marker: '.sight-analysis-pitch'
  }
}
const originals = new Map()
function original(file) {
  if (!originals.has(file)) {
    const value = clean(execFileSync('git', ['show', base + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
    assert.equal(digest(value), files[file].before, file + ' fixed pre-repair bytes')
    originals.set(file, value)
  }
  return originals.get(file)
}
function normalize(file, source) {
  source = clean(source)
  const entry = files[file]
  // Previously normalized/historical sources have no new repair marker.
  if (!entry || !source.includes(entry.marker)) return source
  assert.equal(digest(source), entry.after, file + ' exact slow-ranking repair, no unrelated source delta')
  return original(file)
}
function assertDelta() {
  for (const [file, entry] of Object.entries(files)) {
    const actual = fs.readFileSync(path.join(root, file), 'utf8')
    assert.equal(digest(actual), entry.after, file + ' exact repair digest')
    assert.equal(normalize(file, actual), original(file))
    assert.throws(() => normalize(file, actual + '\n// unauthorized mutation\n'))
  }
  // Reaction collection, V1 writer/validator and all other source remain byte-frozen
  // by the existing cleanup and historical contracts after this exact projection.
}
module.exports = { base, files, normalize, assertDelta }
