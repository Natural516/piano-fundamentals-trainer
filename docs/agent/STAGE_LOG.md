# STAGE_LOG

## Stage 0 — MIDI per-event layer + scale time-axis + report cleanup

- Goal: fix MIDI multi-event loss (P0), scale 8/8 missed (P1), simplify sight-reading report, unify report back action, add real event-chain tests.
- Implementation:
  - `midi/midiEventBus.ts`, `midi/midiMessages.ts`, `hooks/useMidiEvents.ts`.
  - `useMidi` publishes each parsed record to the bus.
  - All practice hooks subscribe to the bus; `latestEvent` no longer used for judgment.
  - `utils/scalePracticeCore.ts` pure time-axis core; `useScalePractice` rewired.
  - `utils/chordFeedback.ts` pure feedback; `useChordPractice` rewired.
  - `PracticeReportModal` shared back/repeat; five pages updated; sight-reading report simplified.
- Tests: regression 41 → 55.
- Verification: typecheck 0, build 0, regression 55/55, diff --check 0.
- Unverified: Roland FP-30X hardware round 2; visual layout of report modal.
- Commit: pending (stage0 automated complete, hardware QA pending).

## Stage 0.5 checkpoint

- Commit: `5bf63b4` checkpoint: stage0 automated complete, hardware QA pending.
- All gates green: typecheck 0, build 0, regression 55/55, diff --check 0.

## Stage 1 — built-in piano audio

- Goal: software can produce piano sound without external VST; sample-pack engine + audio mode + independent volume.
- Implementation:
  - `audio/pianoAudioTypes.ts` — audio mode, sample anchor, sampler status types.
  - `audio/samplePackLoader.ts` — minimal SFZ subset parser, nearest-anchor selection, playbackRate pitch shift, velocity gain.
  - `audio/voicePolicy.ts` — pure polyphony/stealing/sustain helpers.
  - `audio/pianoSampler.ts` — Web Audio `PianoSampler`: sample voices + synthesized fallback, retrigger, voice stealing, CC64 sustain/pedal release, master volume, cleanup.
  - `audio/audioModeSettings.ts` — persisted audio mode (default builtin) + piano volume.
  - `hooks/usePianoAudio.ts` — bus-subscribed audio hook; loads Salamander pack when present at `assets/samples/salamander`, else fallback synth; `useAudioEngine.ts` now a compatibility wrapper.
  - Settings page: 音频/钢琴发声 card (mode segmented, piano volume slider, sample status, 测试发声).
- Tests: regression 55 → 60 (SFZ parsing, anchor selection/pitch, audio mode settings, voice policy, bus wiring).
- Verification: typecheck 0, build 0, regression 60/60, diff --check 0.
- Unverified / pending: Salamander real samples (CONTENT PARTIAL — no local pack found), actual listening latency, sustain pedal feel, long-session stability (HARDWARE/AUDIO/HUMAN QA PENDING).
- Commit: `stage1 built-in piano audio` (next).
