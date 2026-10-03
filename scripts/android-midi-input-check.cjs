const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { execFileSync } = require('node:child_process')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename
  }).outputText, filename)
}
const { MidiInputProvider } = require('../prototype/android-tablet-v1/src/androidBluetoothMidi.ts')
const { AndroidMidiInputRouter } = require('../prototype/android-tablet-v1/src/androidBluetoothMidiCore.ts')
const { AndroidSightReadingRuntime } = require('../prototype/android-tablet-v1/src/sightReadingIntegration.ts')
const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const device = (id, transport, ports = [0]) => ({ id, name: 'Same Piano', transport, source: 'midiManager', outputPorts: ports.map(portNumber => ({ portNumber, name: `Port ${portNumber}` })) })
class NativeFixture {
  constructor(devices = [device('b', 'bluetooth'), device('u', 'usb')], bluetoothAvailable = true) {
    this.listeners = new Map(); this.calls = []; this.revision = 0; this.generation = 0
    this.state = { supported: true, androidApiLevel: 36, scanServiceUuid: '', permissionState: bluetoothAvailable ? 'GRANTED' : 'DENIED', bluetoothState: bluetoothAvailable ? 'ON' : 'OFF',
      connectionState: 'IDLE', midiPortState: 'CLOSED', discoveredDevices: devices, receivedChunkCount: 0, receivedByteCount: 0, disconnectCount: 0, reconnectCount: 0,
      connectionGeneration: 0, deliveryEpoch: 0, stateRevision: 0,
      capabilities: { bluetooth: { supported: true, available: bluetoothAvailable, reason: bluetoothAvailable ? undefined : 'PERMISSION_DENIED' }, usb: { supported: true, available: true } } }
  }
  async addListener(name, listener) { this.listeners.set(name, listener); return { remove: async () => this.listeners.delete(name) } }
  emit(name, value) { this.listeners.get(name)?.(value) }
  update(changes) { this.state = { ...this.state, ...changes, stateRevision: ++this.revision }; this.emit('stateChanged', this.state); return this.state }
  async getState() { return this.state }
  async requestMidiPermissions() { return this.state }
  async startScan() { return this.update({ discoveredDevices: this.state.discoveredDevices }) }
  async stopScan() { return this.state }
  async suspendDelivery() { this.calls.push('suspend'); return this.update({ midiPortState: 'SUSPENDED', deliveryEpoch: this.state.deliveryEpoch + 1 }) }
  async resumeDelivery() { return this.update({ midiPortState: this.state.activeInput ? 'OPEN' : 'CLOSED', deliveryEpoch: this.state.deliveryEpoch + 1 }) }
  async disconnect() { this.calls.push('close'); return this.update({ activeInput: undefined, connectionGeneration: ++this.generation, connectionState: 'DISCONNECTED', midiPortState: 'CLOSED' }) }
  async connect({ deviceId, portNumber }) {
    this.calls.push(`open:${deviceId}`)
    const selected = this.state.discoveredDevices.find(d => d.id === deviceId)
    if (!selected || (selected.transport === 'bluetooth' && !this.state.capabilities.bluetooth.available)) return this.update({ connectionState: 'ERROR', reasonCode: 'OPEN_FAILED' })
    const ports = selected.outputPorts.map(p => p.portNumber)
    if (!ports.length || (ports.length > 1 && portNumber === undefined) || (portNumber !== undefined && !ports.includes(portNumber))) return this.update({ connectionState: 'ERROR', reasonCode: !ports.length ? 'NO_OUTPUT_PORT' : 'PORT_SELECTION_REQUIRED' })
    return this.update({ connectionState: 'CONNECTED', midiPortState: 'OPEN', connectedDeviceId: deviceId, connectedDeviceName: selected.name, reasonCode: undefined,
      activeInput: { deviceId, displayName: selected.name, transport: selected.transport, portNumber: portNumber ?? ports[0], connectionGeneration: ++this.generation }, connectionGeneration: this.generation })
  }
  chunk(bytes, identity = this.state.activeInput, deliveryEpoch = this.state.deliveryEpoch) { this.emit('midiMessage', { bytes, identity, deliveryEpoch, nativeTimestampNanos: 1, callbackReceivedNanos: 2 }) }
  remove(id) { const active = this.state.activeInput?.deviceId === id; this.update({ discoveredDevices: this.state.discoveredDevices.filter(d => d.id !== id), ...(active ? { activeInput: undefined, connectionState: 'DISCONNECTED', midiPortState: 'CLOSED', connectionGeneration: ++this.generation, reasonCode: 'DEVICE_REMOVED' } : {}) }) }
}
async function harness(devices, bluetoothAvailable) {
  const events = [], signals = []; const plugin = new NativeFixture(devices, bluetoothAvailable)
  const router = new AndroidMidiInputRouter({ now: () => 1000 }, e => events.push(e), 'bluetooth')
  const provider = new MidiInputProvider(plugin, router, { onTransportLost: () => signals.push('lost'), onTransportReady: () => signals.push('ready'), onChange() {} }, true)
  await provider.start(); return { provider, plugin, router, events, signals }
}
const tests = []
const test = (name, callback) => tests.push({ name, callback })
test('single Bluetooth input preserves fragmented NoteOn/Off, velocity-zero and watermark', async () => {
  const h = await harness([device('b', 'bluetooth')]); await h.provider.connect('b'); assert.ok(h.provider.ready)
  h.plugin.chunk([0x90, 60]); h.plugin.chunk([100, 60, 0, 0x80, 61, 42])
  assert.deepEqual(h.events.map(e => [e.type, e.midiNumber, e.velocity]), [['noteOn', 60, 100], ['noteOff', 60, 0], ['noteOff', 61, 42]])
  assert.ok(h.events.every((e, i) => !i || e.id > h.events[i - 1].id))
})
test('USB input works without Bluetooth permission or enabled radio', async () => {
  const h = await harness([device('u', 'usb')], false); await h.provider.connect('u'); h.plugin.chunk([0x90, 64, 100]); assert.ok(h.provider.ready); assert.equal(h.router.activeSource, 'usb'); assert.equal(h.events.length, 1)
})
test('no USB candidate does not affect Bluetooth', async () => { const h = await harness([device('b', 'bluetooth')]); await h.provider.connect('b'); assert.ok(h.provider.ready) })
test('simultaneous same-name candidates stay separate and selection is explicit', async () => {
  const h = await harness(); assert.equal(h.provider.snapshot.discoveredDevices.length, 2); assert.equal(h.provider.ready, false)
  await h.provider.connect('u'); assert.equal(h.provider.snapshot.activeInput.deviceId, 'u'); assert.equal(h.provider.snapshot.discoveredDevices.length, 2)
})
test('two different same-name Bluetooth identities remain separate product candidates', async () => {
  const h = await harness([device('AA:BB:CC:DD:EE:01', 'bluetooth'), device('AA:BB:CC:DD:EE:02', 'bluetooth')])
  assert.equal(h.provider.snapshot.discoveredDevices.length, 2)
  assert.equal(h.provider.snapshot.discoveredDevices[0].name, h.provider.snapshot.discoveredDevices[1].name)
  await h.provider.connect('AA:BB:CC:DD:EE:02')
  assert.equal(h.provider.snapshot.activeInput.deviceId, 'AA:BB:CC:DD:EE:02')
  assert.equal(h.provider.snapshot.discoveredDevices.length, 2)
})
test('non-active USB removal does not pause Bluetooth', async () => { const h = await harness(); await h.provider.connect('b'); const n = h.signals.length; h.plugin.remove('u'); assert.ok(h.provider.ready); assert.equal(h.signals.length, n) })
test('Bluetooth off/denied/unsupported capability cannot invalidate selected USB', async () => {
  const h = await harness(); await h.provider.connect('u'); const n = h.signals.length
  for (const reason of ['BLUETOOTH_OFF', 'PERMISSION_DENIED', 'UNSUPPORTED']) h.plugin.update({ bluetoothState: 'OFF', permissionState: 'DENIED', capabilities: { bluetooth: { supported: reason !== 'UNSUPPORTED', available: false, reason }, usb: { supported: true, available: true } } })
  assert.ok(h.provider.ready); assert.equal(h.signals.length, n); h.plugin.chunk([0x90, 60, 100]); assert.equal(h.events.length, 1)
})
test('selected USB removal invalidates readiness and rejects late input', async () => { const h = await harness(); await h.provider.connect('u'); const old = h.plugin.state.activeInput; h.plugin.remove('u'); h.plugin.chunk([0x90, 60, 100], old); assert.equal(h.provider.ready, false); assert.equal(h.events.length, 0); assert.equal(h.signals.at(-1), 'lost') })
for (const [old, next] of [['b', 'u'], ['u', 'b']]) test(`${old} to ${next} switch closes old, resets partial parser, rejects stale receiver`, async () => {
  const h = await harness(); await h.provider.connect(old); h.plugin.chunk([0x90, 60]); const identity = h.plugin.state.activeInput; const epoch = h.plugin.state.deliveryEpoch; const watermark = h.router.readWatermark()
  h.plugin.calls = []; await h.provider.connect(next); assert.deepEqual(h.plugin.calls, ['suspend', 'close', `open:${next}`]); assert.ok(h.router.readWatermark() > watermark)
  h.plugin.chunk([100]); h.plugin.chunk([0x90, 60, 100], identity, epoch); assert.equal(h.events.length, 0)
  h.plugin.chunk([0x90, 64, 100]); assert.equal(h.events.length, 1); assert.equal(h.events[0].midiNumber, 64)
})
test('wrong identity, generation, port, transport and missing envelope fail closed', async () => {
  const h = await harness(); await h.provider.connect('u'); const id = h.plugin.state.activeInput
  for (const changes of [{ deviceId: 'b' }, { transport: 'bluetooth' }, { portNumber: 99 }, { connectionGeneration: id.connectionGeneration - 1 }]) h.plugin.chunk([0x90, 60, 100], { ...id, ...changes })
  h.plugin.emit('midiMessage', { bytes: [0x90, 60, 100], nativeTimestampNanos: 1, callbackReceivedNanos: 2 }); assert.equal(h.events.length, 0)
})
test('connection owns fresh parser even when transport and device stay the same', async () => {
  const h = await harness(); await h.provider.connect('u'); h.plugin.chunk([0x90, 60]); const old = h.plugin.state.activeInput
  await h.provider.connect('u'); h.plugin.chunk([100]); h.plugin.chunk([0x90, 64, 100], old); assert.equal(h.events.length, 0)
})
test('lifecycle delivery epoch rejects already queued chunks after resume', async () => {
  const h = await harness(); await h.provider.connect('u'); const epoch = h.plugin.state.deliveryEpoch
  await h.provider.suspendDelivery(); h.plugin.chunk([0x90, 60, 100]); await h.provider.resumeDelivery(); h.plugin.chunk([0x90, 60, 100], h.plugin.state.activeInput, epoch); assert.equal(h.events.length, 0)
  h.plugin.chunk([0x90, 60, 100]); assert.equal(h.events.length, 1)
})
test('stale state response cannot overwrite newer generation', async () => {
  const h = await harness(); await h.provider.connect('b'); const old = h.plugin.state; await h.provider.connect('u'); h.plugin.emit('stateChanged', old); assert.equal(h.provider.snapshot.activeInput.deviceId, 'u')
})
test('multiple USB outputs require explicit valid port; no output fails', async () => {
  const h = await harness([device('u', 'usb', [0, 3]), device('n', 'usb', [])]); await h.provider.connect('u'); assert.equal(h.provider.ready, false); assert.equal(h.provider.snapshot.reasonCode, 'PORT_SELECTION_REQUIRED')
  await h.provider.connect('u', 3); assert.equal(h.provider.snapshot.activeInput.portNumber, 3); await h.provider.connect('n'); assert.equal(h.provider.ready, false); assert.equal(h.provider.snapshot.reasonCode, 'NO_OUTPUT_PORT')
})
test('USB discovery refresh and Bluetooth scanning preserve active parser', async () => {
  const h = await harness(); await h.provider.connect('u'); h.plugin.chunk([0x90, 60]); await h.provider.refresh(); await h.provider.scan(); h.plugin.chunk([100]); assert.equal(h.events.length, 1)
})
for (const failedStep of ['suspendDelivery', 'disconnect']) test(`failed ${failedStep} aborts switching before opening a new input`, async () => {
  const h = await harness(); await h.provider.connect('b')
  h.plugin.calls = []
  h.plugin[failedStep] = async () => { throw new Error(`native ${failedStep} failure`) }
  await h.provider.connect('u')
  assert.equal(h.provider.ready, false)
  assert.equal(h.provider.snapshot.connectionState, 'ERROR')
  assert.equal(h.plugin.calls.some(call => call.startsWith('open:')), false)
  h.plugin.chunk([0x90, 60, 100]); assert.equal(h.events.length, 0)
})
test('disconnect immediately blocks queued chunks while native close is pending', async () => {
  const h = await harness(); await h.provider.connect('u')
  let finishClose
  const close = h.plugin.disconnect.bind(h.plugin)
  h.plugin.disconnect = () => new Promise(resolve => { finishClose = async () => resolve(await close()) })
  const pending = h.provider.disconnect()
  assert.equal(h.provider.ready, false)
  h.plugin.chunk([0x90, 60, 100]); assert.equal(h.events.length, 0)
  await finishClose(); await pending
  assert.equal(h.provider.snapshot.connectionState, 'DISCONNECTED')
})
test('real shared Sight controller pauses on USB switch and needs explicit resume', async () => {
  const plugin = new NativeFixture(); let now = 1000; let sequence = 0; const jobs = new Map()
  const scheduler = { schedule(callback, delay) { const id = ++sequence; jobs.set(id, { at: now + delay, callback }); return id }, cancel(id) { jobs.delete(id) } }
  const advance = (ms) => {
    const until = now + ms
    while (true) {
      const next = [...jobs].filter(([, job]) => job.at <= until).sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) break
      jobs.delete(next[0]); now = next[1].at; next[1].callback()
    }
    now = until
  }
  const runtime = new AndroidSightReadingRuntime({ clock: { now: () => now }, scheduler, random: () => 0.42, bluetoothPlugin: plugin, requireMidiIdentity: true, initialMidiSource: 'bluetooth' })
  await runtime.startMidi(); await runtime.midiInput.connect('b'); runtime.start(); advance(32)
  await runtime.midiInput.connect('u'); assert.ok(runtime.snapshot.isPaused); assert.ok(runtime.midiResumeRequired)
  const target = runtime.snapshot.currentNote.midiNumber; plugin.chunk([0x90, target, 100]); assert.equal(runtime.snapshot.completedQuestions, 0)
  runtime.resume(); plugin.chunk([0x90, target, 100]); assert.equal(runtime.snapshot.correctCount, 1)
})
test('native binds open and receiver tokens at creation and uses USB system output ports', () => {
  const native = read('android/app/src/main/java/com/pianofundamentals/trainer/AndroidBluetoothMidiPlugin.kt')
  assert.match(native, /TYPE_USB/); assert.match(native, /TRANSPORT_MIDI_BYTE_STREAM/); assert.match(native, /openDevice\(candidate.midiDeviceInfo/); assert.match(native, /openOutputPort\(portNumber\)/)
  assert.match(native, /val generation = connectionPolicy.generation[\s\S]*OnDeviceOpenedListener[\s\S]*isCurrent\(generation\)/)
  assert.match(native, /createReceiver\(candidate: Candidate, portNumber: Int, generation: Long\)[\s\S]*isCurrent\(generation\)/)
  assert.match(native, /identityToJs\(candidate, portNumber, generation\)/); assert.match(native, /bluetoothLossAffectsActive\(connectedTransport\)/)
  assert.doesNotMatch(native, /FP.?30X|Roland|vendorId|productId|UsbRequest|UsbDeviceConnection/)
})
test('native candidate reconciliation, invalidation and fresh lookup are wired into the real plugin', () => {
  const native = read('android/app/src/main/java/com/pianofundamentals/trainer/AndroidBluetoothMidiPlugin.kt')
  assert.match(native, /PROPERTY_BLUETOOTH_DEVICE/)
  assert.match(native, /candidateIdentity\.observe\(candidate.transport, candidate.address, candidate.midiDeviceInfo\?\.id/)
  assert.match(native, /onDeviceRemoved[\s\S]*?invalidateCandidateInfo\(info.id\)/)
  assert.match(native, /closeConnectionResources\(\)[\s\S]*?val visible = visibleMidiDevices\(\)[\s\S]*?candidateIdentity.freshNativeId/)
  assert.match(native, /copy\(midiDeviceInfo = freshInfo\)/)
  assert.match(native, /connectedTransport == "bluetooth"\) connectedMidiInfoId\?\.let\(::invalidateCandidateInfo\)/)
  assert.match(native, /it.copy\(midiDeviceInfo = null\)/)
  assert.match(native, /openBluetoothDevice\(candidate.bluetoothDevice/)
  assert.match(native, /put\("discoveryOrigins", JSArray\(candidate.discoveryOrigins.toList\(\)\)\)/)
})
test('candidate wrapper uses existing full-width device button visual for Bluetooth, USB and multi-port rows', () => {
  const postcss = require('postcss')
  const styles = postcss.parse(read('prototype/android-tablet-v1/src/styles.css'))
  const matching = []
  styles.walkRules(rule => { if (rule.selector === '.midi-device-list .midi-candidate > button') matching.push(rule) })
  assert.equal(matching.length, 1)
  const declarations = Object.fromEntries(matching[0].nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]))
  assert.equal(declarations.display, 'grid')
  assert.equal(declarations.width, '100%')
  assert.equal(declarations['min-height'], '58px')
  assert.equal(declarations['grid-template-columns'], '38px 1fr auto')
  assert.equal(declarations.background, 'var(--surface-soft)')
  assert.equal(declarations.color, 'var(--ink)')
  const main = read('prototype/android-tablet-v1/src/main.tsx')
  const ui = main.slice(main.indexOf('function MidiScreen'), main.indexOf('function updaterStatusCopy'))
  assert.match(ui, /className="midi-candidate"[\s\S]*ports.length > 1[\s\S]*<label[\s\S]*<\/label> : null}[\s\S]*<button/)
  assert.match(ui, /device.transport === 'usb' \? 'USB MIDI' : 'Bluetooth MIDI'/)
  assert.doesNotMatch(read('prototype/android-tablet-v1/src/styles.css'), /\.midi-device-list > div:last-child > button\s*\{/)
  // Shared wrapper/selector is transport- and port-count-neutral. This is a CSS contract, not a browser rendering claim.
})
test('MIDI details show only connection, input and practice readiness without an imaginary audio setting', () => {
  const main = read('prototype/android-tablet-v1/src/main.tsx')
  const ui = main.slice(main.indexOf('function MidiScreen'), main.indexOf('function updaterStatusCopy'))
  const details = ui.match(/<section className="device-details">([\s\S]*?)<\/section>/)[1]
  assert.deepEqual([...details.matchAll(/<small>([^<]+)<\/small>/g)].map(match => match[1]), ['连接方式', 'MIDI 输入', '练习状态'])
  assert.equal((details.match(/<div>/g) ?? []).length, 3)
  assert.doesNotMatch(ui, /应用发声|visibility:\s*hidden|opacity:\s*0/)
  const postcss = require('postcss')
  let lastRow
  postcss.parse(read('prototype/android-tablet-v1/src/styles.css')).walkRules(rule => {
    if (rule.selector === '.device-details div:last-child') lastRow = Object.fromEntries(rule.nodes.map(node => [node.prop, node.value]))
  })
  assert.equal(lastRow['grid-column'], '1 / -1')
  assert.equal(lastRow['border-right'], '0')
  assert.equal(lastRow['border-bottom'], '0')
})
test('byte parser and mature judgement/persistence/signing/updater source stay frozen', () => {
  const base = '622b2ee3384c8997b8c0389ec7d4e5751e1b70a8'
  const frozen = ['src/sightReading/midi.ts', 'src/sightReading/controller.ts', 'prototype/android-tablet-v1/src/intervalPractice/judgement.ts', 'prototype/android-tablet-v1/src/intervalPractice/sessionRuntime.ts', 'prototype/android-tablet-v1/src/chordPractice/runtime/core.ts', 'prototype/android-tablet-v1/src/androidPersistenceCore.ts', 'android/version.properties', 'android/updater.properties', 'android/app/build.gradle']
  for (const file of frozen) assert.equal(read(file).replace(/\r/g, ''), execFileSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8' }).replace(/\r/g, ''), file)
  const file = 'prototype/android-tablet-v1/src/androidBluetoothMidiCore.ts'; const original = execFileSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8' })
  assert.equal(read(file).replace(/\r/g, '').replace("'bluetooth' | 'usb' | 'development'", "'bluetooth' | 'development'"), original.replace(/\r/g, ''))
})
test('Android product copy is neutral and raw MIDI diagnostics remain QA-only', () => {
  const main = read('prototype/android-tablet-v1/src/main.tsx'); const ui = main.slice(main.indexOf('function MidiScreen'), main.indexOf('function updaterStatusCopy'))
  assert.doesNotMatch(main, /FP-30X|FP30X|Roland/); assert.doesNotMatch(ui, /A3\.1|MidiManager|lastError|midiPortState|lastNormalizedEvent/)
  assert.match(ui, /device.name/); assert.match(ui, /USB MIDI/); assert.match(ui, /Bluetooth MIDI/); assert.match(ui, /ports.length > 1/); assert.match(ui, /请选择端口/)
  assert.match(main.slice(main.indexOf('function ReviewDock')), /diagnostics/)
})
async function run() {
  let failed = 0
  for (const { name, callback } of tests) try { await callback(); console.log(`PASS ${name}`) } catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack}`) }
  console.log(`${tests.length - failed}/${tests.length} generic MIDI groups PASS`); process.exitCode = failed ? 1 : 0
}
void run()
