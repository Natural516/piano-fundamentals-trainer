const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const yauzl = require('yauzl')

const root = path.resolve(__dirname, '..')
const themeAssets = path.join(root, 'theme-packages/bocchi/assets')
const dist = path.join(root, 'dist/android-tablet-prototype')
const apk = path.join(root, 'android/app/build/outputs/apk/qa/app-qa.apk')
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')

function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(target) : [target]
  })
}

function readApkEntries(file) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (openError, zip) => {
      if (openError) { reject(openError); return }
      const entries = []
      zip.readEntry()
      zip.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName)) { zip.readEntry(); return }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) { reject(streamError); return }
          const chunks = []
          stream.on('data', (chunk) => chunks.push(chunk))
          stream.on('error', reject)
          stream.on('end', () => { const bytes = Buffer.concat(chunks); entries.push({ name: entry.fileName, bytes: bytes.length, sha256: hash(bytes) }); zip.readEntry() })
        })
      })
      zip.on('end', () => resolve(entries))
      zip.on('error', reject)
    })
  })
}

async function main() {
  assert.ok(fs.existsSync(apk), '先构建 QA APK')
  const sourceFiles = filesBelow(themeAssets).filter((file) => file.toLowerCase().endsWith('.png'))
  const sourceHashes = new Map(sourceFiles.map((file) => [hash(fs.readFileSync(file)), path.relative(root, file).replaceAll('\\', '/')]))
  const distFiles = filesBelow(dist)
  const distMatches = distFiles.map((file) => ({ path: path.relative(root, file).replaceAll('\\', '/'), sha256: hash(fs.readFileSync(file)) })).filter((entry) => sourceHashes.has(entry.sha256))
  const apkEntries = await readApkEntries(apk)
  const apkMatches = apkEntries.filter((entry) => sourceHashes.has(entry.sha256))
  assert.deepEqual(distMatches, [], `Vite dist 含 Bocchi runtime PNG: ${JSON.stringify(distMatches)}`)
  assert.deepEqual(apkMatches, [], `APK 含 Bocchi runtime PNG: ${JSON.stringify(apkMatches)}`)
  assert.equal(apkEntries.some((entry) => entry.name.includes('theme-packages/bocchi') || entry.name.includes('assets/themes/bocchi')), false)
  console.log(JSON.stringify({ status: 'PASS', sourcePngCount: sourceFiles.length, distFileCount: distFiles.length, apkEntryCount: apkEntries.length, distMatches, apkMatches }, null, 2))
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1 })
