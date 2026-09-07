const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      },
      fileName: filename
    }).outputText
    module._compile(output, filename)
  }
}

const {
  AndroidMidiByteStreamParser,
  AndroidMidiInputRouter,
  toSightReadingMidiPayload
} = require('../prototype/android-tablet-v1/src/androidBluetoothMidiCore.ts')
const { AndroidBluetoothMidiAdapter } = require('../prototype/android-tablet-v1/src/androidBluetoothMidi.ts')
const { AndroidSightReadingRuntime } = require('../prototype/android-tablet-v1/src/sightReadingIntegration.ts')

function nativeState(overrides = {}) {
  return {
    supported: true,
    androidApiLevel: 36,
    scanServiceUuid: '03B80E5A-EDE8-4B33-A751-6CE34EC4C700',
    permissionState: 'GRANTED',
    bluetoothState: 'ON',
    connectionState: 'IDLE',
    discoveredDevices: [],
    midiPortState: 'CLOSED',
    receivedChunkCount: 0,
    receivedByteCount: 0,
    disconnectCount: 0,
    reconnectCount: 0,
    ...overrides
  }
}

class FakePlugin {
  constructor(state = nativeState()) {
    this.state = state
    this.listeners = new Map()
  }

  async addListener(name, listener) {
    const listeners = this.listeners.get(name) ?? new Set()
    listeners.add(listener)
    this.listeners.set(name, listeners)
    return { remove: async () => listeners.delete(listener) }
  }

  emit(name, payload) {
    for (const listener of this.listeners.get(name) ?? []) listener(payload)
  }

  setState(changes) {
    this.state = { ...this.state, ...changes }
    this.emit('stateChanged', this.state)
  }

  async getState() { return this.state }
  async requestMidiPermissions() { return this.state }
  async startScan() { this.setState({ connectionState: 'SCANNING' }); return this.state }
  async stopScan() { this.setState({ connectionState: 'IDLE' }); return this.state }
  async connect({ deviceId }) {
    this.setState({ connectionState: 'CONNECTED', connectedDeviceId: deviceId, midiPortState: 'OPEN' })
    return this.state
  }
  async disconnect() { this.setState({ connectionState: 'DISCONNECTED', midiPortState: 'CLOSED' }); return this.state }
  async suspendDelivery() { this.setState({ midiPortState: 'SUSPENDED' }); return this.state }
  async resumeDelivery() { this.setState({ midiPortState: this.state.connectionState === 'CONNECTED' ? 'OPEN' : 'CLOSED' }); return this.state }
}

function fakeTime() {
  let now = 1000
  let sequence = 0
  const jobs = new Map()
  return {
    now: () => now,
    schedule(callback, delayMs) {
      const id = ++sequence
      jobs.set(id, { at: now + Math.max(0, delayMs), callback })
      return id
    },
    cancel: (id) => jobs.delete(id),
    advance(ms) {
      const until = now + ms
      while (true) {
        const next = [...jobs.entries()]
          .filter(([, job]) => job.at <= until)
          .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0]
        if (!next) break
        jobs.delete(next[0])
        now = next[1].at
        next[1].callback()
      }
      now = until
    }
  }
}

function adapterHarness() {
  const events = []
  const clock = { now: () => 1234 }
  const router = new AndroidMidiInputRouter(clock, (event) => events.push(event), 'bluetooth')
  const adapter = new AndroidBluetoothMidiAdapter(null, router, {
    onTransportLost() {},
    onTransportReady() {},
    onChange() {}
  })
  const receive = (bytes, nativeTimestampNanos = 9000000) => adapter.receiveNativeChunk({
    bytes,
    nativeTimestampNanos,
    callbackReceivedNanos: nativeTimestampNanos + 10
  })
  return { adapter, events, receive, router }
}

function runtimeHarness() {
  const time = fakeTime()
  const plugin = new FakePlugin(nativeState({
    connectionState: 'CONNECTED',
    connectedDeviceId: 'fp30x',
    connectedDeviceName: 'Roland Piano',
    midiPortState: 'OPEN'
  }))
  const runtime = new AndroidSightReadingRuntime({
    clock: time,
    scheduler: time,
    random: () => 0.42,
    bluetoothPlugin: plugin,
    initialMidiSource: 'bluetooth'
  })
  return { plugin, runtime, time }
}

const tests = []
const test = (name, callback) => tests.push({ name, callback })

test('A permission mapping is API-level specific and modern scan is never-for-location', () => {
  const manifest = fs.readFileSync(path.resolve(__dirname, '../android/app/src/main/AndroidManifest.xml'), 'utf8')
  const plugin = fs.readFileSync(path.resolve(__dirname, '../android/app/src/main/java/com/pianofundamentals/trainer/AndroidBluetoothMidiPlugin.kt'), 'utf8')
  const policy = fs.readFileSync(path.resolve(__dirname, '../android/app/src/main/java/com/pianofundamentals/trainer/BluetoothMidiStatePolicy.kt'), 'utf8')
  assert.match(manifest, /BLUETOOTH_SCAN/)
  assert.match(manifest, /BLUETOOTH_CONNECT/)
  assert.match(manifest, /usesPermissionFlags="neverForLocation"/)
  assert.match(manifest, /ACCESS_FINE_LOCATION" android:maxSdkVersion="30"/)
  assert.match(policy, /apiLevel >= 31.*nearbyDevices.*legacyLocation/s)
  assert.match(plugin, /BluetoothMidiStatePolicy\.permissionAlias/)
})

test('B adapter exposes explicit connection-state transitions', async () => {
  const plugin = new FakePlugin(nativeState({ connectionState: 'PERMISSION_REQUIRED', permissionState: 'REQUIRED' }))
  const router = new AndroidMidiInputRouter({ now: () => 1 }, () => {}, 'bluetooth')
  let lost = 0
  let ready = 0
  const adapter = new AndroidBluetoothMidiAdapter(plugin, router, {
    onTransportLost: () => { lost += 1 },
    onTransportReady: () => { ready += 1 },
    onChange() {}
  })
  await adapter.start()
  assert.equal(adapter.snapshot.connectionState, 'PERMISSION_REQUIRED')
  plugin.setState({ permissionState: 'GRANTED', connectionState: 'SCANNING' })
  plugin.setState({ connectionState: 'DEVICE_FOUND', discoveredDevices: [{ id: 'x', name: 'Roland', source: 'bleScan' }] })
  plugin.setState({ connectionState: 'CONNECTING' })
  plugin.setState({ connectionState: 'CONNECTED', midiPortState: 'OPEN' })
  plugin.setState({ connectionState: 'DISCONNECTED', midiPortState: 'CLOSED' })
  assert.deepEqual([ready, lost], [1, 1])
  await adapter.dispose()
})

test('C fragmented raw noteOn becomes one normalized NOTE_ON', () => {
  const { events, receive } = adapterHarness()
  receive([0x90, 60])
  assert.equal(events.length, 0)
  receive([100])
  assert.deepEqual(events.map(({ type, midiNumber, velocity }) => ({ type, midiNumber, velocity })), [
    { type: 'noteOn', midiNumber: 60, velocity: 100 }
  ])
})

test('D velocity-zero noteOn normalizes to NOTE_OFF', () => {
  const { events, receive } = adapterHarness()
  receive([0x92, 60, 0])
  assert.equal(events[0].type, 'noteOff')
  assert.equal(events[0].midiNumber, 60)
})

test('E raw noteOff preserves note and release velocity', () => {
  const { events, receive } = adapterHarness()
  receive([0x8f, 61, 45])
  assert.deepEqual([events[0].type, events[0].midiNumber, events[0].velocity], ['noteOff', 61, 45])
})

test('F CC64 down/up is normalized as controlChange and never a note attack', () => {
  const { events, receive } = adapterHarness()
  receive([0xb0, 64, 127, 64, 0])
  assert.deepEqual(events.map(({ type, midiNumber, velocity }) => [type, midiNumber, velocity]), [
    ['controlChange', 64, 127],
    ['controlChange', 64, 0]
  ])
})

test('G event IDs are monotonically increasing across running status and repeats', () => {
  const { events, receive } = adapterHarness()
  receive([0x90, 60, 100, 60, 0, 0x90, 60, 100])
  assert.deepEqual(events.map((event) => event.id), [1, 2, 3])
  assert.deepEqual(events.map((event) => event.type), ['noteOn', 'noteOff', 'noteOn'])
})

test('H same timestamp chord events retain distinct IDs', () => {
  const { events, receive } = adapterHarness()
  receive([0x90, 60, 100, 64, 100, 67, 100])
  assert.deepEqual(events.map((event) => event.timestamp), [1234, 1234, 1234])
  assert.deepEqual(events.map((event) => event.id), [1, 2, 3])
})

test('I disconnect pauses safely and cannot manufacture an outcome', async () => {
  const { plugin, runtime, time } = runtimeHarness()
  await runtime.startMidi()
  runtime.start()
  time.advance(32)
  plugin.setState({ connectionState: 'DISCONNECTED', midiPortState: 'CLOSED', disconnectCount: 1 })
  assert.equal(runtime.snapshot.isPaused, true)
  assert.equal(runtime.midiResumeRequired, true)
  assert.deepEqual([runtime.snapshot.completedQuestions, runtime.snapshot.correctCount, runtime.snapshot.wrongCount], [0, 0, 0])
})

test('J reconnect rejects stale input and requires explicit resume', async () => {
  const { plugin, runtime, time } = runtimeHarness()
  await runtime.startMidi()
  runtime.start(); time.advance(32)
  const target = runtime.snapshot.currentNote.midiNumber
  plugin.setState({ connectionState: 'DISCONNECTED', midiPortState: 'CLOSED' })
  plugin.emit('midiMessage', { bytes: [0x90, target, 100], nativeTimestampNanos: 1, callbackReceivedNanos: 2 })
  plugin.setState({ connectionState: 'CONNECTED', midiPortState: 'OPEN', reconnectCount: 1 })
  plugin.emit('midiMessage', { bytes: [0x90, target, 100], nativeTimestampNanos: 3, callbackReceivedNanos: 4 })
  assert.equal(runtime.snapshot.completedQuestions, 0)
  assert.equal(runtime.snapshot.isPaused, true)
  runtime.resume()
  plugin.emit('midiMessage', { bytes: [0x90, target, 100], nativeTimestampNanos: 5, callbackReceivedNanos: 6 })
  assert.equal(runtime.snapshot.correctCount, 1)
})

test('K development and Bluetooth adapters cannot drive the controller simultaneously', async () => {
  const { plugin, runtime, time } = runtimeHarness()
  await runtime.startMidi()
  runtime.start(); time.advance(32)
  const target = runtime.snapshot.currentNote.midiNumber
  assert.equal(runtime.sendMidi(target), null)
  plugin.emit('midiMessage', { bytes: [0x90, target, 100], nativeTimestampNanos: 1, callbackReceivedNanos: 2 })
  assert.equal(runtime.snapshot.correctCount, 1)

  const next = runtimeHarness()
  await next.runtime.startMidi()
  next.runtime.setMidiInputSource('development')
  next.runtime.start(); next.time.advance(32)
  const nextTarget = next.runtime.snapshot.currentNote.midiNumber
  next.plugin.emit('midiMessage', { bytes: [0x90, nextTarget, 100], nativeTimestampNanos: 1, callbackReceivedNanos: 2 })
  assert.equal(next.runtime.snapshot.completedQuestions, 0)
  next.runtime.sendMidi(nextTarget)
  assert.equal(next.runtime.snapshot.correctCount, 1)
})

test('L production path reaches handleMidi without judgement shortcuts', () => {
  const sources = [
    '../prototype/android-tablet-v1/src/androidBluetoothMidi.ts',
    '../prototype/android-tablet-v1/src/androidBluetoothMidiCore.ts',
    '../android/app/src/main/java/com/pianofundamentals/trainer/AndroidBluetoothMidiPlugin.kt'
  ].map((file) => fs.readFileSync(path.resolve(__dirname, file), 'utf8')).join('\n')
  assert.doesNotMatch(sources, /markCorrect|markWrong|advanceQuestion|recordOutcome|recordTimeout|applyOutcome/)
  assert.match(fs.readFileSync(path.resolve(__dirname, '../prototype/android-tablet-v1/src/sightReadingIntegration.ts'), 'utf8'), /controller\.handleMidi/)
})

test('M shared Sight Reading contract remains platform-neutral', () => {
  const midi = fs.readFileSync(path.resolve(__dirname, '../src/sightReading/midi.ts'), 'utf8')
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/sightReading/controller.ts'), 'utf8')
  assert.doesNotMatch(`${midi}\n${controller}`, /Capacitor|Bluetooth|androidBluetooth|prototype\/android/)
  assert.match(midi, /id: number/)
  assert.match(midi, /timestamp: number/)
  assert.match(midi, /velocity === 0/)
})

test('N app lifecycle pauses timing, rejects unseen input and requires explicit resume', async () => {
  const { plugin, runtime, time } = runtimeHarness()
  await runtime.startMidi()
  runtime.start(); time.advance(32)
  const target = runtime.snapshot.currentNote.midiNumber
  await runtime.suspendForAppLifecycle()
  time.advance(9000)
  plugin.emit('midiMessage', { bytes: [0x90, target, 100], nativeTimestampNanos: 1, callbackReceivedNanos: 2 })
  await runtime.resumeFromAppLifecycle()
  assert.equal(runtime.snapshot.completedQuestions, 0)
  assert.equal(runtime.snapshot.isPaused, true)
  runtime.resume()
  plugin.emit('midiMessage', { bytes: [0x90, target, 100], nativeTimestampNanos: 3, callbackReceivedNanos: 4 })
  assert.equal(runtime.snapshot.correctCount, 1)
})

async function main() {
  let failed = 0
  for (const { name, callback } of tests) {
    try {
      await callback()
      process.stdout.write(`PASS ${name}\n`)
    } catch (error) {
      failed += 1
      process.stderr.write(`FAIL ${name}\n${error.stack || error}\n`)
    }
  }
  process.stdout.write(`\n${tests.length - failed}/${tests.length} Android Bluetooth MIDI groups PASS\n`)
  process.exitCode = failed ? 1 : 0
}

void main()
