# Android Tablet V1 UI Prototype

Static, mock-data-only UI prototype for the Android-first personal edition.

## Target device

DEVICE-001 is the only required Android V1 layout target:

- Lenovo Xiaoxin Pad Pro 12.7
- 12.7-inch, 2944 x 1840 physical panel
- Landscape, placed on a Roland FP-30X music stand
- Measured browser viewport: approximately 1385 x 731
- Measured usable viewport: approximately 1385 x 715
- Measured device pixel ratio: 2.125
- Measured screen dimensions: approximately 1386 x 866

Real-device Human UI Review passed with this environment. These measurements
are the approved Android A1 visual-QA baseline, not permanent physical CSS
dimensions. The prototype uses viewport-aware sizing and safe-area insets; it
does not hardcode the panel resolution or the measured usable height.

After an APK/WebView shell exists, record a second real-app viewport baseline
if Android system chrome or WebView insets differ from this browser baseline.

## Approved visual direction

Android A1 Human UI QA approved the current Home, Sight Reading READY, ACTIVE,
CORRECT, WRONG and RESULT screens, Practice History, Settings, MIDI status and
Update status. Future functional integration must preserve the current page
hierarchy, ACTIVE staff scale and composition, bottom navigation, READY
structure, and RESULT structure unless a new Human UI Review explicitly
approves a material visual change.

## Run

From `C:\Projects\piano-android-tablet-v1`:

```powershell
npm.cmd install
npm.cmd run prototype:android
```

Open the URL printed by Vite. For a tablet on the same LAN, use the Network URL.

In development builds, open the floating `A1 · MOCK` control to see
`window.innerWidth`, `window.innerHeight`, `window.devicePixelRatio`, screen
dimensions, visual/usable viewport dimensions, and safe-area inset readings.
This diagnostic is rendered only in development by the `import.meta.env.DEV`
guard and can be removed with the prototype review dock.

## Review states

The floating `A1 · MOCK` control opens the prototype state gallery. It includes:

- Home
- Sight Reading: ready, active, correct feedback, wrong feedback, result
- Practice History
- Settings
- MIDI connection status
- Check for Updates

All numbers, records, device state, and update information are static visual placeholders. The prototype does not connect to MIDI, persistence, the updater, or the Sight Reading session engine.

The existing production notation renderer is imported without modification. No desktop AppShell, sidebar, or practice page is used.
