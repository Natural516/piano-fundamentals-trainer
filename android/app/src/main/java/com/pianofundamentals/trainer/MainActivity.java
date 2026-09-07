package com.pianofundamentals.trainer;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AndroidBluetoothMidiPlugin.class);
        registerPlugin(AndroidUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
