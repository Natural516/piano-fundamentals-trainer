package com.pianofundamentals.trainer

import org.junit.Assert.*
import org.junit.Test

class MidiInputConnectionPolicyTest {
    @Test fun openCompletionCannotUndoDeliverySuspension() {
        assertTrue(MidiInputConnectionPolicy.openDeliveryAllowed(4, 4, false))
        assertFalse(MidiInputConnectionPolicy.openDeliveryAllowed(4, 5, false))
        assertFalse(MidiInputConnectionPolicy.openDeliveryAllowed(4, 4, true))
        assertTrue(MidiInputConnectionPolicy.openDeliveryAllowed(4, 6, false, true))
        assertFalse(MidiInputConnectionPolicy.openDeliveryAllowed(4, 6, true, true))
    }
    @Test fun lateOpenAndReceiverTokensCannotCrossConnections() {
        val policy = MidiInputConnectionPolicy()
        val capturedOpen = policy.invalidate()
        assertTrue(policy.isCurrent(capturedOpen))
        val next = policy.invalidate()
        assertFalse(policy.isCurrent(capturedOpen))
        assertTrue(policy.isCurrent(next))
    }
    @Test fun reconnectSameDeviceStillAdvancesIdentity() {
        val policy = MidiInputConnectionPolicy()
        val old = policy.invalidate()
        policy.invalidate()
        assertFalse(policy.isCurrent(old))
    }
    @Test fun bluetoothOffDoesNotAffectUsbOrUnselectedInput() {
        assertFalse(MidiInputConnectionPolicy.bluetoothLossAffectsActive("usb"))
        assertFalse(MidiInputConnectionPolicy.bluetoothLossAffectsActive(null))
        assertTrue(MidiInputConnectionPolicy.bluetoothLossAffectsActive("bluetooth"))
    }
    @Test fun removalIsIdentityBasedNotDeviceName() {
        assertTrue(MidiInputConnectionPolicy.removalAffectsActive("usb:1", "usb:1", 1, null))
        assertFalse(MidiInputConnectionPolicy.removalAffectsActive("usb:2", "usb:1", 2, 1))
        assertTrue(MidiInputConnectionPolicy.removalAffectsActive("midi:7", "ble:address", 7, 7))
    }
    @Test fun singleOutputMayBeAutomatic() { assertEquals(3, MidiInputConnectionPolicy.selectOutputPort(listOf(3), null)) }
    @Test fun multipleOutputsNeedSelection() { assertNull(MidiInputConnectionPolicy.selectOutputPort(listOf(0, 3), null)) }
    @Test fun selectedPortMustExist() {
        assertEquals(3, MidiInputConnectionPolicy.selectOutputPort(listOf(0, 3), 3))
        assertNull(MidiInputConnectionPolicy.selectOutputPort(listOf(0, 3), 9))
    }
    @Test fun noOutputCannotConnect() { assertNull(MidiInputConnectionPolicy.selectOutputPort(emptyList(), null)) }

    @Test fun bleAndManagerReconcileByAddressAndRetainBothOrigins() {
        val policy = MidiCandidateIdentityPolicy()
        val ble = policy.observe("bluetooth", "aa:bb:cc:dd:ee:01", null, "bleScan", "ble:1")
        val manager = policy.observe("bluetooth", "AA:BB:CC:DD:EE:01", 7, "midiManager", "midi:7")
        assertEquals(ble.id, manager.id)
        assertEquals(setOf("bleScan", "midiManager"), manager.discoveryOrigins)
        assertEquals(7, manager.infoId)
    }
    @Test fun reverseDiscoveryOrderUsesSamePhysicalIdentity() {
        val policy = MidiCandidateIdentityPolicy()
        val manager = policy.observe("bluetooth", "AA:BB:CC:DD:EE:01", 7, "midiManager", "midi:7")
        val ble = policy.observe("bluetooth", "AA:BB:CC:DD:EE:01", null, "bleScan", "ble:1")
        assertEquals(manager.id, ble.id)
        assertEquals(7, ble.infoId)
        assertEquals(setOf("bleScan", "midiManager"), ble.discoveryOrigins)
    }
    @Test fun differentAddressesCannotMergeEvenIfDisplayNamesAreIdentical() {
        val policy = MidiCandidateIdentityPolicy()
        // Display names are not accepted by this identity API at all.
        val first = policy.observe("bluetooth", "AA:BB:CC:DD:EE:01", 7, "midiManager", "midi:7")
        val second = policy.observe("bluetooth", "AA:BB:CC:DD:EE:02", 8, "midiManager", "midi:8")
        assertNotEquals(first.id, second.id)
        assertEquals(7, policy.freshNativeId(first.id, listOf(
            MidiCandidateIdentityPolicy.Entry("bluetooth", first.address, 7),
            MidiCandidateIdentityPolicy.Entry("bluetooth", second.address, 8))))
    }
    @Test fun removalInvalidatesHandleButRetainsStableBluetoothIdentity() {
        val policy = MidiCandidateIdentityPolicy()
        val original = policy.observe("bluetooth", "AA:BB:CC:DD:EE:01", 7, "midiManager", "midi:7")
        assertEquals(listOf(original), policy.invalidate(7))
        assertTrue(policy.isInvalid(7))
        val retained = policy.observe("bluetooth", original.address, null, "bleScan", "ble:1")
        assertEquals(original.id, retained.id)
        assertNull(retained.infoId)
    }
    @Test fun staleStillVisibleSystemHandleCannotBeSelectedForReconnect() {
        val policy = MidiCandidateIdentityPolicy()
        val device = policy.observe("bluetooth", "AA:BB:CC:DD:EE:01", 7, "midiManager", "midi:7")
        policy.invalidate(7)
        assertNull(policy.freshNativeId(device.id, listOf(MidiCandidateIdentityPolicy.Entry("bluetooth", device.address, 7))))
        assertNull(policy.freshNativeId(device.id, emptyList())) // native uses BluetoothDevice fallback
    }
    @Test fun freshSystemEntryUpdatesNativeMetadataWithoutChangingProductIdentity() {
        val policy = MidiCandidateIdentityPolicy()
        val original = policy.observe("bluetooth", "AA:BB:CC:DD:EE:01", 7, "midiManager", "midi:7")
        policy.invalidate(7)
        val fresh = MidiCandidateIdentityPolicy.Entry("bluetooth", original.address, 8)
        assertEquals(8, policy.freshNativeId(original.id, listOf(fresh)))
        val updated = policy.observe(fresh.transport, fresh.address, fresh.infoId, "midiManager", "midi:8")
        assertEquals(original.id, updated.id)
        assertEquals(8, updated.infoId)
    }
    @Test fun missingBluetoothRelationshipDoesNotGuessByName() {
        val policy = MidiCandidateIdentityPolicy()
        val first = policy.observe("bluetooth", null, 7, "midiManager", "midi:7")
        val second = policy.observe("bluetooth", null, 8, "midiManager", "midi:8")
        assertNotEquals(first.id, second.id)
        assertNotEquals(first.id, policy.observe("bluetooth", "AA:BB:CC:DD:EE:01", null, "bleScan", "ble:1").id)
    }
    @Test fun openedNativeRelationshipReconcilesAnInitiallyUnassociatedEntry() {
        val policy = MidiCandidateIdentityPolicy()
        policy.observe("bluetooth", null, 7, "midiManager", "midi:7")
        val opened = policy.observe("bluetooth", "AA:BB:CC:DD:EE:01", 7, "bleScan", "ble:1")
        val subsequent = policy.observe("bluetooth", null, 7, "midiManager", "midi:7")
        assertEquals(opened.id, subsequent.id)
        assertEquals(setOf("bleScan", "midiManager"), subsequent.discoveryOrigins)
        assertEquals(7, policy.freshNativeId(opened.id, listOf(MidiCandidateIdentityPolicy.Entry("bluetooth", null, 7))))
    }
    @Test fun usbIdentityIsNeverMergedByBluetoothAddressOrDisplayMetadata() {
        val policy = MidiCandidateIdentityPolicy()
        val bluetooth = policy.observe("bluetooth", "AA:BB:CC:DD:EE:01", 7, "midiManager", "midi:7")
        val usb = policy.observe("usb", bluetooth.address, 8, "midiManager", "midi:8")
        val otherUsb = policy.observe("usb", bluetooth.address, 9, "midiManager", "midi:9")
        assertEquals("midi:8", usb.id)
        assertNull(usb.address)
        assertNotEquals(bluetooth.id, usb.id)
        assertNotEquals(usb.id, otherUsb.id)
        policy.invalidate(7)
        assertEquals(8, policy.freshNativeId(usb.id, listOf(MidiCandidateIdentityPolicy.Entry("usb", null, 8))))
    }
    @Test fun removedUsbCannotUseCachedIdentityButNewAddCanReuseNativeId() {
        val policy = MidiCandidateIdentityPolicy()
        val usb = policy.observe("usb", null, 8, "midiManager", "midi:8")
        policy.invalidate(8)
        assertNull(policy.freshNativeId(usb.id, listOf(MidiCandidateIdentityPolicy.Entry("usb", null, 8))))
        policy.deviceAdded(8)
        assertEquals(8, policy.freshNativeId(usb.id, listOf(MidiCandidateIdentityPolicy.Entry("usb", null, 8))))
    }
}
