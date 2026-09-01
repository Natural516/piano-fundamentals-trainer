# Android Tablet V1 UI Prototype

Android-first personal-edition UI prototype. A2.2 connects the approved Sight
Reading surfaces to the real shared headless implementation while retaining
mock device/update surfaces.

## Target device

DEVICE-001 is the only required Android V1 layout target:

- Lenovo Xiaoxin Pad Pro 12.7
- 12.7-inch, 2944 x 1840 physical panel
- Landscape, placed on a Roland FP-30X music stand
- Measured browser viewport: approximately 1385 x 731
- Measured usable viewport: approximately 1385 x 715
- Measured device pixel ratio: 2.125
- Measured screen dimensions: approximately 1386 x 866

Real-device Human UI Review passed with this browser environment. These values
remain the historical Android A1 browser baseline, not permanent physical CSS
dimensions.

DEVICE-001-APP is the authoritative Android production visual-QA baseline:

- Installed native DEBUG APK / WebView
- Landscape
- `window.innerWidth`: 1385
- `window.innerHeight`: 866
- Visual viewport: 1385 x 866
- Usable viewport: 1385 x 866
- Screen dimensions: approximately 1386 x 866
- Device pixel ratio: 2.125
- Safe-area insets: 0 / 0 / 0 / 0

This native-app baseline supersedes the older Chrome/browser viewport as the
primary Android V1 visual target. The measurements are a visual-regression
reference, not hardcoded CSS dimensions. The additional native WebView height
does not authorize a redesign of the approved composition.

## Approved visual direction

Android A1 Human UI QA approved the current Home, Sight Reading READY, ACTIVE,
CORRECT, WRONG and RESULT screens, Practice History, Settings, MIDI status and
Update status. Android A2 UI Contract Delta 1 retains that visual structure and
adds only the reviewed Sight Reading contract states and copy listed below.
Future functional integration must preserve the current page hierarchy, ACTIVE
staff scale and composition, bottom navigation, READY structure, and RESULT
structure unless a new Human UI Review explicitly approves a material visual
change.

Android A3.0 real-device Human QA also approved this composition inside the
installed native APK. Bluetooth MIDI, storage, and updater work must preserve
it; material changes require a new Human UI Review.

## Android A2 Sight Reading UI contract

The Android V1 mock intentionally uses these defaults:

- Grand staff
- C Major
- Diatonic/key-signature notes only
- 20 questions
- Fixed five-second answer limit
- Target note name hidden before judgement

The Android V1 product contract retains treble, bass and grand staff;
the existing 15 major keys; diatonic and chromatic note pools; 10, 20, 50 and
100-question rounds; and the note-name visibility option. The timeout remains
fixed at five seconds. These rows are represented in the existing grouped-card
Settings composition and, in A2.2, bind to the shared controller for the next
in-memory session.

The READY device copy does not imply a preflight-key requirement. TIMEOUT uses
the same ACTIVE geometry with neutral notation and restrained warning feedback.
The ACTIVE metric strip contains completed, correct, wrong, timeout, current
streak and accuracy. Early end builds a real partial report with
`completionState = stopped` and `partialEvidence = true`, stored only in the
current in-memory development repository. RESULT uses the completed real report
and identifies one primary error-prone note without inventing a top-two ranking
contract.

## A2.2 real integration boundary

The following now come from `src/sightReading` rather than mock values:

- Android defaults and in-memory setting changes
- question pool, shuffled bag, key-aware spelling and staff assignment
- 32 ms input lock, first NOTE_ON judgement, 5-second timeout and 350 ms feedback
- progress, accuracy, streak, reaction time and target-note aggregation
- pause/resume, completed report and stopped partial report

The floating development dock provides `答对`, `答错`, and exact MIDI-number
actions. They emit monotonically numbered normalized MIDI events into the same
shared controller entry point intended for a future platform MIDI adapter; they
do not call answer methods directly. There is deliberately no timeout shortcut.

A2.2 does **not** implement Bluetooth MIDI, Kotlin/native plugins, persistent
Android storage, app lifecycle integration, updater behavior, APK signing, or
another exercise module. MIDI connection and update pages remain clearly
labelled Mock surfaces. History continues showing its approved mock content.

## Run

From `C:\Projects\piano-android-tablet-v1`:

```powershell
npm.cmd install
npm.cmd run prototype:android
```

Open the URL printed by Vite. For a tablet on the same LAN, use the Network URL.

In development builds, open the floating `A2.2 · DEV` control to send simulated
MIDI and inspect in-memory report count. The same panel shows `window.innerWidth`,
`window.innerHeight`, `window.devicePixelRatio`, screen
dimensions, visual/usable viewport dimensions, and safe-area inset readings.
This diagnostic is rendered only in development by the `import.meta.env.DEV`
guard and can be removed with the prototype review dock.

## Review states

The floating `A2.2 · DEV` control opens the prototype state gallery. It includes:

- Home
- Sight Reading: ready, active, correct feedback, wrong feedback, timeout
  feedback, early-end confirmation, result
- Practice History
- Settings
- MIDI connection status
- Check for Updates

Sight Reading question, feedback, metric and result values are real shared
session data. History, device state and update information remain visual
placeholders. Reports and settings exist only in memory and reset on reload.

The existing production notation renderer is imported without modification. No desktop AppShell, sidebar, or practice page is used.

## DEVICE-001 Human QA steps

Use the Lenovo Xiaoxin Pad Pro 12.7 in landscape on the same LAN as the
development PC.

1. From `C:\Projects\piano-android-tablet-v1`, run
   `npm.cmd run prototype:android`, then open Vite's Network URL on the tablet.
2. Confirm the viewport diagnostic is close to the approved DEVICE-001 browser
   baseline (approximately 1385 x 731, DPR 2.125) and that Home, READY, ACTIVE,
   feedback, and RESULT preserve the approved composition without page scroll.
3. In Settings, verify all three staves, all 15 major keys, both note-pool
   modes, 10/20/50/100 questions, and the note-name switch. Start the next
   round and confirm READY and ACTIVE use the selected staff, key, count, and
   note-name policy.
4. Open `A2.2 · DEV`. During the answering phase, use `答对`, `答错`, and an
   exact MIDI note number. Confirm the notation, feedback, six metrics, and
   next question all come from the resulting session facts. The controls are
   intentionally unavailable during the 32 ms display lock and 350 ms
   feedback phase.
5. For timeout, send no event. Confirm neutral timeout feedback appears after
   the real fixed five-second timer and advances after 350 ms. There is no
   simulated timeout shortcut.
6. Pause once immediately after a new question appears and once during the
   answer window. Confirm the notation remains visible, simulated MIDI cannot
   answer while paused, and the remaining phase time continues after resume.
7. End a partially completed round, inspect the confirmation facts, choose
   `结束并保存`, and confirm the DEV dock shows one in-memory `stopped` report
   with the completed-question count. Reloading the page should clear it.
8. Set a 10-question round and answer all ten through simulated MIDI. Confirm
   RESULT shows the real completed report, including correct/wrong/timeout,
   accuracy, best streak, nullable reaction time, and at most one primary
   error-prone note.
9. Open MIDI status and Update. Confirm both explicitly identify themselves as
   Mock and never imply that Bluetooth MIDI, updater, or Android persistence is
   implemented.

This A2.2 review uses simulated MIDI only. Do not include real FP-30X Bluetooth
pairing or persistence in the acceptance result for this phase.

## A3.0 native Android shell

A3.0 packages this same approved React application and shared Sight Reading
runtime in a thin Capacitor Android shell. The stable Android identity is:

- Display name: `钢琴基本功训练器`
- Application ID: `com.pianofundamentals.trainer`
- Platform: Capacitor Android 8.5.0
- Minimum Android API: 24
- Compile/target API: 36
- Orientation: landscape
- Signing: Android DEBUG signing only

At the approved A3.0 checkpoint, the shell did not contain Bluetooth/MIDI
discovery, pairing, permissions, or input code. Settings and reports remain in
memory. A3.1 replaces only the MIDI Mock surface; History and Update remain the
approved Mock surfaces.

The Android DEBUG web build uses Vite mode `android-debug`, which keeps the
simulated normalized MIDI controls and the DEVICE-001-APP viewport diagnostic
inside the debug APK. The packaged HTML, JavaScript, CSS, and Bravura notation
font are copied to `android/app/src/main/assets/public`; there is no Vite,
localhost, development-PC, CDN, or network runtime dependency.

Android Back is intentionally minimal:

- ACTIVE/CORRECT/WRONG/TIMEOUT opens the existing early-end confirmation.
- Back from that confirmation cancels the stop and resumes the live session.
- Back from a page opened while a session is still running returns to the live
  practice state.
- Normal detail pages return to their existing parent screen.
- Back on Home minimizes the app.

This is not the final Android lifecycle/recovery contract.

### A3.0 real-device approval

Android A3.0 native-shell Human QA passed on DEVICE-001 in landscape. The
installed DEBUG APK launched cold without Chrome or a Vite server, worked
offline, preserved the approved Home/READY/ACTIVE composition and readable
notation, completed the simulated correct/wrong/timeout, pause/resume,
early-end and RESULT flows, and survived background/foreground and screen
lock/unlock checks. MIDI remains explicitly marked Mock.

The APK remains DEBUG signed. `SIGN-001` tracks the required permanent release
signing work before persistent real-user data or updater-compatible release
distribution; A3.0 finalization does not create a release keystore.

### Build the debug APK

Prerequisites are Node.js 22+, JDK 21, Android SDK Platform 36, and Android SDK
Build Tools. Set `JAVA_HOME` and `ANDROID_HOME`, then run from the repository
root:

```powershell
npm.cmd install
npm.cmd run android:apk:debug
npm.cmd run test:android-shell
```

The output is:

`C:\Projects\piano-android-tablet-v1\android\app\build\outputs\apk\debug\app-debug.apk`

### Install on DEVICE-001

Either copy `app-debug.apk` to the Lenovo tablet and open it after allowing
installation from that file-manager source, or enable Developer options and
USB debugging and run:

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" devices
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r "C:\Projects\piano-android-tablet-v1\android\app\build\outputs\apk\debug\app-debug.apk"
```

Launch `钢琴基本功训练器` directly from the Android launcher. Open the floating
`A3.0 · DEBUG` dock and record all `DEVICE-001-APP viewport` values. Verify the
approved Home/READY/ACTIVE composition and notation, simulated correct/wrong,
the natural five-second timeout, pause/resume, early end, and a complete
10-question RESULT. Then test background/foreground, lock/unlock, and a cold
launch with Wi-Fi disabled. These device checks are Human QA; A3.0 does not
claim final Android lifecycle recovery semantics.

## A3.1 FP-30X Bluetooth MIDI

A3.1 adds a receive-only Android native MIDI path without changing the shared
Sight Reading controller or the approved ACTIVE composition:

```text
FP-30X BLE MIDI advertisement
  -> Android BluetoothLeScanner (standard MIDI service UUID only)
  -> MidiManager.openBluetoothDevice / openDevice
  -> piano MidiDevice output port
  -> Android MidiReceiver byte-stream chunks
  -> AndroidBluetoothMidiPlugin (Capacitor Kotlin)
  -> AndroidBluetoothMidiAdapter
  -> JS Clock timestamp + process-wide monotonic event ID
  -> normalized SightReadingMidiEvent
  -> SightReadingController.handleMidi()
```

The native `System.nanoTime()` value is retained only in DEBUG diagnostics.
Judgement timestamps are assigned at bridge receipt using the same
`performance.now()` clock as the shared controller, so clock epochs are never
mixed. The TypeScript byte-stream parser handles partial callbacks, multiple
messages, running status and interleaved real-time bytes. NOTE_ON velocity zero
is normalized to NOTE_OFF; CC64 reaches the existing control-change contract
and remains ignored by Sight Reading judgement.

The Android 12+ permission set is limited to `BLUETOOTH_SCAN` and
`BLUETOOTH_CONNECT`; scan declares `neverForLocation`. API 24-30 uses legacy
Bluetooth declarations and runtime `ACCESS_FINE_LOCATION`, all capped at API
30. The app does not request Bluetooth advertise, background location, audio,
camera, storage or unrelated permissions.

The plugin scans only the standard BLE MIDI service UUID
`03B80E5A-EDE8-4B33-A751-6CE34EC4C700`, also enumerates Bluetooth MIDI devices
already visible to MidiManager, and opens only the piano's MIDI output port so
the app receives input. It does not implement BLE GATT MIDI parsing, system
audio pairing, MIDI forwarding, MIDI output, or a software synth.

DEBUG builds retain two explicitly exclusive input modes: `REAL BLUETOOTH MIDI`
and `DEVELOPMENT MIDI`. One process-wide router owns event IDs and accepts only
the selected source. Native builds default to real Bluetooth MIDI; browser
development defaults to DevelopmentMidiAdapter. The DEBUG dock reports
permission/Bluetooth/connection/port state, discovered identity, raw bytes,
native timestamp, normalized event and timestamp, event ID, channel, CC value,
message count and disconnect/reconnect counts.

On disconnect, Bluetooth off, app background or screen lock, a running Sight
Reading session is paused, transient input is cleared, and the watermark is
advanced without scoring or advancing. Reconnect does not resume timing.
After connection and lifecycle validation, the user must explicitly continue.
No last-device identity is persisted in A3.1.

### A3.1 real-hardware Human QA (DEVICE-001 + Roland FP-30X)

Before testing, install the A3.1 DEBUG APK over the A3.0 DEBUG build, launch the
app, open the `A3.1 · DEBUG` dock, and keep the input source on
`真实蓝牙 MIDI`. Do not use the simulated answer buttons during H1-H16.

1. **H1 — Piano already on.** Enable Android Bluetooth and power on the FP-30X
   before launching the app. Open MIDI, grant Nearby devices if requested,
   scan, identify the actual Roland/FP-30X advertisement, connect, and play
   several notes. Confirm the port is OPEN and real activity increments.
2. **H2 — App starts first.** With the piano off, launch the app, then power on
   the FP-30X. Scan and connect without restarting the app.
3. **H3 — Correct answer.** Start Sight Reading, wait for the answer window,
   play the displayed target on the real FP-30X, and confirm CORRECT.
4. **H4 — Wrong answer.** Play a different note and confirm WRONG reports the
   actual played note.
5. **H5 — Timeout.** Play nothing and confirm the real fixed five-second
   TIMEOUT still occurs.
6. **H6 — Fast repeat.** Repeatedly press the same key quickly. In DEBUG verify
   every NOTE_ON receives a distinct increasing event ID.
7. **H7 — Chord/near-simultaneous input.** Play a simple chord. Verify every
   attack is visible and equal timestamps never collapse distinct IDs. Sight
   Reading still judges only the first valid NOTE_ON by its approved contract.
8. **H8 — Pedal.** Press/release the sustain pedal. Confirm CC64 down/up appears
   in DEBUG and never becomes an answer.
9. **H9 — Disconnect during ACTIVE.** While awaiting an answer, power off the
   piano or otherwise break MIDI. Confirm the session pauses, the timeout
   freezes, facts do not change, and there is no phantom answer/advance.
10. **H10 — Reconnect same piano.** Power on/scan/connect the same piano. Before
    continuing, confirm no stale answer appears. Explicitly press Continue and
    finish the current question in the same live session.
11. **H11 — FP-30X power cycle.** From CONNECTED, power the piano off and on,
    then scan/connect/continue without restarting Android.
12. **H12 — Android Bluetooth cycle.** From CONNECTED, turn Android Bluetooth
    off and back on. Confirm clean pause/disconnect, then scan/connect/continue
    without crash or phantom MIDI.
13. **H13 — Pedal disconnect boundary.** Hold CC64 down, disconnect, reconnect,
    release the pedal, and explicitly continue. Confirm no stuck or phantom
    judgement state.
14. **H14 — Background/foreground.** During a live session, background the app,
    play notes and wait more than five seconds, then foreground. Confirm no
    unseen answer or timeout was recorded; explicitly continue.
15. **H15 — Screen lock/unlock.** Repeat H14 using screen lock. Confirm the
    connection state is valid, stale input is rejected and resume is explicit.
16. **H16 — Complete real round.** Complete a 10-question session entirely on
    the FP-30X and verify RESULT correct/wrong/timeout/completed/accuracy facts.

Record for the QA report: Android API level, permission result, actual advertised
name and DEBUG identity, whether the device came from `bleScan` or
`midiManager`, port state, disconnect/reconnect counts, and any native error.
If the standard UUID scan or `MidiManager.openBluetoothDevice()` cannot discover
or open the FP-30X, stop testing and capture scan results, advertised service
UUIDs, MidiManager visibility, permission state and the exact native error.
Do not add a custom BLE-MIDI GATT parser without a separate Human Review.

### A3.1 real-hardware approval

Android A3.1 real-hardware Human QA passed on the personal target hardware:

- Android tablet: Lenovo Xiaoxin Pad Pro 12.7, landscape
- Piano: Roland FP-30X

The real standard BLE MIDI / Android `MidiManager` path was verified for device
discovery and connection, real note input, fast repeated attacks,
near-simultaneous chord input, and CC64 down/up without pedal events becoming
Sight Reading answers. Correct notes, wrong notes with the actual played pitch,
the fixed five-second timeout, and a complete 10-question session all produced
the expected controller facts and RESULT report.

The same hardware review also passed disconnect/reconnect safety, explicit
resume without stale judgement, FP-30X power off/on recovery, Android Bluetooth
off/on recovery, CC64-down disconnect recovery, app background/foreground, and
screen lock/unlock. No app restart, phantom answer, timeout drift, stuck
transient state, or unintended question advance was observed.

This approval proves only the Lenovo Xiaoxin Pad Pro 12.7 and Roland FP-30X
combination. It does not claim compatibility with other tablets or pianos.

The approved Android BLE MIDI discovery path, `MidiManager` integration,
Capacitor Kotlin boundary, byte-stream parser, JS clock-domain timestamps,
process-wide event IDs, source exclusivity, disconnect watermark/reset,
explicit-resume behavior, and `SightReadingController` MIDI contract are now
frozen. The approved Home, READY, ACTIVE, CORRECT, WRONG, TIMEOUT, RESULT, MIDI
page, navigation, and staff scale also remain frozen. These areas require a
demonstrated bug or a new explicit requirement before further changes. A custom
BLE GATT MIDI transport is not warranted by the approved hardware path.

`SIGN-001` remains open at priority P1. Permanent release signing is still
required before persistent real-user data or updater-compatible release
distribution. A3.1 remains DEBUG signed and does not create a release keystore.

## A4.0A release-signing foundation

A4.0A adds only fail-closed release-signing infrastructure, the explicit
Android version source, non-secret configuration templates, and public APK
metadata verification. It does not generate the permanent keystore or produce a
release-signed APK. The user-run interactive key-generation command, private
key location, DEBUG-to-RELEASE migration, verification steps, and backup policy
are maintained in [`android/RELEASE_SIGNING.md`](../../android/RELEASE_SIGNING.md).
