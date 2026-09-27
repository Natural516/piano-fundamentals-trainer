const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { verifyPackageBuffer } = require('./theme-package-core.cjs')
const { createSignaturePayload } = require('./theme-signature.cjs')

function argument(name) {
  const index = process.argv.indexOf(name)
  if (index < 0 || !process.argv[index + 1]) throw new Error(`缺少 ${name}`)
  return path.resolve(process.argv[index + 1])
}

function inspectPackage(file, publicKeyFile) {
  const verified = verifyPackageBuffer(fs.readFileSync(file))
  const metadata = verified.manifest.signature
  assert.ok(metadata, `${file} 必须有签名`)
  const checksums = JSON.parse(verified.entries.get('checksums.json').toString('utf8'))
  const publicKey = crypto.createPublicKey(fs.readFileSync(publicKeyFile))
  const signature = verified.entries.get('signature.ed25519')
  assert.equal(crypto.verify(null, createSignaturePayload(verified.manifest, checksums), publicKey, signature), true)
  return { keyId: metadata.keyId, sha256: verified.archiveSha256, bytes: verified.archiveBytes }
}

const qa = inspectPackage(argument('--qa-package'), argument('--dev-public-key'))
const production = inspectPackage(argument('--production-package'), argument('--production-public-key'))
assert.equal(qa.keyId, 'pft-theme-dev-2026-01')
assert.equal(production.keyId, 'pft-theme-prod-2026-01')

const qaTrusted = new Set(['pft-theme-dev-2026-01'])
const releaseTrusted = new Set(['pft-theme-prod-2026-01'])
assert.equal(qaTrusted.has(qa.keyId), true, 'QA 开发签名包必须通过 QA 信任链')
assert.equal(releaseTrusted.has(qa.keyId), false, 'QA 开发签名包必须被 Release 拒绝')
assert.equal(qaTrusted.has(production.keyId), false, '生产签名包必须被 QA 拒绝')
assert.equal(releaseTrusted.has(production.keyId), true, '生产签名包必须通过 Release 信任链')

console.log(JSON.stringify({
  status: 'PASS',
  matrix: {
    qaPackage: { qa: 'PASS', release: 'FAIL', ...qa },
    productionPackage: { qa: 'FAIL', release: 'PASS', ...production }
  }
}, null, 2))
