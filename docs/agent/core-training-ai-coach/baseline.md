# Baseline — Core Training + AI Coach 主线

- Date: 2026-08-14 (round complete)
- Branch: feature/standard-music-notation
- Start commit: `2149653` (stage8 release candidate)
- End commit: `41e93f7 checkpoint: score practice 1.0 evidence coach playback adapters backup`
- Checkpoints this round: `d7a051c` baseline · `845def7` music correctness · `a87694a` unified records+ability+planner · `41e93f7` score practice/AI/playback/adapters/backup

## Test / build status

- `npm run typecheck`: pass
- `npm run build`: pass
- `npm run test:regression`: 115/115 pass
- `git diff --check`: pass

## Completed this round

- P0: Chord V2 validator + 10k property test; flat-root spellings; inversion 'all' includes root; real open voicing; CC64 pedal state machine; SMF Format 0/1 parser; MusicXML integer-tick timeline (backup/forward/voice/multipart); MXL deflate; Follow chord-full-set/partial/rest/reset.
- Feature flags hide 4536251, AI music generator, Follow (experimental dev access only).
- PracticeRecord 2.0 (metrics/errorEvents/evidenceRefs, legacy conversion, JSON export, MIDI-unobservable boundary).
- Ability Model (score/confidence/sampleCount/trend/evidence/uncertainty).
- Exercise Prescription Library (Practice Ready only with real assets; Hanon/Czerny excluded; Micro Drill with validator).
- Training Plan 2.0 deterministic planner (weakness priority, balance, success criteria, evidence refs).
- AI Coach 2.0 (evidence-grounded deterministic response, demo requests, unobservable-claim filtering).
- Teaching Playback (PlaybackPlan from ScoreModel only; demo controls in score page).
- Platform adapters (input/output/file/storage/secret/audio interfaces; browser implementations; external MIDI out unsupported placeholder).
- Backup manifest (includedKeys) + rollback on failed restore; score practice V2 records.
- Score Practice 1.0 UI: import tiers A/B/C/D, measure selection, hand mode, loop, tempo ratio, count-in, weakest measures, AI panel with demo playback.
- Home IA: 今日训练 + AI 钢琴助理 cards; tablet/touch CSS (44px targets).

## Remaining PARTIAL / PENDING

- Multi-measure grand-staff VexFlow rendering: PARTIAL (text + mini keyboard practice).
- External MIDI OUT real backend: interface only (PARTIAL).
- Electron secure SecretStore via IPC: interface + browser fallback (PARTIAL).
- Plan 2.0 / Ability UI beyond engines: PARTIAL.
- Hanon/Czerny structured scores: CONTENT PARTIAL (correctly excluded from Practice Ready).
- Salamander samples: ASSET PENDING (backend interface + import path).
- FP-30X hardware QA, audio/musical/UI human QA, NSIS installer QA: PENDING.
