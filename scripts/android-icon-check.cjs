const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const source = path.join(root, 'artwork', 'approved', 'android-app-icon-source.png')
const res = path.join(root, 'android', 'app', 'src', 'main', 'res')
const expectedSourceHash = '4BC8EA53852A16F2B5704CF7C5FC03A85C0F4A7287A15AC6E0A787D21817BBD1'
const densities = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] }

function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase() }
function pngDimensions(file) {
  const bytes = fs.readFileSync(file)
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG')
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

const tests = []
const test = (id, title, callback) => tests.push({ id, title, callback })

test('I01', 'approved source hash is exact', () => assert.equal(sha256(source), expectedSourceHash))
test('I02', 'launcher resources are generated only from the hash-pinned approved artwork', () => {
  const generator = fs.readFileSync(path.join(root, 'scripts', 'generate-android-launcher-icons.py'), 'utf8')
  assert.match(generator, /android-app-icon-source\.png/)
  assert.match(generator, new RegExp(expectedSourceHash))
  assert.doesNotMatch(generator, /ImageDraw\.(line|polygon|text)|generate|prompt/i)
  for (const density of Object.keys(densities)) for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
    assert.ok(fs.statSync(path.join(res, `mipmap-${density}`, name)).size > 0)
  }
})
test('I03', 'adaptive launcher resources do not reference the obsolete vector foreground', () => {
  const adaptive = fs.readFileSync(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'), 'utf8')
  assert.doesNotMatch(adaptive, /drawable\/ic_launcher_foreground/)
})
test('I04', 'adaptive round and legacy resources resolve at Android-standard dimensions', () => {
  for (const [density, [legacy, foreground]] of Object.entries(densities)) {
    assert.deepEqual(pngDimensions(path.join(res, `mipmap-${density}`, 'ic_launcher.png')), [legacy, legacy])
    assert.deepEqual(pngDimensions(path.join(res, `mipmap-${density}`, 'ic_launcher_round.png')), [legacy, legacy])
    assert.deepEqual(pngDimensions(path.join(res, `mipmap-${density}`, 'ic_launcher_foreground.png')), [foreground, foreground])
  }
  for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    const xml = fs.readFileSync(path.join(res, 'mipmap-anydpi-v26', name), 'utf8')
    assert.match(xml, /@color\/ic_launcher_background/)
    assert.match(xml, /@mipmap\/ic_launcher_foreground/)
  }
})
test('I05', 'release manifest references valid normal and round launcher resources', () => {
  const manifest = fs.readFileSync(path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8')
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/)
  assert.match(manifest, /android:roundIcon="@mipmap\/ic_launcher_round"/)
})
test('I06', 'application package and name remain frozen', () => {
  const build = fs.readFileSync(path.join(root, 'android', 'app', 'build.gradle'), 'utf8')
  const strings = fs.readFileSync(path.join(res, 'values', 'strings.xml'), 'utf8')
  assert.match(build, /applicationId "com\.pianofundamentals\.trainer"/)
  assert.match(strings, /钢琴基本功训练器/)
})
let failed = 0
for (const item of tests) {
  try { item.callback(); console.log(`PASS ${item.id} ${item.title}`) }
  catch (error) { failed += 1; console.error(`FAIL ${item.id} ${item.title}`); console.error(error.stack || error) }
}
console.log(`\n${tests.length - failed}/${tests.length} Android icon checks PASS`)
if (failed > 0) process.exitCode = 1
