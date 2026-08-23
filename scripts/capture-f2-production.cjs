const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const outputRoot = path.join(root, 'artifacts', 'f2-production-screenshots')
const rendererPath = path.join(root, 'out', 'renderer', 'index.html')
const preloadPath = path.join(root, 'out', 'preload', 'index.js')
const userDataPath = path.join(root, 'artifacts', 'f2-qa-user-data')
const logPath = path.join(root, 'artifacts', 'f2-capture.log')
const pianoSampleRoot = path.join(root, 'resources', 'piano-samples')
const sizes = [
  { width: 1366, height: 768, label: '1366x768' },
  { width: 1536, height: 864, label: '1536x864' }
]

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const log = (message) => {
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`)
}

async function waitFor(webContents, predicate, label, timeoutMs = 8000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const matched = await webContents.executeJavaScript(`Boolean(${predicate})`, true)
    if (matched) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function captureAtSizes(window, name) {
  for (const size of sizes) {
    // Hidden Electron windows can retain the previous frame when the first target
    // size already matches. A one-pixel nudge guarantees a fresh production frame.
    window.setContentSize(size.width + 1, size.height)
    await delay(40)
    window.setContentSize(size.width, size.height)
    await delay(220)
    await window.webContents.executeJavaScript('window.scrollTo(0, 0)', true)
    const image = await window.webContents.capturePage()
    const directory = path.join(outputRoot, size.label)
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(path.join(directory, `${name}.png`), image.toPNG())
  }
}

async function assertFocusLayout(window, label) {
  const serialized = await window.webContents.executeJavaScript(`JSON.stringify((() => {
    const page = document.querySelector('.practice-workspace-page');
    const workspace = document.querySelector('.workspace');
    const root = document.documentElement;
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      rootClientWidth: root.clientWidth,
      rootScrollWidth: root.scrollWidth,
      pageClientHeight: page?.clientHeight ?? null,
      pageScrollHeight: page?.scrollHeight ?? null,
      workspaceClientHeight: workspace?.clientHeight ?? null,
      workspaceScrollHeight: workspace?.scrollHeight ?? null
    };
  })())`, true)
  const metrics = JSON.parse(serialized)
  if (
    metrics.rootScrollWidth > metrics.rootClientWidth + 1
    || metrics.pageScrollHeight > metrics.pageClientHeight + 1
    || metrics.workspaceScrollHeight > metrics.workspaceClientHeight + 1
  ) {
    throw new Error(`${label} focus layout overflowed: ${serialized}`)
  }
  log(`${label} focus layout passed: ${serialized}`)
}

async function assertFocusAt125Percent(window, label) {
  window.setContentSize(1536, 864)
  window.webContents.setZoomFactor(1.25)
  await delay(320)
  await assertFocusLayout(window, `${label} / Windows 125%`)
  window.webContents.setZoomFactor(1)
  await delay(180)
}

async function navigate(window, hash, readyText) {
  await window.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`, true)
  await waitFor(
    window.webContents,
    `document.body && document.body.innerText.includes(${JSON.stringify(readyText)})`,
    `${hash} / ${readyText}`
  )
  await delay(280)
}

async function clickButton(window, exactText) {
  const clicked = await window.webContents.executeJavaScript(`(() => {
    const target = ${JSON.stringify(exactText)};
    const button = [...document.querySelectorAll('button')].find((entry) => (
      entry.textContent.trim() === target
      || [...entry.children].some((child) => child.textContent.trim() === target)
    ) && !entry.hidden)
    if (!button) return false
    button.click()
    return true
  })()`, true)
  if (!clicked) throw new Error(`Button not found: ${exactText}`)
}

app.setPath('userData', userDataPath)
app.commandLine.appendSwitch('enable-features', 'WebMIDI')
fs.mkdirSync(path.dirname(logPath), { recursive: true })
fs.writeFileSync(logPath, '')
ipcMain.handle('piano:secret:get-ai-api-key', () => ({ success: true, value: '', configured: false }))
ipcMain.handle('piano:secret:set-ai-api-key', () => ({ success: false, reason: 'write_failed', error: 'QA capture is read-only' }))
ipcMain.handle('piano:secret:delete-ai-api-key', () => ({ success: true }))
ipcMain.handle('piano:secret:has-ai-api-key', () => ({ success: true, configured: false }))
ipcMain.handle('piano:samples:read', (_event, requestedPath) => {
  if (typeof requestedPath !== 'string' || requestedPath.length === 0 || path.isAbsolute(requestedPath)) {
    return { success: false, error: '无效的内置钢琴采样路径' }
  }
  const segments = requestedPath.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\\'))) {
    return { success: false, error: '无效的内置钢琴采样路径' }
  }
  const candidate = path.resolve(pianoSampleRoot, ...segments)
  const relativePath = path.relative(pianoSampleRoot, candidate)
  if (!relativePath || relativePath.startsWith(`..${path.sep}`) || relativePath === '..' || path.isAbsolute(relativePath)) {
    return { success: false, error: '无效的内置钢琴采样路径' }
  }
  try {
    return { success: true, bytes: Uint8Array.from(fs.readFileSync(candidate)) }
  } catch {
    return { success: false, error: `缺少内置钢琴采样：${requestedPath}` }
  }
})
log('script loaded')

app.whenReady().then(async () => {
  log('app ready')
  const window = new BrowserWindow({
    width: 1366,
    height: 768,
    useContentSize: true,
    show: false,
    backgroundColor: '#f3efe8',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  try {
    log('loading initial renderer')
    await window.loadFile(rendererPath, { hash: '/home' })
    log('initial renderer loaded')
    window.webContents.debugger.attach('1.3')
    log('debugger attached')
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const input = { id: 'f2-qa-midi', name: 'F2 QA MIDI', manufacturer: 'Local QA', state: 'connected', connection: 'open', onmidimessage: null };
      const access = { inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null };
      Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
      window.__f2QaMidi = (midiNumber, velocity = 100) => input.onmidimessage?.({ data: new Uint8Array([0x90, midiNumber, velocity]) });
      try {
        localStorage.setItem('piano-trainer.first-run.v1', 'completed');
        localStorage.setItem('piano-trainer.theme-mode.v1', 'light');
      } catch {}
    })();`
    })
    await window.webContents.executeJavaScript(`localStorage.setItem('piano-trainer.first-run.v1', 'completed'); localStorage.setItem('piano-trainer.theme-mode.v1', 'light')`, true)
    await new Promise((resolve) => {
      window.webContents.once('did-finish-load', resolve)
      window.webContents.reload()
    })
    log('renderer reloaded with QA MIDI')
    await window.webContents.executeJavaScript(`(() => {
      const input = { id: 'f2-qa-midi', name: 'F2 QA MIDI', manufacturer: 'Local QA', state: 'connected', connection: 'open', onmidimessage: null };
      const access = { inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null };
      Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
      window.__f2QaMidi = (midiNumber, velocity = 100) => input.onmidimessage?.({ data: new Uint8Array([0x90, midiNumber, velocity]) });
    })()`, true)
    log(`qa bridge: ${await window.webContents.executeJavaScript(`JSON.stringify({ midi: typeof navigator.requestMIDIAccess, bridge: typeof window.__f2QaMidi })`, true)}`)
    await waitFor(window.webContents, `document.body && document.body.innerText.includes('准备好开始练琴了吗？')`, 'home')
    await delay(800)

    await navigate(window, '#/midi-test', 'MIDI 输入设备')
    await clickButton(window, '刷新设备')
    await waitFor(window.webContents, `document.querySelector('#midi-input-select option[value="f2-qa-midi"]') !== null`, 'virtual MIDI')
    await window.webContents.executeJavaScript(`(() => {
      const select = document.querySelector('#midi-input-select');
      select.value = 'f2-qa-midi';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`, true)
    await delay(220)

    await clickButton(window, '首页')
    await waitFor(window.webContents, `document.body && document.body.innerText.includes('准备好开始练琴了吗？')`, 'home after MIDI setup')
    await delay(280)
    log('capture home')
    await captureAtSizes(window, 'home')

    await navigate(window, '#/training-plan', '今日训练')
    log('capture today')
    await captureAtSizes(window, 'today-plan')

    await navigate(window, '#/sight-reading', '识谱练习')
    await clickButton(window, '开始练习')
    await waitFor(window.webContents, `document.body.innerText.includes('当前题目') && document.body.innerText.includes('停止练习')`, 'sight-reading focus')
    log('capture sight-reading focus')
    await captureAtSizes(window, 'basic-sight-focus')
    await assertFocusLayout(window, 'sight-reading / 1536x864')
    await assertFocusAt125Percent(window, 'sight-reading')
    await clickButton(window, '停止练习')
    await waitFor(window.webContents, `document.body.innerText.includes('开始练习')`, 'sight-reading stopped')

    await navigate(window, '#/score-practice', '开始练习')
    log('capture score before')
    await captureAtSizes(window, 'score-before')

    await clickButton(window, '开始练习')
    log('score started')
    await waitFor(window.webContents, `document.body.innerText.includes('当前目标') && document.body.innerText.includes('停止')`, 'score focus')
    await captureAtSizes(window, 'score-focus')
    await assertFocusLayout(window, 'score / 1536x864')
    await assertFocusAt125Percent(window, 'score')
    log('captured score focus')

    for (const note of [60, 62, 64, 60, 67, 72]) {
      await window.webContents.executeJavaScript(`window.__f2QaMidi(${note})`, true)
      await delay(90)
    }
    await waitFor(window.webContents, `document.body.innerText.includes('这一轮练完了')`, 'score result without errors')
    log('capture score result without errors')
    await captureAtSizes(window, 'score-result-no-error')

    await clickButton(window, '再练一轮')
    await waitFor(window.webContents, `document.body.innerText.includes('开始练习')`, 'score retry ready')
    await clickButton(window, '开始练习')
    await waitFor(window.webContents, `document.body.innerText.includes('当前目标') && document.body.innerText.includes('停止')`, 'score retry focus')
    await window.webContents.executeJavaScript(`window.__f2QaMidi(61)`, true)
    await delay(120)
    for (const note of [60, 62, 64, 60, 67, 72]) {
      await window.webContents.executeJavaScript(`window.__f2QaMidi(${note})`, true)
      await delay(90)
    }
    await waitFor(window.webContents, `document.body.innerText.includes('这一轮练完了')`, 'score result with errors')
    log('capture score result with errors')
    await captureAtSizes(window, 'score-result-with-error')

    await navigate(window, '#/analytics', '近期进步')
    log('capture analytics')
    await captureAtSizes(window, 'analytics')

    await navigate(window, '#/settings', '外观主题')
    await waitFor(
      window.webContents,
      `document.querySelector('.settings-audio__status')?.textContent.includes('内置钢琴已就绪')`,
      'Salamander samples decoded and ready',
      15000
    )
    log('Salamander samples decoded and ready')
    log('capture settings')
    await captureAtSizes(window, 'settings')

    window.setContentSize(1536, 864)
    window.webContents.setZoomFactor(1.25)
    await delay(280)
    const scaledLayout = await window.webContents.executeJavaScript(`JSON.stringify({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      innerHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight
    })`, true)
    const scaledMetrics = JSON.parse(scaledLayout)
    if (scaledMetrics.scrollWidth > scaledMetrics.innerWidth) {
      throw new Error(`125% scaling introduced horizontal overflow: ${scaledLayout}`)
    }
    log(`125% scaling check passed: ${scaledLayout}`)
    window.webContents.setZoomFactor(1)
  } finally {
    log('closing')
    if (window.webContents.debugger.isAttached()) window.webContents.debugger.detach()
    window.destroy()
    app.exit(0)
  }
}).catch((error) => {
  log(`failed: ${error && error.stack ? error.stack : error}`)
  console.error(error)
  app.exit(1)
})
