package com.pianofundamentals.trainer

import java.util.Locale

/** Main-handler discovery identities. Names/manufacturers are deliberately not identity inputs. */
internal class MidiCandidateIdentityPolicy {
    data class Entry(val transport: String, val address: String?, val infoId: Int)
    data class Identity(
        val id: String, val transport: String, val address: String?, val infoId: Int?,
        val discoveryOrigins: Set<String>
    )
    private val identities = linkedMapOf<String, Identity>()
    private val invalidInfoIds = mutableSetOf<Int>()

    private fun address(transport: String, value: String?): String? =
        if (transport == "bluetooth") value?.takeIf { it.isNotBlank() }?.uppercase(Locale.ROOT) else null

    private fun candidateId(transport: String, address: String?, infoId: Int?, fallbackId: String): String =
        address(transport, address)
            ?: identities.values.firstOrNull { it.transport == transport && infoId != null && it.infoId == infoId }?.id
            ?: fallbackId

    fun observe(transport: String, address: String?, infoId: Int?, origin: String, fallbackId: String): Identity {
        val id = candidateId(transport, address, infoId, fallbackId)
        val related = identities.values.filter {
            it.id == id || (it.transport == transport && infoId != null && it.infoId == infoId)
        }
        val identity = Identity(id, transport, address(transport, address) ?: related.firstOrNull()?.address,
            infoId ?: related.firstOrNull()?.infoId, related.flatMap { it.discoveryOrigins }.toSet() + origin)
        related.filter { it.id != id }.forEach { identities.remove(it.id) }
        identities[id] = identity
        return identity
    }

    fun isInvalid(infoId: Int): Boolean = infoId in invalidInfoIds
    fun deviceAdded(infoId: Int) { invalidInfoIds.remove(infoId) }

    /** Keep a stable Bluetooth address, but never keep its removed/open-then-closed handle. */
    fun invalidate(infoId: Int): List<Identity> {
        invalidInfoIds.add(infoId)
        val affected = identities.values.filter { it.infoId == infoId }
        affected.forEach {
            if (it.transport == "bluetooth" && it.address != null) identities[it.id] = it.copy(infoId = null)
            else identities.remove(it.id)
        }
        return affected
    }

    fun freshNativeId(selectedId: String, visible: List<Entry>): Int? = visible.firstOrNull {
        !isInvalid(it.infoId) && candidateId(it.transport, it.address, it.infoId, "midi:${it.infoId}") == selectedId
    }?.infoId
}
