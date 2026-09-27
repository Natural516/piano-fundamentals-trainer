const fs = require('node:fs')
const path = require('node:path')
const { ThemePackageError, createChecksums, createDeterministicArchive, verifyPackageBuffer, verifyThemeSource } = require('./theme-package-core.cjs')
const { signThemeMetadata } = require('./theme-signature.cjs')

function parseArgs(args) {
  const sourceDir = args.find((arg) => !arg.startsWith('--'))
  const outIndex = args.indexOf('--out')
  const outDir = outIndex >= 0 ? args[outIndex + 1] : null
  const keyIdIndex = args.indexOf('--key-id')
  const privateKeyIndex = args.indexOf('--private-key-file')
  const channelIndex = args.indexOf('--channel')
  const versionIndex = args.indexOf('--version')
  const keyId = keyIdIndex >= 0 ? args[keyIdIndex + 1] : null
  const privateKeyFile = privateKeyIndex >= 0 ? args[privateKeyIndex + 1] : null
  const channel = channelIndex >= 0 ? args[channelIndex + 1] : 'development'
  const version = versionIndex >= 0 ? args[versionIndex + 1] : null
  if (!sourceDir || !outDir) throw new ThemePackageError('INVALID_ARGUMENT', '用法: theme:pack -- <theme-source-dir> --out <dir>')
  if ((keyId && !privateKeyFile) || (!keyId && privateKeyFile)) throw new ThemePackageError('INVALID_ARGUMENT', '--key-id 与 --private-key-file 必须同时提供')
  if (!['development', 'qa', 'production'].includes(channel)) throw new ThemePackageError('INVALID_ARGUMENT', '--channel 仅支持 development、qa 或 production')
  if (channel === 'qa' && (!keyId || !privateKeyFile)) throw new ThemePackageError('SIGNATURE_REQUIRED', 'QA 主题包必须使用开发密钥签名')
  if (channel === 'production' && (!keyId || !privateKeyFile)) throw new ThemePackageError('SIGNATURE_REQUIRED', 'Production 主题包必须使用生产密钥签名')
  if (version && (channel !== 'qa' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))) throw new ThemePackageError('INVALID_ARGUMENT', '--version 仅允许 QA 使用有效 SemVer')
  return { sourceDir: path.resolve(sourceDir), outDir: path.resolve(outDir), keyId, privateKeyFile: privateKeyFile ? path.resolve(privateKeyFile) : null, channel, version }
}

function main() {
  const { sourceDir, outDir, keyId, privateKeyFile, channel, version } = parseArgs(process.argv.slice(2))
  const verified = verifyThemeSource(sourceDir)
  const manifest = {
    ...verified.manifest,
    version: version ?? verified.manifest.version,
    signature: keyId ? { algorithm: 'Ed25519', keyId, file: 'signature.ed25519' } : null
  }
  const entries = new Map(verified.entries)
  entries.set('theme.json', Buffer.from(`${JSON.stringify(verified.theme, null, 2)}\n`, 'utf8'))
  entries.set('manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'))
  entries.set('checksums.json', createChecksums(entries))
  let signing = null
  if (privateKeyFile) {
    const checksums = JSON.parse(entries.get('checksums.json').toString('utf8'))
    signing = signThemeMetadata(manifest, checksums, privateKeyFile)
    entries.set('signature.ed25519', signing.signature)
  }
  const archive = createDeterministicArchive(entries)
  const container = verifyPackageBuffer(archive)
  fs.mkdirSync(outDir, { recursive: true })
  const suffix = channel === 'qa' ? '-dev-signed' : ''
  const output = path.join(outDir, `${manifest.themeId}-${manifest.version}${suffix}.pftheme`)
  fs.writeFileSync(output, archive)
  process.stdout.write(`${JSON.stringify({
    status: 'PASS', output, bytes: archive.length, sha256: container.archiveSha256,
    signature: signing ? { status: 'VERIFIED', algorithm: 'Ed25519', keyId, publicKeyFingerprintSha256: signing.publicKeyFingerprintSha256 } : 'UNSIGNED_DEVELOPMENT'
  }, null, 2)}\n`)
}

try { main() } catch (error) {
  process.stderr.write(`${JSON.stringify({ status: 'FAIL', errorCode: error.code || 'THEME_PACK_FAILED', message: error.message, details: error.details || null }, null, 2)}\n`)
  process.exitCode = 1
}
