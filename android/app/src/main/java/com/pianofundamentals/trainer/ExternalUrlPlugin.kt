package com.pianofundamentals.trainer

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "ExternalUrl")
class ExternalUrlPlugin : Plugin() {
    @PluginMethod
    fun openSourceRepository(call: PluginCall) {
        val activity = activity
        if (activity == null) {
            call.reject("activity unavailable")
            return
        }

        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(SOURCE_REPOSITORY_URL)).apply {
            addCategory(Intent.CATEGORY_BROWSABLE)
        }
        try {
            activity.startActivity(intent)
            call.resolve()
        } catch (_: ActivityNotFoundException) {
            call.reject("no browser available")
        }
    }

    private companion object {
        const val SOURCE_REPOSITORY_URL = "https://github.com/Natural516/piano-fundamentals-trainer"
    }
}
