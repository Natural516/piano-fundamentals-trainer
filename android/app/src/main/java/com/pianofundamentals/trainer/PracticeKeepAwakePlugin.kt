package com.pianofundamentals.trainer

import android.view.WindowManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "PracticeKeepAwake")
class PracticeKeepAwakePlugin : Plugin() {
    private var enabled = false

    @PluginMethod
    fun setEnabled(call: PluginCall) {
        val requested = call.getBoolean("enabled")
        if (requested == null) {
            call.reject("enabled is required")
            return
        }

        val currentActivity = activity
        if (currentActivity == null) {
            call.reject("activity unavailable")
            return
        }

        currentActivity.runOnUiThread {
            applyWindowFlag(requested)
            val result = JSObject()
            result.put("enabled", enabled)
            call.resolve(result)
        }
    }

    override fun handleOnPause() {
        releaseForLifecycle()
    }

    override fun handleOnDestroy() {
        releaseForLifecycle()
    }

    private fun applyWindowFlag(requested: Boolean) {
        if (enabled == requested) return
        if (requested) {
            activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        enabled = requested
    }

    private fun releaseForLifecycle() {
        enabled = false
        activity?.runOnUiThread {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }
}
