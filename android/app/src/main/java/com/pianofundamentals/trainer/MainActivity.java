package com.pianofundamentals.trainer;

import android.os.Bundle;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AndroidBluetoothMidiPlugin.class);
        registerPlugin(AndroidUpdaterPlugin.class);
        registerPlugin(PracticeKeepAwakePlugin.class);
        super.onCreate(savedInstanceState);
        applyImmersiveWindowPolicy();
    }

    @Override
    public void onResume() {
        super.onResume();
        applyImmersiveWindowPolicy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyImmersiveWindowPolicy();
        }
    }

    private void applyImmersiveWindowPolicy() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
                getWindow(),
                getWindow().getDecorView()
        );
        controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }
}
