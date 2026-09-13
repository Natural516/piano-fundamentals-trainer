const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const source = path.join(root, 'artwork', 'approved', 'android-app-icon-source.png')
const res = path.join(root, 'android', 'app', 'src', 'main', 'res')
const expectedSourceHash = '4BC8EA53852A16F2B5704CF7C5FC03A85C0F4A7287A15AC6E0A787D21817BBD1'
const densities = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] }
const expectedGeneratedHashes = {
  'android/app/src/main/res/mipmap-mdpi/ic_launcher.png': '2E13C849C01B738D8C3D42B4044F56D304B3E5BD320E0B6955F6E13CBEFB5165',
  'android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png': '8482A0DA4F18A0E79DE3A31C7F212F832984B5FC229B82E148FA3E6567FA5F22',
  'android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png': '2ECF251ADD178E11382A6C92666799F60391D3BC443192CC6C8659DE294FC0A6',
  'android/app/src/main/res/mipmap-hdpi/ic_launcher.png': 'AA7907D2B53EFC71C2BE3422D083F4E11A7A511AE51E19DD780D926630FE772F',
  'android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png': '84FD7891B470631AB1526F0F278E9F6940F12F0E52F1112BFC6AAB714125549D',
  'android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png': 'C930285A4A2E8AA55B5F37E2E1B13841DDFB29099AF6559F7619B802124D9844',
  'android/app/src/main/res/mipmap-xhdpi/ic_launcher.png': 'F30B8BDC43BADA57663D3D6F21C49CBC4C40F0A788B1C9F0AE6CAF5D4554FFAF',
  'android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png': '5210C845DA63FBD67FF85FE520944D857C50B2278B28D2D99CA0225690A3827E',
  'android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png': 'EB94F075FEA40031A154C5C5E8214C43102A6B67E13BD8944F2D33495DFA49D1',
  'android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png': '78D287A57C5274F0775569652BCCC471C75F2478242836C81254D008B3B4FEE9',
  'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png': '18231C3F3E66C63AB782ACEB1F0387D4ED66C1DA31DC95FDC2677134EF5199A4',
  'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png': 'AECF3A0F378A50BB5FB4247DAC2457F78205B8CC6D12DABDBBB70E01C3D69C61',
  'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png': '82440CCC5004BF049ECDFC2401CE4F8D6005C6F4B6A1A81150F7FF6FF72C60F4',
  'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png': '0674657C9AF8A352179288ABB1E3FAD501A39BA3510A96EAC22F21CBCA275A67',
  'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png': '81FA80C93CDF3B3AFD5582C669EB4A2DE3E19FA9E7C70D4DA7E68A7F74ACC6B5',
}

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
test('I03', 'generated launcher bitmaps match the approved public artifact hashes', () => {
  for (const [relative, expectedHash] of Object.entries(expectedGeneratedHashes)) {
    assert.equal(sha256(path.join(root, relative)), expectedHash, `${relative} differs from the approved generated artifact`)
  }
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
test('I07', 'the deterministic generator retains 512px circle squircle and full-square QA previews', () => {
  const generator = fs.readFileSync(path.join(root, 'scripts', 'generate-android-launcher-icons.py'), 'utf8')
  assert.match(generator, /preview_size = 512/)
  for (const name of ['circle', 'squircle', 'full-square']) assert.match(generator, new RegExp(`${name}\\.png`))
})

let failed = 0
for (const item of tests) {
  try { item.callback(); console.log(`PASS ${item.id} ${item.title}`) }
  catch (error) { failed += 1; console.error(`FAIL ${item.id} ${item.title}`); console.error(error.stack || error) }
}
console.log(`\n${tests.length - failed}/${tests.length} Android icon checks PASS`)
if (failed > 0) process.exitCode = 1
