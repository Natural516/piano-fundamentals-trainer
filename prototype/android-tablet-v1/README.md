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

The shell does not contain Bluetooth/MIDI discovery, pairing, permissions, or
input code. Settings and reports remain in memory. History, MIDI, and Update
remain the approved Mock surfaces.

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
