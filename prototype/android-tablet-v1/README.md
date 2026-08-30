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
Update status. Android A2 UI Contract Delta 1 retains that visual structure and
adds only the reviewed Sight Reading contract states and copy listed below.
Future functional integration must preserve the current page hierarchy, ACTIVE
staff scale and composition, bottom navigation, READY structure, and RESULT
structure unless a new Human UI Review explicitly approves a material visual
change.

## Android A2 Sight Reading UI contract

The Android V1 mock intentionally uses these defaults:

- Grand staff
- C Major
- Diatonic/key-signature notes only
- 20 questions
- Fixed five-second answer limit
- Target note name hidden before judgement

The future Android V1 product contract retains treble, bass and grand staff;
the existing 15 major keys; diatonic and chromatic note pools; 10, 20, 50 and
100-question rounds; and the note-name visibility option. The timeout remains
fixed at five seconds. These rows are represented in the existing grouped-card
Settings composition without connecting them to production logic.

The READY device copy does not imply a preflight-key requirement. TIMEOUT uses
the same ACTIVE geometry with neutral notation and restrained warning feedback.
The ACTIVE metric strip contains completed, correct, wrong, timeout, current
streak and accuracy. Early end has a confirmation mock stating that completed
facts will eventually be saved with `completionState = stopped` and
`partialEvidence = true`; this prototype does not perform that persistence.
RESULT identifies one primary error-prone note and does not invent a top-two
ranking contract.

## Run

From `C:\Projects\piano-android-tablet-v1`:

```powershell
npm.cmd install
npm.cmd run prototype:android
```

Open the URL printed by Vite. For a tablet on the same LAN, use the Network URL.

In development builds, open the floating `A2 · MOCK` control to see
`window.innerWidth`, `window.innerHeight`, `window.devicePixelRatio`, screen
dimensions, visual/usable viewport dimensions, and safe-area inset readings.
This diagnostic is rendered only in development by the `import.meta.env.DEV`
guard and can be removed with the prototype review dock.

## Review states

The floating `A2 · MOCK` control opens the prototype state gallery. It includes:

- Home
- Sight Reading: ready, active, correct feedback, wrong feedback, timeout
  feedback, early-end confirmation, result
- Practice History
- Settings
- MIDI connection status
- Check for Updates

All numbers, records, device state, and update information are static visual placeholders. The prototype does not connect to MIDI, persistence, the updater, or the Sight Reading session engine.

The existing production notation renderer is imported without modification. No desktop AppShell, sidebar, or practice page is used.
