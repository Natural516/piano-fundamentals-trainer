const { app, BrowserWindow, ipcMain } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')

const root = path.resolve(__dirname, '..')
const rendererPath = path.join(root, 'out', 'renderer', 'index.html')
const preloadPath = path.join(root, 'out', 'preload', 'index.js')
const helperPath = path.join(root, 'native-audio-poc', 'build', 'Release', 'piano_native_audio_poc.exe')
const samplePath = path.join(root, 'native-audio-poc', 'build', 'Release', 'C4-48k-f32.pcm')
const pipePath = `\\\\.\\pipe\\piano-native-audio-poc-auto-${process.pid}`
const intervalMs = Math.max(2, Number.parseInt(process.env.PIANO_NATIVE_POC_EVENT_INTERVAL_MS ?? '5', 10))
const durationSeconds = Math.max(0, Number.parseInt(process.env.PIANO_NATIVE_POC_DURATION_SECONDS ?? '0', 10))
const configuredSamples = Math.max(1000, Number.parseInt(process.env.PIANO_NATIVE_POC_SAMPLE_COUNT ?? '1000', 10))
const sampleCount = durationSeconds > 0
  ? Math.max(configuredSamples, Math.ceil(durationSeconds * 1000 / intervalMs))
  : configuredSamples

process.env.PIANO_NATIVE_AUDIO_POC = '1'
process.env.PIANO_NATIVE_AUDIO_POC_PIPE = pipePath
app.commandLine.appendSwitch('enable-features', 'WebMIDI')
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'piano-native-audio-poc-')))

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitFor(predicate, label, timeoutMs = 30_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const result = predicate()
    if (result) return result
    await delay(25)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function waitForRenderer(webContents, predicate, label, timeoutMs = 30_000) {
  return waitFor(
    async () => webContents.executeJavaScript(`Boolean(${predicate})`, true),
    label,
    timeoutMs
  )
}

function parseTaggedJson(line, tag) {
  const index = line.indexOf(tag)
  if (index < 0) return null
  return JSON.parse(line.slice(index + tag.length).trim())
}

if (!fs.existsSync(rendererPath) || !fs.existsSync(preloadPath)) {
  throw new Error('Electron output is missing; run npm run build before the native audio POC harness')
}
if (!fs.existsSync(helperPath) || !fs.existsSync(samplePath)) {
  throw new Error('Native POC output is missing; run npm run poc:native-audio:build first')
}

let helperCrashes = 0
let stopping = false
let deviceReport = null
const metricReports = []
let stdoutBuffer = ''

const helper = spawn(helperPath, ['--pipe', pipePath, '--sample', samplePath], {
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe']
})

helper.stdout.on('data', (chunk) => {
  stdoutBuffer += chunk.toString('utf8')
  const lines = stdoutBuffer.split(/\r?\n/)
  stdoutBuffer = lines.pop() ?? ''
  for (const line of lines) {
    if (!line) continue
    process.stderr.write(`${line}\n`)
    if (line.includes('[native-audio-poc] DEVICE ')) {
      deviceReport = parseTaggedJson(line, '[native-audio-poc] DEVICE ')
    }
    if (line.includes('[native-audio-poc] METRICS ')) {
      metricReports.push(parseTaggedJson(line, '[native-audio-poc] METRICS '))
    }
  }
})
helper.stderr.on('data', (chunk) => process.stderr.write(chunk))
helper.on('exit', (code, signal) => {
  if (!stopping) {
    helperCrashes += 1
    process.stderr.write(`[native-audio-poc] helper exited unexpectedly: code=${code} signal=${signal}\n`)
  }
})

ipcMain.handle('piano:inflate-raw', (_event, input) => Uint8Array.from(zlib.inflateRawSync(input)))
ipcMain.handle('piano:secret:get-ai-api-key', () => ({ success: true, value: '', configured: false }))
ipcMain.handle('piano:secret:set-ai-api-key', () => ({ success: false, reason: 'write_failed', error: 'POC' }))
ipcMain.handle('piano:secret:delete-ai-api-key', () => ({ success: true }))
ipcMain.handle('piano:secret:has-ai-api-key', () => ({ success: true, configured: false }))
ipcMain.handle('piano:samples:read', () => ({ success: false, error: 'Production WebAudio is disabled in this POC harness' }))

app.whenReady().then(async () => {
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
    await waitFor(() => deviceReport, 'FiiO K11 device report')
    await window.loadFile(rendererPath, { hash: '/midi-test' })
    window.webContents.debugger.attach('1.3')
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        const input = { id: 'f3-native-poc-midi', name: 'F3 Native POC MIDI', manufacturer: 'Local QA', state: 'connected', connection: 'open', onmidimessage: null };
        const access = { inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null };
        Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
        window.__nativePocMidiOn = (midiNumber, velocity = 96) => input.onmidimessage?.({ data: new Uint8Array([0x90, midiNumber, velocity]) });
        localStorage.setItem('piano-trainer.first-run.v1', 'completed');
        localStorage.setItem('piano-audio-mode.v1', 'off');
      })();`
    })

    await window.webContents.executeJavaScript(`(() => {
      localStorage.setItem('piano-trainer.first-run.v1', 'completed');
      localStorage.setItem('piano-audio-mode.v1', 'off');
    })()`, true)
    await new Promise((resolve) => {
      window.webContents.once('did-finish-load', resolve)
      window.webContents.reload()
    })
    await window.webContents.executeJavaScript(`(() => {
      if (typeof window.__nativePocMidiOn === 'function') return;
      const input = { id: 'f3-native-poc-midi', name: 'F3 Native POC MIDI', manufacturer: 'Local QA', state: 'connected', connection: 'open', onmidimessage: null };
      const access = { inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null };
      Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
      window.__nativePocMidiOn = (midiNumber, velocity = 96) => input.onmidimessage?.({ data: new Uint8Array([0x90, midiNumber, velocity]) });
    })()`, true)

    await waitForRenderer(
      window.webContents,
      `window.pianoApp?.nativeAudioPoc?.status?.().connected === true`,
      'persistent named-pipe bridge'
    )
    await window.webContents.executeJavaScript(`(() => {
      const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent.trim() === '刷新设备');
      button?.click();
    })()`, true)
    await waitForRenderer(
      window.webContents,
      `document.querySelector('#midi-input-select option[value="f3-native-poc-midi"]') !== null`,
      'virtual MIDI device'
    )
    await window.webContents.executeJavaScript(`(() => {
      const select = document.querySelector('#midi-input-select');
      select.value = 'f3-native-poc-midi';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`, true)
    await delay(100)

    const startedAt = Date.now()
    await window.webContents.executeJavaScript(`new Promise((resolve) => {
      let index = 0;
      const send = () => {
        if (index >= ${sampleCount}) { resolve(); return; }
        window.__nativePocMidiOn(48 + (index % 36), 48 + (index % 72));
        index += 1;
        setTimeout(send, ${intervalMs});
      };
      send();
    })`, true)

    await waitForRenderer(
      window.webContents,
      `window.pianoApp.nativeAudioPoc.status().sentEvents >= ${sampleCount}`,
      `${sampleCount} pipe writes`,
      Math.max(30_000, durationSeconds * 1000 + 30_000)
    )
    await window.webContents.executeJavaScript(`window.pianoApp.nativeAudioPoc.requestReport()`, true)
    const metrics = await waitFor(
      () => [...metricReports].reverse().find((report) => report.events >= sampleCount),
      `${sampleCount} audio callback metrics`,
      30_000
    )
    const bridgeStatus = JSON.parse(await window.webContents.executeJavaScript(
      `JSON.stringify(window.pianoApp.nativeAudioPoc.status())`,
      true
    ))

    process.stdout.write(`${JSON.stringify({
      device: deviceReport,
      latency: metrics,
      bridge: bridgeStatus,
      requestedEvents: sampleCount,
      eventIntervalMs: intervalMs,
      elapsedMs: Date.now() - startedAt,
      helperCrashes
    })}\n`)
  } finally {
    stopping = true
    if (window.webContents.debugger.isAttached()) window.webContents.debugger.detach()
    window.destroy()
    helper.kill()
    app.exit(0)
  }
}).catch((error) => {
  stopping = true
  helper.kill()
  console.error(error)
  app.exit(1)
})
