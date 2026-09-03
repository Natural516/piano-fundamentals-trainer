# Android V1 Final Acceptance

Status: **FINAL ACCEPTANCE PASS — ANDROID V1 STABLE**

Prepared: 2026-09-04

This is the authoritative Android V1 stable-baseline acceptance record, not a
feature-development phase. F1-F12 passed on DEVICE-001 using the installed
public updater-delivered Release 1.3.4 / code 8.

## Approved candidate

- Package: `com.pianofundamentals.trainer`
- Version: `versionCode=8`, `versionName=1.3.4`
- Public Release: `v1.3.4`
- Permanent signer SHA-256:
  `19:3D:A3:16:AE:F6:A2:2F:9C:15:D1:01:9E:25:87:E7:25:85:8A:70:8B:D0:07:7A:D8:58:98:CD:65:57:96:32`
- Candidate checkpoint:
  `babbafed486e91ffc3668560a5154326535deeb5`
- Future distributable versions must use a `versionCode` greater than 8.
  Code 8 must not be overwritten or reissued.

## Completed Android V1 systems

- Native Android tablet application for DEVICE-001 landscape use.
- Sight Reading: single notes; treble, bass and grand staff; 15 major key
  signatures; diatonic/chromatic pools; 10/20/50/100 questions; fixed
  5000 ms timeout; optional note names; correct/wrong/timeout outcomes;
  pause/resume; early stop and save; factual RESULT statistics.
- Real Roland FP-30X Bluetooth MIDI through the Android native MIDI path.
- Android local persistence schema version 1 for Sight Reading settings,
  COMPLETED reports and STOPPED partial reports.
- Read-only History projected from durable real reports.
- Permanent fail-closed Release signing.
- Secure user-initiated in-app updater using public GitHub Releases, native
  HTTPS Manifest transport, strict TypeScript parsing, native APK download and
  complete artifact verification before Android system-installer handoff.

## Final public updater baseline

- Release repository:
  `https://github.com/Natural516/piano-trainer-releases`
- Manifest endpoint:
  `https://github.com/Natural516/piano-trainer-releases/releases/latest/download/latest.json`
- Current latest Release: `v1.3.4`, code 8.
- Production flow:
  Update UI -> TypeScript orchestration -> native `fetchManifest()` -> bounded
  raw UTF-8 JSON -> `parseUpdaterManifest()` -> existing updater state/version
  logic.
- Android Release Manifest retrieval must never be restored to WebView fetch.

The 2026-09-04 acceptance audit received HTTP 200 for both public assets. The
Manifest remained 524 bytes and selected code 8 / 1.3.4. Its declared APK size
and SHA-256 exactly matched the public APK:

- APK size: `3,932,190` bytes
- APK SHA-256:
  `74A7C410450E1B0615150BC895F622D4C13A636EF61AE791763A3D8C8F865454`

## Frozen data contract

- `schemaVersion=1`
- `piano.v1.schemaVersion`
- `piano.v1.sightReading.settings`
- `piano.v1.sightReading.report.<recordId>`
- `piano.v1.sightReading.reportIndex`

COMPLETED and STOPPED reports are durable. Live session state, MIDI device
identity and MIDI connection state are not persisted. History reads durable
truth, contains no Mock dataset and deduplicates by record ID. A STOPPED
session is terminal and is not presented as resumable.

## Frozen MIDI and Sight Reading behavior

- Release input is real Android Bluetooth MIDI; Development MIDI is excluded.
- The first valid NOTE_ON decides the question by exact MIDI pitch.
- Velocity-zero NOTE_ON is normalized to NOTE_OFF.
- Input lock is 32 ms, answer timeout is 5000 ms and feedback advance is
  approximately 350 ms.
- Pause/resume, background/foreground and disconnect/reconnect preserve facts,
  reject stale input and require safe explicit continuation.
- Timeouts do not contribute a fabricated reaction sample; an absent reaction
  remains `null`.

## Frozen updater security chain

Every stage remains mandatory:

native HTTPS Manifest fetch -> exact strict Manifest schema -> numeric
`versionCode` decision -> native private APK download -> byte count -> SHA-256
-> APK archive -> package -> target version -> downgrade rejection -> exact
CURRENT permanent signer set -> read-only VERIFIED artifact -> opaque
process-local token -> launch-time invariant revalidation -> narrow read-only
FileProvider URI -> user-confirmed Android system installer.

The Release audit found no Debug signer, development updater bypass, HTTP
override, signer/hash skip, arbitrary install path/URI/URL authority,
DevelopmentMidiAdapter, Human Review dock or viewport diagnostic in the
packaged production assets.

## Automated acceptance result

All commands completed with exit code 0:

- Android updater TypeScript: 25/25 PASS
- Android updater native security: 9/9 PASS
- Android Manifest network: NET01-NET07, 7/7 PASS
- Combined UP01-UP34: 34/34 PASS
- History: 24/24 PASS
- Persistence: 27/27 PASS
- Signing: 8/8 PASS
- Release mode: 2/2 PASS
- Bluetooth MIDI: 14/14 PASS
- Native MIDI: 3/3 PASS
- Android shell: 5/5 PASS
- Android integration: 11/11 PASS
- Sight Reading: 54/54 PASS
- Typecheck: PASS
- Regression: 192/192 PASS; 0 externally blocked
- Desktop build: PASS
- Android Release APK build: PASS
- Android Release APK verification: PASS
- `git diff --check`: PASS

Golden fixtures remain unchanged:

- MusicXML SHA-256:
  `1CA99E234DEB0F9472CF3140C196649251C5CF4E3C01BFAB0D00BDC470633E4E`
- MIDI SHA-256:
  `E302E1CA0FEFDDA391B3563F5F3CB10E6E45BF123569BDE4652ADF7F238D7BA6`
- MusicXML/MIDI attacks: 80/80; matched 80; onlyScore 0; onlyMidi 0;
  matchRatio 1; consistent true; Wait 46/46; Teaching noteOn 80.

## Risk status

- No known open P0 or P1 blocker belongs to the accepted Android V1 scope.
- `UPDATE-HOST-001`: CLOSED.
- `A4.3C-BLOCKER-001`: RESOLVED.
- The remaining open UI-003, NOTE-001, AUDIO-001 and UI-004 entries are
  deferred desktop/future-product work and do not block Android V1 acceptance.

## Explicitly excluded or deferred

Android V1 contains no Scale, Rhythm, Chord, Coordination, Free Practice or
Score Practice module. It also excludes live-session recovery, History
mutation/edit/delete/analytics, internal Android piano audio, cloud features,
background forced updating, silent installation, generic phone/portrait UI and
additional updater architecture. These are not acceptance blockers.

## Final real-device Human QA evidence — DEVICE-001

Device: Lenovo Xiaoxin Pad Pro 12.7, landscape

Installed public updater-delivered Release: 1.3.4 / code 8

All final acceptance checks passed:

1. **F1 — Cold launch: PASS.** Normal launch, version 1.3.4 and no
   Debug/Development controls.
2. **F2 — Saved settings: PASS.** Previously persisted Sight Reading settings
   remained.
3. **F3 — Existing History: PASS.** Real records remained with no Mock rows,
   obvious duplicates or corruption.
4. **F4 — FP-30X connection: PASS.** Scan/connect and real note input worked.
5. **F5 — Completed session: PASS.** A 10-question session included an
   intentional correct answer, wrong answer and genuine timeout; RESULT,
   reaction, accuracy and total facts were correct.
6. **F6 — Completed History: PASS.** The new COMPLETED report appeared with
   correct stored facts.
7. **F7 — Stopped session: PASS.** `结束本轮` -> `结束并保存` produced a STOPPED
   partial report; unanswered questions were not fabricated as timeouts and
   the stopped session had no resume entry.
8. **F8 — App lifecycle: PASS.** Background/foreground recovered safely with
   no phantom judgement or unseen timeout corruption.
9. **F9 — Piano recovery: PASS.** FP-30X power-cycle/reconnect worked with no
   stale or phantom event.
10. **F10 — Up-to-date: PASS.** Code 8 reported no newer version.
11. **F11 — Offline cold launch: PASS.** App boot, Settings, History, Sight
    Reading and Bluetooth MIDI remained usable while updater/network access
    was unavailable.
12. **F12 — Tablet reboot: PASS.** Settings and History remained and the
    application was stable after reboot.

## Stable baseline authority

Android V1 1.3.4 / code 8 is officially STABLE. The checkpoint containing this
document is the authoritative Android V1 stable baseline. Future feature work
must begin as a new post-V1 phase and must not silently alter frozen Android V1
behavior. A frozen contract may be reopened only for a demonstrated defect or
an explicit new product requirement.
