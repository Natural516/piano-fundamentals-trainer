package com.pianofundamentals.trainer

import org.junit.Assert.assertEquals
import org.junit.Test

class BluetoothMidiStatePolicyTest {
    @Test
    fun permissionAliasChangesAtAndroid12() {
        assertEquals("legacyLocation", BluetoothMidiStatePolicy.permissionAlias(30))
        assertEquals("nearbyDevices", BluetoothMidiStatePolicy.permissionAlias(31))
        assertEquals("nearbyDevices", BluetoothMidiStatePolicy.permissionAlias(36))
    }

    @Test
    fun permissionStatesDistinguishRequiredDeniedAndGranted() {
        assertEquals("UNSUPPORTED", BluetoothMidiStatePolicy.permissionState(false, "granted", false))
        assertEquals("REQUIRED", BluetoothMidiStatePolicy.permissionState(true, "prompt", false))
        assertEquals("REQUIRED", BluetoothMidiStatePolicy.permissionState(true, "denied", false))
        assertEquals("DENIED", BluetoothMidiStatePolicy.permissionState(true, "denied", true))
        assertEquals("DENIED", BluetoothMidiStatePolicy.permissionState(true, "prompt-with-rationale", true))
        assertEquals("GRANTED", BluetoothMidiStatePolicy.permissionState(true, "granted", true))
    }

    @Test
    fun environmentBlocksPrecedeTransportState() {
        assertEquals("UNSUPPORTED", BluetoothMidiStatePolicy.publicConnectionState(false, "UNSUPPORTED", false, "IDLE"))
        assertEquals("PERMISSION_REQUIRED", BluetoothMidiStatePolicy.publicConnectionState(true, "REQUIRED", true, "IDLE"))
        assertEquals("PERMISSION_DENIED", BluetoothMidiStatePolicy.publicConnectionState(true, "DENIED", true, "IDLE"))
        assertEquals("BLUETOOTH_OFF", BluetoothMidiStatePolicy.publicConnectionState(true, "GRANTED", false, "IDLE"))
        assertEquals("CONNECTED", BluetoothMidiStatePolicy.publicConnectionState(true, "GRANTED", true, "CONNECTED"))
    }
}
