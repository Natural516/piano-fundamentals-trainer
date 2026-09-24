const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const repositoryRoot = path.resolve(__dirname, '..')
const apkPath = path.join(repositoryRoot, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'piano-release-audit-'))

const readTree = (directory) => {
  const contents = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) contents.push(readTree(absolutePath))
    else if (/\.(?:html|js|css)$/i.test(entry.name)) contents.push(fs.readFileSync(absolutePath, 'utf8'))
  }
  return contents.join('\n')
}

try {
  assert.equal(fs.existsSync(apkPath) && fs.statSync(apkPath).isFile(), true, 'Release APK is missing; run npm.cmd run android:apk:release first')

  const jarName = process.platform === 'win32' ? 'jar.exe' : 'jar'
  const jarPath = process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, 'bin', jarName)
    : jarName
  const extraction = spawnSync(jarPath, ['xf', apkPath], {
    cwd: tempRoot,
    encoding: 'utf8',
    windowsHide: true
  })
  assert.equal(extraction.status, 0, `Unable to inspect Release APK assets: ${extraction.stderr || extraction.error || 'jar failed'}`)

  const publicAssets = path.join(tempRoot, 'assets', 'public')
  assert.equal(fs.existsSync(publicAssets) && fs.statSync(publicAssets).isDirectory(), true, 'Release APK does not contain Capacitor public assets')
  const bundle = readTree(publicAssets)
  const productionManifestUrl = 'https://github.com/Natural516/piano-fundamentals-trainer/releases/latest/download/latest.json'

  const forbiddenDevelopmentTokens = [
    'A3.1 · DEBUG',
    'A3.1 · DEV',
    'Human UI Review',
    '开发模拟 MIDI',
    'DEVICE-001-APP viewport',
    'DEVICE-001 viewport',
    '发送 NOTE_ON',
    '重新开始开发会话'
  ]
  for (const token of forbiddenDevelopmentTokens) {
    assert.equal(bundle.includes(token), false, `Release APK exposes development-only UI: ${token}`)
  }

  for (const token of ['今天 09:42 · 已完成', '共 18 条记录', '你已经完成 6 次练习']) {
    assert.equal(bundle.includes(token), false, `Release APK retains a former History Mock claim: ${token}`)
  }
  assert.equal(bundle.includes('暂无练习记录'), true, 'Release APK is missing the durable History empty state')
  assert.equal(bundle.includes('提前结束'), true, 'Release APK is missing the STOPPED History presentation')

  assert.equal(bundle.includes('Android 原生 BLE MIDI'), true, 'Release APK is missing the real Bluetooth MIDI path')
  assert.equal(bundle.includes('扫描 MIDI 设备'), true, 'Release APK is missing normal MIDI connection UI')

  for (const token of ['更新服务尚未配置', '安装始终由 Android 系统确认', '检查更新']) {
    assert.equal(bundle.includes(token), true, `Release APK is missing real updater UI: ${token}`)
  }
  assert.equal(bundle.includes(productionManifestUrl), true, 'Release APK is missing the production updater Manifest endpoint')
  assert.equal(bundle.includes('debug-override.invalid'), false, 'Release APK contains a development updater endpoint override')
  for (const token of ['跳过签名', '跳过哈希', '接受任意 APK', 'Development updater']) {
    assert.equal(bundle.includes(token), false, `Release APK exposes an updater bypass/control: ${token}`)
  }

  process.stdout.write('PASS Release APK excludes development-only controls and diagnostics\n')
  process.stdout.write('PASS Release APK retains real Bluetooth MIDI connection UI\n')
  process.stdout.write(`PASS Release APK binds production updater Manifest endpoint: ${productionManifestUrl}\n`)
  process.stdout.write('\n2/2 Android release-mode checks PASS\n')
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
