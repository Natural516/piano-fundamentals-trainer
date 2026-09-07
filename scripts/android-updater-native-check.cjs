const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const androidRoot = path.join(root, 'android')
const gradleCommand = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
const result = spawnSync(
  gradleCommand,
  ['testDebugUnitTest', '--tests', 'com.pianofundamentals.trainer.AndroidUpdaterSecurityPolicyTest'],
  { cwd: androidRoot, encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32' }
)

if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
if (result.error) throw result.error
assert.equal(result.status, 0, 'Android updater native Gradle tests failed')

const reportPath = path.join(
  androidRoot,
  'app',
  'build',
  'test-results',
  'testDebugUnitTest',
  'TEST-com.pianofundamentals.trainer.AndroidUpdaterSecurityPolicyTest.xml'
)
const report = fs.readFileSync(reportPath, 'utf8')
const suite = report.match(/<testsuite\b[^>]*\btests="(\d+)"[^>]*\bskipped="(\d+)"[^>]*\bfailures="(\d+)"[^>]*\berrors="(\d+)"/)
assert.ok(suite, 'Native updater JUnit result is missing')
assert.equal(Number(suite[1]), 9)
assert.equal(Number(suite[2]), 0)
assert.equal(Number(suite[3]), 0)
assert.equal(Number(suite[4]), 0)
process.stdout.write('\n9/9 Android updater native security checks PASS\n')
