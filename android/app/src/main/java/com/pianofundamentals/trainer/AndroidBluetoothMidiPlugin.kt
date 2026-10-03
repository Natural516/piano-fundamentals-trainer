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
        val transport: String = "bluetooth",
        val bluetoothDevice: BluetoothDevice? = null,
        val midiDeviceInfo: MidiDeviceInfo? = null,
        val outputPorts: List<MidiDeviceInfo.PortInfo> = emptyList(),
        val discoveryOrigins: Set<String> = setOf(source)
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
    private var appPaused = false
    private var receivedChunkCount = 0L
    private var receivedByteCount = 0L
    private var disconnectCount = 0
    private var reconnectCount = 0
    private var hasConnectedBefore = false
    private var lastError: String? = null
    private var reasonCode: String? = null
    private var connectedTransport: String? = null
    private var connectedPortNumber: Int? = null
    @Volatile private var deliveryEpoch = 0L
    private var stateRevision = 0L
    private val connectionPolicy = MidiInputConnectionPolicy()
    private val candidateIdentity = MidiCandidateIdentityPolicy()
    private var midiReceiver: MidiReceiver? = null

    private fun createReceiver(candidate: Candidate, portNumber: Int, generation: Long): MidiReceiver = object : MidiReceiver() {
        override fun onSend(message: ByteArray, offset: Int, count: Int, timestamp: Long) {
            if (count <= 0) return
            val copy = message.copyOfRange(offset, offset + count)
            val callbackReceivedNanos = System.nanoTime()
            val capturedEpoch = deliveryEpoch
            mainHandler.post {
                if (!connectionPolicy.isCurrent(generation) || capturedEpoch != deliveryEpoch) return@post
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
                payload.put("identity", identityToJs(candidate, portNumber, generation))
                payload.put("deliveryEpoch", capturedEpoch)
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
                scanError("BLE MIDI scan failed with Android error code $errorCode")
            }
        }
    }

    private val midiDeviceCallback = object : MidiManager.DeviceCallback() {
        override fun onDeviceAdded(info: MidiDeviceInfo) {
            if (info.type == MidiDeviceInfo.TYPE_BLUETOOTH || info.type == MidiDeviceInfo.TYPE_USB) {
                mainHandler.post {
                    candidateIdentity.deviceAdded(info.id)
                    addMidiManagerCandidate(info)
                }
            }
        }

        override fun onDeviceRemoved(info: MidiDeviceInfo) {
            mainHandler.post {
                invalidateCandidateInfo(info.id)
                if (MidiInputConnectionPolicy.removalAffectsActive("midi:${info.id}", connectedDeviceId, info.id, connectedMidiInfoId)) {
                    reasonCode = "DEVICE_REMOVED"
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
                    candidates.entries.removeAll { it.value.transport == "bluetooth" }
                    if (MidiInputConnectionPolicy.bluetoothLossAffectsActive(connectedTransport)) {
                        reasonCode = "BLUETOOTH_OFF"
                        closeConnection("Android Bluetooth was turned off", true)
                    } else emitState()
                } else if (internalConnectionState != "CONNECTED" && internalConnectionState != "CONNECTING") {
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
        enumerateVisibleMidiDevices()
    }

    @PluginMethod
    fun getState(call: PluginCall) {
        if (Looper.myLooper() != Looper.getMainLooper()) { mainHandler.post { getState(call) }; return }
        enumerateVisibleMidiDevices()
        call.resolve(buildState())
    }

    @PluginMethod
    fun requestMidiPermissions(call: PluginCall) {
        if (Looper.myLooper() != Looper.getMainLooper()) { mainHandler.post { requestMidiPermissions(call) }; return }
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
        if (currentPermissionState() == "GRANTED" && isBluetoothEnabled() && midiDevice == null && internalConnectionState != "CONNECTING") {
            internalConnectionState = "IDLE"
            lastError = null
        }
        val state = buildState()
        emitState()
        call.resolve(state)
    }

    @PluginMethod
    fun startScan(call: PluginCall) {
        if (Looper.myLooper() != Looper.getMainLooper()) { mainHandler.post { startScan(call) }; return }
        enumerateVisibleMidiDevices()
        val blocked = environmentBlockState()
        if (blocked != null) {
            if (connectedTransport != "usb" && midiDevice == null) internalConnectionState = blocked
            val state = buildState()
            emitState()
            call.resolve(state)
            return
        }

        stopScanInternal()
        candidates.entries.removeAll { it.value.transport == "bluetooth" && it.key != connectedDeviceId }
        lastError = null
        if (midiDevice == null && internalConnectionState != "CONNECTING") internalConnectionState = "SCANNING"
        enumerateVisibleMidiDevices()
        val scanner = bluetoothAdapter?.bluetoothLeScanner
        if (scanner == null) {
            scanError("Android BLE scanner is unavailable")
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
            scanError("Bluetooth scan permission error: ${safeMessage(error)}")
            call.resolve(buildState())
        } catch (error: RuntimeException) {
            scanError("Unable to start BLE MIDI scan: ${safeMessage(error)}")
            call.resolve(buildState())
        }
    }

    @PluginMethod
    fun stopScan(call: PluginCall) {
        if (Looper.myLooper() != Looper.getMainLooper()) { mainHandler.post { stopScan(call) }; return }
        stopScanInternal()
        if (internalConnectionState == "SCANNING") internalConnectionState = "IDLE"
        if (internalConnectionState == "DEVICE_FOUND" && candidates.isEmpty()) internalConnectionState = "IDLE"
        emitState()
        call.resolve(buildState())
    }

    @PluginMethod
    fun connect(call: PluginCall) {
        if (Looper.myLooper() != Looper.getMainLooper()) { mainHandler.post { connect(call) }; return }
        val deviceId = call.getString("deviceId")
        if (deviceId.isNullOrBlank()) {
            call.reject("deviceId is required")
            return
        }
        val selected = candidates[deviceId]
        val blocked = if (selected?.transport == "usb") {
            if (isMidiSupported()) null else "UNSUPPORTED"
        } else environmentBlockState()
        if (blocked != null) {
            internalConnectionState = blocked
            call.resolve(buildState())
            return
        }
        if (selected == null) {
            setError("Selected MIDI device is no longer available", "DEVICE_REMOVED")
            call.resolve(buildState())
            return
        }

        stopScanInternal()
        closeConnectionResources()
        // Resolve after closing: a Bluetooth handle owned by the old connection is now invalid.
        val visible = visibleMidiDevices()
        val freshInfoId = candidateIdentity.freshNativeId(selected.id, visible.map {
            MidiCandidateIdentityPolicy.Entry(if (it.type == MidiDeviceInfo.TYPE_USB) "usb" else "bluetooth",
                safeBluetoothAddress(associatedBluetoothDevice(it)), it.id)
        })
        val freshInfo = visible.firstOrNull { it.id == freshInfoId }
        freshInfo?.let(::addMidiManagerCandidate)
        val candidate = (candidates[selected.id] ?: selected).copy(midiDeviceInfo = freshInfo)
        candidates[candidate.id] = candidate
        val generation = connectionPolicy.generation
        val openEpoch = deliveryEpoch
        val requestedPort = call.getInt("portNumber")
        internalConnectionState = "CONNECTING"
        lastError = null
        reasonCode = null
        connectedDeviceId = candidate.id
        connectedDeviceName = candidate.name
        connectedTransport = candidate.transport
        emitState()

        val listener = MidiManager.OnDeviceOpenedListener { opened ->
            mainHandler.post {
                if (!connectionPolicy.isCurrent(generation)) {
                    tryClose(opened)
                    call.resolve(buildState())
                } else {
                    try { finishOpen(candidate, opened, requestedPort, generation, openEpoch, call) }
                    catch (error: Exception) {
                        tryClose(opened)
                        setError("Unable to open MIDI port: ${safeMessage(error)}", "OPEN_FAILED")
                        call.resolve(buildState())
                    }
                }
            }
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
        if (Looper.myLooper() != Looper.getMainLooper()) { mainHandler.post { disconnect(call) }; return }
        stopScanInternal()
        closeConnection("Disconnected by user", true)
        call.resolve(buildState())
    }

    @PluginMethod
    fun suspendDelivery(call: PluginCall) {
        if (Looper.myLooper() != Looper.getMainLooper()) { mainHandler.post { suspendDelivery(call) }; return }
        deliveryEnabled = false
        deliveryEpoch += 1
        emitState()
        call.resolve(buildState())
    }

    @PluginMethod
    fun resumeDelivery(call: PluginCall) {
        if (Looper.myLooper() != Looper.getMainLooper()) { mainHandler.post { resumeDelivery(call) }; return }
        deliveryEpoch += 1
        deliveryEnabled = !appPaused
        emitState()
        call.resolve(buildState())
    }

    override fun handleOnPause() {
        appPaused = true
        deliveryEnabled = false
        deliveryEpoch += 1
    }

    override fun handleOnResume() {
        appPaused = false
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

    private fun visibleMidiDevices(): List<MidiDeviceInfo> {
        val manager = midiManager ?: return emptyList()
        val devices: Collection<MidiDeviceInfo> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            manager.getDevicesForTransport(MidiManager.TRANSPORT_MIDI_BYTE_STREAM)
        } else {
            @Suppress("DEPRECATION")
            manager.devices.asList()
        }
        return devices.filter { it.type == MidiDeviceInfo.TYPE_USB ||
            (it.type == MidiDeviceInfo.TYPE_BLUETOOTH && environmentBlockState() == null) }
    }

    private fun enumerateVisibleMidiDevices() {
        visibleMidiDevices().filterNot { candidateIdentity.isInvalid(it.id) }.forEach(::addMidiManagerCandidate)
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
        val merged = mergeCandidate(candidate)
        if (midiDevice == null && internalConnectionState != "CONNECTING") internalConnectionState = "DEVICE_FOUND"
        emitDiscovered(merged)
        emitState()
    }

    private fun associatedBluetoothDevice(info: MidiDeviceInfo): BluetoothDevice? {
        if (info.type != MidiDeviceInfo.TYPE_BLUETOOTH) return null
        val properties = info.properties
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            properties.getParcelable(MidiDeviceInfo.PROPERTY_BLUETOOTH_DEVICE, BluetoothDevice::class.java)
        } else {
            @Suppress("DEPRECATION")
            properties.getParcelable(MidiDeviceInfo.PROPERTY_BLUETOOTH_DEVICE) as? BluetoothDevice
        }
    }

    private fun addMidiManagerCandidate(info: MidiDeviceInfo) {
        if (candidateIdentity.isInvalid(info.id) || (info.type == MidiDeviceInfo.TYPE_BLUETOOTH && environmentBlockState() != null)) return
        val properties = info.properties
        val bluetoothDevice = associatedBluetoothDevice(info)
        val id = "midi:${info.id}"
        val candidate = Candidate(
            id = id,
            name = properties.getString(MidiDeviceInfo.PROPERTY_NAME)
                ?: properties.getString(MidiDeviceInfo.PROPERTY_PRODUCT)
                ?: safeBluetoothName(bluetoothDevice)
                ?: "MIDI 设备",
            address = safeBluetoothAddress(bluetoothDevice),
            manufacturer = properties.getString(MidiDeviceInfo.PROPERTY_MANUFACTURER),
            product = properties.getString(MidiDeviceInfo.PROPERTY_PRODUCT),
            source = "midiManager",
            serviceUuids = if (info.type == MidiDeviceInfo.TYPE_BLUETOOTH) listOf(MIDI_SERVICE_UUID) else emptyList(),
            transport = if (info.type == MidiDeviceInfo.TYPE_USB) "usb" else "bluetooth",
            bluetoothDevice = bluetoothDevice,
            midiDeviceInfo = info,
            outputPorts = info.ports.filter { it.type == MidiDeviceInfo.PortInfo.TYPE_OUTPUT }
        )
        val merged = mergeCandidate(candidate)
        if (internalConnectionState == "SCANNING") internalConnectionState = "DEVICE_FOUND"
        emitDiscovered(merged)
        emitState()
    }

    private fun mergeCandidate(candidate: Candidate): Candidate {
        val identity = candidateIdentity.observe(candidate.transport, candidate.address, candidate.midiDeviceInfo?.id,
            candidate.source, candidate.id)
        val previous = candidates[identity.id]
            ?: candidates.values.firstOrNull { candidate.midiDeviceInfo != null && it.midiDeviceInfo?.id == candidate.midiDeviceInfo.id }
        candidates.entries.removeAll { it.key != identity.id && candidate.midiDeviceInfo != null && it.value.midiDeviceInfo?.id == candidate.midiDeviceInfo.id }
        val merged = candidate.copy(id = identity.id, address = identity.address,
            bluetoothDevice = candidate.bluetoothDevice ?: previous?.bluetoothDevice,
            midiDeviceInfo = candidate.midiDeviceInfo ?: previous?.midiDeviceInfo,
            outputPorts = if (candidate.midiDeviceInfo != null) candidate.outputPorts else previous?.outputPorts ?: candidate.outputPorts,
            discoveryOrigins = identity.discoveryOrigins,
            source = if ("bleScan" in identity.discoveryOrigins) "bleScan" else candidate.source)
        candidates[identity.id] = merged
        return merged
    }

    private fun invalidateCandidateInfo(infoId: Int) {
        val relatedIds = candidateIdentity.invalidate(infoId).map { it.id }.toSet()
        candidates.values.filter { it.midiDeviceInfo?.id == infoId || it.id in relatedIds }.toList().forEach {
            if (it.transport == "bluetooth" && it.bluetoothDevice != null) candidates[it.id] = it.copy(midiDeviceInfo = null)
            else candidates.remove(it.id)
        }
    }

    private fun finishOpen(candidate: Candidate, opened: MidiDevice?, requestedPort: Int?, generation: Long, openEpoch: Long, call: PluginCall) {
        if (opened == null) {
            setError("Android MidiManager returned no device from open request")
            call.resolve(buildState())
            return
        }
        val outputPorts = opened.info.ports.filter {
            it.type == MidiDeviceInfo.PortInfo.TYPE_OUTPUT
        }
        if (outputPorts.isEmpty()) {
            tryClose(opened)
            setError("Opened MIDI device exposes no piano output port", "NO_OUTPUT_PORT")
            call.resolve(buildState())
            return
        }
        // BLE advertisements do not know their ports until open; retain discovered port metadata.
        mergeCandidate(candidate.copy(midiDeviceInfo = opened.info, outputPorts = outputPorts))
        val portNumber = MidiInputConnectionPolicy.selectOutputPort(outputPorts.map { it.portNumber }, requestedPort)
        if (portNumber == null) {
            tryClose(opened)
            closeConnectionResources()
            internalConnectionState = "IDLE"
            reasonCode = if (requestedPort == null) "PORT_SELECTION_REQUIRED" else "INVALID_PORT"
            emitState()
            call.resolve(buildState())
            return
        }
        val outputPort = opened.openOutputPort(portNumber)
        if (outputPort == null) {
            tryClose(opened)
            setError("Android could not open the piano MIDI output port")
            call.resolve(buildState())
            return
        }
        try {
            midiReceiver = createReceiver(candidate, portNumber, generation)
            outputPort.connect(midiReceiver!!)
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
        connectedPortNumber = portNumber
        connectedTransport = candidate.transport
        internalConnectionState = "CONNECTED"
        deliveryEnabled = MidiInputConnectionPolicy.openDeliveryAllowed(openEpoch, deliveryEpoch, appPaused, deliveryEnabled)
        lastError = null
        reasonCode = null
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
        connectionPolicy.invalidate()
        deliveryEpoch += 1
        try {
            midiReceiver?.let { midiOutputPort?.disconnect(it) }
        } catch (_: IOException) {
            // Continue closing all handles.
        }
        if (connectedTransport == "bluetooth") connectedMidiInfoId?.let(::invalidateCandidateInfo)
        tryClose(midiOutputPort)
        tryClose(midiDevice)
        midiOutputPort = null
        midiDevice = null
        connectedMidiInfoId = null
        connectedPortNumber = null
        midiReceiver = null
        deliveryEnabled = false
    }

    private fun scanError(message: String) {
        stopScanInternal()
        if (midiDevice != null || internalConnectionState == "CONNECTING") {
            lastError = message // diagnostics only; a discovery error must not kill the active input
            emitState()
        } else setError(message, "SCAN_FAILED")
    }

    private fun setError(message: String, code: String = "OPEN_FAILED") {
        stopScanInternal()
        closeConnectionResources()
        internalConnectionState = "ERROR"
        lastError = message
        reasonCode = code
        emitState()
    }

    private fun isSupported(): Boolean {
        return isMidiSupported() &&
            bluetoothAdapter != null &&
            context.packageManager.hasSystemFeature(PackageManager.FEATURE_MIDI) &&
            context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)
    }

    private fun isMidiSupported(): Boolean = midiManager != null &&
        context.packageManager.hasSystemFeature(PackageManager.FEATURE_MIDI)

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

    private fun publicConnectionState(): String = if (connectedTransport == "usb" || internalConnectionState == "CONNECTED") {
        internalConnectionState
    } else if (isMidiSupported() && internalConnectionState !in listOf("CONNECTING", "DISCONNECTED", "ERROR")) {
        if (scanning) "SCANNING" else if (candidates.isNotEmpty()) "DEVICE_FOUND" else "IDLE"
    } else BluetoothMidiStatePolicy.publicConnectionState(
        isSupported(),
        currentPermissionState(),
        isBluetoothEnabled(),
        internalConnectionState
    )

    private fun buildState(): JSObject {
        val state = JSObject()
        val supported = isSupported()
        state.put("supported", isMidiSupported())
        state.put("capabilities", JSObject().apply {
            put("bluetooth", JSObject().apply {
                put("supported", supported)
                put("available", environmentBlockState() == null)
                put("reason", environmentBlockState())
            })
            put("usb", JSObject().apply {
                put("supported", isMidiSupported())
                put("available", isMidiSupported())
                put("reason", if (isMidiSupported()) null else "UNSUPPORTED")
            })
        })
        state.put("connectionGeneration", connectionPolicy.generation)
        state.put("deliveryEpoch", deliveryEpoch)
        state.put("stateRevision", ++stateRevision)
        state.put("scanning", scanning)
        state.put("reasonCode", reasonCode)
        val active = candidates[connectedDeviceId]
        if (active != null && connectedPortNumber != null && internalConnectionState == "CONNECTED") {
            state.put("activeInput", identityToJs(active, connectedPortNumber!!, connectionPolicy.generation))
        }
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
        result.put("transport", candidate.transport)
        result.put("outputPorts", JSArray(candidate.outputPorts
            .map { port -> JSObject().apply {
                put("portNumber", port.portNumber)
                put("name", port.name?.takeIf { it.isNotBlank() } ?: "MIDI 输入 ${port.portNumber + 1}")
            } }))
        result.put("address", candidate.address)
        result.put("manufacturer", candidate.manufacturer)
        result.put("product", candidate.product)
        result.put("source", candidate.source)
        result.put("discoveryOrigins", JSArray(candidate.discoveryOrigins.toList()))
        result.put("serviceUuids", JSArray(candidate.serviceUuids))
        return result
    }

    private fun identityToJs(candidate: Candidate, portNumber: Int, generation: Long): JSObject = JSObject().apply {
        put("transport", candidate.transport)
        put("deviceId", candidate.id)
        put("portNumber", portNumber)
        put("connectionGeneration", generation)
        put("displayName", candidate.name)
        put("manufacturer", candidate.manufacturer)
        put("product", candidate.product)
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
