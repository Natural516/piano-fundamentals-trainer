const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const EXPECTED_ANDROID_APPLICATION_ID = 'com.pianofundamentals.trainer'

function fail(message) {
  process.stderr.write(`Android APK verification failed: ${message}\n`)
  process.exit(1)
}

function newestBuildToolsDirectory(sdkRoot) {
  const buildToolsRoot = path.join(sdkRoot, 'build-tools')
  if (!fs.existsSync(buildToolsRoot)) fail(`Android SDK build-tools not found under ${sdkRoot}`)
  const versions = fs.readdirSync(buildToolsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
  if (!versions.length) fail(`No Android SDK build-tools versions found under ${buildToolsRoot}`)
  return path.join(buildToolsRoot, versions[0])
}

function runTool(tool, args) {
  const result = spawnSync(tool, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32' && /\.(bat|cmd)$/i.test(tool),
    windowsHide: true
  })
  if (result.error) fail(`${path.basename(tool)} could not start: ${result.error.message}`)
  if (result.status !== 0) {
    const details = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    fail(`${path.basename(tool)} exited ${result.status}${details ? `: ${details}` : ''}`)
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`
}

function quotedField(line, field) {
  return line.match(new RegExp(`${field}='([^']*)'`))?.[1] ?? null
}

const argumentsList = process.argv.slice(2)
const apkArgument = argumentsList.find((argument) => !argument.startsWith('--'))
const expectDebug = argumentsList.includes('--expect-debug')
const expectRelease = argumentsList.includes('--expect-release')
if (!apkArgument || expectDebug === expectRelease) {
  fail('usage: node scripts/android-apk-signing-report.cjs <apk> (--expect-debug | --expect-release)')
}

const repositoryRoot = path.resolve(__dirname, '..')
const apkPath = path.resolve(repositoryRoot, apkArgument)
if (!fs.existsSync(apkPath)) fail(`APK not found: ${apkPath}`)

const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
if (!sdkRoot) fail('ANDROID_HOME or ANDROID_SDK_ROOT must point to the Android SDK')
const buildToolsDirectory = newestBuildToolsDirectory(path.resolve(sdkRoot))
const aapt2 = path.join(buildToolsDirectory, process.platform === 'win32' ? 'aapt2.exe' : 'aapt2')
const apksigner = path.join(buildToolsDirectory, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner')
if (!fs.existsSync(aapt2)) fail(`aapt2 not found: ${aapt2}`)
if (!fs.existsSync(apksigner)) fail(`apksigner not found: ${apksigner}`)

const badging = runTool(aapt2, ['dump', 'badging', apkPath])
const packageLine = badging.split(/\r?\n/).find((line) => line.startsWith('package:'))
if (!packageLine) fail('aapt2 did not return package metadata')
const applicationId = quotedField(packageLine, 'name')
const versionCode = quotedField(packageLine, 'versionCode')
const versionName = quotedField(packageLine, 'versionName')
const debuggable = badging.split(/\r?\n/).some((line) => line.trim() === 'application-debuggable')

const versionProperties = fs.readFileSync(path.join(repositoryRoot, 'android', 'version.properties'), 'utf8')
const expectedVersionCode = versionProperties.match(/^versionCode=(.+)$/m)?.[1]?.trim()
const expectedVersionName = versionProperties.match(/^versionName=(.+)$/m)?.[1]?.trim()

assert.equal(applicationId, EXPECTED_ANDROID_APPLICATION_ID, 'permanent Android application ID changed')
assert.equal(versionCode, expectedVersionCode, 'APK versionCode differs from android/version.properties')
assert.equal(versionName, expectedVersionName, 'APK versionName differs from android/version.properties')
if (expectDebug) assert.equal(debuggable, true, 'expected a debuggable APK')
if (expectRelease) assert.equal(debuggable, false, 'release APK must not be debuggable')

const signerReport = runTool(apksigner, ['verify', '--print-certs', apkPath])
const signerDn = signerReport.match(/Signer #1 certificate DN:\s*(.+)/i)?.[1]?.trim() ?? 'unknown'
const signerSha256 = signerReport.match(/Signer #1 certificate SHA-256 digest:\s*([0-9a-f]+)/i)?.[1]
if (!signerSha256) fail('apksigner did not return a signer SHA-256 certificate digest')
if (expectRelease && /CN=Android Debug/i.test(signerDn)) {
  fail('release APK is signed with the Android Debug certificate')
}

const fingerprint = signerSha256.toUpperCase().match(/.{1,2}/g).join(':')
process.stdout.write([
  `APK: ${apkPath}`,
  `Package ID: ${applicationId}`,
  `Build status: ${debuggable ? 'DEBUG' : 'RELEASE / NON-DEBUGGABLE'}`,
  `Version code: ${versionCode}`,
  `Version name: ${versionName}`,
  `Signer certificate DN: ${signerDn}`,
  `Signer certificate SHA-256: ${fingerprint}`,
  'APK signature verification: PASS'
].join('\n') + '\n')
