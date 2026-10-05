const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { TextDecoder } = require('node:util')
const { loadUpdaterCore } = require('./android-updater-contract-loader.cjs')

const LEGACY_RELEASE_REPOSITORY_URL = 'https://github.com/Natural516/piano-trainer-releases'
const CANONICAL_MANIFEST_URL = 'https://github.com/Natural516/piano-fundamentals-trainer/releases/latest/download/latest.json'
const MAX_MANIFEST_BYTES = 65_536
const MAX_GITHUB_RESPONSE_BYTES = 5 * 1024 * 1024

function fail(message) {
  throw new Error(message)
}

function parseArguments(argumentsList) {
  const options = {}
  for (const argument of argumentsList) {
    const match = argument.match(/^--([a-z-]+)=(.+)$/)
    if (!match) fail(`Unknown argument: ${argument}`)
    if (options[match[1]] !== undefined) fail(`Duplicate argument: --${match[1]}`)
    options[match[1]] = match[2]
  }
  const allowed = new Set(['apk', 'manifest', 'public-repository', 'public-ref', 'public-root'])
  for (const name of Object.keys(options)) {
    if (!allowed.has(name)) fail(`Unknown option: --${name}`)
  }
  if (!options.apk) fail('Missing required --apk=<path>')
  if (!options['public-root'] && !options['public-repository']) {
    fail('Specify --public-root=<path> or --public-repository=<owner/name>')
  }
  if (options['public-root'] && options['public-repository']) {
    fail('Use only one public source: --public-root or --public-repository')
  }
  return options
}

function run(repositoryRoot, executable, argumentsList) {
  const result = spawnSync(executable, argumentsList, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true
  })
  if (result.error) fail(`${executable} could not start: ${result.error.message}`)
  if (result.status !== 0) {
    const details = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    fail(`${executable} exited ${result.status}${details ? `: ${details}` : ''}`)
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
}

function repositorySnapshot(repositoryRoot) {
  return {
    head: run(repositoryRoot, 'git', ['rev-parse', 'HEAD']),
    status: run(repositoryRoot, 'git', ['status', '--porcelain=v1', '--untracked-files=all'])
  }
}

function trackedPaths(repositoryRoot) {
  return run(repositoryRoot, 'git', ['ls-files', '-z']).split('\0').filter(Boolean)
}

function parseProperties(source, requiredKeys) {
  const result = {}
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator < 1) fail(`Malformed properties line: ${line}`)
    const key = trimmed.slice(0, separator).trim()
    if (Object.hasOwn(result, key)) fail(`Duplicate property: ${key}`)
    result[key] = trimmed.slice(separator + 1).trim()
  }
  for (const key of requiredKeys) {
    if (!result[key]) fail(`Missing property: ${key}`)
  }
  return result
}

function assertNoLegacyRepositoryReferences(files, label) {
  const offenders = [...files.entries()]
    .filter(([, source]) => source.includes(LEGACY_RELEASE_REPOSITORY_URL))
    .map(([file]) => file)
  assert.deepEqual(offenders, [], `${label} contains the retired release-repository URL: ${offenders.join(', ')}`)
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  const descriptor = fs.openSync(filePath, 'r')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  try {
    let read
    do {
      read = fs.readSync(descriptor, buffer, 0, buffer.length, null)
      if (read) hash.update(buffer.subarray(0, read))
    } while (read)
  } finally {
    fs.closeSync(descriptor)
  }
  return hash.digest('hex').toUpperCase()
}

async function fetchBoundedTextOnce(url, maximumBytes, accept) {
  const initial = new URL(url)
  assert.equal(initial.protocol, 'https:', `HTTPS required: ${url}`)
  const response = await fetch(initial, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
    headers: {
      Accept: accept,
      'Accept-Encoding': 'identity',
      'User-Agent': 'piano-fundamentals-trainer-release-preflight'
    }
  })
  if (!response.ok) fail(`GET ${url} returned HTTP ${response.status}`)
  assert.equal(new URL(response.url).protocol, 'https:', `Final response URL must remain HTTPS: ${response.url}`)
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    fail(`Response exceeds ${maximumBytes} bytes: ${url}`)
  }
  if (!response.body) fail(`Response body is missing: ${url}`)
  const chunks = []
  let total = 0
  for await (const chunk of response.body) {
    total += chunk.byteLength
    if (total > maximumBytes) fail(`Response exceeds ${maximumBytes} bytes: ${url}`)
    chunks.push(Buffer.from(chunk))
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
}

async function fetchBoundedText(url, maximumBytes, accept = '*/*') {
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fetchBoundedTextOnce(url, maximumBytes, accept)
    } catch (error) {
      lastError = error
      const retryable = error instanceof TypeError || error?.name === 'AbortError' || error?.name === 'TimeoutError'
      if (!retryable || attempt === 3) break
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt))
    }
  }
  const cause = lastError?.cause?.message ?? lastError?.message ?? String(lastError)
  fail(`GET ${url} failed after bounded retries: ${cause}`)
}

function publicPathAudit(paths) {
  const forbidden = [
    /(^|\/)(local\.properties|keystore\.properties)$/i,
    /\.(jks|keystore|p12|pfx|apk|aab|aar)$/i,
    /(^|\/)\.env(?:\.|$)/i,
    /^fixtures\/golden\//i,
    /^native-audio-poc\//i,
    /^resources\/piano-samples\/salamander\//i,
    /^src\/(main|preload)\//i,
    /^docs\/agent\//i,
    /(^|\/)latest\.json$/i
  ]
  const offenders = paths.filter((entry) => forbidden.some((pattern) => pattern.test(entry)))
  assert.deepEqual(offenders, [], `public source contains forbidden private/secret/artifact paths: ${offenders.join(', ')}`)
}

async function loadRemotePublicSource(repository, ref) {
  assert.match(repository, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'public repository must be owner/name')
  assert.match(ref, /^[A-Za-z0-9._/-]+$/, 'public ref contains unsupported characters')
  const treeUrl = `https://api.github.com/repos/${repository}/git/trees/${encodeURIComponent(ref)}?recursive=1`
  const treeResponse = JSON.parse(await fetchBoundedText(treeUrl, MAX_GITHUB_RESPONSE_BYTES, 'application/vnd.github+json'))
  assert.equal(treeResponse.truncated, false, 'GitHub public tree response is truncated')
  const paths = treeResponse.tree.filter((entry) => entry.type === 'blob').map((entry) => entry.path)
  const markdownPaths = paths.filter((entry) => /\.md$/i.test(entry))
  const documents = new Map()
  for (const documentPath of markdownPaths) {
    const encodedPath = documentPath.split('/').map(encodeURIComponent).join('/')
    const rawUrl = `https://raw.githubusercontent.com/${repository}/${encodeURIComponent(ref)}/${encodedPath}`
    documents.set(documentPath, await fetchBoundedText(rawUrl, MAX_GITHUB_RESPONSE_BYTES, 'text/plain'))
  }
  return { paths, documents, description: `https://github.com/${repository}@${ref}` }
}

function loadLocalPublicSource(publicRoot) {
  const resolved = path.resolve(publicRoot)
  const rootStat = fs.lstatSync(resolved)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail(`Public root must be a real directory: ${resolved}`)
  // Existing Git inputs keep their tracked-path audit. Explicit repo-external candidate
  // projections have no Git index: inspect EVERY real file, with no ignore/allowlist bypass.
  const paths = fs.existsSync(path.join(resolved, '.git'))
    ? run(resolved, 'git', ['ls-files', '-z']).split('\0').filter(Boolean).map((entry) => entry.replace(/\\/g, '/'))
    : listCandidatePublicPaths(resolved)
  const documents = new Map(paths
    .filter((entry) => /\.md$/i.test(entry))
    .map((entry) => [entry, fs.readFileSync(path.join(resolved, entry), 'utf8')]))
  return { paths, documents, description: resolved }
}

function listCandidatePublicPaths(root, relative = '') {
  const paths = []
  for (const name of fs.readdirSync(path.join(root, relative)).sort()) {
    const entry = path.join(relative, name)
    const stat = fs.lstatSync(path.join(root, entry))
    if (stat.isSymbolicLink()) fail(`Candidate public root must not contain links: ${entry}`)
    if (stat.isDirectory()) paths.push(...listCandidatePublicPaths(root, entry))
    else if (stat.isFile()) paths.push(entry.replace(/\\/g, '/'))
    else fail(`Candidate public root contains a non-file entry: ${entry}`)
  }
  return paths
}

function assertPublicReleaseFacts(publicSource, versionCode, versionName) {
  const readme = publicSource.documents.get('README.md')
  const changelog = publicSource.documents.get('CHANGELOG.md')
  assert.ok(readme, 'public README.md is missing')
  assert.ok(changelog, 'public CHANGELOG.md is missing')
  // Verify one complete stable-release fact, independent of inline Markdown styling.
  // Exact equality protects both fields, including against version/code prefix matches.
  const releaseFacts = readme.split(/\r?\n/).map(line => line.replaceAll('`', '').replaceAll('**', '').trim())
  assert.ok(releaseFacts.includes(`Android ${versionName} · versionCode ${versionCode}`),
    `public README stable release must be Android ${versionName} · versionCode ${versionCode}`)
  assert.match(changelog, new RegExp(`^## ${versionName.replaceAll('.', '\\.')} .*versionCode ${versionCode}$`, 'm'))
  const screenshotReferences = [...new Set(readme.match(/docs\/screenshots\/[^)\s"'<>]+/g) ?? [])]
  assert.ok(screenshotReferences.length > 0, 'public README has no screenshot references')
  const pathSet = new Set(publicSource.paths)
  const missing = screenshotReferences.filter((entry) => !pathSet.has(entry))
  assert.deepEqual(missing, [], `public README references missing screenshots: ${missing.join(', ')}`)
  return screenshotReferences.length
}

async function main() {
  const repositoryRoot = path.resolve(__dirname, '..')
  const options = parseArguments(process.argv.slice(2))
  const initialSnapshot = repositorySnapshot(repositoryRoot)
  const updaterCore = loadUpdaterCore(repositoryRoot)
  const results = []
  const check = async (name, callback) => {
    const detail = await callback()
    results.push({ name, detail: detail ?? '' })
  }

  const versionSource = path.join(repositoryRoot, 'android', 'version.properties')
  const version = parseProperties(fs.readFileSync(versionSource, 'utf8'), ['versionCode', 'versionName'])
  assert.match(version.versionCode, /^[1-9][0-9]*$/, 'versionCode must be a positive integer')

  await check('android/version.properties is the Android version source', () => {
    const gradle = fs.readFileSync(path.join(repositoryRoot, 'android', 'app', 'build.gradle'), 'utf8')
    assert.match(gradle, /rootProject\.file\('version\.properties'\)/)
    assert.match(gradle, /versionCode appVersionCode/)
    assert.match(gradle, /versionName appVersionName/)
    return `${version.versionName} / ${version.versionCode}`
  })

  await check('production and QA package identities are isolated', () => {
    const gradle = fs.readFileSync(path.join(repositoryRoot, 'android', 'app', 'build.gradle'), 'utf8')
    assert.equal(updaterCore.UPDATER_PACKAGE_ID, 'com.pianofundamentals.trainer')
    assert.match(gradle, /applicationId "com\.pianofundamentals\.trainer"/)
    assert.match(gradle, /applicationIdSuffix "\.qa"/)
    return 'production=com.pianofundamentals.trainer, QA=com.pianofundamentals.trainer.qa'
  })

  const apkPath = path.resolve(repositoryRoot, options.apk)
  if (!fs.existsSync(apkPath)) fail(`Release APK not found: ${apkPath}`)
  let verifierOutput
  await check('Release APK is non-debuggable and matches the exact permanent signer', () => {
    verifierOutput = run(repositoryRoot, process.execPath, [
      path.join(repositoryRoot, 'scripts', 'android-apk-signing-report.cjs'),
      apkPath,
      '--expect-release'
    ])
    assert.match(verifierOutput, /Build status: RELEASE \/ NON-DEBUGGABLE/)
    assert.match(verifierOutput, /Permanent signer pin match: PASS/)
    return 'exact frozen signer pin'
  })

  const apkSize = fs.statSync(apkPath).size
  const apkSha256 = sha256File(apkPath)
  await check('Release APK size and SHA-256 are readable', () => `${apkSize} bytes, ${apkSha256}`)

  const updaterProperties = parseProperties(
    fs.readFileSync(path.join(repositoryRoot, 'android', 'updater.properties'), 'utf8'),
    ['manifestUrl']
  )
  await check('production updater endpoint is canonical', () => {
    assert.equal(updaterProperties.manifestUrl, CANONICAL_MANIFEST_URL)
    return updaterProperties.manifestUrl
  })

  await check('current private config/docs reject the retired release repository', () => {
    const currentPaths = trackedPaths(repositoryRoot).filter((entry) =>
      entry === 'android/updater.properties' ||
      entry === 'android/app/build.gradle' ||
      entry === 'capacitor.config.ts' ||
      entry === 'vite.android-prototype.config.ts' ||
      entry.startsWith('prototype/android-tablet-v1/src/') ||
      [
        'docs/agent/OPEN_RISKS.md',
        'docs/agent/ANDROID_PROJECT_STATE.md',
        'android/RELEASE_SIGNING.md',
        'prototype/android-tablet-v1/README.md'
      ].includes(entry)
    )
    const sources = new Map(currentPaths.map((entry) => [entry, fs.readFileSync(path.join(repositoryRoot, entry), 'utf8')]))
    assertNoLegacyRepositoryReferences(sources, 'current private config/docs')
    return `${sources.size} current files checked; historical acceptance/archive documents excluded`
  })

  let manifestText
  await check('strict latest.json parser accepts the selected manifest', async () => {
    if (options.manifest) {
      const manifestPath = path.resolve(repositoryRoot, options.manifest)
      const size = fs.statSync(manifestPath).size
      if (size > MAX_MANIFEST_BYTES) fail(`Manifest exceeds ${MAX_MANIFEST_BYTES} bytes: ${manifestPath}`)
      manifestText = fs.readFileSync(manifestPath, 'utf8')
    } else {
      manifestText = await fetchBoundedText(updaterProperties.manifestUrl, MAX_MANIFEST_BYTES, 'application/json')
    }
    const manifest = updaterCore.parseUpdaterManifest(manifestText)
    assert.equal(manifest.packageId, updaterCore.UPDATER_PACKAGE_ID)
    assert.equal(String(manifest.versionCode), version.versionCode)
    assert.equal(manifest.versionName, version.versionName)
    assert.equal(manifest.apkSizeBytes, apkSize)
    assert.equal(manifest.apkSha256.toUpperCase(), apkSha256)
    assert.ok(manifest.apkUrl.startsWith('https://github.com/Natural516/piano-fundamentals-trainer/releases/'))
    return options.manifest ? path.resolve(repositoryRoot, options.manifest) : updaterProperties.manifestUrl
  })

  const publicSource = options['public-root']
    ? loadLocalPublicSource(options['public-root'])
    : await loadRemotePublicSource(options['public-repository'], options['public-ref'] ?? 'main')

  await check('public README/CHANGELOG release facts and screenshots are consistent', () => {
    const screenshotCount = assertPublicReleaseFacts(publicSource, version.versionCode, version.versionName)
    return `${publicSource.description}; ${screenshotCount} screenshot references`
  })

  await check('current public docs reject the retired release repository', () => {
    assertNoLegacyRepositoryReferences(publicSource.documents, 'current public docs')
    return `${publicSource.documents.size} Markdown documents checked`
  })

  await check('public secret/private-material path audit passes', () => {
    publicPathAudit(publicSource.paths)
    return `${publicSource.paths.length} tracked public paths checked`
  })

  const finalSnapshot = repositorySnapshot(repositoryRoot)
  await check('preflight performs no repository mutation', () => {
    assert.deepEqual(finalSnapshot, initialSnapshot)
    return `HEAD ${finalSnapshot.head}; status unchanged`
  })

  for (const result of results) {
    process.stdout.write(`PASS ${result.name}${result.detail ? ` — ${result.detail}` : ''}\n`)
  }
  process.stdout.write(`\n${results.length}/${results.length} Android release preflight checks PASS\n`)
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Android release preflight failed: ${error.stack ?? error}\n`)
    process.exit(1)
  })
}

module.exports = {
  LEGACY_RELEASE_REPOSITORY_URL,
  assertNoLegacyRepositoryReferences,
  assertPublicReleaseFacts,
  loadLocalPublicSource,
  parseArguments,
  publicPathAudit
}
