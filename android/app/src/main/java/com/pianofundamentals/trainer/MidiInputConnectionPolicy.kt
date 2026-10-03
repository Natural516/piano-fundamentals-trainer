package com.pianofundamentals.trainer

/** Called on the plugin's main handler. Tokens belong to open attempts, not arrivals. */
internal class MidiInputConnectionPolicy {
    var generation: Long = 0
        private set
    fun invalidate(): Long = ++generation
    fun isCurrent(capturedGeneration: Long): Boolean = capturedGeneration == generation

    companion object {
        fun openDeliveryAllowed(capturedEpoch: Long, currentEpoch: Long, appPaused: Boolean, deliveryResumed: Boolean = false): Boolean =
            !appPaused && (capturedEpoch == currentEpoch || deliveryResumed)
        fun bluetoothLossAffectsActive(transport: String?): Boolean = transport == "bluetooth"
        fun removalAffectsActive(removedId: String, selectedId: String?, removedInfoId: Int, activeInfoId: Int?): Boolean =
            removedId == selectedId || removedInfoId == activeInfoId
        fun selectOutputPort(available: List<Int>, requested: Int?): Int? =
            if (requested != null) requested.takeIf { it in available }
            else available.singleOrNull()
    }
}
