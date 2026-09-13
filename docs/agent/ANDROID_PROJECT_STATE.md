# Android Project State

Updated: 2026-09-14

This document is the current source of truth for the Android tablet product.
The generic `PROJECT_STATE.md`, `STAGE_LOG.md`, `ARCHITECTURE.md`, and
`QA_MATRIX.md` files describe the older Windows/Electron product and must not
be used to infer Android feature availability or the Android next stage.

## Stable baseline

- Branch: `codex/android-tablet-v1`
- Stable source HEAD entering this maintenance pass:
  `dadd61bd2c70d3b4ace522e32cc2764180fe6bdd`
- Production package: `com.pianofundamentals.trainer`
- Current source version: `versionCode=12`, `versionName=1.5.2`
- Primary device: Lenovo Xiaoxin Pad Pro 12.7, landscape
- Production Android input: native Bluetooth MIDI, validated with Roland
  FP-30X

The current maintenance pass repairs validation and documentation only. It
does not change product behavior or establish a newer product checkpoint.

## Current Android product

### Stable / frozen

- Sight Reading is stable and frozen. The approved single-note and double-note
  behavior, notation, MIDI lifecycle, durable reports, History, and updater
  contracts remain protected.
- Chord Practice has a stable source contract and is a functional product. Its
  deterministic theory, judgement, live MIDI runtime, sequential
  Arpeggio-to-Block flow, persistence, History detail, and 150 ms Block capture
  contract are implemented.
- Android navigation/IA, active-practice session preservation, keep-awake
  lifecycle, production/QA package separation, release signing, and secure
  updater boundaries are implemented.

### Tools V1 complete

- Chord Query Text V1
- Natural Major Scale & Key Signature V1
- Interval Query V1

Chord Query's Virtual Piano presentation is deferred. The current Chord Query
Text V1 remains the complete implemented V1 tool and must not be represented as
including the deferred piano visualization.

### Android practice modules not implemented

- Scale Practice
- Rhythm / Syncopation
- Left/Right Coordination
- Free Practice

Older Windows/Electron implementations or roadmap entries with the same names
are not Android features and are not evidence that these Android modules exist.

## Release boundary

Public `versionCode=9` remains consumed by Android `versionName=1.4.0`, and
`versionCode=10` remains consumed by Android `versionName=1.5.0`; neither may
be reused. Android migration release `versionName=1.5.1` uses `versionCode=11`,
and the Settings version-display patch `versionName=1.5.2` uses `versionCode=12`;
after this release, every later distributable Android build must use a
`versionCode` greater than 12. Ordinary development and validation work must not increment
the version; that change belongs to an explicitly authorized release stage.

Release signing remains fail-closed, permanent signing material remains
outside the repository, the QA package remains separate, and the QA updater
remains disabled/fail-closed.

## Current maintenance and technical debt

These items are maintenance risks or medium-term technical debt, not current
product failures:

- The Android icon I03 validation baseline is being repaired in the current
  reviewable maintenance pass because the old HEAD-versus-worktree inequality
  invalidated itself after commit.
- `prototype/android-tablet-v1/src/main.tsx` and the main Android stylesheet
  are large and should be decomposed only in a separately authorized refactor.
- Android notation/theme code remains coupled to renderer-tree source paths.
- Many UI checks are source/contract tests rather than rendered visual
  regression tests.
- Chord Practice and Chord Query currently maintain separate theory catalogs.
- The public snapshot export boundary is not automated.
- Theme selection is process-local.
- Gradle emits future-compatibility warnings that should be handled before the
  corresponding toolchain upgrade.
- Production logging configuration should be reviewed before the next public
  release.

No item above authorizes a product change or selects the next feature stage.

## Historical records

- `ANDROID_V1_FINAL_ACCEPTANCE.md` records the accepted 1.3.4/code-8 V1
  baseline.
- `ANDROID_POST_V1_1_4_0_ICON_DOUBLE_NOTE.md` records the approved
  1.4.0/code-9 post-V1 release work.
- Phase-specific Android contract and checkpoint documents remain historical
  evidence for their named stages.
- The generic Windows/Electron documents are retained as legacy history only.
