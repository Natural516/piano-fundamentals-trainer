package com.pianofundamentals.trainer

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiManager
import android.media.midi.MidiOutputPort
import android.media.midi.MidiReceiver
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.IOException
import java.util.LinkedHashMap
import java.util.UUID

@CapacitorPlugin(
    name = "AndroidBluetoothMidi",
    permissions = [
        Permission(
            alias = "nearbyDevices",
            strings = [Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT]
        ),
        Permission(alias = "legacyLocation", strings = [Manifest.permission.ACCESS_FINE_LOCATION])
    ]
)
class AndroidBluetoothMidiPlugin : Plugin() {
    companion object {
        private const val MIDI_SERVICE_UUID = "03B80E5A-EDE8-4B33-A751-6CE34EC4C700"
        private const val EVENT_STATE_CHANGED = "stateChanged"
        private const val EVENT_DEVICE_DISCOVERED = "deviceDiscovered"
        private const val EVENT_MIDI_MESSAGE = "midiMessage"
    }

    private data class Candidate(
        val id: String,
        val name: String,
        val address: String?,
        val manufacturer: String?,
        val product: String?,
        val source: String,
        val serviceUuids: List<String>,
        val bluetoothDevice: BluetoothDevice? = null,
        val midiDeviceInfo: MidiDeviceInfo? = null
    )

    private val mainHandler = Handler(Looper.getMainLooper())
    private val candidates = LinkedHashMap<String, Candidate>()
    private var midiManager: MidiManager? = null
    private var bluetoothAdapter: BluetoothAdapter? = null
    private var scanning = false
    private var registeredBluetoothReceiver = false
    private var registeredMidiCallback = false
    private var permissionRequestAttempted = false
    private var internalConnectionState = "IDLE"
    private var connectedDeviceId: String? = null
    private var connectedDeviceName: String? = null
    private var connectedMidiInfoId: Int? = null
    private var midiDevice: MidiDevice? = null
    private var midiOutputPort: MidiOutputPort? = null
    private var deliveryEnabled = true
    private var receivedChunkCount = 0L
    private var receivedByteCount = 0L
    private var disconnectCount = 0
    private var reconnectCount = 0
    private var hasConnectedBefore = false
    private var lastError: String? = null

    private val midiReceiver = object : MidiReceiver() {
        override fun onSend(message: ByteArray, offset: Int, count: Int, timestamp: Long) {
            if (count <= 0) return
            val copy = message.copyOfRange(offset, offset + count)
            val callbackReceivedNanos = System.nanoTime()
            mainHandler.post {
                receivedChunkCount += 1
                receivedByteCount += copy.size
                if (!deliveryEnabled || internalConnectionState != "CONNECTED") {
                    emitState()
                    return@post
                }
                val bytes = JSArray()
                copy.forEach { bytes.put(it.toInt() and 0xff) }
                val payload = JSObject()
                payload.put("bytes", bytes)
                payload.put("nativeTimestampNanos", timestamp)
                payload.put("callbackReceivedNanos", callbackReceivedNanos)
                notifyListeners(EVENT_MIDI_MESSAGE, payload, false)
                emitState()
            }
        }

        override fun onFlush() {
            // TypeScript owns framing and resets it at every lifecycle boundary.
        }
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            mainHandler.post { addBleCandidate(result) }
        }

        override fun onBatchScanResults(results: MutableList<ScanResult>) {
            mainHandler.post { results.forEach(::addBleCandidate) }
        }

        override fun onScanFailed(errorCode: Int) {
            mainHandler.post {
                scanning = false
                setError("BLE MIDI scan failed with Android error code $errorCode")
            }
        }
    }

    private val midiDeviceCallback = object : MidiManager.DeviceCallback() {
        override fun onDeviceAdded(info: MidiDeviceInfo) {
            if (info.type == MidiDeviceInfo.TYPE_BLUETOOTH) mainHandler.post { addMidiManagerCandidate(info) }
        }

        override fun onDeviceRemoved(info: MidiDeviceInfo) {
            mainHandler.post {
                candidates.remove("midi:${info.id}")
                if (connectedMidiInfoId == info.id) {
                    closeConnection("Android MidiManager reported device removal", true)
                } else {
                    emitState()
                }
            }
        }
    }

    private val bluetoothStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != BluetoothAdapter.ACTION_STATE_CHANGED) return
            mainHandler.post {
                if (!isBluetoothEnabled()) {
                    stopScanInternal()
                    closeConnection("Android Bluetooth was turned off", true)
                } else if (internalConnectionState != "CONNECTED") {
                    internalConnectionState = "IDLE"
                    lastError = null
                    emitState()
                }
            }
        }
    }

    override fun load() {
        midiManager = context.getSystemService(MidiManager::class.java)
        bluetoothAdapter = context.getSystemService(BluetoothManager::class.java)?.adapter
        registerMidiDeviceCallback()
        ContextCompat.registerReceiver(
            context,
            bluetoothStateReceiver,
            IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
        registeredBluetoothReceiver = true
    }

    @PluginMethod
    fun getState(call: PluginCall) {
        call.resolve(buildState())
    }

    @PluginMethod
    fun requestMidiPermissions(call: PluginCall) {
        if (!isSupported()) {
            call.resolve(buildState())
            return
        }
        permissionRequestAttempted = true
        val alias = BluetoothMidiStatePolicy.permissionAlias(Build.VERSION.SDK_INT)
        if (getPermissionState(alias) == PermissionState.GRANTED) {
            call.resolve(buildState())
            return
        }
        requestPermissionForAlias(alias, call, "permissionResult")
    }

    @PermissionCallback
    private fun permissionResult(call: PluginCall) {
        permissionRequestAttempted = true
        if (currentPermissionState() == "GRANTED" && isBluetoothEnabled()) {
            internalConnectionState = "IDLE"
            lastError = null
        }
        val state = buildState()
        emitState()
        call.resolve(state)
    }

    @PluginMethod
    fun startScan(call: PluginCall) {
        val blocked = environmentBlockState()
        if (blocked != null) {
            internalConnectionState = blocked
            val state = buildState()
            emitState()
            call.resolve(state)
            return
        }

        stopScanInternal()
        candidates.clear()
        lastError = null
        internalConnectionState = "SCANNING"
        enumerateVisibleMidiDevices()
        val scanner = bluetoothAdapter?.bluetoothLeScanner
        if (scanner == null) {
            setError("Android BLE scanner is unavailable")
            call.resolve(buildState())
            return
        }
        try {
            val filter = ScanFilter.Builder()
                .setServiceUuid(ParcelUuid(UUID.fromString(MIDI_SERVICE_UUID)))
                .build()
            val settings = ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
                .build()
            scanner.startScan(listOf(filter), settings, scanCallback)
            scanning = true
            emitState()
            call.resolve(buildState())
        } catch (error: SecurityException) {
            setError("Bluetooth scan permission error: ${safeMessage(error)}")
            call.resolve(buildState())
        } catch (error: RuntimeException) {
            setError("Unable to start BLE MIDI scan: ${safeMessage(error)}")
            call.resolve(buildState())
        }
    }

    @PluginMethod
    fun stopScan(call: PluginCall) {
        stopScanInternal()
        if (internalConnectionState == "SCANNING") internalConnectionState = "IDLE"
        if (internalConnectionState == "DEVICE_FOUND" && candidates.isEmpty()) internalConnectionState = "IDLE"
        emitState()
        call.resolve(buildState())
    }

    @PluginMethod
    fun connect(call: PluginCall) {
        val deviceId = call.getString("deviceId")
        if (deviceId.isNullOrBlank()) {
            call.reject("deviceId is required")
            return
        }
        val blocked = environmentBlockState()
        if (blocked != null) {
            internalConnectionState = blocked
            call.resolve(buildState())
            return
        }
        val candidate = candidates[deviceId]
        if (candidate == null) {
            setError("Selected BLE MIDI device is no longer available")
            call.resolve(buildState())
            return
        }

        stopScanInternal()
        closeConnectionResources()
        internalConnectionState = "CONNECTING"
        lastError = null
        connectedDeviceId = candidate.id
        connectedDeviceName = candidate.name
        emitState()

        val listener = MidiManager.OnDeviceOpenedListener { opened ->
            mainHandler.post { finishOpen(candidate, opened, call) }
        }
        try {
            if (candidate.midiDeviceInfo != null) {
                midiManager?.openDevice(candidate.midiDeviceInfo, listener, mainHandler)
            } else if (candidate.bluetoothDevice != null) {
                midiManager?.openBluetoothDevice(candidate.bluetoothDevice, listener, mainHandler)
            } else {
                setError("Discovered candidate has no Android MIDI device handle")
                call.resolve(buildState())
            }
        } catch (error: SecurityException) {
            setError("Bluetooth MIDI connect permission error: ${safeMessage(error)}")
            call.resolve(buildState())
        } catch (error: RuntimeException) {
            setError("Android MidiManager could not open the device: ${safeMessage(error)}")
            call.resolve(buildState())
        }
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        stopScanInternal()
        closeConnection("Disconnected by user", true)
        call.resolve(buildState())
    }

    @PluginMethod
    fun suspendDelivery(call: PluginCall) {
        deliveryEnabled = false
        emitState()
        call.resolve(buildState())
    }

    @PluginMethod
    fun resumeDelivery(call: PluginCall) {
        deliveryEnabled = true
        emitState()
        call.resolve(buildState())
    }

    override fun handleOnPause() {
        deliveryEnabled = false
    }

    override fun handleOnResume() {
        // JavaScript advances its watermark before explicitly enabling delivery.
    }

    override fun handleOnDestroy() {
        stopScanInternal()
        closeConnectionResources()
        if (registeredMidiCallback) {
            midiManager?.unregisterDeviceCallback(midiDeviceCallback)
            registeredMidiCallback = false
        }
        if (registeredBluetoothReceiver) {
            try {
                context.unregisterReceiver(bluetoothStateReceiver)
            } catch (_: IllegalArgumentException) {
                // Receiver already gone with the Activity.
            }
            registeredBluetoothReceiver = false
        }
    }

    private fun registerMidiDeviceCallback() {
        val manager = midiManager ?: return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                manager.registerDeviceCallback(
                    MidiManager.TRANSPORT_MIDI_BYTE_STREAM,
                    ContextCompat.getMainExecutor(context),
                    midiDeviceCallback
                )
            } else {
                @Suppress("DEPRECATION")
                manager.registerDeviceCallback(midiDeviceCallback, mainHandler)
            }
            registeredMidiCallback = true
        } catch (error: RuntimeException) {
            setError("Unable to register Android MIDI device callback: ${safeMessage(error)}")
        }
    }

    private fun enumerateVisibleMidiDevices() {
        val manager = midiManager ?: return
        val devices: Collection<MidiDeviceInfo> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            manager.getDevicesForTransport(MidiManager.TRANSPORT_MIDI_BYTE_STREAM)
        } else {
            @Suppress("DEPRECATION")
            manager.devices.asList()
        }
        devices.filter { it.type == MidiDeviceInfo.TYPE_BLUETOOTH }.forEach(::addMidiManagerCandidate)
    }

    private fun addBleCandidate(result: ScanResult) {
        if (!scanning) return
        val device = result.device
        val name = result.scanRecord?.deviceName
            ?: safeBluetoothName(device)
            ?: "BLE MIDI device"
        val address = safeBluetoothAddress(device)
        val id = address ?: "ble:${device.hashCode()}"
        val candidate = Candidate(
            id = id,
            name = name,
            address = address,
            manufacturer = null,
            product = null,
            source = "bleScan",
            serviceUuids = result.scanRecord?.serviceUuids?.map { it.uuid.toString() } ?: emptyList(),
            bluetoothDevice = device
        )
        candidates[id] = candidate
        internalConnectionState = "DEVICE_FOUND"
        emitDiscovered(candidate)
        emitState()
    }

    private fun addMidiManagerCandidate(info: MidiDeviceInfo) {
        val properties = info.properties
        val bluetoothDevice = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            properties.getParcelable(MidiDeviceInfo.PROPERTY_BLUETOOTH_DEVICE, BluetoothDevice::class.java)
        } else {
            @Suppress("DEPRECATION")
            properties.getParcelable(MidiDeviceInfo.PROPERTY_BLUETOOTH_DEVICE) as? BluetoothDevice
        }
        val id = "midi:${info.id}"
        val candidate = Candidate(
            id = id,
            name = properties.getString(MidiDeviceInfo.PROPERTY_NAME)
                ?: properties.getString(MidiDeviceInfo.PROPERTY_PRODUCT)
                ?: safeBluetoothName(bluetoothDevice)
                ?: "Android Bluetooth MIDI",
            address = safeBluetoothAddress(bluetoothDevice),
            manufacturer = properties.getString(MidiDeviceInfo.PROPERTY_MANUFACTURER),
            product = properties.getString(MidiDeviceInfo.PROPERTY_PRODUCT),
            source = "midiManager",
            serviceUuids = listOf(MIDI_SERVICE_UUID),
            bluetoothDevice = bluetoothDevice,
            midiDeviceInfo = info
        )
        candidates[id] = candidate
        if (internalConnectionState == "SCANNING") internalConnectionState = "DEVICE_FOUND"
        emitDiscovered(candidate)
        emitState()
    }

    private fun finishOpen(candidate: Candidate, opened: MidiDevice?, call: PluginCall) {
        if (opened == null) {
            setError("Android MidiManager returned no device from open request")
            call.resolve(buildState())
            return
        }
        val outputPortInfo = opened.info.ports.firstOrNull {
            it.type == MidiDeviceInfo.PortInfo.TYPE_OUTPUT
        }
        if (outputPortInfo == null) {
            tryClose(opened)
            setError("Opened MIDI device exposes no piano output port")
            call.resolve(buildState())
            return
        }
        val outputPort = opened.openOutputPort(outputPortInfo.portNumber)
        if (outputPort == null) {
            tryClose(opened)
            setError("Android could not open the piano MIDI output port")
            call.resolve(buildState())
            return
        }
        try {
            outputPort.connect(midiReceiver)
        } catch (error: IOException) {
            tryClose(outputPort)
            tryClose(opened)
            setError("Unable to attach MIDI receiver: ${safeMessage(error)}")
            call.resolve(buildState())
            return
        }

        midiDevice = opened
        midiOutputPort = outputPort
        connectedDeviceId = candidate.id
        connectedDeviceName = candidate.name
        connectedMidiInfoId = opened.info.id
        internalConnectionState = "CONNECTED"
        deliveryEnabled = true
        lastError = null
        if (hasConnectedBefore) reconnectCount += 1
        hasConnectedBefore = true
        emitState()
        call.resolve(buildState())
    }

    private fun stopScanInternal() {
        if (!scanning) return
        try {
            bluetoothAdapter?.bluetoothLeScanner?.stopScan(scanCallback)
        } catch (_: SecurityException) {
            // Permission may have been revoked during a scan.
        } catch (_: RuntimeException) {
            // Adapter shutdown invalidates the scanner.
        }
        scanning = false
    }

    private fun closeConnection(reason: String, countDisconnect: Boolean) {
        val wasConnected = internalConnectionState == "CONNECTED" || internalConnectionState == "CONNECTING"
        closeConnectionResources()
        if (wasConnected && countDisconnect) disconnectCount += 1
        internalConnectionState = "DISCONNECTED"
        lastError = if (reason == "Disconnected by user") null else reason
        emitState()
    }

    private fun closeConnectionResources() {
        try {
            midiOutputPort?.disconnect(midiReceiver)
        } catch (_: IOException) {
            // Continue closing all handles.
        }
        tryClose(midiOutputPort)
        tryClose(midiDevice)
        midiOutputPort = null
        midiDevice = null
        connectedMidiInfoId = null
        deliveryEnabled = false
    }

    private fun setError(message: String) {
        stopScanInternal()
        closeConnectionResources()
        internalConnectionState = "ERROR"
        lastError = message
        emitState()
    }

    private fun isSupported(): Boolean {
        return midiManager != null &&
            bluetoothAdapter != null &&
            context.packageManager.hasSystemFeature(PackageManager.FEATURE_MIDI) &&
            context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)
    }

    private fun environmentBlockState(): String? {
        if (!isSupported()) return "UNSUPPORTED"
        return when (currentPermissionState()) {
            "REQUIRED" -> "PERMISSION_REQUIRED"
            "DENIED" -> "PERMISSION_DENIED"
            else -> if (isBluetoothEnabled()) null else "BLUETOOTH_OFF"
        }
    }

    private fun currentPermissionState(): String {
        if (!isSupported()) return "UNSUPPORTED"
        val alias = BluetoothMidiStatePolicy.permissionAlias(Build.VERSION.SDK_INT)
        return BluetoothMidiStatePolicy.permissionState(
            true,
            getPermissionState(alias)?.toString(),
            permissionRequestAttempted
        )
    }

    private fun publicConnectionState(): String = BluetoothMidiStatePolicy.publicConnectionState(
        isSupported(),
        currentPermissionState(),
        isBluetoothEnabled(),
        internalConnectionState
    )

    private fun buildState(): JSObject {
        val state = JSObject()
        val supported = isSupported()
        state.put("supported", supported)
        state.put("androidApiLevel", Build.VERSION.SDK_INT)
        state.put("scanServiceUuid", MIDI_SERVICE_UUID)
        state.put("permissionState", currentPermissionState())
        state.put("bluetoothState", if (!supported) "UNSUPPORTED" else if (isBluetoothEnabled()) "ON" else "OFF")
        state.put("connectionState", publicConnectionState())
        state.put("discoveredDevices", JSArray(candidates.values.map(::candidateToJs)))
        state.put("connectedDeviceId", connectedDeviceId)
        state.put("connectedDeviceName", connectedDeviceName)
        state.put("midiPortState", if (midiOutputPort == null) "CLOSED" else if (deliveryEnabled) "OPEN" else "SUSPENDED")
        state.put("receivedChunkCount", receivedChunkCount)
        state.put("receivedByteCount", receivedByteCount)
        state.put("disconnectCount", disconnectCount)
        state.put("reconnectCount", reconnectCount)
        state.put("lastError", lastError)
        return state
    }

    private fun emitState() {
        notifyListeners(EVENT_STATE_CHANGED, buildState(), false)
    }

    private fun emitDiscovered(candidate: Candidate) {
        notifyListeners(EVENT_DEVICE_DISCOVERED, candidateToJs(candidate), false)
    }

    private fun candidateToJs(candidate: Candidate): JSObject {
        val result = JSObject()
        result.put("id", candidate.id)
        result.put("name", candidate.name)
        result.put("address", candidate.address)
        result.put("manufacturer", candidate.manufacturer)
        result.put("product", candidate.product)
        result.put("source", candidate.source)
        result.put("serviceUuids", JSArray(candidate.serviceUuids))
        return result
    }

    private fun safeBluetoothName(device: BluetoothDevice?): String? {
        if (device == null) return null
        return try {
            device.name
        } catch (_: SecurityException) {
            null
        }
    }

    private fun isBluetoothEnabled(): Boolean {
        return try {
            bluetoothAdapter?.isEnabled == true
        } catch (_: SecurityException) {
            false
        }
    }

    private fun safeBluetoothAddress(device: BluetoothDevice?): String? {
        if (device == null) return null
        return try {
            device.address
        } catch (_: SecurityException) {
            null
        }
    }

    private fun safeMessage(error: Throwable): String = error.message ?: error.javaClass.simpleName

    private fun tryClose(closeable: AutoCloseable?) {
        try {
            closeable?.close()
        } catch (_: Exception) {
            // Best-effort native resource cleanup.
        }
    }
}
