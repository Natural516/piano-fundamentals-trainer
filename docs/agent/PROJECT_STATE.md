# PROJECT_STATE

Updated: 2026-08-13

## Current stage

Stage 2 complete — entering Stage 3 (chord practice V2).

## Completed stages

- Phase 0 (before c717616): UI + interaction optimization.
- Stage 0: MIDI per-event layer, scale time-axis core, chord feedback extraction, sight-reading report cleanup, unified report back action, regression 55/55.
- Stage 1: PianoSampler engine, SFZ loader, audio mode + piano volume, settings UI; regression 60/60.
- Stage 2: free practice + MIDI recording/playback, curriculum catalog (Hanon/Czerny frameworks, scale/coordination inheritance), progress storage; regression 65/65.

## Recent checkpoint

`c717616` checkpoint: complete first UI and interaction optimization (HEAD before stage 0).
`5bf63b4` stage0 · `b3c9356` stage1 built-in piano audio.
Next checkpoint: `stage2 free practice and curriculum`.

## Key architecture

- MIDI: Web MIDI callback → `midiMessages.parseMidiMessage` → `midiEventBus.publishMidiEvent` (synchronous per-event dispatch) → practice hooks subscribe via `useMidiEventSubscription`. React state (`recentEvents`/`latestEvent`/`activeNotes`) is display-only.
- Practice: `usePracticeEngine` (rhythm/judgement-test), `ScalePracticeCore` (pure), `useChordPractice` + `chordFeedback` pure functions, `useSightReadingPractice` + `SightReadingSessionCore`, `useCoordinationPractice`.
- Reports: `PracticeReportModal` shared back/repeat actions; sight-reading report cleaned.
- Audio: `PianoSampler` (Web Audio) — sample anchors + synthesized fallback, polyphony/stealing, CC64 sustain; audio mode builtin/silent/external; independent piano volume.
- Curriculum: `curriculum/` catalog + progress v1; free practice recording/playback in `midi/midiRecording.ts` + `hooks/useFreePractice.ts`.

## Main entry points

- `src/renderer/src/App.tsx` — routing + MIDI wiring.
- `src/renderer/src/midi/` — event bus + message parser.
- `src/renderer/src/hooks/` — practice hooks + subscription helper.
- `src/renderer/src/audio/` — piano sampler, SFZ loader, voice policy, audio settings.
- `src/renderer/src/utils/scalePracticeCore.ts`, `utils/chordFeedback.ts` — pure judgment cores.

## Current test commands

- `npm run typecheck`
- `npm run build`
- `npm run test:regression` (65 tests)
- `git diff --check`

## Current P0/P1

- P0 MIDI multi-event loss: fixed via per-event bus (verified by tests).
- P1 scale 8/8 missed cascade: fixed via ScalePracticeCore window matching (verified by tests).
- P2: sample pack assets missing (CONTENT PARTIAL); audio listening/latency pending hardware QA.
- P2: curriculum practice mode not yet built (catalog + engine ready); old scale/coordination entries kept until curriculum path is hardware-validated.
- No known P0 after automated validation; hardware QA pending.

## Hardware / human QA pending

- Roland FP-30X: simultaneous chords, rapid scale, repeated notes, CC64, reconnect, 60 BPM scale.
- Audio quality / latency, musicality of voicings, UI visual quality.
