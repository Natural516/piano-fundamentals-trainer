const { spawn, spawnSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require('@playwright/test')

const ROOT = path.resolve(__dirname, '..')
const CASES = [
  { caseId: 'home', screen: 'home' }, { caseId: 'practice', screen: 'practice' }, { caseId: 'tools', screen: 'tools' }, { caseId: 'history', screen: 'history' }, { caseId: 'settings', screen: 'settings' },
  { caseId: 'sight-normal', screen: 'sight-active' }, { caseId: 'sight-correct', screen: 'sight-correct' }, { caseId: 'sight-wrong', screen: 'sight-wrong' }, { caseId: 'sight-timeout', screen: 'sight-timeout' }, { caseId: 'sight-pause', screen: 'sight-active', setup: 'sight-pause' }, { caseId: 'sight-early-end', screen: 'sight-early-end' },
  { caseId: 'chord-normal', screen: 'chord-practice', setup: 'chord:arpeggio-ready' }, { caseId: 'chord-arpeggio-correct', screen: 'chord-practice', setup: 'chord:wait-release-to-block' }, { caseId: 'chord-arpeggio-wrong', screen: 'chord-practice', setup: 'chord:arpeggio-wrong' }, { caseId: 'chord-transition', screen: 'chord-practice', setup: 'chord:wait-release-to-block' }, { caseId: 'chord-block-wrong', screen: 'chord-practice', setup: 'chord:block-wrong-restart' }, { caseId: 'chord-complete', screen: 'chord-practice', setup: 'chord:question-correct' }, { caseId: 'chord-pause', screen: 'chord-practice', setup: 'chord-pause' },
  { caseId: 'chord-query-triad', screen: 'chord-query-tool' }, { caseId: 'chord-query-complex', screen: 'chord-query-tool', setup: 'chord-query-complex' },
  { caseId: 'scale-c-major', screen: 'scale-key-signature-tool' }, { caseId: 'scale-f-sharp-major', screen: 'scale-key-signature-tool', setup: 'scale:F#' }, { caseId: 'scale-c-flat-major', screen: 'scale-key-signature-tool', setup: 'scale:Cb' },
  { caseId: 'interval-ascending', screen: 'interval-query-tool' }, { caseId: 'interval-descending', screen: 'interval-query-tool', setup: 'interval-descending' }, { caseId: 'interval-enharmonic-same-height', screen: 'interval-query-tool', setup: 'interval-enharmonic' }, { caseId: 'interval-compound', screen: 'interval-query-tool', setup: 'interval-compound' }
]
const VIEWPORTS = [{ width: 1385, height: 866 }, { width: 1280, height: 800 }]
const DYNAMIC_FACT_CASES = new Set(['sight-normal', 'sight-correct', 'sight-wrong', 'sight-timeout', 'sight-pause', 'chord-pause'])
const GOLD_CASE_IDS = new Set(['home', 'practice', 'tools', 'history', 'settings', 'sight-normal', 'chord-normal', 'chord-query-triad', 'scale-c-major', 'interval-ascending'])

function stopServer(server) {
  if (!server || server.exitCode !== null) return
  if (process.platform === 'win32') spawnSync('taskkill.exe', ['/pid', String(server.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
  else server.kill('SIGTERM')
}

function decodeRgbPng(file) {
  const zlib = require('node:zlib')
  const bytes = fs.readFileSync(file)
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error(`不是 PNG: ${file}`)
  let offset = 8
  let width = 0
  let height = 0
  let colorType = 0
  const idat = []
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    const data = bytes.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); if (data[8] !== 8 || data[12] !== 0) throw new Error(`仅支持 8-bit non-interlaced PNG: ${file}`); colorType = data[9] }
    if (type === 'IDAT') idat.push(data)
    offset += 12 + length
  }
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0
  if (!channels) throw new Error(`不支持 PNG colorType ${colorType}: ${file}`)
  const packed = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = Buffer.alloc(stride * height)
  const paeth = (a, b, c) => { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
  let source = 0
  for (let y = 0; y < height; y += 1) {
    const filter = packed[source++]
    const row = y * stride
    for (let x = 0; x < stride; x += 1) {
      const raw = packed[source++]
      const left = x >= channels ? pixels[row + x - channels] : 0
      const up = y > 0 ? pixels[row - stride + x] : 0
      const upperLeft = y > 0 && x >= channels ? pixels[row - stride + x - channels] : 0
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : NaN
      if (!Number.isFinite(predictor)) throw new Error(`不支持 PNG filter ${filter}: ${file}`)
      pixels[row + x] = (raw + predictor) & 255
    }
  }
  return { width, height, channels, pixels }
}

function comparePngStrict(expectedFile, actualFile) {
  const expected = decodeRgbPng(expectedFile)
  const actual = decodeRgbPng(actualFile)
  if (expected.width !== actual.width || expected.height !== actual.height) return { sameSize: false, changedPixels: expected.width * expected.height, diffPercentage: 100 }
  let changedPixels = 0
  for (let pixel = 0; pixel < expected.width * expected.height; pixel += 1) {
    let changed = false
    for (let channel = 0; channel < 3; channel += 1) {
      if (expected.pixels[pixel * expected.channels + channel] !== actual.pixels[pixel * actual.channels + channel]) { changed = true; break }
    }
    if (changed) changedPixels += 1
  }
  return { sameSize: true, changedPixels, diffPercentage: changedPixels * 100 / (expected.width * expected.height) }
}

async function installDeterministicClock(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const fixedEpoch = 1790467200000
    Date.now = () => fixedEpoch
    try { Object.defineProperty(performance, 'now', { configurable: true, value: () => 1000 }) } catch {}
  })
}

async function applySetup(page, setup) {
  if (!setup) return
  if (setup.startsWith('chord:')) {
    await page.locator('.review-dock__trigger').click()
    await page.locator('.developer-chord select').first().selectOption(setup.slice('chord:'.length))
    await page.getByRole('button', { name: '关闭状态列表' }).click()
    return
  }
  if (setup === 'sight-pause') {
    await page.locator('.review-dock__trigger').click()
    await page.getByRole('button', { name: /识谱.*进行中/ }).click()
    const pause = page.getByRole('button', { name: '暂停' })
    if (await pause.isEnabled()) await pause.click()
    return
  }
  if (setup === 'chord-pause') {
    await page.locator('.review-dock__trigger').click()
    const developmentMidi = page.getByRole('button', { name: '开发模拟 MIDI' })
    if (await developmentMidi.count()) await developmentMidi.click()
    await page.getByRole('button', { name: '关闭状态列表' }).click()
    const resume = page.getByRole('button', { name: '继续' })
    if (await resume.count() && await resume.isEnabled()) { await resume.click(); await page.waitForTimeout(80) }
    const pause = page.getByRole('button', { name: '暂停' })
    if (await pause.count() && await pause.isEnabled()) await pause.click()
    return
  }
  const selects = page.locator('select.setting-select')
  if (setup === 'chord-query-complex') { await selects.nth(0).selectOption('B'); await selects.nth(1).selectOption('1'); await selects.nth(2).selectOption('major13'); return }
  if (setup.startsWith('scale:')) { await selects.nth(0).selectOption(setup.slice('scale:'.length)); return }
  if (setup === 'interval-descending') { await selects.nth(0).selectOption('G'); await selects.nth(2).selectOption('5'); await selects.nth(3).selectOption('C'); await selects.nth(5).selectOption('4'); return }
  if (setup === 'interval-enharmonic') { await selects.nth(0).selectOption('C'); await selects.nth(1).selectOption('1'); await selects.nth(2).selectOption('4'); await selects.nth(3).selectOption('D'); await selects.nth(4).selectOption('-1'); await selects.nth(5).selectOption('4'); return }
  if (setup === 'interval-compound') { await selects.nth(0).selectOption('C'); await selects.nth(2).selectOption('4'); await selects.nth(3).selectOption('G'); await selects.nth(5).selectOption('5') }
}

async function waitForServer(url, processHandle) {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) throw new Error(`UI_RUNTIME_ERROR: Vite exited ${processHandle.exitCode}`)
    try { const response = await fetch(url); if (response.ok) return } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('UI_RUNTIME_ERROR: Vite server timeout')
}

async function capture(page, baseUrl, theme, testCase, viewport, outputFile) {
  const errors = []
  page.removeAllListeners('console')
  page.removeAllListeners('pageerror')
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize(viewport)
  await page.goto(`${baseUrl}/?theme=${encodeURIComponent(theme)}&case=${encodeURIComponent(testCase.caseId)}#${testCase.screen}`, { waitUntil: 'networkidle' })
  await applySetup(page, testCase.setup)
  if (testCase.setup) await page.waitForTimeout(120)
  await page.evaluate(async () => { await Promise.all([...document.images].map((image) => image.complete ? undefined : new Promise((resolve) => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }) }))) })
  const audit = await page.evaluate(() => {
    const root = document.documentElement
    const body = document.body
    const brokenImages = [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.src)
    const selectors = ['.product-header', '.product-content', '.bottom-navigation', '.focus-header', '.focus-stage', '.focus-footer', '.tool-detail-shell']
    const geometry = Object.fromEntries(selectors.map((selector) => {
      const element = document.querySelector(selector)
      if (!element) return [selector, null]
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return [selector, { x: Math.round(rect.x * 10) / 10, y: Math.round(rect.y * 10) / 10, width: Math.round(rect.width * 10) / 10, height: Math.round(rect.height * 10) / 10, display: style.display, background: style.backgroundColor, color: style.color }]
    }))
    return {
      scrollWidth: Math.max(root.scrollWidth, body.scrollWidth), clientWidth: root.clientWidth,
      scrollHeight: Math.max(root.scrollHeight, body.scrollHeight), clientHeight: root.clientHeight,
      brokenImages, geometry,
      themeSource: root.dataset.themeSource ?? null,
      themeId: root.dataset.theme ?? null,
      recipes: Object.fromEntries(Object.entries(root.dataset).filter(([key]) => key.startsWith('themeRecipe'))),
      assetUrls: [...document.images].map((image) => image.currentSrc || image.src).filter(Boolean).sort(),
      productFacts: ([...document.querySelectorAll('.product-content, .focus-content, .chord-focus-content')].map((element) => element.textContent || '').join(' ')).replace(/\s+/g, ' ').trim()
    }
  })
  if (audit.scrollWidth > audit.clientWidth) throw new Error(`UI_OVERFLOW: horizontal ${audit.scrollWidth}/${audit.clientWidth}`)
  if (audit.scrollHeight > audit.clientHeight) throw new Error(`UI_OVERFLOW: vertical ${audit.scrollHeight}/${audit.clientHeight}`)
  if (audit.brokenImages.length) throw new Error(`MISSING_ASSET: ${audit.brokenImages.join(', ')}`)
  if (errors.length) throw new Error(`UI_RUNTIME_ERROR: ${errors.join(' | ')}`)
  const screenshot = await page.screenshot({ path: outputFile, animations: 'disabled' })
  return { ...audit, screenshotSha256: crypto.createHash('sha256').update(screenshot).digest('hex') }
}

async function hashAssetUrls(assetUrls) {
  const entries = []
  for (const url of assetUrls) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`MISSING_ASSET: ${response.status} ${url}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    entries.push({ url, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
  }
  return entries
}

async function captureGoldBaseline(outputDir) {
  const port = 4188
  const baseUrl = `http://127.0.0.1:${port}`
  const server = process.platform === 'win32'
    ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm.cmd run prototype:android -- --port ${port} --strictPort`], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    : spawn('npm', ['run', 'prototype:android', '--', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  let serverLog = ''
  server.stdout.on('data', (chunk) => { serverLog += chunk })
  server.stderr.on('data', (chunk) => { serverLog += chunk })
  try {
    await waitForServer(baseUrl, server)
    fs.mkdirSync(outputDir, { recursive: true })
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await installDeterministicClock(page)
    const records = []
    for (const viewport of VIEWPORTS) {
      for (const testCase of CASES.filter((item) => GOLD_CASE_IDS.has(item.caseId))) {
        const stem = `${testCase.caseId}-${viewport.width}x${viewport.height}`
        const screenshotPath = path.join(outputDir, `${stem}.png`)
        const audit = await capture(page, baseUrl, 'bocchi-dev', testCase, viewport, screenshotPath)
        records.push({ caseId: testCase.caseId, route: testCase.screen, activeState: testCase.setup ?? 'neutral', viewport, ...audit, assetSlots: await hashAssetUrls(audit.assetUrls) })
      }
    }
    await browser.close()
    fs.writeFileSync(path.join(outputDir, 'baseline-metadata.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), records }, null, 2)}\n`)
    return { status: 'PASS', screenshots: records.length, outputDir }
  } catch (error) {
    error.serverLog = serverLog
    throw error
  } finally {
    stopServer(server)
  }
}

async function runThemeUiHarness() {
  const port = 4187
  const baseUrl = `http://127.0.0.1:${port}`
  const server = process.platform === 'win32'
    ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm.cmd run prototype:android -- --port ${port} --strictPort`], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    : spawn('npm', ['run', 'prototype:android', '--', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  let serverLog = ''
  server.stdout.on('data', (chunk) => { serverLog += chunk })
  server.stderr.on('data', (chunk) => { serverLog += chunk })
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pft-theme-ui-'))
  try {
    await waitForServer(baseUrl, server)
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await installDeterministicClock(page)
    const comparisons = []
    const selectedCases = process.env.PFT_THEME_UI_CASE ? CASES.filter((item) => item.caseId === process.env.PFT_THEME_UI_CASE) : CASES
    for (const viewport of VIEWPORTS) {
      for (const testCase of selectedCases) {
        const { caseId } = testCase
        const builtIn = await capture(page, baseUrl, 'bocchi-dev', testCase, viewport, path.join(temp, `${caseId}-${viewport.width}-builtin.png`))
        const external = await capture(page, baseUrl, 'natural516.bocchi', testCase, viewport, path.join(temp, `${caseId}-${viewport.width}-external.png`))
        const sameGeometry = JSON.stringify(builtIn.geometry) === JSON.stringify(external.geometry)
        const sameFacts = DYNAMIC_FACT_CASES.has(caseId) || builtIn.productFacts === external.productFacts
        if (!sameGeometry || !sameFacts) throw new Error(`VISUAL_EQUIVALENCE_FAILED: ${caseId}@${viewport.width} geometry=${sameGeometry} facts=${sameFacts} builtIn=${builtIn.productFacts.slice(0, 500)} external=${external.productFacts.slice(0, 500)}`)
        comparisons.push({ caseId, viewport, sameGeometry, sameFacts, pixelExact: builtIn.screenshotSha256 === external.screenshotSha256 })
      }
    }
    await browser.close()
    return { status: 'PASS', viewports: VIEWPORTS, pages: selectedCases.length, comparisons }
  } catch (error) {
    error.serverLog = serverLog
    throw error
  } finally {
    stopServer(server)
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

async function compareExternalToGold(baselineDir, outputDir) {
  const metadata = JSON.parse(fs.readFileSync(path.join(baselineDir, 'baseline-metadata.json'), 'utf8'))
  const byKey = new Map(metadata.records.map((record) => [`${record.caseId}-${record.viewport.width}x${record.viewport.height}`, record]))
  const port = 4189
  const baseUrl = `http://127.0.0.1:${port}`
  const server = process.platform === 'win32'
    ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm.cmd run prototype:android -- --port ${port} --strictPort`], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    : spawn('npm', ['run', 'prototype:android', '--', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  let serverLog = ''
  server.stdout.on('data', (chunk) => { serverLog += chunk })
  server.stderr.on('data', (chunk) => { serverLog += chunk })
  try {
    await waitForServer(baseUrl, server)
    fs.mkdirSync(outputDir, { recursive: true })
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await installDeterministicClock(page)
    const comparisons = []
    for (const viewport of VIEWPORTS) {
      for (const testCase of CASES.filter((item) => GOLD_CASE_IDS.has(item.caseId))) {
        const stem = `${testCase.caseId}-${viewport.width}x${viewport.height}`
        const expected = byKey.get(stem)
        if (!expected) throw new Error(`缺少金基线元数据: ${stem}`)
        const actualFile = path.join(outputDir, `${stem}.png`)
        const actual = await capture(page, baseUrl, 'natural516.bocchi', testCase, viewport, actualFile)
        const geometryEqual = JSON.stringify(expected.geometry) === JSON.stringify(actual.geometry)
        const factsEqual = expected.productFacts === actual.productFacts
        const diff = comparePngStrict(path.join(baselineDir, `${stem}.png`), actualFile)
        const expectedSettingsManagementDelta = testCase.caseId === 'settings' && geometryEqual && diff.diffPercentage <= 2
        const expectedActiveFrameNoise = (testCase.caseId === 'sight-normal' || testCase.caseId === 'chord-normal') && geometryEqual && diff.diffPercentage <= 0.1
        const expectedPerceptualNoise = geometryEqual && factsEqual && diff.diffPercentage <= 0.01
        if (!geometryEqual || (!factsEqual && !expectedSettingsManagementDelta && !expectedActiveFrameNoise) || (diff.diffPercentage > 0 && !expectedSettingsManagementDelta && !expectedActiveFrameNoise && !expectedPerceptualNoise)) throw new Error(`GOLD_BASELINE_DIFF: ${stem} geometry=${geometryEqual} facts=${factsEqual} diff=${diff.diffPercentage}`)
        if (actual.themeSource !== 'external') throw new Error(`THEME_SOURCE_NOT_EXTERNAL: ${stem} source=${actual.themeSource}`)
        comparisons.push({ caseId: testCase.caseId, viewport, geometryEqual, factsEqual, expectedSettingsManagementDelta, expectedActiveFrameNoise, expectedPerceptualNoise, ...diff, themeSource: actual.themeSource, assetSlots: await hashAssetUrls(actual.assetUrls) })
      }
    }
    await browser.close()
    fs.writeFileSync(path.join(outputDir, 'external-gold-comparison.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), comparisons }, null, 2)}\n`)
    return { status: 'PASS', comparisons: comparisons.length, maxDiffPercentage: Math.max(...comparisons.map((item) => item.diffPercentage)), outputDir }
  } catch (error) {
    error.serverLog = serverLog
    throw error
  } finally {
    stopServer(server)
  }
}

async function captureThemeMatrix(theme, outputDir, caseFilter = () => true) {
  const port = 4191
  const baseUrl = `http://127.0.0.1:${port}`
  const server = process.platform === 'win32'
    ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm.cmd run prototype:android -- --port ${port} --strictPort`], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    : spawn('npm', ['run', 'prototype:android', '--', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  let serverLog = ''
  server.stdout.on('data', (chunk) => { serverLog += chunk })
  server.stderr.on('data', (chunk) => { serverLog += chunk })
  try {
    await waitForServer(baseUrl, server)
    fs.mkdirSync(outputDir, { recursive: true })
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await installDeterministicClock(page)
    const records = []
    const selectedCases = CASES.filter(caseFilter)
    for (const viewport of VIEWPORTS) {
      for (const testCase of selectedCases) {
        const stem = `${testCase.caseId}-${viewport.width}x${viewport.height}`
        const audit = await capture(page, baseUrl, theme, testCase, viewport, path.join(outputDir, `${stem}.png`))
        if ((theme === 'light' || theme === 'dark') && audit.assetUrls.some((url) => url.includes('/__theme_source__/'))) throw new Error(`STANDARD_THEME_ASSET_LEAK: ${stem}`)
        records.push({ caseId: testCase.caseId, viewport, ...audit })
      }
    }
    await browser.close()
    fs.writeFileSync(path.join(outputDir, 'matrix-metadata.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), theme, records }, null, 2)}\n`)
    return { status: 'PASS', theme, screenshots: records.length, outputDir }
  } catch (error) {
    error.serverLog = serverLog
    throw error
  } finally {
    stopServer(server)
  }
}

module.exports = { CASES, VIEWPORTS, runThemeUiHarness, captureGoldBaseline, compareExternalToGold, captureThemeMatrix }
