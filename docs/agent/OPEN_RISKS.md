# OPEN_RISKS

## P0
- None known after automated validation.

## P1
- None known after automated validation.

## P2
- Chord block window (150ms) relies on system timers; hardware timing should confirm.
- Practice hooks mirror metronome state via render-time refs; same-frame events may see a ~16ms-stale state (within tolerance).

## P3
- Report modal visual layout not yet human-verified.
- No automated browser smoke test in this session (browser tool unavailable).
- AudioContext autoplay policy may keep the context suspended until the first user gesture; 测试发声 and gesture listeners mitigate.

## Closed / diagnosed

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
- Status: NEXT / READY TO START
- Scope: UI-004A Scale Practice, UI-004B Rhythm & Syncopation, UI-004C Coordination, and UI-004D Chord Practice.
- Complete UI-004 before large-scale F4 Curriculum implementation.
