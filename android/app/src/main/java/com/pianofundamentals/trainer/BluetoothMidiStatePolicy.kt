package com.pianofundamentals.trainer

internal object BluetoothMidiStatePolicy {
    fun permissionAlias(apiLevel: Int): String = if (apiLevel >= 31) "nearbyDevices" else "legacyLocation"

    fun permissionState(supported: Boolean, platformState: String?, requestAttempted: Boolean): String {
        if (!supported) return "UNSUPPORTED"
        return when (platformState) {
            "granted" -> "GRANTED"
            "prompt" -> "REQUIRED"
            "prompt-with-rationale" -> "DENIED"
            "denied" -> if (requestAttempted) "DENIED" else "REQUIRED"
            else -> "REQUIRED"
        }
    }

    fun publicConnectionState(
        supported: Boolean,
        permissionState: String,
        bluetoothEnabled: Boolean,
        internalState: String
    ): String {
        if (!supported) return "UNSUPPORTED"
        if (permissionState == "REQUIRED") return "PERMISSION_REQUIRED"
        if (permissionState == "DENIED") return "PERMISSION_DENIED"
        if (!bluetoothEnabled) return "BLUETOOTH_OFF"
        return internalState
    }
}
