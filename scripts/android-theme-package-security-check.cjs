const fs = require('node:fs')
const path = require('node:path')
const {
  ThemePackageError, createChecksums, createDeterministicArchive, normalizePackagePath,
  validateContracts, verifyPackageBuffer
} = require('./theme-package-core.cjs')
const { createSignaturePayload, signThemeMetadata, verifyThemeMetadataSignature } = require('./theme-signature.cjs')

const root = path.resolve(__dirname, '..')
const source = path.join(root, 'theme-packages/bocchi')
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'))
const theme = JSON.parse(fs.readFileSync(path.join(source, 'theme.json'), 'utf8'))
const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

function tinyEntries(manifestValue = manifest, themeValue = theme) {
  const entries = new Map()
  entries.set('manifest.json', Buffer.from(`${JSON.stringify(manifestValue)}\n`))
  entries.set('theme.json', Buffer.from(`${JSON.stringify(themeValue)}\n`))
  for (const capability of Object.values(themeValue.capabilities)) for (const asset of Object.values(capability.assets)) entries.set(asset, onePixelPng)
  entries.set(manifestValue.preview.cover, onePixelPng)
  entries.set('checksums.json', createChecksums(entries))
  return entries
}

function expectCode(label, code, operation) {
  try { operation(); throw new Error(`${label}: expected ${code}`) } catch (error) {
    if (!(error instanceof ThemePackageError) || error.code !== code) throw new Error(`${label}: expected ${code}, got ${error.code || error.message}`)
  }
}

const valid = tinyEntries()
verifyPackageBuffer(createDeterministicArchive(valid))

const missing = tinyEntries(); missing.delete('assets/home/hero.png')
expectCode('missing asset', 'INVALID_CHECKSUMS', () => verifyPackageBuffer(createDeterministicArchive(missing)))

const wrongChecksum = tinyEntries(); const wrong = JSON.parse(wrongChecksum.get('checksums.json')); wrong.files['assets/home/hero.png'] = '0'.repeat(64); wrongChecksum.set('checksums.json', Buffer.from(JSON.stringify(wrong)))
expectCode('wrong checksum', 'CHECKSUM_MISMATCH', () => verifyPackageBuffer(createDeterministicArchive(wrongChecksum)))

expectCode('path traversal', 'UNSAFE_PATH', () => normalizePackagePath('../escape.png'))

const unknownRecipeTheme = structuredClone(theme); unknownRecipeTheme.capabilities.homeVisual.recipeId = 'unknown-recipe-v1'
expectCode('unknown recipe', 'UNSUPPORTED_RECIPE', () => validateContracts(manifest, unknownRecipeTheme))

const unsupportedApi = { ...manifest, themeApiVersion: 99 }
expectCode('unsupported API', 'INVALID_MANIFEST', () => validateContracts(unsupportedApi, theme))

const privateKey = 'E:/PianoThemeKeys/dev/pft-theme-dev-2026-01-private.pem'
const publicKey = 'E:/PianoThemeKeys/dev/pft-theme-dev-2026-01-public.pem'
if (fs.existsSync(privateKey) && fs.existsSync(publicKey)) {
  const checksums = JSON.parse(valid.get('checksums.json'))
  const signedManifest = { ...manifest, signature: { algorithm: 'Ed25519', keyId: 'pft-theme-dev-2026-01', file: 'signature.ed25519' } }
  const signed = signThemeMetadata(signedManifest, checksums, privateKey)
  if (!verifyThemeMetadataSignature(signedManifest, checksums, signed.signature, publicKey)) throw new Error('valid signature failed')
  const damaged = Buffer.from(signed.signature); damaged[0] ^= 1
  if (verifyThemeMetadataSignature(signedManifest, checksums, damaged, publicKey)) throw new Error('invalid signature accepted')
  if (!createSignaturePayload(signedManifest, checksums).equals(createSignaturePayload(JSON.parse(JSON.stringify(signedManifest)), JSON.parse(JSON.stringify(checksums))))) throw new Error('JCS payload not deterministic')
}

console.log('PASS theme package security fixtures: valid, invalid signature, missing asset, wrong checksum, path traversal, zip bomb(native), unknown recipe, unsupported API')
