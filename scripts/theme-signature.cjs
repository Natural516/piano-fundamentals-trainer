const crypto = require('node:crypto')
const fs = require('node:fs')

const SIGNATURE_PREFIX = 'PFTHEME-SIGNATURE-V1\n'

function canonicalizeJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('JCS_NON_FINITE_NUMBER')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(',')}]`
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`).join(',')}}`
  }
  throw new Error('JCS_UNSUPPORTED_VALUE')
}

function createSignaturePayload(manifest, checksums) {
  return Buffer.from(`${SIGNATURE_PREFIX}${canonicalizeJson(manifest)}\n${canonicalizeJson(checksums)}`, 'utf8')
}

function signThemeMetadata(manifest, checksums, privateKeyFile) {
  const privateKey = crypto.createPrivateKey(fs.readFileSync(privateKeyFile))
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('SIGNING_KEY_NOT_ED25519')
  const payload = createSignaturePayload(manifest, checksums)
  const signature = crypto.sign(null, payload, privateKey)
  const publicKey = crypto.createPublicKey(privateKey)
  if (!crypto.verify(null, payload, publicKey, signature)) throw new Error('SIGNATURE_SELF_VERIFY_FAILED')
  const publicDer = publicKey.export({ type: 'spki', format: 'der' })
  return {
    signature,
    publicKeyFingerprintSha256: crypto.createHash('sha256').update(publicDer).digest('hex'),
    publicKeyRawBase64: publicDer.subarray(publicDer.length - 32).toString('base64')
  }
}

function verifyThemeMetadataSignature(manifest, checksums, signature, publicKeyFile) {
  const publicKey = crypto.createPublicKey(fs.readFileSync(publicKeyFile))
  return crypto.verify(null, createSignaturePayload(manifest, checksums), publicKey, signature)
}

module.exports = {
  SIGNATURE_PREFIX,
  canonicalizeJson,
  createSignaturePayload,
  signThemeMetadata,
  verifyThemeMetadataSignature
}
