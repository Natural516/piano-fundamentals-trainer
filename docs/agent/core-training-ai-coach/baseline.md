# Baseline — Core Training + AI Coach 主线

- Date: 2026-08-14
- Branch: feature/standard-music-notation
- Baseline commit: 2149653 checkpoint: stage8 release candidate
- Working tree: clean

## Test / build status at baseline

- `npm run typecheck`: pass
- `npm run build`: pass
- `npm run test:regression`: 96/96 pass
- `git diff --check`: pass
- `npm run pack`: pass (release/win-unpacked)

## Known failures at baseline

- None from automated gates. Known engineering gaps:
  - Chord V2 `createDefaultVoicing` doubling heuristic can produce non-chord tones (historical F-C-A-D issue) — P0 fix required.
  - Chord V2 `inversionMode='all'` may exclude root; open spacing is a dead switch in the practice path.
  - Flat-root spellings (Db/Bb/Eb/Ab/Gb) not accepted by the chord symbol parser.
  - PianoSampler CC64 does not persist a pedal-down state; "pedal first then play" voices release immediately.
  - No standard MIDI file (SMF) parser; MusicXML timeline uses `onsetCounter += 1` (backup/forward/voice merge unsupported).
  - MXL reader only supports stored ZIP (deflate unsupported).
  - Follow mode may advance a chord unit on any single expected pitch and can deadlock on rest/tie-only units.
  - Backup key collection does not match all real storage keys; restore is not staged/atomic.

## Feature flags at baseline

- FEATURE_EXPERIMENTAL_HARMONY_GENERATOR = false (to hide 4536251/arrangement UI)
- FEATURE_AI_MUSIC_GENERATOR = false
- FEATURE_SCORE_FOLLOWING = false
- Dev experimental access: localStorage `piano-trainer.experimental-access` = '1'

## Priorities this round

P0: music correctness (voicing validator, CC64 state machine, MIDI Format 1, MusicXML ticks, MXL deflate, Follow basic fixes).
P1: unified PracticeRecords 2.0, Score Practice 1.0, Ability Model, Exercise Prescription Library, Training Plan 2.0, AI Coach 2.0, Teaching Playback.
P2: platform adapters, tablet responsive, backup/restore hardening.
