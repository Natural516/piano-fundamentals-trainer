const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const Ajv2020 = require('ajv/dist/2020').default

const ROOT = path.resolve(__dirname, '..')
const CONTRACT_DIR = path.join(ROOT, 'theme-contract', 'v1')
const manifestSchema = JSON.parse(fs.readFileSync(path.join(CONTRACT_DIR, 'manifest.schema.json'), 'utf8'))
const themeSchema = JSON.parse(fs.readFileSync(path.join(CONTRACT_DIR, 'theme.schema.json'), 'utf8'))
const ajv = new Ajv2020({ allErrors: true, strict: true })
const validateManifest = ajv.compile(manifestSchema)
const validateTheme = ajv.compile(themeSchema)

const LIMITS = Object.freeze({
  archiveBytes: 64 * 1024 * 1024,
  unpackedBytes: 96 * 1024 * 1024,
  files: 128,
  ordinaryFileBytes: 12 * 1024 * 1024,
  previewBytes: 4 * 1024 * 1024,
  manifestBytes: 64 * 1024,
  themeBytes: 256 * 1024,
  checksumsBytes: 256 * 1024,
  imageEdge: 4096,
  imagePixels: 16 * 1000 * 1000,
  totalImagePixels: 60 * 1000 * 1000
})

const ALLOWED_EXTENSIONS = new Set(['.json', '.png', '.jpg', '.jpeg', '.webp', '.ed25519'])
const REQUIRED_CAPABILITIES = ['homeVisual', 'practiceVisual', 'toolsVisual', 'historyVisual', 'settingsVisual', 'practiceActiveVisual', 'toolDetailVisual']
const RECIPE_CONTRACT = Object.freeze({
  homeVisual: { recipeId: 'home-scrapbook-single-hero-v1', slots: ['hero', 'headline', 'recentPractice', 'midi', 'tools'] },
  practiceVisual: { recipeId: 'practice-hero-cards-v1', slots: ['hero', 'sight', 'chord'] },
  toolsVisual: { recipeId: 'tools-studio-cards-v1', slots: ['hero', 'chord', 'interval', 'scale'] },
  historyVisual: { recipeId: 'history-journal-dashboard-v1', slots: ['hero', 'trend', 'memo', 'lower'] },
  settingsVisual: { recipeId: 'settings-hero-cards-v1', slots: ['hero', 'midi', 'theme', 'about'] },
  practiceActiveVisual: { recipeId: 'practice-decorated-focus-v1', slots: ['cornerCharacter', 'decorations', 'chordCornerCharacter', 'chordDecorations', 'chordPolaroid'] },
  toolDetailVisual: { recipeId: 'tool-reference-notebook-v1', slots: ['background', 'decorations', 'chordQueryHero', 'sharedCompleteRyo'] }
})

class ThemePackageError extends Error {
  constructor(code, message, details = undefined) {
    super(`${code}: ${message}`)
    this.code = code
    this.details = details
  }
}

function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex') }
function utf8Compare(a, b) { return Buffer.from(a.normalize('NFC')).compare(Buffer.from(b.normalize('NFC'))) }

function normalizePackagePath(value) {
  if (typeof value !== 'string' || value.length === 0) throw new ThemePackageError('UNSAFE_PATH', '空路径')
  const normalized = value.normalize('NFC')
  if (normalized.includes('\\') || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.startsWith('//')) throw new ThemePackageError('UNSAFE_PATH', normalized)
  const parts = normalized.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) throw new ThemePackageError('UNSAFE_PATH', normalized)
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized)) throw new ThemePackageError('UNSAFE_PATH', normalized)
  return parts.join('/')
}

function readJsonFile(file, code) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (error) { throw new ThemePackageError(code, `${file}: ${error.message}`) }
}

function imageDimensions(buffer, extension) {
  const ext = extension.toLowerCase()
  if (ext === '.png') {
    if (buffer.length < 24 || buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new ThemePackageError('IMAGE_DECODE_FAILED', 'PNG signature 无效')
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new ThemePackageError('IMAGE_DECODE_FAILED', 'JPEG signature 无效')
    let offset = 2
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue }
      const marker = buffer[offset + 1]
      const length = buffer.readUInt16BE(offset + 2)
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
      if (length < 2) break
      offset += 2 + length
    }
    throw new ThemePackageError('IMAGE_DECODE_FAILED', 'JPEG dimensions 无法读取')
  }
  if (ext === '.webp') {
    if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') throw new ThemePackageError('IMAGE_DECODE_FAILED', 'WebP signature 无效')
    const kind = buffer.toString('ascii', 12, 16)
    if (kind === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) }
    if (kind === 'VP8L') {
      const bits = buffer.readUInt32LE(21)
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) }
    }
    throw new ThemePackageError('IMAGE_DECODE_FAILED', '仅支持 VP8X/VP8L WebP dimensions')
  }
  throw new ThemePackageError('IMAGE_DECODE_FAILED', `不支持图片格式 ${extension}`)
}

function collectThemeAssetPaths(theme, manifest) {
  const paths = []
  for (const capability of REQUIRED_CAPABILITIES) {
    const value = theme.capabilities[capability]
    if (!value) throw new ThemePackageError('MISSING_CAPABILITY', capability)
    const contract = RECIPE_CONTRACT[capability]
    if (value.recipeId !== contract.recipeId) throw new ThemePackageError('UNSUPPORTED_RECIPE', `${capability}: ${value.recipeId}`)
    const slots = Object.keys(value.assets).sort()
    const expected = [...contract.slots].sort()
    if (JSON.stringify(slots) !== JSON.stringify(expected)) throw new ThemePackageError('INVALID_ASSET_SLOT', capability)
    for (const assetPath of Object.values(value.assets)) paths.push(normalizePackagePath(assetPath))
  }
  if (manifest.preview.cover) paths.push(normalizePackagePath(manifest.preview.cover))
  for (const preview of manifest.preview.gallery) paths.push(normalizePackagePath(preview))
  return [...new Set(paths)]
}

function sourceEntries(sourceDir, manifest, theme) {
  const sourceMapPath = path.join(sourceDir, 'source-map.json')
  const sourceMap = fs.existsSync(sourceMapPath) ? readJsonFile(sourceMapPath, 'INVALID_SOURCE_MAP') : { formatVersion: 1, entries: {} }
  if (sourceMap.formatVersion !== 1 || !sourceMap.entries || typeof sourceMap.entries !== 'object') throw new ThemePackageError('INVALID_SOURCE_MAP', 'source-map.json 格式无效')
  const entries = new Map()
  entries.set('manifest.json', fs.readFileSync(path.join(sourceDir, 'manifest.json')))
  entries.set('theme.json', fs.readFileSync(path.join(sourceDir, manifest.entry)))
  for (const assetPath of collectThemeAssetPaths(theme, manifest)) {
    const mapped = sourceMap.entries[assetPath]
    const direct = path.join(sourceDir, ...assetPath.split('/'))
    const source = mapped ? path.resolve(ROOT, mapped) : direct
    if (mapped && source !== ROOT && !source.startsWith(`${ROOT}${path.sep}`)) throw new ThemePackageError('UNSAFE_SOURCE_MAP', `${assetPath} -> ${mapped}`)
    if (!fs.existsSync(source)) throw new ThemePackageError('MISSING_ASSET', `${assetPath} -> ${source}`)
    const stat = fs.lstatSync(source)
    if (stat.isSymbolicLink()) throw new ThemePackageError('SYMLINK_FORBIDDEN', assetPath)
    if (!stat.isFile()) throw new ThemePackageError('MISSING_ASSET', assetPath)
    entries.set(assetPath, fs.readFileSync(source))
  }
  return entries
}

function verifyEntries(entries, manifest, theme) {
  if (entries.size > LIMITS.files) throw new ThemePackageError('PACKAGE_LIMIT_EXCEEDED', `文件数 ${entries.size}`)
  let unpacked = 0
  let totalPixels = 0
  const lower = new Set()
  const imageReport = []
  for (const [rawName, buffer] of entries) {
    const name = normalizePackagePath(rawName)
    const folded = name.toLocaleLowerCase('en-US')
    if (lower.has(folded)) throw new ThemePackageError('CASE_COLLISION', name)
    lower.add(folded)
    const ext = path.posix.extname(name).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) throw new ThemePackageError('FORBIDDEN_ENTRY', name)
    unpacked += buffer.length
    const limit = name === 'manifest.json' ? LIMITS.manifestBytes : name === 'theme.json' ? LIMITS.themeBytes : name === 'checksums.json' ? LIMITS.checksumsBytes : name.startsWith('previews/') ? LIMITS.previewBytes : LIMITS.ordinaryFileBytes
    if (buffer.length > limit) throw new ThemePackageError('FILE_TOO_LARGE', `${name}: ${buffer.length}`)
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      const size = imageDimensions(buffer, ext)
      const pixels = size.width * size.height
      if (size.width > LIMITS.imageEdge || size.height > LIMITS.imageEdge || pixels > LIMITS.imagePixels) throw new ThemePackageError('IMAGE_LIMIT_EXCEEDED', `${name}: ${size.width}x${size.height}`)
      totalPixels += pixels
      imageReport.push({ path: name, bytes: buffer.length, ...size, pixels })
    }
  }
  if (unpacked > LIMITS.unpackedBytes) throw new ThemePackageError('PACKAGE_LIMIT_EXCEEDED', `解压大小 ${unpacked}`)
  if (totalPixels > LIMITS.totalImagePixels) throw new ThemePackageError('IMAGE_LIMIT_EXCEEDED', `总像素 ${totalPixels}`)
  for (const assetPath of collectThemeAssetPaths(theme, manifest)) if (!entries.has(assetPath)) throw new ThemePackageError('MISSING_ASSET', assetPath)
  return { fileCount: entries.size, unpackedBytes: unpacked, totalImagePixels: totalPixels, images: imageReport }
}

function validateContracts(manifest, theme) {
  if (!validateManifest(manifest)) throw new ThemePackageError('INVALID_MANIFEST', 'manifest schema 校验失败', validateManifest.errors)
  if (!validateTheme(theme)) {
    const errors = validateTheme.errors || []
    const paths = errors.map((item) => `${item.instancePath}/${item.params && (item.params.additionalProperty || item.params.missingProperty) || ''}`)
    const code = paths.some((item) => item.includes('/recipeId')) ? 'UNSUPPORTED_RECIPE'
      : paths.some((item) => item.includes('/tokens/')) ? 'INVALID_TOKEN'
        : paths.some((item) => item.includes('/assets/')) ? 'UNSAFE_ASSET_PATH'
          : paths.some((item) => item.includes('/parameters/')) ? 'INVALID_PARAMETER'
            : paths.some((item) => item.includes('/capabilities/')) ? 'MISSING_CAPABILITY'
              : 'INVALID_THEME_SCHEMA'
    throw new ThemePackageError(code, 'theme schema 校验失败', errors)
  }
  for (const capability of REQUIRED_CAPABILITIES) if (!theme.capabilities[capability]) throw new ThemePackageError('MISSING_CAPABILITY', capability)
}

function verifyThemeSource(sourceDir) {
  const resolved = path.resolve(sourceDir)
  const manifestPath = path.join(resolved, 'manifest.json')
  const themePath = path.join(resolved, 'theme.json')
  if (!fs.existsSync(manifestPath)) throw new ThemePackageError('INVALID_MANIFEST', 'manifest.json 不存在')
  if (!fs.existsSync(themePath)) throw new ThemePackageError('INVALID_THEME_SCHEMA', 'theme.json 不存在')
  const manifest = readJsonFile(manifestPath, 'INVALID_MANIFEST')
  const theme = readJsonFile(themePath, 'INVALID_THEME_SCHEMA')
  validateContracts(manifest, theme)
  const entries = sourceEntries(resolved, manifest, theme)
  const limits = verifyEntries(entries, manifest, theme)
  return { sourceDir: resolved, manifest, theme, entries, limits }
}

function createChecksums(entries) {
  const files = {}
  for (const name of [...entries.keys()].filter((name) => name !== 'manifest.json' && name !== 'checksums.json' && name !== 'signature.ed25519').sort(utf8Compare)) files[name.normalize('NFC')] = sha256(entries.get(name))
  return Buffer.from(`${JSON.stringify({ algorithm: 'SHA-256', files }, null, 2)}\n`, 'utf8')
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0 }
  return table
})()
function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0 }

function createDeterministicArchive(entries) {
  const names = [...entries.keys()].sort(utf8Compare)
  const locals = []
  const centrals = []
  let offset = 0
  for (const name of names) {
    const normalized = normalizePackagePath(name)
    const nameBytes = Buffer.from(normalized, 'utf8')
    const data = entries.get(name)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10); local.writeUInt16LE(33, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26); local.writeUInt16LE(0, 28)
    locals.push(local, nameBytes, data)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12); central.writeUInt16LE(33, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + data.length
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10)
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20)
  const archive = Buffer.concat([...locals, ...centrals, end])
  if (archive.length > LIMITS.archiveBytes) throw new ThemePackageError('PACKAGE_LIMIT_EXCEEDED', `archive ${archive.length}`)
  return archive
}

function readDeterministicArchive(buffer) {
  if (buffer.length > LIMITS.archiveBytes) throw new ThemePackageError('PACKAGE_LIMIT_EXCEEDED', `archive ${buffer.length}`)
  const entries = new Map()
  let offset = 0
  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const flags = buffer.readUInt16LE(offset + 6)
    const method = buffer.readUInt16LE(offset + 8)
    if (method !== 0 || (flags & 0x0008)) throw new ThemePackageError('FORBIDDEN_ENTRY', '只允许 deterministic stored ZIP entries')
    const size = buffer.readUInt32LE(offset + 18)
    const nameLength = buffer.readUInt16LE(offset + 26)
    const extraLength = buffer.readUInt16LE(offset + 28)
    const name = normalizePackagePath(buffer.toString('utf8', offset + 30, offset + 30 + nameLength))
    if (entries.has(name)) throw new ThemePackageError('DUPLICATE_ENTRY', name)
    const dataStart = offset + 30 + nameLength + extraLength
    const dataEnd = dataStart + size
    if (dataEnd > buffer.length) throw new ThemePackageError('INVALID_CONTAINER', name)
    entries.set(name, buffer.subarray(dataStart, dataEnd))
    offset = dataEnd
  }
  return entries
}

function verifyPackageBuffer(buffer) {
  const entries = readDeterministicArchive(buffer)
  if (!entries.has('manifest.json') || !entries.has('theme.json') || !entries.has('checksums.json')) throw new ThemePackageError('INVALID_CONTAINER', '缺少核心文件')
  const manifest = JSON.parse(entries.get('manifest.json').toString('utf8'))
  const theme = JSON.parse(entries.get('theme.json').toString('utf8'))
  validateContracts(manifest, theme)
  if (manifest.signature === null && entries.has('signature.ed25519')) throw new ThemePackageError('INVALID_SIGNATURE_METADATA', 'unsigned manifest 不得包含 signature.ed25519')
  if (manifest.signature !== null) {
    if (!entries.has('signature.ed25519')) throw new ThemePackageError('SIGNATURE_MISSING', 'manifest 声明了签名但文件不存在')
    if (entries.get('signature.ed25519').length !== 64) throw new ThemePackageError('SIGNATURE_INVALID', 'Ed25519 签名必须为 64 bytes')
  }
  const checksums = JSON.parse(entries.get('checksums.json').toString('utf8'))
  if (checksums.algorithm !== 'SHA-256' || !checksums.files) throw new ThemePackageError('INVALID_CHECKSUMS', 'checksums.json 格式无效')
  const expectedChecksumNames = [...entries.keys()].filter((name) => name !== 'manifest.json' && name !== 'checksums.json' && name !== 'signature.ed25519').sort(utf8Compare)
  const actualChecksumNames = Object.keys(checksums.files).sort(utf8Compare)
  if (JSON.stringify(expectedChecksumNames) !== JSON.stringify(actualChecksumNames)) throw new ThemePackageError('INVALID_CHECKSUMS', 'checksums 文件集合不完整或包含额外条目')
  for (const [name, expected] of Object.entries(checksums.files)) {
    if (!entries.has(name) || sha256(entries.get(name)) !== expected) throw new ThemePackageError('CHECKSUM_MISMATCH', name)
  }
  const limits = verifyEntries(entries, manifest, theme)
  return { manifest, theme, entries, limits, archiveBytes: buffer.length, archiveSha256: sha256(buffer) }
}

module.exports = {
  ALLOWED_EXTENSIONS, LIMITS, REQUIRED_CAPABILITIES, RECIPE_CONTRACT, ROOT, ThemePackageError,
  createChecksums, createDeterministicArchive, normalizePackagePath, readDeterministicArchive,
  sha256, validateContracts, verifyPackageBuffer, verifyThemeSource
}
