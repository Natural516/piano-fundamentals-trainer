const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const rendererPath = path.join(root, 'out', 'renderer', 'index.html')
const preloadPath = path.join(root, 'out', 'preload', 'index.js')
const pianoSampleRoot = path.join(root, 'resources', 'piano-samples')
const userDataPath = path.join(root, 'artifacts', 'f3-latency-user-data')
const sampleCount = Number.parseInt(process.env.PIANO_LATENCY_SAMPLE_COUNT ?? '120', 10)
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const trace = (message) => {
  if (process.env.PIANO_LATENCY_TRACE === '1') process.stderr.write(`[latency-qa] ${message}\n`)
}

async function waitFor(webContents, predicate, label, timeoutMs = 20_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await webContents.executeJavaScript(`Boolean(${predicate})`, true)) return
    await delay(50)
  }
  const pageState = await webContents.executeJavaScript(`JSON.stringify({
    hash: location.hash,
    diagnostics: window.__pianoLatencyDiagnostics?.getSnapshot?.() ?? null,
    text: document.body?.innerText?.slice(0, 800) ?? ''
  })`, true).catch(() => '{}')
  throw new Error(`Timed out waiting for ${label}: ${pageState}`)
}

function resolveSamplePath(requestedPath) {
  if (typeof requestedPath !== 'string' || !requestedPath || path.isAbsolute(requestedPath)) return null
  const segments = requestedPath.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\\'))) return null
  const candidate = path.resolve(pianoSampleRoot, ...segments)
  const relativePath = path.relative(pianoSampleRoot, candidate)
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    return null
  }
  return candidate
}

app.setPath('userData', userDataPath)
app.commandLine.appendSwitch('enable-features', 'WebMIDI')

ipcMain.handle('piano:secret:get-ai-api-key', () => ({ success: true, value: '', configured: false }))
ipcMain.handle('piano:secret:set-ai-api-key', () => ({ success: false, reason: 'write_failed', error: 'Latency QA' }))
ipcMain.handle('piano:secret:delete-ai-api-key', () => ({ success: true }))
ipcMain.handle('piano:secret:has-ai-api-key', () => ({ success: true, configured: false }))
ipcMain.handle('piano:samples:read', (_event, requestedPath) => {
  const candidate = resolveSamplePath(requestedPath)
  if (!candidate) return { success: false, error: '无效的内置钢琴采样路径' }
  try {
    return { success: true, bytes: Uint8Array.from(fs.readFileSync(candidate)) }
  } catch {
    return { success: false, error: `缺少内置钢琴采样：${requestedPath}` }
  }
})

app.whenReady().then(async () => {
  trace('app ready')
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  try {
    trace('loading initial renderer')
    await window.loadFile(rendererPath, { hash: '/midi-test' })
    trace('attaching debugger')
    window.webContents.debugger.attach('1.3')
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        const input = { id: 'f3-latency-midi', name: 'F3 Latency MIDI', manufacturer: 'Local QA', state: 'connected', connection: 'open', onmidimessage: null };
        const access = { inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null };
        Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
        window.__latencyQaMidiOn = (midiNumber, velocity = 100) => input.onmidimessage?.({ data: new Uint8Array([0x90, midiNumber, velocity]) });
        window.__latencyQaMidiOff = (midiNumber) => input.onmidimessage?.({ data: new Uint8Array([0x80, midiNumber, 0]) });
        localStorage.setItem('piano-trainer.first-run.v1', 'completed');
        localStorage.setItem('piano-audio-mode.v1', 'builtin');
        localStorage.setItem('piano-trainer.latency-diagnostics.v1', 'enabled');
      })();`
    })
    await window.webContents.executeJavaScript(`(() => {
      localStorage.setItem('piano-trainer.first-run.v1', 'completed');
      localStorage.setItem('piano-audio-mode.v1', 'builtin');
      localStorage.setItem('piano-trainer.latency-diagnostics.v1', 'enabled');
    })()`, true)

    trace('reloading renderer with diagnostic bridge')
    await new Promise((resolve) => {
      window.webContents.once('did-finish-load', resolve)
      window.webContents.reload()
    })
    trace('renderer reloaded')
    await window.webContents.executeJavaScript(`(() => {
      if (typeof window.__latencyQaMidiOn === 'function') return;
      const input = { id: 'f3-latency-midi', name: 'F3 Latency MIDI', manufacturer: 'Local QA', state: 'connected', connection: 'open', onmidimessage: null };
      const access = { inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null };
      Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
      window.__latencyQaMidiOn = (midiNumber, velocity = 100) => input.onmidimessage?.({ data: new Uint8Array([0x90, midiNumber, velocity]) });
      window.__latencyQaMidiOff = (midiNumber) => input.onmidimessage?.({ data: new Uint8Array([0x80, midiNumber, 0]) });
    })()`, true)
    await window.webContents.executeJavaScript(`(() => {
      const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent.trim() === '刷新设备');
      button?.click();
    })()`, true)
    await waitFor(window.webContents, `document.querySelector('#midi-input-select option[value="f3-latency-midi"]') !== null`, 'virtual MIDI')
    trace('virtual MIDI ready')
    await window.webContents.executeJavaScript(`(() => {
      const select = document.querySelector('#midi-input-select');
      select.value = 'f3-latency-midi';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      location.hash = '#/settings';
    })()`, true)
    await waitFor(window.webContents, `document.body.innerText.includes('按需要调整')`, 'settings page')
    await window.webContents.executeJavaScript(`(() => {
      const details = [...document.querySelectorAll('details')].find((entry) => entry.textContent.includes('钢琴发声'));
      if (details) details.open = true;
      window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    })()`, true)

    await waitFor(
      window.webContents,
      `window.__pianoLatencyDiagnostics && document.body.innerText.includes('内置钢琴已就绪')`,
      'decoded Salamander buffers and running AudioContext'
    )
    trace('sample pack ready')

    for (let index = 0; index < 12; index += 1) {
      const note = 48 + (index % 24)
      await window.webContents.executeJavaScript(`window.__latencyQaMidiOn(${note}, 96)`, true)
      await window.webContents.executeJavaScript(`window.__latencyQaMidiOff(${note})`, true)
    }
    await window.webContents.executeJavaScript(`window.__pianoLatencyDiagnostics.reset()`, true)
    trace('warmup complete')

    for (let index = 0; index < sampleCount; index += 1) {
      const note = 48 + (index % 36)
      const velocity = 48 + (index % 72)
      await window.webContents.executeJavaScript(`window.__latencyQaMidiOn(${note}, ${velocity})`, true)
      await window.webContents.executeJavaScript(`window.__latencyQaMidiOff(${note})`, true)
    }

    await waitFor(
      window.webContents,
      `window.__pianoLatencyDiagnostics.getSnapshot().summary.count >= ${sampleCount}`,
      `${sampleCount} latency samples`
    )
    trace('measurements complete')
    const serialized = await window.webContents.executeJavaScript(
      `JSON.stringify(window.__pianoLatencyDiagnostics.getSnapshot())`,
      true
    )
    const snapshot = JSON.parse(serialized)
    const output = process.env.PIANO_LATENCY_INCLUDE_SAMPLES === '1'
      ? snapshot
      : { enabled: snapshot.enabled, summary: snapshot.summary }
    process.stdout.write(`${JSON.stringify(output)}\n`)
  } finally {
    trace('closing')
    if (window.webContents.debugger.isAttached()) window.webContents.debugger.detach()
    window.destroy()
    app.exit(0)
  }
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
