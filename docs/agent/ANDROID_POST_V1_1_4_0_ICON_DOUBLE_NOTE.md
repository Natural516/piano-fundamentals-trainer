# Android Post-V1 1.4.0 — Icon and Double-Note Sight Reading

Status: REAL-DEVICE HUMAN QA PASS on the Android tablet with Roland FP-30X.

## Release identity

- Baseline: `b0c85bd606c0b40b7dbab68b09bb8630ff55a388`
- Package: `com.pianofundamentals.trainer`
- Version: `versionCode=9`, `versionName=1.4.0`
- This checkpoint is the reviewed source for the future manual `v1.4.0` publication.

## Launcher icon

The only artwork source is `artwork/approved/android-app-icon-source.png`, pinned to SHA-256
`4BC8EA53852A16F2B5704CF7C5FC03A85C0F4A7287A15AC6E0A787D21817BBD1`.
The generation script fails closed when that hash differs. It performs only whole-image scaling,
safe-zone placement, density output and QA mask generation. The adaptive background is sampled
from the source's black outer background. Normal, round, adaptive foreground and legacy density
resources remain available through the existing Manifest names.

## Backward-compatible setting

`noteMode: 'single' | 'double'` is an optional field in the existing schema-v1 Android settings
document. Missing means `single`; `noteCount` remains the existing report-facing value and is
derived as 1 or 2. The existing storage key and schema version do not change. Durable History
records intentionally retain their code-8 shape, and reads do not rewrite them.

Double mode uses an effective diatonic pool without changing the stored single-note
`notePoolMode`. Returning to single mode therefore restores a prior chromatic preference.

## Interval allocation and question generation

Approved weights are m3 18, M3 18, P5 16, m6 13, M6 13, P4 12 and P8 10 percent.
For a selected question count, the scheduler floors every exact weighted share, then assigns the
remaining slots by descending fractional remainder. Ties use that fixed product order. The
resulting interval multiset and layout schedule are shuffled with the injected RNG.

Grand layout counts are exact: 10=`3 treble / 3 bass / 4 cross`, 20=`6/6/8`,
50=`15/15/20`, 100=`30/30/40`. Treble and Bass modes use their respective staff for every pair.

Because the fixed Grand split makes a few specific key/third/cross buckets empty, interval quotas
are assigned to constrained cross slots first from the already-allocated multiset. Same-staff
slots then consume the remainder. This preserves both exact interval quotas and exact layout
quotas. Candidate selection enumerates only two distinct pitches that are diatonic in the chosen
major key, within the frozen MIDI range, in the requested layout, and separated by an approved
interval. No illegal random pair is manufactured. A future unsupported matrix fails explicitly;
the current 15-key matrix is exhaustive-tested. Adjacent exact pair repeats are removed without
changing the interval or layout totals.

## Judgement state machine

Single mode remains on the existing immediate first-note path.

Double mode keeps the 32ms input lock and uses a 7000ms overall deadline. The first valid post-unlock
`NOTE_ON` opens one 150ms window, clipped to the overall deadline. Target pitches are stored as a
unique set; repeated attacks of one target do not add a third answer. A non-target pitch settles
WRONG immediately. Otherwise the capture deadline settles exact target-set equality as CORRECT
and an incomplete set as WRONG. No input reaches the existing TIMEOUT path. `NOTE_OFF`,
velocity-zero `NOTE_ON`, and CC64 do not add pitches.

Correct reaction time is the timestamp when the target set first became complete. Immediate wrong
uses the non-target event timestamp; incomplete capture uses its settlement timestamp; timeout
remains absent from reaction samples. Manual pause freezes the active capture and excludes paused
time. Background/disconnect invalidates transient capture state, advances the existing watermark,
and requires the existing explicit safe resume.

Single mode remains frozen at a 5000ms answer deadline and 350ms post-answer feedback. Double
mode holds correct feedback for 1200ms and wrong/timeout feedback for 1600ms. These presentation
holds begin only after settlement, never enter reaction metrics, and use the controller's existing
pause/resume deadline authority rather than a React or UI-local timer.

## Rendering and live feedback

The existing `MusicStaffRenderer` receives two notation pitches. Same-staff pitches become the two
keys of one VexFlow `StaveNote`; cross-staff Grand filters one pitch to each aligned stave. Interval
names are absent before judgement and shown after settlement as `正确 · …`, `错误 · 目标：…`, or
`超时 · 目标：…`. Note-name visibility still controls only the pre-answer pitch-name hint.

Android Home, READY, ACTIVE progress, RESULT, Settings and DEBUG diagnostics derive the displayed
answer deadline from note mode: 5 seconds for single and 7 seconds for double.

## Persistence and History boundary

The existing schema-v1 key, old document acceptance and durable History record shape remain
backward compatible. Existing records are neither rewritten nor reinterpreted. Version 1.4.0 does
not add interval-level History analytics; double-note reports retain the existing aggregate facts.

## Human QA result

Real-device Human QA passed for the approved launcher icon and masks, single-note non-regression,
Treble/Bass/Grand double-note rendering, same-staff and cross-staff questions, order-independent
dyad input, repeated target attacks, extra-pitch rejection, incomplete answers, genuine timeout,
interval feedback timing, lifecycle behavior, old persistence/History compatibility and updater
downgrade protection.
