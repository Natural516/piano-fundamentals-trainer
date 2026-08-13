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

## Stage 2 — free practice + curriculum

- Goal: free-play with factual recording/report; MIDI recording + playback; curriculum model (Hanon/Czerny frameworks, scale/coordination inheritance); progress storage.
- Implementation:
  - `curriculum/curriculumTypes.ts` — CurriculumBook/Exercise, TechniqueTag, ExerciseProgress, PracticePrescription.
  - `curriculum/curriculumCatalog.ts` — Hanon (10 metadata exercises, CONTENT PARTIAL), Czerny 599 (100-entry directory, no guessed tags), scale book (real 12-major exercises from existing engine), coordination book (real timelines).
  - `curriculum/curriculumProgress.ts` — v1 storage with corrupt/unknown fallback and attempt recording.
  - `midi/midiRecording.ts` — recording session, factual stats (duration/range/velocity/pedal/density/left-right), playback timeline + `PlaybackCursorCore` (seek/advance/speed).
  - `hooks/useFreePractice.ts` — bus-subscribed recorder + playback loop (play/pause/replay/seek/speed).
  - `components/FreePracticePage.tsx` — start/pause/continue/finish, fact report, playback controls, notes, virtual keyboard; record saved as `free-practice` module.
  - `PracticeModule` extended with `free-practice` (record types/storage/adapters/history tones); display preferences add `free-practice` scope.
- Tests: regression 60 → 65 (recording capture/stats, playback timeline/seek, curriculum catalog integrity + no fabricated notes, progress migration, free record adapter).
- Verification: typecheck 0, build 0, regression 65/65, diff --check 0.
- Not done (honest): old scale/coordination entries NOT removed — curriculum practice mode + hardware validation still pending before entry removal; Hanon/Czerny structured scores CONTENT PARTIAL; free-play playback latency/feel HUMAN/HARDWARE QA PENDING.
- Commit: `stage2 free practice and curriculum` (next).

## Stage 3 — chord practice V2

- Goal: structural chord model (Identity → Bass/Inversion → Voicing → Texture → Harmony), layered judgment, chord symbol UI with local keyboard.
- Implementation:
  - `chordV2/chordV2Types.ts` — qualities, difficulties L1-L7, judge modes, VoicingSpec, HarmonyContext.
  - `chordV2/chordIdentity.ts` — quality definitions (required/optional pitch classes, extensions/alterations), standard symbol formatting + parsing (incl. slash chords and ♭), octave-agnostic identity.
  - `chordV2/voicing.ts` — default voicing builder (register/doubling/spacing/bassConstraint), layered judgment (identity/inversion/exact), `ArpeggioStateMachine`, arpeggio sequence builder.
  - `chordV2/harmony.ts` — [VERIFIED] I/IV/V function in major, scale degree, voice-leading heuristic [HEURISTIC].
  - `hooks/useChordV2Practice.ts` — bus-subscribed practice engine: 150ms block window, ordered arpeggio, composite texture, question generator, report.
  - `components/ChordV2Page.tsx` + `components/MiniKeyboard.tsx` — chord symbol + voicing + local 3-octave keyboard; settings (judge mode/inversion/texture/difficulty/count); App routes `chords` → V2.
- Tests: regression 65 → 71 (identity model, symbol parse/format, layered voicing judgment, arpeggio machine, harmony/voice-leading, page wiring).
- Verification: typecheck 0, build 0, regression 71/71, diff --check 0.
- Pending: musicality of voicings (MUSICAL QA), real-hardware block/arpeggio feel (HARDWARE QA), progression/4536251 (stage 4), old chord page kept for stage 4 content.
- Commit: `stage3 chord practice v2` (next).
