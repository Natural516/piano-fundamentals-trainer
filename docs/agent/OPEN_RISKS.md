# OPEN_RISKS

> This file contains historical and cross-platform entries. The authoritative
> current Android product status is `ANDROID_PROJECT_STATE.md`. In particular,
> legacy Windows/Electron roadmap items below do not select the next Android
> feature stage.

## Android current maintenance and release constraints

### ANDROID-VALIDATION-001 — Icon validation baseline

- Priority: high-priority maintenance
- Status: DIRTY / REVIEWABLE in the validation-baseline repair pass
- The former I03 assertion required committed launcher resources to differ
  from the clean worktree, so it necessarily failed after a correct commit.
- The replacement validates the committed launcher bitmaps and QA previews
  against fixed SHA-256 facts for the approved generated artifacts. Icon bytes
  and product behavior remain unchanged.

### ANDROID-RELEASE-CODE-001 — Consumed public version code

- Current release source: `versionCode=12`, `versionName=1.5.2`.
- Public `versionCode=9`, `versionCode=10`, and `versionCode=11` are already consumed.
- They must never be reused or overwrite the existing `v1.4.0` or `v1.5.0`
  releases.
- The 1.5.1 migration release consumes `versionCode=11`, and the 1.5.2 Settings
  version-display patch consumes `versionCode=12`; every later distributable
  Android build must use `versionCode > 12`.
- Ordinary development must not increment `android/version.properties`; a
  version change requires an explicitly authorized release stage.

### Android medium-term technical debt

The following are maintenance concerns, not current product failures:

- large Android `main.tsx` and stylesheet;
- notation/theme source-path coupling to the renderer tree;
- UI coverage weighted toward source/contract assertions rather than rendered
  visual regression;
- separate Chord Practice and Chord Query theory catalogs;
- no automated public-snapshot export boundary;
- process-local theme selection;
- Gradle future-compatibility warnings;
- production logging configuration review before the next public release.

## Historical and cross-platform risk register

## P0
- None known after automated validation.

## P1
- None known after automated validation.

## P2
- Practice hooks mirror metronome state via render-time refs; same-frame events may see a ~16ms-stale state (within tolerance).

## P3
- Report modal visual layout not yet human-verified.
- No automated browser smoke test in this session (browser tool unavailable).
- AudioContext autoplay policy may keep the context suspended until the first user gesture; 测试发声 and gesture listeners mitigate.

## Closed / diagnosed

### CHORD-CAPTURE-001 — Chord V1 Block Capture Window

- Status: CLOSED / FROZEN FOR CHORD V1
- Frozen contract: `captureWindowMs = 150`.
- Product decision: real FP-30X use confirmed reliable normal block-chord input; the accepted tolerance may occasionally admit a mildly rolled attack.
- No FP-30X calibration, adaptive threshold, device-specific threshold, per-user threshold, or calibration setting is required for Chord V1.
- The Report Detail continues to show measured `blockLandingSpreadMs`; it must never substitute the 150ms capture-window constant.

### MIDI-001 — MIDI / Device Recovery

- Priority: P1
- Status: CLOSED
- F3.1 real Roland FP-30X Human Hardware QA passed startup-connected, hot-plug, active-practice disconnect, reconnect, CC64 disconnect, sleep/resume, power off/on, Score Practice recovery, and Free Practice recovery.
- Confirmed: committed practice facts remain intact, interrupted sessions remain recoverable, reconnect continues correctly, CC64 and internal voices clear, phantom inputs do not remain, judgement stays operational, and Session lifecycle stays correct.

### SIGN-001 — Permanent Android Release Signing

- Discovered: A3.0
- Priority: P1
- Status: CLOSED
- Package identity: `com.pianofundamentals.trainer`; permanent alias: `piano-fundamentals`; versionCode `1`; versionName `1.0`.
- Authoritative public Release certificate SHA-256: `19:3D:A3:16:AE:F6:A2:2F:9C:15:D1:01:9E:25:87:E7:25:85:8A:70:8B:D0:07:7A:D8:58:98:CD:65:57:96:32`.
- Evidence: permanent key established, independent backup completed by the user, Release signing verified, first Release APK passed real-device Human QA, and the one-time DEBUG-to-RELEASE migration completed.
- The keystore and credentials remain external/local-only. Future distributable APKs must keep the same package and signer identity and increment `versionCode`.

### UPDATE-HOST-001 — Public HTTPS Updater Artifacts

- Discovered: Android A4.3A
- Priority: P1
- Status: CLOSED
- Canonical public source and release repository: `https://github.com/Natural516/piano-fundamentals-trainer`.
- Production Manifest endpoint: `https://github.com/Natural516/piano-fundamentals-trainer/releases/latest/download/latest.json`.
- The former split release repository is retired. Maintained clients and all
  future releases use the canonical repository above.
- Closure evidence: the DEVICE-001 real-network Human QA run consumed the public Manifest through the Android app, downloaded the permanent-signed APK, passed the complete size/hash/package/version/current-signer/verified-token/FileProvider verification chain, completed an in-place system-installer update from `versionCode=7` to `versionCode=8`, and preserved durable settings and History data.
- Hosting remains credential-free in the application. GitHub credentials or tokens are not part of the production updater contract.

### A4.3C-BLOCKER-001 — GitHub Release Manifest WebView CORS Incompatibility

- Priority: P1
- Status: RESOLVED
- Demonstrated cause: Android WebView browser fetch could not reliably read the public GitHub Release `latest.json` asset because the asset delivery path was not CORS-readable.
- Approved resolution: Android Release builds use the narrow native HTTPS `fetchManifest()` transport, which returns bounded raw UTF-8 JSON to the existing TypeScript `parseUpdaterManifest()` authority.
- Frozen rule: do not restore WebView fetch as the Android Release production Manifest transport. HTTPS-only redirects, the 65,536-byte response bound, fatal UTF-8 handling, sanitized updater-only failures, and all existing TypeScript schema/version decisions remain mandatory.

### F3.1a — Free Practice Real-Time Staff Defects

- Status: CLOSED
- Human QA with a real FP-30X passed after resolving delayed staff feedback, chord first-note wait, duplicate/ghost attacks, and content-dependent staff scaling, grow/shrink, vertical jumping, and note-size changes.
- The accepted surface now changes note content while staff geometry remains stable.

### AUDIO-002 — FiiO K11 WASAPI Shared Endpoint Period

- Priority: P3
- Status: RESOLVED / DIAGNOSED
- In the tested environment, the FiiO K11 WASAPI Shared endpoint reported an approximately 10 ms minimum engine period; this is an endpoint/driver Shared-mode limit, not unresolved JavaScript dispatch work.
- Do not repeat Shared-mode library experiments unless new endpoint, driver, or hardware evidence appears.

## Open backlog

### UI-003 — Final Virtual Piano & Free Practice Visualization Polish

- Discovered: F3.1a
- Priority: P2
- Status: OPEN / NOT BLOCKING F3.1
- The current V1 is usable and Human QA accepted; its scope remains the core “弹下什么 → 看见什么” visualization.
- Final scope: unify all practice modules on the real-proportion 88-key component; refine black/white key proportions, high-DPI and multi-width behavior, light/dark theme finish, pressed/target/disabled states, octave/note label policy, and Free Practice Grand Staff information density.
- Deadline: no later than F5 Final UI / Visual QA.
- Reopen when F5 visual validation starts, another practice module adopts `VirtualPianoKeyboard`, or real use exposes a material V1 visual defect.

### NOTE-001 — Practice Notes Semantic Extension

- Discovered: F3.1a
- Priority: P3
- Status: OPEN
- Current notes remain plain free text stored by the existing Free Practice record flow.
- Possible future scope: stronger History display, tags, issue markers, next-practice prompts, AI Coach / Planner context, search, and filters.
- This does not block completion by default. If F4 formally requires AI Coach or Planner to consume notes, NOTE-001 becomes a prerequisite and must be re-evaluated before that work proceeds.

### AUDIO-001 — Native Low-Latency Audio Backend

- Priority: P3
- Status: OPEN / NOT BLOCKING
- Topic: possible future native low-latency audio optimization through WASAPI Exclusive, ASIO, or another appropriate backend.
- Current internal-sound latency is acceptable. Do not restart WASAPI / ASIO work during current development.

### UI-004 — Core Exercise Practice Surface Redesign

- Priority: P1
- Status: LEGACY WINDOWS/ELECTRON ROADMAP — NOT AN ANDROID NEXT STAGE
- Historical desktop scope: UI-004A Scale Practice, UI-004B Rhythm &
  Syncopation, UI-004C Coordination, and UI-004D Chord Practice.
- This entry does not describe current Android feature availability and must not
  be used to choose Android work. Consult `ANDROID_PROJECT_STATE.md`.
