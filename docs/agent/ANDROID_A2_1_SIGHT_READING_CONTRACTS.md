# Android A2.1 — Headless Contracts + Minimal Shared Seam

Status: READY FOR HUMAN REVIEW. No Android UI integration has started.

## Scope and repository state

- Worktree: `C:/Projects/piano-android-tablet-v1`
- Branch: `codex/android-tablet-v1`
- HEAD: `a7f4f682938e14c0dc4238243ece95f230ce66b1`
- No commit, checkout, reset, dependency installation or Golden regeneration in A2.1.
- The approved A1/A2 prototype remains frozen. Even the optional TIMEOUT copy cleanup was not taken.
- Git status is **NOT CLEAN**: 16 modified tracked files and 14 new files, all unstaged. Three of the modified files are pre-existing approved A2 mock changes, not edits from A2.1.
- All A2.1 writes and builds were confined to this Android worktree. No edits were made in the Windows worktrees.

## Test-first evidence and validation

Before production refactoring, `scripts/sight-reading-contracts.cjs` was added and run against the original desktop implementation: **14/14 baseline groups PASS, exit 0**.

Those same 14 groups remain in the suite and pass after extraction. The suite now adds 32 numbered contract groups, five partial-report groups and three boundary groups: **54/54 PASS**.

| Command | Final result | Exit code |
| --- | --- | --- |
| `npm.cmd run test:sight-reading` | 54/54 PASS; also typechecks the neutral module without DOM or Node global types | 0 |
| `npm.cmd run typecheck` | PASS | 0 |
| `npm.cmd run test:regression` | 192/192 PASS; 0 Golden blocked | 0 |
| `git diff --check` | PASS | 0 |
| `npm.cmd run build` (additional desktop integration check) | PASS | 0 |

The first post-extraction regression run exposed an existing source-text guard matching the new name `latestMidiEventId` as if it were a latest-event queue. The injected getter was renamed to `readMidiWatermark`; that guard was retained unchanged. The only regression-test edit redirects the settings-source inspection to its new authoritative location, retaining its assertions.

## Approved contract matrix

IDs below are executable test group names in `scripts/sight-reading-contracts.cjs`.

| ID | Contract | Result |
| --- | --- | --- |
| C01 | Android grand/C/diatonic/20/hidden-name defaults; migration with injected storage; explicit read/write failure | PASS |
| C02 | Fixed treble 60–88, bass 36–64, grand 36–88 ranges; obsolete range ignored | PASS |
| C03 | All 15 major-key diatonic pools and independent spelling expectations, including B#3/Cb4 octave crossings | PASS |
| C04 | Chromatic pools contain every semitone; key-aware sharp, flat and natural display | PASS |
| C05 | Exactly 10/20/50/100 questions, completed only after final feedback | PASS |
| C06 | Fisher–Yates deterministic permutation, n−1 RNG calls, unchanged input pool | PASS |
| C07 | Forced bag-boundary collision is corrected without dropping notes | PASS |
| C08 | Start/reset clear counters, report, bag and pending timers | PASS |
| C09 | 0/31ms input rejected, 32ms input accepted | PASS |
| C10 | First valid correct NOTE_ON wins | PASS |
| C11 | First valid wrong NOTE_ON wins; subsequent correct note does not repair it | PASS |
| C12 | Real desktop 0x90 velocity=0 normalization on all 16 channels; shared normalization preserves id/timestamp | PASS |
| C13 | NOTE_OFF ignored even with positive release velocity | PASS |
| C14 | CC64 down/up ignored for judgement | PASS |
| C15 | Fixed 5000ms timeout measured from unlock, not display | PASS |
| C16 | Correct reaction time starts at unlock | PASS |
| C17 | Wrong answers contribute reaction time | PASS |
| C18 | Timeout contributes no reaction sample and does not dilute averages | PASS |
| C19 | 350ms feedback then a new 32ms lock | PASS |
| C20 | Completed = correct + wrong + timeout | PASS |
| C21 | Correct increments streak; wrong and timeout reset it; highest streak retained | PASS |
| C22 | Rounded accuracy uses completed-question denominator; empty result is 0 | PASS |
| C23 | Wrong/timeout aggregates are keyed to target notes, not the wrong input pitch | PASS |
| C24 | All-timeout average/fastest/slowest reaction metrics are null | PASS |
| C25 | Pause during display cancels unlock; resume restarts full 32ms lock | PASS |
| C26 | Pause during answering prevents input and timeout | PASS |
| C27 | Pause during feedback preserves remaining advance time | PASS |
| C28 | Repeated pause/resume retains remaining time; paused duration excluded from reaction time | PASS |
| C29 | Watermark rejects stale IDs/timestamps; distinct same-timestamp IDs are not deduplicated | PASS |
| C30 | Disconnect/panic/reconnect clear transient input, preserve facts, reject stale events and require explicit resume | PASS |
| C31 | Completed report through existing desktop record mapping and injected V2 repository | PASS |
| C32 | Repository write failure and thrown adapter error are explicit; report retained for retry | PASS |

Additional coverage:

- E01–E05: stopped partial report; zero-answer stop; stop while answering/feedback/paused; all-timeout partial reactions; injected report repository receives the entire stopped payload.
- A01: neutral import graph and forbidden-global AST checks; execution with throwing `Date.now`/`Math.random` proves dependencies are injected.
- A02: headless MIDI judgement needs no React commit; canceled/disposed callbacks cannot advance a reset session.
- A03 plus the original 14 baseline groups: desktop settings, completed-only report lifetime, manual/automatic pause behavior and existing page/recorder/disconnect wiring remain protected.

These are deterministic software contracts, not Android hardware, Bluetooth or real-device UI certification.

## Shared seam

`src/sightReading/` is the small platform-neutral boundary. It imports only sibling files and compiles with `lib: [ES2020]`, `types: []`.

- `sightReadingSettings.ts`: settings/types, explicit desktop and Android defaults, migration, injected settings store with error results.
- `sightReadingNotes.ts`: existing fixed-range pools, spelling and shuffled bag. The shared bag requires explicit RNG.
- `musicKeySignatures.ts`, `musicPitchSpelling.ts`, `musicNotationTypes.ts`, `midiNotes.ts`, `staffPosition.ts`: existing pure dependencies, not new music-theory implementations.
- `sightReadingSession.ts`: existing single-note judgement core. Its renderer event type dependency is replaced by the minimal shared MIDI shape.
- `controller.ts`: extracted display/unlock/timeout/feedback orchestration. Requires `Clock`, `Scheduler`, RNG and `readMidiWatermark`. Accepts normalized MIDI directly; no subscription, device API, React, persistence or browser global inside it.
- `midi.ts`: minimal shared event shape and velocity-zero normalization. The existing raw Web MIDI parser, event bus and lifecycle implementation were not changed.
- `report.ts`: extracted completed-report builder; stopped-report capability and injected repository port with explicit failure handling. This is a report contract, **not a new stored record schema**.

Mechanical comparison against the pre-refactor files confirms the five pure notation dependencies are unchanged after line-ending normalization. Note generation differs only in requiring the RNG parameter; the session core differs only in its event type import/name. Desktop compatibility files forward to these implementations, so other exercises do not get a second copy of the music theory.

## Intentional desktop adapter boundary

`useSightReadingPractice.ts` now binds the shared controller to the existing event bus, browser timers, React subscription and desktop settings store.

- Desktop defaults remain **treble / noteNameVisible=true**.
- Android defaults are explicitly **grand / noteNameVisible=false** and are not imposed on desktop users.
- Desktop `SightReadingPage` still calls `recorder.stopSession()` then `practice.reset()`. It does **not** call the new shared `stop()` capability. No partial desktop report is silently introduced.
- The desktop report keeps its existing shape and remains null while running. Completed-only persistence and the old early-stop shell behavior are unchanged.
- Manual pause and visibility/focus policy remain at the desktop boundary. The existing disconnect protection, Session Repository and record schema are untouched.
- The legacy note-pool helpers keep their previous defaults. The old optional RNG entry point is a desktop compatibility wrapper; the shared orchestration always supplies RNG explicitly.

## Early-stop result

The mixed partial-session test settles two correct answers, one wrong answer and one timeout, then stops a planned ten-question session. The built report contains:

```text
completionState = stopped
partialEvidence = true
totalQuestions = 10
completedQuestions = 4
correct = 2
wrong = 1
timeout = 1
accuracy = 50
bestStreak = 2
averageReactionMs = 300
fastestReactionMs = 100
slowestReactionMs = 600
wrongNoteCounts = one error against the wrong-answer TARGET
timeoutNoteCounts = one timeout against the timeout TARGET
```

Stopping does not score an unanswered question. Stopping during feedback retains the already-settled answer. Subsequent MIDI/timers or a new session cannot change the built report. Zero-answer and all-timeout partial reports have null reaction metrics.

The injected test repository also demonstrates these stopped facts fit the existing V2 `completionState`, metrics, error aggregates and `metadata.partialEvidence` fields. This test adapter is not connected to Android UI and does not implement Android persistence.

## Exact file inventory

All paths below are relative to `C:/Projects/piano-android-tablet-v1`.

Modified in A2.1 (13 tracked files):

```text
package.json
scripts/regression-check.cjs
src/renderer/src/hooks/useSightReadingPractice.ts
src/renderer/src/utils/midiNotes.ts
src/renderer/src/utils/musicKeySignatures.ts
src/renderer/src/utils/musicNotationTypes.ts
src/renderer/src/utils/musicPitchSpelling.ts
src/renderer/src/utils/practiceRecordAdapters.ts
src/renderer/src/utils/sightReadingNotes.ts
src/renderer/src/utils/sightReadingSession.ts
src/renderer/src/utils/sightReadingSettings.ts
src/renderer/src/utils/staffPosition.ts
tsconfig.web.json
```

New in A2.1 (14 files):

```text
docs/agent/ANDROID_A2_1_SIGHT_READING_CONTRACTS.md
scripts/sight-reading-contracts.cjs
src/sightReading/controller.ts
src/sightReading/midi.ts
src/sightReading/midiNotes.ts
src/sightReading/musicKeySignatures.ts
src/sightReading/musicNotationTypes.ts
src/sightReading/musicPitchSpelling.ts
src/sightReading/report.ts
src/sightReading/sightReadingNotes.ts
src/sightReading/sightReadingSession.ts
src/sightReading/sightReadingSettings.ts
src/sightReading/staffPosition.ts
tsconfig.sight-reading.json
```

Pre-existing approved A2 mock changes preserved without further editing (3 files):

```text
prototype/android-tablet-v1/README.md
prototype/android-tablet-v1/src/main.tsx
prototype/android-tablet-v1/src/styles.css
```

Their start/end byte SHA-256 values match:

```text
README.md  906AE1626629D4E5112B352ED29D41EDEF0F4D619634E227F8ED33539A27E8AC
main.tsx   705AEB33AB902D780827D26CDACDD988C1E465E91EC37296171BC805E2448646
styles.css 7D4FD364B1C7B75BCB95C71A719AA8028A95F5D13975E2715B245D88171AC7AE
```

`practiceRecordAdapters.ts` has only a type-import change from the React hook to the neutral report module. No record mapping body or other exercise function was changed. There are no UI/CSS, raw MIDI, audio, MusicXML, Golden, Session Repository, Planner or Mastery behavior edits. Existing protected source paths and assets compare unchanged against HEAD.

## Golden preservation

The existing Golden E2E hard assertions pass unchanged:

```text
MusicXML attacks: 80
MIDI attacks: 80
matched: 80
onlyScore: 0
onlyMidi: 0
matchRatio: 1
consistent: true
Wait Golden: 46/46
Teaching demo noteOn: 80
```

Worktree byte SHA-256, equal before and after A2.1:

```text
fixtures/golden/case1/案例1.musicxml
1CA99E234DEB0F9472CF3140C196649251C5CF4E3C01BFAB0D00BDC470633E4E

fixtures/golden/case1/案例1.mid
E302E1CA0FEFDDA391B3563F5F3CB10E6E45BF123569BDE4652ADF7F238D7BA6
```

These are current worktree byte hashes, not a new historical SHA provenance claim.

## Remaining coupling and integration risks

1. Future Android MIDI must provide monotonic event IDs across reconnects and timestamps in the same millisecond time domain as the injected clock. No Bluetooth transport or timestamp conversion is implemented here.
2. Scheduler callbacks must be asynchronous/cancelable. Deterministic deadline and pause behavior is covered, but real-device event-loop suspension/dispatch latency still needs later Android lifecycle QA.
3. The settings and report ports currently express synchronous adapters to match the existing repository contracts. A future asynchronous native storage implementation must define awaited success/failure semantics at its adapter boundary; it must not report a scheduled write as successful persistence.
4. Record identity, wall-clock timestamps, duration, canonical V2 mapping and persistence remain platform responsibilities. Existing desktop record types/repositories remain in their current paths. Android must explicitly map `completionState` and `partialEvidence`; using the desktop completed-only mapper alone would not be sufficient.
5. Desktop compatibility types still include historical noteCount 2/3 and old range parameters. V1 migration/controller force single-note behavior and ignore old ranges; this is not support for those Android options.
6. Pure music primitives now have one shared implementation behind old import paths. Broad regression coverage passes, but this phase makes no new visual or hardware approval claim for any exercise.

No automatic progression to UI integration, Bluetooth, storage, updater, additional modules or UI-004 work.

ANDROID A2.1

SIGHT READING HEADLESS CONTRACTS + MINIMAL SHARED SEAM

READY FOR HUMAN REVIEW
